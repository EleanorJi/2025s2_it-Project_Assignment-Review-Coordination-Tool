// coordinator.js
(() => {
  document.addEventListener('DOMContentLoaded', () => {
    // 其他页面的初始化写在这里
    initCommonNav();

    // 仅在上传页执行（依赖 <body data-page="upload">）
    if (document.body.dataset.page === 'upload') {
      initUploadPage();
    }
  });

function initCommonNav() {
  // 从 localStorage 取用户信息
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

  // 用户名下拉菜单
  const usernameEl = document.getElementById('username');
  const dropdown = document.getElementById('userDropdown');
  const logoutBtn = document.getElementById('logoutBtn');

  if (usernameEl && dropdown) {
    usernameEl.addEventListener('click', (e) => {
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

  // 功能卡片点击导航
  document.querySelectorAll('.function-card').forEach(card => {
    card.addEventListener('click', () => {
      const page = card.dataset.page;
      if (page) {
        window.location.href = `/dashboard/coordinator/${page}`;
      }
    });
  });
}

  // ====== 原 upload.js 合并过来的逻辑 ======
  function initUploadPage() {
    // 1) 选择文件后把文案改为文件名（视觉反馈）
    document.querySelectorAll('.drop input[type="file"]').forEach(input => {
      const label = input.parentElement.querySelector('div'); // drop > div 文案容器
      input.addEventListener('change', () => {
        if (input.files && input.files[0]) {
          label.innerHTML = `${input.files[0].name}<div class="hint">Selected</div>`;
          refreshValidation(input.closest('.assign')); // 选中文件后刷新校验
        }
      });
    });

    // 2) 监听日期/数值输入，实时刷新校验
    document.querySelectorAll('.assign .input').forEach(inp => {
      inp.addEventListener('input', () => {
        refreshValidation(inp.closest('.assign'));
      });
    });

    // 3) 保存草稿 / 发布（示例：拿到表单数据 -> 你可以 fetch 到后端）
    document.querySelectorAll('.assign').forEach(card => {
      const saveBtn    = card.querySelector('.btn:not(.primary)');
      const publishBtn = card.querySelector('.btn.primary');

      saveBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        const payload = collectCardData(card);
        console.log('[draft]', payload);
        // fetch('/api/assignments/draft', {method:'POST', body: toFormData(payload)})
        alert('Draft saved (console 有 payload)');
      });

      publishBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        const payload = collectCardData(card);
        const ok = isCardValid(card);
        if (!ok) { alert('Please complete required files and due date.'); return; }
        console.log('[publish]', payload);
        // fetch('/api/assignments/publish', {method:'POST', body: toFormData(payload)})
        alert('Published (console 有 payload)');
      });
    });
  }

  // ====== 工具函数 ======
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

  // 可选：把 JSON 转成 FormData（方便文件上传）
  function toFormData(obj) {
    const fd = new FormData();
    Object.entries(obj).forEach(([k,v]) => {
      if (v !== undefined && v !== null) fd.append(k, v);
    });
    return fd;
  }
})();
