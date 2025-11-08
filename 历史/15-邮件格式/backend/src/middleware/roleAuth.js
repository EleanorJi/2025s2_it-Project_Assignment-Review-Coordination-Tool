const { ROLES } = require('../config/constants');

const requireCoordinator = (req, res, next) => {
  // Gracefully handle missing auth to avoid 500
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.'
    });
  }

  if (req.user.role !== ROLES.COORDINATOR) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Coordinator role required.'
    });
  }
  next();
};

module.exports = {
  requireCoordinator
};