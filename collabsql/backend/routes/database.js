const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const dbManager = require('../config/database');
const schemaExtractor = require('../services/schemaExtractor');
const { authenticateToken, checkDatabaseAccess, checkDatabaseOwner } = require('../middleware/auth');
const { validateDatabaseUpload } = require('../middleware/validation');
const { asyncHandler } = require('../middleware/errorHandler');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_DIR || './uploads/databases';
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedExtensions = ['.db', '.sqlite', '.sqlite3'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only .db, .sqlite, and .sqlite3 files are allowed'));
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || 52428800) // 50MB default
  }
});

// Upload database
router.post('/upload', authenticateToken, upload.single('database'), validateDatabaseUpload, asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Database file is required' });
  }

  const { name, description } = req.body;
  const dbName = name || path.parse(req.file.originalname).name;
  const filePath = req.file.path;

  try {
    // Extract schema
    const schema = await schemaExtractor.extractSchema(filePath);

    // Save database metadata
    const result = await dbManager.runSystemQuery(
      `INSERT INTO databases (name, original_filename, file_path, owner_id, file_size, description)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [dbName, req.file.originalname, filePath, req.user.id, req.file.size, description || null]
    );

    const databaseId = result.lastID;

    // Grant owner permission
    await dbManager.runSystemQuery(
      `INSERT INTO database_permissions (database_id, user_id, permission_level, granted_by)
       VALUES (?, ?, 'owner', ?)`,
      [databaseId, req.user.id, req.user.id]
    );

    // Cache schema
    await dbManager.runSystemQuery(
      `INSERT INTO schema_cache (database_id, schema_json)
       VALUES (?, ?)`,
      [databaseId, JSON.stringify(schema)]
    );

    res.status(201).json({
      message: 'Database uploaded successfully',
      database: {
        id: databaseId,
        name: dbName,
        originalFilename: req.file.originalname,
        fileSize: req.file.size,
        tableCount: schema.tables.length,
        schema: schema
      }
    });
  } catch (error) {
    // Clean up uploaded file on error
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    throw error;
  }
}));

// Get user's databases
router.get('/list', authenticateToken, asyncHandler(async (req, res) => {
  const databases = await dbManager.getSystemRows(
    `SELECT d.id, d.name, d.original_filename, d.created_at, d.updated_at,
            d.file_size, d.description, dp.permission_level,
            u.username as owner_username
     FROM databases d
     JOIN database_permissions dp ON d.id = dp.database_id
     JOIN users u ON d.owner_id = u.id
     WHERE dp.user_id = ?
     ORDER BY d.updated_at DESC`,
    [req.user.id]
  );

  res.json({ databases });
}));

// Get database details
router.get('/:databaseId', authenticateToken, checkDatabaseAccess('viewer'), asyncHandler(async (req, res) => {
  const { databaseId } = req.params;

  // Get database info
  const database = await dbManager.getSystemRow(
    `SELECT d.*, u.username as owner_username, u.email as owner_email
     FROM databases d
     JOIN users u ON d.owner_id = u.id
     WHERE d.id = ?`,
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

  const schema = schemaCache ? JSON.parse(schemaCache.schema_json) : null;

  // Get collaborators
  const collaborators = await dbManager.getSystemRows(
    `SELECT u.id, u.username, u.email, dp.permission_level, dp.granted_at
     FROM database_permissions dp
     JOIN users u ON dp.user_id = u.id
     WHERE dp.database_id = ?
     ORDER BY dp.permission_level DESC, u.username`,
    [databaseId]
  );

  res.json({
    database: {
      ...database,
      schema,
      collaborators,
      userPermission: req.userPermission
    }
  });
}));

// Get database schema
router.get('/:databaseId/schema', authenticateToken, checkDatabaseAccess('viewer'), asyncHandler(async (req, res) => {
  const { databaseId } = req.params;
  const { refresh } = req.query;

  let schema;

  if (refresh === 'true') {
    // Re-extract schema
    const database = await dbManager.getSystemRow(
      'SELECT file_path FROM databases WHERE id = ?',
      [databaseId]
    );

    schema = await schemaExtractor.extractSchema(database.file_path);

    // Update cache
    await dbManager.runSystemQuery(
      'DELETE FROM schema_cache WHERE database_id = ?',
      [databaseId]
    );

    await dbManager.runSystemQuery(
      'INSERT INTO schema_cache (database_id, schema_json) VALUES (?, ?)',
      [databaseId, JSON.stringify(schema)]
    );
  } else {
    // Get from cache
    const schemaCache = await dbManager.getSystemRow(
      'SELECT schema_json FROM schema_cache WHERE database_id = ? ORDER BY cached_at DESC LIMIT 1',
      [databaseId]
    );

    schema = schemaCache ? JSON.parse(schemaCache.schema_json) : null;
  }

  res.json({ schema });
}));

// Get sample data from table
router.get('/:databaseId/table/:tableName/sample', authenticateToken, checkDatabaseAccess('viewer'), asyncHandler(async (req, res) => {
  const { databaseId, tableName } = req.params;
  const limit = parseInt(req.query.limit) || 5;

  const database = await dbManager.getSystemRow(
    'SELECT file_path FROM databases WHERE id = ?',
    [databaseId]
  );

  if (!database) {
    return res.status(404).json({ error: 'Database not found' });
  }

  const sampleData = await schemaExtractor.getSampleData(database.file_path, tableName, limit);

  res.json({
    tableName,
    sampleData,
    count: sampleData.length
  });
}));

// Delete database
router.delete('/:databaseId', authenticateToken, checkDatabaseOwner, asyncHandler(async (req, res) => {
  const { databaseId } = req.params;

  // Get file path
  const database = await dbManager.getSystemRow(
    'SELECT file_path FROM databases WHERE id = ?',
    [databaseId]
  );

  if (!database) {
    return res.status(404).json({ error: 'Database not found' });
  }

  // Delete file
  if (fs.existsSync(database.file_path)) {
    fs.unlinkSync(database.file_path);
  }

  // Delete from database (cascade will handle related records)
  await dbManager.runSystemQuery(
    'DELETE FROM databases WHERE id = ?',
    [databaseId]
  );

  res.json({ message: 'Database deleted successfully' });
}));

// Download database file
router.get('/:databaseId/download', authenticateToken, checkDatabaseAccess('viewer'), asyncHandler(async (req, res) => {
  const { databaseId } = req.params;

  // Get database info
  const database = await dbManager.getSystemRow(
    'SELECT file_path, original_filename FROM databases WHERE id = ?',
    [databaseId]
  );

  if (!database) {
    return res.status(404).json({ error: 'Database not found' });
  }

  // Check if file exists
  if (!fs.existsSync(database.file_path)) {
    return res.status(404).json({ error: 'Database file not found on server' });
  }

  // Send file for download
  res.download(database.file_path, database.original_filename, (err) => {
    if (err) {
      console.error('Download error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to download database' });
      }
    }
  });
}));

module.exports = router;
