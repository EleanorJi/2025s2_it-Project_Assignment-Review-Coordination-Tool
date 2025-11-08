const express = require('express');
const router = express.Router();
const path = require('path');

const dashboardRoutes = require('./dashboard');

router.use('/dashboard', dashboardRoutes);

router.get('/login', (req, res) => {
  // 返回 HTML 页面给浏览器渲染
  res.sendFile(path.join(__dirname, '../../../frontend/login.html'));
});

module.exports = router;