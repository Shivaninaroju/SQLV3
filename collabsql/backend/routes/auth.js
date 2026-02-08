const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const dbManager = require('../config/database');
const emailService = require('../services/emailService');
const { validateRegistration, validateLogin } = require('../middleware/validation');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticateToken } = require('../middleware/auth');

// Register new user
router.post('/register', validateRegistration, asyncHandler(async (req, res) => {
  const { email, username, password } = req.body;

  // Check if user already exists
  const existingUser = await dbManager.getSystemRow(
    'SELECT id FROM users WHERE email = ? OR username = ?',
    [email, username]
  );

  if (existingUser) {
    return res.status(409).json({
      error: 'User with this email or username already exists'
    });
  }

  // Hash password
  const saltRounds = 12;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  // Create user (auto-verified for now; enable email verification later by setting email_verified = 0)
  const result = await dbManager.runSystemQuery(
    `INSERT INTO users (email, username, password_hash, email_verified)
     VALUES (?, ?, ?, 1)`,
    [email, username, passwordHash]
  );

  // Generate JWT token so user can log in immediately
  const token = jwt.sign(
    { userId: result.lastID, email, username },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  res.status(201).json({
    message: 'Registration successful!',
    user: {
      id: result.lastID,
      email,
      username
    },
    token
  });
}));

// Login
router.post('/login', validateLogin, asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Find user
  const user = await dbManager.getSystemRow(
    'SELECT id, email, username, password_hash, is_active, email_verified FROM users WHERE email = ?',
    [email]
  );

  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  if (!user.is_active) {
    return res.status(403).json({ error: 'Account is inactive' });
  }

  // Verify password
  const isValidPassword = await bcrypt.compare(password, user.password_hash);

  if (!isValidPassword) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // Update last login
  await dbManager.runSystemQuery(
    'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
    [user.id]
  );

  // Generate JWT token
  const token = jwt.sign(
    { userId: user.id, email: user.email, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  res.json({
    message: 'Login successful',
    user: {
      id: user.id,
      email: user.email,
      username: user.username
    },
    token
  });
}));

// Get current user profile
router.get('/me', authenticateToken, asyncHandler(async (req, res) => {
  const user = await dbManager.getSystemRow(
    'SELECT id, email, username, created_at, last_login FROM users WHERE id = ?',
    [req.user.id]
  );

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({ user });
}));

// Verify token
router.get('/verify', authenticateToken, (req, res) => {
  res.json({
    valid: true,
    user: req.user
  });
});

// Logout (client-side token removal, but we can track it here)
router.post('/logout', authenticateToken, (req, res) => {
  res.json({ message: 'Logout successful' });
});

// Verify email with token
router.get('/verify-email/:token', asyncHandler(async (req, res) => {
  const { token } = req.params;

  // Find user with this verification token
  const user = await dbManager.getSystemRow(
    `SELECT id, email, username, verification_token_expires
     FROM users
     WHERE verification_token = ? AND email_verified = 0`,
    [token]
  );

  if (!user) {
    return res.status(400).json({ error: 'Invalid or expired verification token' });
  }

  // Check if token has expired
  const now = new Date();
  const expiry = new Date(user.verification_token_expires);

  if (now > expiry) {
    return res.status(400).json({
      error: 'Verification token has expired',
      expired: true
    });
  }

  // Mark email as verified
  await dbManager.runSystemQuery(
    `UPDATE users
     SET email_verified = 1, verification_token = NULL, verification_token_expires = NULL
     WHERE id = ?`,
    [user.id]
  );

  // Send welcome email
  await emailService.sendWelcomeEmail(user.email, user.username);

  // Generate JWT token for auto-login
  const jwtToken = jwt.sign(
    { userId: user.id, email: user.email, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  res.json({
    message: 'Email verified successfully!',
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      emailVerified: true
    },
    token: jwtToken
  });
}));

// Resend verification email
router.post('/resend-verification', asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  // Find user
  const user = await dbManager.getSystemRow(
    'SELECT id, email, username, email_verified FROM users WHERE email = ?',
    [email]
  );

  if (!user) {
    // Don't reveal if user exists
    return res.json({ message: 'If an account exists, a verification email has been sent' });
  }

  if (user.email_verified) {
    return res.status(400).json({ error: 'Email is already verified' });
  }

  // Generate new verification token
  const verificationToken = crypto.randomBytes(32).toString('hex');
  const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  // Update token
  await dbManager.runSystemQuery(
    `UPDATE users
     SET verification_token = ?, verification_token_expires = ?
     WHERE id = ?`,
    [verificationToken, tokenExpiry.toISOString(), user.id]
  );

  // Send verification email
  await emailService.sendVerificationEmail(user.email, user.username, verificationToken);

  res.json({ message: 'Verification email sent' });
}));

// Forgot password - send reset link
router.post('/forgot-password', asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  // Find user
  const user = await dbManager.getSystemRow(
    'SELECT id, email, username, email_verified FROM users WHERE email = ?',
    [email]
  );

  // Don't reveal if user exists (security best practice)
  if (!user) {
    return res.json({ message: 'If an account exists, a password reset link has been sent' });
  }

  // Check if email is verified
  if (!user.email_verified) {
    return res.status(400).json({
      error: 'Please verify your email before resetting password',
      requiresVerification: true
    });
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  const tokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  // Save reset token
  await dbManager.runSystemQuery(
    `UPDATE users
     SET reset_password_token = ?, reset_password_expires = ?
     WHERE id = ?`,
    [resetToken, tokenExpiry.toISOString(), user.id]
  );

  // Send reset email
  await emailService.sendPasswordResetEmail(user.email, user.username, resetToken);

  res.json({ message: 'If an account exists, a password reset link has been sent' });
}));

// Reset password with token
router.post('/reset-password', asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password are required' });
  }

  // Validate password strength
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  // Find user with this reset token
  const user = await dbManager.getSystemRow(
    `SELECT id, email, username, reset_password_expires
     FROM users
     WHERE reset_password_token = ?`,
    [token]
  );

  if (!user) {
    return res.status(400).json({ error: 'Invalid or expired reset token' });
  }

  // Check if token has expired
  const now = new Date();
  const expiry = new Date(user.reset_password_expires);

  if (now > expiry) {
    return res.status(400).json({
      error: 'Reset token has expired. Please request a new password reset.',
      expired: true
    });
  }

  // Hash new password
  const saltRounds = 12;
  const passwordHash = await bcrypt.hash(newPassword, saltRounds);

  // Update password and clear reset token
  await dbManager.runSystemQuery(
    `UPDATE users
     SET password_hash = ?, reset_password_token = NULL, reset_password_expires = NULL
     WHERE id = ?`,
    [passwordHash, user.id]
  );

  res.json({ message: 'Password reset successfully. You can now log in with your new password.' });
}));

module.exports = router;
