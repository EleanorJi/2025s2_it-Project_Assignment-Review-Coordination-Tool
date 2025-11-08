// Marker Task Management – Based on Coordinator Design
(function () {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  // ---------- 状态管理 ----------
  const state = {
    tasks: []
  };

  // 展开状态管理
  const EXPANDED_STATES_KEY = 'taskManagement_marker_expandedStates';
  
  // 保存展开状态到localStorage
  function saveExpandedStates() {
    const expandedStates = {
      tasks: {},
      rubrics: {},
      assignments: {}
    };
    
    // 保存task sections的展开状态
    $$('.tm-task-section').forEach(section => {
      const taskId = section.dataset.taskId;
      const content = section.querySelector('.tm-task-content');
      if (content && content.classList.contains('expanded')) {
        expandedStates.tasks[taskId] = true;
      }
    });
    
    // 保存rubric sections的展开状态
    $$('.tm-rubric-section').forEach(section => {
      const taskId = section.closest('.tm-task-section')?.dataset.taskId;
      const actions = section.querySelector('.tm-rubric-actions');
      if (taskId && actions && actions.classList.contains('expanded')) {
        expandedStates.rubrics[taskId] = true;
      }
    });
    
    // 保存assignment sections的展开状态
    $$('.tm-assignment-item').forEach(section => {
      const taskId = section.closest('.tm-task-section')?.dataset.taskId;
      const assignmentId = section.querySelector('.tm-assignment-title')?.textContent;
      const actions = section.querySelector('.tm-assignment-actions');
      if (taskId && assignmentId && actions && actions.classList.contains('expanded')) {
        if (!expandedStates.assignments[taskId]) {
          expandedStates.assignments[taskId] = {};
        }
        expandedStates.assignments[taskId][assignmentId] = true;
      }
    });
    
    localStorage.setItem(EXPANDED_STATES_KEY, JSON.stringify(expandedStates));
  }
  
  // 从localStorage恢复展开状态
  function restoreExpandedStates() {
    try {
      const savedStates = localStorage.getItem(EXPANDED_STATES_KEY);
      if (!savedStates) return;
      
      const expandedStates = JSON.parse(savedStates);
      
      // 恢复task sections的展开状态
      if (expandedStates.tasks) {
        Object.keys(expandedStates.tasks).forEach(taskId => {
          const section = $(`.tm-task-section[data-task-id="${taskId}"]`);
          if (section) {
            const content = section.querySelector('.tm-task-content');
            const chevron = section.querySelector('.tm-task-chevron');
            if (content && chevron) {
              content.classList.add('expanded');
              chevron.classList.add('expanded');
            }
          }
        });
      }
      
      // 恢复rubric sections的展开状态
      if (expandedStates.rubrics) {
        Object.keys(expandedStates.rubrics).forEach(taskId => {
          const section = $(`.tm-task-section[data-task-id="${taskId}"]`);
          if (section) {
            const rubricSection = section.querySelector('.tm-rubric-section');
            if (rubricSection) {
              const actions = rubricSection.querySelector('.tm-rubric-actions');
              const chevron = rubricSection.querySelector('.tm-rubric-chevron');
              if (actions && chevron) {
                actions.classList.add('expanded');
                chevron.classList.add('expanded');
              }
            }
          }
        });
      }
      
      // 恢复assignment sections的展开状态
      if (expandedStates.assignments) {
        Object.keys(expandedStates.assignments).forEach(taskId => {
          const section = $(`.tm-task-section[data-task-id="${taskId}"]`);
          if (section) {
            const assignmentStates = expandedStates.assignments[taskId];
            Object.keys(assignmentStates).forEach(assignmentTitle => {
              const assignmentSection = Array.from(section.querySelectorAll('.tm-assignment-item')).find(item => {
                const title = item.querySelector('.tm-assignment-title');
                return title && title.textContent === assignmentTitle;
              });
              if (assignmentSection) {
                const actions = assignmentSection.querySelector('.tm-assignment-actions');
                const chevron = assignmentSection.querySelector('.tm-assignment-chevron');
                if (actions && chevron) {
                  actions.classList.add('expanded');
                  chevron.classList.add('expanded');
                }
              }
            });
          }
        });
      }
    } catch (error) {
      console.warn('Failed to restore expanded states:', error);
    }
  }

  // API endpoints
  const API = {
    listProjects: '/api/uploads/projects',
  };

  // 从后端获取项目数据（只显示active的assignment）
  async function fetchProjects() {
    try {
      console.log('🔄 开始获取项目数据...');
      console.log('🔗 API URL:', API.listProjects);
      const response = await fetch(API.listProjects);
      console.log('📡 Response status:', response.status, response.statusText);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log('📊 获取到数据:', data);
      console.log(`📊 获取到 ${data.projects?.length || 0} 个项目`);

      // 清空当前状态
      state.tasks = [];

      // 处理项目数据
      for (const project of data.projects) {
        console.log(`\n📋 处理项目: ${project.name} (ID: ${project.project_id})`);

        let assignment1Status = 'unpublished';
        let assignment2Status = 'unpublished';
        let assignment1DueDate = null;
        let assignment2DueDate = null;
        let assignment1Id = null;
        let assignment2Id = null;
        let latestIds = null;

        try {
          // 1. 首先获取项目的最新assignment IDs
          const latestIdsResponse = await fetch(`/api/uploads/project/${project.project_id}/latest-ids`);
          if (latestIdsResponse.ok) {
            latestIds = await latestIdsResponse.json();
            console.log('📦 获取到最新IDs:', latestIds);

            // 2. 获取assignment1的状态和DDL
            if (latestIds.assignment1) {
              const statusResponse1 = await fetch(`/api/uploads/assignment/${latestIds.assignment1.assignment_id}/status`);
              if (statusResponse1.ok) {
                const statusData1 = await statusResponse1.json();
                assignment1Status = statusData1.assignment.is_published ? 'published' : 'unpublished';
                assignment1DueDate = statusData1.assignment.due_at;
                assignment1Id = latestIds.assignment1.assignment_id;
                console.log(`📄 Assignment1 发布状态: ${statusData1.assignment.is_published}`);
              } else {
                console.warn('⚠️ 获取assignment1状态失败');
              }
            } else {
              console.log('📄 Assignment1: 无数据');
            }

            // 3. 获取assignment2的状态和DDL
            if (latestIds.assignment2) {
              const statusResponse2 = await fetch(`/api/uploads/assignment/${latestIds.assignment2.assignment_id}/status`);
              if (statusResponse2.ok) {
                const statusData2 = await statusResponse2.json();
                assignment2Status = statusData2.assignment.is_published ? 'published' : 'unpublished';
                assignment2DueDate = statusData2.assignment.due_at;
                assignment2Id = latestIds.assignment2.assignment_id;
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

        // 只显示有active assignment的项目
        console.log(`🔍 检查项目 ${project.name}: taskStatus=${taskStatus}, assignment1Status=${assignment1Status}, assignment2Status=${assignment2Status}`);
        if (taskStatus === 'active') {
          console.log(`✅ 添加active项目: ${project.name}`);
          console.log(`📋 项目详情:`, {
            title: project.name,
            project_id: project.project_id,
            assignment1: { status: assignment1Status, id: assignment1Id, due: assignment1DueDate },
            assignment2: { status: assignment2Status, id: assignment2Id, due: assignment2DueDate },
            rubric_id: latestIds?.rubric?.rubric_id
          });
          state.tasks.push({
            title: project.name,
            description: project.description,
            project_id: project.project_id,
            created_at: project.created_at,
            file_counts: project.file_counts,
            rubric_id: latestIds?.rubric?.rubric_id || null,
            status: taskStatus,
            assignments: [
              {
                id: 'assignment1',
                title: 'Assignment 1',
                status: assignment1Status,
                due_date: assignment1DueDate,
                assignment_id: assignment1Id
              },
              {
                id: 'assignment2',
                title: 'Assignment 2',
                status: assignment2Status,
                due_date: assignment2DueDate,
                assignment_id: assignment2Id
              }
            ]
          });
        }
      }

      console.log(`✅ 最终处理完成，共 ${state.tasks.length} 个active项目`);
      renderTasks();
    } catch (error) {
      console.error('❌ 获取项目数据失败:', error);
      toast('Failed to load projects. Please try again later.');
    }
  }

  const taskSections = $('#taskSections');

  function renderTasks() {
    taskSections.innerHTML = '';
    
    if (state.tasks.length === 0) {
      taskSections.innerHTML = `
        <div class="tm-task-section">
          <div class="tm-task-header">
            <div class="tm-task-title">No Active Tasks</div>
          </div>
          <div class="tm-task-content expanded">
            <p class="tm-muted">No assignments are currently available for marking.</p>
          </div>
        </div>
      `;
      return;
    }
    
    state.tasks.forEach(task => {
      const taskSection = createTaskSection(task);
      taskSections.appendChild(taskSection);
    });
    
    // 渲染完成后恢复展开状态
    setTimeout(() => {
      restoreExpandedStates();
    }, 100);
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

    header.addEventListener('click', () => toggleTaskSection(section));

    header.appendChild(titleContainer);
    header.appendChild(chevron);

    // Task content
    const content = document.createElement('div');
    content.className = 'tm-task-content';

    // Rubric section
    const rubricSection = createRubricSection(task);
    content.appendChild(rubricSection);

    // Assignment sections - 修复这里
    task.assignments.forEach(assignment => {
      const assignmentSection = createAssignmentSection(task, assignment);
      // 添加 null 检查
      if (assignmentSection) {
        content.appendChild(assignmentSection);
      }
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
    
    // 让整个header可点击
    header.addEventListener('click', () => toggleRubricSection(section));

    header.appendChild(title);
    header.appendChild(chevron);

    const actions = document.createElement('div');
    actions.className = 'tm-rubric-actions';

    // 只显示View Rubric按钮（如果有rubric文件）
    if (task.rubric_id) {
      const viewBtn = createButton('View Rubric', () => {
        location.href = `/dashboard/marker/rubric?project=${task.project_id}`;
      });
      viewBtn.className = 'btn';
      actions.appendChild(viewBtn);
      console.log('🔘 Rubric显示: View按钮');
    } else {
      const noRubricText = document.createElement('span');
      noRubricText.className = 'tm-muted';
      noRubricText.textContent = 'No rubric available';
      actions.appendChild(noRubricText);
      console.log('🔘 Rubric显示: 无rubric文件');
    }

    section.appendChild(header);
    section.appendChild(actions);

    return section;
  }

  function createAssignmentSection(task, assignment) {
    const section = document.createElement('div');
    section.className = 'tm-assignment-item';

    // 只显示published的assignment
    if (assignment.status !== 'published') {
      return null;
    }

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
    status.textContent = 'Published';

    titleContainer.appendChild(title);
    titleContainer.appendChild(status);

    const chevron = document.createElement('div');
    chevron.className = 'tm-assignment-chevron';
    chevron.innerHTML = '▾';

    // 让整个header可点击
    header.addEventListener('click', () => toggleAssignmentSection(section));

    header.appendChild(titleContainer);
    header.appendChild(chevron);

    const actions = document.createElement('div');
    actions.className = 'tm-assignment-actions';

    // 添加DDL显示
    const dueDateText = assignment.due_date ? 
      `Due: ${formatDate(assignment.due_date)}` : 
      'No due date set';

    const dueDateDiv = document.createElement('div');
    dueDateDiv.className = 'tm-muted';
    dueDateDiv.style.marginTop = '8px';
    dueDateDiv.style.fontSize = '12px';
    dueDateDiv.textContent = dueDateText;

    // 创建按钮容器（先显示加载状态）
    const buttonContainer = document.createElement('div');
    buttonContainer.innerHTML = '<span class="tm-muted">Checking status...</span>';
    actions.appendChild(buttonContainer);
    actions.appendChild(dueDateDiv);

    section.appendChild(header);
    section.appendChild(actions);

    // 异步检查marking状态
    checkMarkingStatus(assignment.assignment_id, buttonContainer, assignment, task.project_id);

    return section;
  }
  // 检查marker是否已经完成marking
  async function checkMarkingStatus(assignmentId, buttonContainer, assignment, projectId) {
    try {
      // 获取当前用户ID
      const rawUser = localStorage.getItem("user");
      if (!rawUser) {
        throw new Error('User not found in localStorage');
      }

      const user = JSON.parse(rawUser);
      console.log('👤 当前用户:', user);
      const markerId = user.id;

      if (!markerId) {
        throw new Error('User ID not found');
      }

      console.log(`🔍 检查marking状态: assignment_id=${assignmentId}, marker_id=${markerId}`);

      const response = await fetch(`/api/uploads/scoring/marker/${assignmentId}/${markerId}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log(`📊 Marking状态数据:`, data);

      // 检查是否有提交的记录且finalized=true
      const hasMarked = data.marker_scores && data.marker_scores.length > 0 &&
                       data.marker_scores.some(score => score.finalized === true);

      console.log(`✅ Marking状态: ${hasMarked ? '已提交' : '未提交'}`);

      // 更新按钮
      updateAssignmentButton(buttonContainer, hasMarked, assignment, projectId);

    } catch (error) {
      console.error('❌ 检查marking状态失败:', error);

      // 出错时显示默认的Mark Assignment按钮
      updateAssignmentButton(buttonContainer, false, assignment, projectId);

      // 可选：显示错误提示
      const errorText = buttonContainer.querySelector('.tm-muted');
      if (errorText) {
        errorText.textContent = 'Failed to check status';
        errorText.style.color = '#ef4444';
      }
    }
  }
  // 更新assignment按钮状态
  function updateAssignmentButton(buttonContainer, hasMarked, assignment, projectId) {
    buttonContainer.innerHTML = ''; // 清空加载状态

    if (hasMarked) {
      // 如果已经mark过且finalized=true，显示Check Feedback按钮
      const feedbackBtn = createButton('Check Feedback', () => {
        location.href = `/dashboard/marker/feedback?project=${projectId}&assignment_id=${assignment.assignment_id}`;
        console.log('assignment.id:', assignment.id, 'projectId:', projectId,'assignment_id:', assignment.assignment_id);
      });
      feedbackBtn.className = 'btn primary';
      buttonContainer.appendChild(feedbackBtn);
    } else {
      // 如果还没有mark过或未finalized，显示Mark Assignment按钮
      const markBtn = createButton('Mark Assignment', () => {
        location.href = `/dashboard/marker/mark?project=${projectId}&assignment=${assignment.id}`;
        console.log('assignment.id:', assignment.id, 'projectId:', projectId,'assignment_id:', assignment.assignment_id);
      });
      markBtn.className = 'btn primary';
      buttonContainer.appendChild(markBtn);
    }
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
    
    // 保存展开状态
    saveExpandedStates();
  }
  
  // 切换rubric section的展开/收起
  function toggleRubricSection(section) {
    const actions = section.querySelector('.tm-rubric-actions');
    const chevron = section.querySelector('.tm-rubric-chevron');
    
    // 只切换当前section - 不自动关闭其他sections
    actions.classList.toggle('expanded');
    chevron.classList.toggle('expanded');
    
    // 保存展开状态
    saveExpandedStates();
  }
  
  // 切换assignment section的展开/收起
  function toggleAssignmentSection(section) {
    const actions = section.querySelector('.tm-assignment-actions');
    const chevron = section.querySelector('.tm-assignment-chevron');
    
    // 只切换当前section - 不自动关闭其他sections
    actions.classList.toggle('expanded');
    chevron.classList.toggle('expanded');
    
    // 保存展开状态
    saveExpandedStates();
  }

  // 格式化日期
  function formatDate(dateString) {
    if (!dateString) return 'No date';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
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

  // 初始化dropdown
  const accountEl = document.querySelector('.account');
  const dropdown = document.querySelector('.dropdown-menu');
  const logoutBtn = document.querySelector('.dropdown-item');

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

  fetchProjects();

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

})();