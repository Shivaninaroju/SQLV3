import sqlite3
import os
import json
from datetime import datetime
from threading import Lock

class DatabaseManager:
    _instance = None
    _lock = Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(DatabaseManager, cls).__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self.system_db_path = os.getenv("SYSTEM_DB_PATH", "./data/system.db")
        self._ensure_dirs()
        self._initialized = True

    def _ensure_dirs(self):
        os.makedirs(os.path.dirname(self.system_db_path), exist_ok=True)
        os.makedirs("./uploads/databases", exist_ok=True)

    def get_system_db(self):
        conn = sqlite3.connect(self.system_db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def get_user_db(self, db_path):
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def run_system_query(self, query, params=()):
        conn = self.get_system_db()
        cursor = conn.cursor()
        cursor.execute(query, params)
        last_id = cursor.lastrowid
        changes = conn.total_changes
        conn.commit()
        conn.close()
        return {"lastID": last_id, "changes": changes}

    def get_system_row(self, query, params=()):
        conn = self.get_system_db()
        cursor = conn.cursor()
        cursor.execute(query, params)
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None

    def get_system_rows(self, query, params=()):
        conn = self.get_system_db()
        cursor = conn.cursor()
        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def initialize_system_db(self):
        conn = self.get_system_db()
        cursor = conn.cursor()
        
        # Enable Foreign Keys
        cursor.execute("PRAGMA foreign_keys = ON")

        # Users
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                email_verified INTEGER DEFAULT 0,
                reset_token TEXT,
                reset_token_expiry DATETIME,
                otp TEXT,
                otp_expiry DATETIME
            )
        """)

        # Databases
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS databases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                original_filename TEXT NOT NULL,
                file_path TEXT NOT NULL,
                owner_id INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # Database Permissions
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS database_permissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                database_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                permission_level TEXT NOT NULL CHECK(permission_level IN ('owner', 'editor', 'viewer')),
                granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (database_id) REFERENCES databases(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(database_id, user_id)
            )
        """)

        # Commits
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS commits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                database_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                commit_message TEXT,
                query_executed TEXT NOT NULL,
                affected_tables TEXT,
                rows_affected INTEGER DEFAULT 0,
                operation_type TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (database_id) REFERENCES databases(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)

        # Schema Cache
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS schema_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                database_id INTEGER NOT NULL,
                schema_json TEXT NOT NULL,
                cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (database_id) REFERENCES databases(id) ON DELETE CASCADE
            )
        """)

        conn.commit()
        conn.close()

db_manager = DatabaseManager()
db_manager.initialize_system_db()
