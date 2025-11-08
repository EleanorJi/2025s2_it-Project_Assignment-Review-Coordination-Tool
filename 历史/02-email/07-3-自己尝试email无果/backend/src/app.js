const express = require('express');
const path = require('path');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../../frontend')));

// 路由
app.use('/api', routes);

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
  console.log('\n📝 登录请求示例:');
  console.log('   { "email": "admin@grading.com", "password": "admin123" }');
  console.log('   { "name": "admin", "password": "admin123" }');
  console.log('📁 静态文件目录:', path.join(__dirname, '../../frontend'));
});

module.exports = app;