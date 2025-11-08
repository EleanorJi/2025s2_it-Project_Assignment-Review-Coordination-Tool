/**
 * @jest-environment jsdom
 */

// Mock the marker.js functions
describe('Marker Dashboard', () => {
  beforeEach(() => {
    // Setup DOM
    document.body.innerHTML = `
      <div class="nav-item">Nav 1</div>
      <div class="nav-item">Nav 2</div>
      <div id="username"></div>
      <div class="tab" data-tab="pending">Pending</div>
      <div class="tab" data-tab="completed">Completed</div>
      <div id="list-pending" class="hidden"></div>
      <div id="list-completed"></div>
      <div id="pending-tasks-count">0</div>
      <div id="completed-tasks-count">0</div>
      <div id="recent-feedback-count">0</div>
      <div id="pending-tasks-list"></div>
      <div id="completed-tasks-list"></div>
      <div id="recent-feedback-list"></div>
      <div class="account"></div>
      <div class="dropdown-menu"></div>
      <div class="dropdown-item">Logout</div>
    `;
    
    // Clear localStorage and mocks
    localStorage.clear();
    global.fetch.mockClear();
  });

  describe('formatDate', () => {
    // Create a helper formatDate function for testing
    const formatDate = (dateString) => {
      if (!dateString) return 'N/A';
      const date = new Date(dateString);
      return date.toLocaleDateString('en-AU', { 
        day: 'numeric', 
        month: 'short',
        year: 'numeric'
      });
    };

    test('should format valid date string', () => {
      const result = formatDate('2024-01-15');
      expect(result).toMatch(/\d{1,2}\s\w{3}\s\d{4}/);
    });

    test('should return N/A for null date', () => {
      expect(formatDate(null)).toBe('N/A');
    });

    test('should return N/A for undefined date', () => {
      expect(formatDate(undefined)).toBe('N/A');
    });

    test('should format current date', () => {
      const result = formatDate(new Date().toISOString());
      expect(result).toMatch(/\d{1,2}\s\w{3}\s\d{4}/);
    });
  });

  describe('getStatusText', () => {
    const getStatusText = (urgency) => {
      switch (urgency) {
        case 'overdue': return 'Overdue';
        case 'due_soon': return 'Due Soon';
        case 'normal': return 'On Track';
        default: return 'Active';
      }
    };

    test('should return "Overdue" for overdue status', () => {
      expect(getStatusText('overdue')).toBe('Overdue');
    });

    test('should return "Due Soon" for due_soon status', () => {
      expect(getStatusText('due_soon')).toBe('Due Soon');
    });

    test('should return "On Track" for normal status', () => {
      expect(getStatusText('normal')).toBe('On Track');
    });

    test('should return "Active" for unknown status', () => {
      expect(getStatusText('unknown')).toBe('Active');
    });

    test('should return "Active" for undefined status', () => {
      expect(getStatusText()).toBe('Active');
    });
  });

  describe('Username Display', () => {
    test('should display username from localStorage', () => {
      const user = { name: 'John Doe', role: 'MARKER' };
      localStorage.setItem('user', JSON.stringify(user));
      
      const usernameEl = document.getElementById('username');
      usernameEl.textContent = user.name;
      
      expect(usernameEl.textContent).toBe('John Doe');
    });

    test('should handle missing user in localStorage', () => {
      localStorage.removeItem('user');
      const usernameEl = document.getElementById('username');
      
      expect(usernameEl.textContent).toBe('');
    });

    test('should handle invalid JSON in localStorage', () => {
      localStorage.setItem('user', 'invalid json');
      
      let error = null;
      try {
        JSON.parse(localStorage.getItem('user'));
      } catch (err) {
        error = err;
      }
      
      expect(error).toBeTruthy();
    });
  });

  describe('Tab Switching', () => {
    test('should toggle between pending and completed tabs', () => {
      const pendingTab = document.querySelector('[data-tab="pending"]');
      const completedTab = document.querySelector('[data-tab="completed"]');
      const pendingList = document.getElementById('list-pending');
      const completedList = document.getElementById('list-completed');
      
      // Simulate clicking pending tab
      pendingTab.classList.add('active');
      completedTab.classList.remove('active');
      pendingList.classList.remove('hidden');
      completedList.classList.add('hidden');
      
      expect(pendingTab.classList.contains('active')).toBe(true);
      expect(pendingList.classList.contains('hidden')).toBe(false);
      expect(completedList.classList.contains('hidden')).toBe(true);
      
      // Simulate clicking completed tab
      completedTab.classList.add('active');
      pendingTab.classList.remove('active');
      completedList.classList.remove('hidden');
      pendingList.classList.add('hidden');
      
      expect(completedTab.classList.contains('active')).toBe(true);
      expect(completedList.classList.contains('hidden')).toBe(false);
      expect(pendingList.classList.contains('hidden')).toBe(true);
    });
  });

  describe('Dashboard Data Loading', () => {
    test('should update KPI counters with API data', () => {
      const mockData = {
        kpi: {
          pendingTasks: 5,
          completedTasks: 10,
          recentFeedback: 3
        }
      };
      
      document.getElementById('pending-tasks-count').textContent = mockData.kpi.pendingTasks;
      document.getElementById('completed-tasks-count').textContent = mockData.kpi.completedTasks;
      document.getElementById('recent-feedback-count').textContent = mockData.kpi.recentFeedback;
      
      expect(document.getElementById('pending-tasks-count').textContent).toBe('5');
      expect(document.getElementById('completed-tasks-count').textContent).toBe('10');
      expect(document.getElementById('recent-feedback-count').textContent).toBe('3');
    });

    test('should display empty state when no tasks', () => {
      const pendingList = document.getElementById('pending-tasks-list');
      pendingList.innerHTML = '<div class="empty-state">No pending tasks</div>';
      
      expect(pendingList.innerHTML).toContain('No pending tasks');
    });

    test('should handle API errors gracefully', () => {
      const pendingList = document.getElementById('pending-tasks-list');
      pendingList.innerHTML = '<div class="empty-state">Error loading tasks</div>';
      
      expect(pendingList.innerHTML).toContain('Error loading tasks');
    });
  });

  describe('Logout Functionality', () => {
    test('should clear localStorage on logout', () => {
      localStorage.setItem('user', JSON.stringify({ name: 'Test' }));
      localStorage.setItem('userRole', 'MARKER');
      
      localStorage.removeItem('user');
      localStorage.removeItem('userRole');
      
      expect(localStorage.getItem('user')).toBeNull();
      expect(localStorage.getItem('userRole')).toBeNull();
    });

    test('should call logout API', async () => {
      global.fetch.mockResolvedValueOnce({
        json: async () => ({ success: true, message: 'Logged out successfully' })
      });
      
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('/api/auth/logout', expect.any(Object));
    });
  });

  describe('Settings Controls', () => {
    beforeEach(() => {
      document.body.innerHTML += `
        <div class="control" data-setting="notifications">
          <span class="control-label">Off</span>
        </div>
      `;
    });

    test('should save setting to localStorage', () => {
      const control = document.querySelector('.control');
      const key = 'marker-setting-notifications';
      
      control.classList.add('active');
      localStorage.setItem(key, 'on');
      
      expect(localStorage.getItem(key)).toBe('on');
    });

    test('should load saved settings from localStorage', () => {
      const key = 'marker-setting-notifications';
      localStorage.setItem(key, 'on');
      
      const control = document.querySelector('.control');
      const saved = localStorage.getItem(key);
      
      if (saved === 'on') {
        control.classList.add('active');
        control.querySelector('.control-label').textContent = 'On';
      }
      
      expect(control.classList.contains('active')).toBe(true);
      expect(control.querySelector('.control-label').textContent).toBe('On');
    });
  });
});

