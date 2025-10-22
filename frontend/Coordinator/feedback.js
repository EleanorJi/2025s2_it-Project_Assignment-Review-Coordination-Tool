/* ===== 全局变量 ===== */
let rows = [];
let markerKeys = [];
let markersInfo = [];
let rubricDescriptions = {}; // 新增：保存 rubric description
let currentProjectId = null; // 保存当前项目ID
let currentAssignmentInfo = null; // 保存当前assignment信息
let currentRubricInfo = null; // 保存当前rubric信息
let currentRubricData = null; // 保存当前rubric的详细数据

console.log('📊 Feedback.js v2.5 loaded - 3-tier color for Total (green≤2.5%, yellow≤5%, red>5%), 2-tier for criteria (green≤5%, red>5%)');

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
  
  // 对于Total行，使用三级颜色系统
  if (row.isTotal) {
    if (value >= row.warningLower && value <= row.warningUpper) {
      return 'good-cell'; // 在±2.5%以内，绿色
    } else if (value >= row.lower && value <= row.upper) {
      return 'warning-cell'; // 在2.5%-5%之间，黄色
    } else {
      return 'bad-cell'; // 超过±5%，红色
    }
  }
  
  // 对于普通criterion行，使用两级颜色系统
  if (value >= row.lower && value <= row.upper) {
    return 'good-cell'; // 在±5%以内，绿色
  } else {
    return 'bad-cell'; // 超过±5%，红色
  }
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
  try {
    const res = await fetch(`/api/uploads/assignments/${assignmentId}/moderation-report`);
    const data = await res.json();
    if (data.error) {
      console.error("加载报告失败:", data.error);
      return;
    }

    markersInfo = data.totals.marker_totals.map(m => ({
      id: m.marker_id,
      name: m.marker_name || `Marker ${m.marker_id}`
    }));
    markerKeys = markersInfo.map(m => m.id);

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
        total: null
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
      isTotal: true // 标记这是总分行
    });

    renderAlignment('all');
    renderDifferences('all');
    updateMarkerSelectors();
    
    // 恢复滚动位置（在所有内容加载完成后）
    setTimeout(restoreScrollPosition, 100);

  } catch (err) {
    console.error("获取 moderation report 出错:", err);
  }
}

/* ===== Alignment 表格 ===== */
function renderAlignment(selected='all'){
  let headers = ["Criterion","Unit Chair","Range Lower","Range Upper"];
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
  alignHeader.innerHTML = headers.map(h=>`<th>${h}</th>`).join('');

  alignBody.innerHTML='';
  rows.forEach(r=>{
    const tds = [
      `<td style="text-align:left"><div>${escapeHtml(r.criterion)}</div><div style="font-size:12px;color:#666;">${escapeHtml(r.description)}</div></td>`,
      `<td>${fmt(r.chair)}</td>`,
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
  allDiffSection.classList.add('hidden');
  diffSection.classList.add('hidden');
  allDiffHeader.innerHTML=''; allDiffBody.innerHTML='';
  diffHeader.innerHTML=''; diffBody.innerHTML='';

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
  const sel = document.getElementById("markerSelect");
  sel.innerHTML = `<option value="all">All Markers</option>`;
  markersInfo.forEach(m => sel.innerHTML += `<option value="${m.id}">${m.name}</option>`);

  // 恢复之前选择的marker（如果有）
  const savedMarker = sessionStorage.getItem('selectedMarker');
  if (savedMarker && savedMarker !== 'all') {
    // 检查这个marker是否还存在
    const markerExists = markersInfo.some(m => m.id.toString() === savedMarker);
    if (markerExists) {
      sel.value = savedMarker;
      // 触发change事件来更新显示
      const event = new Event('change');
      sel.dispatchEvent(event);
    }
  }

  const allSel = document.getElementById("allFbSelect");
  allSel.innerHTML = "";
  markersInfo.forEach(m => allSel.innerHTML += `<option value="${m.id}">${m.name}</option>`);
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
  // Initialize user info display
  initUserInfo();

  const urlParams = new URLSearchParams(window.location.search);
  const projectIdParam = urlParams.get("project");
  const assignmentParam = urlParams.get("assignment"); // assignment1 / assignment2 或 数字ID

  // 先尝试直接解析 assignmentId（兼容历史链接：completed/archived 从 Past Assignment 进入）
  const directAssignmentId = getCurrentAssignmentId();
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
markerSelect.addEventListener('change', e=>{
  const selected = e.target.value;
  currentMarkerId = selected !== 'all' ? selected : null;
  
  // 保存当前滚动位置
  const scrollPosition = window.scrollY || window.pageYOffset;
  
  // 保存选择状态到sessionStorage，刷新后保持选择
  sessionStorage.setItem('selectedMarker', selected);
  
  // 渲染表格
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

// 点击 Send Feedback 按钮
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
/* ===== All markers Feedback 事件绑定 ===== */
const allFbTextarea = document.getElementById('allFbTextarea');
const allFbSend = document.getElementById('allFbSend');
const allFbSelect = document.getElementById('allFbSelect');
const allFbHint = document.getElementById('allFbHint');

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

