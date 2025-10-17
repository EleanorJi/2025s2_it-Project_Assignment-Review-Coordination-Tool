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
      const signupUrl = `${websiteUrl}/signup?token=${token}`;

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
        const websiteUrl = process.env.WEBSITE_URL || 'http://localhost:3000';
        
        // Render HTML template
        const html = await TemplateUtils.renderTemplate('./emailTemplates/revocation-email.html', {
          WEBSITE_URL: websiteUrl,
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

  /**
     * Send password reset email
     * @param {string} to Recipient email address
     * @param {string} token Password reset token
     * @param {string} userName User name
     */
    static async sendPasswordResetEmail(to, token, userName) {
      try {
        const websiteUrl = process.env.WEBSITE_URL || 'http://localhost:3000';
        const resetUrl = `${websiteUrl}/reset-password?token=${token}`;

        // 渲染重置密码邮件模板
        const html = await TemplateUtils.renderTemplate('./emailTemplates/reset-password-email.html', {
          userName,
          resetUrl,
          currentYear: new Date().getFullYear()
        });

        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: to,
          subject: 'Reset Your Password - Assignment Moderation Tool',
          html: html
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`Password reset email sent to: ${to}, Message ID: ${info.messageId}`);
        return true;
      } catch (error) {
        console.error('Failed to send password reset email:', error);
        throw new Error('Failed to send password reset email');
      }
    }

  /**
   * Send feedback notification email to marker
   * @param {string} to Marker email address
   * @param {string} markerName Marker name
   * @param {string} coordinatorName Coordinator name
   * @param {string} assignmentName Assignment name
   * @param {string} projectName Project name
   * @param {number} projectId Project ID for URL
   * @param {number} assignmentId Assignment ID for URL
   * @param {string} [coordinatorEmail] Coordinator email for replyTo/from
   */
  static async sendFeedbackNotificationEmail(to, markerName, coordinatorName, assignmentName, projectName, projectId, assignmentId, coordinatorEmail) {
    try {
      const websiteUrl = process.env.WEBSITE_URL || 'http://localhost:3000';

      // Render HTML template
      const html = await TemplateUtils.renderTemplate('./emailTemplates/feedback-notification-email.html', {
        markerName,
        coordinatorName,
        assignmentName,
        projectName,
        WEBSITE_URL: websiteUrl,
        userRole: 'marker',
        feedbackDate: new Date().toLocaleDateString(),
        currentYear: new Date().getFullYear()
      });

      // 默认用平台已验证的发件邮箱，但显示名用协调员姓名；同时把回复地址指向协调员邮箱，便于直接回信
      const fromAddress = process.env.EMAIL_USER;
      const allowDynamicFrom = process.env.ALLOW_DYNAMIC_FROM === 'true';

      const mailOptions = {
        from: allowDynamicFrom && coordinatorEmail ? coordinatorEmail : `${coordinatorName || 'Coordinator'} <${fromAddress}>`,
        to: to,
        subject: `New Feedback Received - ${assignmentName}`,
        html: html,
        replyTo: coordinatorEmail || undefined
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`Feedback notification email sent to: ${to}, Message ID: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error('Failed to send feedback notification email:', error);
      throw new Error('Failed to send feedback notification email');
    }
  }

  /**
   * Send assignment deadline passed email to user
   * @param {string} to Recipient email address
   * @param {string} userName User name
   * @param {string} assignmentName Assignment name
   * @param {string} projectName Project name
   * @param {string} dueAt ISO string or localized string of deadline
   * @param {string} userRole User role (coordinator or marker)
   * @param {string} pendingSectionHtml Optional pending section HTML
   */
  static async sendAssignmentDeadlineEmail(to, userName, assignmentName, projectName, dueAt, userRole = 'marker', pendingSectionHtml = '') {
    try {
      const websiteUrl = process.env.WEBSITE_URL || 'http://localhost:3000';

      const html = await TemplateUtils.renderTemplate('./emailTemplates/deadline-passed-email.html', {
        userName,
        assignmentName,
        projectName,
        dueAt,
        pendingSection: pendingSectionHtml,
        WEBSITE_URL: websiteUrl,
        userRole: userRole,
        currentYear: new Date().getFullYear()
      });

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: to,
        subject: `Assignment Deadline Passed - ${projectName}: ${assignmentName}`,
        html: html
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`Deadline email sent to: ${to}, Message ID: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error('Failed to send assignment deadline email:', error);
      throw new Error('Failed to send assignment deadline email');
    }
  }

  /**
   * Send marking completed email to user
   * @param {string} to Recipient email address
   * @param {string} userName User name
   * @param {string} assignmentName Assignment name
   * @param {string} projectName Project name
   * @param {string} userRole User role (coordinator or marker)
   */
  static async sendMarkingCompletedEmail(to, userName, assignmentName, projectName, userRole = 'coordinator') {
    try {
      const websiteUrl = process.env.WEBSITE_URL || 'http://localhost:3000';

      const html = await TemplateUtils.renderTemplate('./emailTemplates/marking-completed-email.html', {
        userName,
        assignmentName,
        projectName,
        WEBSITE_URL: websiteUrl,
        userRole: userRole,
        currentYear: new Date().getFullYear()
      });

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: to,
        subject: `Marking Completed - ${projectName}: ${assignmentName}`,
        html: html
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`Marking completed email sent to: ${to}, Message ID: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error('Failed to send marking completed email:', error);
      throw new Error('Failed to send marking completed email');
    }
  }

  /**
   * Send due-soon (2 days left) reminder email to user
   * @param {string} to Recipient email address
   * @param {string} userName User name
   * @param {string} assignmentName Assignment name
   * @param {string} projectName Project name
   * @param {string} dueAt Formatted due time
   * @param {string} userRole User role (coordinator or marker)
   */
  static async sendDueSoonEmail(to, userName, assignmentName, projectName, dueAt, userRole = 'marker') {
    try {
      const websiteUrl = process.env.WEBSITE_URL || 'http://localhost:3000';

      const html = await TemplateUtils.renderTemplate('./emailTemplates/due-soon-email.html', {
        userName,
        assignmentName,
        projectName,
        dueAt,
        WEBSITE_URL: websiteUrl,
        userRole: userRole,
        currentYear: new Date().getFullYear()
      });

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: to,
        subject: `Due in 2 Days - ${projectName}: ${assignmentName}`,
        html: html
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`Due-soon email sent to: ${to}, Message ID: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error('Failed to send due-soon email:', error);
      throw new Error('Failed to send due-soon email');
    }
  }

  /**
   * Send new assignment notification email to marker
   * @param {string} to Marker email address
   * @param {string} markerName Marker name
   * @param {string} assignmentName Assignment name
   * @param {string} projectName Project name
   * @param {string} [dueAt] Optional due date
   */
  static async sendNewAssignmentNotification(to, markerName, assignmentName, projectName, dueAt = null) {
    try {
      const websiteUrl = process.env.WEBSITE_URL || 'http://localhost:3000';

      const html = await TemplateUtils.renderTemplate('./emailTemplates/new-assignment-notification-email.html', {
        markerName,
        assignmentName,
        projectName,
        dueAt,
        WEBSITE_URL: websiteUrl,
        userRole: 'marker',
        currentYear: new Date().getFullYear()
      });

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: to,
        subject: `New Assignment Published - ${projectName}`,
        html: html
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`New assignment notification email sent to: ${to}, Message ID: ${info.messageId}`);
      return true;
    } catch (error) {
      console.error('Failed to send new assignment notification email:', error);
      throw new Error('Failed to send new assignment notification email');
    }
  }

}

module.exports = EmailService;