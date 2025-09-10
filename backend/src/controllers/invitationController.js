const crypto = require('crypto');
const db = require('../config/database');
const { INVITATION_EXPIRY_HOURS } = require('../config/constants');
const EmailService = require('../services/emailService');

// 邀请一位评分员
exports.inviteMarker = async (req, res) => {
  const { email } = req.body;
  const createdBy = req.user.id;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'Email is required'
    });
  }

  try {
    const existingUser = await db.query('SELECT * FROM app_user WHERE email = $1', [email]);
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

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_HOURS * 60 * 60 * 1000);

    await db.query(
      'INSERT INTO invitations (email, token, created_by, expires_at) VALUES ($1, $2, $3, $4)',
      [email, token, createdBy, expiresAt]
    );

    console.log(`Coordinator ${req.user.name} invited ${email}. Token: ${token}`);

    // 发送邀请邮件
    try {
      await EmailService.sendInvitationEmail(email, token, req.user.name);
      console.log(`邀请邮件已成功发送至: ${email}`);
    } catch (emailError) {
      console.error('发送邮件失败，但邀请已创建:', emailError);
      // 即使邮件发送失败，也返回成功，但提示用户可能需要手动发送链接
      return res.json({
        success: true,
        message: 'Invitation created but email sending failed. Please manually send the registration link.',
        token: token // 返回token以便手动发送
      });
    }
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
};

// 验证 token
exports.verifyInvite = async (req, res) => {
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
};

exports.completeSignup = async (req, res) => {
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
    const inviteResult = await db.query(
      `SELECT i.*, u.name as coordinator_name
       FROM invitations i
       JOIN app_user u ON i.created_by = u.user_id
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

    const userResult = await db.query(
      `INSERT INTO app_user (email, name, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING user_id as id, email, name, role`,
      [invitation.email, name, password, 'MARKER', true] // ⚠️ 密码应该加密
    );

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
    throw error;
  }
};

// 批量邀请
exports.inviteMarkersBatch = async (req, res) => {
  const { emails } = req.body;
  const createdBy = req.user.id;

  if (!Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ success: false, message: 'Emails are required' });
  }

  try {
    const results = [];

    for (const email of emails) {
      // 跳过空值
      if (!email) {
        results.push({ email, status: 'skipped', reason: 'Empty email' });
        continue;
      }

      // 检查是否已有用户
      const existingUser = await db.query('SELECT 1 FROM app_user WHERE email = $1', [email]);
      if (existingUser.rows.length > 0) {
        results.push({ email, status: 'skipped', reason: 'User already exists' });
        continue;
      }

      // 检查是否存在未过期的邀请
      const existingInvite = await db.query(
        'SELECT token, expires_at FROM invitations WHERE email = $1 AND used_at IS NULL AND expires_at > NOW()',
        [email]
      );

      if (existingInvite.rows.length > 0) {
        // 存在未过期的邀请，不需要重新生成token或发送邮件
        results.push({
          email,
          status: 'skipped',
          reason: 'Active invitation already exists',
          existingToken: existingInvite.rows[0].token,
          expiresAt: existingInvite.rows[0].expires_at
        });
        continue;
      }

      // 检查是否存在已过期的邀请
      const expiredInvite = await db.query(
        'SELECT id FROM invitations WHERE email = $1 AND used_at IS NULL AND expires_at <= NOW()',
        [email]
      );

      let token;
      if (expiredInvite.rows.length > 0) {
        // 更新已过期的邀请：生成新token和过期时间
        token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_HOURS * 60 * 60 * 1000);

        await db.query(
          'UPDATE invitations SET token = $1, expires_at = $2, created_by = $3, created_at = NOW() WHERE id = $4',
          [token, expiresAt, createdBy, expiredInvite.rows[0].id]
        );

        console.log(`Updated expired invitation for ${email}. New token: ${token}`);
      } else {
        // 创建全新的邀请
        token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_HOURS * 60 * 60 * 1000);

        await db.query(
          'INSERT INTO invitations (email, token, created_by, expires_at) VALUES ($1, $2, $3, $4)',
          [email, token, createdBy, expiresAt]
        );

        console.log(`Created new invitation for ${email}. Token: ${token}`);
      }

      // 发送邀请邮件
      try {
        await EmailService.sendInvitationEmail(email, token, req.user.name);
        console.log(`邀请邮件已成功发送至: ${email}`);
        results.push({
          email,
          status: expiredInvite.rows.length > 0 ? 'renewed' : 'invited',
          emailSent: true
        });
      } catch (emailError) {
        console.error(`发送邮件至 ${email} 失败:`, emailError);
        results.push({
          email,
          status: expiredInvite.rows.length > 0 ? 'renewed' : 'invited',
          emailSent: false,
          token: token // 返回token以便手动发送
        });
      }
    }

    res.json({ success: true, results });
  } catch (error) {
    console.error('Batch invitation error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// 列表
exports.listInvitations = async (req, res) => {
  const createdBy = req.user.id; // 从 authenticate 拿到的 user.id
  try {
    const result = await db.query(
      `SELECT id, email,
              CASE
                WHEN used_at IS NOT NULL THEN 'accepted'
                WHEN expires_at < NOW() THEN 'expired'
                ELSE 'pending'
              END as status,
              to_char(created_at, 'Mon DD, YYYY') as sent_at
       FROM invitations
       WHERE created_by = $1
       ORDER BY created_at DESC`,
      [createdBy]
    );

    res.json({ items: result.rows });
  } catch (error) {
    console.error('List invitations error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};


// 重发
exports.resendInvite = async (req, res) => {
  const { email } = req.body;
  const createdBy = req.user.id;

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required' });
  }

  try {
    // 更新 token & expires_at
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_HOURS * 60 * 60 * 1000);

    const result = await db.query(
      `UPDATE invitations
       SET token = $1, expires_at = $2, created_by = $3, created_at = NOW()
       WHERE email = $4 AND used_at IS NULL
       RETURNING id`,
      [token, expiresAt, createdBy, email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Invitation not found' });
    }

    console.log(`Coordinator ${req.user.name} resent invite to ${email}. Token: ${token}`);

    // 发送新的邀请邮件
    try {
      await EmailService.sendInvitationEmail(email, token, req.user.name);
      console.log(`重新发送的邀请邮件已成功发送至: ${email}`);
      res.json({ success: true, message: 'Resent successfully' });
    } catch (emailError) {
      console.error('发送重新邀请邮件失败:', emailError);
      res.json({
        success: true,
        message: 'Invitation updated but email sending failed. Please manually send the registration link.',
        token: token
      });
    }
  } catch (error) {
    console.error('Resend error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// 撤销
exports.revokeInvite = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required' });
  }

  try {
    const result = await db.query(
      `UPDATE invitations
       SET used_at = NOW()   -- 相当于作废
       WHERE email = $1 AND used_at IS NULL
       RETURNING id`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Invitation not found or already used' });
    }

    console.log(`Revoked invitation for ${email}`);

    // 发送撤销通知邮件
    try {
      await EmailService.sendRevocationEmail(email);
      console.log(`撤销通知邮件已成功发送至: ${email}`);
    } catch (emailError) {
      console.error('发送撤销通知邮件失败:', emailError);
      // 即使邮件发送失败，也返回成功，因为邀请已被撤销
    }

    res.json({ success: true, message: 'Revoked successfully' });
  } catch (error) {
    console.error('Revoke error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

