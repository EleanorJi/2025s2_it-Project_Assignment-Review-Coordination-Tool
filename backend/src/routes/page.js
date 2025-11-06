const express = require('express');
const router = express.Router();
const path = require('path');
const db = require('../config/database');

const dashboardRoutes = require('./dashboard');

router.use('/dashboard', dashboardRoutes);

router.get('/login', (req, res) => {
  // Return HTML page to browser for rendering (keep route hidden)
  res.sendFile(path.join(__dirname, '../../frontend/login.html'));
});

// Add invitation-based registration page route
router.get('/signup', async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).send('Invalid invitation token');
  }

  try {
    // Verify if token is valid (consistent with logic in invitationController)
    const result = await db.query(
      'SELECT * FROM invitations WHERE token = $1 AND used_at IS NULL AND expires_at > NOW()',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).send('Invalid or expired invitation token');
    }

    // Token is valid, send registration page
    res.sendFile(path.join(__dirname, '../../frontend/signup.html'));
  } catch (error) {
    console.error('Signup page error:', error);
    res.status(500).send('Internal server error');
  }
});

// forgot and reset password pages for users
router.get('/reset-password', async (req, res) => {
  const { token } = req.query;

  // If token is provided, validate it (for forgot password flow)
  if (token) {
    try {
      // Verify if token is valid
      const userResult = await db.query(
        'SELECT user_id as id, reset_token_expiry FROM app_user WHERE reset_token = $1 AND reset_token_expiry > NOW()',
        [token]
      );

      if (userResult.rows.length === 0) {
        return res.status(400).send('Invalid or expired reset token');
      }

      // Send reset password page (with valid token)
      res.sendFile(path.join(__dirname, '../../frontend/reset-password.html'));
      return;
    } catch (error) {
      console.error('Reset password page error:', error);
      return res.status(500).send('Internal server error');
    }
  }

  // No token provided - allow access (for logged-in users to change password)
  // The frontend will check if user is logged in and show appropriate form
  res.sendFile(path.join(__dirname, '../../frontend/reset-password.html'));
});

router.get('/forgot-password', (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/forgot-password.html'));
});


module.exports = router;