const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.sendgrid.net',
  port: 587, // 使用 STARTTLS
  secure: false, // true for port 465, false for other ports
  auth: {
    user: 'apikey', // 神奇之处：这里用户名固定就是字符串 'apikey'
    pass: process.env.SENDGRID_API_KEY || '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' // 你的SendGrid API Key，千万不要直接写死在代码里！
  }
});

module.exports = transporter;