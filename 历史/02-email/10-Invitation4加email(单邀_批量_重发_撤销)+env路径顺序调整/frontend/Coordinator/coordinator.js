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
    // 这里写侧边栏高亮、用户菜单等通用逻辑（可留空）
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
