const { body, validationResult } = require('express-validator');

// Validation middleware to check for errors
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// Registration validation rules
const validateRegistration = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('username')
    .isLength({ min: 3, max: 30 })
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username must be 3-30 characters and contain only letters, numbers, underscores, and hyphens'),
  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must be at least 8 characters with uppercase, lowercase, and number'),
  validate
];

// Login validation rules
const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  validate
];

// Database upload validation
const validateDatabaseUpload = [
  body('name')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Database name must be 1-100 characters'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
  validate
];

// Query validation
const validateQuery = [
  body('databaseId')
    .isInt()
    .withMessage('Valid database ID is required'),
  body('query')
    .notEmpty()
    .trim()
    .isLength({ min: 1, max: 5000 })
    .withMessage('Query must be 1-5000 characters'),
  validate
];

// Permission grant validation
const validatePermissionGrant = [
  body('userEmail')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('permissionLevel')
    .isIn(['editor', 'viewer'])
    .withMessage('Permission level must be either "editor" or "viewer"'),
  validate
];

module.exports = {
  validate,
  validateRegistration,
  validateLogin,
  validateDatabaseUpload,
  validateQuery,
  validatePermissionGrant
};
