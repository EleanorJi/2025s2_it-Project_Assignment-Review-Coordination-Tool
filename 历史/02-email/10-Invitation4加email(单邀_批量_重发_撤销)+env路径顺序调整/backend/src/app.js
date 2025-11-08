require('dotenv').config({ path: 'backend/.env' });

const express = require('express');
const path = require('path');
const routes = require('./routes');
//const uploadRoutes = require('./routes/uploads'); // 新增上传路由
const errorHandler = require('./middleware/errorHandler');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// 静态文件服务
app.use(express.static(path.join(__dirname, '../../frontend'))); // 前端静态文件
//app.use('/static', express.static(path.join(__dirname, '../uploads'))); // 提交后文件的静态访问（用于预览）

// 路由
app.use('/api', routes);
//app.use('/api/uploads', uploadRoutes); // 上传相关路由

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
  console.log('   📁 Upload endpoints:');
  console.log('   POST /api/uploads/drafts      - Upload draft file');
  console.log('   DELETE /api/uploads/drafts/:tempName - Delete draft file');
  console.log('   POST /api/uploads/batch-commit - Batch commit files');
  console.log('   GET  /api/uploads/:id/download - Download file');
  console.log('   GET  /api/uploads/active-submission/:offering_id - Get active submission');
  console.log('   GET  /api/uploads/debug/temp-files - Debug temp files');
  console.log('\n🔒 认证方式: 在请求头中添加 x-user-id: <用户ID>');
//
//  // 验证环境变量内容和类型
//  console.log('=== 环境变量验证 ===');
//
//  // 验证DB_USER
//  console.log('DB_USER:');
//  console.log('  值:', process.env.DB_USER);
//  console.log('  类型:', typeof process.env.DB_USER);
//  console.log('  长度:', process.env.DB_USER ? process.env.DB_USER.length : 0);
//  console.log('  是否包含非法字符:', process.env.DB_USER && /[^a-zA-Z0-9\-_]/.test(process.env.DB_USER) ? '是' : '否');
//  console.log('');
//
//  // 验证DB_HOST
//  console.log('DB_HOST:');
//  console.log('  值:', process.env.DB_HOST);
//  console.log('  类型:', typeof process.env.DB_HOST);
//  console.log('  是否本地主机:', process.env.DB_HOST === 'localhost' ? '是' : '否');
//  console.log('');
//
//  // 验证DB_NAME
//  console.log('DB_NAME:');
//  console.log('  值:', process.env.DB_NAME);
//  console.log('  类型:', typeof process.env.DB_NAME);
//  console.log('  长度:', process.env.DB_NAME ? process.env.DB_NAME.length : 0);
//  console.log('');
//
//  // 验证DB_PASSWORD
//  console.log('DB_PASSWORD:');
//  console.log('  值:', process.env.DB_PASSWORD);
//  console.log('  类型:', typeof process.env.DB_PASSWORD);
//  console.log('  长度:', process.env.DB_PASSWORD ? process.env.DB_PASSWORD.length : 0);
//  console.log('');
//
//  // 验证DB_PORT
//  console.log('DB_PORT:');
//  console.log('  值:', process.env.DB_PORT);
//  console.log('  类型:', typeof process.env.DB_PORT);
//  console.log('  转换为数字:', Number(process.env.DB_PORT));
//  console.log('  是否为有效端口:', Number(process.env.DB_PORT) > 0 && Number(process.env.DB_PORT) < 65536 ? '是' : '否');
//  console.log('');
//
//  // 验证PORT
//  console.log('PORT:');
//  console.log('  值:', process.env.PORT);
//  console.log('  类型:', typeof process.env.PORT);
//  console.log('  转换为数字:', Number(process.env.PORT));
//  console.log('  是否为有效端口:', Number(process.env.PORT) > 0 && Number(process.env.PORT) < 65536 ? '是' : '否');
//  console.log('');
//
//  // 验证SENDGRID_API_KEY
//  console.log('SENDGRID_API_KEY:');
//  console.log('  值:', process.env.SENDGRID_API_KEY);
//  console.log('  类型:', typeof process.env.SENDGRID_API_KEY);
//  console.log('  长度:', process.env.SENDGRID_API_KEY ? process.env.SENDGRID_API_KEY.length : 0);
//  console.log('  是否以SG.开头:', process.env.SENDGRID_API_KEY && process.env.SENDGRID_API_KEY.startsWith('SG.') ? '是' : '否');
//  console.log('');
//
//  // 验证EMAIL_USER
//  console.log('EMAIL_USER:');
//  console.log('  值:', process.env.EMAIL_USER);
//  console.log('  类型:', typeof process.env.EMAIL_USER);
//  console.log('  长度:', process.env.EMAIL_USER ? process.env.EMAIL_USER.length : 0);
//  console.log('  是否为有效邮箱:', process.env.EMAIL_USER && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.EMAIL_USER) ? '是' : '否');
//  console.log('');
});

module.exports = app;