const jwt = require('jsonwebtoken');
const db = require('../config/database');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. No token provided.'
      });
    }

    const token = authHeader.split(' ')[1];

    // 验证 JWT
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret');
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token.'
      });
    }

    // 从数据库再查一遍，确保用户还存在且是 active
    const userResult = await db.query(
      'SELECT user_id as id, name, email, role, is_active as status, last_login FROM app_user WHERE user_id = $1 AND is_active = true',
      [decoded.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'User not found or inactive.'
      });
    }

    req.user = userResult.rows[0];
    next();

  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication error.'
    });
  }
};

module.exports = authenticate;