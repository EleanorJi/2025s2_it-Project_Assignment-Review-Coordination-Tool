const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authenticate = require('../middleware/auth');

router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.getCurrentUser);
// 新增忘记密码相关接口
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

module.exports = router;