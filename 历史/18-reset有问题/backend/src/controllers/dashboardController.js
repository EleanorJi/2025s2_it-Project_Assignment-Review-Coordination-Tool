// controllers/dashboardController.js
const path = require('path');
const db = require('../config/database');

exports.getCoordinatorDashboard = (req, res) => {
  // 额外检查角色权限
  if (req.user.role !== 'COORDINATOR') {
    return res.redirect('/login');
  }
  // 发送对应的HTML文件
  res.sendFile(path.join(__dirname, '../../../frontend/Coordinator/coordinator-dashboard.html'));
};

exports.getCoordinatorInvitePage = (req, res) => {
  // 检查角色权限
  if (req.user.role !== 'COORDINATOR') {
    return res.redirect('/login?error=access_denied');
  }

  // 发送对应的HTML文件
  res.sendFile(path.join(__dirname, '../../../frontend/Coordinator/invite.html'));
};

exports.getCoordinatorFeedbackPage = (req, res) => {
    // 检查角色权限
    if (req.user.role !== 'COORDINATOR') {
        return res.redirect('/login?error=access_denied');
    }
    // 发送对应的HTML文件
    res.sendFile(path.join(__dirname, '../../../frontend/Coordinator/feedback.html'));
}

exports.getCoordinatorTaskManagementPage = (req, res) => {
    // 检查角色权限
    if (req.user.role !== 'COORDINATOR') {
        return res.redirect('/login?error=access_denied');
    }

    // 发送对应的HTML文件
    res.sendFile(path.join(__dirname, '../../../frontend/Coordinator/task-management.html'));
}
exports.getCoordinatorViewRubricPage = (req, res) => {
    // 检查角色权限
    if (req.user.role !== 'COORDINATOR') {
        return res.redirect('/login?error=access_denied');
    }
    // 发送对应的HTML文件
    res.sendFile(path.join(__dirname, '../../../frontend/Coordinator/rubric.html'));
}

exports.getCoordinatorMarkPage = (req, res) => {
    // 检查角色权限
    if (req.user.role !== 'COORDINATOR') {
        return res.redirect('/login?error=access_denied');
    }
    // 发送对应的HTML文件
    res.sendFile(path.join(__dirname, '../../../frontend/Coordinator/mark-assignment.html'));
}

exports.getCoordinatorAnalysisPage = (req, res) => {
    // 检查角色权限
    if (req.user.role !== 'COORDINATOR') {
        return res.redirect('/login?error=access_denied');
    }
    // 发送对应的HTML文件
    res.sendFile(path.join(__dirname, '../../../frontend/Coordinator/feedback.html'));
}

exports.getCoordinatorPastPage = (req, res) => {
    // 检查角色权限
    if (req.user.role !== 'COORDINATOR') {
        return res.redirect('/login?error=access_denied');
    }

    // 发送对应的HTML文件
    res.sendFile(path.join(__dirname, '../../../frontend/Coordinator/past-assignment.html'));
}

exports.getMarkerDashboard = (req, res) => {
  if (req.user.role !== 'MARKER') {
    return res.redirect('/login');
  }
  res.sendFile(path.join(__dirname, '../../../frontend/Marker/marker-dashboard.html'));
};

exports.getMarkerTaskManagementPage = (req, res) => {
  if (req.user.role !== 'MARKER') {
    return res.redirect('/login?error=access_denied');
  }
  res.sendFile(path.join(__dirname, '../../../frontend/Marker/task-management.html'));
};

exports.getMarkerMarkPage = (req, res) => {
    // 检查角色权限
    if (req.user.role !== 'MARKER') {
        return res.redirect('/login?error=access_denied');
    }
    // 发送对应的HTML文件
    res.sendFile(path.join(__dirname, '../../../frontend/Coordinator/mark-assignment.html'));
}

exports.getMarkerViewRubricPage = (req, res) => {
    // 检查角色权限
    if (req.user.role !== 'MARKER') {
        return res.redirect('/login?error=access_denied');
    }
    // 发送对应的HTML文件
    res.sendFile(path.join(__dirname, '../../../frontend/Coordinator/rubric.html'));
}

exports.getMarkerFeedbackPage = (req, res) => {
    // 检查角色权限
    if (req.user.role !== 'MARKER') {
        return res.redirect('/login?error=access_denied');
    }
    // 发送对应的HTML文件
    res.sendFile(path.join(__dirname, '../../../frontend/Marker/view-feedback.html'));
}

exports.getMarkerPastTaskPage = (req, res) => {
  if (req.user.role !== 'MARKER') {
    return res.redirect('/login?error=access_denied');
  }
  res.sendFile(path.join(__dirname, '../../../frontend/Marker/past-task.html'));
};

exports.redirectToRoleDashboard = (req, res) => {
  switch (req.user.role) {
    case 'COORDINATOR':
      res.redirect('/dashboard/coordinator');
      break;
    case 'MARKER':
      res.redirect('/dashboard/marker');
      break;
    default:
      res.redirect('/login');
  }
};

exports.getMarkerConnectPage = (req, res) => {
  if (!req.user || req.user.role !== 'MARKER') {
    return res.redirect('/login?error=access_denied');
  }
  res.sendFile(
    require('path').join(__dirname, '../../../frontend/Marker/connect-marker.html')
  );
};

// API endpoints for dashboard data
exports.getCoordinatorDashboardData = async (req, res) => {
  try {
    if (req.user.role !== 'COORDINATOR') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get active projects count
    const activeProjectsResult = await db.query(`
      SELECT COUNT(*) as count FROM project WHERE status = 'active'
    `);
    const activeProjects = parseInt(activeProjectsResult.rows[0].count);

    // Get total markers count
    const markersResult = await db.query(`
      SELECT COUNT(*) as count FROM app_user WHERE role = 'MARKER'
    `);
    const totalMarkers = parseInt(markersResult.rows[0].count);

    // Get pending invitations count
    const pendingInvitationsResult = await db.query(`
      SELECT COUNT(*) as count FROM invitations WHERE used_at IS NULL AND expires_at > NOW()
    `);
    const pendingInvitations = parseInt(pendingInvitationsResult.rows[0].count);

    // Get completed assignments count
    const completedAssignmentsResult = await db.query(`
      SELECT COUNT(DISTINCT a.assignment_id) as count 
      FROM assignment a
      JOIN marker_score ms ON a.assignment_id = ms.assignment_id
      WHERE a.is_published = true
    `);
    const completedAssignments = parseInt(completedAssignmentsResult.rows[0].count);

    // Get recent assignments (only active projects)
    const recentAssignmentsResult = await db.query(`
      SELECT 
        a.assignment_id,
        a.name,
        a.round,
        a.due_at,
        a.is_published,
        p.name as project_name,
        p.project_id,
        COUNT(DISTINCT ms.marker_id) as markers_assigned,
        COUNT(DISTINCT CASE WHEN ms.score IS NOT NULL THEN ms.marker_id END) as markers_completed
      FROM assignment a
      JOIN project p ON a.project_id = p.project_id
      LEFT JOIN marker_score ms ON a.assignment_id = ms.assignment_id
      WHERE p.status = 'active'
        AND a.version = (
          SELECT MAX(version) 
          FROM assignment a2 
          WHERE a2.project_id = a.project_id 
          AND a2.round = a.round
        )
      GROUP BY a.assignment_id, a.name, a.round, a.due_at, a.is_published, p.name, p.project_id
      ORDER BY a.due_at ASC
      LIMIT 5
    `);

    // Get feedback/outliers (only active projects)
    const outliersResult = await db.query(`
      SELECT 
        u.name as marker_name,
        a.name as assignment_name,
        a.round,
        a.assignment_id,
        p.name as project_name,
        p.project_id,
        rc.title as criterion_name,
        ms.score,
        rc.max_score,
        ROUND(((ms.score - rc.max_score) / rc.max_score * 100)::numeric, 1) as deviation_percent
      FROM marker_score ms
      JOIN app_user u ON ms.marker_id = u.user_id
      JOIN assignment a ON ms.assignment_id = a.assignment_id
      JOIN project p ON a.project_id = p.project_id
      JOIN rubric_criterion rc ON ms.criterion_id = rc.criterion_id
      WHERE ABS(ms.score - rc.max_score) / rc.max_score > 0.05
        AND p.status = 'active'
      ORDER BY ABS(ms.score - rc.max_score) / rc.max_score DESC
      LIMIT 5
    `);

    res.json({
      kpi: {
        activeProjects,
        totalMarkers,
        pendingInvitations,
        completedAssignments
      },
      recentAssignments: recentAssignmentsResult.rows,
      outliers: outliersResult.rows
    });

  } catch (error) {
    console.error('Error fetching coordinator dashboard data:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
};

exports.getMarkerDashboardData = async (req, res) => {
  try {
    if (req.user.role !== 'MARKER') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const markerId = req.user.id;

    // Get pending tasks count - tasks that are NOT finalized
    const pendingTasksResult = await db.query(`
      SELECT COUNT(DISTINCT a.assignment_id) as count
      FROM assignment a
      JOIN project p ON a.project_id = p.project_id
      LEFT JOIN (
        SELECT assignment_id, marker_id, 
               BOOL_AND(finalized) as all_finalized
        FROM marker_score
        WHERE marker_id = $1
        GROUP BY assignment_id, marker_id
      ) ms ON a.assignment_id = ms.assignment_id
      WHERE p.status = 'active' 
        AND a.is_published = true
        AND a.version = (
          SELECT MAX(version) 
          FROM assignment a2 
          WHERE a2.project_id = a.project_id 
          AND a2.round = a.round
        )
        AND (ms.all_finalized IS NULL OR ms.all_finalized = false)
    `, [markerId]);
    const pendingTasks = parseInt(pendingTasksResult.rows[0].count);

    // Get completed tasks count - tasks where ALL criteria are finalized
    const completedTasksResult = await db.query(`
      SELECT COUNT(DISTINCT a.assignment_id) as count
      FROM assignment a
      JOIN project p ON a.project_id = p.project_id
      JOIN (
        SELECT assignment_id, marker_id, 
               BOOL_AND(finalized) as all_finalized
        FROM marker_score
        WHERE marker_id = $1
        GROUP BY assignment_id, marker_id
      ) ms ON a.assignment_id = ms.assignment_id
      WHERE ms.all_finalized = true
        AND a.is_published = true
        AND p.status = 'active'
    `, [markerId]);
    const completedTasks = parseInt(completedTasksResult.rows[0].count);

    // Get recent feedback count
    const recentFeedbackResult = await db.query(`
      SELECT COUNT(*) as count
      FROM feedback f
      WHERE f.marker_id = $1 
        AND f.created_at > NOW() - INTERVAL '7 days'
    `, [markerId]);
    const recentFeedback = parseInt(recentFeedbackResult.rows[0].count);

    // Get pending assignments - NOT finalized
    const pendingAssignmentsResult = await db.query(`
      SELECT 
        a.assignment_id,
        a.name,
        a.round,
        a.due_at,
        p.name as project_name,
        p.project_id,
        CASE 
          WHEN a.due_at < NOW() THEN 'overdue'
          WHEN a.due_at < NOW() + INTERVAL '3 days' THEN 'due_soon'
          ELSE 'normal'
        END as urgency
      FROM assignment a
      JOIN project p ON a.project_id = p.project_id
      LEFT JOIN (
        SELECT assignment_id, marker_id, 
               BOOL_AND(finalized) as all_finalized
        FROM marker_score
        WHERE marker_id = $1
        GROUP BY assignment_id, marker_id
      ) ms ON a.assignment_id = ms.assignment_id
      WHERE p.status = 'active' 
        AND a.is_published = true
        AND a.version = (
          SELECT MAX(version) 
          FROM assignment a2 
          WHERE a2.project_id = a.project_id 
          AND a2.round = a.round
        )
        AND (ms.all_finalized IS NULL OR ms.all_finalized = false)
      ORDER BY a.due_at ASC
      LIMIT 5
    `, [markerId]);

    // Get completed assignments - ALL criteria finalized
    const completedAssignmentsResult = await db.query(`
      SELECT 
        a.assignment_id,
        a.name,
        a.round,
        a.due_at,
        p.name as project_name,
        p.project_id,
        MAX(ms.submitted_at) as submitted_at
      FROM assignment a
      JOIN project p ON a.project_id = p.project_id
      JOIN marker_score ms ON a.assignment_id = ms.assignment_id AND ms.marker_id = $1
      WHERE a.is_published = true
        AND p.status = 'active'
        AND a.version = (
          SELECT MAX(version) 
          FROM assignment a2 
          WHERE a2.project_id = a.project_id 
          AND a2.round = a.round
        )
      GROUP BY a.assignment_id, a.name, a.round, a.due_at, p.name, p.project_id
      HAVING BOOL_AND(ms.finalized) = true
      ORDER BY MAX(ms.submitted_at) DESC
      LIMIT 5
    `, [markerId]);

    // Get recent feedback (last 30 days to show more relevant feedback)
    const recentFeedbackListResult = await db.query(`
      SELECT 
        f.feedback_id,
        f.content as comment,
        f.created_at,
        a.name as assignment_name,
        a.round,
        a.assignment_id,
        p.name as project_name,
        p.project_id
      FROM feedback f
      JOIN assignment a ON f.assignment_id = a.assignment_id
      JOIN project p ON a.project_id = p.project_id
      WHERE f.marker_id = $1
        AND f.created_at > NOW() - INTERVAL '30 days'
        AND p.status = 'active'
      ORDER BY f.created_at DESC
      LIMIT 5
    `, [markerId]);

    res.json({
      kpi: {
        pendingTasks,
        completedTasks,
        recentFeedback
      },
      pendingAssignments: pendingAssignmentsResult.rows,
      completedAssignments: completedAssignmentsResult.rows,
      recentFeedback: recentFeedbackListResult.rows
    });

  } catch (error) {
    console.error('Error fetching marker dashboard data:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
};