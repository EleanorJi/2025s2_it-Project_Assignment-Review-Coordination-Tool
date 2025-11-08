const transporter = require('../config/email');
const TemplateUtils = require('../utils/templateUtils');

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

      // 渲染HTML模板
      const html = await TemplateUtils.renderTemplate('./emailTemplates/invitation-email.html', {
        coordinatorName,
        signupUrl,
        currentYear: new Date().getFullYear()
      });

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: to,
        subject: 'Invitation to Join Assignment Moderation Tool as a Marker',
        html: html
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
     * 发送撤销通知邮件
     * @param {string} to 收件人邮箱
     */
    static async sendRevocationEmail(to) {
      try {
        // 渲染HTML模板
        const html = await TemplateUtils.renderTemplate('./emailTemplates/revocation-email.html', {
          currentYear: new Date().getFullYear()
        });

        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: to,
          subject: 'Correction Regarding Assignment Moderation Tool Invitation',
          html: html
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`撤销通知邮件已发送至: ${to}, 消息ID: ${info.messageId}`);
        return true;
      } catch (error) {
        console.error('发送撤销邮件失败:', error);
        throw new Error('发送撤销通知邮件失败');
      }
    }

}

module.exports = EmailService;