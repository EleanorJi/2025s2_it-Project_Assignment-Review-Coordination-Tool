(function(){
  const markerBtn = document.getElementById('role-marker');
  const coordBtn  = document.getElementById('role-coordinator');

  if (markerBtn && coordBtn) {
    markerBtn.onclick = () => {
      markerBtn.classList.add('active');
      coordBtn.classList.remove('active');
    }
    coordBtn.onclick  = () => {
      coordBtn.classList.add('active');
      markerBtn.classList.remove('active');
    }
  }

  const form = document.getElementById('loginForm');
  const status = document.getElementById('status');
  const btn = document.getElementById('submitBtn');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      status.className = 'msg';
      status.textContent = '';

      const identifier = document.getElementById('identifier').value.trim();
      const password = document.getElementById('password').value;

      if (!identifier || !password) {
        status.classList.add('err');
        status.textContent = 'Please fill in both fields.';
        return;
      }

      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
      const payload = { password };
      if (isEmail) {
        payload.email = identifier;
      } else {
        payload.name = identifier;
      }

      try {
        btn.disabled = true;
        status.textContent = 'Signing in…';

        // 尝试 /api/auth/login 端点
        let res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include', // 重要：允许携带 Cookie
          body: JSON.stringify(payload)
        });

        // 如果 404，尝试旧的 /api/login 端点
        if (res.status === 404) {
          res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload)
          });
        }

        const data = await res.json();

        if (!res.ok || data.success === false) {
          throw new Error(data.message || 'Login failed');
        }

        // ✅ 不再存储 userId 到 localStorage（由 Cookie 处理）
        // ✅ 只存储用户信息和角色用于前端权限判断
        if (data.user) {
          localStorage.setItem('user', JSON.stringify(data.user));
          localStorage.setItem('userRole', data.user.role);
        }

        status.classList.add('ok');
        status.textContent = 'Login successful! Redirecting...';

        // 根据角色跳转到对应仪表盘
        setTimeout(() => {
          let target;
          if (data.user?.role === 'COORDINATOR') {
            target = '/dashboard/coordinator';
          } else if (data.user?.role === 'MARKER') {
            target = '/dashboard/marker';
          } else {
            target = '/login';
          }
          console.log('Ready to redirect to:', target);
          window.location.href = target;
        }, 1000);

      } catch (err) {
        status.classList.add('err');
        status.textContent = err.message || 'Login failed. Please try again.';
      } finally {
        btn.disabled = false;
      }
    });
  }

  // 忘记密码功能
  const forgotLink = document.getElementById('forgot');
  if (forgotLink) {
    forgotLink.onclick = (e) => {
      e.preventDefault();
      alert('Please contact the coordinator to reset your password.');
    };
  }

  // 页面加载时检查是否已登录（可选）
  function checkAlreadyLoggedIn() {
    // 检查是否有 user 信息（但主要依赖 Cookie）
    const user = localStorage.getItem('user');
    if (user) {
      try {
        const userData = JSON.parse(user);
        let target;
        if (userData.role === 'COORDINATOR') {
        // 跳转到后端保护的路由，不是直接跳转到静态文件！
        target = '/dashboard/coordinator';
        } else if (userData.role === 'MARKER') {
        target = '/dashboard/marker';
        }

        // 如果用户访问登录页但已登录，自动跳转
        if (target && window.location.pathname.endsWith('login.html')) {
          window.location.href = target;
        }
      } catch (e) {
        console.error('Error parsing user data:', e);
      }
    }
  }

  // 页面加载时执行检查
  checkAlreadyLoggedIn();
})();