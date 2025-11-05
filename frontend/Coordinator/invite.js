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
  
  // Data overview elements
  const totalMarkersEl = document.getElementById('totalMarkers');
  const activeMarkersEl = document.getElementById('activeMarkers');
  const pendingMarkersEl = document.getElementById('pendingMarkers');
  const closedMarkersEl = document.getElementById('closedMarkers');

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
  let currentData = { items: [] }; // current invitation data

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
    
    // Enhanced email recognition - detect partial emails and suggest completions
    let local = history.filter(e=> e.toLowerCase().includes(q) && !emails.includes(e));
    
    // Auto-complete common email patterns
    if (q.includes('@')) {
      // If user typed @, suggest common domains
      const domain = q.split('@')[1];
      if (domain && domain.length > 0) {
        const commonDomains = ['deakin.edu.au', 'gmail.com', 'outlook.com', 'yahoo.com'];
        const matchingDomains = commonDomains.filter(d => d.startsWith(domain));
        matchingDomains.forEach(d => {
          const fullEmail = q.split('@')[0] + '@' + d;
          if (!local.includes(fullEmail) && !emails.includes(fullEmail)) {
            local.push(fullEmail);
          }
        });
      }
    } else if (q.length >= 2) {
      // Suggest common email prefixes with @deakin.edu.au
      const commonPrefixes = ['john', 'jane', 'alex', 'sarah', 'mike', 'emma', 'david', 'lisa'];
      commonPrefixes.forEach(prefix => {
        if (prefix.startsWith(q)) {
          const email = prefix + '@deakin.edu.au';
          if (!local.includes(email) && !emails.includes(email)) {
            local.push(email);
          }
        }
      });
    }
    
    let remote = [];
    try{
      const res = await fetch(`/api/invitations/suggest?q=${encodeURIComponent(q)}`, {
        credentials: 'include'
      });
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
      let res = await fetch('/api/invitations/batch', { 
        method:'POST', 
        headers:{'Content-Type':'application/json'}, 
        credentials: 'include',
        body: JSON.stringify({ emails }) 
      });
      
      if (res.ok) {
        // Handle batch response with detailed results
        const data = await res.json();
        if (data.success && data.results) {
          const invited = data.results.filter(r => r.status === 'invited' || r.status === 'renewed').length;
          const alreadySent = data.results.filter(r => r.status === 'skipped' && r.reason === 'Active invitation already exists').length;
          const userExists = data.results.filter(r => r.status === 'skipped' && r.reason === 'User already exists').length;
          
          let message = '';
          if (invited > 0 && alreadySent > 0) {
            message = `${invited} invites sent, ${alreadySent} already sent.`;
          } else if (invited > 0) {
            message = 'Invites sent.';
          } else if (alreadySent > 0) {
            message = 'Already sent.';
          } else if (userExists > 0) {
            message = 'Users already exist.';
          } else {
            message = 'No invites processed.';
          }
          
          setStatus(message, 'ok');
        } else {
          setStatus('Invites sent.', 'ok');
        }
      } else { 
        // fallback: per-email
        for (const email of emails){
          const r = await fetch('/api/invitations', { 
            method:'POST', 
            headers:{'Content-Type':'application/json'}, 
            credentials: 'include',
            body: JSON.stringify({ email }) 
          });
          if (!r.ok) {
            const data = await r.json().catch(() => ({}));
            throw new Error(data.message || 'Invite failed for ' + email);
          }
        }
        setStatus('Invites sent.', 'ok');
      }
      
      emails = []; renderChips(); inputEl.value='';
      await refreshTable();
    }catch(err){ setStatus(err.message || 'Failed to send invites', 'err'); }
  });

  function setStatus(msg, type){ statusEl.className = 'msg' + (type ? ` ${type}` : ''); statusEl.textContent = msg || ''; }

  // ========= table =========
  async function refreshTable(){
    try{
      const res = await fetch('/api/invitations', {
        credentials: 'include'
      });
      let data;
      if (res.ok){ 
        data = await res.json(); 
        currentData = data; // Store current data for stats
        updateDataOverview(data.items || []);
      }
      else{
        // demo data (with new statuses)
        data = { items: [
          {email:'email@deakin.edu.au', status:'active',  sent_at:'Apr 2, 2025'},
          {email:'john@deakin.edu.au',  status:'pending', sent_at:'Jun 2, 2025'},
          {email:'eric@deakin.edu.au',  status:'expired', sent_at:'Jun 3, 2025'},
          {email:'alex@deakin.edu.au',  status:'close',   sent_at:'Jun 4, 2025'},
        ]};
        currentData = data;
        updateDataOverview(data.items || []);
      }
      renderTable(data.items || []);
    }catch{ 
      renderTable([]); 
      updateDataOverview([]);
    }
  }

  // Update data overview statistics
  function updateDataOverview(items) {
    const stats = {
      total: 0, // Total registered markers (only active ones)
      active: 0,
      pending: 0,
      closed: 0
    };

    items.forEach(item => {
      const status = (item.status || '').toLowerCase();
      switch(status) {
        case 'active':
        case 'accepted':
          stats.active++;
          stats.total++; // Only count active markers as total
          break;
        case 'pending':
          stats.pending++;
          break;
        case 'close':
        case 'closed':
          stats.closed++;
          break;
      }
    });

    // Update DOM elements
    if (totalMarkersEl) totalMarkersEl.textContent = stats.total;
    if (activeMarkersEl) activeMarkersEl.textContent = stats.active;
    if (pendingMarkersEl) pendingMarkersEl.textContent = stats.pending;
    if (closedMarkersEl) closedMarkersEl.textContent = stats.closed;
    
    // Fetch total markers from coordinator dashboard API to get accurate count
    fetchTotalMarkersFromDashboard();
  }

  // Fetch total markers count from coordinator dashboard API
  async function fetchTotalMarkersFromDashboard() {
    try {
      const response = await fetch('/dashboard/api/coordinator/data', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.kpi && data.kpi.totalMarkers !== undefined) {
          // Update total markers with accurate count from database
          if (totalMarkersEl) {
            totalMarkersEl.textContent = data.kpi.totalMarkers;
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch total markers from dashboard:', error);
      // Keep the current count if API call fails
    }
  }

  function renderTable(items){
    tbody.innerHTML = '';
    items.forEach(item=>{
      const tr = document.createElement('tr');
      const s  = (item.status || '').toLowerCase();

      const tdEmail = document.createElement('td'); tdEmail.textContent = item.email;

      // Nickname column - editable for active users
      const tdNickname = document.createElement('td');
      if (item.user_id && (s === 'active' || s === 'accepted')) {
        // Container for both display and edit modes
        const container = document.createElement('div');
        
        // Display mode - clickable text with border (styled like close button)
        const displayContainer = document.createElement('div');
        displayContainer.className = 'action-btn close';
        displayContainer.style.display = 'inline-block';
        displayContainer.style.cursor = 'pointer';
        displayContainer.title = 'Click to edit nickname';
        
        const displaySpan = document.createElement('span');
        displaySpan.className = 'nickname-display';
        displaySpan.textContent = item.nickname || item.name || '—';
        
        displayContainer.appendChild(displaySpan);
        
        // Edit mode - input + Save button (hidden by default)
        const editContainer = document.createElement('div');
        editContainer.style.display = 'none';
        editContainer.style.gap = '8px';
        editContainer.style.alignItems = 'center';
        
        const nicknameInput = document.createElement('input');
        nicknameInput.type = 'text';
        nicknameInput.className = 'nickname-input';
        nicknameInput.value = item.nickname || item.name || '';
        nicknameInput.placeholder = 'Enter nickname';
        nicknameInput.style.width = '140px';
        nicknameInput.style.padding = '4px 8px';
        nicknameInput.style.border = '1px solid #ddd';
        nicknameInput.style.borderRadius = '4px';
        nicknameInput.style.fontSize = '13px';
        
        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save';
        saveBtn.className = 'action-btn close';
        
        // Click display box to enter edit mode
        displayContainer.addEventListener('click', () => {
          displayContainer.style.display = 'none';
          editContainer.style.display = 'flex';
          nicknameInput.focus();
          nicknameInput.select();
        });
        
        // Save on button click
        saveBtn.addEventListener('click', async () => {
          const newNickname = nicknameInput.value.trim();
          await updateNickname(item.email, newNickname, displayContainer, editContainer, displaySpan);
        });
        
        // Save on Enter key
        nicknameInput.addEventListener('keypress', async (e) => {
          if (e.key === 'Enter') {
            const newNickname = nicknameInput.value.trim();
            await updateNickname(item.email, newNickname, displayContainer, editContainer, displaySpan);
          }
        });
        
        // Cancel on Escape key
        nicknameInput.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            editContainer.style.display = 'none';
            displayContainer.style.display = 'inline-block';
          }
        });
        
        editContainer.appendChild(nicknameInput);
        editContainer.appendChild(saveBtn);
        
        container.appendChild(displayContainer);
        container.appendChild(editContainer);
        tdNickname.appendChild(container);
      } else {
        // For non-active users, just show name or placeholder
        tdNickname.textContent = item.name || '—';
        tdNickname.style.color = '#999';
      }

      const tdStatus= document.createElement('td');
      const pill = document.createElement('span');
      const {pillClass, pillText} = mapStatus(s);
      pill.className = 'pill ' + pillClass;
      pill.textContent = pillText;
      tdStatus.appendChild(pill);

      const tdDate  = document.createElement('td');  tdDate.textContent = item.sent_at || '—';

      const tdAct   = document.createElement('td');
      // Create action buttons container
      const actionContainer = document.createElement('div');
      actionContainer.className = 'action-buttons';
      
      // Actions by status
      if(s === 'pending'){
        actionContainer.appendChild(actionButton('Resend', 'resend', ()=>resend(item.email)));
        actionContainer.appendChild(actionButton('Revoke', 'revoke', ()=>revoke(item.email)));
      } else if(s === 'active' || s === 'accepted'){ // accepted → active
        actionContainer.appendChild(actionButton('Close', 'close', ()=>closeInvite(item.email)));
      } else if(s === 'expired'){
        // Expired supports Resend
        actionContainer.appendChild(actionButton('Resend', 'resend', ()=>resend(item.email)));
      } else if(s === 'close' || s === 'closed'){
        actionContainer.appendChild(actionButton('Reopen', 'reopen', ()=>reopenInvite(item.email)));
      } else {
        actionContainer.appendChild(document.createTextNode('—'));
      }
      
      tdAct.appendChild(actionContainer);

      tr.append(tdEmail, tdNickname, tdStatus, tdDate, tdAct);
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
  
  // New styled action button function
  function actionButton(text, type, handler) {
    const button = document.createElement('button');
    button.className = `action-btn ${type}`;
    button.textContent = text;
    button.addEventListener('click', e => {
      e.preventDefault();
      handler();
    });
    return button;
  }

  async function resend(email){
    try{ 
      const r = await fetch('/api/invitations/resend', { 
        method:'POST', 
        headers:{'Content-Type':'application/json'}, 
        credentials: 'include',
        body: JSON.stringify({ email }) 
      }); 
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to resend');
      }
      setStatus('Resent to ' + email, 'ok'); 
      await refreshTable(); 
    }
    catch(err){ setStatus(err.message || 'Failed to resend to ' + email, 'err'); }
  }
  async function revoke(email){
    try{ 
      const r = await fetch('/api/invitations/revoke', { 
        method:'POST', 
        headers:{'Content-Type':'application/json'}, 
        credentials: 'include',
        body: JSON.stringify({ email }) 
      }); 
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to revoke');
      }
      setStatus('Revoked ' + email, 'ok'); 
      await refreshTable(); 
    }
    catch(err){ setStatus(err.message || 'Failed to revoke ' + email, 'err'); }
  }
  async function closeInvite(email){
    try{ 
      const r = await fetch('/api/invitations/close', { 
        method:'POST', 
        headers:{'Content-Type':'application/json'}, 
        credentials: 'include',
        body: JSON.stringify({ email }) 
      }); 
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to close');
      }
      setStatus('Closed ' + email, 'ok'); 
      await refreshTable(); 
    }
    catch(err){ setStatus(err.message || 'Failed to close ' + email, 'err'); }
  }
  async function reopenInvite(email){
    try{ 
      const r = await fetch('/api/invitations/reopen', { 
        method:'POST', 
        headers:{'Content-Type':'application/json'}, 
        credentials: 'include',
        body: JSON.stringify({ email }) 
      }); 
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to reopen');
      }
      setStatus('Reopened ' + email, 'ok'); 
      await refreshTable(); 
    }
    catch(err){ setStatus(err.message || 'Failed to reopen ' + email, 'err'); }
  }

  async function updateNickname(email, nickname, displayContainer, editContainer, displaySpan){
    try{ 
      const r = await fetch('/api/invitations/update-nickname', { 
        method:'POST', 
        headers:{'Content-Type':'application/json'}, 
        credentials: 'include',
        body: JSON.stringify({ email, nickname }) 
      }); 
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to update nickname');
      }
      setStatus('Nickname updated for ' + email, 'ok');
      // Update display text and switch back to display mode
      displaySpan.textContent = nickname || email.split('@')[0];
      editContainer.style.display = 'none';
      displayContainer.style.display = 'inline-block';
      // Refresh table to get latest data
      await refreshTable(); 
    }
    catch(err){ 
      setStatus(err.message || 'Failed to update nickname for ' + email, 'err');
      alert(err.message || 'Failed to update nickname');
    }
  }

  // ========= initialization =========
  function initCommonNav() {
    // Get user info from localStorage
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
  }

  function initDropdownAndLogout() {
    const accountEl = document.querySelector('.account');
    const dropdown = document.querySelector('.dropdown-menu');
    const allDropdownItems = document.querySelectorAll('.dropdown-item');
    const logoutBtn = allDropdownItems.length > 1 ? allDropdownItems[1] : null;

    if (accountEl && dropdown) {
      accountEl.addEventListener('click', (e) => {
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

    // 全局logout函数
    window.logout = async function() {
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
    };

    // 全局goToResetPassword函数
    window.goToResetPassword = function() {
      window.location.href = '/reset-password';
    };
  }

  // Onboarding modal functions
  window.showOnboarding = function() {
    const overlay = document.getElementById('onboardingOverlay');
    if (overlay) {
      overlay.classList.add('active');
    }
  };

  window.hideOnboarding = function() {
    const overlay = document.getElementById('onboardingOverlay');
    if (overlay) {
      overlay.classList.remove('active');
    }
  };

  // Close onboarding when clicking overlay
  document.addEventListener('click', function(e) {
    const overlay = document.getElementById('onboardingOverlay');
    if (overlay && e.target === overlay) {
      hideOnboarding();
    }
  });

  // Initialize everything when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    initCommonNav();
    initDropdownAndLogout();
    renderChips();
    refreshTable();
  });
})();
