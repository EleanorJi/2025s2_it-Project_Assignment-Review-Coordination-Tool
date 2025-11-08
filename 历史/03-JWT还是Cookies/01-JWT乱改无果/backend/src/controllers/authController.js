const db = require('../config/database');
const { ROLES } = require('../config/constants');
const jwt = require('jsonwebtoken');

exports.login = async (req, res) => {
  const { email, name, password, rememberMe } = req.body;

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

    // 更新 last_login
    await db.query(
      'UPDATE app_user SET last_login = NOW() WHERE user_id = $1',
      [user.id]
    );

    // JWT 过期时间：记住我 -> 7d，否则 2h
    const expiresIn = rememberMe ? '7d' : '2h';
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'default_secret',  // 你要在 .env 配置 JWT_SECRET
      { expiresIn }
    );

    const userResponse = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      last_login: user.last_login
    };

    res.json({
      success: true,
      message: 'Login successful!',
      token,
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