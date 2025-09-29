// Past Assignment – grouped by year with task overviews
(function () {
    const $  = (s, r=document) => r.querySelector(s);
    const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
    // ✅ 显示用户名
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
  
    // ===== Demo data（可替换为后端返回）=====
    // 结构：year, tasks[{title, description, status, assignments[], created_at}]
    const data = [
      {
        year: 2024,
        tasks: [
          { 
            title: 'HPS302 Assignment Moderation - Semester 2', 
            description: 'Advanced Psychology Research Methods',
            status: 'archived',
            created_at: '2024-07-15',
            assignments: [
              { title: 'Assignment 1', status: 'archived', due_date: '2024-08-15', submissions: 45 },
              { title: 'Assignment 2', status: 'archived', due_date: '2024-09-20', submissions: 42 }
            ],
            rubric: { uploaded: true, filename: 'rubric_s2_2024.docx' },
            reports: { available: true, filename: 'final_report_s2_2024.pdf' }
          },
          {
            title: 'HPS302 Assignment Moderation - Semester 1',
            description: 'Advanced Psychology Research Methods',
            status: 'archived',
            created_at: '2024-02-10',
            assignments: [
              { title: 'Assignment 1', status: 'archived', due_date: '2024-03-15', submissions: 48 },
              { title: 'Assignment 2', status: 'archived', due_date: '2024-04-20', submissions: 46 }
            ],
            rubric: { uploaded: true, filename: 'rubric_s1_2024.docx' },
            reports: { available: true, filename: 'final_report_s1_2024.pdf' }
          }
        ]
      },
      {
        year: 2023,
        tasks: [
          {
            title: 'HPS302 Assignment Moderation - Semester 2',
            description: 'Advanced Psychology Research Methods',
            status: 'archived',
            created_at: '2023-07-15',
            assignments: [
              { title: 'Assignment 1', status: 'archived', due_date: '2023-08-15', submissions: 52 },
              { title: 'Assignment 2', status: 'archived', due_date: '2023-09-20', submissions: 50 }
            ],
            rubric: { uploaded: true, filename: 'rubric_s2_2023.docx' },
            reports: { available: true, filename: 'final_report_s2_2023.pdf' }
          },
          {
            title: 'HPS302 Assignment Moderation - Semester 1',
            description: 'Advanced Psychology Research Methods',
            status: 'archived',
            created_at: '2023-02-10',
            assignments: [
              { title: 'Assignment 1', status: 'archived', due_date: '2023-03-15', submissions: 55 },
              { title: 'Assignment 2', status: 'archived', due_date: '2023-04-20', submissions: 53 }
            ],
            rubric: { uploaded: true, filename: 'rubric_s1_2023.docx' },
            reports: { available: true, filename: 'final_report_s1_2023.pdf' }
          }
        ]
      }
    ];

    // ===== Render =====
    const host = $('#paContainer');

    function render() {
      host.innerHTML = '';

      // Add control buttons
      const controls = document.createElement('div');
      controls.className = 'pa-controls';
      controls.innerHTML = `
        <button id="expandAll" class="btn">Expand All</button>
        <button id="collapseAll" class="btn">Collapse All</button>
      `;
      host.appendChild(controls);

      data.forEach(yearGroup => host.appendChild(renderYearGroup(yearGroup)));

      // Add control functionality
      $('#expandAll').addEventListener('click', () => {
        $$('.pa-year-block').forEach(block => {
          block.classList.remove('collapsed');
          const toggle = block.querySelector('.pa-year-toggle');
          if (toggle) toggle.innerHTML = '▾';
        });
      });

      $('#collapseAll').addEventListener('click', () => {
        $$('.pa-year-block').forEach(block => {
          block.classList.add('collapsed');
          const toggle = block.querySelector('.pa-year-toggle');
          if (toggle) toggle.innerHTML = '▸';
        });
      });
    }

    function renderYearGroup(yearGroup) {
      const yearBlock = document.createElement('div');
      yearBlock.className = 'pa-year-block';

      // Year Header (clickable)
      const yearHeader = document.createElement('div');
      yearHeader.className = 'pa-year-header';
      yearHeader.style.cursor = 'pointer';

      const yearTitleContainer = document.createElement('div');
      yearTitleContainer.className = 'pa-year-title-container';

      const yearTitle = document.createElement('h2');
      yearTitle.className = 'pa-year-title';
      yearTitle.textContent = yearGroup.year;

      const yearToggle = document.createElement('div');
      yearToggle.className = 'pa-year-toggle';
      yearToggle.innerHTML = '▾';

      yearTitleContainer.appendChild(yearTitle);
      yearTitleContainer.appendChild(yearToggle);
      yearHeader.appendChild(yearTitleContainer);
      yearBlock.appendChild(yearHeader);

      // Tasks Container (collapsible)
      const tasksContainer = document.createElement('div');
      tasksContainer.className = 'pa-tasks-container';

      yearGroup.tasks.forEach(task => {
        tasksContainer.appendChild(renderTaskCard(task));
      });

      yearBlock.appendChild(tasksContainer);

      // Toggle functionality
      yearHeader.addEventListener('click', () => {
        const isCollapsed = yearBlock.classList.toggle('collapsed');
        yearToggle.innerHTML = isCollapsed ? '▸' : '▾';
      });

      return yearBlock;
    }

    function renderTaskCard(task) {
      const card = document.createElement('div');
      card.className = 'pa-task-card';

      // Task Header
      const taskHeader = document.createElement('div');
      taskHeader.className = 'pa-task-header';

      const titleContainer = document.createElement('div');
      titleContainer.className = 'pa-task-title-container';

      const title = document.createElement('h3');
      title.className = 'pa-task-title';
      title.textContent = task.title;

      const status = document.createElement('span');
      status.className = `pa-task-status ${task.status}`;
      status.textContent = task.status === 'archived' ? 'Archived' : 'In Progress';

      titleContainer.appendChild(title);
      titleContainer.appendChild(status);
      taskHeader.appendChild(titleContainer);

      const description = document.createElement('p');
      description.className = 'pa-task-description';
      description.textContent = task.description;
      taskHeader.appendChild(description);

      card.appendChild(taskHeader);

      // Task Content - Single column layout
      const content = document.createElement('div');
      content.className = 'pa-task-content';

      // Main content container
      const mainContent = document.createElement('div');
      mainContent.className = 'pa-main-content';

      // Rubric Section (at the top)
      if (task.rubric.uploaded) {
        const rubricSection = document.createElement('div');
        rubricSection.className = 'pa-rubric-section';

        const rubricTitle = document.createElement('h4');
        rubricTitle.className = 'pa-section-title';
        rubricTitle.textContent = 'Rubric';
        rubricSection.appendChild(rubricTitle);

        const rubricItem = document.createElement('div');
        rubricItem.className = 'pa-rubric-item';
        rubricItem.innerHTML = `
          <div class="pa-rubric-info">
            <div class="pa-rubric-filename">${task.rubric.filename}</div>
            <div class="pa-rubric-status">Available</div>
          </div>
          <button class="btn sm pa-view-rubric-btn" onclick="openOrToast('#', 'Rubric not available')">View Rubric</button>
        `;
        rubricSection.appendChild(rubricItem);

        mainContent.appendChild(rubricSection);
      }

      // Assignments Section
      const assignmentsSection = document.createElement('div');
      assignmentsSection.className = 'pa-assignments-section';

      const assignmentsTitle = document.createElement('h4');
      assignmentsTitle.className = 'pa-section-title';
      assignmentsTitle.textContent = 'Assignments';
      assignmentsSection.appendChild(assignmentsTitle);

      const assignmentsList = document.createElement('div');
      assignmentsList.className = 'pa-assignments-list';

      task.assignments.forEach(assignment => {
        const assignmentItem = document.createElement('div');
        assignmentItem.className = 'pa-assignment-item';

        const assignmentInfo = document.createElement('div');
        assignmentInfo.className = 'pa-assignment-info';

        const assignmentTitle = document.createElement('div');
        assignmentTitle.className = 'pa-assignment-title';
        assignmentTitle.textContent = assignment.title;

        const assignmentMeta = document.createElement('div');
        assignmentMeta.className = 'pa-assignment-meta';
        assignmentMeta.innerHTML = `
          <span>Due: ${formatDate(assignment.due_date)}</span>
          <span>Submissions: ${assignment.submissions}</span>
        `;

        assignmentInfo.appendChild(assignmentTitle);
        assignmentInfo.appendChild(assignmentMeta);
        assignmentItem.appendChild(assignmentInfo);

        const assignmentRight = document.createElement('div');
        assignmentRight.className = 'pa-assignment-right';

        const assignmentStatus = document.createElement('span');
        assignmentStatus.className = `pa-assignment-status ${assignment.status}`;
        assignmentStatus.textContent = assignment.status === 'archived' ? 'Archived' : 'Pending';
        assignmentRight.appendChild(assignmentStatus);
        
        // Add View Report button for each assignment
        const viewReportBtn = document.createElement('button');
        viewReportBtn.className = 'btn sm pa-view-report-btn';
        viewReportBtn.textContent = 'View Report';
        viewReportBtn.addEventListener('click', () => openOrToast('#', 'Report not available'));
        assignmentRight.appendChild(viewReportBtn);
        
        assignmentItem.appendChild(assignmentRight);
        assignmentsList.appendChild(assignmentItem);
      });
      
      assignmentsSection.appendChild(assignmentsList);
      mainContent.appendChild(assignmentsSection);
      
      content.appendChild(mainContent);
      card.appendChild(content);
      return card;
    }
    
    function formatDate(dateString) {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-AU', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric' 
      });
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
  
    // Simple toast（使用全局 .toast 样式）
    function toast(msg, ms=2000){
      const t=document.createElement('div');
      t.className='toast'; t.textContent=msg; document.body.appendChild(t);
      requestAnimationFrame(()=> t.classList.add('show'));
      setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=> t.remove(), 200); }, ms);
    }
  
    render();
  })();
  