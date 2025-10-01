/* ===== 全局变量 ===== */
let rows = [];           // 保存后端返回的criteria数据
let markerKeys = [];     // 保存所有marker的id
let markersInfo = [];    // 保存 {id, name} 用于下拉框显示

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

/* ===== 从后端加载数据 ===== */
async function loadModerationReport(assignmentId) {
  try {
    const res = await fetch(`/api/uploads/assignments/${assignmentId}/moderation-report`);
    const data = await res.json();
    if (data.error) {
      console.error("加载报告失败:", data.error);
      return;
    }

    // 保存 markers 信息
    markersInfo = data.totals.marker_totals.map(m => ({
      id: m.marker_id,
      name: m.marker_name || `Marker ${m.marker_id}`
    }));
    markerKeys = markersInfo.map(m => m.id);

    // 转换 criteria 数据
    rows = data.criteria.map(c => {
      const markersObj = {};
      (c.marker_scores || []).forEach(ms => {
        markersObj[ms.marker_id] = ms.score;
      });
      return {
        criterion: `${c.title} / ${c.max_score}${c.description ? " — " + c.description : ""}`,
        chair: c.baseline_score,
        lower: c.range_lower,
        upper: c.range_upper,
        percent: c.baseline_percentage,
        markers: markersObj,
        total: null
      };
    });

    // 添加总分行
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
      total: null
    });

    // 渲染表格
    renderAlignment('all');
    renderAllDifferences(true);

    // 更新下拉框（Marker选择）
    const sel = document.getElementById("markerSelect");
    sel.innerHTML = `<option value="all">All Markers</option>`;
    markersInfo.forEach(m => {
      sel.innerHTML += `<option value="${m.id}">${m.name}</option>`;
    });

    // 更新下拉框（发送反馈选择）
    const allSel = document.getElementById("allFbSelect");
    allSel.innerHTML = "";
    markersInfo.forEach(m => {
      allSel.innerHTML += `<option value="${m.id}">${m.name}</option>`;
    });

  } catch (err) {
    console.error("获取 moderation report 出错:", err);
  }
}

/* ===== Alignment Table 渲染 ===== */
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
      `<td>${escapeHtml(r.criterion)}</td>`,
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

/* ===== Differences Table (All markers) ===== */
function renderAllDifferences(visible){
  if(!visible){
    allDiffSection.classList.add('hidden');
    allDiffHeader.innerHTML=''; allDiffBody.innerHTML='';
    return;
  }
  allDiffSection.classList.remove('hidden');
  allDiffHeader.innerHTML=''; allDiffBody.innerHTML='';

  const headers = ['Criterion','Percent'];
  markerKeys.forEach(id=>{
    const m = markersInfo.find(mi=>mi.id===id);
    headers.push(m ? m.name : `Marker ${id}`);
    headers.push('Difference');
  });
  allDiffHeader.innerHTML = headers.map(h=>`<th>${h}</th>`).join('');

  rows.forEach(r=>{
    const cells = [
      `<td style="text-align:left">${escapeHtml(r.criterion)}</td>`,
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
}

/* ===== 事件绑定 ===== */
document.getElementById('markerSelect').addEventListener('change', e=>{
  const m=e.target.value;
  renderAlignment(m);
  renderAllDifferences(m==='all');
});

/* ===== 初始化 ===== */
/* ===== 初始化 ===== */
(async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get("project");
  const assignmentKey = urlParams.get("assignment"); // "assignment1" 或 "assignment2"

  if (!projectId || !assignmentKey) {
    console.warn("缺少 project 或 assignment 参数");
    return;
  }

  try {
    // 调用后端接口获取最新的 assignment id
    const res = await fetch(`/api/uploads/project/${projectId}/latest-ids`);
    const data = await res.json();

    if (data.error) {
      console.error("获取 latest-ids 失败:", data.error);
      return;
    }

    // 取真实 assignment_id
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

    // 加载 moderation report
    loadModerationReport(assignmentId);

  } catch (err) {
    console.error("初始化失败:", err);
  }
})();
