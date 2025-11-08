const nodemailer = require('nodemailer');

// 创建邮件传输器（使用Gmail示例，您可以根据需要配置其他邮件服务）
const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // 我们网页的邮箱
    pass: process.env.EMAIL_PASS  // 邮箱密码或应用专用密码
  }
});

// 也可以使用其他邮件服务配置，例如SMTP：
/*
const transporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: true, // 使用SSL
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});
*/

module.exports = transporter;