const db = require('../config/database');
const { STATUS } = require('../config/constants');

exports.login = async (req, res) => {
  const { email, name, password } = req.body;

  if ((!email && !name) || !password) {
    return res.status(400).json({
      success: false,
      message: 'Please provide either email or name, and password.'
    });
  }

  if (email && name) {
    return res.status(400).json({
      success: false,
      message: 'Please provide either email or name, not both.'
    });
  }

  try {
    let userResult;
    let loginIdentifier;

    if (email) {
      loginIdentifier = email;
      userResult = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    } else {
      loginIdentifier = name;
      userResult = await db.query('SELECT * FROM users WHERE name = ?', [name]);
    }

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: `Authentication failed. User with ${email ? 'email' : 'name'} '${loginIdentifier}' not found.`
      });
    }

    const user = userResult.rows[0];

    if (user.status !== STATUS.ACTIVE) {
      return res.status(401).json({
        success: false,
        message: 'Account is not active. Please complete your registration.'
      });
    }

    if (user.password_hash !== password) {
      return res.status(401).json({
        success: false,
        message: 'Authentication failed. Invalid password.'
      });
    }

    await db.query(
      'UPDATE users SET last_login = datetime(\'now\') WHERE id = ?',
      [user.id]
    );

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
};

exports.getCurrentUser = async (req, res) => {
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
};