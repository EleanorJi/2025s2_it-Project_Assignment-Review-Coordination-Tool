
document.querySelectorAll('.nav-item').forEach(b=>{
    b.addEventListener('click',()=>{
      document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      
      // 根据data-view属性进行页面导航
      const view = b.dataset.view;
      switch(view) {
        case 'overview':
        case 'marker-dashboard.html':
          window.location.href = 'marker-dashboard.html';
          break;
        case 'marker-management':
        case 'mark':
          window.location.href = 'marker-management.html';
          break;
        case 'report':
          // 这里可以链接到feedback页面或报告页面
          alert('Report/Feedback page - to be implemented');
          break;
        case 'past':
          // 这里可以链接到历史作业页面
          alert('Past Assignment page - to be implemented');
          break;
        default:
          console.log('Unknown view:', view);
      }
    });
  });
  
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
  
  // Mark button click handler
  document.querySelectorAll('[data-assignment]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const assignmentId = btn.dataset.assignment;
      
      // Show loading state
      const originalText = btn.textContent;
      btn.textContent = 'Opening...';
      btn.disabled = true;
      
      // Simulate loading delay
      setTimeout(() => {
        // Navigate to mark-assignment page with assignment ID
        window.location.href = `mark-assignment.html?assignment=${encodeURIComponent(assignmentId)}`;
      }, 500);
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
  