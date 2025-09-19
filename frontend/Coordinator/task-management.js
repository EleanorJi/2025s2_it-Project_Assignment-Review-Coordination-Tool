// Task Management – list + modal + dropzones (consistent with your DS)
(function () {
    const $  = (s, r=document) => r.querySelector(s);
    const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

    // ---------- 状态管理 ----------
    const state = {
      upcoming: [],
      completed: []
    };

    // API endpoints
    const API = {
      listProjects: '/api/uploads/projects',
      createProject: '/api/uploads/project',
    };

    let currentProjectId = null;

    // 从后端获取项目数据
    async function fetchProjects() {
      try {
        const response = await fetch(API.listProjects);
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
          if (project.status === 'published'|| project.status === 'draft') {
            state.upcoming.push({
              title: project.name,
              description: project.description,
              project_id: project.project_id,
              created_at: project.created_at,
              file_counts: project.file_counts,
              rubric_id: project.rubric_id,
              status: project.status // 添加状态信息
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
              rubric_id: project.rubric_id,
              status: project.status // 添加状态信息
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
      const makeRow = (item, isUpcoming) => {
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

        // 如果项目状态是draft，添加灰色draft字样
        if (item.status === 'draft') {
          const draftBadge = document.createElement('div');
          draftBadge.className = 'tm-draft-badge';
          draftBadge.textContent = 'Draft';
          draftBadge.style.color = '#6B7280'; // 灰色文字
          draftBadge.style.fontSize = '0.875rem'; // 较小的字体
          draftBadge.style.marginTop = '4px'; // 与描述有一些间距
          left.appendChild(draftBadge);
        }

        const act = document.createElement('div');
        act.className = 'tm-actions';

        // Upcoming 项目：显示 Upload Rubric/Assignment + View Rubric + Mark Assignment
        if (isUpcoming) {
          const btnUpload = btn('Upload Rubric/Assignment', () => {
            location.href = `/dashboard/coordinator/upload?project=${item.project_id}`;
          });

          // 只有非 draft 状态的项目才显示 View Rubric
          let buttons = [btnUpload];

          if (item.status !== 'draft' && item.file_counts?.rubric > 0) {
            const btnViewRubric = btn('View Rubric', () => viewRubricDetails(item.rubric_id));
            buttons.push(btnViewRubric);
          }

          const btnMark = btn('Mark Assignment', () => (location.href = `/dashboard/coordinator/mark?project=${item.project_id}`));
          buttons.push(btnMark);

          act.append(...buttons);
        }
        // Completed 项目：显示 View Rubric + View Analysis
        else {
          // 只有有 rubric 文件的项目才显示 View Rubric
          if (item.file_counts?.rubric > 0) {
            const btnViewRubric = btn('View Rubric', () => viewRubricDetails(item.rubric_id));
            act.append(btnViewRubric);
          }

          const btnAna = btn('View Analysis', () => (location.href = `/dashboard/coordinator/analysis?project=${item.project_id}`));
          act.append(btnAna);
        }

        row.append(left, act);
        box.append(row);
        return box;
      };

      upcomingList.innerHTML = '';
      state.upcoming.forEach(it => upcomingList.append(makeRow(it, true))); // true 表示 upcoming

      completedList.innerHTML = '';
      state.completed.forEach(it => completedList.append(makeRow(it, false))); // false 表示 completed
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

    // ---------- 项目创建弹窗 ----------
    let projectModal, projectInput, descriptionInput, projectMsg, lastFocusEl;

    function ensureProjectModal() {
        if (projectModal) return;

        projectModal = document.createElement('div');
        projectModal.id = 'project-modal';
        projectModal.style.position = 'fixed';
        projectModal.style.inset = '0';
        projectModal.style.display = 'none';
        projectModal.style.placeItems = 'center';
        projectModal.style.background = 'rgba(15,23,42,.38)';
        projectModal.style.padding = '16px';
        projectModal.style.zIndex = '10000';
        projectModal.setAttribute('aria-hidden', 'true');

        projectModal.innerHTML = `
            <div role="dialog" aria-modal="true" aria-labelledby="pm-title"
                style="width:min(520px,92vw);background:#fff;border:1px solid #E6EAF2;border-radius:16px;box-shadow:0 6px 24px rgba(2,6,23,0.06);overflow:hidden">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #E6EAF2">
                <h3 id="pm-title" style="margin:0;font-weight:800">Create New Project</h3>
                <button id="pm-close" class="btn" style="background:transparent;border-color:transparent;color:#6B7280">✕</button>
            </div>
            <form id="pm-form" style="padding:14px;display:flex;flex-direction:column;gap:12px">
                <label class="label" for="project-name">Project name</label>
                <input id="project-name" class="input" placeholder="e.g., 2025 · Semester 1" autocomplete="off" />

                <label class="label" for="project-description">Task description</label>
                <textarea id="project-description" class="input" placeholder="Enter task description (optional)"
                    style="height:80px;padding:10px;resize:vertical" autocomplete="off"></textarea>

                <div style="display:flex;gap:10px;justify-content:flex-end">
                <button type="button" class="btn" id="pm-cancel">Cancel</button>
                <button type="submit" class="btn primary" id="pm-create">Create</button>
                </div>
                <div class="msg" id="pm-msg"></div>
            </form>
            </div>
        `;
        document.body.appendChild(projectModal);

        projectInput = $('#project-name', projectModal);
        descriptionInput = $('#project-description', projectModal);
        projectMsg = $('#pm-msg', projectModal);

        // 事件绑定
        $('#pm-close', projectModal)?.addEventListener('click', closeProjectModal);
        $('#pm-cancel', projectModal)?.addEventListener('click', closeProjectModal);
        projectModal.addEventListener('click', (e) => {
            if (e.target === projectModal) closeProjectModal();
        });
        document.addEventListener('keydown', (e) => {
            if (projectModal.style.display !== 'none' && e.key === 'Escape') {
                closeProjectModal();
            }
        });

        $('#pm-form', projectModal).addEventListener('submit', onCreateProjectSubmit);
    }

    function openProjectModal() {
        ensureProjectModal();
        lastFocusEl = document.activeElement;
        projectInput.value = '';
        descriptionInput.value = '';
        setProjectMsg('');
        projectModal.style.display = 'grid';
        projectModal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        setTimeout(() => projectInput.focus(), 0);
    }

    function closeProjectModal() {
        if (!projectModal) return;
        projectModal.style.display = 'none';
        projectModal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        if (lastFocusEl && typeof lastFocusEl.focus === 'function') {
            lastFocusEl.focus();
        }
    }

    async function onCreateProjectSubmit(e) {
        e.preventDefault();
        const name = (projectInput.value || '').trim();
        const description = (descriptionInput.value || '').trim();

        if (!name) {
            setProjectMsg('Please enter a project name');
            projectInput.focus();
            return;
        }

        try {
            setProjectMsg('Creating…', true);
            const res = await fetch(API.createProject, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name,
                    description: description
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Create failed');

            setProjectMsg('Created', true);
            toast(`Project "${data.project.name}" created`);
            setTimeout(() => {
                closeProjectModal();
                fetchProjects(); // 刷新项目列表
            }, 250);
        } catch (err) {
            setProjectMsg(err.message || 'Create failed');
        }
    }

    function setProjectMsg(text, ok) {
        if (!projectMsg) return;
        projectMsg.textContent = text || '';
        projectMsg.className = 'msg' + (text ? (ok ? ' ok' : ' err') : '');
    }

    // ---------- toast ----------
    function toast(msg, ms=2200){
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;right:16px;bottom:16px;background:#0F172A;color:#fff;padding:10px 12px;border-radius:10px;box-shadow:0 12px 30px rgba(0,0,0,.2);opacity:0;transform:translateY(6px);transition:.2s;z-index:2000;font-weight:700';
      el.textContent = msg; document.body.appendChild(el);
      requestAnimationFrame(()=>{ el.style.opacity=1; el.style.transform='none'; });
      setTimeout(()=>{ el.style.opacity=0; el.style.transform='translateY(6px)'; setTimeout(()=> el.remove(), 200); }, ms);
    }

    // 初始化
    // 显示用户名
    try {
    const rawUser = localStorage.getItem("user");
    if (rawUser) {
      const user = JSON.parse(rawUser);
      if (user && user.name) {
        document.getElementById("username").textContent = user.name;
      }
    }
    } catch (err) {
    console.error("Failed to load username:", err);
    }
    fetchProjects();

    // 将 Create New Task 按钮改为打开项目创建弹窗
    const btnAdd = $('#btnAdd');
    if (btnAdd) {
        btnAdd.addEventListener('click', openProjectModal);
    }

})();