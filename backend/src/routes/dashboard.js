// routes/dashboard.js
const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const dashboardController = require('../controllers/dashboardController');

// 保护 Coordinator Dashboard
router.get('/coordinator', authenticate, dashboardController.getCoordinatorDashboard);
router.get('/coordinator/invite', authenticate, dashboardController.getCoordinatorInvitePage);
router.get('/coordinator/upload', authenticate, dashboardController.getCoordinatorUploadPage);

// 保护 Marker Dashboard
router.get('/marker', authenticate, dashboardController.getMarkerDashboard);

// 通用的dashboard入口，根据用户角色自动重定向
router.get('/', authenticate, dashboardController.redirectToRoleDashboard);

module.exports = router;