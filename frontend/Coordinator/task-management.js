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
        console.log('🔄 开始获取项目数据...');
        const response = await fetch(API.listProjects);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log(`📊 获取到 ${data.projects?.length || 0} 个项目`);

        // 清空当前状态
        state.tasks = [];

        // 处理项目数据
        for (const project of data.projects) {
          console.log(`\n📋 处理项目: ${project.name} (ID: ${project.project_id})`);

          let assignment1Status = 'unpublished';
          let assignment2Status = 'unpublished';

          try {
            // 1. 首先获取项目的最新assignment IDs
            const latestIdsResponse = await fetch(`/api/uploads/project/${project.project_id}/latest-ids`);
            if (latestIdsResponse.ok) {
              const latestIds = await latestIdsResponse.json();
              console.log('📦 获取到最新IDs:', latestIds);

              // 2. 获取assignment1的状态
              if (latestIds.assignment1) {
                const statusResponse1 = await fetch(`/api/uploads/assignment/${latestIds.assignment1.assignment_id}/status`);
                if (statusResponse1.ok) {
                  const statusData1 = await statusResponse1.json();
                  assignment1Status = statusData1.assignment.is_published ? 'published' : 'unpublished';
                  console.log(`📄 Assignment1 发布状态: ${statusData1.assignment.is_published}`);
                } else {
                  console.warn('⚠️ 获取assignment1状态失败');
                }
              } else {
                console.log('📄 Assignment1: 无数据');
              }

              // 3. 获取assignment2的状态
              if (latestIds.assignment2) {
                const statusResponse2 = await fetch(`/api/uploads/assignment/${latestIds.assignment2.assignment_id}/status`);
                if (statusResponse2.ok) {
                  const statusData2 = await statusResponse2.json();
                  assignment2Status = statusData2.assignment.is_published ? 'published' : 'unpublished';
                  console.log(`📄 Assignment2 发布状态: ${statusData2.assignment.is_published}`);
                } else {
                  console.warn('⚠️ 获取assignment2状态失败');
                }
              } else {
                console.log('📄 Assignment2: 无数据');
              }
            } else {
              console.warn('⚠️ 获取最新IDs失败');
            }
          } catch (error) {
            console.error('❌ 获取assignment状态过程中出错:', error);
          }

          // 确定task状态：如果有任何assignment被publish，则为active，否则为draft
          let taskStatus = 'draft';
          if (assignment1Status === 'published' || assignment2Status === 'published') {
            taskStatus = 'active';
          }
          console.log(`🏷️ 项目状态: ${taskStatus}`);
          console.log(`📊 Assignment1状态: ${assignment1Status}, Assignment2状态: ${assignment2Status}`);

          state.tasks.push({
            title: project.name,
            description: project.description,
            project_id: project.project_id,
            created_at: project.created_at,
            file_counts: project.file_counts,
            rubric_id: project.rubric_id,
            status: taskStatus,
            assignments: [
              {
                id: 'assignment1',
                title: 'Assignment 1',
                status: assignment1Status
              },
              {
                id: 'assignment2',
                title: 'Assignment 2',
                status: assignment2Status
              }
            ]
          });

          console.log(`✅ 项目 ${project.name} 处理完成`);
        }

        console.log('🎉 所有项目数据处理完成，开始渲染界面');
        // 重新渲染界面
        render();
      } catch (error) {
        console.error('❌ 获取项目数据失败:', error);
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
      section.dataset.taskId = task.project_id;

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
        location.href = `/dashboard/coordinator/upload?project=${task.project_id}&type=rubric`;
      });

      const viewBtn = createButton('View Rubric', () => {
        location.href = `/dashboard/coordinator/rubric?project=${task.project_id}`;
      });

      // 检查A1是否已发布，如果已发布则隐藏Upload按钮
      const isA1Published = task.assignments.find(a => a.id === 'assignment1')?.status === 'published';

      console.log(`📊 Rubric按钮显示逻辑: A1发布状态=${isA1Published}, 有rubric文件=${task.file_counts?.rubric > 0}`);

      if (isA1Published) {
        // A1已发布，只显示View按钮（如果有rubric文件）
        if (task.file_counts?.rubric > 0) {
          actions.appendChild(viewBtn);
          console.log('🔘 Rubric显示: View按钮');
        } else {
          console.log('🔘 Rubric显示: 无按钮（A1已发布且无rubric文件）');
        }
      } else {
        // A1未发布，正常显示按钮
        if (task.file_counts?.rubric > 0) {
          actions.appendChild(uploadBtn);
          actions.appendChild(viewBtn);
          console.log('🔘 Rubric显示: Upload, View按钮');
        } else {
          actions.appendChild(uploadBtn);
          console.log('🔘 Rubric显示: Upload按钮');
        }
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
      console.log(`📝 Assignment状态显示: assignmentId=${assignment.id}, projectId=${task.project_id}, status=${assignment.status}`);

      // 正确格式化状态显示文本
      if (assignment.status === 'published') {
        status.textContent = 'Published';
        console.log(`✅ ${assignment.title} 状态: 已发布`);
      } else if (assignment.status === 'unpublished') {
        status.textContent = 'Unpublished';
        console.log(`⏸️ ${assignment.title} 状态: 未发布`);
      } else {
        status.textContent = assignment.status;
        console.log(`❓ ${assignment.title} 状态: ${assignment.status} (未知状态)`);
      }

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
        location.href = `/dashboard/coordinator/upload?project=${task.project_id}&assignment=${assignment.id}`;
      });

      const viewBtn = createButton('View', () => {
        location.href = `/dashboard/coordinator/view?project=${task.project_id}&assignment=${assignment.id}`;
      });

      const publishBtn = createButton('Publish Assignment', () => {
        publishAssignment(task.project_id, assignment.id);
      });

      const markBtn = createButton('Mark Assignment', () => {
        location.href = `/dashboard/coordinator/mark?project=${task.project_id}&assignment=${assignment.id}`;
      });

      const feedbackBtn = createButton('Feedback', () => {
        location.href = `/dashboard/coordinator/feedback?project=${task.project_id}&assignment=${assignment.id}`;
      });

      console.log(`🔄 为 ${assignment.title} 设置按钮: status=${assignment.status}, file_counts=${task.file_counts?.assignment}`);

      // 根据assignment状态显示不同的按钮
      if (assignment.status === 'published') {

        // 已发布：隐藏Upload按钮，显示其他按钮
        actions.appendChild(viewBtn);
        actions.appendChild(markBtn);
        actions.appendChild(feedbackBtn);
        console.log(`🔘 ${assignment.title} 显示按钮: View, Mark, Feedback (已发布，隐藏Upload)`);
      } else {
        // 未发布：显示Upload按钮
        actions.appendChild(uploadBtn);

        // 只有有assignment文件时才显示View按钮和发布按钮
        if (task.file_counts?.assignment > 0) {
          actions.appendChild(viewBtn);
          actions.appendChild(publishBtn);
          console.log(`🔘 ${assignment.title} 显示按钮: Upload, View, Publish`);
        } else {
          actions.appendChild(publishBtn);
          console.log(`🔘 ${assignment.title} 显示按钮: Upload, Publish`);
        }
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
        // 获取最新的assignment_id
        const latestIdsResponse = await fetch(`/api/uploads/project/${taskId}/latest-ids`);

        if (!latestIdsResponse.ok) {
          throw new Error('Failed to fetch latest assignment IDs');
        }

        const latestIds = await latestIdsResponse.json();

        // 前端校验：检查assignment是否存在
        let targetAssignmentId;
        let assignmentName;

        if (assignmentId === 'assignment1') {
          targetAssignmentId = latestIds.assignment1?.assignment_id;
          assignmentName = 'Assignment 1';
        } else if (assignmentId === 'assignment2') {
          targetAssignmentId = latestIds.assignment2?.assignment_id;
          assignmentName = 'Assignment 2';
        }

        // 前端明确校验
        if (!targetAssignmentId) {
          toast(`${assignmentName} is empty. Please create it first.`);
          return null; // 直接返回，不继续后续操作
        }

        // 调用发布接口
        const publishResponse = await fetch(`/api/uploads/assignment/${targetAssignmentId}/publish`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            is_published: true
          })
        });

        if (!publishResponse.ok) {
          const errorData = await publishResponse.json();
          throw new Error(errorData.error || errorData.message || 'Publish failed');
        }

        const result = await publishResponse.json();

        toast('Assignment published successfully!');
        // 重新加载数据   
        await fetchProjects();

        return result;
      } catch (error) {
        console.error('发布作业失败:', error);

        // 区分处理不同的错误类型（前端显示用英文）
        if (error.message.includes('Assignment not found')) {
          toast('Assignment not found. Please refresh the page and try again.');
        } else if (error.message.includes('请先发布作业1') || error.message.includes('未找到作业1最新版本')) {
          toast('Please publish Assignment 1 first before publishing Assignment 2.');
        } else if (error.message.includes('Cannot publish assignment')) {
          toast('Cannot publish assignment. Please make sure the project has at least one rubric and one assignment.');
        } else {
          toast('Failed to publish assignment. Please try again.');
        }

        throw error;
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