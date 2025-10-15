// rubric.js — Fetch backend data and render editable rubric table

// Global state
let currentData = null;
let originalData = null;
let isEditMode = false;
let gradeLevelOrder = [];
let rubricId = null;
let projectId = null;

document.addEventListener('DOMContentLoaded', () => {
  // Display username
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
  
  // Event listeners
  document.getElementById('backBtn')?.addEventListener('click', () => history.back());
  document.getElementById('editBtn')?.addEventListener('click', enterEditMode);
  document.getElementById('saveBtn')?.addEventListener('click', saveChanges);
  document.getElementById('cancelBtn')?.addEventListener('click', cancelEdit);
  document.getElementById('addRowBtn')?.addEventListener('click', openAddCriterionModal);
  document.getElementById('addColBtn')?.addEventListener('click', openAddGradeLevelModal);
  document.getElementById('deleteRowBtn')?.addEventListener('click', openDeleteCriterionModal);
  document.getElementById('deleteColBtn')?.addEventListener('click', openDeleteGradeLevelModal);
  
  // Modal event listeners
  setupModalListeners();
  
  loadRubric();
});

async function loadRubric() {
  const url = new URL(location.href);
  projectId = url.searchParams.get('project') || 'demo';

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

  try {
    // Step 1: Get latest rubric_id through project_id
    console.log('🌐 Getting latest rubric_id...');
    const rubricRes = await fetch(`/api/uploads/project/${encodeURIComponent(projectId)}/latest-rubric`);

    if (!rubricRes.ok) {
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

    const data = await detailRes.json();
    console.log('✅ Retrieved rubric detail data:', data);

    // Store data globally
    currentData = JSON.parse(JSON.stringify(data));
    originalData = JSON.parse(JSON.stringify(data));

    // Update UI
    updateRubricUI(data, metaEl, tbody);

  } catch (error) {
    console.error('❌ Loading rubric error:', error);
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
  }
}

function updateRubricUI(data, metaEl, tbody) {
  // Update meta information
  metaEl.innerHTML = `
    <div style="font-size: 16px; font-weight: 500; color: var(--text); margin-bottom: 2px;">
      Rubric ID: ${data.rubric.rubric_id} · ${data.rubric.rows} Rows · ${data.rubric.columns} Columns
    </div>
    <div style="font-size: 14px; color: var(--muted); font-weight: 400;">
      Version: ${data.rubric.version} · Created: ${new Date(data.rubric.created_at).toLocaleDateString()} ·
      ${data.summary.criteria_count} Criteria, ${data.summary.grade_levels_count} Grade Levels
    </div>
  `;

  // Get all unique grade level names with their score information
  const gradeLevelMap = new Map();
  data.criteria.forEach(criterion => {
    if (criterion.grade_levels) {
      criterion.grade_levels.forEach(level => {
        if (!gradeLevelMap.has(level.level_name) || 
            gradeLevelMap.get(level.level_name).max_score < level.max_score) {
          gradeLevelMap.set(level.level_name, {
            level_name: level.level_name,
            max_score: level.max_score,
            min_score: level.min_score
          });
        }
      });
    }
  });

  // Convert to array and sort by max_score from high to low
  gradeLevelOrder = Array.from(gradeLevelMap.values())
    .sort((a, b) => b.max_score - a.max_score)
    .map(level => level.level_name);

  // Update table headers dynamically
  updateTableHeaders(gradeLevelOrder);

  // Render table
  renderTable(data, tbody);
}

function updateTableHeaders(gradeLevelOrder) {
  const table = document.getElementById('rubric-table');
  if (!table) return;

  const thead = table.querySelector('thead tr');
  if (!thead) return;

  // Clear existing grade level headers (keep first and last columns)
  const existingHeaders = thead.querySelectorAll('th');
  for (let i = existingHeaders.length - 2; i >= 1; i--) {
    thead.removeChild(existingHeaders[i]);
  }

  // Insert new grade level headers
  gradeLevelOrder.forEach((levelName, index) => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.innerHTML = `<div class="grade-header editable-header" data-type="grade-level-name" data-level-name="${esc(levelName)}">${esc(levelName)}</div>`;
    thead.insertBefore(th, thead.lastElementChild);
  });
}

function renderTable(data, tbody) {
  tbody.innerHTML = '';
  if (!data.criteria || data.criteria.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="${gradeLevelOrder.length + 2}" style="text-align: center; padding: 20px; color: var(--muted);">
          No criteria found for this rubric.
        </td>
      </tr>
    `;
    return;
  }

  data.criteria.forEach((criterion, idx) => {
    const tr = document.createElement('tr');

    // Left side criteria
    const td0 = td();
    td0.innerHTML = `
      <div class="criterion-title editable-cell" 
           contenteditable="false"
           data-type="criterion-title" 
           data-criterion-id="${criterion.criterion_id}"
           data-seq-no="${criterion.seq_no || idx + 1}">${criterion.seq_no || idx + 1}. ${esc(criterion.title)}</div>
      ${criterion.description ? `<div class="editable-cell" 
           contenteditable="false"
           data-type="criterion-description" 
           data-criterion-id="${criterion.criterion_id}"
           style="font-weight: 400; margin-top: 4px; color: var(--muted);">${esc(criterion.description)}</div>` : `<div class="editable-cell" 
           contenteditable="false"
           data-type="criterion-description" 
           data-criterion-id="${criterion.criterion_id}"
           style="font-weight: 400; margin-top: 4px; color: var(--muted);">(No description)</div>`}
    `;
    tr.appendChild(td0);

    // Render columns based on dynamically determined grade levels
    gradeLevelOrder.forEach(levelName => {
      const level = criterion.grade_levels?.find(l => l.level_name === levelName);
      const cell = td();

      if (level) {
        // Display score range
        let rangeHtml = '';
        if (level.min_score !== undefined && level.max_score !== undefined) {
          rangeHtml = `<div class="badge editable-cell" 
                           contenteditable="false"
                           data-type="grade-level-scores" 
                           data-grade-level-id="${level.grade_level_id}"
                           data-min-score="${level.min_score}"
                           data-max-score="${level.max_score}">${level.min_score} - ${level.max_score}</div>`;
        }
        
        // Display description
        let descHtml = '';
        if (level.description) {
          descHtml = `<div class="editable-cell" 
                          contenteditable="false"
                          data-type="grade-level-description" 
                          data-grade-level-id="${level.grade_level_id}">${nl2br(esc(level.description))}</div>`;
        } else {
          descHtml = `<div class="editable-cell" 
                          contenteditable="false"
                          data-type="grade-level-description" 
                          data-grade-level-id="${level.grade_level_id}">(No description)</div>`;
        }
        
        cell.innerHTML = rangeHtml + descHtml;
      } else {
        cell.innerHTML = '<div style="color: var(--muted); font-style: italic;">Not defined</div>';
      }
      tr.appendChild(cell);
    });

    // Right side max score
    const tdScore = td();
    tdScore.innerHTML = `<div class="meta editable-cell" 
                             contenteditable="false"
                             data-type="criterion-max-score" 
                             data-criterion-id="${criterion.criterion_id}"
                             style="font-weight: 700;">/ ${esc(String(criterion.max_score ?? '0'))}</div>`;
    tr.appendChild(tdScore);

    tbody.appendChild(tr);
  });
}

function enterEditMode() {
  if (isEditMode) return;
  
  isEditMode = true;
  console.log('📝 Entering edit mode');
  
  // Toggle button visibility
  document.getElementById('editBtn').style.display = 'none';
  document.getElementById('saveBtn').style.display = 'inline-block';
  document.getElementById('cancelBtn').style.display = 'inline-block';
  document.getElementById('controlButtons').style.display = 'flex';
  
  // Make cells editable
  const editableCells = document.querySelectorAll('.editable-cell, .editable-header');
  editableCells.forEach(cell => {
    cell.contentEditable = 'true';
    cell.style.cursor = 'text';
  });
  
  // Add edit-mode class
  document.querySelector('.panel').classList.add('edit-mode');
}

function cancelEdit() {
  if (!isEditMode) return;
  
  console.log('❌ Canceling edit mode');
  
  // Reload original data
  const metaEl = document.getElementById('rubric-meta');
  const tbody = document.getElementById('rubric-body');
  updateRubricUI(originalData, metaEl, tbody);
  
  exitEditMode();
}

function exitEditMode() {
  isEditMode = false;
  
  // Toggle button visibility
  document.getElementById('editBtn').style.display = 'inline-block';
  document.getElementById('saveBtn').style.display = 'none';
  document.getElementById('cancelBtn').style.display = 'none';
  document.getElementById('controlButtons').style.display = 'none';
  
  // Make cells non-editable
  const editableCells = document.querySelectorAll('.editable-cell, .editable-header');
  editableCells.forEach(cell => {
    cell.contentEditable = 'false';
    cell.style.cursor = '';
  });
  
  // Remove edit-mode class
  document.querySelector('.panel')?.classList.remove('edit-mode');
}

async function saveChanges() {
  if (!isEditMode) return;
  
  console.log('💾 Saving changes...');
  
  const changes = [];
  const editableCells = document.querySelectorAll('.editable-cell, .editable-header');
  
  // Collect all changes
  editableCells.forEach(cell => {
    const type = cell.getAttribute('data-type');
    const content = cell.textContent.trim();
    
    if (type === 'criterion-title') {
      const criterionId = cell.getAttribute('data-criterion-id');
      const seqNo = cell.getAttribute('data-seq-no');
      const originalTitle = `${seqNo}. ` + originalData.criteria.find(c => c.criterion_id == criterionId)?.title;
      
      // Extract title without sequence number
      const newTitle = content.replace(/^\d+\.\s*/, '');
      const oldTitle = originalTitle.replace(/^\d+\.\s*/, '');
      
      if (newTitle !== oldTitle) {
        changes.push({
          type: 'criterion-title',
          criterionId: criterionId,
          value: newTitle,
          original: oldTitle
        });
      }
    }
    else if (type === 'criterion-description') {
      const criterionId = cell.getAttribute('data-criterion-id');
      const original = originalData.criteria.find(c => c.criterion_id == criterionId)?.description || '(No description)';
      
      if (content !== original && content !== '(No description)') {
        changes.push({
          type: 'criterion-description',
          criterionId: criterionId,
          value: content === '(No description)' ? '' : content,
          original: original
        });
      }
    }
    else if (type === 'criterion-max-score') {
      const criterionId = cell.getAttribute('data-criterion-id');
      const scoreMatch = content.match(/\/\s*(\d+(?:\.\d+)?)/);
      
      if (scoreMatch) {
        const newScore = parseFloat(scoreMatch[1]);
        const original = originalData.criteria.find(c => c.criterion_id == criterionId)?.max_score;
        
        if (newScore !== original) {
          changes.push({
            type: 'criterion-max-score',
            criterionId: criterionId,
            value: newScore,
            original: original
          });
        }
      }
    }
    else if (type === 'grade-level-scores') {
      const gradeLevelId = cell.getAttribute('data-grade-level-id');
      const scoreMatch = content.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
      
      if (scoreMatch) {
        const newMinScore = parseFloat(scoreMatch[1]);
        const newMaxScore = parseFloat(scoreMatch[2]);
        const originalMinScore = parseFloat(cell.getAttribute('data-min-score'));
        const originalMaxScore = parseFloat(cell.getAttribute('data-max-score'));
        
        if (newMinScore !== originalMinScore || newMaxScore !== originalMaxScore) {
          changes.push({
            type: 'grade-level-scores',
            gradeLevelId: gradeLevelId,
            minScore: newMinScore,
            maxScore: newMaxScore,
            original: { min: originalMinScore, max: originalMaxScore }
          });
        }
      }
    }
    else if (type === 'grade-level-description') {
      const gradeLevelId = cell.getAttribute('data-grade-level-id');
      // Find original description
      let originalDesc = '(No description)';
      for (const criterion of originalData.criteria) {
        const level = criterion.grade_levels?.find(l => l.grade_level_id == gradeLevelId);
        if (level) {
          originalDesc = level.description || '(No description)';
          break;
        }
      }
      
      if (content !== originalDesc && content !== '(No description)') {
        const newDesc = content === '(No description)' ? '' : content;
        
        // ⭐ 检测 description 中的分数范围 (min - max)
        const scoreRangeMatch = newDesc.match(/\(?\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(?:分|points?)?\s*\)?/i);
        
        if (scoreRangeMatch) {
          const detectedMin = parseFloat(scoreRangeMatch[1]);
          const detectedMax = parseFloat(scoreRangeMatch[2]);
          
          console.log(`🔍 Detected score range in description: ${detectedMin} - ${detectedMax}`);
          
          // 添加自动更新分数范围的change
          changes.push({
            type: 'grade-level-scores-from-description',
            gradeLevelId: gradeLevelId,
            minScore: detectedMin,
            maxScore: detectedMax,
            description: newDesc,
            original: originalDesc
          });
        } else {
          // 没有检测到分数范围，只更新description
          changes.push({
            type: 'grade-level-description',
            gradeLevelId: gradeLevelId,
            value: newDesc,
            original: originalDesc
          });
        }
      }
    }
  });
  
  console.log('📋 Changes detected:', changes);
  
  if (changes.length === 0) {
    alert('No changes detected.');
    exitEditMode();
    return;
  }
  
  // Save all changes
  let successCount = 0;
  let errorCount = 0;
  
  for (const change of changes) {
    try {
      if (change.type === 'criterion-title') {
        await fetch(`/api/uploads/rubric/criterion/${change.criterionId}/title`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: change.value })
        });
        console.log(`✅ Updated criterion title: ${change.criterionId}`);
        successCount++;
      }
      else if (change.type === 'criterion-description') {
        await fetch(`/api/uploads/rubric/criterion/${change.criterionId}/description`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: change.value })
        });
        console.log(`✅ Updated criterion description: ${change.criterionId}`);
        successCount++;
      }
      else if (change.type === 'criterion-max-score') {
        await fetch(`/api/uploads/rubric/criterion/${change.criterionId}/max-score`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ max_score: change.value })
        });
        console.log(`✅ Updated criterion max score: ${change.criterionId}`);
        successCount++;
      }
      else if (change.type === 'grade-level-scores') {
        await fetch(`/api/uploads/rubric/grade-level/${change.gradeLevelId}/scores`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            min_score: change.minScore,
            max_score: change.maxScore
          })
        });
        console.log(`✅ Updated grade level scores: ${change.gradeLevelId}`);
        successCount++;
      }
      else if (change.type === 'grade-level-scores-from-description') {
        // ⭐ 从description检测到分数范围，同时更新scores和description
        const response = await fetch(`/api/uploads/rubric/grade-level/${change.gradeLevelId}/description`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: change.description })
        });
        
        const result = await response.json();
        
        // 后端会自动解析并更新分数
        if (result.score_update) {
          console.log(`✅ Updated grade level description AND auto-updated scores from description: ${change.gradeLevelId}`);
          console.log(`   Scores: ${result.score_update.updated.min_score} - ${result.score_update.updated.max_score}`);
        } else {
          console.log(`✅ Updated grade level description: ${change.gradeLevelId}`);
        }
        successCount++;
      }
      else if (change.type === 'grade-level-description') {
        await fetch(`/api/uploads/rubric/grade-level/${change.gradeLevelId}/description`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: change.value })
        });
        console.log(`✅ Updated grade level description: ${change.gradeLevelId}`);
        successCount++;
      }
    } catch (error) {
      console.error(`❌ Failed to save change:`, change, error);
      errorCount++;
    }
  }
  
  // Show result
  if (errorCount === 0) {
    alert(`✅ All changes saved successfully! (${successCount} updates)`);
  } else {
    alert(`⚠️ Saved with errors: ${successCount} succeeded, ${errorCount} failed. Check console for details.`);
  }
  
  // Reload data
  await loadRubric();
  exitEditMode();
}

// ===== Modal Functions =====

function setupModalListeners() {
  // Add Criterion Modal
  document.getElementById('closeCriterionModal')?.addEventListener('click', closeAddCriterionModal);
  document.getElementById('cancelCriterionModal')?.addEventListener('click', closeAddCriterionModal);
  document.getElementById('confirmAddCriterion')?.addEventListener('click', confirmAddCriterion);
  
  // Add Grade Level Modal
  document.getElementById('closeGradeLevelModal')?.addEventListener('click', closeAddGradeLevelModal);
  document.getElementById('cancelGradeLevelModal')?.addEventListener('click', closeAddGradeLevelModal);
  document.getElementById('confirmAddGradeLevel')?.addEventListener('click', confirmAddGradeLevel);
  
  // Delete Criterion Modal
  document.getElementById('closeDeleteCriterionModal')?.addEventListener('click', closeDeleteCriterionModal);
  document.getElementById('cancelDeleteCriterion')?.addEventListener('click', closeDeleteCriterionModal);
  document.getElementById('confirmDeleteCriterion')?.addEventListener('click', confirmDeleteCriterion);
  
  // Delete Grade Level Modal
  document.getElementById('closeDeleteGradeLevelModal')?.addEventListener('click', closeDeleteGradeLevelModal);
  document.getElementById('cancelDeleteGradeLevel')?.addEventListener('click', closeDeleteGradeLevelModal);
  document.getElementById('confirmDeleteGradeLevel')?.addEventListener('click', confirmDeleteGradeLevel);
  
  // Close modals when clicking overlay
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('show');
      }
    });
  });
}

// Add Criterion Modal
function openAddCriterionModal() {
  document.getElementById('criterionTitle').value = '';
  document.getElementById('criterionDescription').value = '';
  document.getElementById('criterionMaxScore').value = '0';
  document.getElementById('addCriterionModal').classList.add('show');
}

function closeAddCriterionModal() {
  document.getElementById('addCriterionModal').classList.remove('show');
}

async function confirmAddCriterion() {
  if (!rubricId) {
    alert('❌ Error: Rubric ID not found');
    return;
  }
  
  const title = document.getElementById('criterionTitle').value.trim();
  const description = document.getElementById('criterionDescription').value.trim();
  const maxScore = parseFloat(document.getElementById('criterionMaxScore').value);
  
  if (!title) {
    alert('❌ Please enter a criterion title');
    return;
  }
  
  if (isNaN(maxScore) || maxScore < 0) {
    alert('❌ Please enter a valid max score (non-negative number)');
    return;
  }
  
  try {
    console.log(`➕ Adding new criterion: ${title}`);
    
    const response = await fetch(`/api/uploads/rubric/${rubricId}/add-criterion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title,
        description: description || null,
        max_score: maxScore
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add criterion');
    }
    
    const result = await response.json();
    console.log('✅ Criterion added:', result);
    
    closeAddCriterionModal();
    alert(`✅ Successfully added new criterion!\n\nCriterion: ${result.criterion.title}\nMax Score: ${result.criterion.max_score}\nGrade Levels Created: ${result.criterion.grade_levels.length}\nNew Row Count: ${result.rubric_updated.new_row_count}`);
    
    // Reload rubric data
    await loadRubric();
    
  } catch (error) {
    console.error('❌ Failed to add criterion:', error);
    alert(`❌ Failed to add criterion: ${error.message}`);
  }
}

// Add Grade Level Modal
function openAddGradeLevelModal() {
  document.getElementById('gradeLevelName').value = '';
  document.getElementById('gradeLevelMinScore').value = '0';
  document.getElementById('gradeLevelMaxScore').value = '0';
  document.getElementById('addGradeLevelModal').classList.add('show');
}

function closeAddGradeLevelModal() {
  document.getElementById('addGradeLevelModal').classList.remove('show');
}

async function confirmAddGradeLevel() {
  if (!rubricId) {
    alert('❌ Error: Rubric ID not found');
    return;
  }
  
  const levelName = document.getElementById('gradeLevelName').value.trim();
  const minScore = parseFloat(document.getElementById('gradeLevelMinScore').value);
  const maxScore = parseFloat(document.getElementById('gradeLevelMaxScore').value);
  
  if (!levelName) {
    alert('❌ Please enter a level name');
    return;
  }
  
  if (isNaN(minScore) || isNaN(maxScore)) {
    alert('❌ Please enter valid scores');
    return;
  }
  
  if (minScore < 0 || maxScore < 0) {
    alert('❌ Scores must be non-negative');
    return;
  }
  
  if (minScore > maxScore) {
    alert('❌ Minimum score cannot be greater than maximum score');
    return;
  }
  
  try {
    console.log(`➕ Adding new grade level: ${levelName}`);
    
    const response = await fetch(`/api/uploads/rubric/${rubricId}/add-grade-level`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level_name: levelName,
        min_score: minScore,
        max_score: maxScore
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add grade level');
    }
    
    const result = await response.json();
    console.log('✅ Grade level added:', result);
    
    closeAddGradeLevelModal();
    alert(`✅ Successfully added new grade level!\n\nLevel Name: ${result.grade_level.level_name}\nScore Range: ${result.grade_level.min_score} - ${result.grade_level.max_score}\nEntries Created: ${result.grade_level.entries_created.length}\nNew Column Count: ${result.rubric_updated.new_column_count}`);
    
    // Reload rubric data
    await loadRubric();
    
  } catch (error) {
    console.error('❌ Failed to add grade level:', error);
    alert(`❌ Failed to add grade level: ${error.message}`);
  }
}

// Delete Criterion Modal
function openDeleteCriterionModal() {
  const select = document.getElementById('criterionToDelete');
  select.innerHTML = '<option value="">-- Select a criterion --</option>';
  
  if (currentData && currentData.criteria) {
    currentData.criteria.forEach(criterion => {
      const option = document.createElement('option');
      option.value = criterion.criterion_id;
      option.textContent = `${criterion.seq_no}. ${criterion.title} (Max: ${criterion.max_score})`;
      select.appendChild(option);
    });
  }
  
  document.getElementById('deleteCriterionModal').classList.add('show');
}

function closeDeleteCriterionModal() {
  document.getElementById('deleteCriterionModal').classList.remove('show');
}

async function confirmDeleteCriterion() {
  const criterionId = document.getElementById('criterionToDelete').value;
  
  if (!criterionId) {
    alert('❌ Please select a criterion to delete');
    return;
  }
  
  const criterion = currentData.criteria.find(c => c.criterion_id == criterionId);
  const confirmMsg = `⚠️ Are you sure you want to delete this criterion?\n\n"${criterion.title}"\n\nThis will permanently delete all grade level data for this criterion.`;
  
  if (!confirm(confirmMsg)) {
    return;
  }
  
  try {
    console.log(`🗑️ Deleting criterion: ${criterionId}`);
    
    const response = await fetch(`/api/uploads/rubric/criterion/${criterionId}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete criterion');
    }
    
    const result = await response.json();
    console.log('✅ Criterion deleted:', result);
    
    closeDeleteCriterionModal();
    alert(`✅ Successfully deleted criterion!\n\nDeleted: ${result.deleted.title}\nGrade Levels Deleted: ${result.deleted.grade_levels_deleted}\nNew Row Count: ${result.rubric_updated.new_row_count}`);
    
    // Reload rubric data
    await loadRubric();
    
  } catch (error) {
    console.error('❌ Failed to delete criterion:', error);
    alert(`❌ Failed to delete criterion: ${error.message}`);
  }
}

// Delete Grade Level Modal
function openDeleteGradeLevelModal() {
  const select = document.getElementById('gradeLevelToDelete');
  select.innerHTML = '<option value="">-- Select a grade level --</option>';
  
  if (gradeLevelOrder && gradeLevelOrder.length > 0) {
    gradeLevelOrder.forEach(levelName => {
      const option = document.createElement('option');
      option.value = levelName;
      option.textContent = levelName;
      select.appendChild(option);
    });
  }
  
  document.getElementById('deleteGradeLevelModal').classList.add('show');
}

function closeDeleteGradeLevelModal() {
  document.getElementById('deleteGradeLevelModal').classList.remove('show');
}

async function confirmDeleteGradeLevel() {
  const levelName = document.getElementById('gradeLevelToDelete').value;
  
  if (!levelName) {
    alert('❌ Please select a grade level to delete');
    return;
  }
  
  const confirmMsg = `⚠️ Are you sure you want to delete this grade level?\n\n"${levelName}"\n\nThis will permanently delete all entries for this grade level across all criteria.`;
  
  if (!confirm(confirmMsg)) {
    return;
  }
  
  try {
    console.log(`🗑️ Deleting grade level: ${levelName}`);
    
    const response = await fetch(`/api/uploads/rubric/${rubricId}/grade-level/${encodeURIComponent(levelName)}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete grade level');
    }
    
    const result = await response.json();
    console.log('✅ Grade level deleted:', result);
    
    closeDeleteGradeLevelModal();
    alert(`✅ Successfully deleted grade level!\n\nDeleted: ${result.deleted.level_name}\nEntries Deleted: ${result.deleted.entries_deleted}\nNew Column Count: ${result.rubric_updated.new_column_count}`);
    
    // Reload rubric data
    await loadRubric();
    
  } catch (error) {
    console.error('❌ Failed to delete grade level:', error);
    alert(`❌ Failed to delete grade level: ${error.message}`);
  }
}

/* ===== Helpers ===== */
function td() { 
  const e = document.createElement('td'); 
  return e; 
}

function esc(s) { 
  return String(s).replace(/[&<>"']/g, m => ({ 
    '&': '&amp;', 
    '<': '&lt;', 
    '>': '&gt;', 
    '"': '&quot;', 
    "'": '&#39;' 
  }[m])); 
}

function nl2br(s) { 
  return s.replace(/\n/g, '<br>'); 
}

// Dropdown and logout functionality
const accountEl = document.querySelector('.account');
const dropdown = document.querySelector('.dropdown-menu');
const logoutBtn = document.querySelector('.dropdown-item');

if (accountEl && dropdown) {
  accountEl.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('show');
  });

  document.addEventListener('click', () => {
    dropdown.classList.remove('show');
  });
}

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
