const express = require('express');
const router = express.Router();

// 导入子路由
const authRoutes = require('./auth');
const invitationRoutes = require('./invitations');
const uploadRoutes = require('./uploads_v2');
const feedbackRoutes = require('./feedback');

// 使用子路由
router.use('/auth', authRoutes);
router.use('/invitations', invitationRoutes);
router.use('/uploads', uploadRoutes);
router.use('/feedback', feedbackRoutes);

module.exports = router;