const crypto = require('crypto');
const db = require('../config/database');
const { ROLES } = require('../config/constants');
const EmailService = require('../services/emailService');
const { hashPassword, comparePassword } = require('../utils/passwordUtils');

exports.login = async (req, res) => {
  const { email, name, password } = req.body;

  if ((!email && !name) || !password) {
    return res.status(400).json({
      success: false,
      message: 'Please provide either email or name, and password.'
    });
  }

  if (email && name) {
    return res.status(400).json({
      success: false,
      message: 'Please provide either email or name, not both.'
    });
  }

  try {
    let userResult;
    let loginIdentifier;

    if (email) {
      loginIdentifier = email;
      userResult = await db.query(
        'SELECT user_id as id, email, name, password_hash, role, is_active as status, last_login FROM app_user WHERE email = $1',
        [email]
      );
    } else {
      loginIdentifier = name;
      userResult = await db.query(
        'SELECT user_id as id, email, name, password_hash, role, is_active as status, last_login FROM app_user WHERE name = $1',
        [name]
      );
    }

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: `Authentication failed. User with ${email ? 'email' : 'name'} '${loginIdentifier}' not found.`
      });
    }

    const user = userResult.rows[0];

    if (!user.status) {
      return res.status(401).json({
        success: false,
        message: 'Account is not active. Please complete your registration.'
      });
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Authentication failed. Invalid password.'
      });
    }

    const updateResult = await db.query(
      'UPDATE app_user SET last_login = NOW() WHERE user_id = $1',
      [user.id]
    );

    const userResponse = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      last_login: user.last_login
    };

    // Set Cookie after successful login
    res.cookie('userId', user.id, {
    httpOnly: true,    // Prevent XSS
    secure: process.env.NODE_ENV === 'production', // TODO: Change NODE_ENV to 'production' for HTTPS later
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: 'strict'
    });

    res.json({
      success: true,
      message: 'Login successful!',
      user: userResponse
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
};

exports.logout = (req, res) => {
  res.clearCookie('userId');
  res.json({ success: true, message: 'Logged out successfully' });
};

exports.getCurrentUser = async (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role,
      last_login: req.user.last_login
    }
  });
};

exports.forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'Please provide an email address.'
    });
  }

  try {
    // Check if user exists
    const userResult = await db.query(
      'SELECT user_id as id, email, name, is_active as status FROM app_user WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User with this email address not found.'
      });
    }

    const user = userResult.rows[0];

    if (!user.status) {
      return res.status(401).json({
        success: false,
        message: 'Account is not active. Please complete your registration.'
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 1 * 60 * 60 * 1000); // Expires in 1 hour

    // Save reset token to database
    await db.query(
      'UPDATE app_user SET reset_token = $1, reset_token_expiry = $2 WHERE user_id = $3',
      [resetToken, resetTokenExpiry, user.id]
    );

    // Send password reset email
    await EmailService.sendPasswordResetEmail(user.email, resetToken, user.name);

    res.json({
      success: true,
      message: 'Password reset email sent successfully. Please check your email.'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
};

exports.resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({
      success: false,
      message: 'Reset token and new password are required.'
    });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 8 characters long.'
    });
  }

  try {
    // Find valid reset token
    const userResult = await db.query(
      'SELECT user_id as id, reset_token_expiry, is_active as status FROM app_user WHERE reset_token = $1 AND reset_token_expiry > NOW()',
      [token]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token.'
      });
    }

    const user = userResult.rows[0];

    if (!user.status) {
      return res.status(401).json({
        success: false,
        message: 'Account is not active.'
      });
    }

    // Encrypt new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password and clear reset token
    await db.query(
      'UPDATE app_user SET password_hash = $1, reset_token = NULL, reset_token_expiry = NULL WHERE user_id = $2',
      [hashedPassword, user.id]
    );

    res.json({
      success: true,
      message: 'Password reset successfully. You can now login with your new password.'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long'
      });
    }

    // Get current user password
    const userResult = await db.query(
      'SELECT password_hash FROM app_user WHERE user_id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];

    // Verify current password
    const isCurrentPasswordValid = await comparePassword(currentPassword, user.password_hash);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const hashedNewPassword = await hashPassword(newPassword);

    // Update password
    await db.query(
      'UPDATE app_user SET password_hash = $1 WHERE user_id = $2',
      [hashedNewPassword, userId]
    );

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};