require('dotenv').config({ path: 'backend/.env' });

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const apiRoutes = require('./routes/index');
const pageRoutes = require('./routes/page');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());

// 静态文件服务
app.use(express.static(path.join(__dirname, '../../frontend'))); // 前端静态文件

// 路由
app.use('/api', apiRoutes);
app.use('/', pageRoutes);

// 健康检查端点
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// 错误处理中间件
app.use(errorHandler);


// 在 app.js 中添加测试路由
app.get('/test-cookie', (req, res) => {
  console.log('收到的Cookies:', req.cookies);
  res.json({ cookies: req.cookies });
});

app.listen(port, () => {
  console.log(`✅ Server is running on http://localhost:${port}`);
  console.log('📋 Available endpoints:');
  console.log('   POST /api/auth/login          - User login');
  console.log('   GET  /api/auth/me             - Get current user info');
  console.log('   POST /api/invitations         - Invite new marker');
  console.log('   GET  /api/invitations/verify  - Verify invitation token');
  console.log('   POST /api/invitations/complete-signup - Complete registration');
  console.log('   GET  /api/health              - Health check');
  console.log('\n🔒 认证方式: 在请求头中添加 x-user-id: <用户ID>');
});

module.exports = app;