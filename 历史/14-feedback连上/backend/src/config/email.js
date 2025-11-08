const nodemailer = require('nodemailer');

//console.log('Email.js loading SENDGRID_API_KEY:', process.env.SENDGRID_API_KEY ? 'exists' : 'not found');
//console.log('Email.js loading EMAIL_USER:', process.env.EMAIL_USER ? 'exists' : 'not found');

const transporter = nodemailer.createTransport({
  host: 'smtp.sendgrid.net',
  port: 587, // Use STARTTLS
  secure: false, // true for port 465, false for other ports
  auth: {
    user: 'apikey', // Fixed value: username is literally 'apikey'
    pass: process.env.SENDGRID_API_KEY // SendGrid API Key
  }
});

module.exports = transporter;