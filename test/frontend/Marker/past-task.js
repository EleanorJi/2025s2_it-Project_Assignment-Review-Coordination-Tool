// Past Task – grouped by semester with collapse + actions (Marker version)
(function () {
    const $  = (s, r=document) => r.querySelector(s);
  
    // ===== Demo data for Marker (可替换为后端返回)=====
    // 结构：year, semester, items[{title, reportUrl?, rubricUrl?, feedbackUrl?, status}]
    const data = [
      {
        year: 2025, 
        semester: 'Semester 1',
        items: [
          { 
            title: 'Task 1 ', 
            reportUrl: '#', 
            rubricUrl: 'rubric.html?rubric=task_1_2025_sem1_r1', 
            feedbackUrl: 'feedback.html?task=task_1_2025_sem1_r1',
            status: 'completed',
            completedDate: 'Mar 15, 2025',
            score: '85/100'
          },
          { 
            title: 'Task 2 ', 
            reportUrl: '#', 
            rubricUrl: 'rubric.html?rubric=task_1_2025_sem1_r2', 
            feedbackUrl: 'feedback.html?task=task_1_2025_sem1_r2',
            status: 'completed',
            completedDate: 'Mar 20, 2025',
            score: '92/100'
          },
        ]
      }
    ];
  
    // ===== Render =====
    const host = $('#paContainer');
  
    function render() {
      if (!host) return;
      
      if (data.length === 0) {
        host.innerHTML = `
          <div class="pa-empty">
            <h3>No Past Tasks</h3>
            <p>You haven't completed any tasks yet.</p>
          </div>
        `;
        return;
      }
      
      host.innerHTML = '';
      data.forEach(group => host.appendChild(renderGroup(group)));
    }
  
    function renderGroup(group) {
      const block = document.createElement('div');
      block.className = 'pa-block';
  
      // Header
      const hd = document.createElement('div');
      hd.className = 'pa-hd';
      const title = document.createElement('div');
      title.className = 'pa-title';
      title.textContent = `${group.year} · ${group.semester}`;
      const toggle = document.createElement('div');
      toggle.className = 'pa-toggle';
      toggle.textContent = '▾';
      hd.append(title, toggle);
      block.append(hd);
  
      // List
      const list = document.createElement('div');
      list.className = 'pa-list';
      group.items.forEach(item => list.appendChild(renderRow(item)));
      block.append(list);
  
      // Collapse functionality
      hd.addEventListener('click', () => {
        const collapsed = block.classList.toggle('collapsed');
        toggle.textContent = collapsed ? '▸' : '▾';
      });
  
      return block;
    }
  
    function renderRow(item) {
      const row = document.createElement('div');
      row.className = 'pa-row';
  
      // Left side - Task info
      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.flexDirection = 'column';
      left.style.gap = '4px';
      
      const title = document.createElement('div');
      title.className = 'pa-muted';
      title.textContent = item.title;
      title.style.fontWeight = '600';
      title.style.color = 'var(--text)';
      
      const meta = document.createElement('div');
      meta.style.fontSize = '12px';
      meta.style.color = 'var(--muted)';
      meta.innerHTML = `
        <span>Completed: ${item.completedDate}</span>
        <span style="margin-left: 12px;">Score: ${item.score}</span>
      `;
      
      left.append(title, meta);
  
      // Right side - Actions
      const acts = document.createElement('div');
      acts.className = 'pa-actions';
      
      // View Rubric button
      const rubricBtn = makeBtn('View Rubric', () => handleViewRubric(item));
      rubricBtn.className = 'btn sm';
      
      // View Feedback button
      const feedbackBtn = makeBtn('View Feedback', () => handleViewFeedback(item));
      feedbackBtn.className = 'btn sm primary';
      
      acts.append(rubricBtn, feedbackBtn);
  
      row.append(left, acts);
      return row;
    }
  
    function makeBtn(text, onClick) {
      const b = document.createElement('button');
      b.className = 'btn sm';
      b.textContent = text;
      b.addEventListener('click', onClick);
      return b;
    }
  
    // ===== Button Handlers =====
    function handleViewRubric(item) {
      const button = event.target;
      InteractionUtils.showLoading(button, 'Opening Rubric...');
      
      setTimeout(() => {
        if (item.rubricUrl && item.rubricUrl !== '#') {
          window.open(item.rubricUrl, '_blank', 'noopener');
        } else {
          InteractionUtils.showToast('Rubric not available', 'error');
        }
        InteractionUtils.hideLoading(button);
      }, 500);
    }
    
    
    function handleViewFeedback(item) {
      const button = event.target;
      InteractionUtils.showLoading(button, 'Opening Feedback...');
      
      setTimeout(() => {
        // 生成task ID用于view-feedback页面
        const taskId = generateTaskId(item.title);
        window.location.href = `view-feedback.html?task=${encodeURIComponent(taskId)}`;
        InteractionUtils.hideLoading(button);
      }, 500);
    }
    
  
    function generateTaskId(title) {
      // 从标题中提取信息生成task ID
      // 例如: "Task 1 (Round 1)" -> "task_1_2025_sem1_r1"
      const match = title.match(/Task\s*(\d+)\s*\(Round\s*(\d+)\)/);
      if (match) {
        const [, taskNum, round] = match;
        return `task_${taskNum}_2025_sem1_r${round}`;
      }
      // 如果格式不匹配，使用默认ID
      return 'task_1_2025_sem1_r1';
    }

    function openOrToast(url, fallbackMsg) {
      if (url && url !== '#') {
        window.open(url, '_blank', 'noopener');
      } else {
        InteractionUtils.showToast(fallbackMsg, 'error');
      }
    }
  
    // ===== Initialize =====
    document.addEventListener('DOMContentLoaded', () => {
      render();
    });
    
    // Expose render function for potential external updates
    window.PastTaskManager = {
      render,
      addTask: (year, semester, task) => {
        let group = data.find(g => g.year === year && g.semester === semester);
        if (!group) {
          group = { year, semester, items: [] };
          data.push(group);
        }
        group.items.push(task);
        render();
      },
      removeTask: (year, semester, taskTitle) => {
        const group = data.find(g => g.year === year && g.semester === semester);
        if (group) {
          group.items = group.items.filter(item => item.title !== taskTitle);
          render();
        }
      }
    };
  })();
