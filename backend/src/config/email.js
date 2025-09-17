const nodemailer = require('nodemailer');

//console.log('Email.js 加载时 SENDGRID_API_KEY:', process.env.SENDGRID_API_KEY ? '存在' : '不存在');
//console.log('Email.js 加载时 EMAIL_USER:', process.env.EMAIL_USER ? '存在' : '不存在');

const transporter = nodemailer.createTransport({
  host: 'smtp.sendgrid.net',
  port: 587, // 使用 STARTTLS
  secure: false, // true for port 465, false for other ports
  auth: {
    user: 'apikey', // 神奇之处：这里用户名固定就是字符串 'apikey'
    pass: process.env.SENDGRID_API_KEY // SendGrid上的API Key
  }
});

module.exports = transporter;