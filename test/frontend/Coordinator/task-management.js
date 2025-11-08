// Task Management – list + modal + dropzones (consistent with your DS)
(function () {
    const $  = (s, r=document) => r.querySelector(s);
    const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  
    // ---------- seed data (与截图一致) ----------
    const state = {
      upcoming: [
        { title: '2025 · Semester 1 · Assignment 1' },
        { title: '2025 · Semester 1 · Assignment 2' },
      ],
      completed: [
        { title: '2024 · Semester 1 · Assignment 1' }
      ]
    };
  
    const upcomingList  = $('#upcomingList');
    const completedList = $('#completedList');
  
    function render() {
      const makeRow = (item) => {
        const box = document.createElement('div');
        box.className = 'tm-box';
        
        // 标题行
        const titleRow = document.createElement('div');
        titleRow.className = 'tm-item';
        const title = document.createElement('div');
        title.className = 'tm-title';
        title.textContent = item.title;
        titleRow.append(title);
        
        // 按钮行
        const buttonRow = document.createElement('div');
        buttonRow.className = 'tm-button-row';
        
        const btnRubric = btn('View Rubric', () => handleViewRubric(item));
        const btnMark = btn('Mark Assignment', () => handleMarkAssignment(item));
        const btnAna = btn('View Analysis', () => handleViewAnalysis(item));
        
        buttonRow.append(btnRubric, btnMark, btnAna);
        
        box.append(titleRow, buttonRow);
        return box;
      };
  
      upcomingList.innerHTML = '';
      state.upcoming.forEach(it => upcomingList.append(makeRow(it)));
  
      completedList.innerHTML = '';
      state.completed.forEach(it => completedList.append(makeRow(it)));
    }
  
    function btn(text, onClick){
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = text;
      b.addEventListener('click', onClick);
      return b;
    }
  
    function previewFile(url, name){
      if(!url){ alert('No rubric uploaded for this assignment.'); return; }
      const a = document.createElement('a');
      a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.download = name || '';
      a.click();
    }

    function viewRubric(item){
      // 根据作业标题生成rubric ID
      const rubricId = generateRubricId(item.title);
      // 跳转到rubric页面，传递rubric ID参数
      location.href = `rubric.html?rubric=${encodeURIComponent(rubricId)}`;
    }

    // Enhanced button handlers with loading states and feedback
    function handleViewRubric(item) {
      const button = event.target;
      InteractionUtils.showLoading(button, 'Opening Rubric...');
      
      setTimeout(() => {
        viewRubric(item);
        InteractionUtils.hideLoading(button);
      }, 500);
    }

    function handleMarkAssignment(item) {
      const button = event.target;
      InteractionUtils.showLoading(button, 'Opening Assignment...');
      
      setTimeout(() => {
        location.href = 'mark-assignment.html';
        InteractionUtils.hideLoading(button);
      }, 500);
    }

    function handleViewAnalysis(item) {
      const button = event.target;
      InteractionUtils.showLoading(button, 'Opening Analysis...');
      
      setTimeout(() => {
        location.href = 'feedback.html';
        InteractionUtils.hideLoading(button);
      }, 500);
    }

    function generateRubricId(title){
      // 从标题中提取信息生成rubric ID
      // 例如: "2025 · Semester 1 · Assignment 1" -> "assignment_1_2025_sem1"
      const match = title.match(/(\d{4})\s*·\s*Semester\s*(\d+)\s*·\s*Assignment\s*(\d+)/);
      if (match) {
        const [, year, semester, assignment] = match;
        return `assignment_${assignment}_${year}_sem${semester}`;
      }
      // 如果格式不匹配，使用默认ID
      return 'demo';
    }
  
    render();
  
    // ---------- modal ----------
    const modal   = $('#modal');
    const btnAdd  = $('#btnAdd');
    const btnClose= $('#btnClose');
    const btnSubmit = $('#btnSubmit');
  
    const rubricDrop = $('#rubricDrop');
    const rubricFile = $('#rubricFile');
    const rubricText = $('#rubricText');
  
    const asgnDrop   = $('#asgnDrop');
    const asgnFile   = $('#asgnFile');
    const asgnText   = $('#asgnText');
  
    const asgnName   = $('#asgnName');
    const asgnDue    = $('#asgnDue');
    const errLine    = $('#errLine');
  
    // Date input：转为 date 并限制过去
    (function ensureDate(){
      const todayISO = () => {
        const d = new Date(); const off = d.getTimezoneOffset();
        return new Date(d.getTime() - off*60*1000).toISOString().slice(0,10);
      };
      asgnDue.type = 'date'; asgnDue.min = todayISO();
    })();
  
    function openModal(){ modal.classList.add('show'); errLine.style.display='none'; }
    function closeModal(){ modal.classList.remove('show'); }
  
    btnAdd.addEventListener('click', openModal);
    btnClose.addEventListener('click', closeModal);
    modal.addEventListener('click', (e)=>{ if(e.target === modal) closeModal(); });
    document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') closeModal(); });
  
    // ---------- dropzones ----------
    function wireDrop(dropEl, inputEl, labelEl){
      dropEl.addEventListener('click', ()=> inputEl.click());
      inputEl.addEventListener('change', ()=>{
        const f = inputEl.files?.[0];
        if (f){ labelEl.textContent = f.name; dropEl.classList.remove('drag'); dropEl.querySelector('.tm-help').textContent = 'Selected'; }
        else { resetLabel(); }
      });
      const resetLabel = ()=>{
        const isPdf = (inputEl.accept||'').includes('.pdf');
        labelEl.textContent = isPdf ? 'Upload assignment...' : 'Upload rubric...';
        dropEl.querySelector('.tm-help').textContent = isPdf ? 'PDF only' : '.docx / .csv / .xlsx';
      };
      ['dragenter','dragover'].forEach(ev => dropEl.addEventListener(ev, e=>{ e.preventDefault(); dropEl.classList.add('drag'); }));
      ['dragleave','dragend','drop'].forEach(ev => dropEl.addEventListener(ev, e=>{ e.preventDefault(); dropEl.classList.remove('drag'); }));
      dropEl.addEventListener('drop', (e)=>{
        const files = e.dataTransfer.files;
        if(!files || !files.length) return;
        // 简单过滤：按 accept 后缀匹配
        const accept = (dropEl.dataset.accept||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
        const picked = Array.from(files).find(f=>{
          if(!accept.length) return true;
          const name = f.name.toLowerCase(); return accept.some(a=> name.endsWith(a.replace('.','')) || name.endsWith(a));
        }) || files[0];
        const dt = new DataTransfer(); dt.items.add(picked); inputEl.files = dt.files;
        labelEl.textContent = picked.name; dropEl.querySelector('.tm-help').textContent = 'Selected';
      });
    }
    wireDrop(rubricDrop, rubricFile, rubricText);
    wireDrop(asgnDrop, asgnFile, asgnText);
  
    // ---------- submit ----------
    btnSubmit.addEventListener('click', async ()=>{
      const name = asgnName.value.trim();
      const due  = asgnDue.value.trim();
      const rf   = rubricFile.files?.[0];
      const af   = asgnFile.files?.[0];
  
      // Enhanced validation
      let isValid = true;
      if (!name) {
        InteractionUtils.showFieldError(asgnName, 'Assignment name is required');
        isValid = false;
      }
      if (!due) {
        InteractionUtils.showFieldError(asgnDue, 'Due date is required');
        isValid = false;
      }
      if (!rf) {
        InteractionUtils.showFieldError(rubricFile, 'Rubric file is required');
        isValid = false;
      }
      if (!af) {
        InteractionUtils.showFieldError(asgnFile, 'Assignment file is required');
        isValid = false;
      }
      
      if (!isValid) {
        InteractionUtils.showToast('Please complete all required fields', 'error');
        return;
      }
  
      // Show loading state
      InteractionUtils.showLoading(btnSubmit, 'Creating Assignment...');
      
      try {
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // 简单"保存"：生成 URL 供 View Rubric 下载/预览使用
        const rubricUrl = URL.createObjectURL(rf);
    
        state.upcoming.unshift({
          title: name,
          rubricUrl,
          rubricName: rf.name
        });
    
        render();
        closeModal();
    
        // Success feedback
        InteractionUtils.showToast('Assignment created successfully!', 'success');
        
        // 清理
        asgnName.value=''; asgnDue.value=''; rubricFile.value=''; asgnFile.value='';
        $('#rubricText').textContent='Upload rubric...'; $('#asgnText').textContent='Upload assignment...';
        rubricDrop.querySelector('.tm-help').textContent='.docx / .csv / .xlsx';
        asgnDrop.querySelector('.tm-help').textContent='PDF only';
        
        // Clear any field errors
        document.querySelectorAll('.field-error').forEach(el => el.remove());
        document.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
        
      } catch (error) {
        InteractionUtils.showToast('Failed to create assignment. Please try again.', 'error');
      } finally {
        InteractionUtils.hideLoading(btnSubmit);
      }
    });
  
    // ---------- toast ----------
    function toast(msg, ms=2200){
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;right:16px;bottom:16px;background:#0F172A;color:#fff;padding:10px 12px;border-radius:10px;box-shadow:0 12px 30px rgba(0,0,0,.2);opacity:0;transform:translateY(6px);transition:.2s;z-index:2000;font-weight:700';
      el.textContent = msg; document.body.appendChild(el);
      requestAnimationFrame(()=>{ el.style.opacity=1; el.style.transform='none'; });
      setTimeout(()=>{ el.style.opacity=0; el.style.transform='translateY(6px)'; setTimeout(()=> el.remove(), 200); }, ms);
    }
  })();
  