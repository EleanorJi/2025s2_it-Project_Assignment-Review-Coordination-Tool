const fs = require('fs').promises;
const path = require('path');

class TemplateUtils {
  /**
   * 加载并渲染HTML模板
   * @param {string} templateName 模板文件名
   * @param {Object} data 模板数据
   * @returns {Promise<string>} 渲染后的HTML
   */
  static async renderTemplate(templateName, data) {
    try {
      const templatePath = path.join(__dirname, '..', 'templates', templateName);
      let html = await fs.readFile(templatePath, 'utf8');

      // 替换所有模板变量
      Object.keys(data).forEach(key => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        html = html.replace(regex, data[key]);
      });

      return html;
    } catch (error) {
      console.error('模板渲染失败:', error);
      throw new Error('无法加载邮件模板');
    }
  }
}

module.exports = TemplateUtils;