document.addEventListener('DOMContentLoaded', () => {
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
      if (user) {
        const usernameEl = document.getElementById("username");
        if (usernameEl) {
          usernameEl.textContent = user.name || user.email || 'User';
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
  const allDropdownItems = document.querySelectorAll('.dropdown-item');
  const logoutBtn = allDropdownItems.length > 1 ? allDropdownItems[1] : null;

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
});

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

  // 全局goToResetPassword函数
  window.goToResetPassword = function() {
    window.location.href = '/reset-password';
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
              <div class="task-title">${task.project_name} - Assignment ${task.round}</div>
              <div class="task-subtitle">Due ${formatDate(task.due_at)}</div>
            </div>
            <div class="task-actions">
              <span class="task-status ${task.urgency}">${getStatusText(task.urgency)}</span>
              <button class="btn primary sm" onclick="window.location.href='/dashboard/marker/mark?project=${task.project_id}&assignment=assignment${task.round}'">Mark</button>
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
              <div class="task-title">${task.project_name} - Assignment ${task.round}</div>
              <div class="task-subtitle">Submitted ${formatDate(task.submitted_at)}</div>
            </div>
            <div class="task-actions">
              <button class="btn primary sm" onclick="window.location.href='/dashboard/marker/feedback?project=${task.project_id}&assignment_id=${task.assignment_id}'">View</button>
            </div>
          </div>
        `).join('');
      } else {
        completedTasksList.innerHTML = '<div class="empty-state">No completed tasks</div>';
      }

      // Update recent feedback list
      const recentFeedbackList = document.getElementById('recent-feedback-list');
      if (data.recentFeedback && data.recentFeedback.length > 0) {
        recentFeedbackList.innerHTML = data.recentFeedback.map(feedback => `
          <div class="feedback-item" style="cursor: pointer;" onclick="window.location.href='/dashboard/marker/feedback?project=${feedback.project_id}&assignment_id=${feedback.assignment_id}'">
            <div class="feedback-title">${feedback.project_name} - Assignment ${feedback.round}</div>
            <div class="feedback-content">${truncateText(feedback.comment, 100)}</div>
            <div class="feedback-meta">${formatDate(feedback.created_at)}</div>
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

  function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
  