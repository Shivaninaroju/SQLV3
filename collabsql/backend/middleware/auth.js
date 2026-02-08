const jwt = require('jsonwebtoken');
const dbManager = require('../config/database');

// Verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
      if (err) {
        return res.status(403).json({ error: 'Invalid or expired token' });
      }

      // Verify user still exists and is active
      const user = await dbManager.getSystemRow(
        'SELECT id, email, username, is_active FROM users WHERE id = ?',
        [decoded.userId]
      );

      if (!user || !user.is_active) {
        return res.status(403).json({ error: 'User account not found or inactive' });
      }

      req.user = {
        id: user.id,
        email: user.email,
        username: user.username
      };

      next();
    });
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// Check database access permission
const checkDatabaseAccess = (requiredPermission = 'viewer') => {
  return async (req, res, next) => {
    try {
      const databaseId = req.params.databaseId || req.body.databaseId;
      const userId = req.user.id;

      if (!databaseId) {
        return res.status(400).json({ error: 'Database ID required' });
      }

      // Check if user has permission
      const permission = await dbManager.getSystemRow(
        `SELECT permission_level FROM database_permissions
         WHERE database_id = ? AND user_id = ?`,
        [databaseId, userId]
      );

      if (!permission) {
        return res.status(403).json({ error: 'Access denied to this database' });
      }

      // Permission hierarchy: owner > editor > viewer
      const permissionLevels = {
        'owner': 3,
        'editor': 2,
        'viewer': 1
      };

      const userLevel = permissionLevels[permission.permission_level] || 0;
      const requiredLevel = permissionLevels[requiredPermission] || 0;

      if (userLevel < requiredLevel) {
        return res.status(403).json({
          error: `Insufficient permissions. Required: ${requiredPermission}, You have: ${permission.permission_level}`
        });
      }

      req.userPermission = permission.permission_level;
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({ error: 'Permission verification failed' });
    }
  };
};

// Check if user is database owner
const checkDatabaseOwner = async (req, res, next) => {
  try {
    const databaseId = req.params.databaseId || req.body.databaseId;
    const userId = req.user.id;

    const database = await dbManager.getSystemRow(
      'SELECT owner_id FROM databases WHERE id = ?',
      [databaseId]
    );

    if (!database) {
      return res.status(404).json({ error: 'Database not found' });
    }

    if (database.owner_id !== userId) {
      return res.status(403).json({ error: 'Only the database owner can perform this action' });
    }

    next();
  } catch (error) {
    console.error('Owner check error:', error);
    res.status(500).json({ error: 'Owner verification failed' });
  }
};

module.exports = {
  authenticateToken,
  checkDatabaseAccess,
  checkDatabaseOwner
};
