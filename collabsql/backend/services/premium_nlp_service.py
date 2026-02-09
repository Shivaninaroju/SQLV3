"""
Premium AI Database Assistant - Gemini 2.5 Flash
Single-pass LLM architecture: user query -> LLM generates complete response
"""

import os
import json
import logging
from typing import List, Dict, Optional
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)


class ContextMemory:
    def __init__(self):
        self.active_table: Optional[str] = None
        self.last_query: Optional[str] = None
        self.last_sql: Optional[str] = None
        self.history: List[Dict] = []

    def update(self, table: Optional[str], query: str, sql: Optional[str] = None):
        if table:
            self.active_table = table
        self.last_query = query
        self.last_sql = sql
        self.history.append({"query": query, "sql": sql, "table": table})
        # Keep last 10 exchanges
        if len(self.history) > 10:
            self.history = self.history[-10:]

    def get_summary(self) -> str:
        parts = []
        if self.active_table:
            parts.append(f"Active table: {self.active_table}")
        if self.last_query:
            parts.append(f"Last query: {self.last_query}")
        if self.last_sql:
            parts.append(f"Last SQL: {self.last_sql}")
        return "\n".join(parts) if parts else "No prior context."


class PremiumNLPService:
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")
        self.client = None
        self.context = ContextMemory()

        try:
            from google import genai
            if self.api_key:
                self.client = genai.Client(api_key=self.api_key)
                logger.info("Gemini 2.5 Flash initialized via google-genai SDK")
            else:
                logger.warning("GEMINI_API_KEY not set")
        except Exception as e:
            logger.warning(f"google-genai init failed: {e}")

    async def process_query(
        self,
        user_query: str,
        schema: Dict,
        conversation_history: List = None,
        selected_table: Optional[str] = None,
    ) -> Dict:
        if conversation_history is None:
            conversation_history = []

        # Use selected table or context table
        active_table = selected_table or self.context.active_table

        if self.client:
            return await self._llm_process(user_query, schema, active_table, conversation_history)
        else:
            return self._fallback_process(user_query, schema, active_table)

    async def _llm_process(
        self,
        user_query: str,
        schema: Dict,
        active_table: Optional[str],
        conversation_history: List,
    ) -> Dict:
        prompt = self._build_prompt(user_query, schema, active_table, conversation_history)

        try:
            import asyncio
            response = await asyncio.to_thread(
                self.client.models.generate_content,
                model="gemini-2.5-flash",
                contents=prompt,
            )
            raw = response.text.strip()
            logger.info(f"LLM raw response length: {len(raw)}")

            # Parse JSON from response
            result = self._parse_llm_response(raw)

            # Update context
            sql = result.get("query")
            table = result.get("target_table") or active_table
            self.context.update(table, user_query, sql)

            return result

        except Exception as e:
            logger.error(f"LLM call failed: {e}", exc_info=True)
            return self._fallback_process(user_query, schema, active_table)

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
    ) -> str:
        # Build schema string
        tables_info = []
        for table in schema.get("tables", []):
            cols = ", ".join(
                f"{c['name']} ({c['type']})" for c in table.get("columns", [])
            )
            tables_info.append(f"  {table['name']}: [{cols}] ({table.get('rowCount', '?')} rows)")
        schema_str = "\n".join(tables_info)

        # Recent conversation for context
        recent = conversation_history[-6:] if conversation_history else []
        conv_str = ""
        if recent:
            conv_lines = []
            for msg in recent:
                role = msg.get("role", "user")
                content = msg.get("content", "")[:200]
                conv_lines.append(f"  {role}: {content}")
            conv_str = "\n".join(conv_lines)

        context_str = self.context.get_summary()

        return f"""You are a premium AI database assistant. You help users query SQLite databases using natural language.

DATABASE SCHEMA:
{schema_str}

ACTIVE TABLE: {active_table or "None selected"}

CONTEXT:
{context_str}

RECENT CONVERSATION:
{conv_str}

USER QUERY: "{user_query}"

RESPOND WITH ONLY A JSON OBJECT. No text before or after the JSON.

RESPONSE TYPES:

1. For SQL queries (SELECT, UPDATE, INSERT, DELETE):
{{"type": "sql", "query": "<valid SQLite SQL>", "queryType": "SELECT or WRITE", "explanation": "<brief explanation>", "target_table": "<table name>"}}

2. For informational/conceptual questions (what is AI, what is a primary key, general knowledge, greetings):
{{"type": "info", "message": "<your helpful answer>"}}

3. For ambiguous queries where you truly cannot determine what the user wants:
{{"type": "clarification", "message": "<one specific clarifying question>"}}

CRITICAL RULES:
- For "names starting with S" on the EMPLOYEE table: generate SELECT * FROM EMPLOYEE WHERE UPPER(FIRST_NAME) LIKE 'S%'
- For "update last name 'Jabili' to 'Pasunuri'": generate UPDATE EMPLOYEE SET LAST_NAME = 'Pasunuri' WHERE FIRST_NAME = 'Jabili' (or closest match on the name columns)
- If a table is active/selected and the user doesn't mention a specific table, USE the active table.
- For UPDATE/INSERT/DELETE, set queryType to "WRITE".
- For SELECT queries, set queryType to "SELECT".
- NEVER ask "which table?" if there is an active table or the table is obvious.
- For general knowledge questions like "what is AI?", "what is machine learning?", answer them directly with type "info".
- For database concept questions like "what is a primary key?", answer with type "info".
- For greetings like "hello", "hi", respond friendly with type "info".
- Use ONLY columns that exist in the schema. Quote table names with double quotes if they contain special chars.
- For SQLite: use UPPER() for case-insensitive comparisons, use LIKE for pattern matching.
- Minimize clarification questions. Only ask when truly ambiguous.
- Always generate valid SQLite syntax.

OUTPUT ONLY THE JSON OBJECT:"""

    # ---- Fallback (no LLM available) ----

    def _fallback_process(self, user_query: str, schema: Dict, active_table: Optional[str]) -> Dict:
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

        # Names starting with pattern
        match = re.search(r'(?:names?|starting|starts)\s+(?:starting|starts)?\s*with\s+["\']?([a-zA-Z]+)["\']?', lower)
        if match:
            letter = match.group(1).upper()
            name_col = self._find_name_col(col_names)
            if name_col:
                sql = f'SELECT * FROM "{target}" WHERE UPPER("{name_col}") LIKE \'{letter}%\''
                self.context.update(target, user_query, sql)
                return {"type": "sql", "query": sql, "queryType": "SELECT", "explanation": f"Filtering {target} where {name_col} starts with '{letter}'"}

        # Default SELECT
        sql = f'SELECT * FROM "{target}"'
        self.context.update(target, user_query, sql)
        return {"type": "sql", "query": sql, "queryType": "SELECT", "explanation": f"Showing all records from {target}"}

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
