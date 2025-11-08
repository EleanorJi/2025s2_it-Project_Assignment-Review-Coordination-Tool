const fs = require('fs').promises;
const path = require('path');

class TemplateUtils {
  /**
   * Load and render HTML template
   * @param {string} templateName Template file name
   * @param {Object} data Template data
   * @returns {Promise<string>} Rendered HTML
   */
  static async renderTemplate(templateName, data) {
    try {
      const templatePath = path.join(__dirname, '..', 'templates', templateName);
      let html = await fs.readFile(templatePath, 'utf8');

      // Replace all template variables
      Object.keys(data).forEach(key => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        html = html.replace(regex, data[key]);
      });

      return html;
    } catch (error) {
      console.error('Template rendering failed:', error);
      throw new Error('Unable to load email template');
    }
  }
}

module.exports = TemplateUtils;