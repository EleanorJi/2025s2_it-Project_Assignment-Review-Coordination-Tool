const db = require('../config/database');

// Middleware: Validate if project ID exists
const validateProjectId = async (req, res, next) => {
  try {
    const projectId = req.query.project;

    // Check if project_id parameter exists
    if (!projectId) {
      return res.redirect('/dashboard/coordinator/taskManagement?error=no_project_selected');
    }

    // Check if the project exists in database
    const projectExists = await checkProjectInDatabase(projectId);

    if (!projectExists) {
      return res.redirect('/dashboard/coordinator/taskManagement?error=invalid_project_id');
    }

    // If project exists, continue to next middleware or controller
    next();
  } catch (error) {
    console.error('Error validating project ID:', error);
    return res.redirect('/dashboard/coordinator/taskManagement?error=server_error');
  }
};

// Database check function
async function checkProjectInDatabase(projectId) {
  try {
    // Choose appropriate query method based on your database type

     const result = await db.query(
       'SELECT project_id FROM project WHERE project_id = $1',
       [projectId]
     );
     console.log(`Project ID ${projectId} query result:`, result.rows);
     return result.rows.length > 0;

  } catch (error) {
    console.error('Database query error:', error);
    return false;
  }
}

module.exports = validateProjectId;