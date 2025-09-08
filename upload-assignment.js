// Upload Assignment & Rubric – page script
(function () {
    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  
    // 三个区块：Rubric / A1 / A2（按布局顺序获取）
    const blocks = $$('.grid-3 .block');
    if (blocks.length < 3) return; // 防御
  
    const rubricBlock = blocks[0];
    const a1Block     = blocks[1];
    const a2Block     = blocks[2];
  
    // 各元素
    const rubricFile = $('.drop input[type="file"]', rubricBlock);
    const a1Date     = $('.field .input', a1Block);
    const a1File     = $('.drop input[type="file"]', a1Block);
    const a2Date     = $('.field .input', a2Block);
    const a2File     = $('.drop input[type="file"]', a2Block);
  
    const publishBtn = $('.footer-bar .btn.primary');
    const validList  = $('.footer-bar .validation .list');
  
    // 工具：转义
    const escapeHTML = (s='') => s.replace(/[&<>"']/g, c => (
      { '&':'&nbsp;&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]
    ));
  
    // 工具：更新上传框文案
    function setDropLabel(input, text, hint = 'Selected') {
      const labelDiv = input?.parentElement?.querySelector('div');
      if (!labelDiv) return;
      if (text) {
        labelDiv.innerHTML = `${escapeHTML(text)}<div class="hint">${escapeHTML(hint)}</div>`;
      } else {
        // 恢复默认
        const isPDF = input.accept?.includes('pdf');
        labelDiv.innerHTML = isPDF
          ? `Upload assignment…<div class="hint">PDF only</div>`
          : `Upload rubric…<div class="hint">.docx / .csv / .xlsx</div>`;
      }
    }
  
    // 绑定文件选择 & 拖拽
    [rubricFile, a1File, a2File].forEach(input => {
      if (!input) return;
  
      input.addEventListener('change', () => {
        const f = input.files && input.files[0];
        setDropLabel(input, f ? f.name : '');
        renderValidation();
      });
  
      // 让 label 支持拖拽
      const drop = input.closest('.drop');
      if (drop) {
        ['dragenter','dragover'].forEach(ev =>
          drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('dragging'); })
        );
        ['dragleave','dragend','drop'].forEach(ev =>
          drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('dragging'); })
        );
        drop.addEventListener('drop', e => {
          const files = e.dataTransfer.files;
          if (!files || !files.length) return;
          // 简单类型过滤（前端兜底，后端仍需严格校验）
          const accept = (input.accept || '').split(',').map(s => s.trim().toLowerCase());
          const picked = Array.from(files).find(f => {
            const name = f.name.toLowerCase();
            return accept.length === 0 || accept.some(a => name.endsWith(a.replace('.', '')));
          }) || files[0];
          const dt = new DataTransfer();
          dt.items.add(picked);
          input.files = dt.files;
          setDropLabel(input, picked.name);
          renderValidation();
        });
      }
    });
  
    // 日期输入更新校验
    [a1Date, a2Date].forEach(inp => {
      inp?.addEventListener('input', renderValidation);
    });
  
    // 校验逻辑
    function getState() {
      const state = {
        rubricOk: !!(rubricFile?.files?.[0]),
        a1PdfOk : !!(a1File?.files?.[0]),
        a1DateOk: !!(a1Date?.value?.trim()),
        a2PdfOk : !!(a2File?.files?.[0]),
        a2DateOk: !!(a2Date?.value?.trim()),
      };
      // A2：如果填了任意一项，则两者都必须齐
      const a2Touched = state.a2PdfOk || state.a2DateOk;
      state.a2Ok = a2Touched ? (state.a2PdfOk && state.a2DateOk) : true;
  
      // 最低要求：Rubric + A1 的 PDF + A1 的 due date
      state.minimumOk = state.rubricOk && state.a1PdfOk && state.a1DateOk && state.a2Ok;
      return state;
    }
  
    function renderValidation() {
      const s = getState();
      if (!validList) return;
      validList.innerHTML = [
        `${s.a1PdfOk  ? '✔' : '✖'} Assignment 1 PDF selected`,
        `${s.rubricOk ? '✔' : '✖'} Rubric file selected`,
        `${s.a1DateOk ? '✔' : '✖'} Assignment 1 due date set`,
      ].map(t => `<li>${t}</li>`).join('');
  
      // 若 A2 填了但不完整，追加一条提示
      if (!(s.a2Ok)) {
        validList.insertAdjacentHTML('beforeend',
          `<li>✖ Assignment 2: please provide both PDF and due date</li>`);
      }
    }
  
    renderValidation(); // 初始绘制
  
    // Publish
    publishBtn?.addEventListener('click', async () => {
      const s = getState();
      if (!s.minimumOk) {
        alert('Please complete: Rubric + Assignment 1 PDF + Assignment 1 due date.\nIf you add Assignment 2, both its PDF and due date are required.');
        return;
      }
  
      const fd = new FormData();
      rubricFile?.files?.[0] && fd.append('rubric', rubricFile.files[0]);
  
      a1File?.files?.[0] && fd.append('a1_pdf', a1File.files[0]);
      a1Date?.value && fd.append('a1_due', a1Date.value);
  
      a2File?.files?.[0] && fd.append('a2_pdf', a2File.files[0]);
      a2Date?.value && fd.append('a2_due', a2Date.value);
  
      // 你可以在这里附带其它上下文，比如 assignment 标题/ID 等
      // fd.append('course', 'PSY-XXX'); ...
  
      publishBtn.disabled = true;
      const originalText = publishBtn.textContent;
      publishBtn.textContent = 'Publishing…';
  
      try {
        const res = await fetch('/api/assignments/publish', { method: 'POST', body: fd });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) {
          throw new Error(data.message || `Publish failed (${res.status})`);
        }
        alert('Published successfully.');
        // 成功后你可以清空表单/跳转
        // location.href = 'coordinator-dashboard.html';
      } catch (err) {
        alert(err.message || 'Publish failed.');
      } finally {
        publishBtn.disabled = false;
        publishBtn.textContent = originalText;
      }
    });
  })();
  