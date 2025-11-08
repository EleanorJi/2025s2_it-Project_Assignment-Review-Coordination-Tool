const crypto = require('crypto');
const db = require('../config/database');
const { INVITATION_EXPIRY_HOURS } = require('../config/constants');
const EmailService = require('../services/emailService');

// Invite a marker
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

    // Check if there's an unexpired invitation
    const existingActiveInvite = await db.query(
      'SELECT * FROM invitations WHERE email = $1 AND used_at IS NULL AND expires_at > NOW()',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'User already exists'
      });
    }

    if (existingActiveInvite.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Active invitation already exists for this email'
      });
    }

    // Check if there's an expired invitation
    const expiredInvite = await db.query(
      'SELECT * FROM invitations WHERE email = $1 AND used_at IS NULL AND expires_at <= NOW()',
      [email]
    );

    let token;
    let isRenewed = false;

    if (expiredInvite.rows.length > 0) {
      // Update expired invitation
      token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_HOURS * 60 * 60 * 1000);

      await db.query(
        'UPDATE invitations SET token = $1, expires_at = $2, created_by = $3, created_at = NOW() WHERE id = $4',
        [token, expiresAt, createdBy, expiredInvite.rows[0].id]
      );

      console.log(`Coordinator ${req.user.name} renewed invitation for ${email}. New token: ${token}`);
      isRenewed = true;
    } else {
      // Create brand new invitation
      token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_HOURS * 60 * 60 * 1000);

      await db.query(
        'INSERT INTO invitations (email, token, created_by, expires_at) VALUES ($1, $2, $3, $4)',
        [email, token, createdBy, expiresAt]
      );

      console.log(`Coordinator ${req.user.name} invited ${email}. Token: ${token}`);
    }

    // Send invitation email
    try {
      await EmailService.sendInvitationEmail(email, token, req.user.name);
      console.log(`Invitation email sent successfully to: ${email}`);

      res.json({
        success: true,
        message: isRenewed ? 'Invitation renewed and sent successfully' : 'Invitation sent successfully'
      });
    } catch (emailError) {
      console.error('Email sending failed, but invitation created:', emailError);
      // Even if email sending fails, return success but prompt user may need to manually send link
      return res.json({
        success: true,
        message: isRenewed ?
          'Invitation renewed but email sending failed. Please manually send the registration link.' :
          'Invitation created but email sending failed. Please manually send the registration link.',
        token: token // Return token for manual sending
      });
    }

  } catch (error) {
    console.error('Invitation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Verify token
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
      [invitation.email, name, password, 'MARKER', true] // TODO: Password should be encrypted
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

// Batch invitation
exports.inviteMarkersBatch = async (req, res) => {
  const { emails } = req.body;
  const createdBy = req.user.id;

  if (!Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ success: false, message: 'Emails are required' });
  }

  try {
    const results = [];

    for (const email of emails) {
      // Skip empty values
      if (!email) {
        results.push({ email, status: 'skipped', reason: 'Empty email' });
        continue;
      }

      // Check if user already exists
      const existingUser = await db.query('SELECT 1 FROM app_user WHERE email = $1', [email]);
      if (existingUser.rows.length > 0) {
        results.push({ email, status: 'skipped', reason: 'User already exists' });
        continue;
      }

      // Check if unexpired invitation exists
      const existingInvite = await db.query(
        'SELECT token, expires_at FROM invitations WHERE email = $1 AND used_at IS NULL AND expires_at > NOW()',
        [email]
      );

      if (existingInvite.rows.length > 0) {
        // Unexpired invitation exists, no need to regenerate token or send email
        results.push({
          email,
          status: 'skipped',
          reason: 'Active invitation already exists',
          existingToken: existingInvite.rows[0].token,
          expiresAt: existingInvite.rows[0].expires_at
        });
        continue;
      }

      // Check if expired invitation exists
      const expiredInvite = await db.query(
        'SELECT id FROM invitations WHERE email = $1 AND used_at IS NULL AND expires_at <= NOW()',
        [email]
      );

      let token;
      if (expiredInvite.rows.length > 0) {
        // Update expired invitation: generate new token and expiry time
        token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_HOURS * 60 * 60 * 1000);

        await db.query(
          'UPDATE invitations SET token = $1, expires_at = $2, created_by = $3, created_at = NOW() WHERE id = $4',
          [token, expiresAt, createdBy, expiredInvite.rows[0].id]
        );

        console.log(`Updated expired invitation for ${email}. New token: ${token}`);
      } else {
        // Create brand new invitation
        token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_HOURS * 60 * 60 * 1000);

        await db.query(
          'INSERT INTO invitations (email, token, created_by, expires_at) VALUES ($1, $2, $3, $4)',
          [email, token, createdBy, expiresAt]
        );

        console.log(`Created new invitation for ${email}. Token: ${token}`);
      }

      // Send invitation email
      try {
        await EmailService.sendInvitationEmail(email, token, req.user.name);
        console.log(`Invitation email sent successfully to: ${email}`);
        results.push({
          email,
          status: expiredInvite.rows.length > 0 ? 'renewed' : 'invited',
          emailSent: true
        });
      } catch (emailError) {
        console.error(`Email sending to ${email} failed:`, emailError);
        results.push({
          email,
          status: expiredInvite.rows.length > 0 ? 'renewed' : 'invited',
          emailSent: false,
          token: token // Return token for manual sending
        });
      }
    }

    res.json({ success: true, results });
  } catch (error) {
    console.error('Batch invitation error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// List invitations
exports.listInvitations = async (req, res) => {
  const createdBy = req.user.id;
  try {
    const result = await db.query(
      `WITH latest_invitations AS (
         SELECT DISTINCT ON (email) 
           id, email, expires_at, created_at,
           ROW_NUMBER() OVER (PARTITION BY email ORDER BY created_at DESC) as rn
         FROM invitations 
         WHERE created_by = $1
       )
       SELECT
         COALESCE('user_' || u.user_id, 'invitation_' || li.id) as id,
         COALESCE(u.email, li.email) as email,
         CASE
           WHEN u.user_id IS NOT NULL THEN
             CASE WHEN u.is_active = true THEN 'active' ELSE 'closed' END
           WHEN li.expires_at < NOW() AND NOT EXISTS (
             SELECT 1 FROM app_user u2 WHERE u2.email = li.email AND u2.role = 'MARKER'
           ) THEN 'expired'
           ELSE 'pending'
         END as status,
         to_char(COALESCE(u.last_login, li.created_at), 'Mon DD, YYYY') as sent_at
       FROM latest_invitations li
       FULL OUTER JOIN app_user u ON li.email = u.email AND u.role = 'MARKER'
       WHERE li.rn = 1 OR u.user_id IS NOT NULL
       ORDER BY sent_at DESC`,
      [createdBy]
    );
    console.log('Data returned to frontend:');
    result.rows.forEach((row, index) => {
      console.log(`Record ${index + 1}: email=${row.email}, status=${row.status}, sent_at=${row.sent_at}`);
    });

    res.json({ items: result.rows });
  } catch (error) {
    console.error('List invitations error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};


// Resend invitation
exports.resendInvite = async (req, res) => {
  const { email } = req.body;
  const createdBy = req.user.id;

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required' });
  }

  try {
    // Update token & expires_at
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

    // Send new invitation email
    try {
      await EmailService.sendInvitationEmail(email, token, req.user.name);
      console.log(`Resent invitation email sent successfully to: ${email}`);
      res.json({ success: true, message: 'Resent successfully' });
    } catch (emailError) {
      console.error('Resend invitation email failed:', emailError);
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

// Revoke invitation
exports.revokeInvite = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required' });
  }

  try {
    const result = await db.query(
      `UPDATE invitations
       SET used_at = NOW()   -- Mark as void
       WHERE email = $1 AND used_at IS NULL
       RETURNING id`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Invitation not found or already used' });
    }

    console.log(`Revoked invitation for ${email}`);

    // Send revocation notification email
    try {
      await EmailService.sendRevocationEmail(email);
      console.log(`Revocation notification email sent successfully to: ${email}`);
    } catch (emailError) {
      console.error('Send revocation notification email failed:', emailError);
      // Even if email sending fails, return success since invitation was revoked
    }

    res.json({ success: true, message: 'Revoked successfully' });
  } catch (error) {
    console.error('Revoke error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Close user
// Close user permissions
exports.closeUser = async (req, res) => {
  const { email } = req.body;
  const currentUserId = req.user.id; // From authenticate middleware user.id

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required' });
  }

  try {
    // Find user by email and check if they were invited by current coordinator
    const userCheck = await db.query(
      `SELECT u.user_id FROM app_user u
       JOIN invitations i ON u.email = i.email
       WHERE u.email = $1 AND u.role = 'MARKER' AND i.created_by = $2`,
      [email, currentUserId]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found or no permission to operate'
      });
    }

    // Update user status to closed
    const result = await db.query(
      `UPDATE app_user
       SET is_active = false, updated_at = NOW()
       WHERE email = $1 AND role = 'MARKER'
       RETURNING user_id as id, email, is_active as status`,
      [email]
    );

    console.log(`Coordinator ${req.user.name} closed user ${email}`);

    res.json({
      success: true,
      message: 'User permissions have been closed',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Close user error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Reopen user
exports.reopenUser = async (req, res) => {
  const { email } = req.body;
  const currentUserId = req.user.id;

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required' });
  }

  try {
    // Find user by email and check if they were invited by current coordinator
    const userCheck = await db.query(
      `SELECT u.user_id FROM app_user u
       JOIN invitations i ON u.email = i.email
       WHERE u.email = $1 AND u.role = 'MARKER' AND i.created_by = $2`,
      [email, currentUserId]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found or no permission to operate'
      });
    }

    // Update user status to active
    const result = await db.query(
      `UPDATE app_user
       SET is_active = true, updated_at = NOW()
       WHERE email = $1 AND role = 'MARKER'
       RETURNING user_id as id, email, is_active as status`,
      [email]
    );

    console.log(`Coordinator ${req.user.name} reopened user ${email}`);

    res.json({
      success: true,
      message: 'User permissions have been reopened',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Reopen user error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Get marker email suggestions
exports.getMarkerSuggestions = async (req, res) => {
  const { q } = req.query;
  const createdBy = req.user.id;

  if (!q || q.length < 2) {
    return res.json({ emails: [] });
  }

  try {
    // Search in existing markers from this coordinator's invitations
    const result = await db.query(
      `SELECT DISTINCT email FROM (
        SELECT email FROM app_user WHERE role = 'MARKER' AND email ILIKE $1
        UNION
        SELECT email FROM invitations WHERE created_by = $2 AND email ILIKE $1
      ) suggestions
      WHERE email NOT IN (
        SELECT email FROM app_user WHERE email = suggestions.email AND role != 'MARKER'
      )
      ORDER BY email
      LIMIT 10`,
      [`%${q}%`, createdBy]
    );

    const emails = result.rows.map(row => row.email);
    res.json({ emails });
  } catch (error) {
    console.error('Marker suggestions error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

