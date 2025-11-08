// app.js
const express = require('express');
const db = require('./db');
const crypto = require('crypto');

const app = express();
const port = 3000;

app.use(express.json());

// ==================== 中间件部分 ====================

// 简单的身份验证中间件（简化版，实际应该用JWT）
const authenticate = async (req, res, next) => {
  try {
    // 假设我们从请求头中获取用户ID（实际应该从token验证获取）
    const userId = req.headers['x-user-id'];

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please provide user ID in headers.'
      });
    }

    // 查询用户信息
    const userResult = await db.query('SELECT * FROM users WHERE id = $1 AND status = $2',
      [userId, 'active']);

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid user or account not active.'
      });
    }

    // 将用户信息附加到请求对象中
    req.user = userResult.rows[0];
    next();

  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication error.'
    });
  }
};

// 检查用户角色是否为coordinator的中间件
const requireCoordinator = (req, res, next) => {
  if (req.user.role !== 'coordinator') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Coordinator role required.'
    });
  }
  next();
};

// ==================== API端点部分 ====================

// 1. Coordinator 邀请新Marker（现在有身份验证！）
app.post('/api/invitations', authenticate, requireCoordinator, async (req, res) => {
  const { email } = req.body;
  const createdBy = req.user.id; // 从认证中间件中获取当前用户ID

  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'Email is required'
    });
  }

  try {
    // 检查邮箱是否已被邀请或已注册
    const existingUser = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const existingInvite = await db.query(
      'SELECT * FROM invitations WHERE email = $1 AND used_at IS NULL',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'User already exists'
      });
    }
    if (existingInvite.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Invitation already sent to this email'
      });
    }

    // 生成唯一令牌和设置过期时间（24小时）
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // 保存邀请到数据库
    await db.query(
      'INSERT INTO invitations (email, token, created_by, expires_at) VALUES ($1, $2, $3, $4)',
      [email, token, createdBy, expiresAt]
    );

    console.log(`Coordinator ${req.user.name} invited ${email}. Token: ${token}`);

    res.json({
      success: true,
      message: 'Invitation sent successfully'
      // 实际生产中不应该返回token
    });

  } catch (error) {
    console.error('Invitation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// 2. 验证邀请令牌的有效性（不需要认证）
app.get('/api/verify-invite', async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({
      success: false,
      message: 'Token is required'
    });
  }

  try {
    const result = await db.query(
      'SELECT * FROM invitations WHERE token = $1 AND used_at IS NULL AND expires_at > NOW()',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired invitation token'
      });
    }

    res.json({
      success: true,
      message: 'Valid invitation',
      email: result.rows[0].email
    });

  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// 3. Marker 使用令牌完成注册（不需要认证）
app.post('/api/complete-signup', async (req, res) => {
  const { token, name, password } = req.body;

  if (!token || !name || !password) {
    return res.status(400).json({
      success: false,
      message: 'Token, name, and password are required'
    });
  }

  try {
    // 验证令牌
    const inviteResult = await db.query(
      `SELECT i.*, u.name as coordinator_name
       FROM invitations i
       JOIN users u ON i.created_by = u.id
       WHERE i.token = $1 AND i.used_at IS NULL AND i.expires_at > NOW()`,
      [token]
    );

    if (inviteResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired invitation token'
      });
    }

    const invitation = inviteResult.rows[0];

    // 创建用户（角色固定为'marker'）
    const userResult = await db.query(
      `INSERT INTO users (email, name, password_hash, role, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, name, role, created_at`,
      [invitation.email, name, password, 'marker', 'active'] // ⚠️ 密码应该加密
    );

    // 标记邀请为已使用
    await db.query(
      'UPDATE invitations SET used_at = NOW() WHERE id = $1',
      [invitation.id]
    );

    console.log(`New marker registered: ${name} (${invitation.email}) by coordinator: ${invitation.coordinator_name}`);

    res.json({
      success: true,
      message: 'Registration completed successfully',
      user: userResult.rows[0]
    });

  } catch (error) {
    console.error('Registration error:', error);

    // 检查是否是唯一约束冲突
    if (error.code === '23505') { // PostgreSQL unique violation
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// 4. 登录 API
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email and password are required.'
    });
  }

  try {
    // 根据邮箱查询用户
    const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Authentication failed. User not found.'
      });
    }

    const user = userResult.rows[0];

    // 检查用户状态
    if (user.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: 'Account is not active. Please complete your registration.'
      });
    }

    // 验证密码（明文对比，需要改为加密）
    if (user.password_hash !== password) {
      return res.status(401).json({
        success: false,
        message: 'Authentication failed. Invalid password.'
      });
    }

    // 更新最后登录时间
    await db.query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );

    // 返回用户信息（不返回密码）
    const userResponse = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      last_login: user.last_login
    };

    res.json({
      success: true,
      message: 'Login successful!',
      user: userResponse
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
});

// 5. 获取当前用户信息（需要认证）
app.get('/api/me', authenticate, async (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role,
      last_login: req.user.last_login
    }
  });
});

// 6. 健康检查端点
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

app.listen(port, () => {
  console.log(`✅ Server is running on http://localhost:${port}`);
  console.log('📋 Available endpoints:');
  console.log('   POST /api/invitations    - Invite new marker (需要coordinator权限)');
  console.log('   GET  /api/verify-invite  - Verify invitation token');
  console.log('   POST /api/complete-signup - Complete registration');
  console.log('   POST /api/login          - User login');
  console.log('   GET  /api/me             - Get current user info (需要登录)');
  console.log('   GET  /api/health         - Health check');
  console.log('\n🔒 认证方式: 在请求头中添加 x-user-id: <用户ID>');
});