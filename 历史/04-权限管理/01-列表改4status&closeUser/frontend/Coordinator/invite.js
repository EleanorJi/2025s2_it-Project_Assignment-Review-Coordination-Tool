// Invite Markers – chips + history + suggest + batch invite
(function(){
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
    // 如果要限制域：把下面的 false 改为 true，并填写允许域
    const LIMIT_DOMAIN = false;
    const ALLOWED_DOMAINS = ['deakin.edu.au'];
  
    const chipsEl   = document.getElementById('chips');
    const listEl    = document.getElementById('chipsList');
    const inputEl   = document.getElementById('chipsInput');
    const suggestEl = document.getElementById('suggest');
    const btnClear  = document.getElementById('btnClear');
    const btnSend   = document.getElementById('btnSend');
    const statusEl  = document.getElementById('status');
  
    const tbody     = document.getElementById('inviteTbody');
  
    // ========= state =========
    let emails = [];              // 已选
    let history = loadHistory();  // 本地历史
    let suggest = [];             // 当前下拉
    let activeIdx = -1;           // 下拉高亮
  
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
      try{
        const raw = localStorage.getItem('inviteEmailHistory');
        const arr = raw ? JSON.parse(raw) : [];
        return unique(arr);
      }catch{ return []; }
    }
    function saveHistory(){
      const combined = unique([...history, ...emails]);
      localStorage.setItem('inviteEmailHistory', JSON.stringify(combined));
    }
  
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
      const parts = value.split(/[,\s;]+/).map(v=>v.trim()).filter(Boolean);
      const valid = [];
      parts.forEach(p=>{
        if (!p) return;
        // 宽松：粘贴时可能出现 "Name <email>"，提取尖括号内
        const m = p.match(/<([^>]+)>/); const email = m ? m[1] : p;
        if (isValidEmail(email)) valid.push(email.toLowerCase());
      });
      if (valid.length){
        const merged = unique([...emails, ...valid]);
        emails = merged;
        renderChips();
        inputEl.value = '';
        closeSuggest();
      }
    }
  
    // ========= input events =========
    inputEl.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter' || e.key === ',' || e.key === ';'){
        e.preventDefault();
        pick(inputEl.value);
      } else if (e.key === 'Backspace' && !inputEl.value){
        // 删除最后一个
        emails.pop(); renderChips();
      } else if (e.key === 'ArrowDown'){
        if (!suggest.length) return;
        e.preventDefault();
        activeIdx = Math.min(suggest.length-1, activeIdx+1);
        refreshActive();
      } else if (e.key === 'ArrowUp'){
        if (!suggest.length) return;
        e.preventDefault();
        activeIdx = Math.max(0, activeIdx-1);
        refreshActive();
      } else if (e.key === 'Tab'){
        if (suggest.length && activeIdx >= 0){
          e.preventDefault();
          pick(suggest[activeIdx]);
        }
      }
    });
    inputEl.addEventListener('blur', ()=>{ if (inputEl.value.trim()) pick(inputEl.value); setTimeout(closeSuggest,150); });
  
    inputEl.addEventListener('input', async ()=>{
      const q = inputEl.value.trim().toLowerCase();
      if (!q){ closeSuggest(); return; }
  
      // 本地历史前缀匹配
      let local = history.filter(e=> e.startsWith(q) && !emails.includes(e));
      // 后端联想
      let remote = [];
      try{
        const res = await fetch(`/api/markers/suggest?q=${encodeURIComponent(q)}`, {
          credentials: 'include' // 允许携带 Cookie
        });
        if (res.ok){
          const data = await res.json();  // 期望 {emails: ["a@...","b@..."]}
          remote = (data.emails || []).map(String);
        }
      }catch{
        // 没有后端或出错时忽略
      }
      const merged = unique([...local, ...remote]).filter(e=> !emails.includes(e));
      showSuggest(merged.slice(0,8));
      bindSuggestClicks();
    });
  
    function bindSuggestClicks(){
      suggestEl.querySelectorAll('.suggest-item').forEach(el=>{
        el.addEventListener('mousedown', (e)=>{ // mousedown 防止 blur 抢先触发
          e.preventDefault();
          const idx = Number(el.dataset.idx);
          if (Number.isFinite(idx)) pick(suggest[idx]);
        });
      });
    }
    function refreshActive(){
      suggestEl.querySelectorAll('.suggest-item').forEach((el,i)=>{
        el.classList.toggle('active', i===activeIdx);
      });
    }
  
    // ========= buttons =========
    btnClear.addEventListener('click', ()=>{
      emails = [];
      renderChips();
      inputEl.value='';
      closeSuggest();
      status('');
    });
  
    btnSend.addEventListener('click', async ()=>{
      console.log('🎯 Send按钮被点击了！');
      if (emails.length===0){ status('Please add at least one email.', 'err'); return; }
      // 记录历史
      saveHistory();
      status('Sending invites…');
  
      try{
        // 优先尝试批量接口
        let res = await fetch('/api/invitations/batch', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ emails }),
          credentials: 'include'
        });
  
        // 如果没有批量接口，则逐个发送
        if (!res.ok){
          for (const email of emails){
            const r = await fetch('/api/invitations', {
              method:'POST',
              headers:{'Content-Type':'application/json'},
              body: JSON.stringify({ email }),
              credentials: 'include'
            });
            if (!r.ok) throw new Error('Invite failed for ' + email);
          }
        }
        status('Invites sent.', 'ok');
        emails = []; renderChips(); inputEl.value='';
        await refreshTable();
      }catch(err){
        status(err.message || 'Failed to send invites', 'err');
      }
    });
  
    function status(msg, type){
      statusEl.className = 'msg' + (type ? ` ${type}` : '');
      statusEl.textContent = msg || '';
    }
  
    // ========= table =========
    async function refreshTable(){
      try{
        // 期望返回：[{email,status,sent_at},{...}]
        const res = await fetch('/api/invitations', {
          credentials: 'include'
        });
        let data;
        if (res.ok){ data = await res.json(); }
        else{
          // demo 数据（后端未对接时）
          data = {
            items: [
              {email:'email@deakin.edu.au', status:'accepted', sent_at:'Apr 2, 2025'},
              {email:'john@deakin.edu.au',  status:'pending',  sent_at:'Jun 2, 2025'},
              {email:'eric@deakin.edu.au',  status:'expired',  sent_at:'Jun 3, 2025'},
            ]
          };
        }
        renderTable(data.items || []);
      }catch{
        renderTable([]);
      }
    }
  
    function renderTable(items){
      tbody.innerHTML = '';
      items.forEach(item=>{
        const tr = document.createElement('tr');
  
        const tdEmail = document.createElement('td'); tdEmail.textContent = item.email;
        const tdStatus= document.createElement('td');
        const pill = document.createElement('span');
        pill.className = 'pill ' + (
          item.status==='accepted' ? 'accept' :
          item.status==='pending'  ? 'pending' : 'expired'
        );
        pill.textContent = (
          item.status==='accepted' ? 'Accepted' :
          item.status==='pending'  ? 'Pending'  : 'Expired'
        );
        tdStatus.appendChild(pill);
  
        const tdDate  = document.createElement('td');  tdDate.textContent = item.sent_at || '—';
  
        const tdAct   = document.createElement('td');
        const a1 = document.createElement('a'); a1.href='#'; a1.textContent='Resend';
        a1.addEventListener('click', async (e)=>{ e.preventDefault(); await resend(item.email); });
        tdAct.appendChild(a1);
  
        if (item.status==='pending'){
          const sp = document.createTextNode('  ');
          const a2 = document.createElement('a'); a2.href='#'; a2.textContent='Revoke';
          a2.style.marginLeft='10px';
          a2.addEventListener('click', async (e)=>{ e.preventDefault(); await revoke(item.email); });
          tdAct.appendChild(sp); tdAct.appendChild(a2);
        }
  
        tr.append(tdEmail, tdStatus, tdDate, tdAct);
        tbody.appendChild(tr);
      });
    }
  
    async function resend(email){
      try{
        const r = await fetch('/api/invitations/resend', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ email }),
          credentials: 'include'
        });
        if (!r.ok) throw new Error('Failed');
        status('Resent to ' + email, 'ok');
        await refreshTable();
      }catch{ status('Failed to resend to ' + email, 'err'); }
    }
  
    async function revoke(email){
      try{
        const r = await fetch('/api/invitations/revoke', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ email }),
          credentials: 'include'
        });
        if (!r.ok) throw new Error('Failed');
        status('Revoked ' + email, 'ok');
        await refreshTable();
      }catch{ status('Failed to revoke ' + email, 'err'); }
    }
  
    // 初始
    renderChips();
    refreshTable();
  })();
  