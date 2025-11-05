// Task Management – New Prototype Design
(function () {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  // ---------- State Management ----------
  const state = {
    tasks: []
  };

  // 展开状态管理
  const EXPANDED_STATES_KEY = 'taskManagement_expandedStates';
  
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
    createProject: '/api/uploads/project',
    uploadDraft: '/api/uploads/drafts',
    commit: '/api/uploads/commit',
    updateProjectStatus: (id)=>`/api/uploads/project/${id}/status`,
  };

  async function uploadDraftFile(file, slot) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('slot', slot);
    const res = await fetch(API.uploadDraft, { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data; // { temp_name: '...' }
  }

  async function commitFile(tempName, fileType, round, dueDate, projectId) {
    const payload = {
      temp_name: tempName,
      file_type: fileType,
      project_id: projectId,
      round: round ?? null,
      due_date: dueDate ?? null,
    };
    const res = await fetch(API.commit, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Commit failed');
    return data;
  }

  // Get project data from backend
  async function fetchProjects() {
    try {
      console.log('🔄 Starting to fetch project data...');
      const response = await fetch(API.listProjects);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log(`📊 Retrieved ${data.projects?.length || 0} projects`);

      // Clear current state
      state.tasks = [];

      // Process project data
      for (const project of data.projects) {
        console.log(`\n📋 Processing project: ${project.name} (ID: ${project.project_id})`);

        let assignment1Status = 'unpublished';
        let assignment2Status = 'unpublished';
        let assignment1Finalized = false;
        let assignment2Finalized = false;
        let assignment1HasFile = false;
        let assignment2HasFile = false;

        try {
          // 1. First get the latest assignment IDs for the project
          const latestIdsResponse = await fetch(`/api/uploads/project/${project.project_id}/latest-ids`);
          if (latestIdsResponse.ok) {
            const latestIds = await latestIdsResponse.json();
            console.log('Retrieved latest IDs:', latestIds);

            // 2. Get assignment1 status
            if (latestIds.assignment1) {
              assignment1HasFile = true;
              const statusResponse1 = await fetch(`/api/uploads/assignment/${latestIds.assignment1.assignment_id}/status`);
              if (statusResponse1.ok) {
                const statusData1 = await statusResponse1.json();
                assignment1Status = statusData1.assignment.is_published ? 'published' : 'unpublished';
                console.log(`📄 Assignment1 publish status: ${statusData1.assignment.is_published}`);
              } else {
                console.warn('⚠️ Failed to get assignment1 status');
              }

              // 检查assignment1的评分是否已提交
              try {
                const finalizedResponse1 = await fetch(`/api/uploads/scoring/baseline/${latestIds.assignment1.assignment_id}`);
                if (finalizedResponse1.ok) {
                  const finalizedData1 = await finalizedResponse1.json();
                  assignment1Finalized = finalizedData1.baseline_scores?.[0]?.finalized || false;
                  console.log(`📄 Assignment1 评分状态: ${assignment1Finalized ? '已提交' : '未提交'}`);
                }
              } catch (error) {
                console.log('📄 Assignment1 评分检查: 无数据或未评分');
              }
            } else {
              console.log('📄 Assignment1: No data');
            }

            // 3. Get assignment2 status
            if (latestIds.assignment2) {
              assignment2HasFile = true;
              const statusResponse2 = await fetch(`/api/uploads/assignment/${latestIds.assignment2.assignment_id}/status`);
              if (statusResponse2.ok) {
                const statusData2 = await statusResponse2.json();
                assignment2Status = statusData2.assignment.is_published ? 'published' : 'unpublished';
                console.log(`📄 Assignment2 publish status: ${statusData2.assignment.is_published}`);
              } else {
                console.warn('⚠️ 获取assignment2状态失败');
              }

              // 检查assignment2的评分是否已提交
              try {
                const finalizedResponse2 = await fetch(`/api/uploads/scoring/baseline/${latestIds.assignment2.assignment_id}`);
                if (finalizedResponse2.ok) {
                  const finalizedData2 = await finalizedResponse2.json();
                  assignment2Finalized = finalizedData2.baseline_scores?.[0]?.finalized || false;
                  console.log(`📄 Assignment2 评分状态: ${assignment2Finalized ? '已提交' : '未提交'}`);
                }
              } catch (error) {
                console.log('📄 Assignment2 评分检查: 无数据或未评分');
              }
            } else {
              console.log('📄 Assignment2: No data');
            }
          } else {
            console.warn('⚠️ Failed to get latest IDs');
          }
        } catch (error) {
          console.error('❌ Error occurred while getting assignment status:', error);
        }

        // Determine task status with priority:
        // 1) archived -> filtered out (not shown in Task Management)
        // 2) completed -> show Completed
        // 3) active -> keep original dynamic rule (published => active, else draft)
        if (project.status === 'archived') {
          console.log('🗃️ Archived project filtered from Task Management');
          continue; // do not render archived projects here
        }
        let taskStatus = 'draft';
        if (project.status === 'completed') {
          taskStatus = 'completed';
        } else {
          if (assignment1Status === 'published' || assignment2Status === 'published') {
            taskStatus = 'active';
          }
        }
        console.log(`🏷️ Project status: ${taskStatus}`);
        console.log(`📊 Assignment1 status: ${assignment1Status}, Assignment2 status: ${assignment2Status}`);

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
              status: assignment1Status,
              finalized: assignment1Finalized,
              hasFile: assignment1HasFile
            },
            {
              id: 'assignment2',
              title: 'Assignment 2',
              status: assignment2Status,
              finalized: assignment2Finalized,
              hasFile: assignment2HasFile
            }
          ]
        });

        console.log(`✅ Project ${project.name} processing completed`);
      }

      console.log('🎉 All project data processing completed, starting interface rendering');
      // Re-render interface
      render();
    } catch (error) {
      console.error('❌ Failed to get project data:', error);
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
    
    // 渲染完成后恢复展开状态
    setTimeout(() => {
      restoreExpandedStates();
      
      // Check URL parameters and auto-expand
      handleURLParameters();
    }, 100);
  }

  // Handle URL parameters for auto-expanding specific tasks and assignments
  function handleURLParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('project');
    const assignmentRound = urlParams.get('assignment');
    
    if (!projectId) return;
    
    console.log(`🔗 URL parameters detected: project=${projectId}, assignment=${assignmentRound}`);
    
    // Find and expand the task section
    const taskSection = $(`.tm-task-section[data-task-id="${projectId}"]`);
    if (!taskSection) {
      console.warn(`⚠️ Task section not found for project_id=${projectId}`);
      return;
    }
    
    // Expand the task section
    const taskContent = taskSection.querySelector('.tm-task-content');
    const taskChevron = taskSection.querySelector('.tm-task-chevron');
    if (taskContent && taskChevron) {
      taskContent.classList.add('expanded');
      taskChevron.classList.add('expanded');
      console.log(`✅ Task section expanded for project_id=${projectId}`);
    }
    
    // If assignment parameter is provided, expand that specific assignment
    if (assignmentRound) {
      const assignmentId = `assignment${assignmentRound}`;
      const assignmentTitle = `Assignment ${assignmentRound}`;
      
      // Find the assignment section within the task
      const assignmentSections = taskSection.querySelectorAll('.tm-assignment-item');
      const targetAssignment = Array.from(assignmentSections).find(section => {
        const title = section.querySelector('.tm-assignment-title');
        return title && title.textContent === assignmentTitle;
      });
      
      if (targetAssignment) {
        const assignmentActions = targetAssignment.querySelector('.tm-assignment-actions');
        const assignmentChevron = targetAssignment.querySelector('.tm-assignment-chevron');
        if (assignmentActions && assignmentChevron) {
          assignmentActions.classList.add('expanded');
          assignmentChevron.classList.add('expanded');
          console.log(`✅ Assignment ${assignmentRound} expanded`);
          
          // Scroll to the assignment
          setTimeout(() => {
            targetAssignment.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 300);
        }
      } else {
        console.warn(`⚠️ Assignment ${assignmentRound} not found in project ${projectId}`);
      }
    } else {
      // If no specific assignment, just scroll to the task section
      setTimeout(() => {
        taskSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
    
    // Save the expanded state
    saveExpandedStates();
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

    // Add description if it exists
    if (task.description && task.description.trim()) {
      const description = document.createElement('div');
      description.className = 'tm-task-description';
      description.textContent = task.description;
      title.appendChild(description);
    }

    const status = document.createElement('span');
    status.className = `tm-task-status ${task.status}`;
    status.textContent = (task.status === 'draft')? 'Draft' : (task.status === 'active' ? 'Active' : (task.status === 'completed' ? 'Completed' : 'Archived'));

    // Status dropdown
    const statusWrap = document.createElement('div');
    statusWrap.className = 'tm-status-dropdown';
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'tm-status-toggle';
    toggleBtn.type = 'button';
    toggleBtn.textContent = '▸';
    const menu = document.createElement('div');
    menu.className = 'tm-status-menu';

    function addItem(label, value){
      const it = document.createElement('div');
      it.className = 'tm-status-item';
      it.textContent = label;
      it.addEventListener('click', async (e)=>{
        e.stopPropagation();
        await onChangeProjectStatus(task.project_id, value);
        menu.classList.remove('show');
      });
      menu.appendChild(it);
    }
    
    // Add items based on current status
    console.log('Creating status menu for task:', task.title, 'status:', task.status);
    if (task.status === 'active') {
      addItem('Complete', 'completed');
      addItem('Archive', 'archived');
    } else if (task.status === 'completed') {
      addItem('Archive', 'archived');
    } else if (task.status === 'archived') {
      addItem('Complete', 'completed');
    }
    // no Draft option
    toggleBtn.addEventListener('click', (e)=>{ 
      e.stopPropagation(); 
      menu.classList.toggle('show');
      console.log('Menu toggled, show class:', menu.classList.contains('show'));
    });
    document.addEventListener('click', ()=> menu.classList.remove('show'));

    statusWrap.appendChild(toggleBtn);
    statusWrap.appendChild(menu);

    // Add delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'tm-delete-btn';
    deleteBtn.innerHTML = `<svg fill="none" height="16" viewBox="0 0 24 24" width="16" xmlns="http://www.w3.org/2000/svg"><g fill="rgb(0,0,0)"><path clip-rule="evenodd" d="m10.3094 2.24998h3.3814c.2164-.00014.4049-.00026.5829.02817.7033.11231 1.3119.55096 1.6409 1.18265.0832.15989.1427.33877.211.5441l.1117.3349c.0189.05669.0243.07274.0288.08538.1752.48412.6292.81138 1.1438.82442.0136.00034.0301.0004.0902.0004h3c.4142 0 .75.33579.75.75s-.3358.75-.75-.75h-17.0001c-.41421 0-.75-.33579-.75-.75s.33579-.75.75-.75h3.00008c.06005 0 .07662-.00006.09015-.0004.51465-.01304.96868-.34028 1.14379-.8244.00461-.01272.0099-.02843.02889-.0854l.11161-.33487c.06829-.20532.12781-.38424.21107-.54413.32894-.63169.93754-1.07034 1.64084-1.18265.17802-.02843.36657-.02831.58297-.02817zm-1.30125 3.00002c.05151-.10102.09716-.206.13643-.31456.01192-.03296.02362-.06806.03864-.11314l.0998-.29941c.09117-.27351.11217-.3293.13299-.36929.10965-.21056.31252-.35678.54695-.39422.04454-.00711.10404-.00938.39234-.00938h3.2895c.2883 0 .3479.00227.3924.00938.2344.03744.4373.18366.547.39422.0208.03999.0418.09577.1329.36929l.0998.29923.0387.11334c.0393.10856.0849.21352.1364.31454z" fill-rule="evenodd"/><path d="m5.91509 8.45011c-.02755-.4133-.38493-.726-.79823-.69845-.41329.02755-.726.38493-.69845.79823l.46345 6.95171c.0855 1.2828.15456 2.3189.31653 3.132.1684.8453.45482 1.5514 1.04641 2.1048.5916.5535 1.31515.7923 2.1698.9041.82202.1075 1.8604.1075 3.146.1075h.8789c1.2856 0 2.324 0 3.1461-.1075.8546-.1118 1.5782-.3506 2.1698-.9041.5916-.5534.878-1.2595 1.0464-2.1048.162-.8131.231-1.8492.3165-3.132l.4635-6.95171c.0275-.4133-.2852-.77068-.6985-.79823s-.7707.28515-.7982.69845l-.46 6.89909c-.0898 1.3479-.1538 2.2857-.2944 2.9913-.1364.6845-.3267 1.0468-.6001 1.3026-.2734.2557-.6476.4216-1.3396.5121-.7134.0933-1.6534.0948-3.0042.0948h-.7734c-1.3508 0-2.29085-.0015-3.00425-.0948-.692-.0905-1.06616-.2564-1.33957-.5121-.27341-.2558-.46375-.6181-.6001-1.3026-.14056-.7056-.20459-1.6434-.29445-2.9913z"/><path d="m9.42546 10.2537c.41216-.0412.77974.2595.82094.6717l.5 5c.0412.4121-.2595.7797-.6717.8209-.41214.0412-.77967-.2595-.82089-.6717l-.5-5c-.04121-.4121.2595-.7797.67165-.8209z"/><path d="m14.5747 10.2537c.4122.0412.7129.4088.6717.8209l-.5 5c-.0412.4122-.4088.7129-.8209.6717-.4122-.0412-.7129-.4088-.6717-.8209l.5-5c.0412-.4122.4088-.7129.8209-.6717z"/></g></svg>`;
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showDeleteConfirmDialog(task.project_id, task.title);
    });

    titleContainer.appendChild(title);
    titleContainer.appendChild(status);
    titleContainer.appendChild(statusWrap);

    const chevron = document.createElement('div');
    chevron.className = 'tm-task-chevron';
    chevron.innerHTML = '▾';

    // Make the entire header clickable
    header.addEventListener('click', () => toggleTaskSection(section));

    header.appendChild(titleContainer);
    header.appendChild(deleteBtn);
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

    // Make the entire header clickable
    header.addEventListener('click', () => toggleRubricSection(section));

    header.appendChild(title);
    header.appendChild(chevron);

    const actions = document.createElement('div');
    actions.className = 'tm-rubric-actions';

    const uploadBtn = createButton('Upload Rubric', () => {
      openRubricModal(task.project_id);
    });

    const viewBtn = createButton('View Rubric', () => {
      location.href = `/dashboard/coordinator/rubric?project=${task.project_id}`;
    });

    // Check if A1 is published, if published then hide Upload button
    const isA1Published = task.assignments.find(a => a.id === 'assignment1')?.status === 'published';

    console.log(`📊 Rubric button display logic: A1 publish status=${isA1Published}, has rubric files=${task.file_counts?.rubric > 0}`);

    if (isA1Published) {
      // A1 published, only show View button (if has rubric files)
      if (task.file_counts?.rubric > 0) {
        actions.appendChild(viewBtn);
        console.log('🔘 Rubric display: View button');
      } else {
        console.log('🔘 Rubric display: No button (A1 published and no rubric files)');
      }
    } else {
      // A1 not published, display buttons normally
      if (task.file_counts?.rubric > 0) {
        actions.appendChild(uploadBtn);
        actions.appendChild(viewBtn);
        console.log('🔘 Rubric display: Upload, View buttons');
      } else {
        actions.appendChild(uploadBtn);
        console.log('🔘 Rubric display: Upload button');
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
    titleContainer.style.flexWrap = 'wrap';
    titleContainer.style.gap = '8px';

    const title = document.createElement('div');
    title.className = 'tm-assignment-title';
    title.textContent = assignment.title;

    const status = document.createElement('span');
    status.className = `tm-assignment-status ${assignment.status}`;
    console.log(`📝 Assignment status display: assignmentId=${assignment.id}, projectId=${task.project_id}, status=${assignment.status}`);

    // Format status display text correctly
    if (assignment.status === 'published') {
      status.textContent = 'Published';
      console.log(`✅ ${assignment.title} status: Published`);
    } else if (assignment.status === 'unpublished') {
      status.textContent = 'Unpublished';
      console.log(`⏸️ ${assignment.title} status: Unpublished`);
    } else {
      status.textContent = assignment.status;
      console.log(`❓ ${assignment.title} status: ${assignment.status} (Unknown status)`);
    }

    // Add due date display
    const dueDateSpan = document.createElement('span');
    dueDateSpan.className = 'tm-assignment-due-date';
    dueDateSpan.style.cssText = 'font-size:11px;color:var(--muted);font-weight:500;';
    
    // Fetch due date information
    fetchAssignmentDueDate(task.project_id, assignment.id, dueDateSpan);

    titleContainer.appendChild(title);
    titleContainer.appendChild(status);
    titleContainer.appendChild(dueDateSpan);

    const chevron = document.createElement('div');
    chevron.className = 'tm-assignment-chevron';
    chevron.innerHTML = '▾';

    // Make the entire header clickable
    header.addEventListener('click', () => toggleAssignmentSection(section));

    header.appendChild(titleContainer);
    header.appendChild(chevron);

    const actions = document.createElement('div');
    actions.className = 'tm-assignment-actions';

    const uploadBtn = createButton('Upload', () => {
      if (assignment.id === 'assignment1') {
        openAssignment1Modal(task.project_id);
      } else if (assignment.id === 'assignment2') {
        openAssignment2Modal(task.project_id);
      }
    });

    const previewAssignmentBtn = createButton('Preview', () => {
      previewAssignmentFile(task.project_id, assignment.id, assignment.title);
    });

    const publishBtn = createButton('Publish Assignment', () => {
      showPublishConfirmation(task.project_id, assignment.id, assignment.title);
    });

    const markBtn = createButton('Mark Assignment', () => {
      location.href = `/dashboard/coordinator/mark?project=${task.project_id}&assignment=${assignment.id}`;
    });

    const viewMarksBtn = createButton('View Marks', () => {
      location.href = `/dashboard/coordinator/mark?project=${task.project_id}&assignment=${assignment.id}`;
    });

    const feedbackBtn = createButton('Feedback', () => {
      location.href = `/dashboard/coordinator/feedback?project=${task.project_id}&assignment=${assignment.id}`;
    });

    console.log(`Setting buttons for ${assignment.title}: status=${assignment.status}, hasFile=${assignment.hasFile}`);

    // Display different buttons based on assignment status
    if (assignment.status === 'published') {

      // If finalized, show View Marks and Feedback buttons
      if (assignment.finalized) {
        actions.appendChild(viewMarksBtn);
        actions.appendChild(feedbackBtn);
        console.log(`${assignment.title} buttons: View Marks, Feedback (published & finalized)`);
      } else {
        // Not finalized: show Mark Assignment and Feedback buttons
        actions.appendChild(markBtn);
        actions.appendChild(feedbackBtn);
        console.log(`${assignment.title} buttons: Mark Assignment, Feedback (published but not finalized)`);
      }
    } else {
      // Unpublished: Display Upload button
      actions.appendChild(uploadBtn);

      // Display Preview and Publish buttons when assignment file exists
      if (assignment.hasFile) {
        actions.appendChild(previewAssignmentBtn);
        actions.appendChild(publishBtn);
        console.log(`${assignment.title} display buttons: Upload, Preview, Publish`);
      } else {
        actions.appendChild(publishBtn);
        console.log(`${assignment.title} display buttons: Upload, Publish`);
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

  // Update project status
  async function onChangeProjectStatus(projectId, next){
    try{
      const res = await fetch(API.updateProjectStatus(projectId), {
        method: 'PUT',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ status: next })
      });
      if(!res.ok){
        const t = await res.text();
        throw new Error(t || 'Update failed');
      }
      toast('Status updated');
      await fetchProjects();
    }catch(err){
      console.error(err);
      toast('Failed to update status');
    }
  }

  // Show delete confirmation dialog
  function showDeleteConfirmDialog(projectId, projectName) {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'tm-delete-modal';
    
    // Create modal content
    const modal = document.createElement('div');
    modal.className = 'tm-delete-dialog';
    
    modal.innerHTML = `
      <div class="tm-delete-header">
        <h3>Confirm Deletion</h3>
      </div>
      <div class="tm-delete-body">
        <p>Are you sure you want to delete <strong>${projectName}</strong>?</p>
        <p>This action will permanently remove the project and all associated data including:</p>
        <ul>
          <li>Project information</li>
          <li>All rubrics</li>
          <li>All assignments</li>
          <li>All uploaded files</li>
        </ul>
        <p><strong>This action cannot be undone.</strong></p>
      </div>
      <div class="tm-delete-footer">
        <button class="btn tm-cancel-btn">Cancel</button>
        <button class="btn tm-confirm-delete-btn">Delete Project</button>
      </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Add event listeners
    const cancelBtn = modal.querySelector('.tm-cancel-btn');
    const confirmBtn = modal.querySelector('.tm-confirm-delete-btn');
    
    cancelBtn.addEventListener('click', () => {
      document.body.removeChild(overlay);
    });
    
    confirmBtn.addEventListener('click', async () => {
      try {
        console.log('🗑️ Starting delete process for project:', projectId);
        await deleteProject(projectId);
        document.body.removeChild(overlay);
        toast('Project deleted successfully');
        await fetchProjects();
      } catch (error) {
        console.error('🗑️ Delete failed:', error);
        toast(`Failed to delete project: ${error.message}`);
      }
    });
    
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
      }
    });
  }

  // Delete project API call
  async function deleteProject(projectId) {
    console.log('🗑️ Attempting to delete project:', projectId);
    
    const res = await fetch(`/api/uploads/project/${encodeURIComponent(projectId)}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    
    console.log('🗑️ Delete response status:', res.status);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('🗑️ Delete failed:', errorText);
      throw new Error(errorText || 'Delete failed');
    }
    
    const result = await res.json();
    console.log('🗑️ Delete successful:', result);
    return result;
  }

  // ---------- Interactive Functions ----------

  // Fetch assignment due date information
  async function fetchAssignmentDueDate(projectId, assignmentId, dueDateElement) {
    try {
      // Get latest IDs for the project
      const idsResponse = await fetch(`/api/uploads/project/${projectId}/latest-ids`);
      if (!idsResponse.ok) return;

      const idsData = await idsResponse.json();
      let targetAssignmentId = null;

      if (assignmentId === 'assignment1' && idsData.assignment1) {
        targetAssignmentId = idsData.assignment1.assignment_id;
      } else if (assignmentId === 'assignment2' && idsData.assignment2) {
        targetAssignmentId = idsData.assignment2.assignment_id;
      }

      if (!targetAssignmentId) {
        dueDateElement.textContent = 'No due date set';
        return;
      }

      // Get assignment status with due date
      const statusResponse = await fetch(`/api/uploads/assignment/${targetAssignmentId}/status`);
      if (!statusResponse.ok) return;

      const statusData = await statusResponse.json();
      const assignment = statusData.assignment;

      if (assignment.due_at_pretty) {
        dueDateElement.textContent = `Due: ${assignment.due_at_pretty}`;
      } else if (assignment.due_at_local_iso) {
        const dueDate = new Date(assignment.due_at_local_iso);
        dueDateElement.textContent = `Due: ${dueDate.toLocaleDateString()} ${dueDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
      } else if (assignment.due_at) {
        const dueDate = new Date(assignment.due_at);
        dueDateElement.textContent = `Due: ${dueDate.toLocaleDateString()} ${dueDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
      } else {
        dueDateElement.textContent = 'No due date set';
      }
    } catch (error) {
      console.warn('Failed to fetch assignment due date:', error);
      dueDateElement.textContent = 'Due date unavailable';
    }
  }

  // Toggle task section expand/collapse
  function toggleTaskSection(section) {
    const content = section.querySelector('.tm-task-content');
    const chevron = section.querySelector('.tm-task-chevron');

    // Close all other task sections
    $$('.tm-task-section').forEach(otherSection => {
      if (otherSection !== section) {
        const otherContent = otherSection.querySelector('.tm-task-content');
        const otherChevron = otherSection.querySelector('.tm-task-chevron');
        otherContent.classList.remove('expanded');
        otherChevron.classList.remove('expanded');
      }
    });

    // Toggle current section
    content.classList.toggle('expanded');
    chevron.classList.toggle('expanded');

    // Close all assignment and rubric expanded states
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

  // Toggle rubric section expand/collapse
  function toggleRubricSection(section) {
    const actions = section.querySelector('.tm-rubric-actions');
    const chevron = section.querySelector('.tm-rubric-chevron');

    // Toggle current section only - no auto-close of other sections
    actions.classList.toggle('expanded');
    chevron.classList.toggle('expanded');
    
    // 保存展开状态
    saveExpandedStates();
  }

  // Toggle assignment section expand/collapse
  function toggleAssignmentSection(section) {
    const actions = section.querySelector('.tm-assignment-actions');
    const chevron = section.querySelector('.tm-assignment-chevron');

    // Toggle current section only - no auto-close of other sections
    actions.classList.toggle('expanded');
    chevron.classList.toggle('expanded');
    
    // 保存展开状态
    saveExpandedStates();
  }

  // Preview assignment file (read-only mode in mark interface)
  function previewAssignmentFile(projectId, assignmentId, assignmentTitle) {
    // Navigate to mark page in preview mode (read-only)
    location.href = `/dashboard/coordinator/mark?project=${projectId}&assignment=${assignmentId}&preview=true`;
  }

  // Show publish confirmation modal
  async function showPublishConfirmation(projectId, assignmentId, assignmentTitle) {
    try {
      // Get latest IDs
      const idsResponse = await fetch(`/api/uploads/project/${projectId}/latest-ids`);
      if (!idsResponse.ok) {
        throw new Error('Failed to fetch project information');
      }
      const idsData = await idsResponse.json();

      // Get assignment details
      let targetAssignmentId, assignmentData;
      if (assignmentId === 'assignment1') {
        targetAssignmentId = idsData.assignment1?.assignment_id;
      } else if (assignmentId === 'assignment2') {
        targetAssignmentId = idsData.assignment2?.assignment_id;
      }

      if (!targetAssignmentId) {
        toast(`${assignmentTitle} has no file uploaded. Please upload first.`);
        return;
      }

      // Get assignment file info and status
      const assignmentResponse = await fetch(`/api/uploads/assignment/${targetAssignmentId}/files`);
      const assignmentStatusResponse = await fetch(`/api/uploads/assignment/${targetAssignmentId}/status`);
      
      if (assignmentResponse.ok) {
        assignmentData = await assignmentResponse.json();
      }
      
      if (assignmentStatusResponse.ok) {
        const statusData = await assignmentStatusResponse.json();
        // Merge status data with file data
        if (assignmentData && assignmentData.files && assignmentData.files.length > 0) {
          assignmentData.files[0].due_at = statusData.assignment.due_at;
          assignmentData.files[0].due_at_local_iso = statusData.assignment.due_at_local_iso;
          assignmentData.files[0].due_at_pretty = statusData.assignment.due_at_pretty;
          assignmentData.files[0].round = statusData.assignment.round;
        }
      }

      // Get rubric info
      let rubricData = null;
      if (idsData.rubric) {
        const rubricResponse = await fetch(`/api/uploads/rubric/${idsData.rubric.rubric_id}/details`);
        if (rubricResponse.ok) {
          rubricData = await rubricResponse.json();
        }
      }

      // Create modal
      const modal = document.createElement('div');
      modal.className = 'tm-modal show';
      modal.id = 'publishConfirmModal';

      // Build content
      let rubricInfo = '<div style="color:var(--muted);font-style:italic;">No rubric uploaded</div>';
      if (rubricData && rubricData.criteria && rubricData.criteria.length > 0) {
        rubricInfo = `
          <div style="font-size:14px;color:var(--text);">
            <div style="margin-bottom:8px;"><strong>Criteria Count:</strong> ${rubricData.criteria.length}</div>
            <div style="margin-bottom:12px;"><strong>Grade Levels:</strong> ${rubricData.rubric.columns || 0}</div>
            <div style="max-height:150px;overflow-y:auto;background:#f8fafc;padding:12px;border-radius:8px;">
              ${rubricData.criteria.map((c, i) => `
                <div style="margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border);">
                  <strong>${i + 1}. ${c.title}</strong>
                  <span style="color:var(--muted);margin-left:8px;">(Max: ${c.max_score} points)</span>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      let assignmentInfo = '<div style="color:var(--muted);font-style:italic;">No assignment information</div>';
      if (assignmentData && assignmentData.files && assignmentData.files.length > 0) {
        const file = assignmentData.files[0];
        let dueDateText = 'Not set';
        if (file.due_at_pretty) {
          dueDateText = file.due_at_pretty;
        } else if (file.due_at_local_iso) {
          dueDateText = new Date(file.due_at_local_iso).toLocaleString();
        } else if (file.due_at) {
          dueDateText = new Date(file.due_at).toLocaleString();
        }
        
        assignmentInfo = `
          <div style="font-size:14px;color:var(--text);">
            <div style="margin-bottom:8px;"><strong>File:</strong> ${file.file_name || 'Assignment file'}</div>
            <div style="margin-bottom:8px;"><strong>Due Date:</strong> ${dueDateText}</div>
            <div style="margin-bottom:8px;"><strong>Round:</strong> ${file.round || 'undefined'}</div>
          </div>
        `;
      }

      modal.innerHTML = `
        <div class="tm-dialog" style="max-width:700px;">
          <div class="tm-dialog-hd">
            <h3>Confirm Publication</h3>
            <button class="btn tm-close-btn" id="publishConfirmClose">Close</button>
          </div>
          <div class="tm-dialog-bd">
            <div style="margin-bottom:24px;padding:16px;background:#fef3c7;border:2px solid #fde68a;border-radius:12px;">
              <div style="font-size:16px;font-weight:700;color:#92400e;margin-bottom:8px;">Important Notice</div>
              <div style="font-size:14px;color:#92400e;">
                Once published, the rubric cannot be edited. Please ensure all information is correct before proceeding.
              </div>
            </div>

            <div style="margin-bottom:24px;">
              <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid var(--border);">
                ${assignmentTitle}
              </div>
              ${assignmentInfo}
            </div>

            <div style="margin-bottom:24px;">
              <div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid var(--border);">
                Rubric Information
              </div>
              ${rubricInfo}
            </div>

            <div style="display:flex;gap:12px;padding:16px;background:#f8fafc;border-radius:12px;border:1px solid var(--border);">
              <div style="flex-shrink:0;width:24px;height:24px;border-radius:50%;background:#3b82f6;color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">i</div>
              <div style="font-size:13px;color:var(--text);line-height:1.6;">
                You can preview the assignment and rubric before publishing. Click the "Preview Assignment" button below to open a preview in a new tab.
              </div>
            </div>
          </div>
          <div class="tm-dialog-ft">
            <button class="btn" id="publishConfirmCancel">Cancel</button>
            <button class="btn" style="background:#3b82f6;color:white;border:1px solid #3b82f6;" id="publishConfirmPreview">Preview Assignment</button>
            <button class="btn primary" id="publishConfirmSubmit">Confirm & Publish</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      // Bind events
      const closeBtn = modal.querySelector('#publishConfirmClose');
      const cancelBtn = modal.querySelector('#publishConfirmCancel');
      const previewBtn = modal.querySelector('#publishConfirmPreview');
      const submitBtn = modal.querySelector('#publishConfirmSubmit');

      const closeModal = () => {
        modal.remove();
      };

      closeBtn.addEventListener('click', closeModal);
      cancelBtn.addEventListener('click', closeModal);

      previewBtn.addEventListener('click', () => {
        window.open(`/dashboard/coordinator/mark?project=${projectId}&assignment=${assignmentId}&preview=true`, '_blank');
      });

      submitBtn.addEventListener('click', async () => {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Publishing...';
        try {
          await publishAssignment(projectId, assignmentId);
          closeModal();
        } catch (error) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Confirm & Publish';
        }
      });

      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });

      const escapeHandler = (e) => {
        if (e.key === 'Escape') {
          closeModal();
          document.removeEventListener('keydown', escapeHandler);
        }
      };
      document.addEventListener('keydown', escapeHandler);

    } catch (error) {
      console.error('Failed to show publish confirmation:', error);
      toast('Failed to load assignment information. Please try again.');
    }
  }

  // Publish assignment
  async function publishAssignment(taskId, assignmentId) {
    try {
      // Get latest assignment_id
      const latestIdsResponse = await fetch(`/api/uploads/project/${taskId}/latest-ids`);

      if (!latestIdsResponse.ok) {
        throw new Error('Failed to fetch latest assignment IDs');
      }

      const latestIds = await latestIdsResponse.json();

      // Frontend validation: Check if assignment exists
      let targetAssignmentId;
      let assignmentName;

      if (assignmentId === 'assignment1') {
        targetAssignmentId = latestIds.assignment1?.assignment_id;
        assignmentName = 'Assignment 1';
      } else if (assignmentId === 'assignment2') {
        targetAssignmentId = latestIds.assignment2?.assignment_id;
        assignmentName = 'Assignment 2';
      }

      // Explicit frontend validation
      if (!targetAssignmentId) {
        toast(`${assignmentName} is empty. Please create it first.`);
        return null; // Return directly, do not continue subsequent operations
      }

      // Call publish interface
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
      // Reload data
      await fetchProjects();

      return result;
    } catch (error) {
      console.error('Failed to publish assignment:', error);

      // Handle different error types separately (display in English for frontend)
      if (error.message.includes('Assignment not found')) {
        toast('Assignment not found. Please refresh the page and try again.');
      } else if (error.message.includes('Please publish Assignment 1 first') || error.message.includes('Assignment 1 version not found')) {
        toast('Please publish Assignment 1 first before publishing Assignment 2.');
      } else if (error.message.includes('Cannot publish assignment')) {
        toast('Cannot publish assignment. Please make sure the project has at least one rubric and one assignment.');
      } else {
        toast('Failed to publish assignment. Please try again.');
      }

      throw error;
    }
  }

  // ---------- Project Creation Modal ----------
  let projectModal, projectInput, descriptionInput, projectMsg, lastFocusEl;

  function ensureProjectModal() {
      if (projectModal) return;

      projectModal = document.createElement('div');
      projectModal.id = 'project-modal';
      projectModal.className = 'tm-modal';
      projectModal.setAttribute('aria-hidden', 'true');

      projectModal.innerHTML = `
          <div class="tm-dialog tm-project-dialog" role="dialog" aria-modal="true" aria-labelledby="pm-title">
              <div class="tm-dialog-hd">
                  <h3 id="pm-title">Add New Task</h3>
                  <button id="pm-close" class="btn tm-close-btn" type="button">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                  </button>
              </div>
              
              <form id="pm-form" class="tm-dialog-bd">
                  <div class="tm-form-group">
                      <label class="tm-label" for="project-name">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="vertical-align:text-bottom;margin-right:6px">
                              <path d="M9 2L3 8V20C3 20.5304 3.21071 21.0391 3.58579 21.4142C3.96086 21.7893 4.46957 22 5 22H19C19.5304 22 20.0391 21.7893 20.4142 21.4142C20.7893 21.0391 21 20.5304 21 20V8L15 2H9Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                              <path d="M9 2V8H15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                          Task Name
                      </label>
                      <input id="project-name" class="tm-input tm-input-enhanced" type="text" 
                             placeholder="e.g., HPS302 Assignment - Semester 1, 2025" 
                             autocomplete="off" required />
                  </div>

                  <div class="tm-form-group">
                      <label class="tm-label" for="project-description">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="vertical-align:text-bottom;margin-right:6px">
                              <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                              <path d="M14 2V8H20M16 13H8M16 17H8M10 9H8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                          Task Description
                          <span style="color:var(--muted);font-weight:500;font-size:11px;margin-left:6px">(Optional)</span>
                      </label>
                      <textarea id="project-description" class="tm-input tm-textarea-enhanced" 
                                placeholder="Add a brief description of this task..." 
                                autocomplete="off" rows="4"></textarea>
                  </div>

                  <div id="pm-msg" class="tm-form-msg"></div>
              </form>
              
              <div class="tm-dialog-ft">
                  <button type="button" class="btn tm-btn-cancel" id="pm-cancel">Cancel</button>
                  <button type="submit" class="btn primary tm-btn-submit" id="pm-create">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="margin-right:6px">
                          <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                      Create Task
                  </button>
              </div>
          </div>
      `;
      document.body.appendChild(projectModal);

      projectInput = $('#project-name', projectModal);
      descriptionInput = $('#project-description', projectModal);
      projectMsg = $('#pm-msg', projectModal);

      // Event binding
      $('#pm-close', projectModal)?.addEventListener('click', closeProjectModal);
      $('#pm-cancel', projectModal)?.addEventListener('click', closeProjectModal);
      projectModal.addEventListener('click', (e) => {
          if (e.target === projectModal) closeProjectModal();
      });
      document.addEventListener('keydown', (e) => {
          if (projectModal.classList.contains('show') && e.key === 'Escape') {
              closeProjectModal();
          }
      });

      $('#pm-form', projectModal).addEventListener('submit', (e) => {
          console.log('Create Task form submitted');
          onCreateProjectSubmit(e);
      });
      
      // Also bind click event to the Create Task button as backup
      $('#pm-create', projectModal).addEventListener('click', (e) => {
          console.log('Create Task button clicked directly');
          e.preventDefault();
          onCreateProjectSubmit(e);
      });
  }

  function openProjectModal() {
      ensureProjectModal();
      lastFocusEl = document.activeElement;
      projectInput.value = '';
      descriptionInput.value = '';
      setProjectMsg('');
      projectModal.classList.add('show');
      projectModal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      setTimeout(() => projectInput.focus(), 100);
  }

  function closeProjectModal() {
      if (!projectModal) return;
      projectModal.classList.remove('show');
      projectModal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      if (lastFocusEl && typeof lastFocusEl.focus === 'function') {
          lastFocusEl.focus();
      }
  }

  async function onCreateProjectSubmit(e) {
      console.log('onCreateProjectSubmit called');
      e.preventDefault();
      const name = (projectInput.value || '').trim();
      const description = (descriptionInput.value || '').trim();

      console.log('Project name:', name, 'Description:', description);

      if (!name) {
          console.log('No project name provided');
          setProjectMsg('Please enter a project name');
          return;
      }

      try {
          console.log('Creating project...');
          setProjectMsg('Creating…', true);
          const res = await fetch(API.createProject, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  name: name,
                  description: description
              }),
          });
          console.log('Response status:', res.status);
          const data = await res.json();
          console.log('Response data:', data);
          
          if (!res.ok) throw new Error(data.error || 'Create failed');

          setProjectMsg('Created', true);
          toast(`Project "${data.project.name}" created`);
          setTimeout(() => {
              closeProjectModal();
              fetchProjects(); // Refresh project list
          }, 250);
      } catch (err) {
          console.error('Error creating project:', err);
          setProjectMsg(err.message || 'Create failed');
      }
  }

  function setProjectMsg(text, ok) {
      if (!projectMsg) return;
      projectMsg.textContent = text || '';
      projectMsg.className = 'tm-form-msg' + (text ? (ok ? ' tm-msg-success' : ' tm-msg-error') : '');
      projectMsg.style.display = text ? 'block' : 'none';
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
  document.addEventListener('DOMContentLoaded', function() {
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

    // 加载项目数据
    fetchProjects();
  });

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

  // 将 Add New Assignment 按钮改为打开项目创建弹窗
  const btnAdd = $('#btnAdd');
  if (btnAdd) {
      console.log('Add New Task button found, binding event listener');
      btnAdd.addEventListener('click', (e) => {
          console.log('Add New Task button clicked');
          e.preventDefault();
          openProjectModal();
      });
  } else {
      console.error('Add New Task button not found!');
  }

  // ---------- File Preview Functions ----------
  
  // Format file size
  function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  // Get file icon based on file type
  function getFileIcon(type) {
    if (type.startsWith('image/')) return '[IMG]';
    if (type === 'application/pdf') return '[PDF]';
    if (type.startsWith('video/')) return '[VIDEO]';
    if (type.startsWith('audio/')) return '[AUDIO]';
    if (type.includes('word') || type.includes('document')) return '[DOC]';
    if (type.includes('sheet') || type.includes('excel') || type.includes('csv')) return '[XLS]';
    if (type.includes('presentation') || type.includes('powerpoint')) return '[PPT]';
    if (type.includes('zip') || type.includes('rar') || type.includes('archive')) return '[ZIP]';
    return '[FILE]';
  }

  // Preview file in modal
  function previewFile(file, modalType) {
    if (!file) return;

    const type = file.type;
    const name = file.name;
    const size = formatFileSize(file.size);
    const url = URL.createObjectURL(file);

    console.log('Previewing file:', { name, type, size });

    // Create preview modal
    const modal = document.createElement('div');
    modal.className = 'tm-modal show';
    modal.id = 'filePreviewModal';
    
    // Generate preview content based on file type
    let previewHTML = '';
    
    if (type.startsWith('image/')) {
      previewHTML = `<img src="${url}" alt="Preview" style="max-width:100%;max-height:400px;border-radius:8px;">`;
    } else if (type === 'application/pdf') {
      previewHTML = `<iframe src="${url}" title="PDF Preview" style="width:100%;height:500px;border:none;border-radius:8px;"></iframe>`;
    } else if (type.startsWith('video/')) {
      previewHTML = `<video controls src="${url}" style="max-width:100%;max-height:400px;border-radius:8px;"></video>`;
    } else if (type.startsWith('audio/')) {
      previewHTML = `
        <div class="tm-preview-file-info">
          <div class="tm-preview-file-icon">[AUDIO]</div>
          <audio controls src="${url}" style="width:100%;max-width:400px;margin:16px 0;"></audio>
          <div class="tm-preview-file-name">${name}</div>
          <div class="tm-preview-file-size">${size}</div>
        </div>
      `;
    } else if (name.endsWith('.csv')) {
      // CSV preview - read and display as table
      const reader = new FileReader();
      reader.onload = function(e) {
        const content = e.target.result;
        const lines = content.split('\n').slice(0, 100);
        const rows = lines.map(line => line.split(',').map(cell => cell.trim()));
        
        let tableHTML = '<div style="width:100%;max-height:500px;overflow:auto;"><div style="margin-bottom:12px;padding:10px;background:#f8fafc;border-radius:8px;"><strong style="color:var(--text)">CSV Preview</strong><span style="color:var(--muted);margin-left:12px;font-size:12px">' + name + ' (' + size + ')</span></div><table style="width:100%;border-collapse:collapse;font-size:12px;">';
        rows.forEach((row, idx) => {
          const tag = idx === 0 ? 'th' : 'td';
          tableHTML += '<tr>';
          row.forEach(cell => {
            tableHTML += '<' + tag + ' style="border:1px solid #E6EAF2;padding:8px;text-align:left;background:' + (idx === 0 ? '#f8fafc' : '#fff') + '">' + (cell || '') + '</' + tag + '>';
          });
          tableHTML += '</tr>';
        });
        tableHTML += '</table>';
        if (lines.length >= 100) tableHTML += '<p style="margin-top:12px;color:var(--muted);font-size:13px;text-align:center">Showing first 100 rows</p>';
        tableHTML += '</div>';
        
        const previewContent = modal.querySelector('.tm-preview-content');
        if (previewContent) previewContent.innerHTML = tableHTML;
      };
      reader.readAsText(file);
      previewHTML = '<div style="padding:40px;text-align:center;color:var(--muted)">Loading CSV...</div>';
    } else if (type.includes('sheet') || type.includes('excel') || name.endsWith('.xlsx') || name.endsWith('.xls')) {
      // Excel preview using SheetJS library
      const reader = new FileReader();
      reader.onload = function(e) {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const htmlTable = XLSX.utils.sheet_to_html(worksheet);
          
          let tableHTML = `
            <div style="width:100%;max-height:500px;overflow:auto;">
              <div style="margin-bottom:12px;padding:10px;background:#f8fafc;border-radius:8px;display:flex;justify-content:space-between;align-items:center;">
                <div><strong style="color:var(--text);">Sheet: ${firstSheetName}</strong><span style="color:var(--muted);margin-left:12px;font-size:13px;">${workbook.SheetNames.length} sheet(s)</span></div>
                <span style="color:var(--muted);font-size:12px;">${name} (${size})</span>
              </div>
              <div style="border:1px solid var(--border);border-radius:8px;overflow:auto;">${htmlTable}</div>
            </div>
          `;
          
          const previewContent = modal.querySelector('.tm-preview-content');
          if (previewContent) {
            previewContent.innerHTML = tableHTML;
            const table = previewContent.querySelector('table');
            if (table) {
              table.style.cssText = 'width:100%;border-collapse:collapse;fontSize:12px;background:#fff';
              table.querySelectorAll('td, th').forEach(cell => {
                cell.style.cssText = 'border:1px solid #E6EAF2;padding:8px;text-align:left';
              });
              table.querySelectorAll('th').forEach(th => {
                th.style.cssText += ';background:#f8fafc;font-weight:600';
              });
            }
          }
        } catch (error) {
          const previewContent = modal.querySelector('.tm-preview-content');
          if (previewContent) {
            previewContent.innerHTML = `<div class="tm-preview-file-info"><div class="tm-preview-file-icon" style="font-size:48px">[EXCEL]</div><div class="tm-preview-file-name">${name}</div><div class="tm-preview-file-size">${size}</div><p style="margin-top:20px;color:var(--bad)">Failed to preview Excel file</p></div>`;
          }
        }
      };
      reader.readAsArrayBuffer(file);
      previewHTML = '<div style="padding:40px;text-align:center;color:var(--muted)">Loading Excel preview...</div>';
    } else if (type.includes('word') || type.includes('document') || name.endsWith('.docx') || name.endsWith('.doc')) {
      // Word preview using Mammoth library
      const reader = new FileReader();
      reader.onload = function(e) {
        if (typeof mammoth !== 'undefined') {
          mammoth.convertToHtml({ arrayBuffer: e.target.result })
            .then(function(result) {
              let html = `
                <div style="width:100%;max-height:500px;overflow:auto;">
                  <div style="margin-bottom:12px;padding:10px;background:#f8fafc;border-radius:8px;display:flex;justify-content:space-between;align-items:center;">
                    <strong style="color:var(--text)">Word Document Preview</strong>
                    <span style="color:var(--muted);font-size:12px">${name} (${size})</span>
                  </div>
                  <div style="background:#fff;padding:24px;border:1px solid var(--border);border-radius:8px;line-height:1.6">${result.value}</div>
                </div>
              `;
              const previewContent = modal.querySelector('.tm-preview-content');
              if (previewContent) previewContent.innerHTML = html;
            })
            .catch(function(error) {
              const previewContent = modal.querySelector('.tm-preview-content');
              if (previewContent) {
                previewContent.innerHTML = `<div class="tm-preview-file-info"><div class="tm-preview-file-icon" style="font-size:48px">[WORD]</div><div class="tm-preview-file-name">${name}</div><div class="tm-preview-file-size">${size}</div><p style="margin-top:20px;color:var(--bad)">Failed to preview Word document</p><p style="color:var(--muted);font-size:13px;margin-top:8px">Only .docx format is supported</p></div>`;
              }
            });
        } else {
          const previewContent = modal.querySelector('.tm-preview-content');
          if (previewContent) {
            previewContent.innerHTML = `<div class="tm-preview-file-info"><div class="tm-preview-file-icon" style="font-size:48px">[WORD]</div><div class="tm-preview-file-name">${name}</div><div class="tm-preview-file-size">${size}</div><p style="margin-top:20px;color:var(--bad)">Preview library not loaded</p></div>`;
          }
        }
      };
      reader.readAsArrayBuffer(file);
      previewHTML = '<div style="padding:40px;text-align:center;color:var(--muted)">Loading Word preview...</div>';
    } else if (type.includes('text/') || type.includes('json') || name.endsWith('.txt') || name.endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = function(e) {
        const content = e.target.result;
        const truncated = content.length > 5000 ? content.substring(0, 5000) + '\n\n... (truncated)' : content;
        const previewContent = modal.querySelector('.tm-preview-content');
        if (previewContent) {
          previewContent.innerHTML = `
            <div style="width:100%;max-height:400px;overflow:auto;">
              <pre style="background:#f8fafc;padding:16px;border-radius:8px;font-size:12px;line-height:1.5;margin:0;white-space:pre-wrap;word-wrap:break-word;">${truncated}</pre>
            </div>
          `;
        }
      };
      reader.readAsText(file);
      previewHTML = '<div style="padding:40px;text-align:center;color:var(--muted);">Loading...</div>';
    } else {
      previewHTML = `
        <div class="tm-preview-file-info">
          <div class="tm-preview-file-icon" style="font-size:48px;margin-bottom:16px;">${getFileIcon(type)}</div>
          <div class="tm-preview-file-name">${name}</div>
          <div class="tm-preview-file-size">${size}</div>
          <div class="tm-preview-file-type">${type || 'Unknown type'}</div>
          <p style="margin-top:20px;color:var(--muted);font-size:14px;">File ready for upload</p>
        </div>
      `;
    }
    
    modal.innerHTML = `
      <div class="tm-dialog" style="max-width:900px;">
        <div class="tm-dialog-hd">
          <h3>File Preview</h3>
          <button class="btn tm-close-btn" id="previewCloseBtn">Close</button>
        </div>
        <div class="tm-dialog-bd">
          <div class="tm-preview-content" style="min-height:200px;display:flex;justify-content:center;align-items:center;">
            ${previewHTML}
          </div>
        </div>
        <div class="tm-dialog-ft">
          <button class="btn" id="previewCancelBtn">Cancel</button>
          <button class="btn primary" id="confirmUploadBtn">Upload File</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Bind close button events
    const closeBtn = modal.querySelector('#previewCloseBtn');
    const cancelBtn = modal.querySelector('#previewCancelBtn');
    
    const removeModal = () => {
      modal.remove();
      URL.revokeObjectURL(url);
    };
    
    if (closeBtn) {
      closeBtn.addEventListener('click', removeModal);
    }
    
    if (cancelBtn) {
      cancelBtn.addEventListener('click', removeModal);
    }
    
    // Close on overlay click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        removeModal();
      }
    });
    
    // Close on Escape key
    const escapeHandler = (e) => {
      if (e.key === 'Escape') {
        removeModal();
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);
    
    // Return the modal so we can bind upload button later
    return modal;
  }

  // ---------- Date Processing Functions ----------

  // Format date to YYYY-MM-DD format
  function formatDateForInput(date) {
    if (!date) return '';
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Format date to dd/mm/yyyy format for display
  function formatDateForDisplay(dateString) {
    if (!dateString) return '';
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
  }

  // Validate if date is valid
  function isValidDate(dateString) {
    if (!dateString) return false;
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date);
  }

  // ---------- Modal Functions ----------

  // Rubric Modal
  function openRubricModal(projectId) {
    const modal = $('#rubricModal');
    if (!modal) return;

    // Reset form
    $('#rubricFile').value = '';
    $('#rubricText').textContent = 'Upload rubric...';
    $('#rubricErrLine').style.display = 'none';
    
    // Hide preview button
    const previewBtn = $('#rubricPreview');
    if (previewBtn) previewBtn.style.display = 'none';

    // Show modal
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';

    // Bind events
    bindRubricModalEvents(projectId);
  }

  function bindRubricModalEvents(projectId) {
    const modal = $('#rubricModal');
    const closeBtn = $('#rubricClose');
    const previewBtn = $('#rubricPreview');
    const fileInput = $('#rubricFile');
    const dropArea = $('#rubricDrop');
    const textDisplay = $('#rubricText');
    const errLine = $('#rubricErrLine');
    
    let selectedFile = null;

    // Close modal
    const closeModal = () => {
      modal.classList.remove('show');
      document.body.style.overflow = '';
      selectedFile = null;
    };

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // File upload handling
    const handleFileSelect = (file) => {
      if (file) {
        selectedFile = file;
        textDisplay.textContent = file.name;
        errLine.style.display = 'none';
        // Show preview button
        previewBtn.style.display = 'inline-flex';
      }
    };

    fileInput.addEventListener('change', (e) => {
      handleFileSelect(e.target.files[0]);
    });

    // Drag and drop upload
    dropArea.addEventListener('click', () => fileInput.click());
    dropArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropArea.classList.add('drag');
    });
    dropArea.addEventListener('dragleave', () => {
      dropArea.classList.remove('drag');
    });
    dropArea.addEventListener('drop', (e) => {
      e.preventDefault();
      dropArea.classList.remove('drag');
      const file = e.dataTransfer.files[0];
      if (file) {
        fileInput.files = e.dataTransfer.files;
        handleFileSelect(file);
      }
    });

    // Preview button click
    previewBtn.addEventListener('click', async () => {
      if (!selectedFile) {
        errLine.style.display = 'block';
        errLine.textContent = 'Please select a file first.';
        return;
      }

      // Open preview modal
      const previewModal = previewFile(selectedFile, 'rubric');
      
      // Bind upload button in preview modal
      const uploadBtn = previewModal.querySelector('#confirmUploadBtn');
      if (uploadBtn) {
        uploadBtn.addEventListener('click', async () => {
          try {
            uploadBtn.disabled = true;
            uploadBtn.textContent = 'Uploading...';
            
            const draft = await uploadDraftFile(selectedFile, 'rubric');
            await commitFile(draft.temp_name, 'rubric', null, null, projectId);

            toast('Rubric uploaded successfully!');
            previewModal.remove();
            closeModal();
            await fetchProjects();
          } catch (error) {
            console.error('Upload error:', error);
            toast('Failed to upload rubric. Please try again.');
            uploadBtn.disabled = false;
            uploadBtn.textContent = 'Upload File';
          }
        });
      }
    });
  }

  // Assignment 1 Modal
  function openAssignment1Modal(projectId) {
    const modal = $('#assignment1Modal');
    if (!modal) return;

    // Reset form
    $('#assignment1Due').value = '';
    $('#assignment1Time').value = '';
    $('#assignment1File').value = '';
    $('#assignment1Text').textContent = 'Upload assignment...';
    $('#assignment1ErrLine').style.display = 'none';
    
    // Hide preview button
    const previewBtn = $('#assignment1Preview');
    if (previewBtn) previewBtn.style.display = 'none';

    // Show modal
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';

    // Bind events
    bindAssignment1ModalEvents(projectId);
  }

  function bindAssignment1ModalEvents(projectId) {
    const modal = $('#assignment1Modal');
    const closeBtn = $('#assignment1Close');
    const previewBtn = $('#assignment1Preview');
    const dueInput = $('#assignment1Due');
    const timeInput = $('#assignment1Time');
    const fileInput = $('#assignment1File');
    const dropArea = $('#assignment1Drop');
    const textDisplay = $('#assignment1Text');
    const errLine = $('#assignment1ErrLine');
    
    let selectedFile = null;

    // Close modal
    const closeModal = () => {
      modal.classList.remove('show');
      document.body.style.overflow = '';
      selectedFile = null;
    };

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // File upload handling
    const handleFileSelect = (file) => {
      if (file) {
        selectedFile = file;
        textDisplay.textContent = file.name;
        errLine.style.display = 'none';
        // Show preview button
        previewBtn.style.display = 'inline-flex';
      }
    };

    fileInput.addEventListener('change', (e) => {
      handleFileSelect(e.target.files[0]);
    });

    // Drag and drop upload
    dropArea.addEventListener('click', () => fileInput.click());
    dropArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropArea.classList.add('drag');
    });
    dropArea.addEventListener('dragleave', () => {
      dropArea.classList.remove('drag');
    });
    dropArea.addEventListener('drop', (e) => {
      e.preventDefault();
      dropArea.classList.remove('drag');
      const file = e.dataTransfer.files[0];
      if (file) {
        fileInput.files = e.dataTransfer.files;
        handleFileSelect(file);
      }
    });

    // Preview button click
    previewBtn.addEventListener('click', async () => {
      const due = dueInput.value.trim();
      const time = timeInput.value.trim();

      // Form validation
      if (!due || !selectedFile) {
        errLine.style.display = 'block';
        errLine.textContent = 'Please complete all required fields.';
        return;
      }

      // Date format validation
      if (!isValidDate(due)) {
        errLine.style.display = 'block';
        errLine.textContent = 'Please select a valid due date.';
        return;
      }

      // Combine date and time
      const dueDateTime = time ? `${due}T${time}:00` : `${due}T23:59:59`;
      const selectedDateTime = new Date(dueDateTime);
      const now = new Date();

      // Validate date is not in the past
      if (selectedDateTime < now) {
        errLine.style.display = 'block';
        errLine.textContent = 'Due date cannot be in the past.';
        return;
      }

      // Open preview modal
      const previewModal = previewFile(selectedFile, 'assignment1');
      
      // Bind upload button in preview modal
      const uploadBtn = previewModal.querySelector('#confirmUploadBtn');
      if (uploadBtn) {
        uploadBtn.addEventListener('click', async () => {
          try {
            uploadBtn.disabled = true;
            uploadBtn.textContent = 'Uploading...';
            
            let combinedDateTime;
            if (time) {
              combinedDateTime = `${due}T${time}:00`;
            } else {
              combinedDateTime = `${due}T23:59:59`;
            }

            const draft = await uploadDraftFile(selectedFile, 'assignment1');
            await commitFile(draft.temp_name, 'assignment', 1, combinedDateTime, projectId);

            toast('Assignment 1 uploaded successfully!');
            previewModal.remove();
            closeModal();
            await fetchProjects();
          } catch (error) {
            console.error('Upload error:', error);
            toast('Failed to upload assignment. Please try again.');
            uploadBtn.disabled = false;
            uploadBtn.textContent = 'Upload File';
          }
        });
      }
    });
  }

  // Assignment 2 Modal
  function openAssignment2Modal(projectId) {
    const modal = $('#assignment2Modal');
    if (!modal) return;

    // Reset form
    $('#assignment2Due').value = '';
    $('#assignment2Time').value = '';
    $('#assignment2File').value = '';
    $('#assignment2Text').textContent = 'Upload assignment...';
    $('#assignment2ErrLine').style.display = 'none';
    
    // Hide preview button
    const previewBtn = $('#assignment2Preview');
    if (previewBtn) previewBtn.style.display = 'none';

    // Show modal
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';

    // Bind events
    bindAssignment2ModalEvents(projectId);
  }

  function bindAssignment2ModalEvents(projectId) {
    const modal = $('#assignment2Modal');
    const closeBtn = $('#assignment2Close');
    const previewBtn = $('#assignment2Preview');
    const dueInput = $('#assignment2Due');
    const timeInput = $('#assignment2Time');
    const fileInput = $('#assignment2File');
    const dropArea = $('#assignment2Drop');
    const textDisplay = $('#assignment2Text');
    const errLine = $('#assignment2ErrLine');
    
    let selectedFile = null;

    // Close modal
    const closeModal = () => {
      modal.classList.remove('show');
      document.body.style.overflow = '';
      selectedFile = null;
    };

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // File upload handling
    const handleFileSelect = (file) => {
      if (file) {
        selectedFile = file;
        textDisplay.textContent = file.name;
        errLine.style.display = 'none';
        // Show preview button
        previewBtn.style.display = 'inline-flex';
      }
    };

    fileInput.addEventListener('change', (e) => {
      handleFileSelect(e.target.files[0]);
    });

    // Drag and drop upload
    dropArea.addEventListener('click', () => fileInput.click());
    dropArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropArea.classList.add('drag');
    });
    dropArea.addEventListener('dragleave', () => {
      dropArea.classList.remove('drag');
    });
    dropArea.addEventListener('drop', (e) => {
      e.preventDefault();
      dropArea.classList.remove('drag');
      const file = e.dataTransfer.files[0];
      if (file) {
        fileInput.files = e.dataTransfer.files;
        handleFileSelect(file);
      }
    });

    // Preview button click
    previewBtn.addEventListener('click', async () => {
      const due = dueInput.value.trim();
      const time = timeInput.value.trim();

      // Form validation
      if (!due || !selectedFile) {
        errLine.style.display = 'block';
        errLine.textContent = 'Please complete all required fields.';
        return;
      }

      // Date format validation
      if (!isValidDate(due)) {
        errLine.style.display = 'block';
        errLine.textContent = 'Please select a valid due date.';
        return;
      }

      // Combine date and time
      const dueDateTime = time ? `${due}T${time}:00` : `${due}T23:59:59`;
      const selectedDateTime = new Date(dueDateTime);
      const now = new Date();

      // Validate date is not in the past
      if (selectedDateTime < now) {
        errLine.style.display = 'block';
        errLine.textContent = 'Due date cannot be in the past.';
        return;
      }

      // Open preview modal
      const previewModal = previewFile(selectedFile, 'assignment2');
      
      // Bind upload button in preview modal
      const uploadBtn = previewModal.querySelector('#confirmUploadBtn');
      if (uploadBtn) {
        uploadBtn.addEventListener('click', async () => {
          try {
            uploadBtn.disabled = true;
            uploadBtn.textContent = 'Uploading...';
            
            let combinedDateTime;
            if (time) {
              combinedDateTime = `${due}T${time}:00`;
            } else {
              combinedDateTime = `${due}T23:59:59`;
            }

            const draft = await uploadDraftFile(selectedFile, 'assignment2');
            await commitFile(draft.temp_name, 'assignment', 2, combinedDateTime, projectId);

            toast('Assignment 2 uploaded successfully!');
            previewModal.remove();
            closeModal();
            await fetchProjects();
          } catch (error) {
            console.error('Upload error:', error);
            toast('Failed to upload assignment. Please try again.');
            uploadBtn.disabled = false;
            uploadBtn.textContent = 'Upload File';
          }
        });
      }
    });
  }

  // Global goToResetPassword function
  window.goToResetPassword = function() {
    window.location.href = '/reset-password';
  };

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

})();