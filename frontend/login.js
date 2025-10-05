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

        // try /api/auth/login endpoint first
        let res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include', // Important: allow sending cookies
          body: JSON.stringify(payload)
        });

        // If 404, try the old /api/login endpoint
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

        // ✅ No longer store userId in localStorage (handled by Cookie)
        // ✅ Only store user information and role for front-end permission judgment
        if (data.user) {
          localStorage.setItem('user', JSON.stringify(data.user));
          localStorage.setItem('userRole', data.user.role);
        }

        status.classList.add('ok');
        status.textContent = 'Login successful!';

        // Redirect to the corresponding dashboard based on role
        setTimeout(() => {
          let target;
          if (data.user?.role === 'COORDINATOR') {
            // Redirect to backend-protected route, not directly to static file!
            target = '/dashboard/coordinator';
          } else if (data.user?.role === 'MARKER') {
            target = '/dashboard/marker';
          } else {
            target = '/login';
          }
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

  // Forgot password feature
  const forgotLink = document.getElementById('forgot');
  if (forgotLink) {
    forgotLink.onclick = (e) => {
      e.preventDefault();
      alert('Please contact the coordinator to reset your password.');
    };
  }

  // Check if already logged in on page load (optional)
  function checkAlreadyLoggedIn() {
    // Check if user information exists (mainly relies on Cookie)
    const user = localStorage.getItem('user');
    if (user) {
      try {
        const userData = JSON.parse(user);
        let target;
        if (data.user?.role === 'COORDINATOR') {
          // Redirect to backend-protected route, not directly to static file!
          target = '/dashboard/coordinator';
        } else if (data.user?.role === 'MARKER') {
        target = '/dashboard/marker';
        }

        // If user accesses login page but is already logged in, redirect automatically
        if (target && window.location.pathname.endsWith('login.html')) {
          window.location.href = target;
        }
      } catch (e) {
        console.error('Error parsing user data:', e);
      }
    }
  }

  // Run the check on page load
  checkAlreadyLoggedIn();
})();