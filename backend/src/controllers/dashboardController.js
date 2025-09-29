// controllers/dashboardController.js
const path = require('path');

exports.getCoordinatorDashboard = (req, res) => {
  // 额外检查角色权限
  if (req.user.role !== 'COORDINATOR') {
    return res.redirect('/login');
  }
  // 发送对应的HTML文件
  res.sendFile(path.join(__dirname, '../../frontend/Coordinator/coordinator-dashboard.html'));
};

exports.getCoordinatorInvitePage = (req, res) => {
  // 检查角色权限
  if (req.user.role !== 'COORDINATOR') {
    return res.redirect('/login?error=access_denied');
  }

  // 发送对应的HTML文件
  res.sendFile(path.join(__dirname, '../../frontend/Coordinator/invite.html'));
};

exports.getCoordinatorFeedbackPage = (req, res) => {
    // 检查角色权限
    if (req.user.role !== 'COORDINATOR') {
        return res.redirect('/login?error=access_denied');
    }
    // 发送对应的HTML文件
    res.sendFile(path.join(__dirname, '../../frontend/Coordinator/feedback.html'));
}

exports.getCoordinatorTaskManagementPage = (req, res) => {
    // 检查角色权限
    if (req.user.role !== 'COORDINATOR') {
        return res.redirect('/login?error=access_denied');
    }

    // 发送对应的HTML文件
    res.sendFile(path.join(__dirname, '../../frontend/Coordinator/task-management.html'));
}
exports.getCoordinatorViewRubricPage = (req, res) => {
    // 检查角色权限
    if (req.user.role !== 'COORDINATOR') {
        return res.redirect('/login?error=access_denied');
    }
    // 发送对应的HTML文件
    res.sendFile(path.join(__dirname, '../../frontend/Coordinator/rubric.html'));
}

exports.getCoordinatorMarkPage = (req, res) => {
    // 检查角色权限
    if (req.user.role !== 'COORDINATOR') {
        return res.redirect('/login?error=access_denied');
    }
    // 发送对应的HTML文件
    res.sendFile(path.join(__dirname, '../../frontend/Coordinator/mark-assignment.html'));
}

exports.getCoordinatorAnalysisPage = (req, res) => {
    // 检查角色权限
    if (req.user.role !== 'COORDINATOR') {
        return res.redirect('/login?error=access_denied');
    }
    // 发送对应的HTML文件
    res.sendFile(path.join(__dirname, '../../frontend/Coordinator/feedback.html'));
}

exports.getCoordinatorPastPage = (req, res) => {
    // 检查角色权限
    if (req.user.role !== 'COORDINATOR') {
        return res.redirect('/login?error=access_denied');
    }

    // 发送对应的HTML文件
    res.sendFile(path.join(__dirname, '../../frontend/Coordinator/past-assignment.html'));
}

exports.getMarkerDashboard = (req, res) => {
  if (req.user.role !== 'MARKER') {
    return res.redirect('/login');
  }
  res.sendFile(path.join(__dirname, '../../frontend/Marker/marker-dashboard.html'));
};

exports.getMarkerTaskManagementPage = (req, res) => {
  if (req.user.role !== 'MARKER') {
    return res.redirect('/login?error=access_denied');
  }
  res.sendFile(path.join(__dirname, '../../frontend/Marker/task-management.html'));
};

exports.getMarkerPastTaskPage = (req, res) => {
  if (req.user.role !== 'MARKER') {
    return res.redirect('/login?error=access_denied');
  }
  res.sendFile(path.join(__dirname, '../../frontend/Marker/past-task.html'));
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
    require('path').join(__dirname, '../../frontend/Marker/connect-marker.html')
  );
};