const db = require('../config/database');
const { STATUS } = require('../config/constants');

const authenticate = async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'];

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please provide user ID in headers.'
      });
    }

    const userResult = await db.query('SELECT * FROM users WHERE id = ? AND status = ?',
      [userId, STATUS.ACTIVE]);

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