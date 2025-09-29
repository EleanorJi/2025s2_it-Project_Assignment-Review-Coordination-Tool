// routes/dashboard.js
const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const validateProjectId = require('../middleware/projectValidation');
const dashboardController = require('../controllers/dashboardController');

// 保护 Coordinator Dashboard
router.get('/coordinator', authenticate, dashboardController.getCoordinatorDashboard);
router.get('/coordinator/invite', authenticate, dashboardController.getCoordinatorInvitePage);
router.get('/coordinator/feedback', authenticate, dashboardController.getCoordinatorFeedbackPage);
router.get('/coordinator/mark', authenticate, dashboardController.getCoordinatorMarkPage);
router.get('/coordinator/analysis', authenticate, dashboardController.getCoordinatorAnalysisPage);
router.get('/coordinator/taskManagement', authenticate, dashboardController.getCoordinatorTaskManagementPage);
router.get('/coordinator/rubric', authenticate, dashboardController.getCoordinatorViewRubricPage);
router.get('/coordinator/past', authenticate, dashboardController.getCoordinatorPastPage);
// 保护 Marker Dashboard
router.get('/marker', authenticate, dashboardController.getMarkerDashboard);
router.get('/marker/taskManagement', authenticate, dashboardController.getMarkerTaskManagementPage);
router.get('/marker/mark', authenticate, dashboardController.getMarkerMarkPage);
router.get('/marker/rubric', authenticate, dashboardController.getMarkerViewRubricPage);
router.get('/marker/past-task', authenticate, dashboardController.getMarkerPastTaskPage);

// 通用的dashboard入口，根据用户角色自动重定向
router.get('/', authenticate, dashboardController.redirectToRoleDashboard);

module.exports = router;