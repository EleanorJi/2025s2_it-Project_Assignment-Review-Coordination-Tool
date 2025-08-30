const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // PostgreSQL unique violation
  if (err.code === '23505') {
    if (err.detail && err.detail.includes('email')) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    } else if (err.detail && err.detail.includes('name')) {
      return res.status(400).json({
        success: false,
        message: 'User with this name already exists'
      });
    }
  }

  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
};

module.exports = errorHandler;