const express = require('express');
const app = express();
const port = 3000; // 服务器将运行在 3000 端口

// 中间件：解析 JSON 请求体
app.use(express.json());

// 测试路由 - 验证服务器是否工作
app.get('/', (req, res) => {
  res.json({
    message: 'Grading System Backend is running!',
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

// 登录 API 端点
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  // 简单的模拟验证（后续要替换为真实验证）
  if (username === 'admin' && password === 'password') {
    res.json({
      success: true,
      message: 'Login successful!',
      user: {
        id: 1,
        username: 'admin',
        role: 'coordinator'
      }
    });
  } else {
    res.status(401).json({
      success: false,
      message: 'Invalid username or password'
    });
  }
});

// 启动服务器
app.listen(port, () => {
  console.log(`✅ Server is running on http://localhost:${port}`);
  console.log(`📋 API endpoints:`);
  console.log(`   GET  / - Health check`);
  console.log(`   POST /api/login - User login`);
});