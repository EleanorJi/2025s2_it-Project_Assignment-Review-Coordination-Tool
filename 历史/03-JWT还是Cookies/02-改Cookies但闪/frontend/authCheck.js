// 获取 Cookie 的辅助函数
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

// Coordinator 权限检查
function checkCoordinatorAuth() {
  const userId = getCookie('userId');
  const userJson = localStorage.getItem('user');
  const userRole = localStorage.getItem('userRole');

  // 1. 检查是否已登录
  if (!userId) {
    window.location.href = '/login.html';
    return null;
  }

  // 2. 检查是否有用户信息
  if (!userJson || !userRole) {
    window.location.href = '/login.html';
    return null;
  }

  // 3. 检查角色权限
  if (userRole !== 'COORDINATOR') {
    if (userRole === 'MARKER') {
      window.location.href = '/Marker/marker-dashboard.html';
    } else {
      window.location.href = '/login.html';
    }
    return null;
  }

  try {
    return JSON.parse(userJson);
  } catch (e) {
    console.error('Error parsing user data:', e);
    window.location.href = '/login.html';
    return null;
  }
}

// Marker 权限检查
function checkMarkerAuth() {
  const userId = getCookie('userId');
  const userJson = localStorage.getItem('user');
  const userRole = localStorage.getItem('userRole');

  if (!userId) {
    window.location.href = '/login.html';
    return null;
  }

  if (!userJson || !userRole) {
    window.location.href = '/login.html';
    return null;
  }

  if (userRole !== 'MARKER') {
    if (userRole === 'COORDINATOR') {
      window.location.href = '/Coordinator/coordinator-dashboard.html';
    } else {
      window.location.href = '/login.html';
    }
    return null;
  }

  try {
    return JSON.parse(userJson);
  } catch (e) {
    console.error('Error parsing user data:', e);
    window.location.href = '/login.html';
    return null;
  }
}

// 通用权限检查（根据路径自动判断）
function checkAuth() {
  const path = window.location.pathname;

  if (path.includes('coordinator')) {
    return checkCoordinatorAuth();
  } else if (path.includes('marker')) {
    return checkMarkerAuth();
  } else {
    // 对于其他页面，只检查是否登录
    const userId = getCookie('userId');
    const userJson = localStorage.getItem('user');

    if (!userId || !userJson) {
      window.location.href = '/login.html';
      return null;
    }

    try {
      return JSON.parse(userJson);
    } catch (e) {
      window.location.href = '/login.html';
      return null;
    }
  }
}

// 登出函数
async function logout() {
  try {
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });

    const data = await response.json();

    if (data.success) {
      // 清除前端存储
      localStorage.removeItem('user');
      localStorage.removeItem('userRole');
      document.cookie = "userId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      window.location.href = '/login.html';
    } else {
      console.error("Logout failed:", data.message);
      // 即使后端失败，也强制前端清除
      forceLogout();
    }
  } catch (error) {
    console.error('Logout error:', error);
    forceLogout();
  }
}

// 强制登出（前端清除）
function forceLogout() {
  localStorage.removeItem('user');
  localStorage.removeItem('userRole');
  document.cookie = "userId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
  window.location.href = '/login.html';
}