const crypto = require('crypto');
const db = require('../config/database');
const { INVITATION_EXPIRY_HOURS } = require('../config/constants');

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