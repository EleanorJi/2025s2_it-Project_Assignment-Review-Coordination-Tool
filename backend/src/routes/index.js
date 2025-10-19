const express = require('express');
const router = express.Router();

// Import sub-routes
const authRoutes = require('./auth');
const invitationRoutes = require('./invitations');
const uploadRoutes = require('./uploads_v2');
const feedbackRoutes = require('./feedback1');

// Use sub-routes
router.use('/auth', authRoutes);
router.use('/invitations', invitationRoutes);
router.use('/uploads', uploadRoutes);
router.use('/feedback', feedbackRoutes);

module.exports = router;