
document.querySelectorAll('.nav-item').forEach(b=>{
    b.addEventListener('click',()=>{
      document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
    });
  });
  // ✅ display username
  try {
    const rawUser = localStorage.getItem("user");
    if (rawUser) {
      const user = JSON.parse(rawUser);
      if (user && user.name) {
        const usernameEl = document.getElementById("username");
        if (usernameEl) {
          usernameEl.textContent = user.name;
        }
      }
    }
  } catch (err) {
    console.error("Failed to load username:", err);
  }
  
  // Tabs：Pending / Completed
  const tabs = document.querySelectorAll('.tab');
  const pending = document.getElementById('list-pending');
  const completed = document.getElementById('list-completed');
  
  tabs.forEach(t=>{
    t.addEventListener('click',()=>{
      tabs.forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      const isPending = t.dataset.tab === 'pending';
      pending.classList.toggle('hidden', !isPending);
      completed.classList.toggle('hidden', isPending);
    });
  });
  
  document.querySelectorAll('.control').forEach(c=>{
    const key = 'marker-setting-' + c.dataset.setting;
    const saved = localStorage.getItem(key);
    if (saved === 'on') {
      c.classList.add('active');
      c.querySelector('.control-label').textContent = 'On';
    } else if (saved === 'off') {
      c.classList.remove('active');
      c.querySelector('.control-label').textContent = 'Off';
    }
  
    c.addEventListener('click',()=>{
      c.classList.toggle('active');
      const on = c.classList.contains('active');
      c.querySelector('.control-label').textContent = on ? 'On' : 'Off';
      localStorage.setItem(key, on ? 'on' : 'off');
    });
  });

  // 初始化dropdown
  const accountEl = document.querySelector('.account');
  const dropdown = document.querySelector('.dropdown-menu');
  const logoutBtn = document.querySelector('.dropdown-item');

  if (accountEl && dropdown) {
    accountEl.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('show');
    });

    // 点击其他地方关闭下拉菜单
    document.addEventListener('click', () => {
      dropdown.classList.remove('show');
    });
  }

  // 登出功能
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const response = await fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'include'
        });

        const data = await response.json();

        if (data.success) {
          localStorage.removeItem('user');
          localStorage.removeItem('userRole');
          document.cookie = "userId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
          window.location.href = '/login';
        } else {
          alert("Logout failed: " + data.message);
        }
      } catch (error) {
        console.error('Logout error:', error);
        localStorage.removeItem('user');
        localStorage.removeItem('userRole');
        document.cookie = "userId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        window.location.href = '/login';
      }
    });
  }

  // 全局logout函数
  window.logout = async function() {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });

      const data = await response.json();

      if (data.success) {
        localStorage.removeItem('user');
        localStorage.removeItem('userRole');
        document.cookie = "userId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        window.location.href = '/login';
      } else {
        alert("Logout failed: " + data.message);
      }
    } catch (error) {
      console.error('Logout error:', error);
      localStorage.removeItem('user');
      localStorage.removeItem('userRole');
      document.cookie = "userId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      window.location.href = '/login';
    }
  };
  