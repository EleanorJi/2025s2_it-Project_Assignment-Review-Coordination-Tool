// coordinator.js
(() => {
  document.addEventListener('DOMContentLoaded', () => {
    // Other page initialization goes here
    initCommonNav();

    // Execute only on upload page (depends on <body data-page="upload">)
    if (document.body.dataset.page === 'upload') {
      initUploadPage();
    }
  });

function initCommonNav() {
  // Get user info from localStorage
  const userStr = localStorage.getItem('user');
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      const usernameEl = document.getElementById('username');
      if (usernameEl && user.name) {
        usernameEl.textContent = user.name || user.email || 'User';
      }
    } catch (e) {
      console.error('Error parsing user data:', e);
    }
  }
}

  // ====== Logic merged from original upload.js ======
  function initUploadPage() {
    // 1) After selecting files, change text to filename (visual feedback)
    document.querySelectorAll('.drop input[type="file"]').forEach(input => {
      const label = input.parentElement.querySelector('div'); // drop > div text container
      input.addEventListener('change', () => {
        if (input.files && input.files[0]) {
          label.innerHTML = `${input.files[0].name}<div class="hint">Selected</div>`;
          refreshValidation(input.closest('.assign')); // Refresh validation after selecting file
        }
      });
    });

    // 2) Listen for date/numeric input, refresh validation in real time
    document.querySelectorAll('.assign .input').forEach(inp => {
      inp.addEventListener('input', () => {
        refreshValidation(inp.closest('.assign'));
      });
    });

    // 3) Save draft / publish (example: get form data -> you can fetch to backend)
    document.querySelectorAll('.assign').forEach(card => {
      const saveBtn    = card.querySelector('.btn:not(.primary)');
      const publishBtn = card.querySelector('.btn.primary');

      saveBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        const payload = collectCardData(card);
        console.log('[draft]', payload);
        // fetch('/api/assignments/draft', {method:'POST', body: toFormData(payload)})
        alert('Draft saved (payload in console)');
      });

      publishBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        const payload = collectCardData(card);
        const ok = isCardValid(card);
        if (!ok) { alert('Please complete required files and due date.'); return; }
        console.log('[publish]', payload);
        // fetch('/api/assignments/publish', {method:'POST', body: toFormData(payload)})
        alert('Published (payload in console)');
      });
    });
  }

    
  // ====== Utility Functions ======
  function collectCardData(card) {
    const [roundEl, dueEl, devEl] = card.querySelectorAll('.form-row .input');
    const files = card.querySelectorAll('.drop input[type="file"]');
    return {
      title: card.querySelector('.assign-title')?.textContent?.trim() || '',
      round: roundEl?.value?.trim() || '',
      due_date: dueEl?.value?.trim() || '',
      deviation: devEl?.value?.trim() || '',
      assignment_file: files[0]?.files?.[0] || null,
      rubric_file: files[1]?.files?.[0] || null,
    };
  }

  function isCardValid(card) {
    const data = collectCardData(card);
    const pdfOk   = !!data.assignment_file;
    const rubricOk= !!data.rubric_file;
    const dateOk  = !!data.due_date;
    return pdfOk && rubricOk && dateOk;
  }

  function refreshValidation(card) {
    const data = collectCardData(card);
    const block = card.querySelector('.list');
    if (!block) return;
    block.innerHTML = `
      <li>${data.assignment_file ? '✔' : '✖'} Assignment PDF selected</li>
      <li>${data.rubric_file ? '✔' : '✖'} Rubric file selected</li>
      <li>${data.due_date ? '✔' : '✖'} Due date set</li>
    `;
  }

  
  // Optional: Convert JSON to FormData (convenient for file upload)
  function toFormData(obj) {
    const fd = new FormData();
    Object.entries(obj).forEach(([k,v]) => {
      if (v !== undefined && v !== null) fd.append(k, v);
    });
    return fd;
  }

  // 初始化dropdown和logout功能
  function initDropdownAndLogout() {
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
  }

  // 在页面加载时初始化dropdown和logout功能
  document.addEventListener('DOMContentLoaded', () => {
    initDropdownAndLogout();
    // Load dashboard data if on dashboard page
    if (window.location.pathname.includes('/dashboard/coordinator') && !window.location.pathname.includes('/invite') && !window.location.pathname.includes('/taskManagement') && !window.location.pathname.includes('/feedback') && !window.location.pathname.includes('/past')) {
      loadDashboardData();
    }
  });

  // Dashboard data loading function
  async function loadDashboardData() {
    try {
      console.log('🔄 Loading coordinator dashboard data...');
      const response = await fetch('/dashboard/api/coordinator/data', {
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
      document.getElementById('active-projects-count').textContent = data.kpi.activeProjects || 0;
      document.getElementById('total-markers-count').textContent = data.kpi.totalMarkers || 0;
      document.getElementById('pending-invitations-count').textContent = data.kpi.pendingInvitations || 0;
      document.getElementById('completed-assignments-count').textContent = data.kpi.completedAssignments || 0;

      // Update marker stats
      document.getElementById('pending-invitations-stat').textContent = data.kpi.pendingInvitations || 0;
      document.getElementById('active-markers-stat').textContent = (data.kpi.totalMarkers - data.kpi.pendingInvitations) || 0;

      // Update recent assignments list
      const recentAssignmentsList = document.getElementById('recent-assignments-list');
      if (data.recentAssignments && data.recentAssignments.length > 0) {
        recentAssignmentsList.innerHTML = data.recentAssignments.map(assignment => `
          <div class="assignment-item">
            <div class="assignment-meta">
              <div class="assignment-title">${assignment.project_name} - Assignment ${assignment.round}</div>
              <div class="assignment-subtitle">Due ${formatDate(assignment.due_at)} • ${assignment.markers_completed}/${assignment.markers_assigned} markers completed</div>
            </div>
            <div class="assignment-actions">
              <span class="assignment-status ${assignment.is_published ? 'active' : 'draft'}">${getStatusText(assignment.is_published)}</span>
              <button class="btn primary sm" onclick="window.location.href='/dashboard/coordinator/taskManagement?project=${assignment.project_id}&assignment=${assignment.round}'">Manage</button>
            </div>
          </div>
        `).join('');
      } else {
        recentAssignmentsList.innerHTML = '<div class="empty-state">No recent assignments</div>';
      }

      // Update outliers list with pagination
      const outliersList = document.getElementById('outliers-list');
      
      // Store all outliers globally for pagination
      window.allOutliers = data.outliers || [];
      window.displayedOutliersCount = 5; // Initial display count
      
      // Display outliers
      displayOutliers();

    } catch (error) {
      console.error('Error loading dashboard data:', error);
      
      // Show error states
      document.getElementById('recent-assignments-list').innerHTML = '<div class="empty-state">Error loading assignments</div>';
      document.getElementById('outliers-list').innerHTML = '<div class="empty-state">Error loading data</div>';
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

  function getStatusText(isPublished) {
    return isPublished ? 'Published' : 'Draft';
  }

  // Outliers pagination functions
  function displayOutliers() {
    const outliersList = document.getElementById('outliers-list');
    const loadMoreBtn = document.getElementById('outliers-load-more');
    
    if (window.allOutliers.length === 0) {
      outliersList.innerHTML = '<div class="empty-state">No outliers detected</div>';
      loadMoreBtn.style.display = 'none';
      return;
    }
    
    // Display only the first N outliers
    const outliersToDisplay = window.allOutliers.slice(0, window.displayedOutliersCount);
    
    outliersList.innerHTML = outliersToDisplay.map(outlier => `
      <div class="outlier-item" style="cursor: pointer;" onclick="window.location.href='/dashboard/coordinator/taskManagement?project=${outlier.project_id}&assignment=${outlier.round}'">
        <div class="outlier-title">${outlier.marker_name} • ${outlier.project_name} - Assignment ${outlier.round}</div>
        <div class="outlier-content">${outlier.criterion_name}: ${outlier.score}/${outlier.max_score}</div>
        <div class="outlier-meta">
          Deviation: <span class="outlier-deviation ${Math.abs(outlier.deviation_percent) > 10 ? 'high' : (Math.abs(outlier.deviation_percent) > 5 ? 'medium' : 'low')}">
            ${outlier.deviation_percent > 0 ? '+' : ''}${outlier.deviation_percent}%
          </span>
        </div>
      </div>
    `).join('');
    
    // Show/hide "Load More" button
    if (window.allOutliers.length > window.displayedOutliersCount) {
      loadMoreBtn.style.display = 'block';
    } else {
      loadMoreBtn.style.display = 'none';
    }
  }

  window.loadMoreOutliers = function() {
    window.displayedOutliersCount += 5;
    displayOutliers();
  };

})();