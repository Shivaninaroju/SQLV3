const express = require('express');
const router = express.Router();
const dbManager = require('../config/database');
const nlpToSql = require('../services/nlpToSql');
const { authenticateToken, checkDatabaseAccess } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

// Process natural language query
router.post('/nl', authenticateToken, checkDatabaseAccess('viewer'), asyncHandler(async (req, res) => {
  const { databaseId, query, conversationHistory, selectedTable } = req.body;

  if (!query || query.trim().length === 0) {
    return res.status(400).json({ error: 'Query is required' });
  }

  // Get database info
  const database = await dbManager.getSystemRow(
    'SELECT file_path FROM databases WHERE id = ?',
    [databaseId]
  );

  if (!database) {
    return res.status(404).json({ error: 'Database not found' });
  }

  // Get schema
  const schemaCache = await dbManager.getSystemRow(
    'SELECT schema_json FROM schema_cache WHERE database_id = ? ORDER BY cached_at DESC LIMIT 1',
    [databaseId]
  );

  if (!schemaCache) {
    return res.status(500).json({ error: 'Schema not found. Please refresh the database.' });
  }

  const schema = JSON.parse(schemaCache.schema_json);

  // Convert NL to SQL
  const result = await nlpToSql.convertToSQL(query, schema, conversationHistory || [], selectedTable);

  res.json(result);
}));

// Execute SQL query
router.post('/execute', authenticateToken, checkDatabaseAccess('viewer'), asyncHandler(async (req, res) => {
  const { databaseId, query, isWrite } = req.body;

  if (!query || query.trim().length === 0) {
    return res.status(400).json({ error: 'Query is required' });
  }

  // Check write permissions for non-SELECT queries
  const queryType = query.trim().toUpperCase().split(' ')[0];
  const writeOperations = ['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP'];

  if (writeOperations.includes(queryType) && req.userPermission === 'viewer') {
    return res.status(403).json({
      error: 'Viewer role cannot execute write operations',
      requiredPermission: 'editor'
    });
  }

  // Get database
  const database = await dbManager.getSystemRow(
    'SELECT file_path FROM databases WHERE id = ?',
    [databaseId]
  );

  if (!database) {
    return res.status(404).json({ error: 'Database not found' });
  }

  // Get snapshot before (for write operations)
  let snapshotBefore = null;
  if (writeOperations.includes(queryType)) {
    snapshotBefore = await captureSnapshot(database.file_path, query);
  }

  // Execute query
  const userDb = await dbManager.getUserDb(database.file_path);

  try {
    let result;

    if (queryType === 'SELECT') {
      result = await dbManager.getUserRows(userDb, query);
    } else {
      result = await dbManager.runUserQuery(userDb, query);
    }

    // Get snapshot after (for write operations)
    let snapshotAfter = null;
    if (writeOperations.includes(queryType)) {
      snapshotAfter = await captureSnapshot(database.file_path, query);
    }

    // Log commit for write operations
    if (writeOperations.includes(queryType)) {
      const affectedTables = extractAffectedTables(query);

      await dbManager.runSystemQuery(
        `INSERT INTO commits (database_id, user_id, query_executed, affected_tables, rows_affected, operation_type, snapshot_before, snapshot_after, commit_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          databaseId,
          req.user.id,
          query,
          affectedTables,
          result.changes || 0,
          queryType,
          JSON.stringify(snapshotBefore),
          JSON.stringify(snapshotAfter),
          `${queryType} operation by ${req.user.username}`
        ]
      );

      // Update database updated_at
      await dbManager.runSystemQuery(
        'UPDATE databases SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [databaseId]
      );
    }

    await dbManager.closeDb(userDb);

    res.json({
      success: true,
      queryType,
      result: queryType === 'SELECT' ? result : { rowsAffected: result.changes },
      message: queryType === 'SELECT'
        ? `Retrieved ${result.length} rows`
        : `${queryType} operation completed. ${result.changes} rows affected.`
    });
  } catch (error) {
    await dbManager.closeDb(userDb);
    throw error;
  }
}));

// Get query suggestions
router.get('/suggestions/:databaseId', authenticateToken, checkDatabaseAccess('viewer'), asyncHandler(async (req, res) => {
  const { databaseId } = req.params;

  // Get schema
  const schemaCache = await dbManager.getSystemRow(
    'SELECT schema_json FROM schema_cache WHERE database_id = ? ORDER BY cached_at DESC LIMIT 1',
    [databaseId]
  );

  if (!schemaCache) {
    return res.status(404).json({ error: 'Schema not found' });
  }

  const schema = JSON.parse(schemaCache.schema_json);

  // Generate common query suggestions
  const suggestions = [];

  schema.tables.forEach(table => {
    suggestions.push({
      category: 'View Data',
      query: `Show all data from ${table.name}`,
      description: `View records from ${table.name} table (${table.rowCount} rows)`
    });

    suggestions.push({
      category: 'Statistics',
      query: `How many rows in ${table.name}?`,
      description: `Count total records in ${table.name}`
    });

    if (table.columns.length > 0) {
      suggestions.push({
        category: 'Schema',
        query: `Show columns from ${table.name}`,
        description: `View column structure of ${table.name}`
      });
    }
  });

  // Add general suggestions
  suggestions.unshift(
    {
      category: 'Schema',
      query: 'Show all tables',
      description: 'List all tables in the database'
    },
    {
      category: 'Schema',
      query: 'Explain the database schema',
      description: 'Get an overview of the entire database structure'
    }
  );

  res.json({ suggestions: suggestions.slice(0, 20) });
}));

// Helper function to capture snapshot
async function captureSnapshot(dbPath, query) {
  // Extract table name from query
  const tables = extractAffectedTables(query);
  if (!tables) return null;

  try {
    const db = await dbManager.getUserDb(dbPath);
    const snapshot = {};

    for (const table of tables.split(',')) {
      const tableName = table.trim();
      const rows = await dbManager.getUserRows(db, `SELECT * FROM "${tableName}" LIMIT 100`);
      snapshot[tableName] = rows;
    }

    await dbManager.closeDb(db);
    return snapshot;
  } catch (error) {
    console.error('Snapshot error:', error);
    return null;
  }
}

// Helper function to extract affected tables
function extractAffectedTables(query) {
  const upperQuery = query.toUpperCase();

  // Match table names after FROM, INTO, UPDATE keywords
  const patterns = [
    /FROM\s+["']?(\w+)["']?/gi,
    /INTO\s+["']?(\w+)["']?/gi,
    /UPDATE\s+["']?(\w+)["']?/gi,
    /JOIN\s+["']?(\w+)["']?/gi
  ];

  const tables = new Set();

  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(upperQuery)) !== null) {
      tables.add(match[1]);
    }
  });

  return Array.from(tables).join(',') || null;
}

module.exports = router;
