const express = require('express');
const router = express.Router();
const dbManager = require('../config/database');
const { authenticateToken, checkDatabaseAccess, checkDatabaseOwner } = require('../middleware/auth');
const { validatePermissionGrant } = require('../middleware/validation');
const { asyncHandler } = require('../middleware/errorHandler');

// Get collaborators for a database
router.get('/:databaseId/collaborators', authenticateToken, checkDatabaseAccess('viewer'), asyncHandler(async (req, res) => {
  const { databaseId } = req.params;

  const collaborators = await dbManager.getSystemRows(
    `SELECT u.id, u.username, u.email, dp.permission_level, dp.granted_at,
            granter.username as granted_by_username
     FROM database_permissions dp
     JOIN users u ON dp.user_id = u.id
     JOIN users granter ON dp.granted_by = granter.id
     WHERE dp.database_id = ?
     ORDER BY
       CASE dp.permission_level
         WHEN 'owner' THEN 1
         WHEN 'editor' THEN 2
         WHEN 'viewer' THEN 3
       END,
       u.username`,
    [databaseId]
  );

  res.json({ collaborators });
}));

// Add collaborator
router.post('/:databaseId/collaborators', authenticateToken, checkDatabaseOwner, validatePermissionGrant, asyncHandler(async (req, res) => {
  const { databaseId } = req.params;
  const { userEmail, permissionLevel } = req.body;

  // Find user by email
  const user = await dbManager.getSystemRow(
    'SELECT id, username, email FROM users WHERE email = ?',
    [userEmail]
  );

  if (!user) {
    return res.status(404).json({ error: 'User not found with this email' });
  }

  // Check if user already has access
  const existingPermission = await dbManager.getSystemRow(
    'SELECT id, permission_level FROM database_permissions WHERE database_id = ? AND user_id = ?',
    [databaseId, user.id]
  );

  if (existingPermission) {
    return res.status(409).json({
      error: 'User already has access to this database',
      currentPermission: existingPermission.permission_level
    });
  }

  // Grant permission
  await dbManager.runSystemQuery(
    `INSERT INTO database_permissions (database_id, user_id, permission_level, granted_by)
     VALUES (?, ?, ?, ?)`,
    [databaseId, user.id, permissionLevel, req.user.id]
  );

  res.status(201).json({
    message: 'Collaborator added successfully',
    collaborator: {
      id: user.id,
      username: user.username,
      email: user.email,
      permissionLevel
    }
  });
}));

// Update collaborator permission
router.put('/:databaseId/collaborators/:userId', authenticateToken, checkDatabaseOwner, asyncHandler(async (req, res) => {
  const { databaseId, userId } = req.params;
  const { permissionLevel } = req.body;

  if (!['editor', 'viewer'].includes(permissionLevel)) {
    return res.status(400).json({ error: 'Invalid permission level' });
  }

  // Check if permission exists
  const permission = await dbManager.getSystemRow(
    'SELECT id, permission_level FROM database_permissions WHERE database_id = ? AND user_id = ?',
    [databaseId, userId]
  );

  if (!permission) {
    return res.status(404).json({ error: 'Collaborator not found' });
  }

  if (permission.permission_level === 'owner') {
    return res.status(403).json({ error: 'Cannot modify owner permissions' });
  }

  // Update permission
  await dbManager.runSystemQuery(
    'UPDATE database_permissions SET permission_level = ? WHERE database_id = ? AND user_id = ?',
    [permissionLevel, databaseId, userId]
  );

  res.json({
    message: 'Permission updated successfully',
    permissionLevel
  });
}));

// Remove collaborator
router.delete('/:databaseId/collaborators/:userId', authenticateToken, checkDatabaseOwner, asyncHandler(async (req, res) => {
  const { databaseId, userId } = req.params;

  // Check if permission exists
  const permission = await dbManager.getSystemRow(
    'SELECT id, permission_level FROM database_permissions WHERE database_id = ? AND user_id = ?',
    [databaseId, userId]
  );

  if (!permission) {
    return res.status(404).json({ error: 'Collaborator not found' });
  }

  if (permission.permission_level === 'owner') {
    return res.status(403).json({ error: 'Cannot remove owner' });
  }

  // Remove permission
  await dbManager.runSystemQuery(
    'DELETE FROM database_permissions WHERE database_id = ? AND user_id = ?',
    [databaseId, userId]
  );

  res.json({ message: 'Collaborator removed successfully' });
}));

// Get active users (who's currently viewing the database)
router.get('/:databaseId/active', authenticateToken, checkDatabaseAccess('viewer'), asyncHandler(async (req, res) => {
  const { databaseId } = req.params;

  // Clean up old sessions (older than 5 minutes)
  await dbManager.runSystemQuery(
    `DELETE FROM active_sessions
     WHERE database_id = ? AND datetime(last_activity) < datetime('now', '-5 minutes')`,
    [databaseId]
  );

  // Get active users
  const activeUsers = await dbManager.getSystemRows(
    `SELECT DISTINCT u.id, u.username, u.email, s.last_activity
     FROM active_sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.database_id = ?
     ORDER BY s.last_activity DESC`,
    [databaseId]
  );

  res.json({ activeUsers });
}));

module.exports = router;
