// Task Management – New Prototype Design
(function () {
    const $  = (s, r=document) => r.querySelector(s);
    const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

    // ---------- 状态管理 ----------
    const state = {
      tasks: []
    };

    // API endpoints
    const API = {
      listProjects: '/api/uploads/projects',
      createProject: '/api/uploads/project',
    };

    // 从后端获取项目数据
    async function fetchProjects() {
      try {
        const response = await fetch(API.listProjects);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        // 清空当前状态
        state.tasks = [];

        // 处理项目数据
        data.projects.forEach(project => {
          // 确定task状态：如果有任何assignment被publish，则为active，否则为draft
          let taskStatus = 'draft';
          let hasPublishedAssignment = false;
          
          // 这里需要根据实际数据结构调整
          if (project.status === 'published' || project.file_counts?.assignment > 0) {
            hasPublishedAssignment = true;
            taskStatus = 'active';
          }

          state.tasks.push({
            id: project.project_id,
              title: project.name,
              description: project.description,
              created_at: project.created_at,
              file_counts: project.file_counts,
              rubric_id: project.rubric_id,
            status: taskStatus,
            assignments: [
              {
                id: 'assignment1',
                title: 'Assignment 1',
                status: project.file_counts?.assignment > 0 ? 'published' : 'unpublished'
              },
              {
                id: 'assignment2', 
                title: 'Assignment 2',
                status: 'unpublished' // 默认第二个assignment是unpublished
              }
            ]
          });
        });

        // 重新渲染界面
        render();
      } catch (error) {
        console.error('获取项目数据失败:', error);
        toast('Failed to load projects. Please try again later.');
      }
    }

    const taskSections = $('#taskSections');

    function render() {
      taskSections.innerHTML = '';
      
      state.tasks.forEach(task => {
        const taskSection = createTaskSection(task);
        taskSections.appendChild(taskSection);
      });
    }

    function createTaskSection(task) {
      const section = document.createElement('div');
      section.className = 'tm-task-section';
      section.dataset.taskId = task.id;

      // Task header
      const header = document.createElement('div');
      header.className = 'tm-task-header';
      
      const titleContainer = document.createElement('div');
      titleContainer.style.display = 'flex';
      titleContainer.style.alignItems = 'center';
      
      const title = document.createElement('div');
      title.className = 'tm-task-title';
      title.textContent = task.title;
      
      const status = document.createElement('span');
      status.className = `tm-task-status ${task.status}`;
      status.textContent = task.status === 'draft' ? 'Draft' : 'Active';
      
      titleContainer.appendChild(title);
      titleContainer.appendChild(status);
      
      const chevron = document.createElement('div');
      chevron.className = 'tm-task-chevron';
      chevron.innerHTML = '▾';
      chevron.addEventListener('click', () => toggleTaskSection(section));
      
      header.appendChild(titleContainer);
      header.appendChild(chevron);

      // Task content
      const content = document.createElement('div');
      content.className = 'tm-task-content';
      
      // Rubric section
      const rubricSection = createRubricSection(task);
      content.appendChild(rubricSection);
      
      // Assignment sections
      task.assignments.forEach(assignment => {
        const assignmentSection = createAssignmentSection(task, assignment);
        content.appendChild(assignmentSection);
      });

      section.appendChild(header);
      section.appendChild(content);

      return section;
    }

    function createRubricSection(task) {
      const section = document.createElement('div');
      section.className = 'tm-rubric-section';
      
      const header = document.createElement('div');
      header.className = 'tm-rubric-header';
      
      const title = document.createElement('div');
      title.className = 'tm-rubric-title';
      title.textContent = 'Rubric';
      
      const chevron = document.createElement('div');
      chevron.className = 'tm-rubric-chevron';
      chevron.innerHTML = '▾';
      chevron.addEventListener('click', () => toggleRubricSection(section));
      
      header.appendChild(title);
      header.appendChild(chevron);
      
      const actions = document.createElement('div');
      actions.className = 'tm-rubric-actions';
      
      const uploadBtn = createButton('Upload Rubric', () => {
        location.href = `/dashboard/coordinator/upload?project=${task.id}&type=rubric`;
      });
      
      const viewBtn = createButton('View Rubric', () => {
        location.href = `/dashboard/coordinator/rubric?project=${task.id}`;
      });
      
      // 只有有rubric文件时才显示View按钮
      if (task.file_counts?.rubric > 0) {
        actions.appendChild(uploadBtn);
        actions.appendChild(viewBtn);
      } else {
        actions.appendChild(uploadBtn);
      }
      
      section.appendChild(header);
      section.appendChild(actions);
      
      return section;
    }

    function createAssignmentSection(task, assignment) {
      const section = document.createElement('div');
      section.className = 'tm-assignment-item';
      
      const header = document.createElement('div');
      header.className = 'tm-assignment-header';
      
      const titleContainer = document.createElement('div');
      titleContainer.style.display = 'flex';
      titleContainer.style.alignItems = 'center';
      
      const title = document.createElement('div');
      title.className = 'tm-assignment-title';
      title.textContent = assignment.title;
      
      const status = document.createElement('span');
      status.className = `tm-assignment-status ${assignment.status}`;
      status.textContent = assignment.status;
      
      titleContainer.appendChild(title);
      titleContainer.appendChild(status);
      
      const chevron = document.createElement('div');
      chevron.className = 'tm-assignment-chevron';
      chevron.innerHTML = '▾';
      chevron.addEventListener('click', () => toggleAssignmentSection(section));
      
      header.appendChild(titleContainer);
      header.appendChild(chevron);
      
      const actions = document.createElement('div');
      actions.className = 'tm-assignment-actions';
      
      const uploadBtn = createButton('Upload', () => {
        location.href = `/dashboard/coordinator/upload?project=${task.id}&assignment=${assignment.id}`;
      });
      
      const viewBtn = createButton('View', () => {
        location.href = `/dashboard/coordinator/view?project=${task.id}&assignment=${assignment.id}`;
      });
      
      const publishBtn = createButton('Publish Assignment', () => {
        publishAssignment(task.id, assignment.id);
      });
      
      const markBtn = createButton('Mark Assignment', () => {
        location.href = `/dashboard/coordinator/mark?project=${task.id}&assignment=${assignment.id}`;
      });
      
      const feedbackBtn = createButton('Feedback', () => {
        location.href = `/dashboard/coordinator/feedback?project=${task.id}&assignment=${assignment.id}`;
      });
      
      actions.appendChild(uploadBtn);
      
      // 只有有assignment文件时才显示其他按钮
      if (assignment.status === 'published' || task.file_counts?.assignment > 0) {
        actions.appendChild(viewBtn);
        actions.appendChild(markBtn);
        actions.appendChild(feedbackBtn);
      } else {
        actions.appendChild(publishBtn);
      }
      
      section.appendChild(header);
      section.appendChild(actions);
      
      return section;
    }

    function createButton(text, onClick) {
      const button = document.createElement('button');
      button.className = 'btn';
      button.textContent = text;
      button.addEventListener('click', onClick);
      return button;
    }

    // ---------- 交互功能 ----------
    
    // 切换task section的展开/收起
    function toggleTaskSection(section) {
      const content = section.querySelector('.tm-task-content');
      const chevron = section.querySelector('.tm-task-chevron');
      
      // 关闭其他所有task sections
      $$('.tm-task-section').forEach(otherSection => {
        if (otherSection !== section) {
          const otherContent = otherSection.querySelector('.tm-task-content');
          const otherChevron = otherSection.querySelector('.tm-task-chevron');
          otherContent.classList.remove('expanded');
          otherChevron.classList.remove('expanded');
        }
      });
      
      // 切换当前section
      content.classList.toggle('expanded');
      chevron.classList.toggle('expanded');
      
      // 关闭所有assignment和rubric的展开状态
      if (content.classList.contains('expanded')) {
        $$('.tm-assignment-actions, .tm-rubric-actions').forEach(actions => {
          actions.classList.remove('expanded');
        });
        $$('.tm-assignment-chevron, .tm-rubric-chevron').forEach(chevron => {
          chevron.classList.remove('expanded');
        });
      }
    }
    
    // 切换rubric section的展开/收起
    function toggleRubricSection(section) {
      const actions = section.querySelector('.tm-rubric-actions');
      const chevron = section.querySelector('.tm-rubric-chevron');
      
      // 关闭其他所有rubric和assignment的展开状态
      $$('.tm-assignment-actions').forEach(otherActions => {
        otherActions.classList.remove('expanded');
      });
      $$('.tm-assignment-chevron').forEach(otherChevron => {
        otherChevron.classList.remove('expanded');
      });
      
      // 切换当前section
      actions.classList.toggle('expanded');
      chevron.classList.toggle('expanded');
    }
    
    // 切换assignment section的展开/收起
    function toggleAssignmentSection(section) {
      const actions = section.querySelector('.tm-assignment-actions');
      const chevron = section.querySelector('.tm-assignment-chevron');
      
      // 关闭其他所有assignment和rubric的展开状态
      $$('.tm-assignment-actions').forEach(otherActions => {
        if (otherActions !== actions) {
          otherActions.classList.remove('expanded');
        }
      });
      $$('.tm-assignment-chevron').forEach(otherChevron => {
        if (otherChevron !== chevron) {
          otherChevron.classList.remove('expanded');
        }
      });
      $$('.tm-rubric-actions').forEach(otherActions => {
        otherActions.classList.remove('expanded');
      });
      $$('.tm-rubric-chevron').forEach(otherChevron => {
        otherChevron.classList.remove('expanded');
      });
      
      // 切换当前section
      actions.classList.toggle('expanded');
      chevron.classList.toggle('expanded');
    }
    
    // 发布assignment
    async function publishAssignment(taskId, assignmentId) {
      try {
        // 这里需要调用实际的API来发布assignment
        toast('Assignment published successfully!');
        // 重新加载数据
        await fetchProjects();
      } catch (error) {
        console.error('Failed to publish assignment:', error);
        toast('Failed to publish assignment. Please try again.');
      }
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

    // 将 Add New Assignment 按钮改为打开项目创建弹窗
    const btnAdd = $('#btnAdd');
    if (btnAdd) {
        btnAdd.addEventListener('click', openProjectModal);
    }

})();