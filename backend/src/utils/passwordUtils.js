const bcrypt = require('bcrypt');

// 密码加密
const hashPassword = async (password) => {
  try {
    const saltRounds = 12; // 增加salt rounds提高安全性
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    return hashedPassword;
  } catch (error) {
    console.error('Error hashing password:', error);
    throw new Error('Failed to hash password');
  }
};

// 验证密码
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
