const sqlite3 = require('sqlite3').verbose();

class SchemaExtractor {
  /**
   * Extract complete schema from SQLite database
   */
  async extractSchema(dbPath) {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) {
          reject(new Error('Failed to open database: ' + err.message));
          return;
        }
      });

      const schema = {
        tables: [],
        indexes: [],
        triggers: [],
        views: []
      };

      db.serialize(() => {
        // Get all tables
        db.all(
          `SELECT name, sql FROM sqlite_master
           WHERE type='table' AND name NOT LIKE 'sqlite_%'
           ORDER BY name`,
          async (err, tables) => {
            if (err) {
              db.close();
              reject(err);
              return;
            }

            try {
              // For each table, get detailed information
              for (const table of tables) {
                const tableInfo = {
                  name: table.name,
                  sql: table.sql,
                  columns: [],
                  rowCount: 0,
                  foreignKeys: [],
                  indexes: []
                };

                // Get column information
                const columns = await this.getTableColumns(db, table.name);
                tableInfo.columns = columns;

                // Get row count
                const rowCount = await this.getRowCount(db, table.name);
                tableInfo.rowCount = rowCount;

                // Get foreign keys
                const foreignKeys = await this.getForeignKeys(db, table.name);
                tableInfo.foreignKeys = foreignKeys;

                // Get indexes for this table
                const indexes = await this.getTableIndexes(db, table.name);
                tableInfo.indexes = indexes;

                schema.tables.push(tableInfo);
              }

              // Get views
              const views = await this.getViews(db);
              schema.views = views;

              // Get triggers
              const triggers = await this.getTriggers(db);
              schema.triggers = triggers;

              // Get global indexes
              const globalIndexes = await this.getGlobalIndexes(db);
              schema.indexes = globalIndexes;

              db.close((err) => {
                if (err) {
                  reject(err);
                } else {
                  resolve(schema);
                }
              });
            } catch (error) {
              db.close();
              reject(error);
            }
          }
        );
      });
    });
  }

  getTableColumns(db, tableName) {
    return new Promise((resolve, reject) => {
      db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
        if (err) reject(err);
        else {
          resolve(columns.map(col => ({
            id: col.cid,
            name: col.name,
            type: col.type,
            notNull: col.notnull === 1,
            defaultValue: col.dflt_value,
            primaryKey: col.pk === 1
          })));
        }
      });
    });
  }

  getRowCount(db, tableName) {
    return new Promise((resolve, reject) => {
      db.get(`SELECT COUNT(*) as count FROM "${tableName}"`, (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
  }

  getForeignKeys(db, tableName) {
    return new Promise((resolve, reject) => {
      db.all(`PRAGMA foreign_key_list(${tableName})`, (err, fks) => {
        if (err) reject(err);
        else {
          resolve(fks.map(fk => ({
            id: fk.id,
            table: fk.table,
            from: fk.from,
            to: fk.to,
            onUpdate: fk.on_update,
            onDelete: fk.on_delete
          })));
        }
      });
    });
  }

  getTableIndexes(db, tableName) {
    return new Promise((resolve, reject) => {
      db.all(`PRAGMA index_list(${tableName})`, (err, indexes) => {
        if (err) reject(err);
        else {
          resolve(indexes.map(idx => ({
            name: idx.name,
            unique: idx.unique === 1,
            origin: idx.origin,
            partial: idx.partial === 1
          })));
        }
      });
    });
  }

  getViews(db) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT name, sql FROM sqlite_master WHERE type='view' ORDER BY name`,
        (err, views) => {
          if (err) reject(err);
          else resolve(views);
        }
      );
    });
  }

  getTriggers(db) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT name, tbl_name, sql FROM sqlite_master WHERE type='trigger' ORDER BY name`,
        (err, triggers) => {
          if (err) reject(err);
          else resolve(triggers);
        }
      );
    });
  }

  getGlobalIndexes(db) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
        (err, indexes) => {
          if (err) reject(err);
          else resolve(indexes);
        }
      );
    });
  }

  /**
   * Generate human-readable schema description
   */
  generateSchemaDescription(schema) {
    let description = `Database Schema Summary:\n\n`;
    description += `Total Tables: ${schema.tables.length}\n`;
    description += `Total Views: ${schema.views.length}\n`;
    description += `Total Triggers: ${schema.triggers.length}\n\n`;

    description += `Tables:\n`;
    schema.tables.forEach(table => {
      description += `\n- ${table.name} (${table.rowCount} rows)\n`;
      description += `  Columns:\n`;
      table.columns.forEach(col => {
        const pk = col.primaryKey ? ' [PRIMARY KEY]' : '';
        const nn = col.notNull ? ' NOT NULL' : '';
        description += `    - ${col.name}: ${col.type}${pk}${nn}\n`;
      });

      if (table.foreignKeys.length > 0) {
        description += `  Foreign Keys:\n`;
        table.foreignKeys.forEach(fk => {
          description += `    - ${fk.from} -> ${fk.table}.${fk.to}\n`;
        });
      }
    });

    return description;
  }

  /**
   * Get sample data from tables
   */
  async getSampleData(dbPath, tableName, limit = 5) {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

      db.all(
        `SELECT * FROM "${tableName}" LIMIT ?`,
        [limit],
        (err, rows) => {
          db.close();
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }
}

module.exports = new SchemaExtractor();
