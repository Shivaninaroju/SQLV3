"""
Premium AI Database Assistant - LLaMA 3.3 70B via Groq
Migration: Gemini -> Groq (Llama 3.3 70B)
"""

import os
import json
import logging
import time
import sqlite3
from datetime import datetime
from typing import List, Dict, Optional
from dotenv import load_dotenv
from groq import Groq

load_dotenv()
logger = logging.getLogger(__name__)

class ContextMemory:
    def __init__(self):
        self.user_contexts: Dict[str, Dict] = {}

    def _get_context(self, username: str) -> Dict:
        if username not in self.user_contexts:
            self.user_contexts[username] = {
                "active_table": None,
                "last_query": None,
                "last_sql": None,
                "history": []
            }
        return self.user_contexts[username]

    def update(self, username: str, table: Optional[str], query: str, sql: Optional[str] = None):
        ctx = self._get_context(username)
        if table:
            ctx["active_table"] = table
        ctx["last_query"] = query
        ctx["last_sql"] = sql
        ctx["history"].append({"query": query, "sql": sql, "table": table})
        if len(ctx["history"]) > 10:
            ctx["history"] = ctx["history"][-10:]

    def get_summary(self, username: str) -> str:
        ctx = self._get_context(username)
        parts = []
        if ctx["active_table"]:
            parts.append(f"Active table: {ctx['active_table']}")
        if ctx["last_query"]:
            parts.append(f"Last query: {ctx['last_query']}")
        if ctx["last_sql"]:
            parts.append(f"Last SQL: {ctx['last_sql']}")
        return "\n".join(parts) if parts else "No prior context."

    def get_active_table(self, username: str) -> Optional[str]:
        return self._get_context(username).get("active_table")


class PremiumNLPService:
    def __init__(self):
        self.api_key = os.getenv("GROQ_API_KEY")
        self.model_name = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
        
        if not self.api_key:
            logger.warning("GROQ_API_KEY not found in environment. AI features will be disabled.")
            self.client = None
        else:
            self.client = Groq(api_key=self.api_key)
            logger.info(f"Groq Client Initialized with model: {self.model_name}")

        self.context = ContextMemory()

    async def process_query(
        self,
        user_query: str,
        schema: Dict,
        conversation_history: List = None,
        selected_table: Optional[str] = None,
        username: str = "anonymous",
        db_path: Optional[str] = None
    ) -> Dict:
        if not self.client:
            return {
                "type": "error",
                "message": "AI Engine is not configured (Missing Groq Key).",
                "suggestion": "Please add GROQ_API_KEY to your .env file."
            }

        active_table = selected_table or self.context.get_active_table(username)
        
        # CONTEXT PURGE: If it's a fresh greeting, clear naming context to avoid carrying over old search terms
        greetings = ["HI", "HELLO", "HEY", "GOOD MORNING", "GOOD AFTERNOON", "GREETINGS"]
        if user_query.strip().upper() in greetings:
            self.context.user_contexts[username] = {
                "active_table": active_table,
                "last_query": None,
                "last_sql": None,
                "history": []
            }

        # GATHER DATA AWARENESS...
        sample_data = {}
        if db_path and os.path.exists(db_path):
            try:
                conn = sqlite3.connect(db_path)
                cursor = conn.cursor()
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
                tables = [r[0] for r in cursor.fetchall()]
                for t in tables[:10]: # Limit to first 10 tables to avoid prompt bloat
                    cursor.execute(f'SELECT * FROM "{t}" LIMIT 3')
                    cols = [d[0] for d in cursor.description]
                    rows = cursor.fetchall()
                    sample_data[t] = [dict(zip(cols, row)) for row in rows]
                conn.close()
            except Exception as e:
                logger.warning(f"Could not fetch sample data for context: {e}")

        # Initial attempt with Full Context
        result = await self._llm_process(user_query, schema, active_table, conversation_history, username, sample_data=sample_data)

        # Execution Feedback Loop (Max 1 retry for errors)
        if result.get("type") == "sql" and result.get("query") and db_path:
            sql = result["query"]
            # Skip if it's literally the word "null"
            if sql.strip().lower() == "null":
                result["type"] = "info"
                result["query"] = None
                return result

            try:
                # Validation execution
                conn = sqlite3.connect(db_path)
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                
                query_upper = sql.strip().upper()
                is_read = any(query_upper.startswith(x) for x in ["SELECT", "WITH", "PRAGMA"])
                
                if is_read:
                    cursor.execute(sql)
                else:
                    cursor.execute(f"EXPLAIN {sql}")
                
                conn.close()
                logger.info(f"SQL Validated successfully: {sql[:50]}...")
                
            except Exception as e:
                error_msg = str(e)
                logger.warning(f"SQL Execution Failed in feedback loop: {error_msg}")
                # Send error back to model for 1 retry
                result = await self._llm_process(
                    user_query, schema, active_table, conversation_history, username,
                    error_feedback=error_msg, failed_sql=sql, sample_data=sample_data
                )

        # Final logging and strip technicals
        final_sql = result.get("query")
        # Ensure we don't store "null" as valid SQL in context
        if final_sql and final_sql.strip().lower() == "null":
            final_sql = None
            result["query"] = None
            result["type"] = "info"

        self.context.update(username, result.get("target_table") or active_table, user_query, final_sql)
        
        # PERSISTENT LOGGING TO history.json
        self._log_to_history(username, user_query, final_sql)
        
        return result

    def _log_to_history(self, username: str, user_query: str, sql_query: Optional[str]):
        """Persists query history to a JSON file per user"""
        try:
            log_dir = f"./logs/{username}"
            os.makedirs(log_dir, exist_ok=True)
            history_file = os.path.join(log_dir, "history.json")
            
            history = []
            if os.path.exists(history_file):
                with open(history_file, "r") as f:
                    try:
                        history = json.load(f)
                    except json.JSONDecodeError:
                        history = []

            history.append({
                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "user_query": user_query,
                "sql_query": sql_query,
                "engine": "LLaMA-3.3-70B"
            })

            # Keep only last 100 entries per user to prevent file bloat
            if len(history) > 100:
                history = history[-100:]

            with open(history_file, "w") as f:
                json.dump(history, f, indent=4)
                
        except Exception as e:
            logger.error(f"Failed to log history: {e}")

    async def _llm_process(
        self,
        user_query: str,
        schema: Dict,
        active_table: Optional[str],
        conversation_history: List,
        username: str,
        error_feedback: Optional[str] = None,
        failed_sql: Optional[str] = None,
        sample_data: Dict = None
    ) -> Dict:
        start_time = time.time()
        
        # Build Prompt
        prompt = self._build_prompt(user_query, schema, active_table, conversation_history, username, error_feedback, failed_sql, sample_data)

        try:
            completion = self.client.chat.completions.create(
                model=self.model_name,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.0, # ZERO temperature for maximum logic stability
                max_tokens=2048,
                response_format={"type": "json_object"} if "format: json" in prompt.lower() else None
            )

            raw_response = completion.choices[0].message.content.strip()
            latency = round(time.time() - start_time, 2)
            
            # Parse the structured Groq response
            result = self._parse_structured_response(raw_response)
            result["latency"] = latency
            result["engine"] = "LLaMA 3.3 70B (Groq)"

            return result

        except Exception as e:
            logger.error(f"Groq API Error: {e}")
            return {
                "type": "error",
                "message": "The LLaMA reasoning engine encountered a connection error.",
                "error_details": str(e)
            }

    def _parse_structured_response(self, raw: str) -> Dict:
        """
        Parses LLaMA structured response. 
        Critical Fix: Catches 'None', 'N/A', and 'null' to prevent backend crashes.
        """
        try:
            return json.loads(raw)
        except:
            pass

        result = {"type": "info", "message": raw}
        
        if "SQL_QUERY:" in raw:
            parts = raw.split("EXPLANATION:")
            sql_part = parts[0].replace("SQL_QUERY:", "").strip()
            
            # Extract query from potential backticks
            if "```sql" in sql_part:
                sql_part = sql_part.split("```sql")[1].split("```")[0].strip()
            elif "```" in sql_part:
                sql_part = sql_part.split("```")[1].split("```")[0].strip()
            
            explanation_part = ""
            if len(parts) > 1:
                explanation_part = parts[1].strip()
            
            # ROBUST NULL CHECK: Catch all variants of "I don't know" or "No SQL"
            null_variants = ["null", "none", "n/a", "not applicable", ""]
            if sql_part.lower() in null_variants:
                return {
                    "type": "info",
                    "message": explanation_part or "I'm here to help with your database. Please ask a specific question.",
                    "query": None
                }

            result = {
                "type": "sql",
                "query": sql_part,
                "explanation": explanation_part,
                "queryType": "SELECT" if sql_part.upper().startswith("SELECT") else "WRITE"
            }
        
        return result

    def _build_prompt(self, user_query, schema, active_table, history, username, error_feedback=None, failed_sql=None, sample_data=None) -> str:
        # Schema String
        tables_info = []
        for table in schema.get("tables", []):
            name = table['name']
            columns = [f"{c['name']} ({c['type']})" for c in table.get("columns", [])]
            info = f"Table: {name}\nColumns: {', '.join(columns)}"
            
            # Inject Data Awareness if sample rows exist
            if sample_data and name in sample_data:
                rows = sample_data[name]
                info += f"\nSAMPLE DATA (Inspect formats/values): {json.dumps(rows)}"
            
            tables_info.append(info)
        
        schema_str = "\n".join(tables_info)

        # History String
        history_str = ""
        if history:
            history_str = "\n".join([f"{m['role']}: {m['content'][:200]}" for m in history[-5:]])

        # Feedback block
        feedback_block = ""
        if error_feedback:
            feedback_block = f"\n\nCRITICAL: Previous SQL failed: {failed_sql}\nError: {error_feedback}\nFix the logic with priority."

        return f"""You are an Expert SQLite reasoning engine (Powered by LLaMA 3.3 70B). 
You must handle both SQL generation and natural conversation with high precision.

### ANALYST BRAIN:
1. INTENT CLASSIFICATION: 
   - DATABASE TASK: User asks for data, counts, or changes. Return SQL.
   - CONVERSATION/KNOWLEDGE: Greetings, info about AI/LLM, etc. Return `SQL_QUERY: null`.
   - RULE: If it's a CONVERSATION/KNOWLEDGE task, provide a FRIENDLY, COMPLETE, and HELPFUL answer in the `EXPLANATION` field (similar to ChatGPT). Do NOT just describe the user's intent. Answer them!
2. DATA TYPES: Use `CAST(column AS NUMERIC)` for math on TEXT columns.
3. SEARCH STRATEGY: ALWAYS use `UPPER(column) = UPPER('value')` for names.
4. NO HALLUCINATION: Only use schema columns.

### DATABASE SCHEMA & SAMPLES:
{schema_str}

### CONTEXT:
User: {username} | Active Table: {active_table or "None"}
{history_str}{feedback_block}

### OUTPUT PROTOCOL:
- SQL_QUERY: Set to `null` for chat/general questions. Set to SQL for database tasks.
- EXPLANATION: 
  - IF SQL_QUERY IS SQL: Keep explanation to ONE SHORT SENTENCE.
  - IF SQL_QUERY IS NULL: Provide a HELPFUL, FRIENDLY, and COMPLETE response as a virtual assistant. Answer the user's question directly.

USER: "{user_query}"
"""

    def reset_context(self):
        self.context = ContextMemory()

premium_nlp_service = PremiumNLPService()
