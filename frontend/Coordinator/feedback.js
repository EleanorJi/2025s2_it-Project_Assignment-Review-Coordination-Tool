/* ===== 全局变量 ===== */
let rows = [];
let markerKeys = [];
let markersInfo = [];
let rubricDescriptions = {}; // 新增：保存 rubric description
let currentProjectId = null; // 保存当前项目ID
let currentAssignmentInfo = null; // 保存当前assignment信息
let currentRubricInfo = null; // 保存当前rubric信息
let currentRubricData = null; // 保存当前rubric的详细数据
let deviationPercent = 5.0; // 当前deviation百分比（默认5%）

console.log('📊 Feedback.js v2.6 loaded - adjustable deviation percentage');

/* ===== 辅助函数 ===== */
// 获取当前assignment ID
function getCurrentAssignmentId() {
  // 从URL参数获取assignment ID（兼容 assignment_id 与 assignment=数字）
  const urlParams = new URLSearchParams(window.location.search);
  const assignmentIdParam = urlParams.get('assignment_id') || urlParams.get('assignment');

  if (assignmentIdParam && /^\d+$/.test(String(assignmentIdParam))) {
    return parseInt(assignmentIdParam);
  }

  // 或者从全局变量获取
  if (window.currentAssignmentId) {
    return window.currentAssignmentId;
  }

  // 或者从localStorage获取
  const stored = localStorage.getItem('currentAssignmentId');
  if (stored && /^\d+$/.test(String(stored))) {
    return parseInt(stored);
  }

  return null;
}

// 调试函数：显示当前状态
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


// 获取当前用户ID
function getCurrentUserId() {
  // 从localStorage获取用户信息
  const userInfo = localStorage.getItem('userInfo');
  if (userInfo) {
    try {
      const user = JSON.parse(userInfo);
      return user.user_id || user.id;
    } catch (e) {
      console.error('Error parsing user info:', e);
    }
  }

  // 或者从全局变量获取
  if (window.currentUserId) {
    return window.currentUserId;
  }

  // 兜底：从 cookie 读取 userId（后端认证中间件写入）
  try {
    const cookieStr = document.cookie || '';
    const match = cookieStr.match(/(?:^|;\s*)userId=([^;]+)/);
    if (match) {
      const id = parseInt(decodeURIComponent(match[1]));
      if (!Number.isNaN(id)) return id;
    }
  } catch (_) {}

  // 临时修复：使用默认的coordinator ID
  console.warn('⚠️ No user info found, using default coordinator ID: 1');
  return 1; // 默认使用admin用户作为coordinator
}

// DOM 元素
const alignBody   = document.querySelector('#alignmentTable tbody');
const alignHeader = document.getElementById('alignHeader');
const diffSection = document.getElementById('diffSection');
const diffBody    = document.querySelector('#differenceTable tbody');
const diffHeader  = document.getElementById('diffHeader');
const markerSelect= document.getElementById('markerSelect');
const allDiffSection = document.getElementById('allDiffSection');
const allDiffHeader  = document.getElementById('allDiffHeader');
const allDiffBody    = document.querySelector('#allDifferenceTable tbody');

/* ===== 工具函数 ===== */
function fmt(n){ const v=Number(n); if(Number.isNaN(v)) return ''; return (v%1===0)? v.toString() : v.toFixed(2); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function isOut(v, lo, hi){ return v<lo || v>hi; }

/**
 * 获取单元格颜色类
 * @param {number} value - marker的分数
 * @param {object} row - 行数据
 * @returns {string} - CSS类名
 */
function getCellClass(value, row) {
  if (value == null) return '';
  
  // 对于Total行，使用三级颜色系统（warning为50%的deviation）
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
  
  // 对于普通criterion行，使用两级颜色系统
  if (value >= row.lower && value <= row.upper) {
    return 'good-cell';
  } else {
    return 'bad-cell';
  }
}

/**
 * 根据每行的deviation百分比动态重新计算所有行的lower和upper
 */
function recalculateDeviationRanges() {
  rows.forEach(row => {
    const rowDeviation = row.deviationPercent || 5.0;
    // 动态计算lower和upper
    row.lower = Math.round((row.chair * (1 - rowDeviation / 100)) * 100) / 100;
    row.upper = Math.round((row.chair * (1 + rowDeviation / 100)) * 100) / 100;
    
    // 对于Total行，还需要更新warning范围
    if (row.isTotal) {
      const warningPercent = rowDeviation * 0.5;
      row.warningLower = Math.round((row.chair * (1 - warningPercent / 100)) * 100) / 100;
      row.warningUpper = Math.round((row.chair * (1 + warningPercent / 100)) * 100) / 100;
    }
  });
  
  // 重新渲染表格
  renderAlignment(markerSelect.value);
  renderDifferences(markerSelect.value);
}

/* ===== 从后端加载 Rubric 描述 ===== */
async function loadRubricDescriptions(projectId) {
  try {
    const res = await fetch(`/api/uploads/project/${projectId}/status`);
    const data = await res.json();
    if (data?.rubric?.rubric_id) {
      const rubricRes = await fetch(`/api/uploads/rubric/${data.rubric.rubric_id}/details`);
      const rubricData = await rubricRes.json();
      
      // 保存完整的rubric数据
      currentRubricData = rubricData;
      
      // 保存rubric描述用于显示
      rubricDescriptions = {};
      (rubricData.criteria || []).forEach(c => {
        rubricDescriptions[c.title] = c.description || "";
      });
      console.log("✅ Rubric descriptions loaded:", rubricDescriptions);
      console.log("✅ Full rubric data loaded:", currentRubricData);
    }
  } catch (e) {
    console.error("加载 rubric 描述失败:", e);
  }
}

/* ===== 获取当前项目的文件信息 ===== */
async function loadProjectFileInfo(projectId) {
  try {
    const res = await fetch(`/api/uploads/project/${projectId}/status`);
    const data = await res.json();
    
    if (data?.rubric?.file) {
      currentRubricInfo = data.rubric.file;
      console.log("✅ Rubric file info loaded:", currentRubricInfo);
    }
    
    if (data?.assignments && data.assignments.length > 0) {
      // 获取当前assignment的信息
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
    console.error("加载项目文件信息失败:", e);
  }
}

/* ===== 生成Excel文件 ===== */
function generateExcelFromRubric(rubricData) {
  // 创建新的工作簿
  const wb = XLSX.utils.book_new();
  
  // 准备数据
  const worksheetData = [];
  
  // 添加标题行 - Max Score列移到最后
  const headers = ['Criterion', 'Description'];
  
  // 获取所有grade levels
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
  
  // 按seq_no排序
  allGradeLevels.sort((a, b) => a.seq_no - b.seq_no);
  
  // 添加grade level列标题
  allGradeLevels.forEach(level => {
    headers.push(`${level.level_name} (${level.min_score}-${level.max_score})`);
  });
  
  // 添加Criteria Score列标题（在最后）
  headers.push('Criteria Score');
  
  worksheetData.push(headers);
  
  // 添加每个criterion的数据
  rubricData.criteria.forEach(criterion => {
    const row = [
      criterion.title,
      criterion.description || ''
    ];
    
    // 为每个grade level添加描述
    allGradeLevels.forEach(level => {
      const gradeLevel = criterion.grade_levels.find(gl => gl.level_name === level.level_name);
      row.push(gradeLevel ? gradeLevel.description : '');
    });
    
    // 添加Criteria Score（在最后，添加"/"前缀）
    row.push(`/${criterion.max_score}`);
    
    worksheetData.push(row);
  });
  
  // 创建工作表
  const ws = XLSX.utils.aoa_to_sheet(worksheetData);
  
  // 设置列宽
  const colWidths = [
    { wch: 20 }, // Criterion
    { wch: 30 }, // Description
  ];
  
  // 为grade level列设置宽度
  allGradeLevels.forEach(() => {
    colWidths.push({ wch: 25 });
  });
  
  // 为Criteria Score列设置宽度
  colWidths.push({ wch: 15 }); // Criteria Score
  
  ws['!cols'] = colWidths;
  
  // 添加工作表到工作簿
  XLSX.utils.book_append_sheet(wb, ws, 'Rubric');
  
  // 生成Excel文件
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  
  return excelBuffer;
}

/* ===== 下载Excel文件 ===== */
function downloadExcelFile(excelBuffer, filename) {
  const blob = new Blob([excelBuffer], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
  });
  
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

/* ===== 从后端加载 Moderation Report ===== */
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
      console.error("加载报告失败:", data.error);
      if (alignBody) {
        alignBody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:20px;color:var(--bad);">
          ❌ ${data.error || 'Failed to load moderation report'}
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
      const markerCommentsObj = {}; // 添加marker comments存储
      (c.marker_scores || []).forEach(ms => {
        markersObj[ms.marker_id] = ms.score;
        // 存储marker的comment
        if (ms.comment) {
          markerCommentsObj[ms.marker_id] = ms.comment;
        }
      });
      return {
        criterion: `${c.title} / ${c.max_score}`,
        title: c.title,
        chair: c.baseline_score, // ⚡ Coordinator的分数，从后端baseline_score提取
        chairComment: c.baseline_comment || '', // 添加baseline comment
        lower: c.range_lower,
        upper: c.range_upper,
        percent: c.baseline_percentage,
        maxScore: c.max_score, // 保存criterion的总分
        markers: markersObj,
        markerComments: markerCommentsObj, // 添加marker comments
        description: rubricDescriptions[c.title] || "",
        total: null,
        deviationPercent: c.deviation_percent || 5.0, // 从API获取deviation_percent
        criterion_id: c.criterion_id // 保存criterion_id用于保存deviation
      };
    });

    // 添加总分行 (Note: Total row uses ±5% range for red, ±2.5% for warning, individual criteria use ±5% range)
    const totals = data.totals;
    const totalMarkersObj = {};
    (totals.marker_totals || []).forEach(mt => {
      totalMarkersObj[mt.marker_id] = mt.total;
    });
    rows.push({
      criterion: "Total / " + totals.max_total_score,
      chair: totals.baseline_total, // ⚡ Coordinator的总分，从后端baseline_total提取
      lower: totals.range_lower, // ±5% for Total row (red threshold)
      upper: totals.range_upper, // ±5% for Total row (red threshold)
      warningLower: totals.warning_lower, // ±2.5% for Total row (warning threshold)
      warningUpper: totals.warning_upper, // ±2.5% for Total row (warning threshold)
      percent: totals.baseline_percentage,
      maxScore: totals.max_total_score, // 保存总分
      markers: totalMarkersObj,
      markerComments: {}, // 总分行没有comments
      description: "",
      total: null,
      isTotal: true, // 标记这是总分行
      deviationPercent: 5.0 // 默认deviation为5%
    });

    // 先根据每行的deviation百分比重新计算范围和颜色
    console.log('📊 Recalculating deviation ranges and updating selectors');
    recalculateDeviationRanges();
    updateMarkerSelectors();
    
    // 恢复滚动位置（在所有内容加载完成后）
    setTimeout(restoreScrollPosition, 100);

  } catch (err) {
    console.error("获取 moderation report 出错:", err);
    // 显示错误信息给用户
    if (alignBody) {
      alignBody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:20px;color:var(--bad);">
        ❌ Failed to load moderation report: ${err.message || 'Unknown error'}
      </td></tr>`;
    }
  }
}

/* ===== Alignment 表格 ===== */
function renderAlignment(selected='all'){
  console.log('🎨 renderAlignment called, selected:', selected, 'rows:', rows.length);
  let headers = ["Criterion","Unit Chair","Deviation %","Range Lower","Range Upper"];
  if(selected==='all'){
    headers = headers.concat(markerKeys.map(id=>{
      const m = markersInfo.find(mi=>mi.id===id);
      return m ? m.name : `Marker ${id}`;
    }));
    // All Markers视图：不添加Total和Comment列
  } else {
    const m = markersInfo.find(mi=>mi.id==selected);
    headers.push(m ? m.name : `Marker ${selected}`);
    // 单个marker视图：只添加Comment列，不添加Total列
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
    const tds = [
      `<td style="text-align:left"><div>${escapeHtml(r.criterion)}</div><div style="font-size:12px;color:#666;">${escapeHtml(r.description)}</div></td>`,
      `<td>${fmt(r.chair)}</td>`,
      `<td><input type="number" class="deviation-input-row" value="${deviationPercent}" min="0" max="50" step="0.1" data-row-index="${index}" /></td>`,
      `<td>${fmt(r.lower)}</td>`,
      `<td>${fmt(r.upper)}</td>`
    ];
    if(selected==='all'){
      markerKeys.forEach(id=>{
        const v=r.markers?.[id];
        if(v==null) tds.push('<td class="muted">–</td>');
        else tds.push(`<td class="${getCellClass(v, r)}">${fmt(v)}</td>`);
      });
      // All Markers视图：不添加Total和Comment列
    } else {
      const v=r.markers?.[selected];
      if(v==null) tds.push('<td class="muted">–</td>');
      else tds.push(`<td class="${getCellClass(v, r)}">${fmt(v)}</td>`);

      // 单个marker视图：只添加Comment列，不添加Total列
      const comment = r.markerComments?.[selected] || '';
      tds.push(`<td style="text-align:left;max-width:200px;word-wrap:break-word;">${comment ? escapeHtml(comment) : '<span class="muted">—</span>'}</td>`);
    }

    const tr=document.createElement('tr'); tr.innerHTML=tds.join(''); alignBody.appendChild(tr);
  });
}

/* ===== Difference 表格（支持 all 和单 marker） ===== */
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
      const cells = [
        `<td style="text-align:left;max-width:250px;overflow:hidden;text-overflow:ellipsis"><div>${escapeHtml(r.criterion)}</div><div style="font-size:12px;color:#666;">${escapeHtml(r.description)}</div></td>`,
        `<td>${fmt(r.chair)}</td>`
      ];
      markerKeys.forEach(id=>{
        const v = r.markers?.[id]; // marker的分数
        const coordinatorScore = r.chair; // coordinator的分数（从后端baseline_score提取）
        const maxScore = r.maxScore; // criterion的总分
        
        // Percent = marker的分数 / criterion的总分 * 100
        const percent = (v!=null && maxScore!=null && maxScore > 0) ? Number(((v / maxScore) * 100).toFixed(2)) : null;
        
        // Difference = marker的分数 - coordinator的分数
        const diff = (v!=null && coordinatorScore!=null) ? Number((v - coordinatorScore).toFixed(2)) : null;
        
        // 移除标红逻辑，不再使用bad-cell类
        // 顺序改为：Difference, Marker, Percent
        cells.push(`<td>${diff==null?'—':fmt(diff)}</td>`);
        cells.push(`<td>${v==null?'—':fmt(v)}</td>`);
        cells.push(`<td>${percent==null?'—':fmt(percent)+'%'}</td>`);
      });
      const tr = document.createElement('tr');
      tr.innerHTML = cells.join('');
      allDiffBody.appendChild(tr);
    });
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
      const v = r.markers?.[selected]; // marker的分数
      const coordinatorScore = r.chair; // coordinator的分数（从后端baseline_score提取）
      const maxScore = r.maxScore; // criterion的总分
      
      // Percent = marker的分数 / criterion的总分 * 100
      const percent = (v!=null && maxScore!=null && maxScore > 0) ? Number(((v / maxScore) * 100).toFixed(2)) : null;
      
      // Difference = marker的分数 - coordinator的分数
      const diff = (v!=null && coordinatorScore!=null) ? Number((v - coordinatorScore).toFixed(2)) : null;
      
      // 移除标红逻辑，不再使用bad-cell类
      // 顺序改为：Criterion, Unit Chair, Difference, Marker, Percent

      const cells = [
        `<td style="text-align:left;max-width:250px;overflow:hidden;text-overflow:ellipsis"><div>${escapeHtml(r.criterion)}</div><div style="font-size:12px;color:#666;">${escapeHtml(r.description)}</div></td>`,
        `<td>${fmt(coordinatorScore)}</td>`,
        `<td>${diff==null?'—':fmt(diff)}</td>`,
        `<td>${v==null?'—':fmt(v)}</td>`,
        `<td>${percent==null?'—':fmt(percent)+'%'}</td>`
      ];
      const tr = document.createElement('tr');
      tr.innerHTML = cells.join('');
      diffBody.appendChild(tr);
    });
  }
}

/* ===== 更新下拉框 ===== */
function updateMarkerSelectors(){
  console.log('🔍 updateMarkerSelectors called, markersInfo:', markersInfo);
  const sel = document.getElementById("markerSelect");
  if (!sel) {
    console.error('❌ markerSelect element not found!');
    return;
  }
  
  sel.innerHTML = `<option value="all">All Markers</option>`;
  markersInfo.forEach(m => sel.innerHTML += `<option value="${m.id}">${m.name}</option>`);

  // 恢复之前选择的marker（如果有）
  const savedMarker = sessionStorage.getItem('selectedMarker');
  console.log('📝 Saved marker:', savedMarker);
  
  if (savedMarker && savedMarker !== 'all') {
    // 检查这个marker是否还存在
    const markerExists = markersInfo.some(m => m.id.toString() === savedMarker);
    if (markerExists) {
      console.log('✅ Restoring saved marker:', savedMarker);
      sel.value = savedMarker;
      // 触发change事件来更新显示
      const event = new Event('change');
      sel.dispatchEvent(event);
      return; // 已触发change，直接返回
    }
  }
  
  // 如果没有保存的marker或marker不存在，默认选择'all'并触发change事件来渲染表格
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

/* ===== 用户名显示和下拉菜单 ===== */
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

/* ===== 保存和恢复滚动位置 ===== */
// 页面卸载前保存滚动位置
window.addEventListener('beforeunload', () => {
  sessionStorage.setItem('scrollPosition', window.scrollY || window.pageYOffset);
});

// 恢复滚动位置
function restoreScrollPosition() {
  const savedPosition = sessionStorage.getItem('scrollPosition');
  if (savedPosition) {
    window.scrollTo(0, parseInt(savedPosition));
    // 清除保存的位置（可选）
    // sessionStorage.removeItem('scrollPosition');
  }
}

/* ===== 初始化 ===== */
(async function init() {
  console.log('🚀 Initializing feedback page...');
  // Initialize user info display
  initUserInfo();

  const urlParams = new URLSearchParams(window.location.search);
  const projectIdParam = urlParams.get("project");
  const assignmentParam = urlParams.get("assignment"); // assignment1 / assignment2 或 数字ID

  console.log('📋 URL params - project:', projectIdParam, 'assignment:', assignmentParam);

  // 先尝试直接解析 assignmentId（兼容历史链接：completed/archived 从 Past Assignment 进入）
  const directAssignmentId = getCurrentAssignmentId();
  console.log('🔍 Direct assignment ID:', directAssignmentId);
  
  if (directAssignmentId) {
    try {
      // 通过 assignmentId 反查 projectId
      const asRes = await fetch(`/api/uploads/assignment/${directAssignmentId}/status`);
      if (!asRes.ok) throw new Error('Failed to fetch assignment status');
      const asData = await asRes.json();
      const projectId = asData.assignment?.project_id;
      if (!projectId) throw new Error('Project ID not found for assignment');

      // 保存项目与作业信息
      currentProjectId = projectId;
      window.currentAssignmentId = directAssignmentId;
      localStorage.setItem('currentAssignmentId', String(directAssignmentId));
      console.log(`✅ Assignment ID (direct) stored: ${directAssignmentId}`);

      // 加载Rubric与文件信息后渲染
      await loadRubricDescriptions(projectId);
      await loadProjectFileInfo(projectId);
      debugCurrentState();
      loadModerationReport(directAssignmentId);
      return; // 已完成初始化
    } catch (err) {
      console.error('通过 assignmentId 初始化失败，回退到项目方式:', err);
      // 继续尝试使用 project + assignmentKey 方式
    }
  }

  // Fallback：使用 project + assignmentKey（assignment1/assignment2）方式
  if (!projectIdParam || !assignmentParam) {
    console.warn("缺少 project 或 assignment 参数");
    return;
  }

  // 保存项目ID到全局变量
  currentProjectId = projectIdParam;
  await loadRubricDescriptions(projectIdParam);

  try {
    const res = await fetch(`/api/uploads/project/${projectIdParam}/latest-ids`);
    const data = await res.json();

    let assignmentId = null;
    if (assignmentParam === "assignment1" && data.assignment1) {
      assignmentId = data.assignment1.assignment_id;
    } else if (assignmentParam === "assignment2" && data.assignment2) {
      assignmentId = data.assignment2.assignment_id;
    }

    if (!assignmentId) {
      console.error("未找到对应的 assignmentId");
      return;
    }

    // 将assignment ID存储到全局变量和localStorage中，供feedback功能使用
    window.currentAssignmentId = assignmentId;
    localStorage.setItem('currentAssignmentId', assignmentId.toString());
    console.log(`✅ Assignment ID stored: ${assignmentId}`);

    // 调试当前状态
    debugCurrentState();

    // 加载项目文件信息
    await loadProjectFileInfo(projectIdParam);
    
    loadModerationReport(assignmentId);
  } catch (err) {
    console.error("初始化失败:", err);
  }
})();

/* ===== Back按钮和Export CSV按钮 ===== */
document.getElementById('backBtn')?.addEventListener('click', () => {
  window.history.back();
});

/* ===== Deviation Percentage Control (per row) ===== */
// 使用事件委托处理动态添加的输入框
document.addEventListener('change', (e) => {
  if (e.target.classList.contains('deviation-input-row')) {
    const rowIndex = parseInt(e.target.getAttribute('data-row-index'));
    const newValue = parseFloat(e.target.value) || 0;
    const clampedValue = Math.max(0, Math.min(newValue, 50));
    e.target.value = clampedValue.toFixed(1);
    
    // 更新对应行的deviation
    if (rows[rowIndex]) {
      rows[rowIndex].deviationPercent = clampedValue;
      recalculateDeviationRanges();
      
      // 保存到后端
      saveDeviationPercent(rowIndex, clampedValue);
    }
  }
});

// 保存deviation百分比到后端
async function saveDeviationPercent(rowIndex, deviationPercent) {
  try {
    const row = rows[rowIndex];
    if (!row || !row.criterion_id || row.isTotal) {
      // 总分行不保存deviation到数据库
      return;
    }
    
    const assignmentId = getCurrentAssignmentId();
    if (!assignmentId) {
      console.error('Unable to get current assignment ID');
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
    
    console.log(`Deviation percent saved: ${deviationPercent}% for criterion ${row.criterion_id}`);
  } catch (error) {
    console.error('Error saving deviation percent:', error);
    // Silently fail - deviation will still work in this session
  }
}

/* ===== 下载功能 ===== */
document.getElementById('downloadRubric')?.addEventListener('click', () => {
  if (!currentRubricData) {
    alert('Rubric data not found. Please ensure the rubric has been uploaded and processed.');
    return;
  }
  
  try {
    // 生成Excel文件
    const excelBuffer = generateExcelFromRubric(currentRubricData);
    
    // 生成文件名
    const filename = `rubric_${new Date().toISOString().slice(0, 10)}.xlsx`;
    
    // 下载Excel文件
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
  
  // 创建下载链接
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

/* ===== 单 marker Feedback 事件绑定 ===== */
const fbTextarea = document.getElementById('fbTextarea');
const fbSend = document.getElementById('fbSend');
const fbHint = document.getElementById('fbHint');

// 保存当前选中的 marker ID
let currentMarkerId = null;

/* ===== Marker切换事件（合并版本，避免重复监听） ===== */
console.log('🔧 Setting up markerSelect event listener');
if (!markerSelect) {
  console.error('❌ markerSelect is null when setting up event listener!');
} else {
  markerSelect.addEventListener('change', e=>{
  console.log('🔄 markerSelect change event triggered, value:', e.target.value);
  const selected = e.target.value;
  currentMarkerId = selected !== 'all' ? selected : null;
  
  // 保存当前滚动位置
  const scrollPosition = window.scrollY || window.pageYOffset;
  
  // 保存选择状态到sessionStorage，刷新后保持选择
  sessionStorage.setItem('selectedMarker', selected);
  
  // 渲染表格
  console.log('🎨 Rendering tables for:', selected);
  renderAlignment(selected);
  renderDifferences(selected);
  
  // 显示/隐藏feedback区域
  if (currentMarkerId) {
    console.log(`✅ Marker selected: ${currentMarkerId}`);
    document.getElementById('feedback').classList.remove('hidden');
    document.getElementById('diffSection').classList.remove('hidden');
    document.getElementById('allDiffSection').classList.add('hidden');
    document.getElementById('allFeedback').classList.add('hidden');
    
    // 获取marker的实际姓名
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
  
  // 恢复滚动位置，防止页面跳转
  requestAnimationFrame(() => {
    window.scrollTo(0, scrollPosition);
  });
});
} // end of else block for markerSelect

// 点击 Send Feedback 按钮
if (fbSend && fbTextarea && fbHint) {
  fbSend.addEventListener('click', async () => {
    if (!currentMarkerId) return alert('Please select a marker first.');
    const content = fbTextarea.value.trim();
    if (!content) return alert('Please write some feedback before sending.');

    fbSend.disabled = true;
    fbHint.textContent = 'Sending...';

  try {
    // 获取当前assignment ID (从URL或全局变量)
    const assignmentId = getCurrentAssignmentId();
    if (!assignmentId) {
      throw new Error('Assignment ID not found. Please ensure you are accessing this page with proper URL parameters (project and assignment).');
    }

    // 获取marker的实际姓名
    const selectedMarker = markersInfo.find(m => m.id == currentMarkerId);
    const markerName = selectedMarker ? selectedMarker.name : `Marker ${currentMarkerId}`;
    
    // 发送feedback到后端API
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
        created_by: getCurrentUserId() // 假设你有这个函数获取当前用户ID
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to send feedback');
    }

    const result = await response.json();
    console.log(`✅ Feedback sent successfully:`, result);

    fbHint.textContent = '✅ Feedback sent successfully!';
    fbTextarea.value = ''; // 清空输入框
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
/* ===== All markers Feedback 事件绑定 ===== */
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
    // 获取当前assignment ID
    const assignmentId = getCurrentAssignmentId();
    if (!assignmentId) {
      throw new Error('Assignment ID not found. Please ensure you are accessing this page with proper URL parameters (project and assignment).');
    }

    // 获取marker的实际姓名
    const selectedMarker = markersInfo.find(m => m.id == markerId);
    const markerName = selectedMarker ? selectedMarker.name : `Marker ${markerId}`;

    // 发送feedback到后端API
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
    allFbTextarea.value = ''; // 清空输入框
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

