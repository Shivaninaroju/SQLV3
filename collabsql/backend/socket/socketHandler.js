const jwt = require('jsonwebtoken');
const dbManager = require('../config/database');

module.exports = (io) => {
  // Middleware to authenticate socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Verify user exists
      const user = await dbManager.getSystemRow(
        'SELECT id, email, username FROM users WHERE id = ?',
        [decoded.userId]
      );

      if (!user) {
        return next(new Error('User not found'));
      }

      socket.userId = user.id;
      socket.username = user.username;
      socket.email = user.email;

      next();
    } catch (error) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.username} (${socket.id})`);

    // Join database room
    socket.on('join-database', async (databaseId) => {
      try {
        // Verify user has access to this database
        const permission = await dbManager.getSystemRow(
          'SELECT permission_level FROM database_permissions WHERE database_id = ? AND user_id = ?',
          [databaseId, socket.userId]
        );

        if (!permission) {
          socket.emit('error', { message: 'Access denied to this database' });
          return;
        }

        // Leave previous room if any
        const rooms = Array.from(socket.rooms).filter(room => room !== socket.id);
        rooms.forEach(room => socket.leave(room));

        // Join new room
        socket.join(`db-${databaseId}`);
        socket.currentDatabase = databaseId;

        // Record active session
        await dbManager.runSystemQuery(
          `INSERT INTO active_sessions (database_id, user_id, socket_id)
           VALUES (?, ?, ?)`,
          [databaseId, socket.userId, socket.id]
        );

        // Notify others in the room
        socket.to(`db-${databaseId}`).emit('user-joined', {
          userId: socket.userId,
          username: socket.username,
          timestamp: new Date().toISOString()
        });

        // Get current active users
        const activeUsers = await dbManager.getSystemRows(
          `SELECT DISTINCT u.id, u.username, u.email
           FROM active_sessions s
           JOIN users u ON s.user_id = u.id
           WHERE s.database_id = ?`,
          [databaseId]
        );

        socket.emit('joined-database', {
          databaseId,
          activeUsers,
          userPermission: permission.permission_level
        });

        console.log(`${socket.username} joined database ${databaseId}`);
      } catch (error) {
        console.error('Join database error:', error);
        socket.emit('error', { message: 'Failed to join database' });
      }
    });

    // Broadcast query execution
    socket.on('query-executed', async (data) => {
      try {
        const { databaseId, queryType, affectedTables, rowsAffected } = data;

        // Update last activity
        await dbManager.runSystemQuery(
          'UPDATE active_sessions SET last_activity = CURRENT_TIMESTAMP WHERE socket_id = ?',
          [socket.id]
        );

        // Broadcast to others in the room
        socket.to(`db-${databaseId}`).emit('database-updated', {
          userId: socket.userId,
          username: socket.username,
          queryType,
          affectedTables,
          rowsAffected,
          timestamp: new Date().toISOString()
        });

        console.log(`${socket.username} executed ${queryType} on database ${databaseId}`);
      } catch (error) {
        console.error('Query broadcast error:', error);
      }
    });

    // User is typing
    socket.on('typing', (databaseId) => {
      socket.to(`db-${databaseId}`).emit('user-typing', {
        userId: socket.userId,
        username: socket.username
      });
    });

    // User stopped typing
    socket.on('stop-typing', (databaseId) => {
      socket.to(`db-${databaseId}`).emit('user-stop-typing', {
        userId: socket.userId
      });
    });

    // Cursor position (optional feature for collaborative viewing)
    socket.on('cursor-move', (data) => {
      const { databaseId, position } = data;
      socket.to(`db-${databaseId}`).emit('cursor-update', {
        userId: socket.userId,
        username: socket.username,
        position
      });
    });

    // Heartbeat to keep session active
    socket.on('heartbeat', async () => {
      try {
        await dbManager.runSystemQuery(
          'UPDATE active_sessions SET last_activity = CURRENT_TIMESTAMP WHERE socket_id = ?',
          [socket.id]
        );
      } catch (error) {
        console.error('Heartbeat error:', error);
      }
    });

    // Leave database room
    socket.on('leave-database', async (databaseId) => {
      try {
        socket.leave(`db-${databaseId}`);

        // Remove active session
        await dbManager.runSystemQuery(
          'DELETE FROM active_sessions WHERE socket_id = ?',
          [socket.id]
        );

        // Notify others
        socket.to(`db-${databaseId}`).emit('user-left', {
          userId: socket.userId,
          username: socket.username,
          timestamp: new Date().toISOString()
        });

        console.log(`${socket.username} left database ${databaseId}`);
      } catch (error) {
        console.error('Leave database error:', error);
      }
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
      try {
        // Remove all active sessions for this socket
        const sessions = await dbManager.getSystemRows(
          'SELECT database_id FROM active_sessions WHERE socket_id = ?',
          [socket.id]
        );

        // Notify each room
        for (const session of sessions) {
          socket.to(`db-${session.database_id}`).emit('user-left', {
            userId: socket.userId,
            username: socket.username,
            timestamp: new Date().toISOString()
          });
        }

        // Clean up sessions
        await dbManager.runSystemQuery(
          'DELETE FROM active_sessions WHERE socket_id = ?',
          [socket.id]
        );

        console.log(`User disconnected: ${socket.username}`);
      } catch (error) {
        console.error('Disconnect cleanup error:', error);
      }
    });
  });

  // Periodic cleanup of stale sessions (every 5 minutes)
  setInterval(async () => {
    try {
      await dbManager.runSystemQuery(
        `DELETE FROM active_sessions
         WHERE datetime(last_activity) < datetime('now', '-5 minutes')`
      );
    } catch (error) {
      console.error('Session cleanup error:', error);
    }
  }, 5 * 60 * 1000);
};
