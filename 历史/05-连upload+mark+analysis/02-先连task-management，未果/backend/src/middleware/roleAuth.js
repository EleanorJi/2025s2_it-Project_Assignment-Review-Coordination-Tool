const { ROLES } = require('../config/constants');

const requireCoordinator = (req, res, next) => {
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