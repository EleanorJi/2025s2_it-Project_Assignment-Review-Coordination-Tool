const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const authenticate = require('../middleware/auth');

// Profile routes
router.get('/profile', authenticate, profileController.getProfile);
router.put('/profile', authenticate, profileController.updateProfile);
router.post('/change-password', authenticate, profileController.changePassword);
router.get('/preferences', authenticate, profileController.getPreferences);
router.put('/preferences', authenticate, profileController.updatePreferences);

module.exports = router;
