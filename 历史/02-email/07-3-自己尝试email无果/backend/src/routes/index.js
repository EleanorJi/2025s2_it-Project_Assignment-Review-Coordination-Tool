const express = require('express');
const router = express.Router();

const authRoutes = require('./auth');
const invitationRoutes = require('./invitations');

router.use('/auth', authRoutes);
router.use('/invitations', invitationRoutes);

module.exports = router;