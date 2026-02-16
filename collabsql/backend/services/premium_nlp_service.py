"""
Premium AI Database Assistant - Gemini 2.0 Flash
Single-pass LLM architecture: user query -> LLM generates complete response
"""

import os
import json
import logging
from datetime import datetime
from typing import List, Dict, Optional
from dotenv import load_dotenv

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
        # Keep last 10 exchanges
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
        return self._get_context(username)["active_table"]


class PremiumNLPService:
    def __init__(self):
        self.api_keys_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "api_keys.json")
        self.api_keys = self._load_api_keys()
        self.current_key_index = 0
        
        self.credentials_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        self.project_id = os.getenv("GOOGLE_CLOUD_PROJECT", "shivani-sql-chatbot")
        self.location = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
        
        self.client = None
        self.context = ContextMemory()
        self.total_tokens_used = 0

        self._init_client()

    def _load_api_keys(self) -> List[str]:
        """Load API keys from api_keys.json or fallback to .env"""
        try:
            if os.path.exists(self.api_keys_file):
                with open(self.api_keys_file, "r") as f:
                    data = json.load(f)
                    keys = data.get("keys", [])
                    # Filter out placeholders
                    filtered_keys = [k for k in keys if k and "PASTE" not in k.upper() and len(k) > 10]
                    if filtered_keys:
                        logger.info(f"Loaded {len(filtered_keys)} valid API keys from rotation pool.")
                        return filtered_keys
            
            # Fallback to .env
            env_key = os.getenv("GEMINI_API_KEY")
            if env_key and "PASTE" not in env_key.upper():
                return [env_key]
        except Exception as e:
            logger.error(f"Error loading api_keys.json: {e}")
        
        return []

    def _init_client(self):
        """Initialize or re-initialize the Gemini client using the API key pool"""
        try:
            from google import genai
            
            if self.api_keys:
                # Prioritize API Key rotation pool as requested
                current_key = self.api_keys[self.current_key_index]
                self.client = genai.Client(api_key=current_key)
                logger.info(f"Gemini initialized via API Key Pool - Index {self.current_key_index}")
                print(f"[OK] Active Identity: Gemini API Key #{self.current_key_index + 1}")
            elif self.credentials_path and os.path.exists(self.credentials_path):
                # Fallback to Vertex AI only if no keys are provided
                os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = os.path.abspath(self.credentials_path)
                self.client = genai.Client(
                    vertexai=True,
                    project=self.project_id,
                    location=self.location
                )
                logger.info(f"Gemini initialized via Vertex AI (Secondary Fallback)")
                print(f"[OK] Connected to Google Cloud Vertex AI: {self.project_id}")
            else:
                logger.warning("No Gemini authentication found (API Key Pool is empty)")
                print("[WARN] No AI credentials found in poll. Falling back to local engine.")
        except Exception as e:
            logger.warning(f"google-genai init failed: {e}")
            print(f"[ERROR] Gemini initialization failed: {e}")

    async def process_query(
        self,
        user_query: str,
        schema: Dict,
        conversation_history: List = None,
        selected_table: Optional[str] = None,
        username: str = "anonymous"
    ) -> Dict:
        if conversation_history is None:
            conversation_history = []

        # Use selected table or context table
        active_table = selected_table or self.context.get_active_table(username)

        result = None
        if self.client:
            result = await self._llm_process(user_query, schema, active_table, conversation_history, username)
        
        if not result:
            logger.error(f"AI LLM Call failed for query: {user_query}")
            return {
                "type": "error",
                "message": "The AI assistant is currently unavailable. Please check your Google Cloud configuration or try again in a moment.",
                "steps": ["Attempted AI synthesis...", "AI connection failed."]
            }

        # Terminal Display
        # print("\n" + "="*50, flush=True)
        # print("INTENT PROCESSING REPORT", flush=True)
        # print("="*50, flush=True)
        
        # Capture steps for terminal only
        terminal_steps = result.get("steps", [
            "Establishing connection to backend logic...",
            "Analyzing query intent...",
            "Cross-referencing query with database schema...",
            "Validating SQL for SQLite engine..."
        ])
        # for step in terminal_steps:
        #     print(f"  [STEP] {step}", flush=True)
        
        # print("-" * 50, flush=True)
        usage = result.get("usage")
        # if usage:
        #     current_total = usage.get('total_tokens', 0)
        #     self.total_tokens_used += current_total
        #     available = 1048576  
        #     remaining = max(0, available - self.total_tokens_used)
            
        #     print(f"  [USAGE] Current Query:   {current_total} tokens", flush=True)
        #     print(f"  [USAGE] Remaining:       {remaining} / {available} tokens", flush=True)
        #     print(f"  [USAGE] Prompt Tokens:   {usage.get('prompt_tokens', 0)}", flush=True)
        #     print(f"  [USAGE] Response Tokens: {usage.get('response_tokens', 0)}", flush=True)
        # else:
        #     print("  [USAGE] Local Pattern Matcher (0 tokens used)", flush=True)
        # print("="*50 + "\n", flush=True)

        # Ensure we log the query
        sql = result.get("query")
        self._log_query(username, user_query, sql, usage)

        # STRIP technical info from user-facing result
        if "steps" in result:
            del result["steps"]
        
        return result

    def _rotate_key(self) -> bool:
        """Switch to the next available API key in the pool"""
        if not self.api_keys or len(self.api_keys) <= 1:
            return False
            
        self.current_key_index = (self.current_key_index + 1) % len(self.api_keys)
        logger.info(f"Rotating to API Key #{self.current_key_index + 1}")
        print(f"[ROTATE] QUOTA EXHAUSTED: Rotating to Key #{self.current_key_index + 1}...")
        
        self._init_client()
        return True

    async def _llm_process(
        self,
        user_query: str,
        schema: Dict,
        active_table: Optional[str],
        conversation_history: List,
        username: str,
        retry_count: int = 0,
        model_name: str = "gemini-1.5-flash"
    ) -> Dict:
        prompt = self._build_prompt(user_query, schema, active_table, conversation_history, username)

        import time
        start_time = time.time()
        try:
            # Native Asynchronous Client
            target_model = model_name
            if target_model == "gemini-1.5-flash":
                target_model = "gemini-1.5-flash-latest" 
            
            response = await self.client.aio.models.generate_content(
                model=target_model, 
                contents=prompt,
            )
            raw = response.text.strip()
            
            # Extract usage stats
            usage = {
                "prompt_tokens": getattr(response.usage_metadata, 'prompt_token_count', 0),
                "response_tokens": getattr(response.usage_metadata, 'candidates_token_count', 0),
                "total_tokens": getattr(response.usage_metadata, 'total_token_count', 0)
            }

            # Parse JSON from response
            result = self._parse_llm_response(raw)

            latency = round(time.time() - start_time, 2)
            # Metadata
            result["usage"] = usage
            result["latency"] = latency
            result["steps"] = [
                f"Identity: API Key #{self.current_key_index + 1}",
                f"Engine: {target_model.replace('gemini-', 'Gemini ').replace('-', ' ').title()} (Optimized Lite)",
                f"Latency: {latency}s"
            ]

            # Update context
            sql = result.get("query")
            table = result.get("target_table") or active_table
            self.context.update(username, table, user_query, sql)

            return result

        except Exception as e:
            error_msg = str(e)
            latency = round(time.time() - start_time, 2)
            
            # Classification
            is_rotatable = any(err in error_msg for err in ["429", "RESOURCE_EXHAUSTED", "503", "500", "Deadline Exceeded"])
            # Some 400 errors are actually quota related in disguised form, but 404 is usually model naming
            is_model_error = any(err in error_msg for err in ["404", "model not found", "not found for API version"])

            logger.error(f"LLM [{model_name}] failed after {latency}s: {e}")

            # If 1.5 fails, rotate key or try 8B
            if model_name.startswith("gemini-1.5"):
                if is_rotatable and retry_count < len(self.api_keys) - 1:
                    print(f"[ROTATE] Key #{self.current_key_index + 1} exhausted. Rotating...")
                    if self._rotate_key():
                        return await self._llm_process(
                            user_query, schema, active_table, conversation_history, username, 
                            retry_count=retry_count + 1, model_name=model_name
                        )
                elif model_name != "gemini-1.5-flash-8b":
                    print(f"[FALLBACK] Switching to ultra-lite gemini-1.5-flash-8b...")
                    return await self._llm_process(
                        user_query, schema, active_table, conversation_history, username, 
                        retry_count=0, model_name="gemini-1.5-flash-8b"
                    )

            return {
                "type": "error",
                "message": f"AI Engine Exhausted (Latency: {latency}s). All keys and models are reaching limits.",
                "error_details": error_msg
            }

    def _log_query(self, username: str, nl_query: str, sql_query: Optional[str], usage: Optional[Dict] = None):
        """Store the NL and SQL queries in logs/<username>/history.json"""
        try:
            log_dir = os.path.join("logs", username)
            os.makedirs(log_dir, exist_ok=True)
            
            log_file = os.path.join(log_dir, "history.json")
            
            history = []
            if os.path.exists(log_file):
                try:
                    with open(log_file, "r") as f:
                        history = json.load(f)
                except:
                    history = []

            # Calculate cumulative tokens and key info
            total_used = sum(item.get("usage", {}).get("total_used_till_now", 0) for item in history if isinstance(item.get("usage"), dict))
            # If the old format exists, fallback to reading 'tokens'
            if total_used == 0:
                total_used = sum(item.get("tokens", {}).get("total_tokens", 0) for item in history if isinstance(item.get("tokens"), dict))
            
            current_tokens = usage.get("total_tokens", 0) if usage else 0
            new_total = total_used + current_tokens
            
            # Estimate remaining (using 1,000,000 as a soft daily/pool limit)
            soft_limit = 1000000 
            remaining = max(0, soft_limit - new_total)
            
            api_key_info = "N/A"
            if self.api_keys:
                key = self.api_keys[self.current_key_index]
                api_key_info = f"Key #{self.current_key_index + 1} ({key[:6]}...{key[-4:]})"

            entry = {
                "timestamp": datetime.now().isoformat(),
                "nl": nl_query,
                "sql": sql_query or "N/A (Non-SQL response)",
                "api_key": api_key_info,
                "usage": {
                    "current_query": usage,
                    "latency_seconds": result.get("latency", 0),
                    "total_used_till_now": new_total,
                    "estimated_remaining": remaining
                }
            }
            
            history.append(entry)
            
            with open(log_file, "w") as f:
                json.dump(history, f, indent=2)
                
            logger.info(f"Logged query for user {username} (Total used: {new_total})")
        except Exception as e:
            logger.error(f"Failed to log query: {e}")

    def _parse_llm_response(self, raw: str) -> Dict:
        # Strip markdown code fences
        text = raw
        if "```json" in text:
            text = text.split("```json", 1)[1].split("```", 1)[0].strip()
        elif "```" in text:
            text = text.split("```", 1)[1].split("```", 1)[0].strip()

        data = json.loads(text)

        resp_type = data.get("type", "info")
        result = {"type": resp_type}

        if resp_type == "sql":
            result["query"] = data["query"]
            result["queryType"] = data.get("queryType", "SELECT")
            result["explanation"] = data.get("explanation", "Executing query")
            result["target_table"] = data.get("target_table")
        elif resp_type == "info":
            result["message"] = data.get("message", "")
        elif resp_type == "clarification":
            result["message"] = data.get("message", "Could you clarify?")
        elif resp_type == "error":
            result["message"] = data.get("message", "Something went wrong.")
        else:
            result["type"] = "info"
            result["message"] = data.get("message", str(data))

        return result

    def _build_prompt(
        self,
        user_query: str,
        schema: Dict,
        active_table: Optional[str],
        conversation_history: List,
        username: str
    ) -> str:
        # Build detailed schema string with column types
        tables_info = []
        for table in schema.get("tables", []):
            col_details = []
            for c in table.get("columns", []):
                pk_marker = " [PK]" if c.get("pk") else ""
                nn_marker = " NOT NULL" if c.get("notnull") else ""
                col_details.append(f"    {c['name']} {c['type']}{pk_marker}{nn_marker}")
            cols_str = "\n".join(col_details)
            tables_info.append(f"  TABLE: {table['name']} ({table.get('rowCount', '?')} rows)\n{cols_str}")
        schema_str = "\n\n".join(tables_info)

        # Recent conversation for context
        recent = conversation_history[-6:] if conversation_history else []
        conv_str = ""
        if recent:
            conv_lines = []
            for msg in recent:
                role = msg.get("role", "user")
                content = msg.get("content", "")[:300]
                conv_lines.append(f"  {role}: {content}")
            conv_str = "\n".join(conv_lines)

        context_str = self.context.get_summary(username)

        return f"""ROLE: You are the Senior AI Database Architect. Your mission is to provide INDUSTRY-GRADE SQLite responses with absolute precision.
            
OBJECTIVE: Convert natural language into optimized, secure, and accurate SQLite queries. You are running on a Lite engine, so you MUST compensate by using advanced logical reasoning and strict adherence to SQL standards.

DATABASE SCHEMA:
{schema_str}

CONVERSATION STATE:
- Active Table Context: {active_table or "Global/Implicit"}
- Analytical Context: {context_str}
- History: {conv_str}

--- ARCHITECTURAL CONSTRAINTS ---
1. SCHEMA TRUTH: Use ONLY columns and tables defined above. Case sensitivity matters for double-quoted identifiers.
2. LOGICAL PIPELINE:
   - Identify the primary intent (Read, Write, Info).
   - Resolve ambiguous references using history/active table.
   - For SQL: Build the WHERE filters first, then Aggregates, then Sort/Limit.
3. SQLITE PRECISION: Use SQLite logic (|| for concat, strftime for dates, LIMIT for top).
4. ERROR PREVENTION: If a query might fail due to missing data or schema mismatch, provide a clarifying response instead.

--- CRITICAL REASONING & ACCURACY RULES ---
- NULL RESILIENCE: Apply `WHERE x IS NOT NULL` for all MIN/MAX/SUM/AVG and ORDER BY. This is non-negotiable for accuracy.
- JOIN INTEGRITY: Use explicit aliases (e.g., `FROM Table t JOIN Table m ON t.ID = m.ID`) for self-joins.
- DATA SECURITY: Only perform the specific operation requested. Do not drop tables unless explicitly asked by 'Admin'.
- CASE INSENSITIVITY: Wrap column comparisons in `UPPER()` or `LOWER()` for standard text fields.

--- RESPONSE SPECIFICATION ---
Return ONLY a valid JSON object.

A. FOR DATA OPERATIONS (SELECT/INSERT/UPDATE/DELETE):
{{
  "type": "sql",
  "query": "<optimized_sql_string>",
  "queryType": "SELECT" | "WRITE",
  "explanation": "<pro_tier_explanation>",
  "target_table": "<table_name>"
}}

B. FOR KNOWLEDGE/GREETINGS/CLARIFICATION:
{{
  "type": "info" | "clarification",
  "message": "<helpful_expert_response>"
}}

USER INPUT: "{user_query}"
"""

    # ---- Fallback (no LLM available) ----

    def _fallback_process(self, user_query: str, schema: Dict, active_table: Optional[str], username: str = "anonymous") -> Dict:
        import re
        lower = user_query.lower().strip()

        tables = schema.get("tables", [])
        table_names = [t["name"] for t in tables]

        # Detect target table
        target = active_table
        for t in table_names:
            if t.lower() in lower:
                target = t
                break

        # General greetings
        if any(kw in lower for kw in ["hello", "hi ", "hey", "good morning", "good evening"]):
            return {"type": "info", "message": "Hello! I'm your AI database assistant. Ask me anything about your database - I can run queries, explain concepts, and help you explore your data."}

        # Conceptual / knowledge questions
        if lower.startswith(("what is", "what are", "explain", "define", "how does", "why is", "tell me about")):
            return self._answer_question_fallback(lower, schema)

        # Metadata
        if any(kw in lower for kw in ["what tables", "show tables", "list tables", "which tables"]):
            return {"type": "info", "message": f"Available tables: {', '.join(table_names)}"}

        if not target:
            if len(table_names) == 1:
                target = table_names[0]
            else:
                return {"type": "clarification", "message": f"Which table would you like to query? Available: {', '.join(table_names)}"}

        # Find columns for this table
        table_obj = next((t for t in tables if t["name"] == target), None)
        col_names = [c["name"] for c in table_obj["columns"]] if table_obj else []

        # UPDATE
        if "update" in lower:
            return self._fallback_update(lower, target, col_names)

        # DELETE
        if "delete" in lower or "remove" in lower:
            return {"type": "clarification", "message": f"Please specify which records to delete. Example: delete from {target} where EMPLOYEE_ID = 5"}

        # COUNT
        if "count" in lower or "how many" in lower:
            sql = f'SELECT COUNT(*) as count FROM "{target}"'
            self.context.update(target, user_query, sql)
            return {"type": "sql", "query": sql, "queryType": "SELECT", "explanation": f"Counting records in {target}"}

        # Names starting/ending with patterns
        name_col = self._find_name_col(col_names)
        if name_col:
            # Check for starts with
            starts_match = re.search(r'(?:starts?|starting)\s+with\s+["\']?([a-zA-Z]+)["\']?', lower)
            # Check for ends with
            ends_match = re.search(r'(?:ends?|ending)\s+with\s+["\']?([a-zA-Z]+)["\']?', lower)
            
            if starts_match or ends_match:
                conditions = []
                explanations = []
                
                if starts_match:
                    prefix = starts_match.group(1).upper()
                    conditions.append(f'UPPER("{name_col}") LIKE \'{prefix}%\'')
                    explanations.append(f"starts with '{prefix}'")
                
                if ends_match:
                    suffix = ends_match.group(1).upper()
                    conditions.append(f'UPPER("{name_col}") LIKE \'%{suffix}\'')
                    explanations.append(f"ends with '{suffix}'")
                
                sql = f'SELECT * FROM "{target}" WHERE ' + " AND ".join(conditions)
                
                # Check for Top/Limit
                limit_match = re.search(r'(?:top|limit|first)\s+(\d+)', lower)
                if limit_match:
                    sql += f" LIMIT {limit_match.group(1)}"
                
                self.context.update(target, user_query, sql)
                return {
                    "type": "sql", 
                    "query": sql, 
                    "queryType": "SELECT", 
                    "explanation": f"Filtering {target} where {name_col} " + " and ".join(explanations)
                }

        # --- Enhanced Fallback SELECT logic ---
        sql = f'SELECT * FROM "{target}"'
        
        # Detect ORDER BY
        if " by " in lower or "order by" in lower or "sort by" in lower:
            for col in col_names:
                if col.lower() in lower:
                    sql += f' ORDER BY "{col}"'
                    if any(kw in lower for kw in ["desc", "high", "top", "max", "most"]):
                        sql += " DESC"
                    break
        
        # Detect LIMIT / TOP
        limit_match = re.search(r'(?:top|limit|first)\s+(\d+)', lower)
        if limit_match:
            limit_val = limit_match.group(1)
            # If we haven't added ORDER BY but saw "top", let's try to find a numeric col to order by
            if "order by" not in sql.lower() and ("top" in lower or "highest" in lower):
                # Try to find a salary/amount column
                for col in col_names:
                    if any(kw in col.lower() for kw in ["salary", "amount", "price", "wage", "total"]):
                        sql += f' ORDER BY "{col}" DESC'
                        break
            sql += f" LIMIT {limit_val}"

        self.context.update(target, user_query, sql)
        return {"type": "sql", "query": sql, "queryType": "SELECT", "explanation": f"Showing results from {target} (Fallback Mode)"}

    def _fallback_update(self, lower: str, target: str, col_names: List[str]) -> Dict:
        import re
        # Pattern: update last name 'X' to 'Y' or update last_name of X as/to Y
        patterns = [
            # update <col> 'val1' to 'val2'
            r"update\s+(\w[\w\s]*?)\s+['\"](\w+)['\"]\s+(?:to|as)\s+['\"]?(\w+)['\"]?",
            # update <col> of <val1> as/to <val2>
            r"update\s+(\w[\w\s]*?)\s+of\s+(\w+)\s+(?:as|to)\s+(\w+)",
        ]
        for pat in patterns:
            m = re.search(pat, lower)
            if m:
                col_phrase = m.group(1).strip()
                old_val = m.group(2)
                new_val = m.group(3)
                # Map col_phrase to actual column
                set_col = self._match_column(col_phrase, col_names)
                # Find a name/identifier column for WHERE
                where_col = self._find_name_col(col_names)
                if set_col and where_col:
                    sql = f'UPDATE "{target}" SET "{set_col}" = \'{new_val}\' WHERE "{where_col}" = \'{old_val}\''
                    self.context.update(target, f"update {col_phrase}", sql)
                    return {"type": "sql", "query": sql, "queryType": "WRITE", "explanation": f"Updating {set_col} to '{new_val}' where {where_col} = '{old_val}'"}

        return {"type": "clarification", "message": f"Please specify the update clearly. Example: update LAST_NAME of 'John' to 'Smith'"}

    def _find_name_col(self, col_names: List[str]) -> Optional[str]:
        for c in col_names:
            cl = c.lower()
            if cl == "first_name" or cl == "name":
                return c
        for c in col_names:
            if "name" in c.lower() or "first" in c.lower():
                return c
        return col_names[0] if col_names else None

    def _match_column(self, phrase: str, col_names: List[str]) -> Optional[str]:
        phrase_lower = phrase.lower().replace(" ", "_")
        # Exact match
        for c in col_names:
            if c.lower() == phrase_lower:
                return c
        # Partial match
        for c in col_names:
            if phrase_lower in c.lower() or c.lower() in phrase_lower:
                return c
        # Word match: "last name" -> LAST_NAME
        words = phrase.lower().split()
        for c in col_names:
            cl = c.lower()
            if all(w in cl for w in words):
                return c
        return None

    def _answer_question_fallback(self, lower: str, schema: Dict) -> Dict:
        answers = {
            "primary key": "A PRIMARY KEY uniquely identifies each row in a table. It must be unique and cannot be NULL. Each table can have only one primary key.",
            "foreign key": "A FOREIGN KEY creates a link between two tables by referencing the primary key of another table, enforcing referential integrity.",
            "index": "An INDEX speeds up data retrieval by creating a quick lookup structure, similar to a book's index. It improves SELECT performance but adds overhead to INSERT/UPDATE/DELETE.",
            "normalization": "Normalization organizes data to minimize redundancy. Common forms: 1NF (atomic values), 2NF (no partial dependencies), 3NF (no transitive dependencies).",
            "join": "A JOIN combines rows from multiple tables. Types: INNER JOIN (matching rows only), LEFT JOIN (all left + matching right), RIGHT JOIN, FULL OUTER JOIN, CROSS JOIN.",
            "constraint": "Constraints enforce data rules: PRIMARY KEY, FOREIGN KEY, UNIQUE, NOT NULL, CHECK, DEFAULT.",
            "sql": "SQL (Structured Query Language) is the standard language for managing relational databases. It includes commands for querying (SELECT), modifying (INSERT/UPDATE/DELETE), and defining data structures (CREATE/ALTER/DROP).",
            "database": "A database is an organized collection of structured data stored electronically. Relational databases organize data into tables with rows and columns, linked by keys.",
            "ai": "AI (Artificial Intelligence) is the simulation of human intelligence by computer systems. It includes machine learning, natural language processing, and computer vision. I'm an AI assistant focused on helping you with database queries!",
            "machine learning": "Machine Learning is a subset of AI where systems learn from data to improve performance without explicit programming. Common types: supervised, unsupervised, and reinforcement learning.",
        }
        for keyword, answer in answers.items():
            if keyword in lower:
                return {"type": "info", "message": answer}

        # Generic knowledge question - give a helpful response
        return {"type": "info", "message": "I'm primarily a database assistant, but I'll do my best to help! Could you rephrase your question, or ask me about your database data?"}

    def reset_context(self):
        self.context = ContextMemory()


premium_nlp_service = PremiumNLPService()
