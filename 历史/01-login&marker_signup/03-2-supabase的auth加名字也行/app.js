// app.js
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const app = express();
const port = 3000;

app.use(express.json());

// ==================== Supabase 初始化 ====================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ==================== helper function ====================
function extractUsernameFromEmail(email) {
  return email.split('@')[0];
}

// ==================== 中间件部分 ====================

// 使用 Supabase Auth 的身份验证中间件
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please provide a valid token.'
      });
    }

    const token = authHeader.substring(7);

    // 使用 Supabase 验证 token
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token.'
      });
    }

    // 从数据库获取完整的用户信息（包括自定义字段）
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      return res.status(401).json({
        success: false,
        message: 'User not found in database.'
      });
    }

    req.user = userData;
    next();

  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid token.'
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

// 1. Coordinator 邀请新Marker
app.post('/api/invitations', authenticate, requireCoordinator, async (req, res) => {
  const { email } = req.body;
  const createdBy = req.user.id;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'Email is required'
    });
  }

  try {
    // 检查邮箱是否已被注册（使用 Supabase Auth）
    const { data: authUser } = await supabase.auth.admin.getUserByIdentifier(email);

    // 检查邮箱是否已在用户表中
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    // 检查是否有未使用的邀请
    const { data: existingInvite } = await supabase
      .from('invitations')
      .select('*')
      .eq('email', email)
      .is('used_at', null)
      .single();

    if (authUser || existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists'
      });
    }
    if (existingInvite) {
      return res.status(400).json({
        success: false,
        message: 'Invitation already sent to this email'
      });
    }

    // 生成唯一令牌和设置过期时间（24小时）
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // 保存邀请到数据库
    const { data: invitation, error: inviteError } = await supabase
      .from('invitations')
      .insert([
        {
          email,
          token,
          created_by: createdBy,
          expires_at: expiresAt
        }
      ])
      .select()
      .single();

    if (inviteError) throw inviteError;

    console.log(`Coordinator ${req.user.name} invited ${email}. Token: ${token}`);

    res.json({
      success: true,
      message: 'Invitation sent successfully'
    });

  } catch (error) {
    console.error('Invitation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// 2. 验证邀请令牌的有效性
app.get('/api/verify-invite', async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({
      success: false,
      message: 'Token is required'
    });
  }

  try {
    const { data: invitation, error } = await supabase
      .from('invitations')
      .select('*')
      .eq('token', token)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !invitation) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired invitation token'
      });
    }

    res.json({
      success: true,
      message: 'Valid invitation',
      email: invitation.email
    });

  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// 3. Marker 使用令牌完成注册
app.post('/api/complete-signup', async (req, res) => {
  const { token, name, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({
      success: false,
      message: 'Token and password are required'
    });
  }

  if (!name) {
    return res.status(400).json({
      success: false,
      message: 'Name is required'
    });
  }

  try {
    // 验证令牌
    const { data: invitation, error: inviteError } = await supabase
      .from('invitations')
      .select(`
        *,
        coordinator:created_by (name)
      `)
      .eq('token', token)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (inviteError || !invitation) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired invitation token'
      });
    }

    // 使用 Supabase Auth 创建用户
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: invitation.email,
      password: password,
      options: {
        data: {
          name: name,
          role: 'marker'
        }
      }
    });

    if (authError) {
      return res.status(400).json({
        success: false,
        message: authError.message
      });
    }

    // 在 users 表中创建用户记录（存储额外信息）
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert([
        {
          id: authData.user.id,
          email: invitation.email,
          name: name,
          role: 'marker',
          status: 'active',
          created_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (userError) {
      // 如果用户创建失败，删除 auth 用户
      await supabase.auth.admin.deleteUser(authData.user.id);
      throw userError;
    }

    // 标记邀请为已使用
    await supabase
      .from('invitations')
      .update({ used_at: new Date().toISOString() })
      .eq('id', invitation.id);

    console.log(`New marker registered: ${name} (${invitation.email})`);

    res.json({
      success: true,
      message: 'Registration completed successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Registration error:', error);

    if (error.code === '23505') {
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

// 4. 登录 API - 支持邮箱或用户名登录
app.post('/api/login', async (req, res) => {
  const { email, name, password } = req.body;

  // 检查是否提供了登录标识和密码
  if ((!email && !name) || !password) {
    return res.status(400).json({
      success: false,
      message: 'Please provide either email or name, and password.'
    });
  }

  // 检查是否同时提供了email和name（二选一）
  if (email && name) {
    return res.status(400).json({
      success: false,
      message: 'Please provide either email or name, not both.'
    });
  }

  try {
    let loginEmail = email;

    // 如果提供的是用户名，先查询对应的邮箱
    if (name) {
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('email')
        .eq('name', name)
        .single();

      if (userError || !user) {
        return res.status(401).json({
          success: false,
          message: `Authentication failed. User with name '${name}' not found.`
        });
      }
      loginEmail = user.email;
    }

    // 使用 Supabase Auth 登录
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: password
    });

    if (authError) {
      return res.status(401).json({
        success: false,
        message: authError.message
      });
    }

    // 从数据库获取用户信息
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (userError || !user) {
      return res.status(401).json({
        success: false,
        message: 'User not found in database.'
      });
    }

    // 更新最后登录时间
    await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id);

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
      token: authData.session.access_token,
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

// 5. 获取当前用户信息
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
app.get('/api/health', async (req, res) => {
  try {
    // 测试数据库连接
    const { error } = await supabase.from('users').select('count').limit(1);

    res.json({
      success: true,
      message: 'Server and database are running',
      timestamp: new Date().toISOString(),
      database: error ? 'disconnected' : 'connected'
    });
  } catch (error) {
    res.json({
      success: true,
      message: 'Server is running but database may be disconnected',
      timestamp: new Date().toISOString(),
      database: 'disconnected'
    });
  }
});

app.listen(port, () => {
  console.log(`✅ Server is running on http://localhost:${port}`);
  console.log('📋 Available endpoints:');
  console.log('   POST /api/invitations    - Invite new marker (需要coordinator权限)');
  console.log('   GET  /api/verify-invite  - Verify invitation token');
  console.log('   POST /api/complete-signup - Complete registration (需要name和password)');
  console.log('   POST /api/login          - User login (email+password)');
  console.log('   GET  /api/me             - Get current user info (需要登录)');
  console.log('   GET  /api/health         - Health check');
  console.log('\n🔒 认证方式: 在请求头中添加 Authorization: Bearer <token>');
  console.log('\n📝 登录请求示例:');
  console.log('   { "email": "user@example.com", "password": "secret" }');
  console.log('\n⚠️  注意: 需要设置环境变量 SUPABASE_URL 和 SUPABASE_ANON_KEY');
});