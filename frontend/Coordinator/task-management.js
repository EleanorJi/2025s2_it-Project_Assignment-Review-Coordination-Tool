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

        try {
          // 1. First get the latest assignment IDs for the project
          const latestIdsResponse = await fetch(`/api/uploads/project/${project.project_id}/latest-ids`);
          if (latestIdsResponse.ok) {
            const latestIds = await latestIdsResponse.json();
            console.log('📦 Retrieved latest IDs:', latestIds);

            // 2. Get assignment1 status
            if (latestIds.assignment1) {
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
              finalized: assignment1Finalized
            },
            {
              id: 'assignment2',
              title: 'Assignment 2',
              status: assignment2Status,
              finalized: assignment2Finalized
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
    
    // 渲染完成后恢复展开状态或处理自动展开
    setTimeout(() => {
      // Check if we need to auto-expand a specific assignment
      const expandData = sessionStorage.getItem('expandAssignment');
      if (expandData) {
        try {
          const { projectId, round } = JSON.parse(expandData);
          autoExpandAssignment(projectId, round);
          // Clear the sessionStorage after handling
          sessionStorage.removeItem('expandAssignment');
        } catch (error) {
          console.error('Failed to auto-expand assignment:', error);
          // Fallback to normal restore
          restoreExpandedStates();
        }
      } else {
        // Normal restore of expanded states
        restoreExpandedStates();
      }
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

    titleContainer.appendChild(title);
    titleContainer.appendChild(status);

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


    const publishBtn = createButton('Publish Assignment', () => {
      publishAssignment(task.project_id, assignment.id);
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

    console.log(`🔄 Setting buttons for ${assignment.title}: status=${assignment.status}, file_counts=${task.file_counts?.assignment}`);

    // Display different buttons based on assignment status
    if (assignment.status === 'published') {

      // 如果已提交评分，只显示View Marks按钮和Feedback按钮
      if (assignment.finalized) {
        actions.appendChild(viewMarksBtn);
        actions.appendChild(feedbackBtn);
        console.log(`🔘 ${assignment.title} 显示按钮: View Marks, Feedback (已发布且已提交评分)`);
      } else {
        // 未提交评分：显示Mark Assignment按钮和Feedback按钮
        actions.appendChild(markBtn);
        actions.appendChild(feedbackBtn);
        console.log(`🔘 ${assignment.title} 显示按钮: Mark Assignment, Feedback (已发布但未提交评分)`);
      }
    } else {
      // Unpublished: Display Upload button
      actions.appendChild(uploadBtn);

      // Only display View button and Publish button when assignment files exist
      if (task.file_counts?.assignment > 0) {
        actions.appendChild(publishBtn);
        console.log(`🔘 ${assignment.title} display buttons: Upload, View, Publish`);
      } else {
        actions.appendChild(publishBtn);
        console.log(`🔘 ${assignment.title} display buttons: Upload, Publish`);
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

  // Auto-expand specific assignment when navigating from dashboard
  function autoExpandAssignment(projectId, round) {
    console.log('Auto-expanding assignment:', projectId, 'round:', round);
    
    // Find the task section with matching project_id
    const taskSection = $(`.tm-task-section[data-task-id="${projectId}"]`);
    if (!taskSection) {
      console.warn('Task section not found for project:', projectId);
      return;
    }

    // Expand the task section
    const taskContent = taskSection.querySelector('.tm-task-content');
    const taskChevron = taskSection.querySelector('.tm-task-chevron');
    if (taskContent && taskChevron) {
      taskContent.classList.add('expanded');
      taskChevron.classList.add('expanded');
    }

    // Find the assignment section based on round (1 or 2)
    const assignmentTitle = `Assignment ${round}`;
    const assignmentSections = taskSection.querySelectorAll('.tm-assignment-item');
    let targetAssignmentSection = null;

    for (const section of assignmentSections) {
      const title = section.querySelector('.tm-assignment-title');
      if (title && title.textContent.trim() === assignmentTitle) {
        targetAssignmentSection = section;
        break;
      }
    }

    if (targetAssignmentSection) {
      // Expand the assignment section
      const assignmentActions = targetAssignmentSection.querySelector('.tm-assignment-actions');
      const assignmentChevron = targetAssignmentSection.querySelector('.tm-assignment-chevron');
      if (assignmentActions && assignmentChevron) {
        assignmentActions.classList.add('expanded');
        assignmentChevron.classList.add('expanded');
      }

      // Scroll to the assignment section
      setTimeout(() => {
        targetAssignmentSection.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }, 200);

      console.log('Successfully auto-expanded assignment:', assignmentTitle);
    } else {
      console.warn('Assignment section not found:', assignmentTitle);
    }
    
    // Save the expanded state
    saveExpandedStates();
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

    // Show modal
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';

    // Bind events
    bindRubricModalEvents(projectId);
  }

  function bindRubricModalEvents(projectId) {
    const modal = $('#rubricModal');
    const closeBtn = $('#rubricClose');
    const submitBtn = $('#rubricSubmit');
    const fileInput = $('#rubricFile');
    const dropArea = $('#rubricDrop');
    const textDisplay = $('#rubricText');
    const errLine = $('#rubricErrLine');

    // Close modal
    const closeModal = () => {
      modal.classList.remove('show');
      document.body.style.overflow = '';
    };

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // File upload handling
    const handleFileSelect = (file) => {
      if (file) {
        textDisplay.textContent = file.name;
        errLine.style.display = 'none';
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

    // Submit
    submitBtn.addEventListener('click', async () => {
      const file = fileInput.files[0];
      if (!file) {
        errLine.style.display = 'block';
        return;
      }

      try {

        const draft = await uploadDraftFile(file, 'rubric');
        await commitFile(draft.temp_name, 'rubric', null, null, projectId);

        toast('Rubric uploaded successfully!');
        closeModal();
        await fetchProjects(); // Refresh data
      } catch (error) {
        console.error('Upload error:', error);
        toast('Failed to upload rubric. Please try again.');
      }
    });
  }

  // Assignment 1 Modal
  function openAssignment1Modal(projectId) {
    const modal = $('#assignment1Modal');
    if (!modal) return;

    // Reset form
    $('#assignment1Due').value = '';
    $('#assignment1File').value = '';
    $('#assignment1Text').textContent = 'Upload assignment...';
    $('#assignment1ErrLine').style.display = 'none';

    // Show modal
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';

    // Bind events
    bindAssignment1ModalEvents(projectId);
  }

  function bindAssignment1ModalEvents(projectId) {
    const modal = $('#assignment1Modal');
    const closeBtn = $('#assignment1Close');
    const submitBtn = $('#assignment1Submit');
    const dueInput = $('#assignment1Due');
    const timeInput = $('#assignment1Time');
    const fileInput = $('#assignment1File');
    const dropArea = $('#assignment1Drop');
    const textDisplay = $('#assignment1Text');
    const errLine = $('#assignment1ErrLine');

    // Close modal
    const closeModal = () => {
      modal.classList.remove('show');
      document.body.style.overflow = '';
    };

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // File upload handling
    const handleFileSelect = (file) => {
      if (file) {
        textDisplay.textContent = file.name;
        errLine.style.display = 'none';
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

    // Submit
    submitBtn.addEventListener('click', async () => {
      const due = dueInput.value.trim();
      const time = timeInput.value.trim();
      const file = fileInput.files[0];

      // Form validation
      if (!due || !file) {
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

      // 组合日期和时间
      const dueDateTime = time ? `${due}T${time}:00` : `${due}T23:59:59`; // 如果没有选择时间，默认为当天23:59:59
      const selectedDateTime = new Date(dueDateTime);
      const now = new Date();

      // 验证日期时间不能是过去的
      if (selectedDateTime < now) {
        errLine.style.display = 'block';
        errLine.textContent = 'Due date cannot be in the past.';
        return;
      }

      try {
        // 组合日期和时间
        let combinedDateTime;
        if (time) {
          // 如果有选择时间，组合日期和时间
          combinedDateTime = `${due}T${time}:00`;
        } else {
          // 如果没有选择时间，设置为当天的23:59:59
          combinedDateTime = `${due}T23:59:59`;
        }

        const draft = await uploadDraftFile(file, 'assignment1');
        await commitFile(draft.temp_name, 'assignment', 1, combinedDateTime, projectId);

        toast('Assignment 1 uploaded successfully!');
        closeModal();
        await fetchProjects(); // Refresh data
      } catch (error) {
        console.error('Upload error:', error);
        toast('Failed to upload assignment. Please try again.');
      }
    });
  }

  // Assignment 2 Modal
  function openAssignment2Modal(projectId) {
    const modal = $('#assignment2Modal');
    if (!modal) return;

    // Reset form
    $('#assignment2Due').value = '';
    $('#assignment2File').value = '';
    $('#assignment2Text').textContent = 'Upload assignment...';
    $('#assignment2ErrLine').style.display = 'none';

    // Show modal
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';

    // Bind events
    bindAssignment2ModalEvents(projectId);
  }

  function bindAssignment2ModalEvents(projectId) {
    const modal = $('#assignment2Modal');
    const closeBtn = $('#assignment2Close');
    const submitBtn = $('#assignment2Submit');
    const dueInput = $('#assignment2Due');
    const timeInput = $('#assignment2Time');
    const fileInput = $('#assignment2File');
    const dropArea = $('#assignment2Drop');
    const textDisplay = $('#assignment2Text');
    const errLine = $('#assignment2ErrLine');

    // Close modal
    const closeModal = () => {
      modal.classList.remove('show');
      document.body.style.overflow = '';
    };

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // File upload handling
    const handleFileSelect = (file) => {
      if (file) {
        textDisplay.textContent = file.name;
        errLine.style.display = 'none';
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

    // Submit
    submitBtn.addEventListener('click', async () => {
      const due = dueInput.value.trim();
      const time = timeInput.value.trim();
      const file = fileInput.files[0];

      // Form validation
      if (!due || !file) {
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

      // 组合日期和时间
      const dueDateTime = time ? `${due}T${time}:00` : `${due}T23:59:59`; // 如果没有选择时间，默认为当天23:59:59
      const selectedDateTime = new Date(dueDateTime);
      const now = new Date();

      // 验证日期时间不能是过去的
      if (selectedDateTime < now) {
        errLine.style.display = 'block';
        errLine.textContent = 'Due date cannot be in the past.';
        return;
      }

      try {
        // 组合日期和时间
        let combinedDateTime;
        if (time) {
          // 如果有选择时间，组合日期和时间
          combinedDateTime = `${due}T${time}:00`;
        } else {
          // 如果没有选择时间，设置为当天的23:59:59
          combinedDateTime = `${due}T23:59:59`;
        }

        const draft = await uploadDraftFile(file, 'assignment2');
        await commitFile(draft.temp_name, 'assignment', 2, combinedDateTime, projectId);

        toast('Assignment 2 uploaded successfully!');
        closeModal();
        await fetchProjects(); // Refresh data
      } catch (error) {
        console.error('Upload error:', error);
        toast('Failed to upload assignment. Please try again.');
      }
    });
  }

})();