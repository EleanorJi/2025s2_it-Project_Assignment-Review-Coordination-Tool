const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // SQLite 约束错误
  if (err.code === 'SQLITE_CONSTRAINT') {
    if (err.message.includes('email')) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    } else if (err.message.includes('name')) {
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