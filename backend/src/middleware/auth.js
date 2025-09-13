const db = require('../config/database');

const authenticate = async (req, res, next) => {
  try {
    console.log('🔍 认证中间件被调用');
    console.log('📦 请求Cookies:', req.cookies);
    console.log('🆔 userId值:', req.cookies.userId);
    console.log('📍 请求路径:', req.path);
    // 从 Cookie 中获取 userId
    const userId = req.cookies.userId;

    if (!userId) {
      res.redirect('/login');
//      return res.status(401).json({
//        success: false,
//        message: 'Authentication required. Please log in again.'
//      });
    }

    const userResult = await db.query(
      'SELECT user_id as id, name, email, password_hash, role, is_active as status, last_login FROM app_user WHERE user_id = $1 AND is_active = true',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid user or account not active.'
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