(function(){
  const markerBtn = document.getElementById('role-marker');
  const coordBtn  = document.getElementById('role-coordinator');
  markerBtn.onclick = () => { markerBtn.classList.add('active'); coordBtn.classList.remove('active'); }
  coordBtn.onclick  = () => { coordBtn.classList.add('active'); markerBtn.classList.remove('active'); }

  const form   = document.getElementById('loginForm');
  const status = document.getElementById('status');
  const btn    = document.getElementById('submitBtn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.className = 'msg'; status.textContent = '';

    const identifier = document.getElementById('identifier').value.trim();
    const password   = document.getElementById('password').value;

    if (!identifier || !password) {
      status.classList.add('err'); status.textContent = 'Please fill in both fields.'; return;
    }

    // 输出 { username, password } JSON（你要求的格式）
    const loginJSON = { username: identifier, password };
    console.log('Login JSON:', JSON.stringify(loginJSON));

    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
    const payload = { ...loginJSON };
    if (isEmail) payload.email = identifier; else payload.name = identifier;

    try {
      btn.disabled = true; status.textContent = 'Signing in…';

      // 兼容 /api/auth/login 和 /api/login
      let res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.status === 404) {
        res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.message || 'Login failed');

      // 持久化
      if (data.user?.id)  localStorage.setItem('userId', data.user.id);
      if (data.user)      localStorage.setItem('user', JSON.stringify(data.user));

      // 计算跳转地址：?next > returnTo > 后端 redirectTo > 角色默认页
      const qs = new URLSearchParams(location.search);
      const fromNext  = qs.get('next');
      const fromGuard = sessionStorage.getItem('returnTo');
      const byServer  = data.redirectTo;
      const byRole    = (data.user?.role === 'coordinator')
        ? '/coordinator-dashboard.html'
        : '/marker-dashboard.html';

      const target = fromNext || fromGuard || byServer || byRole;

      sessionStorage.removeItem('returnTo');
      status.classList.add('ok'); status.textContent = 'Login successful!';
      window.location.replace(target);
    } catch (err) {
      status.classList.add('err'); status.textContent = err.message;
    } finally { btn.disabled = false; }
  });

  document.getElementById('forgot').onclick = () =>
    alert('Please contact the coordinator to reset your password.');
})();