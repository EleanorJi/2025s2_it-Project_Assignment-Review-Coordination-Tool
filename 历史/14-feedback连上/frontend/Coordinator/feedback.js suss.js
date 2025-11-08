/* ===== 全局变量 ===== */
let rows = [];
let markerKeys = [];
let markersInfo = [];
let rubricDescriptions = {}; // 新增：保存 rubric description

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
      (c.marker_scores || []).forEach(ms => {
        markersObj[ms.marker_id] = ms.score;
      });
      return {
        criterion: `${c.title} / ${c.max_score}`,
        title: c.title,
        chair: c.baseline_score,
        lower: c.range_lower,
        upper: c.range_upper,
        percent: c.baseline_percentage,
        markers: markersObj,
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
  } else {
    const m = markersInfo.find(mi=>mi.id==selected);
    headers.push(m ? m.name : `Marker ${selected}`);
  }
  headers.push('Total');
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
    } else {
      const v=r.markers?.[selected];
      if(v==null) tds.push('<td class="muted">–</td>');
      else tds.push(`<td class="${isOut(v,r.lower,r.upper)?'bad-cell':''}">${fmt(v)}</td>`);
    }
    tds.push(`<td>${r.total==null?'<span class="muted">—</span>':fmt(r.total)}</td>`);
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
    document.getElementById('feedback').classList.remove('hidden');
    document.getElementById('diffSection').classList.remove('hidden');
    document.getElementById('allDiffSection').classList.add('hidden');
    document.getElementById('allFeedback').classList.add('hidden');
    document.getElementById('fbTitle').textContent = `Feedback for Marker ${currentMarkerId}`;
  } else {
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
    // ⚡ 这里你可以替换成真实后端 API，例如:
    // await fetch(`/api/feedback/${currentMarkerId}`, { method: 'POST', body: JSON.stringify({ content }), headers: {'Content-Type':'application/json'} });
    console.log(`✅ Feedback sent for Marker ${currentMarkerId}:`, content);

    fbHint.textContent = '✅ Feedback sent successfully!';
    setTimeout(() => (fbHint.textContent = ''), 3000);
  } catch (err) {
    console.error('❌ Failed to send feedback:', err);
    fbHint.textContent = '❌ Failed to send feedback';
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
    // ⚡ 同样，这里替换为你后端的实际接口
    // await fetch(`/api/feedback/${markerId}`, { method: 'POST', body: JSON.stringify({ content }), headers: {'Content-Type':'application/json'} });
    console.log(`✅ Feedback sent for Marker ${markerId}:`, content);

    allFbHint.textContent = '✅ Feedback sent successfully!';
    setTimeout(() => (allFbHint.textContent = ''), 3000);
  } catch (err) {
    console.error('❌ Failed to send feedback:', err);
    allFbHint.textContent = '❌ Failed to send feedback';
  } finally {
    allFbSend.disabled = false;
  }
});

