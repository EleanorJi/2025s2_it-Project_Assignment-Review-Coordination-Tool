// Overview Interactive - Enhanced dashboard interactions
(function() {
  'use strict';

  // Data management
  const OverviewData = {
    assignments: [
      {
        id: 'a1',
        title: 'Assignment 1',
        status: 'active',
        dueDate: '2025-03-10',
        progress: 70,
        pendingMarkers: 2,
        totalMarkers: 10,
        outliers: [
          { marker: 'Marker B', deviation: 7, type: 'high' },
          { marker: 'Marker D', deviation: -6, type: 'low' }
        ]
      },
      {
        id: 'a2',
        title: 'Assignment 2',
        status: 'locked',
        dueDate: '2025-03-20',
        progress: 0,
        pendingMarkers: 0,
        totalMarkers: 0,
        outliers: []
      }
    ],
    markers: {
      total: 10,
      active: 7,
      pending: 2,
      expired: 1
    },
    notifications: [
      {
        id: 1,
        type: 'warning',
        message: 'Marker B has a high deviation (+7%) in Assignment 1',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        read: false
      },
      {
        id: 2,
        type: 'info',
        message: 'Assignment 1 is 70% complete',
        timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
        read: false
      }
    ]
  };

  // UI Elements
  let elements = {};

  // Initialize the interactive overview
  function init() {
    cacheElements();
    setupEventListeners();
    loadData();
    startAutoRefresh();
    setupNotifications();
  }

  // Cache DOM elements
  function cacheElements() {
    elements = {
      kpiCards: document.querySelectorAll('.kpi'),
      assignmentCards: document.querySelectorAll('.assign'),
      manageButtons: document.querySelectorAll('.btn.primary'),
      reminderButton: document.querySelector('.btn.primary'),
      outlierLinks: document.querySelectorAll('.link'),
      archiveLink: document.querySelector('a[href="#"]'),
      notificationContainer: null
    };
  }

  // Setup event listeners
  function setupEventListeners() {
    // Assignment management buttons
    elements.manageButtons.forEach((btn, index) => {
      if (btn.textContent.includes('Manage')) {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          handleAssignmentManage(OverviewData.assignments[index]);
        });
      }
    });

    // Reminder button
    if (elements.reminderButton && elements.reminderButton.textContent.includes('Send reminder')) {
      elements.reminderButton.addEventListener('click', handleSendReminder);
    }

    // Outlier detail links
    elements.outlierLinks.forEach(link => {
      if (link.textContent.includes('View details')) {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          handleViewOutliers();
        });
      }
    });

    // Archive link
    if (elements.archiveLink && elements.archiveLink.textContent.includes('Open archive')) {
      elements.archiveLink.addEventListener('click', (e) => {
        e.preventDefault();
        handleOpenArchive();
      });
    }

    // KPI card interactions
    elements.kpiCards.forEach(card => {
      card.addEventListener('click', handleKPIClick);
    });

    // Assignment card interactions
    elements.assignmentCards.forEach((card, index) => {
      card.addEventListener('mouseenter', () => handleCardHover(card, true));
      card.addEventListener('mouseleave', () => handleCardHover(card, false));
      card.addEventListener('click', (e) => {
        if (!e.target.classList.contains('btn')) {
          handleAssignmentClick(OverviewData.assignments[index]);
        }
      });
    });
  }

  // Load and display data
  function loadData() {
    updateKPIs();
    updateAssignments();
    updateNotifications();
  }

  // Update KPI cards
  function updateKPIs() {
    const kpiCards = document.querySelectorAll('.kpi');
    
    // Active assignments
    if (kpiCards[0]) {
      const activeCount = OverviewData.assignments.filter(a => a.status === 'active').length;
      updateKPICard(kpiCards[0], activeCount, 'Active assignments');
    }

    // Markers
    if (kpiCards[1]) {
      const { total, active, pending, expired } = OverviewData.markers;
      updateKPICard(kpiCards[1], total, 'Markers', `Accepted ${active} · Pending ${pending} · Expired ${expired}`);
    }

    // Completion progress
    if (kpiCards[2]) {
      const activeAssignment = OverviewData.assignments.find(a => a.status === 'active');
      if (activeAssignment) {
        updateProgressCard(kpiCards[2], activeAssignment.progress, activeAssignment.pendingMarkers, activeAssignment.totalMarkers);
      }
    }
  }

  // Update assignment cards
  function updateAssignments() {
    const assignmentCards = document.querySelectorAll('.assign');
    
    assignmentCards.forEach((card, index) => {
      const assignment = OverviewData.assignments[index];
      if (!assignment) return;

      // Update status indicators
      const statusElement = card.querySelector('.assign-sub:last-child');
      if (statusElement) {
        if (assignment.status === 'locked') {
          statusElement.textContent = 'Locked';
          statusElement.style.color = '#DC2626';
        } else {
          statusElement.textContent = `Pending ${assignment.pendingMarkers} / ${assignment.totalMarkers}`;
          statusElement.style.color = assignment.pendingMarkers > 0 ? '#F59E0B' : '#16a34a';
        }
      }

      // Add progress bar for active assignments
      if (assignment.status === 'active' && assignment.progress > 0) {
        addProgressBar(card, assignment.progress);
      }

      // Add status badge
      addStatusBadge(card, assignment.status);
    });
  }

  // Update notifications
  function updateNotifications() {
    const unreadCount = OverviewData.notifications.filter(n => !n.read).length;
    
    // Add notification indicator to header
    addNotificationIndicator(unreadCount);
    
    // Create notification dropdown if it doesn't exist
    if (!elements.notificationContainer) {
      createNotificationDropdown();
    }
  }

  // Event handlers
  function handleAssignmentManage(assignment) {
    InteractionUtils.showLoading(event.target, 'Opening Management...');
    
    setTimeout(() => {
      InteractionUtils.hideLoading(event.target);
      
      if (assignment.status === 'locked') {
        InteractionUtils.showToast('Assignment is locked and cannot be managed', 'error');
        return;
      }
      
      // Navigate to task management with assignment filter
      window.location.href = `task-management.html?assignment=${assignment.id}`;
    }, 500);
  }

  function handleSendReminder() {
    InteractionUtils.showLoading(event.target, 'Sending Reminders...');
    
    setTimeout(() => {
      InteractionUtils.hideLoading(event.target);
      InteractionUtils.showToast('Reminders sent to 2 pending markers', 'success');
      
      // Update data
      OverviewData.markers.pending = Math.max(0, OverviewData.markers.pending - 1);
      updateKPIs();
    }, 1000);
  }

  function handleViewOutliers() {
    // Create modal for outlier details
    createOutlierModal();
  }

  function handleOpenArchive() {
    InteractionUtils.showLoading(event.target, 'Opening Archive...');
    
    setTimeout(() => {
      InteractionUtils.hideLoading(event.target);
      window.location.href = 'past-assignment.html';
    }, 500);
  }

  function handleKPIClick(event) {
    const card = event.currentTarget;
    const title = card.querySelector('.muted')?.textContent;
    
    if (title?.includes('Active assignments')) {
      // Filter to show only active assignments
      highlightActiveAssignments();
    } else if (title?.includes('Markers')) {
      // Navigate to markers management
      window.location.href = 'invite.html';
    } else if (title?.includes('Completion')) {
      // Show detailed progress
      showProgressDetails();
    }
  }

  function handleAssignmentClick(assignment) {
    if (assignment.status === 'locked') {
      InteractionUtils.showToast('Assignment is locked', 'warning');
      return;
    }
    
    // Show assignment details modal
    showAssignmentDetails(assignment);
  }

  function handleCardHover(card, isEntering) {
    if (isEntering) {
      card.style.transform = 'translateY(-2px)';
      card.style.boxShadow = '0 8px 25px rgba(0,0,0,0.15)';
    } else {
      card.style.transform = 'translateY(0)';
      card.style.boxShadow = '';
    }
  }

  // Utility functions
  function updateKPICard(card, value, title, subtitle = '') {
    const numElement = card.querySelector('.kpi-num');
    const hintElement = card.querySelector('.hint');
    
    if (numElement) {
      animateNumber(numElement, parseInt(numElement.textContent) || 0, value);
    }
    
    if (hintElement && subtitle) {
      hintElement.textContent = subtitle;
    }
  }

  function updateProgressCard(card, progress, pending, total) {
    const progressBar = card.querySelector('.progress span');
    const hintElement = card.querySelector('.hint');
    
    if (progressBar) {
      progressBar.style.width = `${progress}%`;
      progressBar.style.transition = 'width 0.5s ease';
    }
    
    if (hintElement) {
      hintElement.textContent = `${total - pending}/${total} markers submitted`;
    }
  }

  function addProgressBar(card, progress) {
    if (card.querySelector('.progress-bar')) return;
    
    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    progressBar.innerHTML = `
      <div class="progress-label">Progress: ${progress}%</div>
      <div class="progress-track">
        <div class="progress-fill" style="width: ${progress}%"></div>
      </div>
    `;
    
    // Add styles
    progressBar.style.cssText = `
      margin-top: 8px;
      font-size: 12px;
    `;
    
    const progressTrack = progressBar.querySelector('.progress-track');
    progressTrack.style.cssText = `
      width: 100%;
      height: 4px;
      background: #E5E7EB;
      border-radius: 2px;
      overflow: hidden;
      margin-top: 4px;
    `;
    
    const progressFill = progressBar.querySelector('.progress-fill');
    progressFill.style.cssText = `
      height: 100%;
      background: #10B981;
      transition: width 0.5s ease;
    `;
    
    card.appendChild(progressBar);
  }

  function addStatusBadge(card, status) {
    if (card.querySelector('.status-badge')) return;
    
    const badge = document.createElement('div');
    badge.className = 'status-badge';
    badge.textContent = status === 'active' ? 'Active' : 'Locked';
    badge.style.cssText = `
      position: absolute;
      top: 12px;
      right: 12px;
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      background: ${status === 'active' ? '#10B981' : '#DC2626'};
      color: white;
    `;
    
    card.style.position = 'relative';
    card.appendChild(badge);
  }

  function addNotificationIndicator(count) {
    let indicator = document.querySelector('.notification-indicator');
    
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'notification-indicator';
      indicator.style.cssText = `
        position: relative;
        cursor: pointer;
      `;
      
      const account = document.querySelector('.account');
      if (account) {
        account.appendChild(indicator);
      }
    }
    
    if (count > 0) {
      indicator.innerHTML = `
        <span style="
          position: absolute;
          top: -8px;
          right: -8px;
          background: #DC2626;
          color: white;
          border-radius: 50%;
          width: 18px;
          height: 18px;
          font-size: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
        ">${count}</span>
      `;
    } else {
      indicator.innerHTML = '';
    }
  }

  function createNotificationDropdown() {
    const dropdown = document.createElement('div');
    dropdown.className = 'notification-dropdown';
    dropdown.style.cssText = `
      position: absolute;
      top: 100%;
      right: 0;
      background: white;
      border: 1px solid #E5E7EB;
      border-radius: 8px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.1);
      min-width: 300px;
      max-height: 400px;
      overflow-y: auto;
      z-index: 1000;
      display: none;
    `;
    
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 12px 16px;
      border-bottom: 1px solid #E5E7EB;
      font-weight: 600;
      background: #F9FAFB;
    `;
    header.textContent = 'Notifications';
    
    const content = document.createElement('div');
    content.className = 'notification-content';
    
    OverviewData.notifications.forEach(notification => {
      const item = document.createElement('div');
      item.style.cssText = `
        padding: 12px 16px;
        border-bottom: 1px solid #F3F4F6;
        cursor: pointer;
        ${!notification.read ? 'background: #FEF3C7;' : ''}
      `;
      
      item.innerHTML = `
        <div style="font-size: 14px; margin-bottom: 4px;">${notification.message}</div>
        <div style="font-size: 12px; color: #6B7280;">${formatTime(notification.timestamp)}</div>
      `;
      
      item.addEventListener('click', () => {
        notification.read = true;
        updateNotifications();
        item.style.background = '';
      });
      
      content.appendChild(item);
    });
    
    dropdown.appendChild(header);
    dropdown.appendChild(content);
    
    document.querySelector('.account').appendChild(dropdown);
    elements.notificationContainer = dropdown;
    
    // Toggle dropdown
    const indicator = document.querySelector('.notification-indicator');
    if (indicator) {
      indicator.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
      });
    }
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target) && !indicator?.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });
  }

  function createOutlierModal() {
    const modal = document.createElement('div');
    modal.className = 'outlier-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
    `;
    
    const content = document.createElement('div');
    content.style.cssText = `
      background: white;
      border-radius: 12px;
      padding: 24px;
      max-width: 500px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
    `;
    
    content.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h3 style="margin: 0;">Outlier Analysis</h3>
        <button class="close-modal" style="background: none; border: none; font-size: 24px; cursor: pointer;">×</button>
      </div>
      <div class="outlier-list">
        ${OverviewData.assignments[0].outliers.map(outlier => `
          <div style="padding: 12px; border: 1px solid #E5E7EB; border-radius: 8px; margin-bottom: 8px;">
            <div style="font-weight: 600; margin-bottom: 4px;">${outlier.marker}</div>
            <div style="color: ${outlier.type === 'high' ? '#DC2626' : '#10B981'};">
              ${outlier.deviation > 0 ? '+' : ''}${outlier.deviation}% deviation
            </div>
          </div>
        `).join('')}
      </div>
    `;
    
    modal.appendChild(content);
    document.body.appendChild(modal);
    
    // Close modal
    content.querySelector('.close-modal').addEventListener('click', () => {
      document.body.removeChild(modal);
    });
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });
  }

  function showAssignmentDetails(assignment) {
    InteractionUtils.showToast(`Opening details for ${assignment.title}`, 'info');
    // Could open a detailed modal or navigate to a details page
  }

  function highlightActiveAssignments() {
    elements.assignmentCards.forEach((card, index) => {
      const assignment = OverviewData.assignments[index];
      if (assignment?.status === 'active') {
        card.style.border = '2px solid #10B981';
        card.style.background = '#F0FDF4';
      } else {
        card.style.border = '';
        card.style.background = '';
      }
    });
    
    setTimeout(() => {
      elements.assignmentCards.forEach(card => {
        card.style.border = '';
        card.style.background = '';
      });
    }, 3000);
  }

  function showProgressDetails() {
    InteractionUtils.showToast('Showing detailed progress analysis...', 'info');
    // Could show a detailed progress modal
  }

  function animateNumber(element, start, end, duration = 500) {
    const startTime = performance.now();
    
    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const current = Math.round(start + (end - start) * progress);
      
      element.textContent = current;
      
      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }
    
    requestAnimationFrame(update);
  }

  function formatTime(timestamp) {
    const now = new Date();
    const diff = now - timestamp;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor(diff / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ago`;
    } else if (minutes > 0) {
      return `${minutes}m ago`;
    } else {
      return 'Just now';
    }
  }

  function startAutoRefresh() {
    // Refresh data every 30 seconds
    setInterval(() => {
      loadData();
    }, 30000);
  }

  function setupNotifications() {
    // Check for new notifications periodically
    setInterval(() => {
      // Simulate new notification
      if (Math.random() > 0.8) {
        const newNotification = {
          id: Date.now(),
          type: 'info',
          message: 'New marker has joined the team',
          timestamp: new Date(),
          read: false
        };
        
        OverviewData.notifications.unshift(newNotification);
        updateNotifications();
      }
    }, 60000); // Check every minute
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Export for global access
  window.OverviewInteractive = {
    loadData,
    updateKPIs,
    updateAssignments
  };
})();
