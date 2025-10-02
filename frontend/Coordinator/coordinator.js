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
  }

  // 在页面加载时初始化dropdown和logout功能
  document.addEventListener('DOMContentLoaded', () => {
    initDropdownAndLogout();
  });
})();