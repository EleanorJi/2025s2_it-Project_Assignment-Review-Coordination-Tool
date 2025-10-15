// rubric.js — Fetch backend data and render to table
let isEditMode = false;
let currentRubricData = null;
let originalRubricData = null;

document.addEventListener('DOMContentLoaded', () => {
    // ✅ Display username
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
    document.getElementById('backBtn')?.addEventListener('click', () => history.back());
    document.getElementById('editBtn')?.addEventListener('click', enterEditMode);
    document.getElementById('saveBtn')?.addEventListener('click', saveRubric);
    document.getElementById('cancelBtn')?.addEventListener('click', cancelEdit);
    loadRubric();
  });
  
    async function loadRubric(){
      const url = new URL(location.href);
      const projectId = url.searchParams.get('project') || 'demo';

      const metaEl = document.getElementById('rubric-meta');
      const tbody = document.getElementById('rubric-body');

      // Show loading state
      metaEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; color: var(--muted);">
          <div class="loading"></div>
          <span>Loading rubric data for project ${projectId}...</span>
        </div>
      `;
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px; color: var(--muted);">Loading rubric criteria...</td></tr>';

      let rubricId;
      let data;

      try {
        // Step 1: Get latest rubric_id through project_id
        console.log('🌐 Getting latest rubric_id...');
        const rubricRes = await fetch(`/api/uploads/project/${encodeURIComponent(projectId)}/latest-rubric`);

        if (!rubricRes.ok) {
          console.log('rubric_id fetch error:', rubricId);
          const errorText = await rubricRes.text();
          throw new Error(`Failed to get rubric ID: ${rubricRes.status} - ${errorText}`);
        }

        const rubricInfo = await rubricRes.json();
        rubricId = rubricInfo.rubric_id;
        console.log('✅ Retrieved rubric_id:', rubricId);

        // Step 2: Get detailed rubric data through rubric_id
        console.log('🌐 Getting rubric details...');
        const detailRes = await fetch(`/api/uploads/rubric/${encodeURIComponent(rubricId)}/details`);

        if (!detailRes.ok) {
          const errorText = await detailRes.text();
          throw new Error(`Failed to get rubric details: ${detailRes.status} - ${errorText}`);
        }

        data = await detailRes.json();
        console.log('✅ Retrieved rubric detail data:', data);

        // Update UI using backend returned data
        currentRubricData = JSON.parse(JSON.stringify(data)); // Deep copy
        originalRubricData = JSON.parse(JSON.stringify(data)); // Save original for cancel
        updateRubricUI(data, metaEl, tbody);

      } catch (error) {
        console.error('❌ Loading rubric error:', error);

        // Show error message
        metaEl.innerHTML = `
          <div style="color: #dc3545; margin-bottom: 8px;">
            Failed to load rubric data
          </div>
          <div style="font-size: 12px; color: var(--muted);">
            Error: ${esc(error.message)}
          </div>
        `;

        tbody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; padding: 20px; color: #dc3545;">
              Error loading data. Please check the console for details.
            </td>
          </tr>
        `;

        // Use demo data as fallback
        try {
          data = demoRubric();
          updateRubricUI(data, metaEl, tbody);
          console.log('🔄 Using demo data as fallback');
        } catch (demoError) {
          console.error('❌ Even demo data failed:', demoError);
        }
      }
    }

    function updateRubricUI(data, metaEl, tbody) {
      // Update meta information - using backend returned data structure
      metaEl.innerHTML = `
        <div style="font-size: 16px; font-weight: 500; color: var(--text); margin-bottom: 2px;">
          Rubric ID: ${data.rubric.rubric_id} · ${data.rubric.rows} Rows · ${data.rubric.columns} Columns
        </div>
        <div style="font-size: 14px; color: var(--muted); font-weight: 400;">
          Version: ${data.rubric.version} · Created: ${new Date(data.rubric.created_at).toLocaleDateString()} ·
          ${data.summary.criteria_count} Criteria, ${data.summary.grade_levels_count} Grade Levels
        </div>
        `;

      // Render table
      tbody.innerHTML = '';      if (!data.criteria || data.criteria.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; padding: 20px; color: var(--muted);">
              No criteria found for this rubric.
            </td>
          </tr>
        `;
        return;
      }

      data.criteria.forEach((criterion, idx) => {
        const tr = document.createElement('tr');
        tr.dataset.criterionId = criterion.criterion_id;

        // Left side criteria - using backend field names
        const td0 = td();
        td0.dataset.field = 'criterion-info';
        td0.innerHTML = `
          <div class="criterion-title" data-field="title">${criterion.seq_no || idx + 1}. ${esc(criterion.title)}</div>
          ${criterion.description ? `<div style="font-weight: 400; margin-top: 4px; color: var(--muted);" data-field="description">${esc(criterion.description)}</div>` : '<div style="font-weight: 400; margin-top: 4px; color: var(--muted);" data-field="description"></div>'}
        `;
        tr.appendChild(td0);

        // Render columns based on backend returned grade levels
        // Grade level order: HD, D, C, P, F
        const gradeLevelOrder = ['High Distinction', 'Distinction', 'Credit', 'Pass', 'Fail'];

        gradeLevelOrder.forEach(levelName => {
          const level = criterion.grade_levels?.find(l => l.level_name === levelName);
          const cell = td();
          cell.dataset.levelName = levelName;
          if (level) {
            cell.dataset.levelId = level.level_id;
          }

          if (level) {
            // Display score range
            if (level.min_score !== undefined && level.max_score !== undefined) {
              cell.innerHTML += `<div class="badge" data-field="score-range"><span data-field="min-score">${level.min_score}</span> - <span data-field="max-score">${level.max_score}</span></div>`;
            } else {
              cell.innerHTML += `<div class="badge" data-field="score-range"><span data-field="min-score">0</span> - <span data-field="max-score">0</span></div>`;
            }
            // Display description
            if (level.description) {
              cell.innerHTML += `<div data-field="level-description">${nl2br(esc(level.description))}</div>`;
            } else {
              cell.innerHTML += `<div data-field="level-description"></div>`;
            }
          } else {
            cell.innerHTML = '<div class="badge" data-field="score-range"><span data-field="min-score">0</span> - <span data-field="max-score">0</span></div>';
            cell.innerHTML += '<div data-field="level-description"></div>';
          }
          tr.appendChild(cell);
        });

        // Right side max score - using max_score field
        const tdScore = td();
        tdScore.dataset.field = 'max-score';
        tdScore.innerHTML = `<div class="meta" style="font-weight: 700;">/ <span data-field="max-score-value">${esc(String(criterion.max_score ?? '0'))}</span></div>`;
        tr.appendChild(tdScore);

        tbody.appendChild(tr);
      });
    }

  /* ===== Edit Mode Functions ===== */
  function enterEditMode() {
    isEditMode = true;
    
    // Show/hide buttons
    document.getElementById('editBtn').style.display = 'none';
    document.getElementById('saveBtn').style.display = 'block';
    document.getElementById('cancelBtn').style.display = 'block';
    
    // Make table cells editable
    const tbody = document.getElementById('rubric-body');
    const rows = tbody.querySelectorAll('tr');
    
    rows.forEach(row => {
      // Make criterion title and description editable
      const titleDiv = row.querySelector('[data-field="title"]');
      const descDiv = row.querySelector('[data-field="description"]');
      
      if (titleDiv) {
        const titleText = titleDiv.textContent.replace(/^\d+\.\s*/, '');
        titleDiv.contentEditable = true;
        titleDiv.textContent = titleText;
        titleDiv.parentElement.classList.add('editable');
      }
      
      if (descDiv) {
        descDiv.contentEditable = true;
        descDiv.parentElement.classList.add('editable');
      }
      
      // Make grade level descriptions editable
      const cells = row.querySelectorAll('td[data-level-name]');
      cells.forEach(cell => {
        const levelDesc = cell.querySelector('[data-field="level-description"]');
        const minScore = cell.querySelector('[data-field="min-score"]');
        const maxScore = cell.querySelector('[data-field="max-score"]');
        
        if (levelDesc) {
          // Replace <br> with newlines for editing
          levelDesc.innerHTML = levelDesc.innerHTML.replace(/<br>/g, '\n');
          levelDesc.contentEditable = true;
        }
        
        if (minScore) {
          minScore.contentEditable = true;
        }
        
        if (maxScore) {
          maxScore.contentEditable = true;
        }
        
        cell.classList.add('editable');
      });
      
      // Make max score editable
      const maxScoreValue = row.querySelector('[data-field="max-score-value"]');
      if (maxScoreValue) {
        maxScoreValue.contentEditable = true;
        maxScoreValue.parentElement.parentElement.classList.add('editable');
      }
    });
  }

  function cancelEdit() {
    isEditMode = false;
    
    // Show/hide buttons
    document.getElementById('editBtn').style.display = 'block';
    document.getElementById('saveBtn').style.display = 'none';
    document.getElementById('cancelBtn').style.display = 'none';
    
    // Restore original data
    currentRubricData = JSON.parse(JSON.stringify(originalRubricData));
    const metaEl = document.getElementById('rubric-meta');
    const tbody = document.getElementById('rubric-body');
    updateRubricUI(currentRubricData, metaEl, tbody);
  }

  async function saveRubric() {
    try {
      // Collect updated data from the table
      const tbody = document.getElementById('rubric-body');
      const rows = tbody.querySelectorAll('tr');
      
      const updatedCriteria = [];
      
      rows.forEach(row => {
        const criterionId = row.dataset.criterionId;
        const titleDiv = row.querySelector('[data-field="title"]');
        const descDiv = row.querySelector('[data-field="description"]');
        const maxScoreValue = row.querySelector('[data-field="max-score-value"]');
        
        const criterion = {
          criterion_id: parseInt(criterionId),
          title: titleDiv ? titleDiv.textContent.trim() : '',
          description: descDiv ? descDiv.textContent.trim() : '',
          max_score: maxScoreValue ? parseFloat(maxScoreValue.textContent.trim()) : 0,
          grade_levels: []
        };
        
        // Collect grade level data
        const cells = row.querySelectorAll('td[data-level-name]');
        cells.forEach(cell => {
          const levelName = cell.dataset.levelName;
          const levelId = cell.dataset.levelId;
          const levelDesc = cell.querySelector('[data-field="level-description"]');
          const minScore = cell.querySelector('[data-field="min-score"]');
          const maxScore = cell.querySelector('[data-field="max-score"]');
          
          if (levelId) {
            criterion.grade_levels.push({
              level_id: parseInt(levelId),
              level_name: levelName,
              description: levelDesc ? levelDesc.textContent.trim() : '',
              min_score: minScore ? parseFloat(minScore.textContent.trim()) : 0,
              max_score: maxScore ? parseFloat(maxScore.textContent.trim()) : 0
            });
          }
        });
        
        updatedCriteria.push(criterion);
      });
      
      // Send to backend
      const rubricId = currentRubricData.rubric.rubric_id;
      const response = await fetch(`/api/uploads/rubric/${rubricId}/update`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ criteria: updatedCriteria })
      });
      
      if (!response.ok) {
        throw new Error('Failed to save rubric');
      }
      
      const result = await response.json();
      console.log('✅ Rubric saved successfully:', result);
      
      // Exit edit mode
      isEditMode = false;
      document.getElementById('editBtn').style.display = 'block';
      document.getElementById('saveBtn').style.display = 'none';
      document.getElementById('cancelBtn').style.display = 'none';
      
      // Reload rubric to get fresh data
      await loadRubric();
      
      alert('Rubric saved successfully!');
      
    } catch (error) {
      console.error('❌ Error saving rubric:', error);
      alert('Failed to save rubric. Please try again.');
    }
  }

  /* ===== Helpers ===== */
  function td(){ const e = document.createElement('td'); return e; }
  function esc(s){ return String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
  function nl2br(s){ return s.replace(/\n/g,'<br>'); }

  /* ===== Demo data (used when API is not available, does not affect future integration) ===== */
  function demoRubric(){
    return {
      year: '2025',
      semester: '1',
      assignment: 'Assignment 1',
      due: 'Tue Sep 16, 2025 10:00',
      criteria: [
        {
          title:'Introduction: Applies theoretical framework/s to topic',
          max: 15,
          levels:{
            hd:{points:15, desc:`Articulates a compelling justification for investigating the phenomenon.
Provides a clear, comprehensive definition of all relevant key terms and constructs
Applies highly relevant theoretical framework/s to provide an insightful explanation of the impacts of caregiving on development`, scoreRange:'(12 - 15 points)'},
            d:{points:10.5, desc:`Articulates a strong justification for investigating the phenomenon.
Provides a thorough definition of all relevant key terms and constructs.
Applies relevant theoretical framework/s to explain the impacts of caregiving on development`, scoreRange:'(10.5 - 11.5 points)'},
            c:{points:9, desc:`Articulates a justification for investigating the phenomenon.
which indicates its relevance
Provides definitions for most relevant key terms and constructs.
Applies relevant theoretical framework/s to broadly explain the impacts of caregiving on development.`, scoreRange:'(9 - 10 points)'},
            p:{points:7.5, desc:`Identifies the importance of the phenomenon.
Provides broad definitions or defines some relevant key terms and constructs.
Draws a connection between caregiving and the impact on development with reference to a theoretical framework.`, scoreRange:'(7.5 - 8.5 points)'},
            f:{points:0, desc:`Provides a minimal justification for investigating the phenomenon.
Provides limited or unclear definitions of key terms and constructs.
Provides an incorrect explanation of the connection between caregiving and development with or without a reference to a theoretical framework.`, scoreRange:'(0 - 7 points)'}
          }
        },
        {
          title:'Introduction: Locates, synthesises and critically analyses literature',
          max: 10,
          levels:{
            hd:{points:15, desc:`Locates most relevant, influential, contemporary, peer-reviewed papers.
Concisely synthesizes the key findings relevant to the topic.
Critically evaluates key strengths, weaknesses and gaps in the literature.`, scoreRange:''},
            d:{points:10.5, desc:`Locates relevant, contemporary literature.
Synthesises key findings relevant to the topic.`, scoreRange:''},
            c:{points:9, desc:`Articulates a justification for investigating the phenomenon.
which indicates its relevance
Provides definitions for most relevant key terms and constructs.`, scoreRange:''},
            p:{points:7.5, desc:`Identifies the importance of the phenomenon.
Provides broad definitions or defines some relevant key terms and constructs.`, scoreRange:''},
            f:{points:0, desc:`Provides a minimal justification for investigating the phenomenon.
Provides limited or unclear definitions of key terms and constructs.`, scoreRange:''}
          }
        }
      ]
    };
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
