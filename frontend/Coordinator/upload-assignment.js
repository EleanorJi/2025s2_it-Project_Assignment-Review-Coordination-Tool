// upload-assignment.js — 修改后的版本
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // ---- API endpoints ----
  const API = {
    uploadDraft: '/api/uploads/drafts',
    commit: '/api/uploads/commit',
  };

  // 获取URL参数
  function getQueryParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
  }

  // 获取 project_id
  const projectId = getQueryParam('project');
  if (!projectId) {
    toast('No project selected. Please select a project first.', 'error');
    // 可选重定向
    setTimeout(() => { location.href = '/dashboard/coordinator/taskManagement'; }, 3000);
  } else {
    window.currentProjectId = projectId;
  }

  // 获取项目信息
  async function fetchProjectInfo(projectId) {
    try {
      const response = await fetch(`/api/uploads/project/${projectId}/status`);
      if (response.ok) {
        const data = await response.json();
        const projectNameEl = $('#project-name');
        const projectDescEl = $('#project-description');

        if (projectNameEl) {
          projectNameEl.textContent = data.project.name || `Project #${projectId}`;
        }
        if (projectDescEl) {
          projectDescEl.textContent = data.project.description || 'No description available';
        }
      }
    } catch (error) {
      console.error('Failed to fetch project info:', error);
      const projectNameEl = $('#project-name');
      if (projectNameEl) {
        projectNameEl.textContent = `Project #${projectId}`;
      }
      const projectDescEl = $('#project-description');
      if (projectDescEl) {
        projectDescEl.textContent = 'Failed to load project description';
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    // 仅在上传页执行
    if (document.body.dataset.page === 'upload' || $('.grid-3')) {
      initUploadPage();

      // 获取并显示项目信息
      if (projectId) {
        fetchProjectInfo(projectId);
      }
    }
  });

  // ============== 三张卡片：元素与交互 ==============
  const rubricCard = $('.grid-3 .card[data-role="rubric"]');
  const a1Card = $('.grid-3 .card[data-role="a1"]');
  const a2Card = $('.grid-3 .card[data-role="a2"]');

  const rubricInput = rubricCard ? $('.drop .file-input', rubricCard) : null;
  const a1Date = a1Card ? $('.date', a1Card) : null;
  const a1Input = a1Card ? $('.drop .file-input', a1Card) : null;
  const a2Date = a2Card ? $('.date', a2Card) : null;
  const a2Input = a2Card ? $('.drop .file-input', a2Card) : null;

  // 日期：原生 date + 禁止过去
  function todayISO() {
    const d = new Date();
    const off = d.getTimezoneOffset();
    const dt = new Date(d.getTime() - off * 60 * 1000);
    return dt.toISOString().slice(0, 10);
  }
  [a1Date, a2Date].forEach(el => { if (!el) return; el.type = 'date'; el.min = todayISO(); });

  // 文件框：点击/拖拽
  function wireDrop(card) {
    if (!card) return;
    const drop = $('.drop', card);
    const input = $('.drop .file-input', card);
    if (!drop || !input) return;

    const title = $('.drop .drop-title', card);
    const helper = $('.drop .helper', card);

    drop.addEventListener('click', () => input.click());
    input.addEventListener('change', () => { setLabel(input.files[0]?.name); renderValidation(); });

    ['dragenter', 'dragover'].forEach(ev =>
      drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('dragging'); })
    );
    ['dragleave', 'dragend', 'drop'].forEach(ev =>
      drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('dragging'); })
    );
    drop.addEventListener('drop', e => {
      const files = e.dataTransfer?.files;
      if (files && files.length) {
        const picked = files[0];
        const dt = new DataTransfer();
        dt.items.add(picked);
        input.files = dt.files;
        setLabel(picked.name);
        renderValidation();
      }
    });

    function setLabel(name) {
      if (name) {
        if (title) title.textContent = name;
        if (helper) helper.textContent = 'Selected';
      } else {
        const role = card.getAttribute('data-role');
        if (title) title.textContent = role === 'rubric' ? 'Upload rubric...' : 'Upload assignment...';
        if (helper) helper.textContent = role === 'rubric' ? '.docx / .csv / .xlsx' : 'PDF only';
      }
    }
  }
  [rubricCard, a1Card, a2Card].forEach(wireDrop);
  [a1Date, a2Date].forEach(el => el?.addEventListener('input', renderValidation));

  // 底部校验行
  const lineA1Pdf = $('.valid [data-val="a1-pdf"]');
  const lineRubric = $('.valid [data-val="rubric-file"]');
  const lineA1Date = $('.valid [data-val="a1-date"]');

  function renderValidation() {
    const s = {
      rubricOk: !!(rubricInput?.files?.[0]),
      a1PdfOk: !!(a1Input?.files?.[0]),
      a1DateOk: !!(a1Date?.value?.trim()),
      a2PdfOk: !!(a2Input?.files?.[0]),
      a2DateOk: !!(a2Date?.value?.trim()),
    };
    if (lineA1Pdf) lineA1Pdf.textContent = `${s.a1PdfOk ? '✔' : '✖'} Assignment PDF selected`;
    if (lineRubric) lineRubric.textContent = `${s.rubricOk ? '✔' : '✖'} Rubric file selected`;
    if (lineA1Date) lineA1Date.textContent = `${s.a1DateOk ? '✔' : '✖'} Due date set`;
  }
  renderValidation();

  // ============== 上传到后端 ==============
  async function uploadDraftFile(file, slot) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('slot', slot);
    const res = await fetch(API.uploadDraft, { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data; // 期望 { temp_name: '...' }
  }

  async function commitFile(tempName, fileType, round, dueDate) {
    if (!window.currentProjectId) {
      throw new Error('No project selected. Please select a project first.');
    }

    const payload = {
      temp_name: tempName,
      file_type: fileType,
      project_id: window.currentProjectId, // 添加 project_id
      round: round ?? null,
      due_date: dueDate ?? null,
    };

    const res = await fetch(API.commit, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Commit failed');
    return data;
  }

  // ============== 发布按钮（逐卡片） ==============
  function attachPublish(card) {
    if (!card) return;
    const role = card.getAttribute('data-role');
    const btn = $('.card-footer .btn.primary', card);
    if (!btn) return;

    btn.addEventListener('click', async () => {
      try {
        if (!window.currentProjectId) {
          toast('Please select a project first.', 'error');
          return;
        }

        if (role === 'rubric') {
          if (!(rubricInput?.files?.[0])) return toast('Please select a rubric file (.docx/.csv/.xlsx).', 'error');
          const draft = await uploadDraftFile(rubricInput.files[0], 'rubric');
          await commitFile(draft.temp_name, 'rubric', null, null);
          toast('Rubric published');
        } else if (role === 'a1') {
          if (!(a1Input?.files?.[0])) return toast('Please select a PDF.', 'error');
          if (!(a1Date?.value)) return toast('Please set the due date.', 'error');
          const draft = await uploadDraftFile(a1Input.files[0], 'assignment1');
          await commitFile(draft.temp_name, 'assignment', 1, a1Date.value);
          toast('Assignment 1 published');
        } else if (role === 'a2') {
          if (!(a2Input?.files?.[0])) return toast('Please select a PDF.', 'error');
          if (!(a2Date?.value)) return toast('Please set the due date.', 'error');
          const draft = await uploadDraftFile(a2Input.files[0], 'assignment2');
          await commitFile(draft.temp_name, 'assignment', 2, a2Date.value);
          toast('Assignment 2 published');
        }
      } catch (err) {
        toast(err.message || 'Publish failed', 'error');
      }
    });
  }
  [rubricCard, a1Card, a2Card].forEach(attachPublish);

  // ============== Toast ==============
  function toast(msg, type = 'success', ms = 2300) {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    Object.assign(t.style, {
      position: 'fixed', right: '16px', bottom: '16px',
      background: type === 'error' ? '#B91C1C' : '#0F172A',
      color: '#fff', padding: '10px 12px', borderRadius: '10px',
      boxShadow: '0 12px 30px rgba(0,0,0,.2)',
      opacity: '0', transform: 'translateY(6px)', transition: '.2s',
      zIndex: '11000', fontWeight: '700'
    });
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform = 'none'; });
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(6px)'; setTimeout(() => t.remove(), 180); }, ms);
  }

  // ============== 启动 ==============
  function initUploadPage() {
    renderValidation();
  }
})();