// Interaction Utilities - Enhanced user experience
(function() {
  'use strict';

  // ===== Button Enhancement =====
  function enhanceButtons() {
    // Add loading states to all buttons
    document.querySelectorAll('button').forEach(btn => {
      if (btn.classList.contains('btn') && !btn.hasAttribute('data-enhanced')) {
        btn.setAttribute('data-enhanced', 'true');
        
        // Add ripple effect
        btn.addEventListener('click', function(e) {
          const ripple = document.createElement('span');
          const rect = this.getBoundingClientRect();
          const size = Math.max(rect.width, rect.height);
          const x = e.clientX - rect.left - size / 2;
          const y = e.clientY - rect.top - size / 2;
          
          ripple.style.cssText = `
            position: absolute;
            width: ${size}px;
            height: ${size}px;
            left: ${x}px;
            top: ${y}px;
            background: rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            transform: scale(0);
            animation: ripple 0.6s linear;
            pointer-events: none;
          `;
          
          this.style.position = 'relative';
          this.style.overflow = 'hidden';
          this.appendChild(ripple);
          
          setTimeout(() => ripple.remove(), 600);
        });
      }
    });
  }

  // ===== Form Validation Enhancement =====
  function enhanceFormValidation() {
    // Real-time validation for inputs
    document.querySelectorAll('input, textarea, select').forEach(input => {
      input.addEventListener('blur', function() {
        validateField(this);
      });
      
      input.addEventListener('input', function() {
        clearFieldError(this);
      });
    });
  }

  function validateField(field) {
    const value = field.value.trim();
    const isRequired = field.hasAttribute('required');
    const type = field.type;
    
    clearFieldError(field);
    
    if (isRequired && !value) {
      showFieldError(field, 'This field is required');
      return false;
    }
    
    if (type === 'email' && value && !isValidEmail(value)) {
      showFieldError(field, 'Please enter a valid email address');
      return false;
    }
    
    if (type === 'date' && value && new Date(value) < new Date()) {
      showFieldError(field, 'Date cannot be in the past');
      return false;
    }
    
    return true;
  }

  function showFieldError(field, message) {
    field.classList.add('error');
    
    let errorEl = field.parentNode.querySelector('.field-error');
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.className = 'field-error';
      field.parentNode.appendChild(errorEl);
    }
    errorEl.textContent = message;
  }

  function clearFieldError(field) {
    field.classList.remove('error');
    const errorEl = field.parentNode.querySelector('.field-error');
    if (errorEl) errorEl.remove();
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  // ===== Loading States =====
  function showLoading(button, text = 'Loading...') {
    if (button) {
      button.setAttribute('data-original-text', button.textContent);
      button.textContent = text;
      button.disabled = true;
      button.classList.add('loading');
    }
  }

  function hideLoading(button) {
    if (button) {
      const originalText = button.getAttribute('data-original-text');
      if (originalText) {
        button.textContent = originalText;
        button.removeAttribute('data-original-text');
      }
      button.disabled = false;
      button.classList.remove('loading');
    }
  }

  // ===== Toast Notifications =====
  function showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    const colors = {
      success: '#10B981',
      error: '#EF4444',
      warning: '#F59E0B',
      info: '#3B82F6'
    };
    
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${colors[type] || colors.info};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 10000;
      transform: translateX(100%);
      transition: transform 0.3s ease;
      font-weight: 500;
      max-width: 300px;
    `;
    
    document.body.appendChild(toast);
    
    // Animate in
    requestAnimationFrame(() => {
      toast.style.transform = 'translateX(0)';
    });
    
    // Auto remove
    setTimeout(() => {
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // ===== Keyboard Navigation =====
  function enhanceKeyboardNavigation() {
    // Tab navigation enhancement
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Tab') {
        document.body.classList.add('keyboard-navigation');
      }
    });
    
    // Remove keyboard navigation class on mouse use
    document.addEventListener('mousedown', function() {
      document.body.classList.remove('keyboard-navigation');
    });
  }

  // ===== Smooth Scrolling =====
  function enhanceScrolling() {
    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(link => {
      link.addEventListener('click', function(e) {
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
          e.preventDefault();
          target.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
      });
    });
  }

  // ===== Focus Management =====
  function enhanceFocusManagement() {
    // Focus trap for modals
    document.addEventListener('keydown', function(e) {
      const modal = document.querySelector('.modal.show, .tm-modal.show, .ui-modal.show');
      if (modal && e.key === 'Tab') {
        const focusableElements = modal.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        
        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            lastElement.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement.focus();
            e.preventDefault();
          }
        }
      }
    });
  }

  // ===== Animation Utilities =====
  function addAnimations() {
    // Fade in animation for cards
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-fade-in');
        }
      });
    });
    
    document.querySelectorAll('.tm-box, .card, .panel').forEach(el => {
      observer.observe(el);
    });
  }

  // ===== Initialize All Enhancements =====
  function init() {
    enhanceButtons();
    enhanceFormValidation();
    enhanceKeyboardNavigation();
    enhanceScrolling();
    enhanceFocusManagement();
    addAnimations();
    
    // Add CSS for animations
    const style = document.createElement('style');
    style.textContent = `
      @keyframes ripple {
        to {
          transform: scale(4);
          opacity: 0;
        }
      }
      
      @keyframes fadeIn {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      .animate-fade-in {
        animation: fadeIn 0.6s ease-out;
      }
      
      .btn.loading {
        opacity: 0.7;
        cursor: not-allowed;
      }
      
      .btn.loading::after {
        content: '';
        display: inline-block;
        width: 12px;
        height: 12px;
        margin-left: 8px;
        border: 2px solid transparent;
        border-top: 2px solid currentColor;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }
      
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
      
      .field-error {
        color: #EF4444;
        font-size: 12px;
        margin-top: 4px;
        display: block;
      }
      
      input.error, textarea.error, select.error {
        border-color: #EF4444;
        box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
      }
      
      .keyboard-navigation *:focus {
        outline: 2px solid #3B82F6;
        outline-offset: 2px;
      }
    `;
    document.head.appendChild(style);
  }

  // Export functions for global use
  window.InteractionUtils = {
    showLoading,
    hideLoading,
    showToast,
    validateField,
    showFieldError,
    clearFieldError
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
