// routes/dashboard.js
const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const validateProjectId = require('../middleware/projectValidation');
const dashboardController = require('../controllers/dashboardController');

// Protect Coordinator Dashboard
router.get('/coordinator', authenticate, dashboardController.getCoordinatorDashboard);
router.get('/coordinator/invite', authenticate, dashboardController.getCoordinatorInvitePage);
router.get('/coordinator/feedback', authenticate, dashboardController.getCoordinatorFeedbackPage);
router.get('/coordinator/mark', authenticate, dashboardController.getCoordinatorMarkPage);
router.get('/coordinator/analysis', authenticate, dashboardController.getCoordinatorAnalysisPage);
router.get('/coordinator/taskManagement', authenticate, dashboardController.getCoordinatorTaskManagementPage);
router.get('/coordinator/rubric', authenticate, dashboardController.getCoordinatorViewRubricPage);
router.get('/coordinator/past', authenticate, dashboardController.getCoordinatorPastPage);
// Protect Marker Dashboard
router.get('/marker', authenticate, dashboardController.getMarkerDashboard);
router.get('/marker/taskManagement', authenticate, dashboardController.getMarkerTaskManagementPage);
router.get('/marker/mark', authenticate, dashboardController.getMarkerMarkPage);
router.get('/marker/rubric', authenticate, dashboardController.getMarkerViewRubricPage);
router.get('/marker/feedback', authenticate, dashboardController.getMarkerFeedbackPage);
router.get('/marker/past-task', authenticate, dashboardController.getMarkerPastTaskPage);

// Universal dashboard entry, automatically redirect based on user role
router.get('/', authenticate, dashboardController.redirectToRoleDashboard);

module.exports = router;