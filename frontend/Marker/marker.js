
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

  // Load dashboard data
  loadDashboardData();
  
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

  // Dashboard data loading function
  async function loadDashboardData() {
    try {
      console.log('🔄 Loading marker dashboard data...');
      const response = await fetch('/dashboard/api/marker/data', {
        credentials: 'include'
      });

      console.log('📡 Response status:', response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API Error:', errorText);
        throw new Error(`Failed to fetch dashboard data: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('✅ Dashboard data loaded:', data);
      
      // Update KPI counters
      document.getElementById('pending-tasks-count').textContent = data.kpi.pendingTasks || 0;
      document.getElementById('completed-tasks-count').textContent = data.kpi.completedTasks || 0;
      document.getElementById('recent-feedback-count').textContent = data.kpi.recentFeedback || 0;

      // Update pending tasks list
      const pendingTasksList = document.getElementById('pending-tasks-list');
      if (data.pendingAssignments && data.pendingAssignments.length > 0) {
        pendingTasksList.innerHTML = data.pendingAssignments.map(task => `
          <div class="task-item">
            <div class="task-meta">
              <div class="task-title">${task.name}</div>
              <div class="task-subtitle">${task.project_name} • Round ${task.round} • Due ${formatDate(task.due_at)}</div>
            </div>
            <div class="task-actions">
              <span class="task-status ${task.urgency}">${getStatusText(task.urgency)}</span>
              <button class="btn primary sm" onclick="window.location.href='/dashboard/marker/taskManagement'">Mark</button>
            </div>
          </div>
        `).join('');
      } else {
        pendingTasksList.innerHTML = '<div class="empty-state">No pending tasks</div>';
      }

      // Update completed tasks list
      const completedTasksList = document.getElementById('completed-tasks-list');
      if (data.completedAssignments && data.completedAssignments.length > 0) {
        completedTasksList.innerHTML = data.completedAssignments.map(task => `
          <div class="task-item">
            <div class="task-meta">
              <div class="task-title">${task.name}</div>
              <div class="task-subtitle">${task.project_name} • Round ${task.round} • Submitted ${formatDate(task.submitted_at)}</div>
            </div>
            <div class="task-actions">
              <a href="/dashboard/marker/taskManagement" class="link">View</a>
            </div>
          </div>
        `).join('');
      } else {
      }

      // Update recent feedback list
      const recentFeedbackList = document.getElementById('recent-feedback-list');
      if (data.recentFeedback && data.recentFeedback.length > 0) {
        recentFeedbackList.innerHTML = data.recentFeedback.map(feedback => `
          <div class="feedback-item">
            <div class="feedback-title">${feedback.assignment_name}</div>
            <div class="feedback-content">${feedback.comment}</div>
            <div class="feedback-meta">${feedback.project_name} • ${formatDate(feedback.created_at)}</div>
          </div>
        `).join('');
      } else {
        recentFeedbackList.innerHTML = '<div class="empty-state">No recent feedback</div>';
      }

    } catch (error) {
      console.error('Error loading dashboard data:', error);
      
      // Show error states
      document.getElementById('pending-tasks-list').innerHTML = '<div class="empty-state">Error loading tasks</div>';
      document.getElementById('completed-tasks-list').innerHTML = '<div class="empty-state">Error loading tasks</div>';
      document.getElementById('recent-feedback-list').innerHTML = '<div class="empty-state">Error loading feedback</div>';
    }
  }

  // Helper functions
  function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-AU', { 
      day: 'numeric', 
      month: 'short',
      year: 'numeric'
    });
  }

  function getStatusText(urgency) {
    switch (urgency) {
      case 'overdue': return 'Overdue';
      case 'due_soon': return 'Due Soon';
      case 'normal': return 'On Track';
      default: return 'Active';
    }
  }
  