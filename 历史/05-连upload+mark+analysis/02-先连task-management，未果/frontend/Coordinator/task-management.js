// Task Management – list + modal + dropzones (consistent with your DS)
(function () {
    const $  = (s, r=document) => r.querySelector(s);
    const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  
    // ---------- 状态管理 ----------
    const state = {
      upcoming: [],
      completed: []
    };

    // 从后端获取项目数据
    async function fetchProjects() {
      try {
        const response = await fetch('/api/uploads/projects');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        // 清空当前状态
        state.upcoming = [];
        state.completed = [];

        // 根据状态分类项目
        data.projects.forEach(project => {
          // 将published状态的项目归类为upcoming
          if (project.status === 'published') {
            state.upcoming.push({
              title: project.name,
              description: project.description,
              project_id: project.project_id,
              created_at: project.created_at,
              file_counts: project.file_counts,
              // 假设项目数据中包含rubric_id信息
              rubric_id: project.rubric_id // 需要后端返回这个字段
            });
          }
          // 将completed状态的项目归类为completed
          else if (project.status === 'completed') {
            state.completed.push({
              title: project.name,
              description: project.description,
              project_id: project.project_id,
              created_at: project.created_at,
              file_counts: project.file_counts,
              // 假设项目数据中包含rubric_id信息
              rubric_id: project.rubric_id // 需要后端返回这个字段
            });
          }
        });

        // 重新渲染界面
        render();
      } catch (error) {
        console.error('获取项目数据失败:', error);
        toast('Failed to load projects. Please try again later.');
      }
    }
  
    const upcomingList  = $('#upcomingList');
    const completedList = $('#completedList');
  
    function render() {
      const makeRow = (item) => {
        const box = document.createElement('div');
        box.className = 'tm-box';
        const row = document.createElement('div');
        row.className = 'tm-item';
  
        const left = document.createElement('div');
        left.className = 'tm-title';
        left.textContent = item.title;

        // 添加描述信息（如果有）
        if (item.description) {
          const desc = document.createElement('div');
          desc.className = 'tm-description';
          desc.textContent = item.description;
          left.appendChild(desc);
        }

        const act = document.createElement('div');
        act.className = 'tm-actions';

        // 根据是否有rubric文件显示不同的按钮
        const btnRubric = item.file_counts?.rubric > 0
          ? btn('View Rubric', () => viewRubricDetails(item.rubric_id))
          : btn('Upload Rubric', () => uploadRubric(item.project_id));

        const btnMark   = btn('Mark Assignment', () => (location.href = `/dashboard/coordinator/mark?project=${item.project_id}`));
        const btnAna    = btn('View Analysis', () => (location.href = `/dashboard/coordinator/analysis?project=${item.project_id}`));
  
        act.append(btnRubric, btnMark, btnAna);
        row.append(left, act);
        box.append(row);
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
  
    fetchProjects(); // 初始加载
  
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
    btnSubmit.addEventListener('click', ()=>{
      const name = asgnName.value.trim();
      const due  = asgnDue.value.trim();
      const rf   = rubricFile.files?.[0];
      const af   = asgnFile.files?.[0];
  
      if (!name || !due || !rf || !af){
        errLine.style.display='inline-block';
        errLine.textContent = 'Please complete: Name + Due date + Rubric + Assignment PDF.';
        return;
      }
  
      // 简单“保存”：生成 URL 供 View Rubric 下载/预览使用
      const rubricUrl = URL.createObjectURL(rf);
  
      state.upcoming.unshift({
        title: name,
        rubricUrl,
        rubricName: rf.name
      });
  
      render();
      closeModal();
  
      // 提示
      toast('Assignment created.');
      // 清理
      asgnName.value=''; asgnDue.value=''; rubricFile.value=''; asgnFile.value='';
      $('#rubricText').textContent='Upload rubric...'; $('#asgnText').textContent='Upload assignment...';
      rubricDrop.querySelector('.tm-help').textContent='.docx / .csv / .xlsx';
      asgnDrop.querySelector('.tm-help').textContent='PDF only';
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
  