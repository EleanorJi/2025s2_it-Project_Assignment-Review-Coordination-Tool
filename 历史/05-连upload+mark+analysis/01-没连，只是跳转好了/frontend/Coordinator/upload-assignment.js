// Upload Assignment & Rubric – JS (matches upload-assignment.html exactly)
(function () {
  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  // Cards
  const rubricCard = $('.grid-3 .card[data-role="rubric"]');
  const a1Card     = $('.grid-3 .card[data-role="a1"]');
  const a2Card     = $('.grid-3 .card[data-role="a2"]');

  // Inputs
  const rubricFile = $('.drop .file-input', rubricCard);
  const a1Date     = $('.date', a1Card);
  const a1File     = $('.drop .file-input', a1Card);
  const a2Date     = $('.date', a2Card);
  const a2File     = $('.drop .file-input', a2Card);

  // Make dates real date pickers & disallow past
  function todayISO(){
    const d = new Date();
    const off = d.getTimezoneOffset();
    const dt = new Date(d.getTime() - off*60*1000);
    return dt.toISOString().slice(0,10);
  }
  [a1Date, a2Date].forEach(el => { if(!el) return; el.type='date'; el.min=todayISO(); });

  // Drop helpers
  function updateDropLabel(card, fileName){
    const title  = $('.drop .drop-title', card);
    const helper = $('.drop .helper', card);
    const role   = card?.getAttribute('data-role');
    if(fileName){
      if(title)  title.textContent = fileName;
      if(helper) helper.textContent = 'Selected';
    }else{
      if(title)  title.textContent = role==='rubric' ? 'Upload rubric...' : 'Upload assignment...';
      if(helper) helper.textContent = role==='rubric' ? '.docx / .csv / .xlsx' : 'PDF only';
    }
  }

  function wireDrop(card){
    const drop = $('.drop', card);
    const input = $('.drop .file-input', card);
    if(!drop || !input) return;
    drop.addEventListener('click', () => input.click());
    input.addEventListener('change', () => { updateDropLabel(card, input.files[0]?.name); renderValidation(); });
    ['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('dragging'); }));
    ['dragleave','dragend','drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('dragging'); }));
    drop.addEventListener('drop', e => {
      const files = e.dataTransfer.files;
      if(files && files.length){
        const accept = drop.getAttribute('data-accept')?.split(',').map(s=>s.trim().toLowerCase()) || [];
        const picked = Array.from(files).find(f => {
          if(!accept.length) return true;
          const name = f.name.toLowerCase();
          return accept.some(a => name.endsWith(a.replace('.', '')) || name.endsWith(a));
        }) || files[0];
        const dt = new DataTransfer(); dt.items.add(picked); input.files = dt.files;
        updateDropLabel(card, picked.name); renderValidation();
      }
    });
  }
  [rubricCard, a1Card, a2Card].forEach(wireDrop);

  // Validation panel
  const lineA1Pdf  = $('.valid [data-val="a1-pdf"]');
  const lineRubric = $('.valid [data-val="rubric-file"]');
  const lineA1Date = $('.valid [data-val="a1-date"]');

  function getState(){
    const s = {
      rubricOk: !!(rubricFile?.files?.[0]),
      a1PdfOk : !!(a1File?.files?.[0]),
      a1DateOk: !!(a1Date?.value?.trim()),
      a2PdfOk : !!(a2File?.files?.[0]),
      a2DateOk: !!(a2Date?.value?.trim()),
    };
    const a2Touched = s.a2PdfOk || s.a2DateOk;
    s.a2Ok = a2Touched ? (s.a2PdfOk && s.a2DateOk) : true;
    s.minimumOk = s.rubricOk && s.a1PdfOk && s.a1DateOk && s.a2Ok;
    return s;
  }

  function renderValidation(){
    const s = getState();
    if(lineA1Pdf)  lineA1Pdf.textContent  = `${s.a1PdfOk  ? '✔' : '✖'} Assignment PDF selected`;
    if(lineRubric) lineRubric.textContent = `${s.rubricOk ? '✔' : '✖'} Rubric file selected`;
    if(lineA1Date) lineA1Date.textContent = `${s.a1DateOk ? '✔' : '✖'} Due date set`;
  }
  renderValidation();
  [a1Date, a2Date].forEach(el => el?.addEventListener('input', renderValidation));

  // ------------------------
  // Obvious submit feedback + PREVIEW
  // ------------------------
  let modalEl, progBar, modalBody, revokeUrls=[];
  function ensureModal(){
    if(modalEl) return;
    modalEl = document.createElement('div');
    modalEl.setAttribute('role','dialog');
    modalEl.setAttribute('aria-modal','true');
    modalEl.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;place-items:center;padding:16px;z-index:9999;';
    modalEl.innerHTML = `
      <div class="modal-card" style="max-width:820px;width:100%;background:#fff;border:1px solid #E6EAF2;border-radius:16px;box-shadow:0 20px 60px rgba(2,6,23,.15);overflow:hidden">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #E6EAF2">
          <h3 id="modal-title" style="margin:0;font-size:18px">Publishing…</h3>
          <button id="modal-close" class="btn" style="min-width:72px">Close</button>
        </div>
        <div id="modal-body" style="padding:16px">
          <div class="progress" style="height:10px;background:#EEF2F7;border-radius:999px;overflow:hidden"><span id="prog" style="display:block;height:100%;width:0%;background:#2563eb"></span></div>
          <p style="color:#64748b;margin:12px 0 0">Please wait while your files are uploaded.</p>
        </div>
      </div>`;
    document.body.appendChild(modalEl);
    progBar   = modalEl.querySelector('#prog');
    modalBody = modalEl.querySelector('#modal-body');
    modalEl.querySelector('#modal-close').addEventListener('click', closeModal);
  }
  function openModal(title='Publishing…'){ ensureModal(); modalEl.style.display='grid'; setTitle(title); setProgress(0); }
  function closeModal(){ modalEl.style.display='none'; revokeUrls.forEach(u=> URL.revokeObjectURL(u)); revokeUrls=[]; }
  function setTitle(t){ modalEl.querySelector('#modal-title').textContent=t; }
  function setProgress(p){ if(progBar) progBar.style.width = `${Math.max(0,Math.min(100,p))}%`; }

  function showSuccess(summary){
    setTitle('Published!');
    const list = summary.items.map(i=>`<li><strong>${i.label}:</strong> ${i.detail}</li>`).join('');
    modalBody.innerHTML = `
      <div style="display:flex;gap:14px;align-items:center">
        <div style="width:44px;height:44px;border-radius:50%;background:#16a34a;display:grid;place-items:center;color:#fff">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12l4 4 8-8"/></svg>
        </div>
        <div>
          <div style="font-weight:800;font-size:18px">Success</div>
          <div style="color:#64748b">Your rubric and assignments have been published.</div>
        </div>
      </div>
      <ul style="margin:14px 0 0 18px;color:#111827">${list}</ul>
      <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" id="previewBtn">Preview</button>
        <a class="btn primary" href="#" id="goOverview">Go to Overview</a>
      </div>
      <div id="previewArea" style="margin-top:12px;display:none"></div>`;
    modalBody.querySelector('#previewBtn').addEventListener('click', ()=>{
      const area = modalBody.querySelector('#previewArea');
      const vis = area.style.display!=='none';
      area.style.display = vis? 'none':'block';
      if(!vis){ renderPreview(area); }
    });
  }

  function renderPreview(host){
    host.innerHTML = '';
    const sections = [];
    // Rubric preview
    if(rubricFile?.files?.[0]) sections.push({title:'Rubric', file: rubricFile.files[0]});
    if(a1File?.files?.[0])     sections.push({title:'Assignment 1 (PDF)', file: a1File.files[0]});
    if(a2File?.files?.[0])     sections.push({title:'Assignment 2 (PDF)', file: a2File.files[0]});

    sections.forEach(s=>{
      const box = document.createElement('div');
      box.style.cssText='border:1px solid #E6EAF2;border-radius:12px;padding:10px;margin-top:10px';
      const h = document.createElement('div');
      h.style.cssText='font-weight:700;margin-bottom:6px';
      h.textContent = s.title + ' — ' + s.file.name;
      box.appendChild(h);

      const url = URL.createObjectURL(s.file); revokeUrls.push(url);
      const ext = s.file.name.toLowerCase().split('.').pop();
      if(ext==='pdf'){
        const emb = document.createElement('embed');
        emb.src = url; emb.type='application/pdf'; emb.style.cssText='width:100%;height:420px;border:0;border-radius:8px;';
        box.appendChild(emb);
        const a = document.createElement('a'); a.href=url; a.textContent='Open PDF in new tab'; a.target='_blank'; a.className='btn'; a.style.marginTop='8px'; box.appendChild(a);
      } else if(ext==='csv'){
        const pre = document.createElement('div'); pre.textContent='Loading preview…'; pre.style.color='#64748b'; box.appendChild(pre);
        const reader = new FileReader();
        reader.onload = () => {
          const text = (reader.result||'').toString();
          const rows = text.split().slice(0,10).map(r=> r.split(','));
          const tbl = document.createElement('table');
          tbl.style.cssText='width:100%;border-collapse:collapse;border:1px solid #E6EAF2';
          rows.forEach((cells,i)=>{
            const tr = document.createElement('tr');
            cells.forEach(c=>{
              const td = document.createElement(i? 'td':'th');
              td.textContent=c; td.style.cssText='border:1px solid #E6EAF2;padding:6px;text-align:left;font-size:12px';
              tr.appendChild(td);
            });
            tbl.appendChild(tr);
          });
          box.replaceChild(tbl, pre);
        };
        reader.readAsText(s.file);
      } else {
        const note = document.createElement('div');
        note.innerHTML = `No inline preview available. <a href="${url}" target="_blank">Download</a>`;
        box.appendChild(note);
      }
      host.appendChild(box);
    });
  }

  // Toast helper
  function toast(msg, type='success', ms=2600){
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.style.cssText = 'position:fixed;right:16px;bottom:16px;background:#111827;color:#fff;padding:10px 12px;border-radius:10px;box-shadow:0 12px 30px rgba(0,0,0,.2);opacity:0;transform:translateY(6px);transition:.2s;z-index:10000';
    t.textContent = msg; document.body.appendChild(t);
    requestAnimationFrame(()=>{ t.style.opacity=1; t.style.transform='none'; });
    setTimeout(()=>{ t.style.opacity=0; t.style.transform='translateY(6px)'; setTimeout(()=> t.remove(), 200); }, ms);
  }

  // Upload with progress (XHR so we get upload progress). Replace URL with real API.
  function uploadWithProgress(url, formData){
    return new Promise((resolve,reject)=>{
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.upload.onprogress = (e)=>{ if(e.lengthComputable) setProgress(Math.round((e.loaded/e.total)*100)); };
      xhr.onload = ()=>{
        let data = {};
        try{ data = JSON.parse(xhr.responseText||'{}'); }catch{}
        if(xhr.status>=200 && xhr.status<300 && data.success!==false){ resolve(data); }
        else reject(new Error(data.message || `Publish failed (${xhr.status})`));
      };
      xhr.onerror = ()=> reject(new Error('Network error'));
      xhr.send(formData);
    });
  }

  // Demo (fallback) uploader if you haven't wired the API yet
  function fakeUploadWithProgress(){
    return new Promise((resolve)=>{
      let p=0; const id=setInterval(()=>{ p+=10; setProgress(p); if(p>=100){ clearInterval(id); setTimeout(resolve, 250);} }, 120);
    });
  }

  // Per-card publish with modal + preview
  function attachPublish(card){
    const btn = $('.card-footer .btn.primary', card);
    if(!btn) return;
    btn.addEventListener('click', async () => {
      const role = card.getAttribute('data-role');
      // Validate
      if(role==='rubric'){
        if(!(rubricFile?.files?.[0])){ toast('Please select a rubric file (.docx/.csv/.xlsx).', 'error'); return; }
      } else {
        const dateInput = $('.date', card);
        const fileInput = role==='a1' ? a1File : a2File;
        if(!fileInput?.files?.[0]){ toast('Please select a PDF.', 'error'); return; }
        if(!dateInput?.value){ toast('Please set the due date.', 'error'); return; }
      }

      // Build FormData
      const fd = new FormData();
      if(role==='rubric'){
        fd.append('rubric', rubricFile.files[0]);
      } else if(role==='a1'){
        fd.append('a1_pdf', a1File.files[0]);
        fd.append('a1_due', $('.date', a1Card).value);
      } else {
        fd.append('a2_pdf', a2File.files[0]);
        fd.append('a2_due', $('.date', a2Card).value);
      }

      // Open modal + upload
      openModal('Publishing…');
      try{
        // Replace with your real endpoint if available:
        // await uploadWithProgress('/api/assignments/publish', fd);
        await fakeUploadWithProgress();
        setProgress(100);
        const summaryItems = [];
        if(role==='rubric') summaryItems.push({label:'Rubric', detail: rubricFile.files[0].name});
        if(role==='a1')     summaryItems.push({label:'Assignment 1', detail: a1File.files[0].name + ' · due ' + $('.date', a1Card).value});
        if(role==='a2')     summaryItems.push({label:'Assignment 2', detail: a2File.files[0].name + ' · due ' + $('.date', a2Card).value});
        showSuccess({items: summaryItems});
        toast('Published successfully.');
      }catch(err){
        setTitle('Publish failed');
        modalBody.innerHTML = `<div style="color:#b91c1c">${(err && err.message) || 'Publish failed.'}</div>`;
        toast((err && err.message) || 'Publish failed.', 'error');
      }
    });
  }
  [rubricCard, a1Card, a2Card].forEach(attachPublish);

  // Initial log
  console.log('[Upload Page] init', {
    rubricCard: !!rubricCard, a1Card: !!a1Card, a2Card: !!a2Card,
    rubricFile: !!rubricFile, a1File: !!a1File, a2File: !!a2File
  });
})();
