// User Manager - Dynamic user name management
(function() {
  'use strict';

  // Default user data
  const DEFAULT_USER = {
    name: 'User',
    role: 'Coordinator',
    email: 'user@deakin.edu.au'
  };

  // Get user data from localStorage or URL parameters
  function getUserData() {
    // Try to get from URL parameters first
    const urlParams = new URLSearchParams(window.location.search);
    const name = urlParams.get('name');
    const role = urlParams.get('role');
    const email = urlParams.get('email');

    if (name || role || email) {
      return {
        name: name || DEFAULT_USER.name,
        role: role || DEFAULT_USER.role,
        email: email || DEFAULT_USER.email
      };
    }

    // Try to get from localStorage
    try {
      const stored = localStorage.getItem('userData');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to parse stored user data:', e);
    }

    // Return default
    return DEFAULT_USER;
  }

  // Save user data to localStorage
  function saveUserData(userData) {
    try {
      localStorage.setItem('userData', JSON.stringify(userData));
    } catch (e) {
      console.warn('Failed to save user data:', e);
    }
  }

  // Update user display in the page
  function updateUserDisplay() {
    const userData = getUserData();
    
    // Update account displays
    document.querySelectorAll('.account').forEach(accountEl => {
      const caret = accountEl.querySelector('.caret');
      if (caret) {
        accountEl.innerHTML = `${userData.name} <span class="caret">▾</span>`;
      } else {
        accountEl.textContent = userData.name;
      }
    });

    // Update any other user name displays
    document.querySelectorAll('[data-user-name]').forEach(el => {
      el.textContent = userData.name;
    });

    // Update role displays
    document.querySelectorAll('[data-user-role]').forEach(el => {
      el.textContent = userData.role;
    });

    // Update email displays
    document.querySelectorAll('[data-user-email]').forEach(el => {
      el.textContent = userData.email;
    });

    // Update page title if it contains user info
    if (document.title.includes('User') || document.title.includes('Carrie')) {
      document.title = document.title.replace(/User|Carrie/g, userData.name);
    }
  }

  // Set user data programmatically
  function setUser(name, role, email) {
    const userData = {
      name: name || DEFAULT_USER.name,
      role: role || DEFAULT_USER.role,
      email: email || DEFAULT_USER.email
    };
    
    saveUserData(userData);
    updateUserDisplay();
    
    return userData;
  }

  // Get current user data
  function getCurrentUser() {
    return getUserData();
  }

  // Initialize user display
  function init() {
    updateUserDisplay();
    
    // Listen for storage changes (if user changes in another tab)
    window.addEventListener('storage', (e) => {
      if (e.key === 'userData') {
        updateUserDisplay();
      }
    });
  }

  // Export functions for global use
  window.UserManager = {
    setUser,
    getCurrentUser,
    updateUserDisplay,
    init
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
