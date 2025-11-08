// Task Management Interactive - Enhanced task management system
(function() {
  'use strict';

  // Enhanced data management
  const TaskData = {
    assignments: [
      {
        id: 'a1',
        title: '2025 · Semester 1 · Assignment 1',
        status: 'upcoming',
        dueDate: '2025-03-10',
        createdDate: '2025-01-15',
        progress: 0,
        markers: 8,
        completedMarkers: 0,
        priority: 'high',
        description: 'Research methodology and data analysis assignment',
        rubricUrl: null,
        assignmentUrl: null,
        tags: ['research', 'methodology']
      },
      {
        id: 'a2',
        title: '2025 · Semester 1 · Assignment 2',
        status: 'upcoming',
        dueDate: '2025-03-20',
        createdDate: '2025-01-20',
        progress: 0,
        markers: 6,
        completedMarkers: 0,
        priority: 'medium',
        description: 'Literature review and critical analysis',
        rubricUrl: null,
        assignmentUrl: null,
        tags: ['literature', 'analysis']
      },
      {
        id: 'a3',
        title: '2024 · Semester 1 · Assignment 1',
        status: 'completed',
        dueDate: '2024-03-15',
        createdDate: '2024-01-10',
        progress: 100,
        markers: 10,
        completedMarkers: 10,
        priority: 'low',
        description: 'Completed assignment from previous semester',
        rubricUrl: '#',
        assignmentUrl: '#',
        tags: ['completed', 'archived']
      }
    ],
    filters: {
      status: 'all',
      priority: 'all',
      search: '',
      dateRange: 'all'
    },
    sortBy: 'dueDate',
    sortOrder: 'asc',
    viewMode: 'grid' // grid or list
  };

  // UI Elements
  let elements = {};

  // State management
  let state = {
    selectedTasks: new Set(),
    isBulkMode: false,
    draggedTask: null,
    hoveredTask: null
  };

  // Initialize the interactive task management system
  function init() {
    cacheElements();
    setupEventListeners();
    createEnhancedUI();
    loadTasks();
    setupAdvancedFeatures();
    startAutoRefresh();
  }

  // Cache DOM elements
  function cacheElements() {
    elements = {
      upcomingList: document.getElementById('upcomingList'),
      completedList: document.getElementById('completedList'),
      btnAdd: document.getElementById('btnAdd'),
      modal: document.getElementById('modal'),
      // New elements we'll create
      searchInput: null,
      filterControls: null,
      viewToggle: null,
      bulkActions: null,
      taskStats: null,
      sortControls: null
    };
  }

  // Setup event listeners
  function setupEventListeners() {
    // Enhanced button handlers
    setupButtonHandlers();
    
    // Search and filtering
    setupSearchAndFilters();
    
    // Drag and drop
    setupDragAndDrop();
    
    // Keyboard shortcuts
    setupKeyboardShortcuts();
    
    // Modal enhancements
    setupModalEnhancements();
  }

  // Enhanced button handlers
  function setupButtonHandlers() {
    // View Rubric with enhanced feedback
    document.addEventListener('click', (e) => {
      if (e.target.textContent === 'View Rubric') {
        handleViewRubric(e);
      } else if (e.target.textContent === 'Mark Assignment') {
        handleMarkAssignment(e);
      } else if (e.target.textContent === 'View Analysis') {
        handleViewAnalysis(e);
      }
    });
  }

  function handleViewRubric(e) {
    const button = e.target;
    const taskBox = button.closest('.tm-box');
    const taskId = taskBox.dataset.taskId;
    const task = TaskData.assignments.find(a => a.id === taskId);
    
    if (!task || !task.rubricUrl) {
      InteractionUtils.showToast('No rubric available for this assignment', 'warning');
      return;
    }
    
    InteractionUtils.showLoading(button, 'Opening Rubric...');
    
    setTimeout(() => {
      const rubricId = generateRubricId(task.title);
      window.location.href = `rubric.html?rubric=${encodeURIComponent(rubricId)}`;
      InteractionUtils.hideLoading(button);
    }, 500);
  }

  function handleMarkAssignment(e) {
    const button = e.target;
    const taskBox = button.closest('.tm-box');
    const taskId = taskBox.dataset.taskId;
    const task = TaskData.assignments.find(a => a.id === taskId);
    
    InteractionUtils.showLoading(button, 'Opening Assignment...');
    
    setTimeout(() => {
      window.location.href = `mark-assignment.html?assignment=${taskId}`;
      InteractionUtils.hideLoading(button);
    }, 500);
  }

  function handleViewAnalysis(e) {
    const button = e.target;
    const taskBox = button.closest('.tm-box');
    const taskId = taskBox.dataset.taskId;
    const task = TaskData.assignments.find(a => a.id === taskId);
    
    InteractionUtils.showLoading(button, 'Opening Analysis...');
    
    setTimeout(() => {
      window.location.href = `feedback.html?assignment=${taskId}`;
      InteractionUtils.hideLoading(button);
    }, 500);
  }

  // Create enhanced UI elements
  function createEnhancedUI() {
    createSearchAndFilters();
    createViewControls();
    createBulkActions();
    createTaskStats();
    createSortControls();
  }

  function createSearchAndFilters() {
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'tm-controls';
    controlsContainer.innerHTML = `
      <div class="tm-search-group">
        <div class="tm-search-box">
          <input type="text" id="taskSearch" placeholder="Search assignments..." class="tm-search-input">
          <div class="tm-search-icon">🔍</div>
        </div>
        <div class="tm-filter-group">
          <select id="statusFilter" class="tm-filter-select">
            <option value="all">All Status</option>
            <option value="upcoming">Upcoming</option>
            <option value="in-progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
          <select id="priorityFilter" class="tm-filter-select">
            <option value="all">All Priority</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select id="dateFilter" class="tm-filter-select">
            <option value="all">All Dates</option>
            <option value="this-week">This Week</option>
            <option value="this-month">This Month</option>
            <option value="next-month">Next Month</option>
          </select>
        </div>
      </div>
    `;
    
    // Insert before the main content
    const main = document.querySelector('.main');
    main.insertBefore(controlsContainer, main.firstChild);
    
    // Cache elements
    elements.searchInput = document.getElementById('taskSearch');
    elements.statusFilter = document.getElementById('statusFilter');
    elements.priorityFilter = document.getElementById('priorityFilter');
    elements.dateFilter = document.getElementById('dateFilter');
  }

  function createViewControls() {
    const viewControls = document.createElement('div');
    viewControls.className = 'tm-view-controls';
    viewControls.innerHTML = `
      <div class="tm-view-toggle">
        <button class="tm-view-btn active" data-view="grid">⊞</button>
        <button class="tm-view-btn" data-view="list">☰</button>
      </div>
      <div class="tm-sort-controls">
        <select id="sortSelect" class="tm-sort-select">
          <option value="dueDate">Sort by Due Date</option>
          <option value="createdDate">Sort by Created Date</option>
          <option value="title">Sort by Title</option>
          <option value="priority">Sort by Priority</option>
          <option value="progress">Sort by Progress</option>
        </select>
        <button id="sortOrder" class="tm-sort-order" data-order="asc">↑</button>
      </div>
    `;
    
    const controlsContainer = document.querySelector('.tm-controls');
    controlsContainer.appendChild(viewControls);
    
    // Cache elements
    elements.viewToggle = viewControls.querySelector('.tm-view-toggle');
    elements.sortControls = viewControls.querySelector('.tm-sort-controls');
  }

  function createBulkActions() {
    const bulkActions = document.createElement('div');
    bulkActions.className = 'tm-bulk-actions hidden';
    bulkActions.innerHTML = `
      <div class="tm-bulk-info">
        <span id="bulkCount">0</span> tasks selected
      </div>
      <div class="tm-bulk-buttons">
        <button id="bulkEdit" class="tm-bulk-btn">Edit</button>
        <button id="bulkDelete" class="tm-bulk-btn danger">Delete</button>
        <button id="bulkArchive" class="tm-bulk-btn">Archive</button>
        <button id="bulkExport" class="tm-bulk-btn">Export</button>
        <button id="bulkCancel" class="tm-bulk-btn">Cancel</button>
      </div>
    `;
    
    const controlsContainer = document.querySelector('.tm-controls');
    controlsContainer.appendChild(bulkActions);
    
    elements.bulkActions = bulkActions;
  }

  function createTaskStats() {
    const statsContainer = document.createElement('div');
    statsContainer.className = 'tm-stats';
    statsContainer.innerHTML = `
      <div class="tm-stat">
        <div class="tm-stat-value" id="totalTasks">0</div>
        <div class="tm-stat-label">Total Tasks</div>
      </div>
      <div class="tm-stat">
        <div class="tm-stat-value" id="upcomingTasks">0</div>
        <div class="tm-stat-label">Upcoming</div>
      </div>
      <div class="tm-stat">
        <div class="tm-stat-value" id="completedTasks">0</div>
        <div class="tm-stat-label">Completed</div>
      </div>
      <div class="tm-stat">
        <div class="tm-stat-value" id="avgProgress">0%</div>
        <div class="tm-stat-label">Avg Progress</div>
      </div>
    `;
    
    const main = document.querySelector('.main');
    main.insertBefore(statsContainer, main.querySelector('.tm-panel'));
    
    elements.taskStats = statsContainer;
  }

  function createSortControls() {
    // Sort controls are already created in createViewControls
    elements.sortSelect = document.getElementById('sortSelect');
    elements.sortOrder = document.getElementById('sortOrder');
  }

  // Setup search and filtering
  function setupSearchAndFilters() {
    // Search input
    elements.searchInput.addEventListener('input', debounce(handleSearch, 300));
    
    // Filter selects
    elements.statusFilter.addEventListener('change', applyFilters);
    elements.priorityFilter.addEventListener('change', applyFilters);
    elements.dateFilter.addEventListener('change', applyFilters);
    
    // Sort controls
    elements.sortSelect.addEventListener('change', applySorting);
    elements.sortOrder.addEventListener('click', toggleSortOrder);
    
    // View toggle
    elements.viewToggle.addEventListener('click', (e) => {
      if (e.target.classList.contains('tm-view-btn')) {
        const view = e.target.dataset.view;
        setViewMode(view);
      }
    });
  }

  function handleSearch(e) {
    TaskData.filters.search = e.target.value.toLowerCase();
    applyFilters();
  }

  function applyFilters() {
    TaskData.filters.status = elements.statusFilter.value;
    TaskData.filters.priority = elements.priorityFilter.value;
    TaskData.filters.dateRange = elements.dateFilter.value;
    
    const filtered = filterTasks(TaskData.assignments);
    const sorted = sortTasks(filtered);
    renderTasks(sorted);
    updateStats();
  }

  function filterTasks(tasks) {
    return tasks.filter(task => {
      // Search filter
      if (TaskData.filters.search && !task.title.toLowerCase().includes(TaskData.filters.search)) {
        return false;
      }
      
      // Status filter
      if (TaskData.filters.status !== 'all' && task.status !== TaskData.filters.status) {
        return false;
      }
      
      // Priority filter
      if (TaskData.filters.priority !== 'all' && task.priority !== TaskData.filters.priority) {
        return false;
      }
      
      // Date filter
      if (TaskData.filters.dateRange !== 'all') {
        const taskDate = new Date(task.dueDate);
        const now = new Date();
        
        switch (TaskData.filters.dateRange) {
          case 'this-week':
            const weekStart = new Date(now.getTime() - now.getDay() * 24 * 60 * 60 * 1000);
            const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
            return taskDate >= weekStart && taskDate <= weekEnd;
          case 'this-month':
            return taskDate.getMonth() === now.getMonth() && taskDate.getFullYear() === now.getFullYear();
          case 'next-month':
            const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0);
            return taskDate >= nextMonth && taskDate <= nextMonthEnd;
        }
      }
      
      return true;
    });
  }

  function applySorting() {
    TaskData.sortBy = elements.sortSelect.value;
    const filtered = filterTasks(TaskData.assignments);
    const sorted = sortTasks(filtered);
    renderTasks(sorted);
  }

  function toggleSortOrder() {
    TaskData.sortOrder = TaskData.sortOrder === 'asc' ? 'desc' : 'asc';
    elements.sortOrder.textContent = TaskData.sortOrder === 'asc' ? '↑' : '↓';
    applySorting();
  }

  function sortTasks(tasks) {
    return tasks.sort((a, b) => {
      let aVal, bVal;
      
      switch (TaskData.sortBy) {
        case 'dueDate':
          aVal = new Date(a.dueDate);
          bVal = new Date(b.dueDate);
          break;
        case 'createdDate':
          aVal = new Date(a.createdDate);
          bVal = new Date(b.createdDate);
          break;
        case 'title':
          aVal = a.title.toLowerCase();
          bVal = b.title.toLowerCase();
          break;
        case 'priority':
          const priorityOrder = { high: 3, medium: 2, low: 1 };
          aVal = priorityOrder[a.priority] || 0;
          bVal = priorityOrder[b.priority] || 0;
          break;
        case 'progress':
          aVal = a.progress;
          bVal = b.progress;
          break;
        default:
          return 0;
      }
      
      if (aVal < bVal) return TaskData.sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return TaskData.sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }

  function setViewMode(mode) {
    TaskData.viewMode = mode;
    
    // Update view toggle buttons
    elements.viewToggle.querySelectorAll('.tm-view-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === mode);
    });
    
    // Update task containers
    const upcomingList = elements.upcomingList;
    const completedList = elements.completedList;
    
    if (mode === 'list') {
      upcomingList.classList.add('list-view');
      completedList.classList.add('list-view');
    } else {
      upcomingList.classList.remove('list-view');
      completedList.classList.remove('list-view');
    }
    
    // Re-render tasks
    applyFilters();
  }

  // Setup drag and drop
  function setupDragAndDrop() {
    // Enable drag and drop for task cards
    document.addEventListener('dragstart', handleDragStart);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);
    document.addEventListener('dragend', handleDragEnd);
  }

  function handleDragStart(e) {
    const taskBox = e.target.closest('.tm-box');
    if (!taskBox) return;
    
    state.draggedTask = taskBox;
    taskBox.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', taskBox.outerHTML);
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    const taskBox = e.target.closest('.tm-box');
    if (taskBox && taskBox !== state.draggedTask) {
      taskBox.classList.add('drag-over');
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    
    const taskBox = e.target.closest('.tm-box');
    if (taskBox && taskBox !== state.draggedTask) {
      // Handle task reordering
      const container = taskBox.parentNode;
      const draggedElement = state.draggedTask;
      
      if (e.clientY < taskBox.offsetTop + taskBox.offsetHeight / 2) {
        container.insertBefore(draggedElement, taskBox);
      } else {
        container.insertBefore(draggedElement, taskBox.nextSibling);
      }
      
      // Update task order in data
      updateTaskOrder();
    }
    
    // Clean up drag over classes
    document.querySelectorAll('.tm-box').forEach(box => {
      box.classList.remove('drag-over');
    });
  }

  function handleDragEnd(e) {
    if (state.draggedTask) {
      state.draggedTask.classList.remove('dragging');
      state.draggedTask = null;
    }
    
    // Clean up drag over classes
    document.querySelectorAll('.tm-box').forEach(box => {
      box.classList.remove('drag-over');
    });
  }

  function updateTaskOrder() {
    // Update the order of tasks in the data based on DOM order
    const upcomingTasks = Array.from(elements.upcomingList.children);
    const completedTasks = Array.from(elements.completedList.children);
    
    // Update task order (simplified - in real app, would update server)
    console.log('Task order updated');
  }

  // Setup keyboard shortcuts
  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + A to select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && !state.isBulkMode) {
        e.preventDefault();
        enableBulkMode();
        selectAllTasks();
      }
      
      // Escape to cancel bulk mode
      if (e.key === 'Escape' && state.isBulkMode) {
        disableBulkMode();
      }
      
      // Delete key to delete selected tasks
      if (e.key === 'Delete' && state.isBulkMode && state.selectedTasks.size > 0) {
        e.preventDefault();
        handleBulkDelete();
      }
    });
  }

  // Setup modal enhancements
  function setupModalEnhancements() {
    const modal = elements.modal;
    const form = modal.querySelector('form') || modal;
    
    // Enhanced form validation
    form.addEventListener('submit', handleFormSubmit);
    
    // Real-time validation
    const inputs = modal.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
      input.addEventListener('blur', validateField);
      input.addEventListener('input', clearFieldError);
    });
    
    // File upload enhancements
    setupFileUploadEnhancements();
  }

  function handleFormSubmit(e) {
    e.preventDefault();
    
    if (validateForm()) {
      submitForm();
    }
  }

  function validateForm() {
    const name = document.getElementById('asgnName').value.trim();
    const due = document.getElementById('asgnDue').value.trim();
    const rubricFile = document.getElementById('rubricFile').files[0];
    const assignmentFile = document.getElementById('asgnFile').files[0];
    
    let isValid = true;
    
    if (!name) {
      showFieldError('asgnName', 'Assignment name is required');
      isValid = false;
    }
    
    if (!due) {
      showFieldError('asgnDue', 'Due date is required');
      isValid = false;
    }
    
    if (!rubricFile) {
      showFieldError('rubricFile', 'Rubric file is required');
      isValid = false;
    }
    
    if (!assignmentFile) {
      showFieldError('asgnFile', 'Assignment file is required');
      isValid = false;
    }
    
    return isValid;
  }

  function validateField(e) {
    const field = e.target;
    const value = field.value.trim();
    
    if (field.required && !value) {
      showFieldError(field.id, 'This field is required');
    } else {
      clearFieldError(field.id);
    }
  }

  function clearFieldError(fieldId) {
    const field = document.getElementById(fieldId);
    const errorEl = field.parentNode.querySelector('.field-error');
    if (errorEl) {
      errorEl.remove();
    }
    field.classList.remove('error');
  }

  function showFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    field.classList.add('error');
    
    // Remove existing error
    const existingError = field.parentNode.querySelector('.field-error');
    if (existingError) {
      existingError.remove();
    }
    
    // Add new error
    const errorEl = document.createElement('div');
    errorEl.className = 'field-error';
    errorEl.textContent = message;
    field.parentNode.appendChild(errorEl);
  }

  function submitForm() {
    const btnSubmit = document.getElementById('btnSubmit');
    InteractionUtils.showLoading(btnSubmit, 'Creating Assignment...');
    
    // Simulate API call
    setTimeout(() => {
      const newTask = {
        id: 'a' + Date.now(),
        title: document.getElementById('asgnName').value.trim(),
        status: 'upcoming',
        dueDate: document.getElementById('asgnDue').value,
        createdDate: new Date().toISOString().split('T')[0],
        progress: 0,
        markers: 0,
        completedMarkers: 0,
        priority: 'medium',
        description: '',
        rubricUrl: null,
        assignmentUrl: null,
        tags: []
      };
      
      TaskData.assignments.unshift(newTask);
      renderTasks(TaskData.assignments);
      updateStats();
      
      // Close modal and reset form
      closeModal();
      resetForm();
      
      InteractionUtils.hideLoading(btnSubmit);
      InteractionUtils.showToast('Assignment created successfully!', 'success');
    }, 1500);
  }

  function resetForm() {
    document.getElementById('asgnName').value = '';
    document.getElementById('asgnDue').value = '';
    document.getElementById('rubricFile').value = '';
    document.getElementById('asgnFile').value = '';
    
    // Reset file display
    document.getElementById('rubricText').textContent = 'Upload rubric...';
    document.getElementById('asgnText').textContent = 'Upload assignment...';
    
    // Clear errors
    document.querySelectorAll('.field-error').forEach(el => el.remove());
    document.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
  }

  function setupFileUploadEnhancements() {
    // Enhanced file upload with progress and validation
    const fileInputs = document.querySelectorAll('input[type="file"]');
    
    fileInputs.forEach(input => {
      input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          validateFile(file, input);
          showFilePreview(file, input);
        }
      });
    });
  }

  function validateFile(file, input) {
    const accept = input.accept;
    const maxSize = 10 * 1024 * 1024; // 10MB
    
    if (file.size > maxSize) {
      showFieldError(input.id, 'File size must be less than 10MB');
      input.value = '';
      return false;
    }
    
    if (accept && !accept.split(',').some(type => file.name.toLowerCase().endsWith(type.trim()))) {
      showFieldError(input.id, `File type must be one of: ${accept}`);
      input.value = '';
      return false;
    }
    
    return true;
  }

  function showFilePreview(file, input) {
    const textEl = input.parentNode.querySelector('[id$="Text"]');
    if (textEl) {
      textEl.textContent = file.name;
      textEl.classList.add('file-selected');
    }
  }

  // Enhanced task rendering
  function renderTasks(tasks) {
    const upcoming = tasks.filter(task => task.status === 'upcoming');
    const completed = tasks.filter(task => task.status === 'completed');
    
    renderTaskList(upcoming, elements.upcomingList);
    renderTaskList(completed, elements.completedList);
  }

  function renderTaskList(tasks, container) {
    container.innerHTML = '';
    
    if (tasks.length === 0) {
      container.innerHTML = '<div class="tm-empty">No tasks found</div>';
      return;
    }
    
    tasks.forEach(task => {
      const taskBox = createTaskBox(task);
      container.appendChild(taskBox);
    });
  }

  function createTaskBox(task) {
    const box = document.createElement('div');
    box.className = 'tm-box enhanced';
    box.dataset.taskId = task.id;
    box.draggable = true;
    
    // Add priority indicator
    box.classList.add(`priority-${task.priority}`);
    
    // Add status indicator
    if (task.progress > 0) {
      box.classList.add('in-progress');
    }
    
    box.innerHTML = `
      <div class="tm-task-header">
        <div class="tm-task-title">
          <h4>${task.title}</h4>
          <div class="tm-task-meta">
            <span class="tm-due-date">Due: ${formatDate(task.dueDate)}</span>
            <span class="tm-priority priority-${task.priority}">${task.priority}</span>
          </div>
        </div>
        <div class="tm-task-actions">
          <button class="tm-action-btn" data-action="edit" title="Edit Task">✏️</button>
          <button class="tm-action-btn" data-action="duplicate" title="Duplicate Task">📋</button>
          <button class="tm-action-btn" data-action="archive" title="Archive Task">📦</button>
        </div>
      </div>
      
      <div class="tm-task-content">
        <div class="tm-task-description">${task.description || 'No description provided'}</div>
        
        <div class="tm-task-progress">
          <div class="tm-progress-bar">
            <div class="tm-progress-fill" style="width: ${task.progress}%"></div>
          </div>
          <span class="tm-progress-text">${task.progress}% complete</span>
        </div>
        
        <div class="tm-task-stats">
          <div class="tm-stat">
            <span class="tm-stat-value">${task.completedMarkers}/${task.markers}</span>
            <span class="tm-stat-label">Markers</span>
          </div>
          <div class="tm-stat">
            <span class="tm-stat-value">${task.tags.length}</span>
            <span class="tm-stat-label">Tags</span>
          </div>
        </div>
      </div>
      
      <div class="tm-task-footer">
        <div class="tm-button-row">
          <button class="btn btn-primary" onclick="handleViewRubric(event)">View Rubric</button>
          <button class="btn btn-secondary" onclick="handleMarkAssignment(event)">Mark Assignment</button>
          <button class="btn btn-tertiary" onclick="handleViewAnalysis(event)">View Analysis</button>
        </div>
      </div>
    `;
    
    // Add event listeners
    setupTaskBoxEvents(box, task);
    
    return box;
  }

  function setupTaskBoxEvents(box, task) {
    // Task selection for bulk operations
    box.addEventListener('click', (e) => {
      if (e.target.closest('.tm-action-btn')) return;
      if (e.target.closest('.btn')) return;
      
      if (state.isBulkMode) {
        toggleTaskSelection(box, task.id);
      }
    });
    
    // Action buttons
    box.querySelectorAll('.tm-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        handleTaskAction(action, task);
      });
    });
    
    // Hover effects
    box.addEventListener('mouseenter', () => {
      state.hoveredTask = task.id;
      box.classList.add('hovered');
    });
    
    box.addEventListener('mouseleave', () => {
      state.hoveredTask = null;
      box.classList.remove('hovered');
    });
  }

  function handleTaskAction(action, task) {
    switch (action) {
      case 'edit':
        editTask(task);
        break;
      case 'duplicate':
        duplicateTask(task);
        break;
      case 'archive':
        archiveTask(task);
        break;
    }
  }

  function editTask(task) {
    // Open modal with task data pre-filled
    const modal = elements.modal;
    const nameInput = document.getElementById('asgnName');
    const dueInput = document.getElementById('asgnDue');
    
    nameInput.value = task.title;
    dueInput.value = task.dueDate;
    
    modal.classList.add('show');
  }

  function duplicateTask(task) {
    const newTask = {
      ...task,
      id: 'a' + Date.now(),
      title: task.title + ' (Copy)',
      status: 'upcoming',
      progress: 0,
      completedMarkers: 0
    };
    
    TaskData.assignments.unshift(newTask);
    renderTasks(TaskData.assignments);
    updateStats();
    
    InteractionUtils.showToast('Task duplicated successfully!', 'success');
  }

  function archiveTask(task) {
    task.status = 'completed';
    task.progress = 100;
    
    renderTasks(TaskData.assignments);
    updateStats();
    
    InteractionUtils.showToast('Task archived successfully!', 'success');
  }

  // Bulk operations
  function enableBulkMode() {
    state.isBulkMode = true;
    elements.bulkActions.classList.remove('hidden');
    
    // Add selection checkboxes to task boxes
    document.querySelectorAll('.tm-box').forEach(box => {
      box.classList.add('selectable');
    });
  }

  function disableBulkMode() {
    state.isBulkMode = false;
    state.selectedTasks.clear();
    elements.bulkActions.classList.add('hidden');
    
    // Remove selection checkboxes
    document.querySelectorAll('.tm-box').forEach(box => {
      box.classList.remove('selectable', 'selected');
    });
    
    updateBulkInfo();
  }

  function selectAllTasks() {
    document.querySelectorAll('.tm-box').forEach(box => {
      const taskId = box.dataset.taskId;
      state.selectedTasks.add(taskId);
      box.classList.add('selected');
    });
    
    updateBulkInfo();
  }

  function toggleTaskSelection(box, taskId) {
    if (state.selectedTasks.has(taskId)) {
      state.selectedTasks.delete(taskId);
      box.classList.remove('selected');
    } else {
      state.selectedTasks.add(taskId);
      box.classList.add('selected');
    }
    
    updateBulkInfo();
  }

  function updateBulkInfo() {
    const count = state.selectedTasks.size;
    document.getElementById('bulkCount').textContent = count;
    
    // Enable/disable bulk buttons based on selection
    const bulkButtons = elements.bulkActions.querySelectorAll('.tm-bulk-btn:not(#bulkCancel)');
    bulkButtons.forEach(btn => {
      btn.disabled = count === 0;
    });
  }

  function handleBulkDelete() {
    if (state.selectedTasks.size === 0) return;
    
    if (confirm(`Are you sure you want to delete ${state.selectedTasks.size} task(s)?`)) {
      // Remove selected tasks
      state.selectedTasks.forEach(taskId => {
        const index = TaskData.assignments.findIndex(a => a.id === taskId);
        if (index > -1) {
          TaskData.assignments.splice(index, 1);
        }
      });
      
      renderTasks(TaskData.assignments);
      updateStats();
      disableBulkMode();
      
      InteractionUtils.showToast(`${state.selectedTasks.size} task(s) deleted successfully!`, 'success');
    }
  }

  // Statistics and updates
  function updateStats() {
    const total = TaskData.assignments.length;
    const upcoming = TaskData.assignments.filter(a => a.status === 'upcoming').length;
    const completed = TaskData.assignments.filter(a => a.status === 'completed').length;
    const avgProgress = TaskData.assignments.reduce((sum, a) => sum + a.progress, 0) / total || 0;
    
    document.getElementById('totalTasks').textContent = total;
    document.getElementById('upcomingTasks').textContent = upcoming;
    document.getElementById('completedTasks').textContent = completed;
    document.getElementById('avgProgress').textContent = Math.round(avgProgress) + '%';
  }

  function loadTasks() {
    renderTasks(TaskData.assignments);
    updateStats();
  }

  function startAutoRefresh() {
    // Auto-refresh every 30 seconds
    setInterval(() => {
      // In a real app, this would fetch updated data from the server
      updateStats();
    }, 30000);
  }

  // Advanced features
  function setupAdvancedFeatures() {
    setupTaskTemplates();
    setupExportFunctionality();
    setupKeyboardShortcuts();
  }

  function setupTaskTemplates() {
    // Add template functionality
    const templateBtn = document.createElement('button');
    templateBtn.className = 'btn btn-secondary';
    templateBtn.textContent = 'Use Template';
    templateBtn.style.marginLeft = '10px';
    
    const btnAdd = elements.btnAdd;
    btnAdd.parentNode.insertBefore(templateBtn, btnAdd.nextSibling);
    
    templateBtn.addEventListener('click', showTemplateModal);
  }

  function showTemplateModal() {
    // Create template selection modal
    const modal = document.createElement('div');
    modal.className = 'tm-modal show';
    modal.innerHTML = `
      <div class="tm-dialog">
        <div class="tm-dialog-hd">
          <h3>Choose Template</h3>
          <button class="btn" onclick="this.closest('.tm-modal').remove()">Close</button>
        </div>
        <div class="tm-dialog-bd">
          <div class="tm-template-grid">
            <div class="tm-template-card" data-template="research">
              <h4>Research Assignment</h4>
              <p>Methodology and data analysis</p>
            </div>
            <div class="tm-template-card" data-template="literature">
              <h4>Literature Review</h4>
              <p>Critical analysis and synthesis</p>
            </div>
            <div class="tm-template-card" data-template="case-study">
              <h4>Case Study</h4>
              <p>Real-world application analysis</p>
            </div>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add template selection handlers
    modal.querySelectorAll('.tm-template-card').forEach(card => {
      card.addEventListener('click', () => {
        const template = card.dataset.template;
        applyTemplate(template);
        modal.remove();
      });
    });
  }

  function applyTemplate(template) {
    const templates = {
      research: {
        title: 'Research Assignment Template',
        description: 'Methodology and data analysis assignment',
        tags: ['research', 'methodology', 'data-analysis']
      },
      literature: {
        title: 'Literature Review Template',
        description: 'Critical analysis and synthesis of existing research',
        tags: ['literature', 'analysis', 'synthesis']
      },
      'case-study': {
        title: 'Case Study Template',
        description: 'Real-world application and problem-solving',
        tags: ['case-study', 'application', 'problem-solving']
      }
    };
    
    const templateData = templates[template];
    if (templateData) {
      // Pre-fill modal with template data
      document.getElementById('asgnName').value = templateData.title;
      // Open modal
      elements.modal.classList.add('show');
    }
  }

  function setupExportFunctionality() {
    // Add export functionality
    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn btn-secondary';
    exportBtn.textContent = 'Export';
    exportBtn.style.marginLeft = '10px';
    
    const btnAdd = elements.btnAdd;
    btnAdd.parentNode.insertBefore(exportBtn, btnAdd.nextSibling);
    
    exportBtn.addEventListener('click', exportTasks);
  }

  function exportTasks() {
    const data = TaskData.assignments.map(task => ({
      title: task.title,
      status: task.status,
      dueDate: task.dueDate,
      progress: task.progress,
      priority: task.priority,
      markers: task.markers,
      completedMarkers: task.completedMarkers
    }));
    
    const csv = convertToCSV(data);
    downloadCSV(csv, 'tasks.csv');
    
    InteractionUtils.showToast('Tasks exported successfully!', 'success');
  }

  function convertToCSV(data) {
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(header => `"${row[header]}"`).join(','))
    ].join('\n');
    
    return csvContent;
  }

  function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  // Utility functions
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function generateRubricId(title) {
    const match = title.match(/(\d{4})\s*·\s*Semester\s*(\d+)\s*·\s*Assignment\s*(\d+)/);
    if (match) {
      const [, year, semester, assignment] = match;
      return `assignment_${assignment}_${year}_sem${semester}`;
    }
    return 'demo';
  }

  function closeModal() {
    elements.modal.classList.remove('show');
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Export for global access
  window.TaskManagementInteractive = {
    loadTasks,
    applyFilters,
    updateStats,
    enableBulkMode,
    disableBulkMode
  };
})();
