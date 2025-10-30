const db = require('../config/database');

// Get user profile
exports.getProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const userResult = await db.query(
      `SELECT 
        user_id as id,
        name,
        email,
        role,
        is_active as status,
        last_login
      FROM app_user 
      WHERE user_id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];
    
    // Get user statistics based on role
    let statistics = {};
    
    if (user.role === 'MARKER') {
      // Get marker statistics
      const statsResult = await db.query(
        `SELECT 
          COUNT(DISTINCT ms.assignment_id) as total_tasks,
          COUNT(CASE WHEN ms.created_at IS NOT NULL THEN 1 END) as completed_tasks,
          COUNT(CASE WHEN ms.created_at IS NULL AND a.due_at > NOW() THEN 1 END) as pending_tasks,
          COUNT(DISTINCT f.feedback_id) as feedback_received
        FROM assignment a
        LEFT JOIN marker_score ms ON a.assignment_id = ms.assignment_id AND ms.marker_id = $1
        LEFT JOIN feedback f ON a.assignment_id = f.assignment_id AND f.marker_id = $1
        WHERE a.is_published = true`,
        [userId]
      );
      
      statistics = statsResult.rows[0] || {
        total_tasks: 0,
        completed_tasks: 0,
        pending_tasks: 0,
        feedback_received: 0
      };
    } else if (user.role === 'COORDINATOR') {
      // Get coordinator statistics
      const statsResult = await db.query(
        `SELECT 
          COUNT(DISTINCT p.project_id) as total_projects,
          COUNT(DISTINCT CASE WHEN p.status = 'completed' THEN p.project_id END) as completed_projects,
          COUNT(DISTINCT i.id) as total_invitations,
          COUNT(DISTINCT CASE WHEN i.used_at IS NULL THEN i.id END) as pending_invitations
        FROM project p
        LEFT JOIN invitations i ON p.created_by = $1`,
        [userId]
      );
      
      statistics = statsResult.rows[0] || {
        total_projects: 0,
        completed_projects: 0,
        total_invitations: 0,
        pending_invitations: 0
      };
    }

    res.json({
      success: true,
      profile: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status ? 'Active' : 'Suspended',
        joined_date: user.last_login, // Using last_login as joined_date since created_at doesn't exist
        last_login: user.last_login,
        statistics: statistics
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, email } = req.body;

    if (!name && !email) {
      return res.status(400).json({
        success: false,
        message: 'At least one field (name or email) is required'
      });
    }

    // Check if email is already taken by another user
    if (email) {
      const emailCheck = await db.query(
        'SELECT user_id FROM app_user WHERE email = $1 AND user_id != $2',
        [email, userId]
      );

      if (emailCheck.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Email address is already in use by another account'
        });
      }
    }

    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name) {
      updates.push(`name = $${paramCount}`);
      values.push(name);
      paramCount++;
    }

    if (email) {
      updates.push(`email = $${paramCount}`);
      values.push(email);
      paramCount++;
    }

    values.push(userId);

    const updateQuery = `
      UPDATE app_user 
      SET ${updates.join(', ')}
      WHERE user_id = $${paramCount}
      RETURNING user_id as id, name, email, role, is_active as status, created_at, last_login
    `;

    const result = await db.query(updateQuery, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      message: 'Profile updated successfully',
      profile: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status ? 'Active' : 'Suspended',
        joined_date: user.created_at,
        last_login: user.last_login
      }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Change password
exports.changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long'
      });
    }

    // Get current user password
    const userResult = await db.query(
      'SELECT password_hash FROM app_user WHERE user_id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];

    // Verify current password
    if (user.password_hash !== currentPassword) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    await db.query(
      'UPDATE app_user SET password_hash = $1 WHERE user_id = $2',
      [newPassword, userId]
    );

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get user preferences
exports.getPreferences = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // For now, return default preferences
    // In the future, this could be stored in a user_preferences table
    const preferences = {
      theme: 'light',
      language: 'en',
      notifications: {
        email: true,
        dashboard: true
      }
    };

    res.json({
      success: true,
      preferences: preferences
    });

  } catch (error) {
    console.error('Get preferences error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update user preferences
exports.updatePreferences = async (req, res) => {
  try {
    const userId = req.user.id;
    const { theme, language, notifications } = req.body;

    // For now, just return success
    // In the future, this could be stored in a user_preferences table
    const preferences = {
      theme: theme || 'light',
      language: language || 'en',
      notifications: notifications || {
        email: true,
        dashboard: true
      }
    };

    res.json({
      success: true,
      message: 'Preferences updated successfully',
      preferences: preferences
    });

  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};
