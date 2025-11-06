// Past Task – Marker Portal
(function () {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  // Display username
  function displayUsername() {
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
  }

  // Global goToResetPassword function
  window.goToResetPassword = function() {
    window.location.href = '/reset-password';
  };

  // Initialize dropdown
  function initDropdown() {
    const usernameEl = document.getElementById('username');
    const dropdown = document.querySelector('.dropdown-menu');
    const allDropdownItems = document.querySelectorAll('.dropdown-item');
    const logoutBtn = allDropdownItems.length > 1 ? allDropdownItems[1] : null;

    if (usernameEl && dropdown) {
      usernameEl.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('show');
      });

      // Click elsewhere to close dropdown menu
      document.addEventListener('click', () => {
        dropdown.classList.remove('show');
      });
    }

    // Logout functionality
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
  }

  // Initialize
  function init() {
    console.log('🚀 Marker Past Task initializing...');
    displayUsername();
    initDropdown();
    
    // Here you can add logic to fetch past task data
    // Currently showing empty state
    const container = $('#paContainer');
    if (container) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #6B7280;">
          <p>No past tasks available.</p>
        </div>
      `;
    }
  }

  // Initialize after page loads
  document.addEventListener('DOMContentLoaded', init);

  // Global logout function
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

  // Onboarding modal functions
  window.showOnboarding = function() {
    const overlay = document.getElementById('onboardingOverlay');
    if (overlay) {
      overlay.classList.add('active');
      document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }
  };

  window.hideOnboarding = function() {
    const overlay = document.getElementById('onboardingOverlay');
    if (overlay) {
      overlay.classList.remove('active');
      document.body.style.overflow = ''; // Restore scrolling
    }
  };

  // Close onboarding when clicking overlay
  document.addEventListener('click', function(e) {
    const overlay = document.getElementById('onboardingOverlay');
    if (overlay && e.target === overlay) {
      hideOnboarding();
    }
  });

  // Close onboarding with ESC key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      const overlay = document.getElementById('onboardingOverlay');
      if (overlay && overlay.classList.contains('active')) {
        hideOnboarding();
      }
    }
  });

})();
