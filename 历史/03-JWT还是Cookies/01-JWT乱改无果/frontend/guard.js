(async function guard() {
  const token = localStorage.getItem('token');
  if (!token) {
    return location.replace('/login.html');
  }

  try {
    const res = await fetch('/api/auth/me', {
      method: 'GET',
      headers: { 'authorization': 'Bearer ' + token }
    });

    if (!res.ok) throw new Error('Unauthorized');
    const data = await res.json();
    const user = data.user;

    if (!user) {
      localStorage.clear();
      return location.replace('/login.html');
    }

    // 判断访问的页面
    const path = location.pathname.toLowerCase();
    const isCoordinatorPage = path.includes('coordinator') || path.includes('invite');
    const isMarkerPage      = path.includes('marker');

    // role 不匹配就跳到 login
    if (isCoordinatorPage && user.role.toUpperCase()  !== 'COORDINATOR') {
      return location.replace('/login.html');
    }
    if (isMarkerPage && user.role.toUpperCase()  !== 'MARKER') {
      return location.replace('/login.html');
    }

    // 同步 localStorage
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('userRole', user.role);
    localStorage.setItem('userId', user.id);

  } catch (err) {
    console.error('Guard error:', err);
    localStorage.clear();
    return location.replace('/login.html');
  }
})();
