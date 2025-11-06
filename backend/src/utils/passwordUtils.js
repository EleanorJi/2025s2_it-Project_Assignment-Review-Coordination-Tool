const bcrypt = require('bcrypt');

// Password encryption
const hashPassword = async (password) => {
  try {
    const saltRounds = 12; // Increasing the number of salt rounds enhances security.
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    return hashedPassword;
  } catch (error) {
    console.error('Error hashing password:', error);
    throw new Error('Failed to hash password');
  }
};

// Password comparison
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
