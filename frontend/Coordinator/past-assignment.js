// Past Assignment – grouped by semester with collapse + actions
(function () {
    const $  = (s, r=document) => r.querySelector(s);
    // ✅ Display username
    try {
      const rawUser = localStorage.getItem("user");
      if (rawUser) {
        const user = JSON.parse(rawUser);
        if (user && user.name) {
          const usernameEl = document.getElementById("username");
          if (usernameEl) {
            usernameEl.textContent = user.name;
          }
        }
      }
    } catch (err) {
      console.error("Failed to load username:", err);
    }

    // ===== Data loading =====
    let data = [];
    loadPastTasks();

    async function loadPastTasks(){
      const host = $('#paContainer');
      try {
        host.innerHTML = '<div class="pa-sub">Loading…</div>';
        const res = await fetch('/api/uploads/past-tasks', { credentials:'include' });
        if(!res.ok){ throw new Error(`HTTP ${res.status}`); }
        const json = await res.json();
        data = json.groups || [];
        render();
      } catch(err){
        console.error('Failed to load past tasks:', err);
        host.innerHTML = '';
        toast('Failed to load past tasks');
        // fallback to empty state
        data = [];
        render();
      }
    }
  
    // ===== Render =====
    const host = $('#paContainer');
  
    function render() {
      host.innerHTML = '';
      data.forEach(group => host.appendChild(renderSemester(group)));
    }
  
    function renderSemester(group) {
      const block = document.createElement('div');
      block.className = 'pa-block';
  
      // Header
      const hd = document.createElement('div');
      hd.className = 'pa-hd';
      const title = document.createElement('div');
      title.className = 'pa-title';
      title.textContent = `${group.year} · ${group.semester}`;
      const toggle = document.createElement('div');
      toggle.className = 'pa-toggle';
      toggle.textContent = '▾';
      hd.append(title, toggle);
      block.append(hd);
  
      // Project list within the semester
      const list = document.createElement('div');
      list.className = 'pa-list';
      (group.projects || []).forEach(project => list.appendChild(renderProject(project)));
      block.append(list);
  
      // Collapse
      hd.addEventListener('click', () => {
        const collapsed = block.classList.toggle('collapsed');
        toggle.textContent = collapsed ? '▸' : '▾';
      });
  
      return block;
    }
  
    function renderProject(project) {
      const projBlock = document.createElement('div');
      projBlock.className = 'pa-block';

      // Project header (project name + status + dropdown)
      const pHd = document.createElement('div');
      pHd.className = 'pa-hd';
      
      const leftWrap = document.createElement('div');
      leftWrap.style.display = 'flex';
      leftWrap.style.alignItems = 'center';
      leftWrap.style.gap = '8px';

      const pTitle = document.createElement('div');
      pTitle.className = 'pa-title';
      pTitle.textContent = project.project_name || 'Project';
      
      const pStatus = document.createElement('span');
      if (project.status) {
        pStatus.className = `pa-status ${project.status}`;
        pStatus.textContent = project.status === 'archived' ? 'Archived' : (project.status === 'completed' ? 'Completed' : project.status);
      }
      
      const statusWrap = document.createElement('div');
      statusWrap.style.display = 'inline-flex';
      statusWrap.style.alignItems = 'center';
      const statusBtn = document.createElement('button');
      statusBtn.textContent = '▸';
      statusBtn.className = 'tm-status-toggle';
      statusBtn.style.marginLeft = '8px';
      statusBtn.style.background = 'transparent';
      statusBtn.style.border = 'none';
      statusBtn.style.cursor = 'pointer';
      const menu = document.createElement('div');
      menu.className = 'pa-status-menu';
      // Ensure the floating menu is attached to DOM
      document.body.appendChild(menu);
      
      function addItem(label, value){
        const it = document.createElement('div');
        it.className = 'pa-status-item';
        it.textContent = label;
        it.addEventListener('click', async (e)=>{
          e.stopPropagation();
          await updateProjectStatus(project.project_id, value);
          menu.classList.remove('show');
        });
        menu.appendChild(it);
      }
      if (project.status === 'archived') addItem('Complete', 'completed');
      if (project.status === 'completed') addItem('Archive', 'archived');
      statusBtn.addEventListener('click', (e)=>{
        e.stopPropagation();
        const rect = statusBtn.getBoundingClientRect();
        menu.style.top = `${Math.round(rect.top + window.scrollY - 4)}px`;
        menu.style.left = `${Math.round(rect.right + window.scrollX + 8)}px`;
        menu.classList.toggle('show');
        statusBtn.textContent = menu.classList.contains('show') ? '◂' : '▸';
      });
      document.addEventListener('click', ()=>{ menu.classList.remove('show'); statusBtn.textContent='▸'; });

      statusWrap.appendChild(statusBtn);
      // left group: title + status + caret
      leftWrap.appendChild(pTitle);
      if (project.status) leftWrap.appendChild(pStatus);
      leftWrap.appendChild(statusWrap);
      
      const pToggle = document.createElement('div');
      pToggle.className = 'pa-toggle';
      pToggle.textContent = '▾';
      // header: left group + collapse caret on the right
      pHd.append(leftWrap);
      pHd.append(pToggle);
      projBlock.append(pHd);

      // Assignment list inside project (latest Round 1 & Round 2)
      const aList = document.createElement('div');
      aList.className = 'pa-list';
      (project.assignments || []).forEach(a => aList.appendChild(renderAssignmentRow(a, project.project_id)));
      projBlock.append(aList);

      pHd.addEventListener('click', () => {
        const collapsed = projBlock.classList.toggle('collapsed');
        pToggle.textContent = collapsed ? '▸' : '▾';
      });

      return projBlock;
    }

    function renderAssignmentRow(item, projectId) {
      const row = document.createElement('div');
      row.className = 'pa-row';
  
      const left = document.createElement('div');
      left.className = 'pa-muted';
      left.textContent = item.title;
  
      const acts = document.createElement('div');
      acts.className = 'pa-actions';
      acts.append(
        makeBtn('View report', () => openOrToast(`/dashboard/coordinator/feedback?project=${projectId}&assignment=${item.assignment_id}`,'Feedback not available')),
        makeBtn('Open rubric', () => openOrToast(`/dashboard/coordinator/rubric?project=${projectId}`,'Rubric not available'))
      );
  
      row.append(left, acts);
      return row;
    }
  
    function makeBtn(text, onClick) {
      const b = document.createElement('button');
      b.className = 'btn sm';
      b.textContent = text;
      b.addEventListener('click', onClick);
      return b;
    }
  
    function openOrToast(url, fallbackMsg) {
      if (url && url !== '#') {
        window.open(url, '_blank', 'noopener');
      } else {
        toast(fallbackMsg);
      }
    }
  
    
    // Simple toast (using global .toast styles)
    function toast(msg, ms=2000){
      const t=document.createElement('div');
      t.className='toast'; t.textContent=msg; document.body.appendChild(t);
      requestAnimationFrame(()=> t.classList.add('show'));
      setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=> t.remove(), 200); }, ms);
    }    render();

    async function updateProjectStatus(projectId, status){
      try{
        const res = await fetch(`/api/uploads/project/${encodeURIComponent(projectId)}/status`, {
          method:'PUT',
          headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify({ status })
        });
        if(!res.ok){ throw new Error(await res.text()); }
        toast('Status updated');
        await loadPastTasks();
      }catch(err){
        console.error(err);
        toast('Failed to update status');
      }
    }

    // 初始化dropdown和logout功能
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

    // Global goToResetPassword function
    window.goToResetPassword = function() {
      window.location.href = '/reset-password';
    };
  })();
