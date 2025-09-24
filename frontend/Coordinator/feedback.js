/* ===== 全局变量 ===== */
let rows = []; // 先设为空，后面从后端拿数据
const markerKeys = ["A","B","C","D","E","F","G","H","I","J"];

/* ===== DOM 元素 ===== */
const alignBody   = document.querySelector('#alignmentTable tbody');
const alignHeader = document.getElementById('alignHeader');
const diffSection = document.getElementById('diffSection');
const diffBody    = document.querySelector('#differenceTable tbody');
const diffHeader  = document.getElementById('diffHeader');
const markerSelect= document.getElementById('markerSelect');

const fbWrap      = document.getElementById('feedback');
const fbTitle     = document.getElementById('fbTitle');
const fbTextarea  = document.getElementById('fbTextarea');
const fbSave      = document.getElementById('fbSave');
const fbSend      = document.getElementById('fbSend');
const fbClear     = document.getElementById('fbClear');
const fbHint      = document.getElementById('fbHint');

const allDiffSection = document.getElementById('allDiffSection');
const allDiffHeader  = document.getElementById('allDiffHeader');
const markerSummary  = document.getElementById('markerSummary');
const summaryText    = document.getElementById('summaryText');
const allMarkersSummary = document.getElementById('allMarkersSummary');
const allMarkersSummaryText = document.getElementById('allMarkersSummaryText');
const allDiffBody    = document.querySelector('#allDifferenceTable tbody');

const allFbSelect   = document.getElementById('allFbSelect');
const allFbTextarea = document.getElementById('allFbTextarea');
const allFbSend     = document.getElementById('allFbSend');
const allFbHint     = document.getElementById('allFbHint');

/* ===== helpers ===== */
function fmt(n){ const v=Number(n); if(Number.isNaN(v)) return ''; return (v%1===0)? v.toString() : v.toFixed(2); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function isOut(v, lo, hi){ return v<lo || v>hi; }

/* ===== API 调用 ===== */
async function loadAnalysis() {
  try {
    const res = await fetch('/api/analysis');
    if (!res.ok) throw new Error("Failed to fetch analysis");
    const data = await res.json();
    return data.rows;
  } catch (err) {
    console.error("Error loading analysis:", err);
    return [];
  }
}

async function loadUser() {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) throw new Error("Failed to fetch user");
    const data = await res.json();
    return data.name;
  } catch (err) {
    console.error("Error loading user:", err);
    return "Unknown User";
  }
}

async function sendFeedback(marker, text) {
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marker, text })
    });
    return await res.json();
  } catch (err) {
    console.error("Error sending feedback:", err);
    return { success: false };
  }
}

/* ===== alignment (main) ===== */
function renderAlignment(selected='all'){
  let headers = ["Criterion","Unit Chair","Range 5% Lower","Range 5% Upper"];
  if(selected==='all') headers = headers.concat(markerKeys.map(k=>`Marker ${k}`)); else headers.push(`Marker ${selected}`);
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
      markerKeys.forEach(k=>{
        const v=r.markers?.[k];
        if(v==null) tds.push('<td class="muted">–</td>');
        else tds.push(`<td class="${isOut(v,r.lower,r.upper)?'bad-cell':''}">${fmt(v)}</td>`);
      });
    }else{
      const v=r.markers?.[selected];
      if(v==null) tds.push('<td class="muted">–</td>');
      else tds.push(`<td class="${isOut(v,r.lower,r.upper)?'bad-cell':''}">${fmt(v)}</td>`);
    }
    tds.push(`<td>${r.total==null?'<span class="muted">—</span>':fmt(r.total)}</td>`);
    const tr=document.createElement('tr'); tr.innerHTML=tds.join(''); alignBody.appendChild(tr);
  });
}

/* ===== differences (single marker) ===== */
function renderDifferences(selected){
  if(selected==='all'){ diffSection.classList.add('hidden'); diffBody.innerHTML=''; diffHeader.innerHTML=''; return; }
  diffSection.classList.remove('hidden'); diffHeader.innerHTML=''; diffBody.innerHTML='';
  diffHeader.innerHTML = [ 'Criterion', 'Percent', `Marker ${selected}`, 'Difference' ]
    .map(h=>`<th>${h}</th>`).join('');
  rows.forEach(r=>{
    const v=r.markers?.[selected];
    const d=(v==null? null : Number((v - r.chair).toFixed(2)));
    const diffCell = (d==null? '—' : (d>0? `+${fmt(d)}` : fmt(d)));
    const cls = (v==null? '' : (isOut(v,r.lower,r.upper)?'bad-cell':''));    
    const tr = `<tr>
      <td>${escapeHtml(r.criterion)}</td>
      <td>${r.percent!=null? fmt(r.percent): ''}</td>
      <td class="${cls}">${v==null?'—':fmt(v)}</td>
      <td>${d==null?'—':diffCell}</td>
    </tr>`;
    diffBody.insertAdjacentHTML('beforeend', tr);
  });
}

/* ===== 这里省略 renderAllDifferences / generateMarkerSummary / generateAllMarkersSummary ...（跟你原来一样，不用动） ===== */

/* ===== events ===== */
document.getElementById('markerSelect').addEventListener('change', e=>{
  const m=e.target.value;
  renderAlignment(m);
  renderDifferences(m);
  renderAllDifferences(m==='all');
  showFeedback(m);
  generateMarkerSummary(m);
  if(m === 'all'){
    generateAllMarkersSummary();
  }
});

document.getElementById('fbSend').addEventListener('click', async ()=>{
  const m=markerSelect.value; 
  if(m==='all'){ 
    setHint(fbHint, 'Please select a specific marker to send feedback.'); 
    return; 
  }
  const text = fbTextarea.value.trim();
  if(!text){ 
    setHint(fbHint, 'Please enter feedback before sending.'); 
    return; 
  }
  const res = await sendFeedback(m, text);
  if(res.success){
    setHint(fbHint, `Feedback sent to Marker ${m} ✓`);
    fbTextarea.value = '';
  }else{
    setHint(fbHint, 'Failed to send feedback.');
  }
});

/* ===== init ===== */
(async function init(){
  rows = await loadAnalysis();
  const userName = await loadUser();
  document.getElementById("username").textContent = userName;

  renderAlignment('all');
  renderAllDifferences(true);
  generateAllMarkersSummary();
})();
