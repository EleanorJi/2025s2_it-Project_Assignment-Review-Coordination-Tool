// Marker Task Management – Based on Coordinator Design
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
  };

  // 从后端获取项目数据（只显示active的assignment）
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
        let assignment1DueDate = null;
        let assignment2DueDate = null;
        let assignment1Id = null;
        let assignment2Id = null;

        try {
          // 1. 首先获取项目的最新assignment IDs
          const latestIdsResponse = await fetch(`/api/uploads/project/${project.project_id}/latest-ids`);
          if (latestIdsResponse.ok) {
            const latestIds = await latestIdsResponse.json();
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
        if (taskStatus === 'active') {
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
      showToast('Failed to load projects', 'error');
    }
  }

  // 渲染任务列表
  function renderTasks() {
    const container = $('#taskSections');
    if (!container) return;

    container.innerHTML = '';

    if (state.tasks.length === 0) {
      container.innerHTML = `
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
      container.appendChild(taskSection);
    });
  }

  // 创建任务区域
  function createTaskSection(task) {
    const section = document.createElement('div');
    section.className = 'tm-task-section';
    section.dataset.projectId = task.project_id;

    const statusClass = task.status === 'active' ? 'active' : 'draft';
    const statusText = task.status === 'active' ? 'Active' : 'Draft';

    section.innerHTML = `
      <div class="tm-task-header">
        <div>
          <span class="tm-task-title">${task.title}</span>
          <span class="tm-task-status ${statusClass}">${statusText}</span>
        </div>
        <span class="tm-task-chevron">▼</span>
      </div>
      <div class="tm-task-content">
        ${createAssignmentSections(task)}
        ${createRubricSection(task)}
      </div>
    `;

    // 绑定任务头部点击事件
    const header = section.querySelector('.tm-task-header');
    header.addEventListener('click', () => toggleTaskSection(section));

    return section;
  }

  // 创建Assignment区域
  function createAssignmentSections(task) {
    return task.assignments.map(assignment => {
      if (assignment.status !== 'published') {
        return ''; // 只显示published的assignment
      }

      const dueDateText = assignment.due_date ? 
        `Due: ${formatDate(assignment.due_date)}` : 
        'No due date set';

      return `
        <div class="tm-assignment-item">
          <div class="tm-assignment-header">
            <div>
              <span class="tm-assignment-title">${assignment.title}</span>
              <span class="tm-assignment-status published">Published</span>
            </div>
            <span class="tm-assignment-chevron">▼</span>
          </div>
          <div class="tm-assignment-actions">
            <button class="btn primary" onclick="markAssignment(${assignment.assignment_id})">Mark Assignment</button>
            <button class="btn" onclick="checkFeedback(${assignment.assignment_id})">Check Feedback</button>
            <div class="tm-muted" style="margin-top: 8px; font-size: 12px;">${dueDateText}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // 创建Rubric区域
  function createRubricSection(task) {
    if (!task.rubric_id) {
      return `
        <div class="tm-rubric-section">
          <div class="tm-rubric-header">
            <div>
              <span class="tm-rubric-title">Rubric</span>
            </div>
            <span class="tm-rubric-chevron">▼</span>
          </div>
          <div class="tm-rubric-actions">
            <span class="tm-muted">No rubric available</span>
          </div>
        </div>
      `;
    }

    return `
      <div class="tm-rubric-section">
        <div class="tm-rubric-header">
          <div>
            <span class="tm-rubric-title">Rubric</span>
          </div>
          <span class="tm-rubric-chevron">▼</span>
        </div>
        <div class="tm-rubric-actions">
          <button class="btn" onclick="viewRubric(${task.rubric_id})">View Rubric</button>
        </div>
      </div>
    `;
  }

  // 切换任务区域展开/收起
  function toggleTaskSection(section) {
    const content = section.querySelector('.tm-task-content');
    const chevron = section.querySelector('.tm-task-chevron');
    
    const isExpanded = content.classList.contains('expanded');
    
    if (isExpanded) {
      content.classList.remove('expanded');
      chevron.classList.remove('expanded');
    } else {
      content.classList.add('expanded');
      chevron.classList.add('expanded');
    }
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

  // 显示Toast消息
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    // 显示动画
    setTimeout(() => toast.classList.add('show'), 100);

    // 自动隐藏
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => document.body.removeChild(toast), 200);
    }, 3000);
  }

  // 全局函数：Mark Assignment
  window.markAssignment = function(assignmentId) {
    console.log(`📝 开始标记作业: assignment_id=${assignmentId}`);
    // 跳转到mark assignment页面
    window.location.href = `/Marker/mark-assignment.html?assignment_id=${assignmentId}`;
  };

  // 全局函数：Check Feedback
  window.checkFeedback = function(assignmentId) {
    console.log(`📋 查看反馈: assignment_id=${assignmentId}`);
    // 跳转到feedback页面
    window.location.href = `/Marker/feedback.html?assignment_id=${assignmentId}`;
  };

  // 全局函数：View Rubric
  window.viewRubric = function(rubricId) {
    console.log(`📊 查看评分标准: rubric_id=${rubricId}`);
    // 跳转到rubric页面
    window.location.href = `/Marker/rubric.html?rubric_id=${rubricId}`;
  };

  // 显示用户名
  function displayUsername() {
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
  }

  // 初始化
  function init() {
    console.log('🚀 Marker Task Management 初始化...');
    displayUsername();
    fetchProjects();
  }

  // 页面加载完成后初始化
  document.addEventListener('DOMContentLoaded', init);

})();
