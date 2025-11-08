// app.js
const express = require('express');
const db = require('./db'); // 导入我们刚刚写的数据库模块

const app = express();
const port = 3000;

app.use(express.json());

// 登录 API - 现在连接真实数据库了！
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: 'Username and password are required.'
    });
  }

  try {
    // 1. 根据用户名查询用户
    const userQuery = 'SELECT * FROM users WHERE username = $1';
    const userResult = await db.query(userQuery, [username]);

    // 2. 如果没找到用户
    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Authentication failed. User not found.'
      });
    }

    const user = userResult.rows[0];

    // 3. ⚠️ 验证密码（这里是明文对比，下一步必须改为加密验证！）
    if (user.password_hash !== password) { // 暂时假设密码是明文存储的
      return res.status(401).json({
        success: false,
        message: 'Authentication failed. Invalid password.'
      });
    }

    // 4. 登录成功！返回用户信息（不返回密码）
    const userResponse = {
      id: user.id,
      username: user.username,
      role: user.role,
      display_name: user.display_name
    };

    res.json({
      success: true,
      message: 'Login successful!',
      user: userResponse
    });

  } catch (error) {
    // 处理数据库查询错误
    console.error('Database error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
});

app.listen(port, () => {
  console.log(`✅ Server is running on http://localhost:${port}`);
});