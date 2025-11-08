// upload-assignment.js  — Project toolbar (below title) + hidden modal + 3 cards wiring
(() => {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  // ---- API endpoints (如需统一前缀，改这里) ----
  const API = {
    listProjects : '/api/uploads/projects',
    createProject: '/api/uploads/project',
    projectStatus: (id) => `/api/uploads/project/${id}/status`,
    uploadDraft  : '/api/uploads/drafts',
    commit       : '/api/uploads/commit',
  };

  let currentProjectId = null;

  document.addEventListener('DOMContentLoaded', () => {
    // 仅在上传页执行（容错：出现 .grid-3 时也执行）
    if (document.body.dataset.page === 'upload' || $('.grid-3')) {
      initUploadPage();
    }
  });

  // ============== 项目工具条（固定放在标题下面） ==============
  function ensureProjectBar(){
    const panel = $('.panel');
    if (!panel) return;

    // 先移除旧的，避免重复
    const oldTools = panel.querySelector('.project-tools');
    if (oldTools) oldTools.remove();

    const tools = document.createElement('div');
    tools.className = 'project-tools';
    tools.innerHTML = `
      <select id="project-select" class="input" style="width:320px;height:36px"></select>
      <button id="new-project-btn" class="btn" style="height:36px">New Project</button>
      <div id="project-status" class="muted">Status: Not selected</div>
    `;
    // 样式：独占一行，放在标题下面
    Object.assign(tools.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      flexWrap: 'wrap',
      margin: '8px 0 14px 0',
    });

    // 锚点：h1 或 title-row（如果你之前包过）
    const anchor = panel.querySelector('.title-row') || panel.querySelector('h1') || panel.firstElementChild;
    if (anchor) {
      anchor.insertAdjacentElement('afterend', tools);
    } else {
      panel.prepend(tools);
    }
  }

  // ============== New Project 弹窗（真正隐藏、不会漏出来） ==============
  let pm, pmInput, pmMsg, lastFocusEl;
  function ensureProjectModal(){
    if (pm) return;

    pm = document.createElement('div');
    pm.id = 'project-modal';
    // 关键：position:fixed + display:none + 挂载 body
    pm.style.position   = 'fixed';
    pm.style.inset      = '0';
    pm.style.display    = 'none';
    pm.style.placeItems = 'center';
    pm.style.background = 'rgba(15,23,42,.38)';
    pm.style.padding    = '16px';
    pm.style.zIndex     = '10000';
    pm.setAttribute('aria-hidden', 'true');

    pm.innerHTML = `
      <div role="dialog" aria-modal="true" aria-labelledby="pm-title"
           style="width:min(520px,92vw);background:#fff;border:1px solid #E6EAF2;border-radius:16px;box-shadow:0 6px 24px rgba(2,6,23,0.06);overflow:hidden">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #E6EAF2">
          <h3 id="pm-title" style="margin:0;font-weight:800">Create New Project</h3>
          <button id="pm-close" class="btn" style="background:transparent;border-color:transparent;color:#6B7280">✕</button>
        </div>
        <form id="pm-form" style="padding:14px;display:flex;flex-direction:column;gap:12px">
          <label class="label" for="project-name">Project name</label>
          <input id="project-name" class="input" placeholder="e.g., 2025 · Semester 1" autocomplete="off" />
          <div style="display:flex;gap:10px;justify-content:flex-end">
            <button type="button" class="btn" id="pm-cancel">Cancel</button>
            <button type="submit" class="btn primary" id="pm-create">Create</button>
          </div>
          <div class="msg" id="pm-msg"></div>
        </form>
      </div>
    `;
    document.body.appendChild(pm);

    pmInput = $('#project-name', pm);
    pmMsg   = $('#pm-msg', pm);

    // 事件
    $('#pm-close', pm)?.addEventListener('click', closeProjectModal);
    $('#pm-cancel', pm)?.addEventListener('click', closeProjectModal);
    pm.addEventListener('click', (e)=>{ if(e.target === pm) closeProjectModal(); });
    document.addEventListener('keydown', (e)=>{ if(pm.style.display!=='none' && e.key==='Escape'){ closeProjectModal(); } });

    $('#pm-form', pm).addEventListener('submit', onCreateProjectSubmit);
  }

  function openProjectModal(){
    ensureProjectModal();
    lastFocusEl = document.activeElement;
    pmInput.value = '';
    setPmMsg('');
    pm.style.display = 'grid';
    pm.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden'; // 防止背景滚动
    setTimeout(()=> pmInput.focus(), 0);
  }

  function closeProjectModal(){
    if (!pm) return;
    pm.style.display = 'none';
    pm.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocusEl && typeof lastFocusEl.focus === 'function') {
      lastFocusEl.focus();
    }
  }

  async function onCreateProjectSubmit(e){
    e.preventDefault();
    const name = (pmInput.value || '').trim();
    if (!name){ setPmMsg('Please enter a project name'); pmInput.focus(); return; }

    try{
      setPmMsg('Creating…', true);
      const res  = await fetch(API.createProject, {
        method : 'POST',
        headers: {'Content-Type':'application/json'},
        body   : JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Create failed');

      // 更新下拉并选中
      const sel = $('#project-select');
      if (sel) {
        const opt = document.createElement('option');
        opt.value = data.project.project_id;
        opt.textContent = `${data.project.name} (${data.project.status})`;
        sel.appendChild(opt);
        sel.value = data.project.project_id;
      }
      currentProjectId = data.project.project_id;
      await updateProjectStatus();

      setPmMsg('Created', true);
      toast(`Project "${data.project.name}" created`);
      setTimeout(closeProjectModal, 250);
    }catch(err){
      setPmMsg(err.message || 'Create failed');
    }
  }

  function setPmMsg(text, ok){
    if (!pmMsg) return;
    pmMsg.textContent = text || '';
    pmMsg.className = 'msg' + (text ? (ok ? ' ok' : ' err') : '');
  }

  // ============== 初始化项目选择器 ==============
  async function initProjectSelector(){
    ensureProjectBar();
    ensureProjectModal();

    const sel = $('#project-select');
    if (!sel) return;

    try{
      const res  = await fetch(API.listProjects);
      const data = await res.json().catch(()=>({projects:[]}));

      sel.innerHTML = '<option value="">Select a project</option>';
      (data.projects || []).forEach(p=>{
        const o = document.createElement('option');
        o.value = p.project_id;
        o.textContent = `${p.name} (${p.status})`;
        sel.appendChild(o);
      });

      sel.onchange = async (e) => {
        currentProjectId = e.target.value || null;
        await updateProjectStatus();
        
        // Display stored files for selected project
        if (currentProjectId) {
          displayStoredFiles(currentProjectId);
        } else {
          // Clear file displays when no project selected
          clearFileDisplays();
        }
      };

      $('#new-project-btn')?.addEventListener('click', openProjectModal);
    }catch(e){
      toast('Failed to load projects','error');
    }
  }

  async function updateProjectStatus(){
    const el = $('#project-status');
    if (!currentProjectId){
      if (el) el.textContent = 'Status: Not selected';
      return;
    }
    try{
      const res  = await fetch(API.projectStatus(currentProjectId));
      const data = await res.json();
      if (el) el.textContent = `Status: ${data.project?.status ?? '—'}`;
    }catch{
      if (el) el.textContent = 'Status: —';
    }
  }

  // ============== 三张卡片：元素与交互 ==============
  const rubricCard = $('.grid-3 .card[data-role="rubric"]');
  const a1Card     = $('.grid-3 .card[data-role="a1"]');
  const a2Card     = $('.grid-3 .card[data-role="a2"]');

  const rubricInput = rubricCard ? $('.drop .file-input', rubricCard) : null;
  const a1Date      = a1Card ? $('.date', a1Card) : null;
  const a1Input     = a1Card ? $('.drop .file-input', a1Card) : null;
  const a2Date      = a2Card ? $('.date', a2Card) : null;
  const a2Input     = a2Card ? $('.drop .file-input', a2Card) : null;

  // 日期：原生 date + 禁止过去
  function todayISO(){
    const d = new Date();
    const off = d.getTimezoneOffset();
    const dt = new Date(d.getTime() - off*60*1000);
    return dt.toISOString().slice(0,10);
  }
  [a1Date, a2Date].forEach(el => { if(!el) return; el.type = 'date'; el.min = todayISO(); });

  // 文件框：点击/拖拽
  function wireDrop(card){
    if (!card) return;
    const drop  = $('.drop', card);
    const input = $('.drop .file-input', card);
    if (!drop || !input) return;

    const title  = $('.drop .drop-title', card);
    const helper = $('.drop .helper', card);

    drop.addEventListener('click', ()=> input.click());
    input.addEventListener('change', ()=>{ setLabel(input.files[0]?.name); renderValidation(); });

    ['dragenter','dragover'].forEach(ev =>
      drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('dragging'); })
    );
    ['dragleave','dragend','drop'].forEach(ev =>
      drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('dragging'); })
    );
    drop.addEventListener('drop', e => {
      const files = e.dataTransfer?.files;
      if (files && files.length){
        const picked = files[0];
        const dt = new DataTransfer();
        dt.items.add(picked);
        input.files = dt.files;
        setLabel(picked.name);
        renderValidation();
      }
    });

    function setLabel(name){
      if (name){
        if (title)  title.textContent = name;
        if (helper) helper.textContent = 'Selected';
      }else{
        const role = card.getAttribute('data-role');
        if (title)  title.textContent  = role === 'rubric' ? 'Upload rubric...' : 'Upload assignment...';
        if (helper) helper.textContent = role === 'rubric' ? '.docx / .csv / .xlsx' : 'PDF only';
      }
    }
  }
  [rubricCard, a1Card, a2Card].forEach(wireDrop);
  [a1Date, a2Date].forEach(el => el?.addEventListener('input', renderValidation));

  // 底部校验行
  const lineA1Pdf  = $('.valid [data-val="a1-pdf"]');
  const lineRubric = $('.valid [data-val="rubric-file"]');
  const lineA1Date = $('.valid [data-val="a1-date"]');

  function renderValidation(){
    const s = {
      rubricOk: !!(rubricInput?.files?.[0]),
      a1PdfOk : !!(a1Input?.files?.[0]),
      a1DateOk: !!(a1Date?.value?.trim()),
      a2PdfOk : !!(a2Input?.files?.[0]),
      a2DateOk: !!(a2Date?.value?.trim()),
    };
    if (lineA1Pdf)  lineA1Pdf.textContent  = `${s.a1PdfOk  ? '✔' : '✖'} Assignment PDF selected`;
    if (lineRubric) lineRubric.textContent = `${s.rubricOk ? '✔' : '✖'} Rubric file selected`;
    if (lineA1Date) lineA1Date.textContent = `${s.a1DateOk ? '✔' : '✖'} Due date set`;
  }
  renderValidation();

  // ============== 上传到后端 ==============
  async function uploadDraftFile(file, slot){
    const fd = new FormData();
    fd.append('file', file);
    fd.append('slot', slot);
    const res  = await fetch(API.uploadDraft, { method:'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data; // 期望 { temp_name: '...' }
  }

  async function commitFile(tempName, fileType, round, dueDate){
    const payload = {
      temp_name : tempName,
      project_id: currentProjectId,
      file_type : fileType,     // 'rubric' | 'assignment'
      round     : round ?? null, // 1 | 2 | null
      due_date  : dueDate ?? null,
    };
    const res  = await fetch(API.commit, {
      method : 'POST',
      headers: {'Content-Type':'application/json'},
      body   : JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Commit failed');
    return data;
  }

  // ============== 发布按钮（逐卡片） ==============
  function attachPublish(card){
    if (!card) return;
    const role = card.getAttribute('data-role');
    const btn  = $('.card-footer .btn.primary', card);
    if (!btn) return;

    btn.addEventListener('click', async ()=>{
      if (!currentProjectId){
        InteractionUtils.showToast('Please select or create a project first','error');
        return;
      }

      try{
        InteractionUtils.showLoading(btn, 'Publishing...');
        
        if (role === 'rubric'){
          if (!(rubricInput?.files?.[0])) {
            InteractionUtils.showToast('Please select a rubric file (.docx/.csv/.xlsx).','error');
            return;
          }
          const draft = await uploadDraftFile(rubricInput.files[0], 'rubric');
          await commitFile(draft.temp_name, 'rubric', null, null);
          
          // Save file info to localStorage
          saveFileToProject(currentProjectId, 'rubric', rubricInput.files[0].name, draft.temp_name);
          
          showUploadSuccess('Rubric', 'rubric');
        } else if (role === 'a1'){
          if (!(a1Input?.files?.[0])) {
            InteractionUtils.showToast('Please select a PDF.','error');
            return;
          }
          if (!(a1Date?.value)) {
            InteractionUtils.showToast('Please set the due date.','error');
            return;
          }
          const draft = await uploadDraftFile(a1Input.files[0], 'assignment1');
          await commitFile(draft.temp_name, 'assignment', 1, a1Date.value);
          
          // Save file info to localStorage
          saveFileToProject(currentProjectId, 'assignment1', a1Input.files[0].name, draft.temp_name);
          
          showUploadSuccess('Assignment 1', 'a1');
        } else if (role === 'a2'){
          if (!(a2Input?.files?.[0])) {
            InteractionUtils.showToast('Please select a PDF.','error');
            return;
          }
          if (!(a2Date?.value)) {
            InteractionUtils.showToast('Please set the due date.','error');
            return;
          }
          const draft = await uploadDraftFile(a2Input.files[0], 'assignment2');
          await commitFile(draft.temp_name, 'assignment', 2, a2Date.value);
          
          // Save file info to localStorage
          saveFileToProject(currentProjectId, 'assignment2', a2Input.files[0].name, draft.temp_name);
          
          showUploadSuccess('Assignment 2', 'a2');
        }
        await updateProjectStatus();
      }catch(err){
        InteractionUtils.showToast(err.message || 'Publish failed','error');
      } finally {
        InteractionUtils.hideLoading(btn);
      }
    });
  }
  [rubricCard, a1Card, a2Card].forEach(attachPublish);

  // ============== Upload Success Display ==============
  function showUploadSuccess(itemName, cardRole) {
    // Show success toast
    InteractionUtils.showToast(`${itemName} published successfully!`, 'success', 4000);
    
    // Add visual success indicator to the card
    const card = document.querySelector(`.card[data-role="${cardRole}"]`);
    if (card) {
      // Add success checkmark
      const successIndicator = document.createElement('div');
      successIndicator.className = 'upload-success-indicator';
      successIndicator.innerHTML = '✓';
      successIndicator.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        width: 24px;
        height: 24px;
        background: #10B981;
        color: white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 14px;
        z-index: 10;
        animation: successPulse 0.6s ease-out;
      `;
      
      card.style.position = 'relative';
      card.appendChild(successIndicator);
      
      // Add success border
      card.style.border = '2px solid #10B981';
      card.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.1)';
      
      // Store success state
      card.setAttribute('data-uploaded', 'true');
      
      // Remove success indicator after 3 seconds but keep the border
      setTimeout(() => {
        if (successIndicator.parentNode) {
          successIndicator.remove();
        }
      }, 3000);
    }
  }

  // ============== File Persistence ==============
  function saveFileToProject(projectId, fileType, fileName, fileData) {
    const key = `project_${projectId}_${fileType}`;
    const fileInfo = {
      name: fileName,
      data: fileData,
      uploadedAt: new Date().toISOString()
    };
    localStorage.setItem(key, JSON.stringify(fileInfo));
  }

  function loadFilesForProject(projectId) {
    const files = {};
    const fileTypes = ['rubric', 'assignment1', 'assignment2'];
    
    fileTypes.forEach(type => {
      const key = `project_${projectId}_${type}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        try {
          files[type] = JSON.parse(stored);
        } catch (e) {
          console.warn('Failed to parse stored file:', e);
        }
      }
    });
    
    return files;
  }

  function displayStoredFiles(projectId) {
    const files = loadFilesForProject(projectId);
    
    // Display rubric file
    if (files.rubric) {
      const rubricCard = document.querySelector('.card[data-role="rubric"]');
      if (rubricCard) {
        const dropTitle = rubricCard.querySelector('.drop-title');
        if (dropTitle) {
          dropTitle.textContent = files.rubric.name;
          dropTitle.style.color = '#10B981';
          dropTitle.style.fontWeight = '600';
        }
        const helper = rubricCard.querySelector('.tm-help');
        if (helper) {
          helper.textContent = 'Uploaded';
          helper.style.color = '#10B981';
        }
        rubricCard.setAttribute('data-uploaded', 'true');
        rubricCard.style.border = '2px solid #10B981';
      }
    }
    
    // Display assignment files
    ['a1', 'a2'].forEach(role => {
      const fileType = role === 'a1' ? 'assignment1' : 'assignment2';
      if (files[fileType]) {
        const card = document.querySelector(`.card[data-role="${role}"]`);
        if (card) {
          const dropTitle = card.querySelector('.drop-title');
          if (dropTitle) {
            dropTitle.textContent = files[fileType].name;
            dropTitle.style.color = '#10B981';
            dropTitle.style.fontWeight = '600';
          }
          const helper = card.querySelector('.tm-help');
          if (helper) {
            helper.textContent = 'Uploaded';
            helper.style.color = '#10B981';
          }
          card.setAttribute('data-uploaded', 'true');
          card.style.border = '2px solid #10B981';
        }
      }
    });
  }

  function clearFileDisplays() {
    // Reset all cards to default state
    document.querySelectorAll('.card[data-role]').forEach(card => {
      const dropTitle = card.querySelector('.drop-title');
      const helper = card.querySelector('.tm-help');
      
      if (dropTitle) {
        const role = card.getAttribute('data-role');
        dropTitle.textContent = role === 'rubric' ? 'Upload rubric...' : 'Upload assignment...';
        dropTitle.style.color = '';
        dropTitle.style.fontWeight = '';
      }
      
      if (helper) {
        const role = card.getAttribute('data-role');
        helper.textContent = role === 'rubric' ? '.docx / .csv / .xlsx' : 'PDF only';
        helper.style.color = '';
      }
      
      card.removeAttribute('data-uploaded');
      card.style.border = '';
      card.style.boxShadow = '';
    });
  }

  // ============== Toast ==============
  function toast(msg, type='success', ms=2300){
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    Object.assign(t.style, {
      position:'fixed', right:'16px', bottom:'16px',
      background: type==='error' ? '#B91C1C' : '#0F172A',
      color:'#fff', padding:'10px 12px', borderRadius:'10px',
      boxShadow:'0 12px 30px rgba(0,0,0,.2)',
      opacity:'0', transform:'translateY(6px)', transition:'.2s',
      zIndex:'11000', fontWeight:'700'
    });
    document.body.appendChild(t);
    requestAnimationFrame(()=>{ t.style.opacity='1'; t.style.transform='none'; });
    setTimeout(()=>{ t.style.opacity='0'; t.style.transform='translateY(6px)'; setTimeout(()=> t.remove(), 180); }, ms);
  }

  // ============== 启动 ==============
  async function initUploadPage(){
    await initProjectSelector();
    renderValidation();
  }
})();
