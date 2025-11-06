const bcrypt = require('bcrypt');

// Password encryption
const hashPassword = async (password) => {
  try {
    const saltRounds = 12; // Increase salt rounds for better security
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    return hashedPassword;
  } catch (error) {
    console.error('Error hashing password:', error);
    throw new Error('Failed to hash password');
  }
};

// Verify password
const comparePassword = async (password, hashedPassword) => {
  try {
    const isMatch = await bcrypt.compare(password, hashedPassword);
    return isMatch;
  } catch (error) {
    console.error('Error comparing password:', error);
    throw new Error('Failed to compare password');
  }
};

module.exports = {
  hashPassword,
  comparePassword
};
