const express = require('express');
const router = express.Router();
const dbManager = require('../config/database');
const { authenticateToken, checkDatabaseAccess } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

// Get commit history
router.get('/:databaseId', authenticateToken, checkDatabaseAccess('viewer'), asyncHandler(async (req, res) => {
  const { databaseId } = req.params;
  const { limit = 50, offset = 0, userId, operationType } = req.query;

  let query = `
    SELECT c.*, u.username, u.email
    FROM commits c
    JOIN users u ON c.user_id = u.id
    WHERE c.database_id = ?
  `;

  const params = [databaseId];

  // Filter by user
  if (userId) {
    query += ' AND c.user_id = ?';
    params.push(userId);
  }

  // Filter by operation type
  if (operationType) {
    query += ' AND c.operation_type = ?';
    params.push(operationType);
  }

  query += ' ORDER BY c.timestamp DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const commits = await dbManager.getSystemRows(query, params);

  // Get total count
  let countQuery = 'SELECT COUNT(*) as total FROM commits WHERE database_id = ?';
  const countParams = [databaseId];

  if (userId) {
    countQuery += ' AND user_id = ?';
    countParams.push(userId);
  }

  if (operationType) {
    countQuery += ' AND operation_type = ?';
    countParams.push(operationType);
  }

  const { total } = await dbManager.getSystemRow(countQuery, countParams);

  res.json({
    commits,
    pagination: {
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
      hasMore: parseInt(offset) + commits.length < total
    }
  });
}));

// Get commit details
router.get('/:databaseId/commits/:commitId', authenticateToken, checkDatabaseAccess('viewer'), asyncHandler(async (req, res) => {
  const { databaseId, commitId } = req.params;

  const commit = await dbManager.getSystemRow(
    `SELECT c.*, u.username, u.email
     FROM commits c
     JOIN users u ON c.user_id = u.id
     WHERE c.id = ? AND c.database_id = ?`,
    [commitId, databaseId]
  );

  if (!commit) {
    return res.status(404).json({ error: 'Commit not found' });
  }

  // Parse snapshots
  if (commit.snapshot_before) {
    commit.snapshot_before = JSON.parse(commit.snapshot_before);
  }

  if (commit.snapshot_after) {
    commit.snapshot_after = JSON.parse(commit.snapshot_after);
  }

  res.json({ commit });
}));

// Get commit statistics
router.get('/:databaseId/stats', authenticateToken, checkDatabaseAccess('viewer'), asyncHandler(async (req, res) => {
  const { databaseId } = req.params;

  // Total commits
  const { totalCommits } = await dbManager.getSystemRow(
    'SELECT COUNT(*) as totalCommits FROM commits WHERE database_id = ?',
    [databaseId]
  );

  // Commits by operation type
  const operationStats = await dbManager.getSystemRows(
    `SELECT operation_type, COUNT(*) as count
     FROM commits
     WHERE database_id = ?
     GROUP BY operation_type
     ORDER BY count DESC`,
    [databaseId]
  );

  // Commits by user
  const userStats = await dbManager.getSystemRows(
    `SELECT u.username, u.email, COUNT(c.id) as commitCount
     FROM commits c
     JOIN users u ON c.user_id = u.id
     WHERE c.database_id = ?
     GROUP BY c.user_id
     ORDER BY commitCount DESC`,
    [databaseId]
  );

  // Recent activity (last 7 days)
  const recentActivity = await dbManager.getSystemRows(
    `SELECT DATE(timestamp) as date, COUNT(*) as count
     FROM commits
     WHERE database_id = ? AND timestamp >= datetime('now', '-7 days')
     GROUP BY DATE(timestamp)
     ORDER BY date DESC`,
    [databaseId]
  );

  // Most affected tables
  const tableStats = await dbManager.getSystemRows(
    `SELECT affected_tables, COUNT(*) as count, SUM(rows_affected) as totalRowsAffected
     FROM commits
     WHERE database_id = ? AND affected_tables IS NOT NULL
     GROUP BY affected_tables
     ORDER BY count DESC
     LIMIT 10`,
    [databaseId]
  );

  res.json({
    totalCommits,
    operationStats,
    userStats,
    recentActivity,
    tableStats
  });
}));

// Rollback to a specific commit (requires editor permission)
router.post('/:databaseId/rollback/:commitId', authenticateToken, checkDatabaseAccess('editor'), asyncHandler(async (req, res) => {
  const { databaseId, commitId } = req.params;

  // Get commit with snapshot
  const commit = await dbManager.getSystemRow(
    `SELECT * FROM commits WHERE id = ? AND database_id = ?`,
    [commitId, databaseId]
  );

  if (!commit) {
    return res.status(404).json({ error: 'Commit not found' });
  }

  if (!commit.snapshot_before) {
    return res.status(400).json({
      error: 'Cannot rollback: snapshot data not available for this commit'
    });
  }

  // Get database path
  const database = await dbManager.getSystemRow(
    'SELECT file_path FROM databases WHERE id = ?',
    [databaseId]
  );

  // Note: Full rollback implementation would require restoring snapshot data
  // This is a placeholder that logs the rollback intent
  await dbManager.runSystemQuery(
    `INSERT INTO commits (database_id, user_id, query_executed, operation_type, commit_message, affected_tables)
     VALUES (?, ?, ?, 'ROLLBACK', ?, ?)`,
    [
      databaseId,
      req.user.id,
      `ROLLBACK to commit ${commitId}`,
      `Rolled back to commit ${commitId} by ${req.user.username}`,
      commit.affected_tables
    ]
  );

  res.json({
    message: 'Rollback initiated',
    warning: 'Full rollback functionality requires manual data restoration',
    commit: {
      id: commit.id,
      timestamp: commit.timestamp,
      affectedTables: commit.affected_tables
    }
  });
}));

module.exports = router;
