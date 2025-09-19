const db = require('../config/database');

// 中间件：验证项目ID是否存在
const validateProjectId = async (req, res, next) => {
  try {
    const projectId = req.query.project;

    // 检查是否有 project_id 参数
    if (!projectId) {
      return res.redirect('/dashboard/coordinator/taskManagement?error=no_project_selected');
    }

    // 检查数据库中是否存在该项目
    const projectExists = await checkProjectInDatabase(projectId);

    if (!projectExists) {
      return res.redirect('/dashboard/coordinator/taskManagement?error=invalid_project_id');
    }

    // 如果项目存在，继续到下一个中间件或控制器
    next();
  } catch (error) {
    console.error('验证项目ID时出错:', error);
    return res.redirect('/dashboard/coordinator/taskManagement?error=server_error');
  }
};

// 数据库检查函数
async function checkProjectInDatabase(projectId) {
  try {
    // 根据你的数据库类型选择适当的查询方法

     const result = await db.query(
       'SELECT project_id FROM project WHERE project_id = $1',
       [projectId]
     );
     console.log(`项目ID ${projectId} 查询结果:`, result.rows);
     return result.rows.length > 0;

  } catch (error) {
    console.error('数据库查询错误:', error);
    return false;
  }
}

module.exports = validateProjectId;