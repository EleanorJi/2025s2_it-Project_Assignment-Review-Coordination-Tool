const transporter = require('../config/email');

class EmailService {
  /**
   * 发送邀请邮件
   * @param {string} to 收件人邮箱
   * @param {string} token 邀请令牌
   * @param {string} coordinatorName 协调员姓名
   */
  static async sendInvitationEmail(to, token, coordinatorName) {
    try {
      const websiteUrl = process.env.WEBSITE_URL || 'http://localhost:3000';
      const signupUrl = `${websiteUrl}/signup.html?token=${token}`;

      const mailOptions = {
        from: process.env.EMAIL_USER || 'hanyuj2@student.unimelb.edu.au',
        to: to,
        subject: '邀请您加入评分系统作为评分员',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
              .content { background-color: #f9f9f9; padding: 20px; }
              .button {
                display: inline-block;
                background-color: #4CAF50;
                color: white;
                padding: 12px 24px;
                text-decoration: none;
                border-radius: 4px;
                margin: 20px 0;
              }
              .footer {
                margin-top: 20px;
                padding: 20px;
                background-color: #f1f1f1;
                text-align: center;
                font-size: 12px;
                color: #666;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>评分系统邀请</h1>
              </div>
              <div class="content">
                <p>尊敬的评分员，</p>
                <p>您已被 <strong>${coordinatorName}</strong> 邀请加入我们的评分系统。</p>
                <p>请点击下面的链接完成注册：</p>
                <p style="text-align: center;">
                  <a href="${signupUrl}" class="button">完成注册</a>
                </p>
                <p>或者复制以下链接到浏览器中打开：</p>
                <p style="word-break: break-all; background-color: #eee; padding: 10px; border-radius: 4px;">
                  ${signupUrl}
                </p>
                <p><strong>请注意：</strong>此链接将在24小时后过期。</p>
                <p>如果您没有请求此邀请，请忽略此邮件。</p>
              </div>
              <div class="footer">
                <p>此邮件由评分系统自动发送，请勿回复。</p>
                <p>© ${new Date().getFullYear()} 评分系统. 保留所有权利.</p>
              </div>
            </div>
          </body>
          </html>
        `
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`邀请邮件已发送至: ${to}, 消息ID: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error('发送邮件失败:', error);
      throw new Error('发送邀请邮件失败');
    }
  }

  /**
   * 发送纯文本版本的邀请邮件（备用）
   */
  static async sendInvitationEmailText(to, token, coordinatorName) {
    try {
      const websiteUrl = process.env.WEBSITE_URL || 'http://localhost:3000';
      const signupUrl = `${websiteUrl}/signup.html?token=${token}`;

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: to,
        subject: '邀请您加入评分系统作为评分员',
        text: `
尊敬的评分员，

您已被 ${coordinatorName} 邀请加入我们的评分系统。

请使用以下链接完成注册：
${signupUrl}

请注意：此链接将在24小时后过期。

如果您没有请求此邀请，请忽略此邮件。

此邮件由评分系统自动发送，请勿回复。
© ${new Date().getFullYear()} 评分系统. 保留所有权利.
        `
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`纯文本邀请邮件已发送至: ${to}, 消息ID: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error('发送纯文本邮件失败:', error);
      throw new Error('发送邀请邮件失败');
    }
  }
}

module.exports = EmailService;