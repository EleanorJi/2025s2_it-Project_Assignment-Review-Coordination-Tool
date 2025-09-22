
document.querySelectorAll('.nav-item').forEach(b=>{
    b.addEventListener('click',()=>{
      document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      if (b.dataset.view !== 'overview') {
        alert('This is a demo: only the Overview layout is shown. Please follow the routes/templates for the remaining views.');
      }
    });
  });
  // ✅ 显示用户名
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
  