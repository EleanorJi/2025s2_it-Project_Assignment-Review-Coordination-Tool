/* ===== 全局变量 ===== */
let rows = [];
let markerKeys = [];
let markersInfo = [];
let rubricDescriptions = {}; // 新增：保存 rubric description

/* ===== 辅助函数 ===== */
// 获取当前assignment ID
function getCurrentAssignmentId() {
  // 从URL参数获取assignment ID
  const urlParams = new URLSearchParams(window.location.search);
  const assignmentId = urlParams.get('assignment_id');
  
  if (assignmentId) {
    return parseInt(assignmentId);
  }
  
  // 或者从全局变量获取
  if (window.currentAssignmentId) {
    return window.currentAssignmentId;
  }
  
  // 或者从localStorage获取
  const stored = localStorage.getItem('currentAssignmentId');
  if (stored) {
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
  
  return null;
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

/* ===== 从后端加载 Rubric 描述 ===== */
async function loadRubricDescriptions(projectId) {
  try {
    const res = await fetch(`/api/uploads/project/${projectId}/status`);
    const data = await res.json();
    if (data?.rubric?.rubric_id) {
      const rubricRes = await fetch(`/api/uploads/rubric/${data.rubric.rubric_id}/details`);
      const rubricData = await rubricRes.json();
      rubricDescriptions = {};
      (rubricData.criteria || []).forEach(c => {
        rubricDescriptions[c.title] = c.description || "";
      });
      console.log("✅ Rubric descriptions loaded:", rubricDescriptions);
    }
  } catch (e) {
    console.error("加载 rubric 描述失败:", e);
  }
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
        chair: c.baseline_score,
        chairComment: c.baseline_comment || '', // 添加baseline comment
        lower: c.range_lower,
        upper: c.range_upper,
        percent: c.baseline_percentage,
        markers: markersObj,
        markerComments: markerCommentsObj, // 添加marker comments
        description: rubricDescriptions[c.title] || "",
        total: null
      };
    });

    // 添加总分
    const totals = data.totals;
    const totalMarkersObj = {};
    (totals.marker_totals || []).forEach(mt => {
      totalMarkersObj[mt.marker_id] = mt.total;
    });
    rows.push({
      criterion: "Total / " + totals.max_total_score,
      chair: totals.baseline_total,
      lower: totals.range_lower,
      upper: totals.range_upper,
      percent: totals.baseline_percentage,
      markers: totalMarkersObj,
      markerComments: {}, // 总分行没有comments
      description: "",
      total: null
    });

    renderAlignment('all');
    renderDifferences('all');
    updateMarkerSelectors();

  } catch (err) {
    console.error("获取 moderation report 出错:", err);
  }
}

/* ===== Alignment 表格 ===== */
function renderAlignment(selected='all'){
  let headers = ["Criterion","Unit Chair","Range 5% Lower","Range 5% Upper"];
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
        else tds.push(`<td class="${isOut(v,r.lower,r.upper)?'bad-cell':''}">${fmt(v)}</td>`);
      });
      // All Markers视图：不添加Total和Comment列
    } else {
      const v=r.markers?.[selected];
      if(v==null) tds.push('<td class="muted">–</td>');
      else tds.push(`<td class="${isOut(v,r.lower,r.upper)?'bad-cell':''}">${fmt(v)}</td>`);
      
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
    const headers = ['Criterion','Percent'];
    markerKeys.forEach(id=>{
      const m = markersInfo.find(mi=>mi.id===id);
      headers.push(m ? m.name : `Marker ${id}`);
      headers.push('Difference');
    });
    allDiffHeader.innerHTML = headers.map(h=>`<th>${h}</th>`).join('');

    rows.forEach(r=>{
      const cells = [
        `<td style="text-align:left"><div>${escapeHtml(r.criterion)}</div><div style="font-size:12px;color:#666;">${escapeHtml(r.description)}</div></td>`,
        `<td>${fmt(r.percent)}</td>`
      ];
      markerKeys.forEach(id=>{
        const v = r.markers?.[id];
        const d = (v!=null && r.percent!=null) ? Number((v - r.percent).toFixed(2)) : null;
        const out = (v!=null) && isOut(v, r.lower, r.upper);
        cells.push(`<td class="${out?'bad-cell':''}">${v==null?'—':fmt(v)}</td>`);
        cells.push(`<td class="${out?'bad-cell':''}">${d==null?'—':(d>0?`+${fmt(d)}`:fmt(d))}</td>`);
      });
      const tr = document.createElement('tr');
      tr.innerHTML = cells.join('');
      allDiffBody.appendChild(tr);
    });
  } else {
    diffSection.classList.remove('hidden');
    const m = markersInfo.find(mi=>mi.id==selected);
    const headers = ['Criterion','Percent', m ? m.name : `Marker ${selected}`,'Difference'];
    diffHeader.innerHTML = headers.map(h=>`<th>${h}</th>`).join('');

    rows.forEach(r=>{
      const v = r.markers?.[selected];
      const d = (v!=null && r.percent!=null) ? Number((v - r.percent).toFixed(2)) : null;
      const out = (v!=null) && isOut(v, r.lower, r.upper);
      
      const cells = [
        `<td style="text-align:left"><div>${escapeHtml(r.criterion)}</div><div style="font-size:12px;color:#666;">${escapeHtml(r.description)}</div></td>`,
        `<td>${fmt(r.percent)}</td>`,
        `<td class="${out?'bad-cell':''}">${v==null?'—':fmt(v)}</td>`,
        `<td class="${out?'bad-cell':''}">${d==null?'—':(d>0?`+${fmt(d)}`:fmt(d))}</td>`
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

  const allSel = document.getElementById("allFbSelect");
  allSel.innerHTML = "";
  markersInfo.forEach(m => allSel.innerHTML += `<option value="${m.id}">${m.name}</option>`);
}

/* ===== 初始化 ===== */
(async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get("project");
  const assignmentKey = urlParams.get("assignment"); // assignment1 / assignment2

  if (!projectId || !assignmentKey) {
    console.warn("缺少 project 或 assignment 参数");
    return;
  }

  await loadRubricDescriptions(projectId);

  try {
    const res = await fetch(`/api/uploads/project/${projectId}/latest-ids`);
    const data = await res.json();

    let assignmentId = null;
    if (assignmentKey === "assignment1" && data.assignment1) {
      assignmentId = data.assignment1.assignment_id;
    } else if (assignmentKey === "assignment2" && data.assignment2) {
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

    loadModerationReport(assignmentId);
  } catch (err) {
    console.error("初始化失败:", err);
  }
})();

/* ===== Marker切换事件 ===== */
markerSelect.addEventListener('change', e=>{
  const selected = e.target.value;
  renderAlignment(selected);
  renderDifferences(selected);
});
/* ===== 单 marker Feedback 事件绑定 ===== */
const fbTextarea = document.getElementById('fbTextarea');
const fbSend = document.getElementById('fbSend');
const fbHint = document.getElementById('fbHint');

// 保存当前选中的 marker ID
let currentMarkerId = null;

// 当用户选择单个 marker 时，更新 currentMarkerId 并显示 feedback 区域
document.getElementById('markerSelect').addEventListener('change', e => {
  const selected = e.target.value;
  currentMarkerId = selected !== 'all' ? selected : null;

  if (currentMarkerId) {
    console.log(`✅ Marker selected: ${currentMarkerId}`);
    document.getElementById('feedback').classList.remove('hidden');
    document.getElementById('diffSection').classList.remove('hidden');
    document.getElementById('allDiffSection').classList.add('hidden');
    document.getElementById('allFeedback').classList.add('hidden');
    document.getElementById('fbTitle').textContent = `Feedback for Marker ${currentMarkerId}`;
  } else {
    console.log('📋 Showing all markers view');
    document.getElementById('feedback').classList.add('hidden');
    document.getElementById('diffSection').classList.add('hidden');
    document.getElementById('allDiffSection').classList.remove('hidden');
    document.getElementById('allFeedback').classList.remove('hidden');
  }
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
        title: `Feedback for Marker ${currentMarkerId}`,
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
        title: `Feedback for Marker ${markerId}`,
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

