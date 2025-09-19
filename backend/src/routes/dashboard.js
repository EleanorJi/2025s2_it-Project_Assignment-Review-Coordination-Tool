// routes/dashboard.js
const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const validateProjectId = require('../middleware/projectValidation');
const dashboardController = require('../controllers/dashboardController');

// 保护 Coordinator Dashboard
router.get('/coordinator', authenticate, dashboardController.getCoordinatorDashboard);
router.get('/coordinator/invite', authenticate, dashboardController.getCoordinatorInvitePage);
router.get('/coordinator/upload', authenticate, validateProjectId, dashboardController.getCoordinatorUploadPage);
router.get('/coordinator/feedback', authenticate, dashboardController.getCoordinatorFeedbackPage);
router.get('/coordinator/mark', authenticate, dashboardController.getCoordinatorMarkPage);
router.get('/coordinator/analysis', authenticate, dashboardController.getCoordinatorAnalysisPage);
router.get('/coordinator/taskManagement', authenticate, dashboardController.getCoordinatorTaskManagementPage);
router.get('/coordinator/past', authenticate, dashboardController.getCoordinatorPastPage);
// 保护 Marker Dashboard
router.get('/marker', authenticate, dashboardController.getMarkerDashboard);

// 通用的dashboard入口，根据用户角色自动重定向
router.get('/', authenticate, dashboardController.redirectToRoleDashboard);

module.exports = router;