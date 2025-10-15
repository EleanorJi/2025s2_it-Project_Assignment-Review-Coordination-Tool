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
      // Unpublished: Always show Upload button
      actions.appendChild(uploadBtn);

      // If assignment files exist, show Publish and Mark Assignment buttons
      if (task.file_counts?.assignment > 0) {
        actions.appendChild(publishBtn);
        actions.appendChild(markBtn);
        console.log(`🔘 ${assignment.title} display buttons: Upload, Publish, Mark Assignment`);
      } else {
        // No files uploaded yet, only show Upload and Publish
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
    overlay.className = 'tm-modal';
    overlay.style.display = 'flex';
    
    // Create modal content
    const modal = document.createElement('div');
    modal.className = 'tm-dialog';
    
    modal.innerHTML = `
      <div class="tm-dialog-hd">
        <h3>Confirm Deletion</h3>
      </div>
      <div class="tm-dialog-bd">
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
      <div class="tm-dialog-ft">
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

  // ---------- Rubric Status Dialog Functions ----------
  
  // Delete rubric function
  async function deleteRubric(rubricId) {
    try {
      const response = await fetch(`/api/uploads/rubric/${rubricId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (response.ok) {
        console.log('Rubric deleted successfully:', rubricId);
      } else {
        console.error('Failed to delete rubric:', rubricId);
      }
    } catch (error) {
      console.error('Error deleting rubric:', error);
    }
  }

  // Show preview dialog before confirming
  function showRubricPreviewDialog(projectId, rubricId, details) {
    const overlay = document.createElement('div');
    overlay.className = 'tm-modal';
    overlay.style.display = 'flex';
    
    const modal = document.createElement('div');
    modal.className = 'tm-dialog';
    modal.style.maxWidth = '700px';
    
    const criteriaCount = details.criteria?.length || 0;
    const gradeLevelsCount = details.summary?.grade_levels_count || 0;
    
    // Generate full preview content
    let previewHtml = '';
    if (details.criteria && details.criteria.length > 0) {
      previewHtml = details.criteria.map((criterion, idx) => {
        const gradeLevels = criterion.grade_levels || [];
        const levelNames = gradeLevels.map(l => l.level_name).join(', ');
        return `
          <div style="padding: 12px; border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 8px; background: #fafafa;">
            <div style="font-weight: 600; color: #1f2937; margin-bottom: 4px;">
              ${criterion.seq_no || idx + 1}. ${criterion.title}
            </div>
            <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">
              Max Score: ${criterion.max_score}
            </div>
            <div style="font-size: 12px; color: #6b7280;">
              Grade Levels: ${levelNames || 'N/A'}
            </div>
          </div>
        `;
      }).join('');
    }
    
    modal.innerHTML = `
      <div class="tm-dialog-hd" style="background: #f0f9ff; border-bottom: 1px solid #bfdbfe;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <h3 style="color: #1e40af; margin: 0; flex: 1;">Rubric Preview - Please Confirm</h3>
          <span style="background: #3b82f6; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600;">PREVIEW</span>
        </div>
      </div>
      <div class="tm-dialog-bd">
        <p><strong>Please review your rubric before confirming:</strong></p>
        
        <div style="background: #f0f9ff; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div>
              <div style="font-size: 24px; font-weight: 700; color: #0369a1;">${criteriaCount}</div>
              <div style="font-size: 13px; color: #0c4a6e;">Criteria</div>
            </div>
            <div>
              <div style="font-size: 24px; font-weight: 700; color: #0369a1;">${gradeLevelsCount}</div>
              <div style="font-size: 13px; color: #0c4a6e;">Grade Levels</div>
            </div>
          </div>
        </div>
        
        <div style="margin-top: 16px;">
          <div style="font-weight: 600; margin-bottom: 8px; color: #1f2937;">All Criteria:</div>
          <div style="max-height: 400px; overflow-y: auto; padding: 4px; border: 1px solid #e5e7eb; border-radius: 8px; background: #f9fafb;">
            ${previewHtml}
          </div>
        </div>
        
        <p style="margin-top: 16px; padding: 12px; background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px; color: #92400e;">
          <strong>Note:</strong> If the preview looks correct, click "Confirm & Save". Otherwise, click "Cancel & Re-upload" to choose a different file.
        </p>
      </div>
      <div class="tm-dialog-ft">
        <button class="btn tm-cancel-btn">Cancel & Re-upload</button>
        <button class="btn primary">Confirm & Save</button>
      </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    const cancelBtn = modal.querySelector('.tm-cancel-btn');
    const confirmBtn = modal.querySelector('.btn.primary');
    
    // Cancel - delete rubric and allow re-upload
    cancelBtn.addEventListener('click', async () => {
      document.body.removeChild(overlay);
      await deleteRubric(rubricId);
      await fetchProjects();
      toast('Rubric cancelled. You can upload a new file.');
      openRubricModal(projectId);
    });
    
    // Confirm - keep rubric and show success
    confirmBtn.addEventListener('click', async () => {
      document.body.removeChild(overlay);
      await fetchProjects();
      toast('Rubric confirmed successfully!');
      showRubricSuccessDialog(projectId, details);
    });
    
    // Prevent closing on overlay click to force user decision
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        // Do nothing - user must choose
      }
    });
  }

  // Show error dialog for empty rubric
  function showRubricErrorDialog(projectId) {
    const overlay = document.createElement('div');
    overlay.className = 'tm-modal';
    overlay.style.display = 'flex';
    
    const modal = document.createElement('div');
    modal.className = 'tm-dialog';
    modal.style.maxWidth = '500px';
    
    modal.innerHTML = `
      <div class="tm-dialog-hd" style="background: #fef2f2; border-bottom: 1px solid #fecaca;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <h3 style="color: #991b1b; margin: 0; flex: 1;">Empty Rubric Detected</h3>
          <span style="background: #dc2626; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600;">ERROR</span>
        </div>
      </div>
      <div class="tm-dialog-bd">
        <p><strong>The uploaded rubric file appears to be empty or could not be parsed correctly.</strong></p>
        <p>Please ensure your rubric file meets the following requirements:</p>
        <ul style="margin: 12px 0; padding-left: 24px; line-height: 1.8;">
          <li><strong>Table format:</strong> Must contain clear rows and columns</li>
          <li><strong>Score format:</strong> Use (min-max) notation, e.g., (8-10) points</li>
          <li><strong>Content:</strong> Include criteria names, descriptions, and grade levels</li>
          <li><strong>File format:</strong> .docx, .xlsx, or .csv</li>
        </ul>
        <p style="margin-top: 16px; padding: 12px; background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px;">
          <strong>Tip:</strong> Download a sample template or review your file structure before re-uploading.
        </p>
      </div>
      <div class="tm-dialog-ft">
        <button class="btn tm-cancel-btn">Close</button>
        <button class="btn primary">Re-upload Rubric</button>
      </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    const closeBtn = modal.querySelector('.tm-cancel-btn');
    const reuploadBtn = modal.querySelector('.btn.primary');
    
    closeBtn.addEventListener('click', () => {
      document.body.removeChild(overlay);
    });
    
    reuploadBtn.addEventListener('click', () => {
      document.body.removeChild(overlay);
      openRubricModal(projectId);
    });
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
      }
    });
  }

  // Show success dialog with rubric details
  function showRubricSuccessDialog(projectId, details) {
    const overlay = document.createElement('div');
    overlay.className = 'tm-modal';
    overlay.style.display = 'flex';
    
    const modal = document.createElement('div');
    modal.className = 'tm-dialog';
    modal.style.maxWidth = '600px';
    
    const criteriaCount = details.criteria?.length || 0;
    const gradeLevelsCount = details.summary?.grade_levels_count || 0;
    
    // Generate preview content
    let previewHtml = '';
    if (details.criteria && details.criteria.length > 0) {
      const previewCriteria = details.criteria.slice(0, 3); // Show first 3 criteria
      previewHtml = previewCriteria.map((criterion, idx) => {
        const gradeLevels = criterion.grade_levels || [];
        const levelNames = gradeLevels.map(l => l.level_name).join(', ');
        return `
          <div style="padding: 12px; border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 8px; background: #fafafa;">
            <div style="font-weight: 600; color: #1f2937; margin-bottom: 4px;">
              ${criterion.seq_no || idx + 1}. ${criterion.title}
            </div>
            <div style="font-size: 12px; color: #6b7280;">
              Max Score: ${criterion.max_score} | Levels: ${levelNames || 'N/A'}
            </div>
          </div>
        `;
      }).join('');
      
      if (details.criteria.length > 3) {
        previewHtml += `<div style="text-align: center; color: #6b7280; font-size: 13px; margin-top: 8px;">... and ${details.criteria.length - 3} more criteria</div>`;
      }
    }
    
    modal.innerHTML = `
      <div class="tm-dialog-hd" style="background: #f0fdf4; border-bottom: 1px solid #bbf7d0;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <h3 style="color: #166534; margin: 0; flex: 1;">Rubric Uploaded Successfully</h3>
          <span style="background: #16a34a; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600;">SUCCESS</span>
        </div>
      </div>
      <div class="tm-dialog-bd">
        <p><strong>Your rubric has been successfully uploaded and parsed!</strong></p>
        <div style="background: #f0f9ff; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div>
              <div style="font-size: 24px; font-weight: 700; color: #0369a1;">${criteriaCount}</div>
              <div style="font-size: 13px; color: #0c4a6e;">Criteria</div>
            </div>
            <div>
              <div style="font-size: 24px; font-weight: 700; color: #0369a1;">${gradeLevelsCount}</div>
              <div style="font-size: 13px; color: #0c4a6e;">Grade Levels</div>
            </div>
          </div>
        </div>
        
        <div style="margin-top: 16px;">
          <div style="font-weight: 600; margin-bottom: 8px; color: #1f2937;">Preview:</div>
          <div style="max-height: 240px; overflow-y: auto; padding: 4px;">
            ${previewHtml}
          </div>
        </div>
        
        <p style="margin-top: 16px; color: #374151;">
          You can now view and edit your rubric to make any necessary adjustments.
        </p>
      </div>
      <div class="tm-dialog-ft">
        <button class="btn tm-cancel-btn">Close</button>
        <button class="btn primary">View Full Rubric</button>
      </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    const closeBtn = modal.querySelector('.tm-cancel-btn');
    const viewBtn = modal.querySelector('.btn.primary');
    
    closeBtn.addEventListener('click', () => {
      document.body.removeChild(overlay);
    });
    
    viewBtn.addEventListener('click', () => {
      document.body.removeChild(overlay);
      location.href = `/dashboard/coordinator/rubric?project=${projectId}`;
    });
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
      }
    });
  }

  // ---------- toast (center modal) ----------
  function toast(msg, ms=2200){
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:3000;opacity:0;transition:opacity 0.2s';
    
    const modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;padding:24px 32px;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-width:400px;min-width:300px;transform:scale(0.9);transition:transform 0.2s;text-align:center';
    
    modal.innerHTML = `
      <div style="font-size:15px;color:#374151;line-height:1.5;font-weight:500">${msg}</div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      modal.style.transform = 'scale(1)';
    });
    
    setTimeout(() => {
      overlay.style.opacity = '0';
      modal.style.transform = 'scale(0.9)';
      setTimeout(() => overlay.remove(), 200);
    }, ms);
    
    // Click to close
    overlay.addEventListener('click', () => {
      overlay.style.opacity = '0';
      modal.style.transform = 'scale(0.9)';
      setTimeout(() => overlay.remove(), 200);
    });
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
        dropArea.classList.add('file-selected');
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

    // Submit - Step 1: Upload and Preview
    submitBtn.addEventListener('click', async () => {
      const file = fileInput.files[0];
      if (!file) {
        errLine.style.display = 'block';
        return;
      }

      try {
        // Show uploading toast
        toast('Uploading and parsing rubric...');

        // Upload draft file
        const draft = await uploadDraftFile(file, 'rubric');

        // Close upload modal
        closeModal();
        
        // Commit to get rubric ID and parse
        const commitResult = await commitFile(draft.temp_name, 'rubric', null, null, projectId);
        const rubricId = commitResult.upload_record?.rubric_id;
        
        if (rubricId) {
          // Wait for parsing to complete
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          // Get rubric details
          const detailsResponse = await fetch(`/api/uploads/rubric/${rubricId}/details`);
          
          if (detailsResponse.ok) {
            const details = await detailsResponse.json();
            
            // Check if rubric has criteria
            if (!details.criteria || details.criteria.length === 0) {
              // Empty rubric - show error and delete
              await deleteRubric(rubricId);
              showRubricErrorDialog(projectId);
            } else {
              // Show preview and confirm dialog
              showRubricPreviewDialog(projectId, rubricId, details);
            }
          } else {
            toast('Failed to parse rubric. Please check file format.');
            await deleteRubric(rubricId);
          }
        } else {
          toast('Upload failed. Please try again.');
        }
        
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
        dropArea.classList.add('file-selected');
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

        // Show uploading progress
        toast('Uploading assignment...');

        const draft = await uploadDraftFile(file, 'assignment1');
        
        // Close upload modal first
        closeModal();
        
        // Get rubric info for preview
        let rubricInfo = null;
        try {
          const rubricRes = await fetch(`/api/uploads/project/${projectId}/latest-rubric`);
          if (rubricRes.ok) {
            const rubricData = await rubricRes.json();
            if (rubricData.rubric_id) {
              const detailRes = await fetch(`/api/uploads/rubric/${rubricData.rubric_id}/details`);
              if (detailRes.ok) {
                rubricInfo = await detailRes.json();
              }
            }
          }
        } catch (error) {
          console.warn('Failed to fetch rubric info:', error);
        }

        // Show preview dialog before committing
        showAssignmentPreviewDialog(
          projectId,
          draft.temp_name,
          'assignment',
          1,
          combinedDateTime,
          file,
          rubricInfo
        );
        
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
        dropArea.classList.add('file-selected');
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

        // Show uploading progress
        toast('Uploading assignment...');

        const draft = await uploadDraftFile(file, 'assignment2');
        
        // Close upload modal first
        closeModal();
        
        // Get rubric info for preview
        let rubricInfo = null;
        try {
          const rubricRes = await fetch(`/api/uploads/project/${projectId}/latest-rubric`);
          if (rubricRes.ok) {
            const rubricData = await rubricRes.json();
            if (rubricData.rubric_id) {
              const detailRes = await fetch(`/api/uploads/rubric/${rubricData.rubric_id}/details`);
              if (detailRes.ok) {
                rubricInfo = await detailRes.json();
              }
            }
          }
        } catch (error) {
          console.warn('Failed to fetch rubric info:', error);
        }

        // Show preview dialog before committing
        showAssignmentPreviewDialog(
          projectId,
          draft.temp_name,
          'assignment',
          2,
          combinedDateTime,
          file,
          rubricInfo
        );
        
      } catch (error) {
        console.error('Upload error:', error);
        toast('Failed to upload assignment. Please try again.');
      }
    });
  }

  // ---------- Assignment Preview Dialog Functions ----------
  
  // Delete assignment draft function
  async function deleteAssignmentDraft(tempName) {
    try {
      // You may need to implement a backend endpoint for this
      console.log('Deleting draft:', tempName);
      // For now, just log it as the draft will be cleaned up automatically
    } catch (error) {
      console.error('Error deleting draft:', error);
    }
  }

  // Format file size
  function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  // Format date time for display
  function formatDateTime(dateTimeString) {
    const date = new Date(dateTimeString);
    const options = { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    return date.toLocaleDateString('en-US', options);
  }

  // Show assignment preview dialog before confirming
  function showAssignmentPreviewDialog(projectId, tempName, fileType, round, dueDate, file, rubricInfo) {
    const overlay = document.createElement('div');
    overlay.className = 'tm-modal';
    overlay.style.display = 'flex';
    
    const modal = document.createElement('div');
    modal.className = 'tm-dialog';
    modal.style.maxWidth = '800px';
    modal.style.maxHeight = '90vh';
    modal.style.overflow = 'hidden';
    modal.style.display = 'flex';
    modal.style.flexDirection = 'column';
    
    // Generate rubric preview HTML
    let rubricPreviewHtml = '';
    if (rubricInfo && rubricInfo.criteria && rubricInfo.criteria.length > 0) {
      const criteriaCount = rubricInfo.criteria.length;
      const gradeLevelsCount = rubricInfo.summary?.grade_levels_count || 0;
      
      const previewCriteria = rubricInfo.criteria.slice(0, 3);
      const criteriaListHtml = previewCriteria.map((criterion, idx) => {
        const gradeLevels = criterion.grade_levels || [];
        const levelNames = gradeLevels.map(l => l.level_name).join(', ');
        return `
          <div style="padding: 10px; border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 6px; background: #fafafa;">
            <div style="font-weight: 600; color: #1f2937; margin-bottom: 4px; font-size: 13px;">
              ${criterion.seq_no || idx + 1}. ${criterion.title}
            </div>
            <div style="font-size: 11px; color: #6b7280;">
              Max Score: ${criterion.max_score} | Levels: ${levelNames || 'N/A'}
            </div>
          </div>
        `;
      }).join('');
      
      const moreText = criteriaCount > 3 ? `<div style="text-align: center; color: #6b7280; font-size: 12px; margin-top: 6px;">... and ${criteriaCount - 3} more criteria</div>` : '';
      
      rubricPreviewHtml = `
        <div style="background: #f0f9ff; padding: 14px; border-radius: 8px; margin-bottom: 12px;">
          <div style="font-weight: 600; margin-bottom: 10px; color: #0369a1; display: flex; align-items: center; gap: 8px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 5H7C5.89543 5 5 5.89543 5 7V19C5 20.1046 5.89543 21 7 21H17C18.1046 21 19 20.1046 19 19V7C19 5.89543 18.1046 5 17 5H15M9 5C9 6.10457 9.89543 7 11 7H13C14.1046 7 15 6.10457 15 5M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <path d="M9 12H15M9 16H15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            Rubric Information
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
            <div style="background: white; padding: 10px; border-radius: 6px;">
              <div style="font-size: 20px; font-weight: 700; color: #0369a1;">${criteriaCount}</div>
              <div style="font-size: 12px; color: #0c4a6e;">Criteria</div>
            </div>
            <div style="background: white; padding: 10px; border-radius: 6px;">
              <div style="font-size: 20px; font-weight: 700; color: #0369a1;">${gradeLevelsCount}</div>
              <div style="font-size: 12px; color: #0c4a6e;">Grade Levels</div>
            </div>
          </div>
          <div style="max-height: 200px; overflow-y: auto; padding: 4px;">
            ${criteriaListHtml}
            ${moreText}
          </div>
        </div>
      `;
    } else {
      rubricPreviewHtml = `
        <div style="background: #fef3c7; padding: 14px; border-radius: 8px; margin-bottom: 12px; border-left: 4px solid #f59e0b;">
          <div style="font-weight: 600; margin-bottom: 6px; color: #92400e; font-size: 13px;">⚠️ No Rubric Found</div>
          <div style="font-size: 12px; color: #92400e; line-height: 1.5;">
            This assignment will be uploaded without an associated rubric. You may want to upload a rubric first for proper grading.
          </div>
        </div>
      `;
    }
    
    modal.innerHTML = `
      <div class="tm-dialog-hd" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-bottom: none; flex-shrink: 0;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <h3 style="color: white; margin: 0; flex: 1;">Assignment ${round} - Preview & Confirm</h3>
          <span style="background: rgba(255,255,255,0.3); color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600;">PREVIEW</span>
        </div>
      </div>
      <div class="tm-dialog-bd" style="overflow-y: auto; flex: 1;">
        <p style="font-size: 15px; font-weight: 600; color: #1f2937; margin-bottom: 16px;">
          Please review your assignment details before confirming:
        </p>
        
        <!-- Assignment Details -->
        <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid #e5e7eb;">
          <div style="font-weight: 600; margin-bottom: 12px; color: #374151; display: flex; align-items: center; gap: 8px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 12H15M9 16H15M17 21H7C5.89543 21 5 20.1046 5 19V5C5 3.89543 5.89543 3 7 3H12.5858C12.851 3 13.1054 3.10536 13.2929 3.29289L18.7071 8.70711C18.8946 8.89464 19 9.149 19 9.41421V19C19 20.1046 18.1046 21 17 21Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Assignment Details
          </div>
          <div style="display: grid; gap: 10px;">
            <div style="display: flex; justify-content: space-between; padding: 8px; background: white; border-radius: 4px;">
              <span style="color: #6b7280; font-size: 13px;">File Name:</span>
              <span style="color: #1f2937; font-weight: 600; font-size: 13px;">${file.name}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 8px; background: white; border-radius: 4px;">
              <span style="color: #6b7280; font-size: 13px;">File Size:</span>
              <span style="color: #1f2937; font-weight: 600; font-size: 13px;">${formatFileSize(file.size)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 8px; background: white; border-radius: 4px;">
              <span style="color: #6b7280; font-size: 13px;">File Type:</span>
              <span style="color: #1f2937; font-weight: 600; font-size: 13px;">PDF Document</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 8px; background: white; border-radius: 4px;">
              <span style="color: #6b7280; font-size: 13px;">Due Date:</span>
              <span style="color: #dc2626; font-weight: 700; font-size: 13px;">${formatDateTime(dueDate)}</span>
            </div>
          </div>
        </div>
        
        ${rubricPreviewHtml}
        
        <div style="background: #ecfdf5; padding: 14px; border-radius: 8px; border-left: 4px solid #10b981; margin-top: 16px;">
          <div style="font-weight: 600; margin-bottom: 6px; color: #065f46; font-size: 13px;">✓ Ready to Submit</div>
          <div style="font-size: 12px; color: #065f46; line-height: 1.6;">
            Once confirmed, this assignment will be saved and ready to publish. You can mark this assignment after publishing it.
          </div>
        </div>
      </div>
      <div class="tm-dialog-ft" style="flex-shrink: 0; background: #f9fafb; border-top: 1px solid #e5e7eb;">
        <button class="btn tm-cancel-btn">Cancel & Re-upload</button>
        <button class="btn primary" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right: 6px;">
            <path d="M5 13L9 17L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Confirm & Save Assignment
        </button>
      </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    const cancelBtn = modal.querySelector('.tm-cancel-btn');
    const confirmBtn = modal.querySelector('.btn.primary');
    
    // Cancel - allow re-upload
    cancelBtn.addEventListener('click', async () => {
      document.body.removeChild(overlay);
      await deleteAssignmentDraft(tempName);
      toast('Upload cancelled. You can upload a different file.');
      // Reopen the appropriate modal
      if (round === 1) {
        openAssignment1Modal(projectId);
      } else {
        openAssignment2Modal(projectId);
      }
    });
    
    // Confirm - commit the file
    confirmBtn.addEventListener('click', async () => {
      try {
        // Disable button to prevent double-click
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Saving...';
        
        await commitFile(tempName, fileType, round, dueDate, projectId);
        
        document.body.removeChild(overlay);
        
        // Show success dialog
        showAssignmentSuccessDialog(projectId, round, file, dueDate, rubricInfo);
        
        // Refresh project list
        await fetchProjects();
        
      } catch (error) {
        console.error('Commit error:', error);
        document.body.removeChild(overlay);
        toast('Failed to save assignment. Please try again.');
      }
    });
    
    // Prevent closing on overlay click to force user decision
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        // Do nothing - user must choose
      }
    });
  }

  // Show success dialog after assignment upload
  function showAssignmentSuccessDialog(projectId, round, file, dueDate, rubricInfo) {
    const overlay = document.createElement('div');
    overlay.className = 'tm-modal';
    overlay.style.display = 'flex';
    
    const modal = document.createElement('div');
    modal.className = 'tm-dialog';
    modal.style.maxWidth = '600px';
    
    const hasRubric = rubricInfo && rubricInfo.criteria && rubricInfo.criteria.length > 0;
    
    modal.innerHTML = `
      <div class="tm-dialog-hd" style="background: #f0fdf4; border-bottom: 1px solid #bbf7d0;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <h3 style="color: #166534; margin: 0; flex: 1;">Assignment ${round} Uploaded Successfully!</h3>
          <span style="background: #16a34a; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600;">SUCCESS</span>
        </div>
      </div>
      <div class="tm-dialog-bd">
        <div style="text-align: center; margin: 20px 0;">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin: 0 auto;">
            <circle cx="12" cy="12" r="10" fill="#dcfce7" stroke="#16a34a" stroke-width="2"/>
            <path d="M8 12L11 15L16 9" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        
        <p style="text-align: center; font-size: 15px; color: #374151; margin-bottom: 20px;">
          <strong>${file.name}</strong> has been successfully uploaded and saved.
        </p>
        
        <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
          <div style="font-weight: 600; margin-bottom: 12px; color: #374151; font-size: 14px;">Assignment Summary:</div>
          <div style="display: grid; gap: 8px;">
            <div style="display: flex; justify-content: space-between; font-size: 13px;">
              <span style="color: #6b7280;">Assignment:</span>
              <span style="color: #1f2937; font-weight: 600;">Assignment ${round}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 13px;">
              <span style="color: #6b7280;">Due Date:</span>
              <span style="color: #dc2626; font-weight: 600;">${formatDateTime(dueDate)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 13px;">
              <span style="color: #6b7280;">File Size:</span>
              <span style="color: #1f2937; font-weight: 600;">${formatFileSize(file.size)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 13px;">
              <span style="color: #6b7280;">Rubric:</span>
              <span style="color: ${hasRubric ? '#16a34a' : '#f59e0b'}; font-weight: 600;">${hasRubric ? '✓ Associated' : '⚠ Not Associated'}</span>
            </div>
          </div>
        </div>
        
        <div style="background: #dbeafe; padding: 14px; border-radius: 8px; border-left: 4px solid #3b82f6;">
          <div style="font-weight: 600; margin-bottom: 8px; color: #1e40af; font-size: 13px;">📋 Next Steps:</div>
          <ol style="margin: 0; padding-left: 20px; color: #1e40af; font-size: 12px; line-height: 1.8;">
            <li>The assignment has been saved and is ready to publish</li>
            <li>Return to Task Management to publish and mark the assignment</li>
            <li>You can view the assignment anytime from the assignment section</li>
          </ol>
        </div>
      </div>
      <div class="tm-dialog-ft" style="gap: 8px;">
        <button class="btn primary" id="backToTaskBtn" style="background: #3b82f6;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right: 6px;">
            <path d="M5 13L9 17L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Back to Task Management
        </button>
      </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    const backBtn = modal.querySelector('#backToTaskBtn');
    
    backBtn.addEventListener('click', () => {
      document.body.removeChild(overlay);
      // Store expansion data in sessionStorage to auto-expand the assignment
      sessionStorage.setItem('expandAssignment', JSON.stringify({ projectId, round }));
      // Refresh the page to show updated task with Mark Assignment button
      window.location.reload();
    });
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
      }
    });
  }

})();