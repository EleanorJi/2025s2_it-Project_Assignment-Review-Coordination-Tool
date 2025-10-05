const express = require('express');
const router = express.Router();
const path = require('path');
const db = require('../config/database');

const dashboardRoutes = require('./dashboard');

router.use('/dashboard', dashboardRoutes);

router.get('/login', (req, res) => {
  // 返回HTML页面给浏览器渲染（保持路由隐藏）
  res.sendFile(path.join(__dirname, '../../frontend/login.html'));
});

// 添加邀请式注册页面路由
router.get('/signup', async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).send('Invalid invitation token');
  }

  try {
    // 验证token是否有效（与invitationController中的逻辑一致）
    const result = await db.query(
      'SELECT * FROM invitations WHERE token = $1 AND used_at IS NULL AND expires_at > NOW()',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).send('Invalid or expired invitation token');
    }

    // token有效，发送注册页面
    res.sendFile(path.join(__dirname, '../../frontend/signup.html'));
  } catch (error) {
    console.error('Signup page error:', error);
    res.status(500).send('Internal server error');
  }
});

// forgot and reset password pages for users
router.get('/reset-password', async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).send('Invalid reset token');
  }

  try {
    // 验证token是否有效
    const userResult = await db.query(
      'SELECT user_id as id, reset_token_expiry FROM app_user WHERE reset_token = $1 AND reset_token_expiry > NOW()',
      [token]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).send('Invalid or expired reset token');
    }

    // 发送重置密码页面
    res.sendFile(path.join(__dirname, '../../frontend/reset-password.html'));
  } catch (error) {
    console.error('Reset password page error:', error);
    res.status(500).send('Internal server error');
  }
});

router.get('/forgot-password', (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/forgot-password.html'));
});


module.exports = router;