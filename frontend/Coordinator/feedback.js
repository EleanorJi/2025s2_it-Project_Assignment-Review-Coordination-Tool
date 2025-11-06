/* ===== Global Variables ===== */
let rows = [];
let markerKeys = [];
let markersInfo = [];
let rubricDescriptions = {}; // New: Store rubric description
let currentProjectId = null; // Store current project ID
let currentAssignmentInfo = null; // Store current assignment information
let currentRubricInfo = null; // Store current rubric information
let currentRubricData = null; // Store detailed rubric data
let deviationPercent = 5.0; // Current deviation percentage (default 5%)

console.log('📊 Feedback.js v2.6 loaded - adjustable deviation percentage');

/* ===== Helper Functions ===== */
// Get current assignment ID
function getCurrentAssignmentId() {
  // Get directly from global variable, ensuring it's correctly set during initialization
  if (window.currentAssignmentId) {
    return window.currentAssignmentId;
  }

  // Fallback: Get from localStorage
  const stored = localStorage.getItem('currentAssignmentId');
  if (stored && /^\d+$/.test(String(stored))) {
    return parseInt(stored);
  }

  console.warn('⚠️ Unable to get currentAssignmentId');
  return null;
}

// Debug function: Display current state
function debugCurrentState() {
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get('project');
  const assignmentKey = urlParams.get('assignment');
  const assignmentId = getCurrentAssignmentId();

  console.log('🔍 Debug - Current State:');
  console.log('  Project ID:', projectId);
  console.log('  Assignment Key:', assignmentKey);
  console.log('  Assignment ID:', assignmentId);
  console.log('  Window currentAssignmentId:', window.currentAssignmentId);
  console.log('  LocalStorage currentAssignmentId:', localStorage.getItem('currentAssignmentId'));
}


// Get current user ID
function getCurrentUserId() {
  // Get user info from localStorage
  const userInfo = localStorage.getItem('userInfo');
  if (userInfo) {
    try {
      const user = JSON.parse(userInfo);
      return user.user_id || user.id;
    } catch (e) {
      console.error('Error parsing user info:', e);
    }
  }

  // Or get from global variable
  if (window.currentUserId) {
    return window.currentUserId;
  }

  // Fallback: Read userId from cookie (set by backend auth middleware)
  try {
    const cookieStr = document.cookie || '';
    const match = cookieStr.match(/(?:^|;\s*)userId=([^;]+)/);
    if (match) {
      const id = parseInt(decodeURIComponent(match[1]));
      if (!Number.isNaN(id)) return id;
    }
  } catch (_) {}

  // Temporary fix: Use default coordinator ID
  console.warn('⚠️ No user info found, using default coordinator ID: 1');
  return 1; // Default to admin user as coordinator
}

// DOM Elements
const alignBody   = document.querySelector('#alignmentTable tbody');
const alignHeader = document.getElementById('alignHeader');
const diffSection = document.getElementById('diffSection');
const diffBody    = document.querySelector('#differenceTable tbody');
const diffHeader  = document.getElementById('diffHeader');
const markerSelect= document.getElementById('markerSelect');
const allDiffSection = document.getElementById('allDiffSection');
const allDiffHeader  = document.getElementById('allDiffHeader');
const allDiffBody    = document.querySelector('#allDifferenceTable tbody');

/* ===== Utility Functions ===== */
function fmt(n){ const v=Number(n); if(Number.isNaN(v)) return ''; return (v%1===0)? v.toString() : v.toFixed(2); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function isOut(v, lo, hi){ return v<lo || v>hi; }

/**
 * Generate score display with grade level badge
 * @param {number} score - Score value
 * @param {string|null} levelName - Grade level name
 * @param {string|null} levelDescription - Grade level description
 * @param {boolean} showGradeLevel - Whether to show grade level badge (default true)
 * @param {string} cellClass - Cell color class ('good-cell', 'warning-cell', 'bad-cell', etc.)
 * @returns {string} - HTML string
 */
function formatScoreWithGradeLevel(score, levelName, levelDescription, showGradeLevel = true, cellClass = '') {
  const scoreHtml = fmt(score);
  
  // If not showing grade level or no levelName, return only score
  if (!showGradeLevel || !levelName) {
    return scoreHtml;
  }
  
  const escapedLevelName = escapeHtml(levelName);
  const escapedDescription = levelDescription ? escapeHtml(levelDescription) : '';
  
  // If description exists, display in data-description
  const dataDesc = escapedDescription ? `data-description="${escapedLevelName}: ${escapedDescription}"` : '';
  
  // Set badge color based on cellClass
  let badgeStyle = 'font-size:11px;padding:2px 6px;border-radius:4px;cursor:help;font-weight:600;border:1px solid;position:relative;';
  
  if (cellClass === 'bad-cell') {
    badgeStyle += 'background:#FEF2F2;color:#DC2626;border-color:#FCA5A5;';
  } else if (cellClass === 'warning-cell') {
    badgeStyle += 'background:#FEF3C7;color:#D97706;border-color:#FCD34D;';
  } else if (cellClass === 'good-cell') {
    badgeStyle += 'background:#ECFDF5;color:#16a34a;border-color:#86EFAC;';
  } else {
    badgeStyle += 'background:#f0f0f0;color:#666;border-color:#ddd;';
  }
  
  return `
    <div class="score-with-grade" style="display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;">
      <span>${scoreHtml}</span>
      <span class="grade-level-badge" 
            ${dataDesc}
            style="${badgeStyle}">
        ${escapedLevelName}
      </span>
    </div>
  `;
}

/**
 * Dynamically position tooltip to ensure it's fully visible
 */
function setupGradeLevelTooltips() {
  // Remove old event listeners to avoid duplicate bindings
  document.querySelectorAll('.grade-level-badge[data-description]').forEach(badge => {
    // Remove any existing old event listeners
    const newBadge = badge.cloneNode(true);
    badge.parentNode.replaceChild(newBadge, badge);
  });
  
  document.querySelectorAll('.grade-level-badge[data-description]').forEach(badge => {
    let tooltip = null;
    
    badge.addEventListener('mouseenter', function(e) {
      const badgeRect = this.getBoundingClientRect();
      const description = this.getAttribute('data-description');
      if (!description) return;
      
      // Create tooltip element
      tooltip = document.createElement('div');
      tooltip.className = 'grade-level-tooltip';
      tooltip.textContent = description;
      document.body.appendChild(tooltip);
      
      // Calculate tooltip dimensions first (needs to be added to DOM)
      const tooltipRect = tooltip.getBoundingClientRect();
      const tooltipWidth = tooltipRect.width;
      const tooltipHeight = tooltipRect.height;
      
      // Calculate available space
      const spaceRight = window.innerWidth - badgeRect.right;
      const spaceLeft = badgeRect.left;
      const spaceTop = badgeRect.top;
      const spaceBottom = window.innerHeight - badgeRect.bottom;
      
      let left = badgeRect.right + 8;
      let top = badgeRect.top + (badgeRect.height / 2);
      let showOnLeft = false;
      
      // If right side space is insufficient, display on left
      if (spaceRight < tooltipWidth + 20 && spaceLeft > tooltipWidth + 20) {
        left = badgeRect.left - tooltipWidth - 8;
        showOnLeft = true;
        tooltip.classList.add('tooltip-left');
      }
      
      // Adjust vertical position to ensure it doesn't exceed viewport
      // Try vertical centering
      top = badgeRect.top + (badgeRect.height / 2);
      
      // If tooltip bottom exceeds viewport, adjust upward
      if (top + tooltipHeight / 2 > window.innerHeight - 10) {
        top = window.innerHeight - tooltipHeight / 2 - 10;
      }
      
      // If tooltip top exceeds viewport, adjust downward
      if (top - tooltipHeight / 2 < 10) {
        top = tooltipHeight / 2 + 10;
      }
      
      tooltip.style.left = left + 'px';
      tooltip.style.top = top + 'px';
      tooltip.style.transform = 'translateY(-50%)';
    });
    
    badge.addEventListener('mouseleave', function() {
      if (tooltip) {
        tooltip.remove();
        tooltip = null;
      }
    });
  });
}

/**
 * Get cell color class
 * @param {number} value - Marker's score
 * @param {object} row - Row data
 * @returns {string} - CSS class name
 */
function getCellClass(value, row) {
  if (value == null) return '';
  
  // For Total row, use three-level color system (warning is 50% of deviation)
  if (row.isTotal) {
    const rowDeviation = row.deviationPercent || 5.0;
    const warningPercent = rowDeviation * 0.5;
    const warningLower = Math.round((row.chair * (1 - warningPercent / 100)) * 100) / 100;
    const warningUpper = Math.round((row.chair * (1 + warningPercent / 100)) * 100) / 100;
    
    if (value >= warningLower && value <= warningUpper) {
      return 'good-cell';
    } else if (value >= row.lower && value <= row.upper) {
      return 'warning-cell';
    } else {
      return 'bad-cell';
    }
  }
  
  // For regular criterion rows, use two-level color system
  if (value >= row.lower && value <= row.upper) {
    return 'good-cell';
  } else {
    return 'bad-cell';
  }
}

/**
 * Dynamically recalculate lower and upper for all rows based on each row's deviation percentage
 */
function recalculateDeviationRanges() {
  rows.forEach(row => {
    const rowDeviation = row.deviationPercent || 5.0;
    // Dynamically calculate lower and upper
    row.lower = Math.round((row.chair * (1 - rowDeviation / 100)) * 100) / 100;
    row.upper = Math.round((row.chair * (1 + rowDeviation / 100)) * 100) / 100;
    
    // For Total row, also update warning range
    if (row.isTotal) {
      const warningPercent = rowDeviation * 0.5;
      row.warningLower = Math.round((row.chair * (1 - warningPercent / 100)) * 100) / 100;
      row.warningUpper = Math.round((row.chair * (1 + warningPercent / 100)) * 100) / 100;
    }
  });
  
  // Re-render tables
  renderAlignment(markerSelect.value);
  renderDifferences(markerSelect.value);
}

/* ===== Load Rubric Descriptions from Backend ===== */
async function loadRubricDescriptions(projectId) {
  try {
    const res = await fetch(`/api/uploads/project/${projectId}/status`);
    const data = await res.json();
    if (data?.rubric?.rubric_id) {
      const rubricRes = await fetch(`/api/uploads/rubric/${data.rubric.rubric_id}/details`);
      const rubricData = await rubricRes.json();
      
      // Save complete rubric data
      currentRubricData = rubricData;
      
      // Save rubric descriptions for display
      rubricDescriptions = {};
      (rubricData.criteria || []).forEach(c => {
        rubricDescriptions[c.title] = c.description || "";
      });
      console.log("✅ Rubric descriptions loaded:", rubricDescriptions);
      console.log("✅ Full rubric data loaded:", currentRubricData);
    }
  } catch (e) {
    console.error("Failed to load rubric descriptions:", e);
  }
}

/* ===== Get Current Project File Information ===== */
async function loadProjectFileInfo(projectId) {
  try {
    const res = await fetch(`/api/uploads/project/${projectId}/status`);
    const data = await res.json();
    
    if (data?.rubric?.file) {
      currentRubricInfo = data.rubric.file;
      console.log("✅ Rubric file info loaded:", currentRubricInfo);
    }
    
    if (data?.assignments && data.assignments.length > 0) {
      // Get current assignment information
      const assignmentId = getCurrentAssignmentId();
      if (assignmentId) {
        const assignment = data.assignments.find(a => a.assignment_id === assignmentId);
        if (assignment?.file) {
          currentAssignmentInfo = assignment.file;
          console.log("✅ Assignment file info loaded:", currentAssignmentInfo);
        }
      }
    }
  } catch (e) {
    console.error("Failed to load project file information:", e);
  }
}

/* ===== Generate Excel File ===== */
function generateExcelFromRubric(rubricData) {
  // Create new workbook
  const wb = XLSX.utils.book_new();
  
  // Prepare data
  const worksheetData = [];
  
  // Add header row - Max Score column moved to last
  const headers = ['Criterion', 'Description'];
  
  // Get all grade levels
  const allGradeLevels = [];
  rubricData.criteria.forEach(criterion => {
    criterion.grade_levels.forEach(level => {
      if (!allGradeLevels.find(gl => gl.level_name === level.level_name)) {
        allGradeLevels.push({
          level_name: level.level_name,
          min_score: level.min_score,
          max_score: level.max_score,
          seq_no: level.seq_no
        });
      }
    });
  });
  
  // Sort by seq_no
  allGradeLevels.sort((a, b) => a.seq_no - b.seq_no);
  
  // Add grade level column headers
  allGradeLevels.forEach(level => {
    headers.push(`${level.level_name} (${level.min_score}-${level.max_score})`);
  });
  
  // Add Criteria Score column header (at the end)
  headers.push('Criteria Score');
  
  worksheetData.push(headers);
  
  // Add data for each criterion
  rubricData.criteria.forEach(criterion => {
    const row = [
      criterion.title,
      criterion.description || ''
    ];
    
    // Add description for each grade level
    allGradeLevels.forEach(level => {
      const gradeLevel = criterion.grade_levels.find(gl => gl.level_name === level.level_name);
      row.push(gradeLevel ? gradeLevel.description : '');
    });
    
    // Add Criteria Score (at the end, with "/" prefix)
    row.push(`/${criterion.max_score}`);
    
    worksheetData.push(row);
  });
  
  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet(worksheetData);
  
  // Set column widths
  const colWidths = [
    { wch: 20 }, // Criterion
    { wch: 30 }, // Description
  ];
  
  // Set width for grade level columns
  allGradeLevels.forEach(() => {
    colWidths.push({ wch: 25 });
  });
  
  // Set width for Criteria Score column
  colWidths.push({ wch: 15 }); // Criteria Score
  
  ws['!cols'] = colWidths;
  
  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Rubric');
  
  // Generate Excel file
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  
  return excelBuffer;
}

/* ===== Download Excel File ===== */
function downloadExcelFile(excelBuffer, filename) {
  const blob = new Blob([excelBuffer], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
  });
  
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

/* ===== Load Moderation Report from Backend ===== */
async function loadModerationReport(assignmentId) {
  console.log('📥 Loading moderation report for assignment:', assignmentId);
  try {
    const res = await fetch(`/api/uploads/assignments/${assignmentId}/moderation-report`);
    
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    
    const data = await res.json();
    console.log('📥 Moderation report response:', data);
    
    if (data.error) {
      console.error("Failed to load report:", data.error);
      if (alignBody) {
        alignBody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:20px;color:var(--bad);">
          ❌ ${'Failed to load moderation report, no data available.'}
        </td></tr>`;
      }
      return;
    }
    
    if (!data.criteria || !Array.isArray(data.criteria)) {
      console.error("Invalid data format: criteria is missing or not an array");
      if (alignBody) {
        alignBody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:20px;color:var(--bad);">
          ❌ Invalid data format received from server
        </td></tr>`;
      }
      return;
    }

    markersInfo = data.totals.marker_totals.map(m => ({
      id: m.marker_id,
      name: m.marker_name || `Marker ${m.marker_id}`
    }));
    markerKeys = markersInfo.map(m => m.id);
    console.log('👥 Markers info:', markersInfo);

    rows = data.criteria.map(c => {
      const markersObj = {};
      const markerCommentsObj = {}; // Store marker comments
      const markerGradeLevelsObj = {}; // Store marker's grade level information
      (c.marker_scores || []).forEach(ms => {
        markersObj[ms.marker_id] = ms.score;
        // Store marker's comment
        if (ms.comment) {
          markerCommentsObj[ms.marker_id] = ms.comment;
        }
        // Store marker's grade level information
        if (ms.level_name) {
          markerGradeLevelsObj[ms.marker_id] = {
            level_name: ms.level_name,
            level_description: ms.level_description || ''
          };
        }
      });
      return {
        criterion: `${c.title} / ${c.max_score}`,
        title: c.title,
        chair: c.baseline_score, // ⚡ Coordinator's score, extracted from backend baseline_score
        chairComment: c.baseline_comment || '', // Add baseline comment
        chairLevelName: c.baseline_level_name || null, // Coordinator score's grade level name
        chairLevelDescription: c.baseline_level_description || null, // Coordinator score's grade level description
        lower: c.range_lower,
        upper: c.range_upper,
        percent: c.baseline_percentage,
        maxScore: c.max_score, // Store criterion's total score
        markers: markersObj,
        markerComments: markerCommentsObj, // Add marker comments
        markerGradeLevels: markerGradeLevelsObj, // Add marker grade levels
        description: rubricDescriptions[c.title] || "",
        total: null,
        deviationPercent: c.deviation_percent || 5.0, // Get deviation_percent from API
        criterion_id: c.criterion_id // Store criterion_id for saving deviation
      };
    });

    // Add total row (Note: Total row uses deviation_percent from assignment table)
    const totals = data.totals;
    const totalMarkersObj = {};
    (totals.marker_totals || []).forEach(mt => {
      totalMarkersObj[mt.marker_id] = mt.total;
    });
    rows.push({
      criterion: "Total / " + totals.max_total_score,
      chair: totals.baseline_total, // ⚡ Coordinator's total score, extracted from backend baseline_total
      lower: totals.range_lower, // range for Total row (based on total_deviation_percent)
      upper: totals.range_upper, // range for Total row (based on total_deviation_percent)
      warningLower: totals.warning_lower, // warning range for Total row (50% of total_deviation_percent)
      warningUpper: totals.warning_upper, // warning range for Total row (50% of total_deviation_percent)
      percent: totals.baseline_percentage,
      maxScore: totals.max_total_score, // Store total score
      markers: totalMarkersObj,
      markerComments: {}, // Total row has no comments
      description: "",
      total: null,
      isTotal: true, // Mark this as total row
      deviationPercent: totals.deviation_percent || 5.0 // Get total's deviation_percent from API
    });

    // First recalculate ranges and colors based on each row's deviation percentage
    console.log('📊 Recalculating deviation ranges and updating selectors');
    recalculateDeviationRanges();
    updateMarkerSelectors();
    
    // Restore scroll position (after all content is loaded)
    setTimeout(restoreScrollPosition, 100);

  } catch (err) {
    console.error("Error getting moderation report:", err);
    // Display error message to user
    if (alignBody) {
      alignBody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:20px;color:var(--bad);">
        ❌ Failed to load moderation report: ${'No data available.'}
      </td></tr>`;
    }
  }
}

/* ===== Alignment Table ===== */
function renderAlignment(selected='all'){
  console.log('🎨 renderAlignment called, selected:', selected, 'rows:', rows.length);
  let headers = ["Criterion","Unit Chair","Deviation %","Range Lower","Range Upper"];
  if(selected==='all'){
    headers = headers.concat(markerKeys.map(id=>{
      const m = markersInfo.find(mi=>mi.id===id);
      return m ? m.name : `Marker ${id}`;
    }));
    // All Markers view: Don't add Total and Comment columns
  } else {
    const m = markersInfo.find(mi=>mi.id==selected);
    headers.push(m ? m.name : `Marker ${selected}`);
    // Single marker view: Only add Comment column, don't add Total column
    headers.push('Comment');
  }
  
  if (!alignHeader) {
    console.error('❌ alignHeader not found!');
    return;
  }
  if (!alignBody) {
    console.error('❌ alignBody not found!');
    return;
  }
  
  alignHeader.innerHTML = headers.map(h=>`<th>${h}</th>`).join('');

  alignBody.innerHTML='';
  
  if (!rows || rows.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = `<td colspan="${headers.length}" style="text-align:center;padding:20px;color:var(--muted);">
      No data available. Please ensure the assignment has been marked.
    </td>`;
    alignBody.appendChild(emptyRow);
    return;
  }
  
  rows.forEach((r,index)=>{
    const deviationPercent = r.deviationPercent || 5.0;
    
    // Process description, remove duplicate title part
    let displayDescription = r.description || "";
    if (displayDescription && r.title) {
      // If description starts with title, remove title part
      const titleTrimmed = r.title.trim();
      if (displayDescription.trim().startsWith(titleTrimmed)) {
        displayDescription = displayDescription.trim().substring(titleTrimmed.length).trim();
        // If it starts with punctuation after removal, also remove it
        if (displayDescription.match(/^[:\-\s]/)) {
          displayDescription = displayDescription.replace(/^[:\-\s]+/, '').trim();
        }
      }
    }
    
    // Only show grade level badge in single marker view, not in All Markers view
    const showGradeLevel = selected !== 'all';
    
    // Coordinator's grade level badge stays gray (don't pass cellClass, use default gray)
    const tds = [
      `<td style="text-align:left"><div>${escapeHtml(r.criterion)}</div>${displayDescription ? `<div style="font-size:12px;color:#666;">${escapeHtml(displayDescription)}</div>` : ''}</td>`,
      `<td>${formatScoreWithGradeLevel(r.chair, r.chairLevelName, r.chairLevelDescription, showGradeLevel, '')}</td>`,
      `<td><input type="number" class="deviation-input-row" value="${deviationPercent}" min="0" max="50" step="0.1" data-row-index="${index}" /></td>`,
      `<td>${fmt(r.lower)}</td>`,
      `<td>${fmt(r.upper)}</td>`
    ];
    if(selected==='all'){
      markerKeys.forEach(id=>{
        const v=r.markers?.[id];
        if(v==null) tds.push('<td class="muted">–</td>');
        else {
          // All Markers view: Don't show grade level badge
          tds.push(`<td class="${getCellClass(v, r)}">${fmt(v)}</td>`);
        }
      });
      // All Markers view: Don't add Total and Comment columns
    } else {
      const v=r.markers?.[selected];
      if(v==null) tds.push('<td class="muted">–</td>');
      else {
        // Single marker view: Show grade level badge, color synchronized with cell color
        const gradeLevel = r.markerGradeLevels?.[selected];
        const cellClass = getCellClass(v, r);
        const cellContent = formatScoreWithGradeLevel(v, gradeLevel?.level_name, gradeLevel?.level_description, true, cellClass);
        tds.push(`<td class="${cellClass}">${cellContent}</td>`);
      }

      // Single marker view: Only add Comment column, don't add Total column
      const comment = r.markerComments?.[selected] || '';
      tds.push(`<td style="text-align:left;max-width:200px;word-wrap:break-word;">${comment ? escapeHtml(comment) : '<span class="muted">—</span>'}</td>`);
    }

    const tr=document.createElement('tr'); tr.innerHTML=tds.join(''); alignBody.appendChild(tr);
  });
  
  // Setup tooltip event listeners
  setTimeout(setupGradeLevelTooltips, 0);
}

/* ===== Difference Table (supports all and single marker) ===== */
function renderDifferences(selected='all'){
  if (!allDiffSection || !diffSection || !allDiffHeader || !allDiffBody || !diffHeader || !diffBody) {
    console.error('❌ Difference table elements not found!');
    return;
  }
  
  allDiffSection.classList.add('hidden');
  diffSection.classList.add('hidden');
  allDiffHeader.innerHTML=''; if (allDiffBody) allDiffBody.innerHTML='';
  diffHeader.innerHTML=''; if (diffBody) diffBody.innerHTML='';

  if (selected === 'all') {
    allDiffSection.classList.remove('hidden');
    const headers = ['Criterion','Unit Chair'];
    markerKeys.forEach(id=>{
      const m = markersInfo.find(mi=>mi.id===id);
      headers.push('Difference');
      headers.push(m ? m.name : `Marker ${id}`);
      headers.push('Percent');
    });
    allDiffHeader.innerHTML = headers.map(h=>`<th>${h}</th>`).join('');

    if (!rows || rows.length === 0) {
      const emptyRow = document.createElement('tr');
      emptyRow.innerHTML = `<td colspan="${headers.length}" style="text-align:center;padding:20px;color:var(--muted);">
        No data available. Please ensure the assignment has been marked.
      </td>`;
      allDiffBody.appendChild(emptyRow);
      return;
    }

    rows.forEach(r=>{
      // Process description, remove duplicate title part
      let displayDescription = r.description || "";
      if (displayDescription && r.title) {
        const titleTrimmed = r.title.trim();
        if (displayDescription.trim().startsWith(titleTrimmed)) {
          displayDescription = displayDescription.trim().substring(titleTrimmed.length).trim();
          if (displayDescription.match(/^[:\-\s]/)) {
            displayDescription = displayDescription.replace(/^[:\-\s]+/, '').trim();
          }
        }
      }
      
      // All Markers view: Don't show grade level badge
      const cells = [
        `<td style="text-align:left;max-width:250px;overflow:hidden;text-overflow:ellipsis"><div>${escapeHtml(r.criterion)}</div>${displayDescription ? `<div style="font-size:12px;color:#666;">${escapeHtml(displayDescription)}</div>` : ''}</td>`,
        `<td>${fmt(r.chair)}</td>`
      ];
      markerKeys.forEach(id=>{
        const v = r.markers?.[id]; // Marker's score
        const coordinatorScore = r.chair; // Coordinator's score (extracted from backend baseline_score)
        const maxScore = r.maxScore; // Criterion's total score
        
        // Percent = marker's score / criterion's total score * 100
        const percent = (v!=null && maxScore!=null && maxScore > 0) ? Number(((v / maxScore) * 100).toFixed(2)) : null;
        
        // Difference = marker's score - coordinator's score
        const diff = (v!=null && coordinatorScore!=null) ? Number((v - coordinatorScore).toFixed(2)) : null;
        
        // Remove red highlighting logic, no longer using bad-cell class
        // Order changed to: Difference, Marker, Percent
        // All Markers view doesn't show grade level badge
        cells.push(`<td>${diff==null?'—':fmt(diff)}</td>`);
        cells.push(`<td>${v==null?'—':fmt(v)}</td>`);
        cells.push(`<td>${percent==null?'—':fmt(percent)+'%'}</td>`);
      });
      const tr = document.createElement('tr');
      tr.innerHTML = cells.join('');
      allDiffBody.appendChild(tr);
    });
    
    // Setup tooltip event listeners
    setTimeout(setupGradeLevelTooltips, 0);
  } else {
    diffSection.classList.remove('hidden');
    const m = markersInfo.find(mi=>mi.id==selected);
    const headers = ['Criterion','Unit Chair','Difference', m ? m.name : `Marker ${selected}`,'Percent'];
    diffHeader.innerHTML = headers.map(h=>`<th>${h}</th>`).join('');

    if (!rows || rows.length === 0) {
      const emptyRow = document.createElement('tr');
      emptyRow.innerHTML = `<td colspan="${headers.length}" style="text-align:center;padding:20px;color:var(--muted);">
        No data available. Please ensure the assignment has been marked.
      </td>`;
      diffBody.appendChild(emptyRow);
      return;
    }

    rows.forEach(r=>{
      const v = r.markers?.[selected]; // Marker's score
      const coordinatorScore = r.chair; // Coordinator's score (extracted from backend baseline_score)
      const maxScore = r.maxScore; // Criterion's total score
      
      // Percent = marker's score / criterion's total score * 100
      const percent = (v!=null && maxScore!=null && maxScore > 0) ? Number(((v / maxScore) * 100).toFixed(2)) : null;
      
      // Difference = marker's score - coordinator's score
      const diff = (v!=null && coordinatorScore!=null) ? Number((v - coordinatorScore).toFixed(2)) : null;
      
      // Remove red highlighting logic, no longer using bad-cell class
      // Order changed to: Criterion, Unit Chair, Difference, Marker, Percent

      // Process description, remove duplicate title part
      let displayDescription = r.description || "";
      if (displayDescription && r.title) {
        const titleTrimmed = r.title.trim();
        if (displayDescription.trim().startsWith(titleTrimmed)) {
          displayDescription = displayDescription.trim().substring(titleTrimmed.length).trim();
          if (displayDescription.match(/^[:\-\s]/)) {
            displayDescription = displayDescription.replace(/^[:\-\s]+/, '').trim();
          }
        }
      }

      const gradeLevel = r.markerGradeLevels?.[selected];
      // All grade level badges in Difference table stay gray (don't pass cellClass)
      const cells = [
        `<td style="text-align:left;max-width:250px;overflow:hidden;text-overflow:ellipsis"><div>${escapeHtml(r.criterion)}</div>${displayDescription ? `<div style="font-size:12px;color:#666;">${escapeHtml(displayDescription)}</div>` : ''}</td>`,
        `<td>${formatScoreWithGradeLevel(coordinatorScore, r.chairLevelName, r.chairLevelDescription, true, '')}</td>`,
        `<td>${diff==null?'—':fmt(diff)}</td>`,
        `<td>${v==null?'—':formatScoreWithGradeLevel(v, gradeLevel?.level_name, gradeLevel?.level_description, true, '')}</td>`,
        `<td>${percent==null?'—':fmt(percent)+'%'}</td>`
      ];
      const tr = document.createElement('tr');
      tr.innerHTML = cells.join('');
      diffBody.appendChild(tr);
    });
    
    // Setup tooltip event listeners
    setTimeout(setupGradeLevelTooltips, 0);
  }
}

/* ===== Update Dropdown ===== */
function updateMarkerSelectors(){
  console.log('🔍 updateMarkerSelectors called, markersInfo:', markersInfo);
  const sel = document.getElementById("markerSelect");
  if (!sel) {
    console.error('❌ markerSelect element not found!');
    return;
  }
  
  sel.innerHTML = `<option value="all">All Markers</option>`;
  markersInfo.forEach(m => sel.innerHTML += `<option value="${m.id}">${m.name}</option>`);

  // Restore previously selected marker (if any)
  const savedMarker = sessionStorage.getItem('selectedMarker');
  console.log('📝 Saved marker:', savedMarker);
  
  if (savedMarker && savedMarker !== 'all') {
    // Check if this marker still exists
    const markerExists = markersInfo.some(m => m.id.toString() === savedMarker);
    if (markerExists) {
      console.log('✅ Restoring saved marker:', savedMarker);
      sel.value = savedMarker;
      // Trigger change event to update display
      const event = new Event('change');
      sel.dispatchEvent(event);
      return; // Change event already triggered, return directly
    }
  }
  
  // If no saved marker or marker doesn't exist, default to 'all' and trigger change event to render table
  console.log('📋 Setting default to "all" and triggering change');
  sel.value = 'all';
  const event = new Event('change');
  sel.dispatchEvent(event);

  const allSel = document.getElementById("allFbSelect");
  if (allSel) {
  allSel.innerHTML = "";
  markersInfo.forEach(m => allSel.innerHTML += `<option value="${m.id}">${m.name}</option>`);
  } else {
    console.warn('⚠️ allFbSelect element not found');
  }
}

/* ===== Username Display and Dropdown Menu ===== */
function initUserInfo() {
  // Get user info from localStorage
  const userStr = localStorage.getItem('user');
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      const usernameEl = document.getElementById('username');
      if (usernameEl && user.name) {
        usernameEl.textContent = user.name || user.email || 'User';
      }
    } catch (e) {
      console.error('Error parsing user data:', e);
    }
  }

  // Dropdown toggle
  const dropdown = document.querySelector('.account.dropdown');
  const dropdownMenu = document.querySelector('.dropdown-menu');
  if (dropdown && dropdownMenu) {
    dropdown.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdownMenu.classList.toggle('show');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      dropdownMenu.classList.remove('show');
    });
  }
}

// Logout function
function logout() {
  localStorage.clear();
  window.location.href = '/login';
}

// Global goToResetPassword function
window.goToResetPassword = function() {
  window.location.href = '/reset-password';
};

/* ===== Save and Restore Scroll Position ===== */
// Save scroll position before page unload
window.addEventListener('beforeunload', () => {
  sessionStorage.setItem('scrollPosition', window.scrollY || window.pageYOffset);
});

// Restore scroll position
function restoreScrollPosition() {
  const savedPosition = sessionStorage.getItem('scrollPosition');
  if (savedPosition) {
    window.scrollTo(0, parseInt(savedPosition));
    // Clear saved position (optional)
    // sessionStorage.removeItem('scrollPosition');
  }
}

/* ===== Initialization ===== */
(async function init() {
  console.log('🚀 Initializing feedback page...');
  initUserInfo();

  const urlParams = new URLSearchParams(window.location.search);
  const projectIdParam = urlParams.get("project");
   const assignmentParam = urlParams.get("assignment"); // assignment1 or assignment2

   console.log('🔍 [Frontend Init] URL parameters:', {
     projectIdParam,
     assignmentParam,
     fullURL: window.location.href
   });

   if (!projectIdParam || !assignmentParam) {
     console.error("❌ Missing project or assignment parameter");
     return;
   }

   // Parse round information
   let round = null;
   if (assignmentParam === "assignment1") {
     round = 1;
   } else if (assignmentParam === "assignment2") {
     round = 2;
   } else {
     console.error("❌ Invalid assignment parameter:", assignmentParam);
    return;
  }

   console.log('🔍 [Frontend Init] Parsed round:', round);
   
   // Save project ID to global variable
  currentProjectId = projectIdParam;

  try {
     // Use latest-ids API to get corresponding assignment ID
     console.log('🔍 [Frontend Init] Calling latest-ids API, projectId:', projectIdParam);
    const res = await fetch(`/api/uploads/project/${projectIdParam}/latest-ids`);

     if (!res.ok) {
       throw new Error(`latest-ids API returned error: ${res.status}`);
     }

    const data = await res.json();
     console.log('🔍 [Frontend Init] latest-ids API response:', data);

     // Get corresponding assignment ID based on round
    let assignmentId = null;
     if (round === 1 && data.assignment1) {
      assignmentId = data.assignment1.assignment_id;
       console.log('🔍 [Frontend Init] Using assignment1 ID:', assignmentId);
     } else if (round === 2 && data.assignment2) {
      assignmentId = data.assignment2.assignment_id;
       console.log('🔍 [Frontend Init] Using assignment2 ID:', assignmentId);
    }

    if (!assignmentId) {
       console.error(`❌ Assignment not found for project ${projectIdParam} round ${round}`);
       console.error('❌ latest-ids data:', data);
      return;
    }

     // Store assignment ID
    window.currentAssignmentId = assignmentId;
    localStorage.setItem('currentAssignmentId', assignmentId.toString());

     console.log('🔍 [Frontend Init] Final storage:', {
       projectId: projectIdParam,
       round: round,
       assignmentId: assignmentId
     });

     // Load rubric descriptions and project file information
     await loadRubricDescriptions(projectIdParam);
    await loadProjectFileInfo(projectIdParam);
    
     // Load moderation report
    loadModerationReport(assignmentId);

  } catch (err) {
     console.error("❌ Initialization failed:", err);
  }
})();

/* ===== Back Button and Export CSV Button ===== */
document.getElementById('backBtn')?.addEventListener('click', () => {
  window.history.back();
});

/* ===== Deviation Percentage Control (per row) ===== */
// Use event delegation to handle dynamically added input fields
document.addEventListener('change', (e) => {
  if (e.target.classList.contains('deviation-input-row')) {
    const rowIndex = parseInt(e.target.getAttribute('data-row-index'));
    const newValue = parseFloat(e.target.value) || 0;
    const clampedValue = Math.max(0, Math.min(newValue, 50));
    e.target.value = clampedValue.toFixed(1);
    
    // Update deviation for corresponding row
    if (rows[rowIndex]) {
      rows[rowIndex].deviationPercent = clampedValue;
      recalculateDeviationRanges();
      
      // Save to backend
      saveDeviationPercent(rowIndex, clampedValue);
    }
  }
});

// Save deviation percentage to backend
async function saveDeviationPercent(rowIndex, deviationPercent) {
  try {
    const row = rows[rowIndex];
    if (!row) {
      return;
    }
    
    const assignmentId = getCurrentAssignmentId();
    if (!assignmentId) {
      console.error('Unable to get current assignment ID');
      return;
    }
    
    // If it's total row, save to assignment table
    if (row.isTotal) {
      const response = await fetch(`/api/uploads/assignments/${assignmentId}/total-deviation-percent`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          deviation_percent: deviationPercent
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to save total deviation percent');
      }
      
      console.log(`✅ Total deviation percent saved: ${deviationPercent}% for assignment ${assignmentId}`);
      return;
    }
    
    // If it's regular criterion row, save to baseline_score table
    if (!row.criterion_id) {
      return;
    }
    
    const response = await fetch(`/api/uploads/assignments/${assignmentId}/deviation-percent`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        criterion_id: row.criterion_id,
        deviation_percent: deviationPercent
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to save deviation percent');
    }
    
    console.log(`✅ Deviation percent saved: ${deviationPercent}% for criterion ${row.criterion_id}`);
  } catch (error) {
    console.error('❌ Error saving deviation percent:', error);
    // Silently fail - deviation will still work in this session
  }
}

/* ===== Download Functionality ===== */
document.getElementById('downloadRubric')?.addEventListener('click', () => {
  if (!currentRubricData) {
    alert('Rubric data not found. Please ensure the rubric has been uploaded and processed.');
    return;
  }
  
  try {
    // Generate Excel file
    const excelBuffer = generateExcelFromRubric(currentRubricData);
    
    // Generate filename
    const filename = `rubric_${new Date().toISOString().slice(0, 10)}.xlsx`;
    
    // Download Excel file
    downloadExcelFile(excelBuffer, filename);
    
    console.log("✅ Rubric Excel file generated and downloaded");
  } catch (error) {
    console.error("❌ Failed to generate rubric Excel:", error);
    alert('Failed to generate rubric Excel file. Please try again.');
  }
});

document.getElementById('downloadAssignment')?.addEventListener('click', () => {
  if (!currentAssignmentInfo) {
    alert('Assignment file not found. Please ensure the assignment has been uploaded.');
    return;
  }
  
  // Create download link
  const link = document.createElement('a');
  link.href = currentAssignmentInfo.download_url;
  link.download = currentAssignmentInfo.file_name;
  link.click();
});

document.getElementById('exportCsv')?.addEventListener('click', () => {
  // Generate CSV from current data
  let csv = '';
  const headers = ['Criterion', 'Unit Chair', 'Lower', 'Upper'];
  markerKeys.forEach(id => {
    const m = markersInfo.find(mi => mi.id === id);
    headers.push(m ? m.name : `Marker ${id}`);
  });
  csv += headers.join(',') + '\n';

  rows.forEach(r => {
    const row = [
      `"${r.criterion}"`,
      fmt(r.chair),
      fmt(r.lower),
      fmt(r.upper)
    ];
    markerKeys.forEach(id => {
      const v = r.markers?.[id];
      row.push(v == null ? '' : fmt(v));
    });
    csv += row.join(',') + '\n';
  });

  // Download CSV
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `feedback_report_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
});

/* ===== Single Marker Feedback Event Binding ===== */
const fbTextarea = document.getElementById('fbTextarea');
const fbSend = document.getElementById('fbSend');
const fbHint = document.getElementById('fbHint');

// Save currently selected marker ID
let currentMarkerId = null;

/* ===== Marker Switch Event (merged version, avoid duplicate listeners) ===== */
console.log('🔧 Setting up markerSelect event listener');
if (!markerSelect) {
  console.error('❌ markerSelect is null when setting up event listener!');
} else {
  markerSelect.addEventListener('change', e=>{
  console.log('🔄 markerSelect change event triggered, value:', e.target.value);
  const selected = e.target.value;
  currentMarkerId = selected !== 'all' ? selected : null;
  
  // Save current scroll position
  const scrollPosition = window.scrollY || window.pageYOffset;
  
  // Save selection state to sessionStorage, maintain selection after refresh
  sessionStorage.setItem('selectedMarker', selected);
  
  // Render tables
  console.log('🎨 Rendering tables for:', selected);
  renderAlignment(selected);
  renderDifferences(selected);
  
  // Show/hide feedback area
  if (currentMarkerId) {
    console.log(`✅ Marker selected: ${currentMarkerId}`);
    document.getElementById('feedback').classList.remove('hidden');
    document.getElementById('diffSection').classList.remove('hidden');
    document.getElementById('allDiffSection').classList.add('hidden');
    document.getElementById('allFeedback').classList.add('hidden');
    
    // Get marker's actual name
    const selectedMarker = markersInfo.find(m => m.id == currentMarkerId);
    const markerName = selectedMarker ? selectedMarker.name : `Marker ${currentMarkerId}`;
    document.getElementById('fbTitle').textContent = `Feedback for ${markerName}`;
  } else {
    console.log('📋 Showing all markers view');
    document.getElementById('feedback').classList.add('hidden');
    document.getElementById('diffSection').classList.add('hidden');
    document.getElementById('allDiffSection').classList.remove('hidden');
    document.getElementById('allFeedback').classList.remove('hidden');
  }
  
  // Restore scroll position, prevent page jump
  requestAnimationFrame(() => {
    window.scrollTo(0, scrollPosition);
  });
});
} // end of else block for markerSelect

// Click Send Feedback button
if (fbSend && fbTextarea && fbHint) {
fbSend.addEventListener('click', async () => {
  if (!currentMarkerId) return alert('Please select a marker first.');
  const content = fbTextarea.value.trim();
  if (!content) return alert('Please write some feedback before sending.');

  fbSend.disabled = true;
  fbHint.textContent = 'Sending...';

  try {
    // Get current assignment ID (from URL or global variable)
    const assignmentId = getCurrentAssignmentId();
    if (!assignmentId) {
      throw new Error('Assignment ID not found. Please ensure you are accessing this page with proper URL parameters (project and assignment).');
    }

    // Get marker's actual name
    const selectedMarker = markersInfo.find(m => m.id == currentMarkerId);
    const markerName = selectedMarker ? selectedMarker.name : `Marker ${currentMarkerId}`;
    
    // Send feedback to backend API
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assignment_id: assignmentId,
        marker_id: currentMarkerId,
        content: content,
        title: `Feedback for ${markerName}`,
        created_by: getCurrentUserId() // Assume you have this function to get current user ID
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to send feedback');
    }

    const result = await response.json();
    console.log(`✅ Feedback sent successfully:`, result);

    fbHint.textContent = '✅ Feedback sent successfully!';
    fbTextarea.value = ''; // Clear input field
    setTimeout(() => (fbHint.textContent = ''), 3000);
  } catch (err) {
    console.error('❌ Failed to send feedback:', err);
    console.log('🔍 Debug info:');
    debugCurrentState();
    fbHint.textContent = `❌ Failed to send feedback: ${err.message}`;
  } finally {
    fbSend.disabled = false;
  }
});
} else {
  console.warn('⚠️ Feedback elements (fbSend, fbTextarea, fbHint) not found');
}
/* ===== All Markers Feedback Event Binding ===== */
const allFbTextarea = document.getElementById('allFbTextarea');
const allFbSend = document.getElementById('allFbSend');
const allFbSelect = document.getElementById('allFbSelect');
const allFbHint = document.getElementById('allFbHint');

if (allFbSend && allFbTextarea && allFbSelect && allFbHint) {
allFbSend.addEventListener('click', async () => {
  const markerId = allFbSelect.value;
  const content = allFbTextarea.value.trim();

  if (!markerId) return alert('Please select a marker to send feedback.');
  if (!content) return alert('Please write feedback content.');

  allFbSend.disabled = true;
  allFbHint.textContent = 'Sending...';

  try {
    // Get current assignment ID
    const assignmentId = getCurrentAssignmentId();
    if (!assignmentId) {
      throw new Error('Assignment ID not found. Please ensure you are accessing this page with proper URL parameters (project and assignment).');
    }

    // Get marker's actual name
    const selectedMarker = markersInfo.find(m => m.id == markerId);
    const markerName = selectedMarker ? selectedMarker.name : `Marker ${markerId}`;

    // Send feedback to backend API
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assignment_id: assignmentId,
        marker_id: markerId,
        content: content,
        title: `Feedback for ${markerName}`,
        created_by: getCurrentUserId()
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to send feedback');
    }

    const result = await response.json();
    console.log(`✅ Feedback sent successfully:`, result);

    allFbHint.textContent = '✅ Feedback sent successfully!';
    allFbTextarea.value = ''; // Clear input field
    setTimeout(() => (allFbHint.textContent = ''), 3000);
  } catch (err) {
    console.error('❌ Failed to send feedback:', err);
    console.log('🔍 Debug info:');
    debugCurrentState();
    allFbHint.textContent = `❌ Failed to send feedback: ${err.message}`;
  } finally {
    allFbSend.disabled = false;
  }
});
} else {
  console.warn('⚠️ All markers feedback elements (allFbSend, allFbTextarea, allFbSelect, allFbHint) not found');
}

