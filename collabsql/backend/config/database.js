const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

const SYSTEM_DB_PATH = process.env.SYSTEM_DB_PATH || './data/system.db';

class DatabaseManager {
  constructor() {
    this.systemDb = null;
  }

  // Get system database connection
  getSystemDb() {
    if (!this.systemDb) {
      this.systemDb = new sqlite3.Database(SYSTEM_DB_PATH, (err) => {
        if (err) {
          console.error('Error opening system database:', err);
          throw err;
        }
        console.log('Connected to system database');
      });

      // Enable foreign keys
      this.systemDb.run('PRAGMA foreign_keys = ON');
    }
    return this.systemDb;
  }

  // Get user database connection
  getUserDb(dbPath) {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
        if (err) {
          reject(err);
        } else {
          db.run('PRAGMA foreign_keys = ON');
          resolve(db);
        }
      });
    });
  }

  // Execute query on system database
  runSystemQuery(query, params = []) {
    return new Promise((resolve, reject) => {
      this.getSystemDb().run(query, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  // Get single row from system database
  getSystemRow(query, params = []) {
    return new Promise((resolve, reject) => {
      this.getSystemDb().get(query, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  // Get all rows from system database
  getSystemRows(query, params = []) {
    return new Promise((resolve, reject) => {
      this.getSystemDb().all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Execute query on user database
  runUserQuery(db, query, params = []) {
    return new Promise((resolve, reject) => {
      db.run(query, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  // Get rows from user database
  getUserRows(db, query, params = []) {
    return new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Get single row from user database
  getUserRow(db, query, params = []) {
    return new Promise((resolve, reject) => {
      db.get(query, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  // Close database connection
  closeDb(db) {
    return new Promise((resolve, reject) => {
      db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Initialize system database with schema
  async initializeSystemDb() {
    const db = this.getSystemDb();

    return new Promise((resolve, reject) => {
      db.serialize(() => {
        // Users table
        db.run(`
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME,
            is_active INTEGER DEFAULT 1,
            email_verified INTEGER DEFAULT 0,
            verification_token TEXT,
            verification_token_expires DATETIME,
            reset_password_token TEXT,
            reset_password_expires DATETIME
          )
        `);

        // Databases table
        db.run(`
          CREATE TABLE IF NOT EXISTS databases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            original_filename TEXT NOT NULL,
            file_path TEXT NOT NULL,
            owner_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            file_size INTEGER,
            description TEXT,
            FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
          )
        `);

        // Database permissions table
        db.run(`
          CREATE TABLE IF NOT EXISTS database_permissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            database_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            permission_level TEXT NOT NULL CHECK(permission_level IN ('owner', 'editor', 'viewer')),
            granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            granted_by INTEGER NOT NULL,
            FOREIGN KEY (database_id) REFERENCES databases(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (granted_by) REFERENCES users(id),
            UNIQUE(database_id, user_id)
          )
        `);

        // Commit history table
        db.run(`
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
            snapshot_before TEXT,
            snapshot_after TEXT,
            FOREIGN KEY (database_id) REFERENCES databases(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id)
          )
        `);

        // Active sessions table (for real-time collaboration)
        db.run(`
          CREATE TABLE IF NOT EXISTS active_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            database_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            socket_id TEXT NOT NULL,
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (database_id) REFERENCES databases(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          )
        `);

        // Database schema cache
        db.run(`
          CREATE TABLE IF NOT EXISTS schema_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            database_id INTEGER NOT NULL,
            schema_json TEXT NOT NULL,
            cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (database_id) REFERENCES databases(id) ON DELETE CASCADE
          )
        `, (err) => {
          if (err) reject(err);
          else {
            // Run migrations for existing databases
            this.runMigrations(db).then(() => {
              console.log('System database initialized successfully');
              resolve();
            }).catch(reject);
          }
        });
      });
    });
  }

  // Add missing columns to existing tables (safe migrations)
  async runMigrations(db) {
    const migrations = [
      { table: 'users', column: 'email_verified', sql: 'ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0' },
      { table: 'users', column: 'verification_token', sql: 'ALTER TABLE users ADD COLUMN verification_token TEXT' },
      { table: 'users', column: 'verification_token_expires', sql: 'ALTER TABLE users ADD COLUMN verification_token_expires DATETIME' },
      { table: 'users', column: 'reset_password_token', sql: 'ALTER TABLE users ADD COLUMN reset_password_token TEXT' },
      { table: 'users', column: 'reset_password_expires', sql: 'ALTER TABLE users ADD COLUMN reset_password_expires DATETIME' },
    ];

    for (const migration of migrations) {
      const hasColumn = await new Promise((resolve, reject) => {
        db.all(`PRAGMA table_info(${migration.table})`, (err, columns) => {
          if (err) reject(err);
          else resolve(columns.some(col => col.name === migration.column));
        });
      });

      if (!hasColumn) {
        await new Promise((resolve, reject) => {
          db.run(migration.sql, (err) => {
            if (err) reject(err);
            else {
              console.log(`  Migration: Added column '${migration.column}' to '${migration.table}'`);
              resolve();
            }
          });
        });
      }
    }

    // Mark existing users as email_verified so they can still log in
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE users SET email_verified = 1 WHERE email_verified IS NULL OR email_verified = 0`,
        function(err) {
          if (err) reject(err);
          else if (this.changes > 0) {
            console.log(`  Migration: Marked ${this.changes} existing user(s) as email verified`);
            resolve();
          } else {
            resolve();
          }
        }
      );
    });
  }
}

module.exports = new DatabaseManager();
