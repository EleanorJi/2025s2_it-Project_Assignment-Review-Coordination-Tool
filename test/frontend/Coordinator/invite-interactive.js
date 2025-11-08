// Invite Interactive - Enhanced marker invitation system
(function() {
  'use strict';

  // Enhanced data management
  const InviteData = {
    markers: [
      { email: 'alice.smith@deakin.edu.au', name: 'Alice Smith', department: 'Psychology', status: 'active', lastActive: '2025-01-15' },
      { email: 'bob.jones@deakin.edu.au', name: 'Bob Jones', department: 'Education', status: 'pending', lastActive: '2025-01-10' },
      { email: 'carol.wilson@deakin.edu.au', name: 'Carol Wilson', department: 'Psychology', status: 'expired', lastActive: '2024-12-20' },
      { email: 'david.brown@deakin.edu.au', name: 'David Brown', department: 'Education', status: 'active', lastActive: '2025-01-14' },
      { email: 'eve.davis@deakin.edu.au', name: 'Eve Davis', department: 'Psychology', status: 'closed', lastActive: '2024-11-30' }
    ],
    assignments: [
      { id: 'a1', name: 'Assignment 1 · Round 1', dueDate: '2025-03-10', status: 'active' },
      { id: 'a2', name: 'Assignment 1 · Round 2', dueDate: '2025-03-20', status: 'active' },
      { id: 'a3', name: 'Assignment 2 · Round 1', dueDate: '2025-04-15', status: 'locked' }
    ],
    expiryOptions: [
      { value: 1, label: '1 day' },
      { value: 3, label: '3 days' },
      { value: 7, label: '7 days' },
      { value: 14, label: '14 days' },
      { value: 30, label: '30 days' }
    ]
  };

  // UI Elements
  let elements = {};

  // State management
  let state = {
    selectedEmails: [],
    selectedAssignment: 'a1',
    selectedExpiry: 7,
    filteredMarkers: [],
    searchQuery: '',
    statusFilter: 'all',
    departmentFilter: 'all',
    isBulkMode: false,
    selectedRows: new Set()
  };

  // Initialize the interactive invite system
  function init() {
    cacheElements();
    setupEventListeners();
    initializeDropdowns();
    loadMarkers();
    setupAdvancedFeatures();
    startAutoRefresh();
  }

  // Cache DOM elements
  function cacheElements() {
    elements = {
      chipsContainer: document.getElementById('chips'),
      chipsList: document.getElementById('chipsList'),
      chipsInput: document.getElementById('chipsInput'),
      suggestDropdown: document.getElementById('suggest'),
      assignmentSelect: document.getElementById('assignmentSel'),
      expirySelect: document.getElementById('expirySel'),
      btnClear: document.getElementById('btnClear'),
      btnSend: document.getElementById('btnSend'),
      statusMessage: document.getElementById('status'),
      tableBody: document.getElementById('inviteTbody'),
      tableContainer: document.querySelector('.table-wrap'),
      // New elements we'll create
      searchInput: null,
      statusFilter: null,
      departmentFilter: null,
      bulkActions: null,
      markerStats: null
    };
  }

  // Setup event listeners
  function setupEventListeners() {
    // Enhanced chips input
    setupChipsInput();
    
    // Dropdown interactions
    setupDropdownInteractions();
    
    // Button actions
    setupButtonActions();
    
    // Table interactions
    setupTableInteractions();
    
    // Advanced features
    setupAdvancedInteractions();
  }

  // Enhanced chips input system
  function setupChipsInput() {
    const input = elements.chipsInput;
    
    // Enhanced input validation
    input.addEventListener('input', handleInputChange);
    input.addEventListener('keydown', handleKeyDown);
    input.addEventListener('paste', handlePaste);
    input.addEventListener('focus', handleInputFocus);
    input.addEventListener('blur', handleInputBlur);
    
    // Auto-complete suggestions
    input.addEventListener('input', debounce(handleAutoComplete, 300));
  }

  function handleInputChange(e) {
    const value = e.target.value;
    
    // Real-time validation
    validateInput(value);
    
    // Update suggestions
    updateSuggestions(value);
    
    // Show input hints
    showInputHints(value);
  }

  function handleKeyDown(e) {
    switch(e.key) {
      case 'Enter':
      case ',':
      case ';':
        e.preventDefault();
        addEmailsFromInput();
        break;
      case 'Backspace':
        if (!e.target.value && state.selectedEmails.length > 0) {
          removeLastEmail();
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        navigateSuggestions(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        navigateSuggestions(-1);
        break;
      case 'Tab':
        e.preventDefault();
        selectActiveSuggestion();
        break;
      case 'Escape':
        closeSuggestions();
        break;
    }
  }

  function handlePaste(e) {
    setTimeout(() => {
      const pastedText = e.target.value;
      const emails = extractEmailsFromText(pastedText);
      
      if (emails.length > 0) {
        addEmails(emails);
        e.target.value = '';
        showPasteFeedback(emails.length);
      }
    }, 0);
  }

  function handleInputFocus() {
    elements.chipsContainer.classList.add('focused');
    updateSuggestions(elements.chipsInput.value);
  }

  function handleInputBlur() {
    setTimeout(() => {
      elements.chipsContainer.classList.remove('focused');
      if (elements.chipsInput.value.trim()) {
        addEmailsFromInput();
      }
      closeSuggestions();
    }, 150);
  }

  // Enhanced email validation
  function validateInput(value) {
    const emails = extractEmailsFromText(value);
    const validEmails = emails.filter(isValidEmail);
    const invalidEmails = emails.filter(email => !isValidEmail(email));
    
    // Show validation feedback
    showValidationFeedback(validEmails, invalidEmails);
    
    return { valid: validEmails, invalid: invalidEmails };
  }

  function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
    const domainRegex = /@deakin\.edu\.au$/i;
    
    return emailRegex.test(email) && domainRegex.test(email);
  }

  function extractEmailsFromText(text) {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    return text.match(emailRegex) || [];
  }

  // Enhanced suggestions system
  function updateSuggestions(query) {
    if (!query.trim()) {
      closeSuggestions();
      return;
    }
    
    const suggestions = getSuggestions(query);
    showSuggestions(suggestions);
  }

  function getSuggestions(query) {
    const lowerQuery = query.toLowerCase();
    
    // Get suggestions from existing markers
    const markerSuggestions = InviteData.markers
      .filter(marker => 
        marker.email.toLowerCase().includes(lowerQuery) ||
        marker.name.toLowerCase().includes(lowerQuery) ||
        marker.department.toLowerCase().includes(lowerQuery)
      )
      .map(marker => ({
        value: marker.email,
        label: marker.name,
        subtitle: marker.department,
        type: 'marker'
      }));
    
    // Get suggestions from history
    const history = loadEmailHistory();
    const historySuggestions = history
      .filter(email => 
        email.toLowerCase().includes(lowerQuery) &&
        !state.selectedEmails.includes(email)
      )
      .map(email => ({
        value: email,
        label: email,
        subtitle: 'Previously used',
        type: 'history'
      }));
    
    return [...markerSuggestions, ...historySuggestions].slice(0, 8);
  }

  function showSuggestions(suggestions) {
    if (suggestions.length === 0) {
      closeSuggestions();
      return;
    }
    
    const dropdown = elements.suggestDropdown;
    dropdown.innerHTML = suggestions.map((suggestion, index) => `
      <div class="suggest-item ${index === 0 ? 'active' : ''}" data-index="${index}">
        <div class="suggest-main">
          <span class="suggest-label">${suggestion.label}</span>
          <span class="suggest-value">${suggestion.value}</span>
        </div>
        <div class="suggest-subtitle">${suggestion.subtitle}</div>
        <div class="suggest-type">${suggestion.type}</div>
      </div>
    `).join('');
    
    dropdown.classList.remove('hidden');
    bindSuggestionClicks();
  }

  function bindSuggestionClicks() {
    elements.suggestDropdown.querySelectorAll('.suggest-item').forEach((item, index) => {
      item.addEventListener('click', () => selectSuggestion(index));
      item.addEventListener('mouseenter', () => setActiveSuggestion(index));
    });
  }

  function navigateSuggestions(direction) {
    const items = elements.suggestDropdown.querySelectorAll('.suggest-item');
    if (items.length === 0) return;
    
    const currentActive = elements.suggestDropdown.querySelector('.suggest-item.active');
    const currentIndex = currentActive ? Array.from(items).indexOf(currentActive) : -1;
    const newIndex = Math.max(0, Math.min(items.length - 1, currentIndex + direction));
    
    setActiveSuggestion(newIndex);
  }

  function setActiveSuggestion(index) {
    elements.suggestDropdown.querySelectorAll('.suggest-item').forEach((item, i) => {
      item.classList.toggle('active', i === index);
    });
  }

  function selectSuggestion(index) {
    const item = elements.suggestDropdown.querySelector(`[data-index="${index}"]`);
    if (!item) return;
    
    const email = item.querySelector('.suggest-value').textContent;
    addEmails([email]);
    elements.chipsInput.value = '';
    closeSuggestions();
  }

  function selectActiveSuggestion() {
    const activeItem = elements.suggestDropdown.querySelector('.suggest-item.active');
    if (activeItem) {
      const index = parseInt(activeItem.dataset.index);
      selectSuggestion(index);
    }
  }

  function closeSuggestions() {
    elements.suggestDropdown.classList.add('hidden');
    elements.suggestDropdown.innerHTML = '';
  }

  // Enhanced email management
  function addEmails(emails) {
    const validEmails = emails.filter(email => isValidEmail(email) && !state.selectedEmails.includes(email));
    
    if (validEmails.length > 0) {
      state.selectedEmails.push(...validEmails);
      renderChips();
      updateSendButton();
      showAddFeedback(validEmails.length);
    }
  }

  function addEmailsFromInput() {
    const value = elements.chipsInput.value.trim();
    if (!value) return;
    
    const emails = extractEmailsFromText(value);
    addEmails(emails);
    elements.chipsInput.value = '';
  }

  function removeLastEmail() {
    if (state.selectedEmails.length > 0) {
      state.selectedEmails.pop();
      renderChips();
      updateSendButton();
    }
  }

  function removeEmail(index) {
    state.selectedEmails.splice(index, 1);
    renderChips();
    updateSendButton();
  }

  function renderChips() {
    const container = elements.chipsList;
    container.innerHTML = '';
    
    state.selectedEmails.forEach((email, index) => {
      const chip = createChip(email, index);
      container.appendChild(chip);
    });
    
    updateChipsContainer();
  }

  function createChip(email, index) {
    const chip = document.createElement('div');
    chip.className = `chip ${isValidEmail(email) ? 'valid' : 'invalid'}`;
    
    const marker = InviteData.markers.find(m => m.email === email);
    
    chip.innerHTML = `
      <div class="chip-content">
        <div class="chip-email">${email}</div>
        ${marker ? `<div class="chip-name">${marker.name}</div>` : ''}
      </div>
      <button class="chip-remove" data-index="${index}" aria-label="Remove email">
        <svg width="12" height="12" viewBox="0 0 12 12">
          <path d="M9 3L3 9M3 3l6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    `;
    
    // Add remove functionality
    chip.querySelector('.chip-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      removeEmail(index);
    });
    
    return chip;
  }

  function updateChipsContainer() {
    const container = elements.chipsContainer;
    const hasChips = state.selectedEmails.length > 0;
    
    container.classList.toggle('has-chips', hasChips);
    container.classList.toggle('empty', !hasChips);
  }

  // Enhanced dropdown system
  function setupDropdownInteractions() {
    setupAssignmentDropdown();
    setupExpiryDropdown();
  }

  function setupAssignmentDropdown() {
    const select = elements.assignmentSelect;
    
    // Create dropdown options
    const options = InviteData.assignments.map(assignment => 
      `<option value="${assignment.id}">${assignment.name}</option>`
    );
    
    select.innerHTML = options.join('');
    select.value = state.selectedAssignment;
    
    select.addEventListener('change', (e) => {
      state.selectedAssignment = e.target.value;
      updateAssignmentInfo();
    });
  }

  function setupExpiryDropdown() {
    const select = elements.expirySelect;
    
    // Create dropdown options
    const options = InviteData.expiryOptions.map(option => 
      `<option value="${option.value}">${option.label}</option>`
    );
    
    select.innerHTML = options.join('');
    select.value = state.selectedExpiry;
    
    select.addEventListener('change', (e) => {
      state.selectedExpiry = parseInt(e.target.value);
    });
  }

  // Enhanced button actions
  function setupButtonActions() {
    elements.btnClear.addEventListener('click', handleClear);
    elements.btnSend.addEventListener('click', handleSend);
  }

  function handleClear() {
    state.selectedEmails = [];
    elements.chipsInput.value = '';
    renderChips();
    updateSendButton();
    closeSuggestions();
    showClearFeedback();
  }

  async function handleSend() {
    if (state.selectedEmails.length === 0) {
      showError('Please add at least one email address');
      return;
    }
    
    try {
      showLoadingState();
      
      // Simulate API call
      await simulateSendInvites();
      
      showSuccess(`Successfully sent ${state.selectedEmails.length} invitations`);
      
      // Clear selection
      state.selectedEmails = [];
      renderChips();
      updateSendButton();
      
      // Refresh table
      await refreshTable();
      
    } catch (error) {
      showError('Failed to send invitations. Please try again.');
    } finally {
      hideLoadingState();
    }
  }

  async function simulateSendInvites() {
    return new Promise((resolve) => {
      setTimeout(() => {
        // Simulate API call
        saveEmailHistory(state.selectedEmails);
        resolve();
      }, 2000);
    });
  }

  // Enhanced table system
  function setupTableInteractions() {
    setupTableFilters();
    setupBulkActions();
    setupRowInteractions();
  }

  function setupTableFilters() {
    // Create filter controls
    const filterContainer = createFilterContainer();
    elements.tableContainer.insertBefore(filterContainer, elements.tableContainer.firstChild);
  }

  function createFilterContainer() {
    const container = document.createElement('div');
    container.className = 'table-filters';
    container.innerHTML = `
      <div class="filter-group">
        <input type="text" id="searchInput" placeholder="Search markers..." class="filter-input">
        <select id="statusFilter" class="filter-select">
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="expired">Expired</option>
          <option value="closed">Closed</option>
        </select>
        <select id="departmentFilter" class="filter-select">
          <option value="all">All Departments</option>
          <option value="Psychology">Psychology</option>
          <option value="Education">Education</option>
        </select>
      </div>
      <div class="filter-actions">
        <button id="bulkSelectBtn" class="btn btn-secondary">Select All</button>
        <button id="bulkResendBtn" class="btn btn-primary" disabled>Resend Selected</button>
        <button id="bulkCloseBtn" class="btn btn-warning" disabled>Close Selected</button>
      </div>
    `;
    
    // Cache new elements
    elements.searchInput = container.querySelector('#searchInput');
    elements.statusFilter = container.querySelector('#statusFilter');
    elements.departmentFilter = container.querySelector('#departmentFilter');
    elements.bulkSelectBtn = container.querySelector('#bulkSelectBtn');
    elements.bulkResendBtn = container.querySelector('#bulkResendBtn');
    elements.bulkCloseBtn = container.querySelector('#bulkCloseBtn');
    
    return container;
  }

  function setupBulkActions() {
    elements.bulkSelectBtn.addEventListener('click', toggleBulkSelect);
    elements.bulkResendBtn.addEventListener('click', handleBulkResend);
    elements.bulkCloseBtn.addEventListener('click', handleBulkClose);
  }

  function toggleBulkSelect() {
    state.isBulkMode = !state.isBulkMode;
    
    if (state.isBulkMode) {
      selectAllRows();
      elements.bulkSelectBtn.textContent = 'Deselect All';
    } else {
      deselectAllRows();
      elements.bulkSelectBtn.textContent = 'Select All';
    }
    
    updateBulkActions();
  }

  function selectAllRows() {
    const rows = elements.tableBody.querySelectorAll('tr');
    rows.forEach((row, index) => {
      row.classList.add('selected');
      state.selectedRows.add(index);
    });
  }

  function deselectAllRows() {
    const rows = elements.tableBody.querySelectorAll('tr');
    rows.forEach((row, index) => {
      row.classList.remove('selected');
      state.selectedRows.delete(index);
    });
  }

  function setupRowInteractions() {
    // Row selection
    elements.tableBody.addEventListener('click', (e) => {
      const row = e.target.closest('tr');
      if (!row) return;
      
      const index = Array.from(elements.tableBody.children).indexOf(row);
      
      if (state.isBulkMode) {
        toggleRowSelection(row, index);
      }
    });
  }

  function toggleRowSelection(row, index) {
    if (state.selectedRows.has(index)) {
      row.classList.remove('selected');
      state.selectedRows.delete(index);
    } else {
      row.classList.add('selected');
      state.selectedRows.add(index);
    }
    
    updateBulkActions();
  }

  function updateBulkActions() {
    const hasSelection = state.selectedRows.size > 0;
    elements.bulkResendBtn.disabled = !hasSelection;
    elements.bulkCloseBtn.disabled = !hasSelection;
  }

  // Enhanced table rendering
  function renderTable(markers = InviteData.markers) {
    const tbody = elements.tableBody;
    tbody.innerHTML = '';
    
    markers.forEach((marker, index) => {
      const row = createTableRow(marker, index);
      tbody.appendChild(row);
    });
    
    updateTableStats();
  }

  function createTableRow(marker, index) {
    const row = document.createElement('tr');
    row.dataset.email = marker.email;
    
    row.innerHTML = `
      <td>
        <div class="marker-info">
          <div class="marker-email">${marker.email}</div>
          <div class="marker-name">${marker.name}</div>
          <div class="marker-department">${marker.department}</div>
        </div>
      </td>
      <td>
        <span class="status-pill ${marker.status}">${getStatusText(marker.status)}</span>
      </td>
      <td>
        <div class="date-info">
          <div class="sent-date">${marker.lastActive}</div>
          <div class="time-ago">${getTimeAgo(marker.lastActive)}</div>
        </div>
      </td>
      <td>
        <div class="action-buttons">
          ${getActionButtons(marker)}
        </div>
      </td>
    `;
    
    return row;
  }

  function getStatusText(status) {
    const statusMap = {
      'active': 'Active',
      'pending': 'Pending',
      'expired': 'Expired',
      'closed': 'Closed'
    };
    return statusMap[status] || 'Unknown';
  }

  function getTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`;
    return `${Math.ceil(diffDays / 30)} months ago`;
  }

  function getActionButtons(marker) {
    const actions = [];
    
    switch(marker.status) {
      case 'pending':
        actions.push(`<button class="btn-action resend" data-email="${marker.email}">Resend</button>`);
        actions.push(`<button class="btn-action revoke" data-email="${marker.email}">Revoke</button>`);
        break;
      case 'active':
        actions.push(`<button class="btn-action close" data-email="${marker.email}">Close</button>`);
        break;
      case 'expired':
        actions.push(`<button class="btn-action resend" data-email="${marker.email}">Resend</button>`);
        break;
      case 'closed':
        actions.push(`<button class="btn-action reopen" data-email="${marker.email}">Reopen</button>`);
        break;
    }
    
    return actions.join(' ');
  }

  // Advanced features
  function setupAdvancedFeatures() {
    setupSearch();
    setupFilters();
    setupKeyboardShortcuts();
    setupDragAndDrop();
  }

  function setupSearch() {
    elements.searchInput.addEventListener('input', debounce(handleSearch, 300));
  }

  function handleSearch(e) {
    state.searchQuery = e.target.value.toLowerCase();
    applyFilters();
  }

  function setupFilters() {
    elements.statusFilter.addEventListener('change', () => {
      state.statusFilter = elements.statusFilter.value;
      applyFilters();
    });
    
    elements.departmentFilter.addEventListener('change', () => {
      state.departmentFilter = elements.departmentFilter.value;
      applyFilters();
    });
  }

  function applyFilters() {
    let filtered = InviteData.markers;
    
    // Apply search filter
    if (state.searchQuery) {
      filtered = filtered.filter(marker => 
        marker.email.toLowerCase().includes(state.searchQuery) ||
        marker.name.toLowerCase().includes(state.searchQuery) ||
        marker.department.toLowerCase().includes(state.searchQuery)
      );
    }
    
    // Apply status filter
    if (state.statusFilter !== 'all') {
      filtered = filtered.filter(marker => marker.status === state.statusFilter);
    }
    
    // Apply department filter
    if (state.departmentFilter !== 'all') {
      filtered = filtered.filter(marker => marker.department === state.departmentFilter);
    }
    
    renderTable(filtered);
  }

  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + A to select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && state.isBulkMode) {
        e.preventDefault();
        toggleBulkSelect();
      }
      
      // Escape to cancel bulk mode
      if (e.key === 'Escape' && state.isBulkMode) {
        state.isBulkMode = false;
        deselectAllRows();
        updateBulkActions();
        elements.bulkSelectBtn.textContent = 'Select All';
      }
    });
  }

  function setupDragAndDrop() {
    // Enable drag and drop for email chips
    elements.chipsList.addEventListener('dragstart', handleDragStart);
    elements.chipsList.addEventListener('dragover', handleDragOver);
    elements.chipsList.addEventListener('drop', handleDrop);
  }

  function handleDragStart(e) {
    if (e.target.classList.contains('chip')) {
      e.dataTransfer.setData('text/plain', e.target.dataset.email);
      e.target.classList.add('dragging');
    }
  }

  function handleDragOver(e) {
    e.preventDefault();
  }

  function handleDrop(e) {
    e.preventDefault();
    const email = e.dataTransfer.getData('text/plain');
    const draggedElement = elements.chipsList.querySelector(`[data-email="${email}"]`);
    
    if (draggedElement) {
      draggedElement.classList.remove('dragging');
      // Handle reordering logic here
    }
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

  function loadEmailHistory() {
    try {
      const stored = localStorage.getItem('inviteEmailHistory');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  function saveEmailHistory(emails) {
    try {
      const existing = loadEmailHistory();
      const combined = [...new Set([...existing, ...emails])];
      localStorage.setItem('inviteEmailHistory', JSON.stringify(combined));
    } catch (error) {
      console.warn('Failed to save email history:', error);
    }
  }

  // Feedback functions
  function showInputHints(value) {
    // Show helpful hints based on input
    const hints = [];
    
    if (value.includes('@') && !value.includes('@deakin.edu.au')) {
      hints.push('Only @deakin.edu.au emails are accepted');
    }
    
    if (value.includes(',')) {
      hints.push('Multiple emails detected - press Enter to add them');
    }
    
    // Display hints
    showHints(hints);
  }

  function showValidationFeedback(valid, invalid) {
    // Show validation feedback
    if (invalid.length > 0) {
      showError(`${invalid.length} invalid email(s) detected`);
    } else if (valid.length > 0) {
      showSuccess(`${valid.length} valid email(s) ready to add`);
    }
  }

  function showPasteFeedback(count) {
    showSuccess(`Added ${count} email(s) from paste`);
  }

  function showAddFeedback(count) {
    showSuccess(`Added ${count} email(s)`);
  }

  function showClearFeedback() {
    showInfo('Cleared all emails');
  }

  function showLoadingState() {
    elements.btnSend.disabled = true;
    elements.btnSend.textContent = 'Sending...';
    elements.btnSend.classList.add('loading');
  }

  function hideLoadingState() {
    elements.btnSend.disabled = false;
    elements.btnSend.textContent = 'Send invites';
    elements.btnSend.classList.remove('loading');
  }

  function showSuccess(message) {
    showMessage(message, 'success');
  }

  function showError(message) {
    showMessage(message, 'error');
  }

  function showInfo(message) {
    showMessage(message, 'info');
  }

  function showMessage(message, type) {
    const statusEl = elements.statusMessage;
    statusEl.textContent = message;
    statusEl.className = `msg ${type}`;
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
      statusEl.textContent = '';
      statusEl.className = 'msg';
    }, 3000);
  }

  function showHints(hints) {
    // Create or update hints display
    let hintsEl = document.querySelector('.input-hints');
    if (!hintsEl) {
      hintsEl = document.createElement('div');
      hintsEl.className = 'input-hints';
      elements.chipsContainer.appendChild(hintsEl);
    }
    
    hintsEl.innerHTML = hints.map(hint => `<div class="hint">${hint}</div>`).join('');
  }

  function updateSendButton() {
    const hasEmails = state.selectedEmails.length > 0;
    elements.btnSend.disabled = !hasEmails;
    elements.btnSend.textContent = hasEmails ? 
      `Send ${state.selectedEmails.length} invite(s)` : 
      'Send invites';
  }

  function updateAssignmentInfo() {
    const assignment = InviteData.assignments.find(a => a.id === state.selectedAssignment);
    if (assignment) {
      // Update UI with assignment info
      console.log('Selected assignment:', assignment);
    }
  }

  function updateTableStats() {
    // Update statistics display
    const total = InviteData.markers.length;
    const active = InviteData.markers.filter(m => m.status === 'active').length;
    const pending = InviteData.markers.filter(m => m.status === 'pending').length;
    
    // Update stats display if it exists
    let statsEl = document.querySelector('.marker-stats');
    if (!statsEl) {
      statsEl = document.createElement('div');
      statsEl.className = 'marker-stats';
      elements.tableContainer.insertBefore(statsEl, elements.tableContainer.firstChild);
    }
    
    statsEl.innerHTML = `
      <div class="stat">
        <span class="stat-label">Total:</span>
        <span class="stat-value">${total}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Active:</span>
        <span class="stat-value active">${active}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Pending:</span>
        <span class="stat-value pending">${pending}</span>
      </div>
    `;
  }

  function loadMarkers() {
    // Load markers data
    renderTable();
  }

  function refreshTable() {
    // Refresh table data
    loadMarkers();
  }

  function startAutoRefresh() {
    // Auto-refresh every 30 seconds
    setInterval(() => {
      refreshTable();
    }, 30000);
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Export for global access
  window.InviteInteractive = {
    addEmails,
    removeEmail,
    refreshTable,
    applyFilters
  };
})();
