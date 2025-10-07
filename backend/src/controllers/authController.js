const crypto = require('crypto');
const db = require('../config/database');
const { ROLES } = require('../config/constants');
const EmailService = require('../services/emailService');

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

    if (user.password_hash !== password) {
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
    // 检查用户是否存在
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

    // 生成重置令牌
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1小时后过期

    // 保存重置令牌到数据库
    await db.query(
      'UPDATE app_user SET reset_token = $1, reset_token_expiry = $2 WHERE user_id = $3',
      [resetToken, resetTokenExpiry, user.id]
    );

    // 发送重置密码邮件
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

  if (newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 6 characters long.'
    });
  }

  try {
    // 查找有效的重置令牌
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

    // 更新密码并清除重置令牌
    await db.query(
      'UPDATE app_user SET password_hash = $1, reset_token = NULL, reset_token_expiry = NULL WHERE user_id = $2',
      [newPassword, user.id] // 注意：实际项目中应该对密码进行哈希处理
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