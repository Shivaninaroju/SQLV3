import os
import re
import json
import logging
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class NLPToSQLPython:
    """
    Fallback NLP-to-SQL Converter
    Uses pattern-based SQL generation (no external LLM required)
    Two-stage pipeline: Semantic Intent → Deterministic SQL
    """
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")
        self.gemini_available = False

        # Try to import Gemini, but don't fail if it's not available
        try:
            import google.generativeai as genai
            if self.api_key:
                genai.configure(api_key=self.api_key)
                self.model = genai.GenerativeModel("gemini-2.0-flash-exp")
                self.gemini_available = True
                logger.info("✅ Gemini API configured")
        except Exception as e:
            logger.warning(f"⚠️ Gemini not available: {e}")
            self.gemini_available = False
            self.model = None

    async def convert_to_sql(self, user_query: str, schema: Dict, conversation_history: List = [], selected_table: Optional[str] = None) -> Dict:
        """
        Two-stage pipeline:
        1. Semantic interpretation (detect intent, table, conditions)
        2. Deterministic SQL generation
        """
        logger.info(f"Processing: {user_query}")

        try:
            # Stage 1: Detect intent
            intent = self._detect_intent(user_query, schema, selected_table)
            logger.info(f"Intent: {intent['type']}")

            # Stage 2: Generate response
            if intent['type'] == 'SELECT':
                return self._handle_select(user_query, intent, schema)
            elif intent['type'] == 'INSERT':
                return self._handle_insert(user_query, intent, schema)
            elif intent['type'] == 'UPDATE':
                return self._handle_update(user_query, intent, schema)
            elif intent['type'] == 'DELETE':
                return self._handle_delete(user_query, intent, schema)
            elif intent['type'] == 'COUNT':
                return self._handle_count(user_query, intent, schema)
            elif intent['type'] == 'INFO':
                return self._handle_info(user_query, schema)
            else:
                return {"type": "info", "message": f"Query received: {user_query}"}

        except Exception as e:
            logger.error(f"Error: {e}")
            return {"type": "error", "message": f"Processing error: {str(e)}"}

    def _detect_intent(self, query: str, schema: Dict, selected_table: Optional[str]) -> Dict:
        """Detect query intent using pattern matching"""
        lower_query = query.lower().strip()

        # Detect operation type
        if any(kw in lower_query for kw in ['show', 'display', 'get', 'select', 'list', 'find']):
            intent_type = 'SELECT'
        elif any(kw in lower_query for kw in ['insert', 'add', 'new', 'create']):
            intent_type = 'INSERT'
        elif any(kw in lower_query for kw in ['update', 'modify', 'change', 'set', 'edit']):
            intent_type = 'UPDATE'
        elif any(kw in lower_query for kw in ['delete', 'remove', 'drop', 'erase']):
            intent_type = 'DELETE'
        elif any(kw in lower_query for kw in ['count', 'how many', 'total']):
            intent_type = 'COUNT'
        else:
            intent_type = 'INFO'

        # Detect table
        target_table = selected_table
        if not target_table:
            for table in schema.get('tables', []):
                if table['name'].lower() in lower_query:
                    target_table = table['name']
                    break

        return {
            'type': intent_type,
            'table': target_table,
            'query': query
        }

    def _handle_select(self, query: str, intent: Dict, schema: Dict) -> Dict:
        """Handle SELECT queries"""
        table = intent.get('table')
        if not table and schema.get('tables'):
            table = schema['tables'][0]['name']

        if not table:
            return {"type": "error", "message": "Could not identify table"}

        sql = f'SELECT * FROM "{table}"'

        # Add WHERE clause if conditions are mentioned
        if 'where' in query.lower():
            # Simple pattern extraction (improve as needed)
            if 'starting with' in query.lower() or 'starts with' in query.lower():
                # Extract the letter/word
                match = re.search(r'(starting|starts)\s+with\s+["\']?(\w)["\']?', query.lower())
                if match:
                    letter = match.group(2).upper()
                    # Find name column
                    name_col = None
                    if table:
                        for col in schema.get('tables', []):
                            if col['name'] == table:
                                for c in col['columns']:
                                    if 'name' in c['name'].lower():
                                        name_col = c['name']
                                        break
                    if name_col:
                        sql += f' WHERE UPPER("{name_col}") LIKE \'{letter}%\''

        return {
            "type": "sql",
            "query": sql,
            "queryType": "SELECT",
            "explanation": f"Retrieving data from {table}"
        }

    def _handle_insert(self, query: str, intent: Dict, schema: Dict) -> Dict:
        """Handle INSERT queries"""
        return {"type": "clarification", "message": "To insert data, please provide column names and values (e.g., 'insert name John into EMPLOYEE')"}

    def _handle_update(self, query: str, intent: Dict, schema: Dict) -> Dict:
        """Handle UPDATE queries"""
        return {"type": "clarification", "message": "To update data, please specify the column, new value, and condition (e.g., 'update salary to 5000 where name is John')"}

    def _handle_delete(self, query: str, intent: Dict, schema: Dict) -> Dict:
        """Handle DELETE queries"""
        return {"type": "clarification", "message": "To delete data, please specify which records to delete (e.g., 'delete where id = 5')"}

    def _handle_count(self, query: str, intent: Dict, schema: Dict) -> Dict:
        """Handle COUNT queries"""
        table = intent.get('table')
        if not table and schema.get('tables'):
            table = schema['tables'][0]['name']

        if not table:
            return {"type": "error", "message": "Could not identify table"}

        sql = f'SELECT COUNT(*) as result FROM "{table}"'
        return {
            "type": "sql",
            "query": sql,
            "queryType": "SELECT",
            "explanation": f"Counting records in {table}"
        }

    def _handle_info(self, query: str, schema: Dict) -> Dict:
        """Handle informational queries"""
        if 'table' in query.lower():
            tables = [t['name'] for t in schema.get('tables', [])]
            return {
                "type": "info",
                "message": f"Available tables: {', '.join(tables)}"
            }
        return {
            "type": "info",
            "message": "I can help you query your database. Try: 'show employees', 'count records', 'update salary to 5000', etc."
        }

nlp_to_sql = NLPToSQLPython()
