const transporter = require('../config/email');
const TemplateUtils = require('../utils/templateUtils');

class EmailService {
  /**
   * Send invitation email
   * @param {string} to Recipient email address
   * @param {string} token Invitation token
   * @param {string} coordinatorName Coordinator name
   */
  static async sendInvitationEmail(to, token, coordinatorName) {
    try {
      const websiteUrl = process.env.WEBSITE_URL || 'http://localhost:3000';
      const signupUrl = `${websiteUrl}/signup.html?token=${token}`;

      // Render HTML template
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
      console.log(`Invitation email sent to: ${to}, Message ID: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error('Failed to send email:', error);
      throw new Error('Failed to send invitation email');
    }
  }

    /**
     * Send revocation notification email
     * @param {string} to Recipient email address
     */
    static async sendRevocationEmail(to) {
      try {
        // Render HTML template
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
        console.log(`Revocation email sent to: ${to}, Message ID: ${info.messageId}`);
        return true;
      } catch (error) {
        console.error('Failed to send revocation email:', error);
        throw new Error('Failed to send revocation notification email');
      }
    }

}

module.exports = EmailService;