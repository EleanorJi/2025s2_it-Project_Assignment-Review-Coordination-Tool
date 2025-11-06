// Marker Task Management – Based on Coordinator Design
(function () {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  // ---------- State Management ----------
  const state = {
    tasks: []
  };

  // Expand state management
  const EXPANDED_STATES_KEY = 'taskManagement_marker_expandedStates';
  
  // Save expand state to localStorage
  function saveExpandedStates() {
    const expandedStates = {
      tasks: {},
      rubrics: {},
      assignments: {}
    };
    
    // Save task sections' expand state
    $$('.tm-task-section').forEach(section => {
      const taskId = section.dataset.taskId;
      const content = section.querySelector('.tm-task-content');
      if (content && content.classList.contains('expanded')) {
        expandedStates.tasks[taskId] = true;
      }
    });
    
    // Save rubric sections' expand state
    $$('.tm-rubric-section').forEach(section => {
      const taskId = section.closest('.tm-task-section')?.dataset.taskId;
      const actions = section.querySelector('.tm-rubric-actions');
      if (taskId && actions && actions.classList.contains('expanded')) {
        expandedStates.rubrics[taskId] = true;
      }
    });
    
    // Save assignment sections' expand state
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
  
  // Restore expand state from localStorage
  function restoreExpandedStates() {
    try {
      const savedStates = localStorage.getItem(EXPANDED_STATES_KEY);
      if (!savedStates) return;
      
      const expandedStates = JSON.parse(savedStates);
      
      // Restore task sections' expand state
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
      
      // Restore rubric sections' expand state
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
      
      // Restore assignment sections' expand state
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

  // Fetch project data from backend (only show active assignments)
  async function fetchProjects() {
    try {
      console.log('🔄 Starting to fetch project data...');
      console.log('🔗 API URL:', API.listProjects);
      const response = await fetch(API.listProjects);
      console.log('📡 Response status:', response.status, response.statusText);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log('📊 Data received:', data);
      console.log(`📊 Received ${data.projects?.length || 0} projects`);

      // Clear current state
      state.tasks = [];

      // Process project data
      for (const project of data.projects) {
        console.log(`\n📋 Processing project: ${project.name} (ID: ${project.project_id})`);

        let assignment1Status = 'unpublished';
        let assignment2Status = 'unpublished';
        let assignment1DueDate = null;
        let assignment2DueDate = null;
        let assignment1Id = null;
        let assignment2Id = null;
        let latestIds = null;

        try {
          // 1. First get project's latest assignment IDs
          const latestIdsResponse = await fetch(`/api/uploads/project/${project.project_id}/latest-ids`);
          if (latestIdsResponse.ok) {
            latestIds = await latestIdsResponse.json();
            console.log('📦 Latest IDs received:', latestIds);

            // 2. Get assignment1 status and DDL
            if (latestIds.assignment1) {
              const statusResponse1 = await fetch(`/api/uploads/assignment/${latestIds.assignment1.assignment_id}/status`);
              if (statusResponse1.ok) {
                const statusData1 = await statusResponse1.json();
                assignment1Status = statusData1.assignment.is_published ? 'published' : 'unpublished';
                assignment1DueDate = statusData1.assignment.due_at;
                assignment1Id = latestIds.assignment1.assignment_id;
                console.log(`📄 Assignment1 publish status: ${statusData1.assignment.is_published}`);
              } else {
                console.warn('⚠️ Failed to get assignment1 status');
              }
            } else {
              console.log('📄 Assignment1: No data');
            }

            // 3. Get assignment2 status and DDL
            if (latestIds.assignment2) {
              const statusResponse2 = await fetch(`/api/uploads/assignment/${latestIds.assignment2.assignment_id}/status`);
              if (statusResponse2.ok) {
                const statusData2 = await statusResponse2.json();
                assignment2Status = statusData2.assignment.is_published ? 'published' : 'unpublished';
                assignment2DueDate = statusData2.assignment.due_at;
                assignment2Id = latestIds.assignment2.assignment_id;
                console.log(`📄 Assignment2 publish status: ${statusData2.assignment.is_published}`);
              } else {
                console.warn('⚠️ Failed to get assignment2 status');
              }
            } else {
              console.log('📄 Assignment2: No data');
            }
          } else {
            console.warn('⚠️ Failed to get latest IDs');
          }
        } catch (error) {
          console.error('❌ Error getting assignment status:', error);
        }

        // Determine task status
        let taskStatus = project.status || 'draft'; // Assume backend returns status field
        console.log(`🏷️ Project status: ${taskStatus}`);
        console.log(`📊 Assignment1 status: ${assignment1Status}, Assignment2 status: ${assignment2Status}`);

        // Only show projects with active assignments
        console.log(`🔍 Checking project ${project.name}: taskStatus=${taskStatus}, assignment1Status=${assignment1Status}, assignment2Status=${assignment2Status}`);
        if (taskStatus === 'active' || taskStatus === 'completed') {
          console.log(`✅ Adding active project: ${project.name}`);
          console.log(`📋 Project details:`, {
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

      console.log(`✅ Final processing complete, ${state.tasks.length} active projects`);
      renderTasks();
    } catch (error) {
      console.error('❌ Failed to fetch project data:', error);
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
    
    // Restore expand state after rendering
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

    // Add description if it exists
    if (task.description && task.description.trim()) {
      const description = document.createElement('div');
      description.className = 'tm-task-description';
      description.textContent = task.description;
      title.appendChild(description);
    }

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

    // Assignment sections - Fix here
    task.assignments.forEach(assignment => {
      const assignmentSection = createAssignmentSection(task, assignment);
      // Add null check
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
    
    // Make entire header clickable
    header.addEventListener('click', () => toggleRubricSection(section));

    header.appendChild(title);
    header.appendChild(chevron);

    const actions = document.createElement('div');
    actions.className = 'tm-rubric-actions';

    // Only show View Rubric button (if rubric file exists)
    if (task.rubric_id) {
      const viewBtn = createButton('View Rubric', () => {
        location.href = `/dashboard/marker/rubric?project=${task.project_id}`;
      });
      viewBtn.className = 'btn';
      actions.appendChild(viewBtn);
      console.log('🔘 Rubric display: View button');
    } else {
      const noRubricText = document.createElement('span');
      noRubricText.className = 'tm-muted';
      noRubricText.textContent = 'No rubric available';
      actions.appendChild(noRubricText);
      console.log('🔘 Rubric display: No rubric file');
    }

    section.appendChild(header);
    section.appendChild(actions);

    return section;
  }

  function createAssignmentSection(task, assignment) {
    const section = document.createElement('div');
    section.className = 'tm-assignment-item';

    // Only show published assignments
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

    // Make entire header clickable
    header.addEventListener('click', () => toggleAssignmentSection(section));

    header.appendChild(titleContainer);
    header.appendChild(chevron);

    const actions = document.createElement('div');
    actions.className = 'tm-assignment-actions';

    // Add DDL display
    const dueDateText = assignment.due_date ? 
      `Due: ${formatDate(assignment.due_date)}` : 
      'No due date set';

    const dueDateDiv = document.createElement('div');
    dueDateDiv.className = 'tm-muted';
    dueDateDiv.style.marginTop = '8px';
    dueDateDiv.style.fontSize = '12px';
    dueDateDiv.textContent = dueDateText;

    // Create button container (show loading state first)
    const buttonContainer = document.createElement('div');
    buttonContainer.innerHTML = '<span class="tm-muted">Checking status...</span>';
    actions.appendChild(buttonContainer);
    actions.appendChild(dueDateDiv);

    section.appendChild(header);
    section.appendChild(actions);

    // Asynchronously check marking status
    checkMarkingStatus(assignment.assignment_id, buttonContainer, assignment, task.project_id);

    return section;
  }
  // Check if marker has completed marking
  async function checkMarkingStatus(assignmentId, buttonContainer, assignment, projectId) {
    try {
      // Get current user ID
      const rawUser = localStorage.getItem("user");
      if (!rawUser) {
        throw new Error('User not found in localStorage');
      }

      const user = JSON.parse(rawUser);
      console.log('👤 Current user:', user);
      const markerId = user.id;

      if (!markerId) {
        throw new Error('User ID not found');
      }

      console.log(`🔍 Checking marking status: assignment_id=${assignmentId}, marker_id=${markerId}`);

      const response = await fetch(`/api/uploads/scoring/marker/${assignmentId}/${markerId}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log(`📊 Marking status data:`, data);

      // Check if there are submitted records with finalized=true
      const hasMarked = data.marker_scores && data.marker_scores.length > 0 &&
                       data.marker_scores.some(score => score.finalized === true);

      console.log(`✅ Marking status: ${hasMarked ? 'Submitted' : 'Not submitted'}`);

      // Update button
      updateAssignmentButton(buttonContainer, hasMarked, assignment, projectId);

    } catch (error) {
      console.error('❌ Failed to check marking status:', error);

      // On error, show default Mark Assignment button
      updateAssignmentButton(buttonContainer, false, assignment, projectId);

      // Optional: Show error message
      const errorText = buttonContainer.querySelector('.tm-muted');
      if (errorText) {
        errorText.textContent = 'Failed to check status';
        errorText.style.color = '#ef4444';
      }
    }
  }
  // Update assignment button status
  function updateAssignmentButton(buttonContainer, hasMarked, assignment, projectId) {
    buttonContainer.innerHTML = ''; // Clear loading state

    if (hasMarked) {
      // If already marked and finalized=true, show Check Feedback button
      const feedbackBtn = createButton('Check Feedback', () => {
        location.href = `/dashboard/marker/taskManagement`;
        console.log('assignment.id:', assignment.id, 'projectId:', projectId,'assignment_id:', assignment.assignment_id);
      });
      feedbackBtn.className = 'btn primary';
      buttonContainer.appendChild(feedbackBtn);
    } else {
      // If not yet marked or not finalized, show Mark Assignment button
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

  // ---------- Interaction Functions ----------
  
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
    
    // Close all assignment and rubric expand states
    if (content.classList.contains('expanded')) {
      $$('.tm-assignment-actions, .tm-rubric-actions').forEach(actions => {
        actions.classList.remove('expanded');
      });
      $$('.tm-assignment-chevron, .tm-rubric-chevron').forEach(chevron => {
        chevron.classList.remove('expanded');
      });
    }
    
    // Save expand state
    saveExpandedStates();
  }
  
  // Toggle rubric section expand/collapse
  function toggleRubricSection(section) {
    const actions = section.querySelector('.tm-rubric-actions');
    const chevron = section.querySelector('.tm-rubric-chevron');
    
    // Only toggle current section - don't auto-close other sections
    actions.classList.toggle('expanded');
    chevron.classList.toggle('expanded');
    
    // Save expand state
    saveExpandedStates();
  }
  
  // Toggle assignment section expand/collapse
  function toggleAssignmentSection(section) {
    const actions = section.querySelector('.tm-assignment-actions');
    const chevron = section.querySelector('.tm-assignment-chevron');
    
    // Only toggle current section - don't auto-close other sections
    actions.classList.toggle('expanded');
    chevron.classList.toggle('expanded');
    
    // Save expand state
    saveExpandedStates();
  }

  // Format date
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

  // Initialize
  // Display username
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

  // Initialize dropdown
  const accountEl = document.querySelector('.account');
  const dropdown = document.querySelector('.dropdown-menu');
  const allDropdownItems = document.querySelectorAll('.dropdown-item');
  const logoutBtn = allDropdownItems.length > 1 ? allDropdownItems[1] : null;

  if (accountEl && dropdown) {
    accountEl.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('show');
    });

    // Click elsewhere to close dropdown menu
    document.addEventListener('click', () => {
      dropdown.classList.remove('show');
    });
  }

  // Logout functionality
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

  // Global logout function
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

  // Onboarding modal functions
  window.showOnboarding = function() {
    const overlay = document.getElementById('onboardingOverlay');
    if (overlay) {
      overlay.classList.add('active');
      document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }
  };

  window.hideOnboarding = function() {
    const overlay = document.getElementById('onboardingOverlay');
    if (overlay) {
      overlay.classList.remove('active');
      document.body.style.overflow = ''; // Restore scrolling
    }
  };

  // Close onboarding when clicking overlay
  document.addEventListener('click', function(e) {
    const overlay = document.getElementById('onboardingOverlay');
    if (overlay && e.target === overlay) {
      hideOnboarding();
    }
  });

  // Close onboarding with ESC key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      const overlay = document.getElementById('onboardingOverlay');
      if (overlay && overlay.classList.contains('active')) {
        hideOnboarding();
      }
    }
  });

})();