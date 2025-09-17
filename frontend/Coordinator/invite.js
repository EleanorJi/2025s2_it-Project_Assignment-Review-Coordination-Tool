// Invite Markers – chips + history + suggest + batch invite (updated: statuses active/close/pending/expired; expired supports Resend)
(function(){
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
  const LIMIT_DOMAIN = false; // set true to restrict to ALLOWED_DOMAINS
  const ALLOWED_DOMAINS = ['deakin.edu.au'];

  // --- DOM refs ---
  const chipsEl   = document.getElementById('chips');
  const listEl    = document.getElementById('chipsList');
  const inputEl   = document.getElementById('chipsInput');
  const suggestEl = document.getElementById('suggest');
  const btnClear  = document.getElementById('btnClear');
  const btnSend   = document.getElementById('btnSend');
  const statusEl  = document.getElementById('status');
  const tbody     = document.getElementById('inviteTbody');

  // --- ensure pill styles for new statuses (safe if CSS already defines them) ---
  (function ensurePillStyles(){
    const css = `
      .pill.active{background:#ecfdf5;border-color:#a7f3d0;color:#065f46}
      .pill.close{background:#f3f4f6;border-color:#e5e7eb;color:#374151}
    `;
    const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  })();

  // ========= state =========
  let emails = [];              // selected
  let history = loadHistory();  // local history
  let suggest = [];             // current suggestions
  let activeIdx = -1;           // dropdown highlight index

  // ========= helpers =========
  function isValidEmail(e){
    if (!EMAIL_RE.test(e)) return false;
    if (LIMIT_DOMAIN) {
      const domain = e.split('@')[1]?.toLowerCase();
      return ALLOWED_DOMAINS.includes(domain);
    }
    return true;
  }
  function unique(arr){ return Array.from(new Set(arr.map(s=>s.toLowerCase()))); }

  function loadHistory(){
    try{ const raw = localStorage.getItem('inviteEmailHistory'); const arr = raw ? JSON.parse(raw) : []; return unique(arr); }catch{ return []; }
  }
  function saveHistory(){ const combined = unique([...history, ...emails]); localStorage.setItem('inviteEmailHistory', JSON.stringify(combined)); }

  function renderChips(){
    listEl.innerHTML = '';
    emails.forEach((e,i)=>{
      const chip = document.createElement('div');
      chip.className = 'chip' + (isValidEmail(e) ? '' : ' bad');
      chip.innerHTML = `<span>${e}</span><span class="x" aria-label="remove" title="Remove">×</span>`;
      chip.querySelector('.x').addEventListener('click', ()=>{ emails.splice(i,1); renderChips(); });
      listEl.appendChild(chip);
    });
  }

  function showSuggest(items){
    suggest = items || [];
    activeIdx = -1;
    if (suggest.length === 0){ suggestEl.classList.add('hidden'); suggestEl.innerHTML=''; return; }
    suggestEl.innerHTML = suggest.map((s,idx)=>`
      <div class="suggest-item" role="option" data-idx="${idx}">
        <span>${s}</span>
        <span class="meta">${history.includes(s) ? 'history' : 'suggest'}</span>
      </div>
    `).join('');
    suggestEl.classList.remove('hidden');
  }
  function closeSuggest(){ suggest = []; activeIdx=-1; suggestEl.classList.add('hidden'); }

  function pick(value){
    const parts = value.split(/[\,\s;]+/).map(v=>v.trim()).filter(Boolean);
    const valid = [];
    parts.forEach(p=>{
      const m = p.match(/<([^>]+)>/); const email = (m? m[1] : p).toLowerCase();
      if (isValidEmail(email)) valid.push(email);
    });
    if (valid.length){ emails = unique([...emails, ...valid]); renderChips(); inputEl.value = ''; closeSuggest(); }
  }

  // ========= input events =========
  inputEl.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter' || e.key === ',' || e.key === ';'){ e.preventDefault(); pick(inputEl.value); }
    else if (e.key === 'Backspace' && !inputEl.value){ emails.pop(); renderChips(); }
    else if (e.key === 'ArrowDown'){ if (!suggest.length) return; e.preventDefault(); activeIdx = Math.min(suggest.length-1, activeIdx+1); refreshActive(); }
    else if (e.key === 'ArrowUp'){ if (!suggest.length) return; e.preventDefault(); activeIdx = Math.max(0, activeIdx-1); refreshActive(); }
    else if (e.key === 'Tab'){ if (suggest.length && activeIdx >= 0){ e.preventDefault(); pick(suggest[activeIdx]); } }
  });
  inputEl.addEventListener('blur', ()=>{ if (inputEl.value.trim()) pick(inputEl.value); setTimeout(closeSuggest,150); });

  inputEl.addEventListener('input', async ()=>{
    const q = inputEl.value.trim().toLowerCase();
    if (!q){ closeSuggest(); return; }
    let local = history.filter(e=> e.startsWith(q) && !emails.includes(e));
    let remote = [];
    try{
      const res = await fetch(`/api/markers/suggest?q=${encodeURIComponent(q)}`);
      if (res.ok){ const data = await res.json(); remote = (data.emails || []).map(String); }
    }catch{}
    const merged = unique([...local, ...remote]).filter(e=> !emails.includes(e));
    showSuggest(merged.slice(0,8));
    bindSuggestClicks();
  });

  function bindSuggestClicks(){
    suggestEl.querySelectorAll('.suggest-item').forEach(el=>{
      el.addEventListener('mousedown', (e)=>{ e.preventDefault(); const idx = Number(el.dataset.idx); if (Number.isFinite(idx)) pick(suggest[idx]); });
    });
  }
  function refreshActive(){ suggestEl.querySelectorAll('.suggest-item').forEach((el,i)=>{ el.classList.toggle('active', i===activeIdx); }); }

  // ========= buttons =========
  btnClear.addEventListener('click', ()=>{ emails = []; renderChips(); inputEl.value=''; closeSuggest(); setStatus(''); });

  btnSend.addEventListener('click', async ()=>{
    if (emails.length===0){ setStatus('Please add at least one email.', 'err'); return; }
    saveHistory();
    setStatus('Sending invites…');
    try{
      let res = await fetch('/api/invitations/batch', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ emails }) });
      if (!res.ok){ // fallback: per-email
        for (const email of emails){
          const r = await fetch('/api/invitations', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email }) });
          if (!r.ok) throw new Error('Invite failed for ' + email);
        }
      }
      setStatus('Invites sent.', 'ok');
      emails = []; renderChips(); inputEl.value='';
      await refreshTable();
    }catch(err){ setStatus(err.message || 'Failed to send invites', 'err'); }
  });

  function setStatus(msg, type){ statusEl.className = 'msg' + (type ? ` ${type}` : ''); statusEl.textContent = msg || ''; }

  // ========= table =========
  async function refreshTable(){
    try{
      const res = await fetch('/api/invitations');
      let data;
      if (res.ok){ data = await res.json(); }
      else{
        // demo data (with new statuses)
        data = { items: [
          {email:'email@deakin.edu.au', status:'active',  sent_at:'Apr 2, 2025'},
          {email:'john@deakin.edu.au',  status:'pending', sent_at:'Jun 2, 2025'},
          {email:'eric@deakin.edu.au',  status:'expired', sent_at:'Jun 3, 2025'},
          {email:'alex@deakin.edu.au',  status:'close',   sent_at:'Jun 4, 2025'},
        ]};
      }
      renderTable(data.items || []);
    }catch{ renderTable([]); }
  }

  function renderTable(items){
    tbody.innerHTML = '';
    items.forEach(item=>{
      const tr = document.createElement('tr');
      const s  = (item.status || '').toLowerCase();

      const tdEmail = document.createElement('td'); tdEmail.textContent = item.email;

      const tdStatus= document.createElement('td');
      const pill = document.createElement('span');
      const {pillClass, pillText} = mapStatus(s);
      pill.className = 'pill ' + pillClass;
      pill.textContent = pillText;
      tdStatus.appendChild(pill);

      const tdDate  = document.createElement('td');  tdDate.textContent = item.sent_at || '—';

      const tdAct   = document.createElement('td');
      // Actions by status
      if(s === 'pending'){
        tdAct.appendChild(actionLink('Resend', ()=>resend(item.email)));
        tdAct.appendChild(spacer());
        tdAct.appendChild(actionLink('Revoke', ()=>revoke(item.email)));
      } else if(s === 'active' || s === 'accepted'){ // accepted → active
        tdAct.appendChild(actionLink('Close', ()=>closeInvite(item.email)));
      } else if(s === 'expired'){
        // Expired supports Resend
        tdAct.appendChild(actionLink('Resend', ()=>resend(item.email)));
      } else if(s === 'close' || s === 'closed'){
        tdAct.appendChild(actionLink('Reopen', ()=>reopenInvite(item.email)));
      } else {
        tdAct.appendChild(document.createTextNode('—'));
      }

      tr.append(tdEmail, tdStatus, tdDate, tdAct);
      tbody.appendChild(tr);
    });
  }

  function mapStatus(s){
    switch((s||'').toLowerCase()){
      case 'active':
      case 'accepted': return { pillClass:'active',  pillText:'Active' };
      case 'pending':  return { pillClass:'pending', pillText:'Pending' };
      case 'expired':  return { pillClass:'expired', pillText:'Expired' };
      case 'close':
      case 'closed':   return { pillClass:'close',   pillText:'Closed' };
      default:         return { pillClass:'pending', pillText: s || 'Pending' };
    }
  }

  function actionLink(text, handler){ const a=document.createElement('a'); a.href='#'; a.textContent=text; a.addEventListener('click', e=>{ e.preventDefault(); handler(); }); return a; }
  function spacer(){ return document.createTextNode('  '); }

  async function resend(email){
    try{ const r = await fetch('/api/invitations/resend', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email }) }); if (!r.ok) throw new Error('Failed'); setStatus('Resent to ' + email, 'ok'); await refreshTable(); }
    catch{ setStatus('Failed to resend to ' + email, 'err'); }
  }
  async function revoke(email){
    try{ const r = await fetch('/api/invitations/revoke', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email }) }); if (!r.ok) throw new Error('Failed'); setStatus('Revoked ' + email, 'ok'); await refreshTable(); }
    catch{ setStatus('Failed to revoke ' + email, 'err'); }
  }
  async function closeInvite(email){
    try{ const r = await fetch('/api/invitations/close', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email }) }); if (!r.ok) throw new Error('Failed'); setStatus('Closed ' + email, 'ok'); await refreshTable(); }
    catch{ setStatus('Failed to close ' + email, 'err'); }
  }
  async function reopenInvite(email){
    try{ const r = await fetch('/api/invitations/reopen', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email }) }); if (!r.ok) throw new Error('Failed'); setStatus('Reopened ' + email, 'ok'); await refreshTable(); }
    catch{ setStatus('Failed to reopen ' + email, 'err'); }
  }

  // init
  renderChips();
  refreshTable();
})();