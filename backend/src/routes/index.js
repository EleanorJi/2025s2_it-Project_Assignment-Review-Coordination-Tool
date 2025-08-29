const express = require('express');
const router = express.Router();

// 导入子路由
const authRoutes = require('./auth');
const invitationRoutes = require('./invitations');

// 使用子路由
router.use('/auth', authRoutes);
router.use('/invitations', invitationRoutes);

module.exports = router;