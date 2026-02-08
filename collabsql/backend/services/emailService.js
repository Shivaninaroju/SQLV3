const nodemailer = require('nodemailer');
require('dotenv').config();

/**
 * Email Service for sending verification and password reset emails
 * Uses Gmail SMTP (free tier: 500 emails/day)
 */
class EmailService {
  constructor() {
    this.transporter = null;
    this.fromEmail = process.env.EMAIL_FROM || 'noreply@collabsql.com';
    this.appUrl = process.env.APP_URL || 'http://localhost:5173';
    this.initializeTransporter();
  }

  initializeTransporter() {
    // Gmail SMTP configuration
    const gmailUser = process.env.GMAIL_USER;
    const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

    if (!gmailUser || !gmailAppPassword) {
      console.warn('⚠️  Email service not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env');
      return;
    }

    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailAppPassword, // Use App Password, not regular password
      },
    });

    // Verify transporter configuration
    this.transporter.verify((error, success) => {
      if (error) {
        console.error('❌ Email service verification failed:', error.message);
      } else {
        console.log('✅ Email service ready to send emails');
      }
    });
  }

  /**
   * Send email verification link
   */
  async sendVerificationEmail(email, username, verificationToken) {
    if (!this.transporter) {
      console.log('Email service disabled - verification email not sent');
      return { success: false, message: 'Email service not configured' };
    }

    const verificationUrl = `${this.appUrl}/verify-email?token=${verificationToken}`;

    const mailOptions = {
      from: `"CollabSQL" <${this.fromEmail}>`,
      to: email,
      subject: 'Verify Your Email - CollabSQL',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Welcome to CollabSQL!</h1>
            </div>
            <div class="content">
              <p>Hi <strong>${username}</strong>,</p>

              <p>Thank you for signing up for CollabSQL! We're excited to have you on board.</p>

              <p>To complete your registration and start collaborating on databases, please verify your email address by clicking the button below:</p>

              <div style="text-align: center;">
                <a href="${verificationUrl}" class="button">Verify Email Address</a>
              </div>

              <p>Or copy and paste this link into your browser:</p>
              <p style="background: #e5e7eb; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 12px;">
                ${verificationUrl}
              </p>

              <p><strong>This link will expire in 24 hours.</strong></p>

              <p>If you didn't create an account with CollabSQL, you can safely ignore this email.</p>

              <p>Best regards,<br>The CollabSQL Team</p>
            </div>
            <div class="footer">
              <p>CollabSQL - Collaborative SQL Database Management</p>
              <p>This is an automated email, please do not reply.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`✅ Verification email sent to ${email}`);
      return { success: true, message: 'Verification email sent' };
    } catch (error) {
      console.error('❌ Failed to send verification email:', error.message);
      return { success: false, message: error.message };
    }
  }

  /**
   * Send password reset link
   */
  async sendPasswordResetEmail(email, username, resetToken) {
    if (!this.transporter) {
      console.log('Email service disabled - reset email not sent');
      return { success: false, message: 'Email service not configured' };
    }

    const resetUrl = `${this.appUrl}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: `"CollabSQL" <${this.fromEmail}>`,
      to: email,
      subject: 'Reset Your Password - CollabSQL',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; padding: 12px 30px; background: #ef4444; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .warning { background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px; margin: 20px 0; }
            .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 Password Reset Request</h1>
            </div>
            <div class="content">
              <p>Hi <strong>${username}</strong>,</p>

              <p>We received a request to reset the password for your CollabSQL account.</p>

              <p>To reset your password, click the button below:</p>

              <div style="text-align: center;">
                <a href="${resetUrl}" class="button">Reset Password</a>
              </div>

              <p>Or copy and paste this link into your browser:</p>
              <p style="background: #e5e7eb; padding: 10px; border-radius: 4px; word-break: break-all; font-size: 12px;">
                ${resetUrl}
              </p>

              <div class="warning">
                <strong>⚠️ Security Notice:</strong>
                <ul style="margin: 10px 0;">
                  <li>This link will expire in 1 hour</li>
                  <li>If you didn't request a password reset, please ignore this email</li>
                  <li>Your password will not change until you create a new one</li>
                </ul>
              </div>

              <p>If you continue to have problems, please contact support.</p>

              <p>Best regards,<br>The CollabSQL Team</p>
            </div>
            <div class="footer">
              <p>CollabSQL - Collaborative SQL Database Management</p>
              <p>This is an automated email, please do not reply.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`✅ Password reset email sent to ${email}`);
      return { success: true, message: 'Password reset email sent' };
    } catch (error) {
      console.error('❌ Failed to send password reset email:', error.message);
      return { success: false, message: error.message };
    }
  }

  /**
   * Send welcome email after verification
   */
  async sendWelcomeEmail(email, username) {
    if (!this.transporter) {
      return { success: false, message: 'Email service not configured' };
    }

    const mailOptions = {
      from: `"CollabSQL" <${this.fromEmail}>`,
      to: email,
      subject: 'Welcome to CollabSQL! 🎉',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .feature { background: white; padding: 15px; margin: 10px 0; border-radius: 6px; border-left: 4px solid #667eea; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🚀 You're All Set!</h1>
            </div>
            <div class="content">
              <p>Hi <strong>${username}</strong>,</p>

              <p>Your email has been verified successfully! Welcome to CollabSQL - your collaborative SQL database management platform.</p>

              <h3>🎯 What you can do with CollabSQL:</h3>

              <div class="feature">
                <strong>📊 Upload & Manage Databases</strong><br>
                Upload SQLite databases and manage them with an intuitive interface
              </div>

              <div class="feature">
                <strong>💬 Natural Language Queries</strong><br>
                Ask questions in plain English and get SQL queries automatically
              </div>

              <div class="feature">
                <strong>👥 Collaborate in Real-Time</strong><br>
                Share databases with team members and work together
              </div>

              <div class="feature">
                <strong>📜 Track Changes</strong><br>
                View complete history of all database modifications
              </div>

              <div style="text-align: center;">
                <a href="${this.appUrl}/dashboard" class="button">Go to Dashboard</a>
              </div>

              <p>Need help getting started? Check out our documentation or contact support.</p>

              <p>Happy collaborating!<br>The CollabSQL Team</p>
            </div>
            <div class="footer">
              <p>CollabSQL - Collaborative SQL Database Management</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`✅ Welcome email sent to ${email}`);
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to send welcome email:', error.message);
      return { success: false };
    }
  }
}

module.exports = new EmailService();
