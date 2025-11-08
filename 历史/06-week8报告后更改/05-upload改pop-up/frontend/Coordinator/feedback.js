/* ===== dataset (aligned with your screenshots) ===== */
const rows = [
    { criterion: "Introduction: Applies theoretical framework / 15", chair: 10.65, lower: 9.9,  upper: 11.4,  percent:71, markers:{A:10.2,  B:12,    C:10,   D:11.505, E:9.75,  F:11.25, G:10.5,  H:11.25, I:7.5,  J:11.25}, total: 69 },
    { criterion: "Introduction: Locates, synthesises and critically analyses literature / 10", chair: 6.00, lower: 5.5,  upper: 6.5,  percent:60, markers:{A:5.9,   B:7,     C:6.5,  D:7.25,  E:6.5,   F:6.5,   G:6.5,   H:6.5,   I:5.5,  J:6.5 }, total: 66 },
    { criterion: "Results: Develops significant themes / 20", chair: 13.4, lower: 12.4, upper: 14.4, percent:67, markers:{A:12.6, B:15,    C:17.5, D:13.34, E:12.6,  F:14,    G:13.6,  H:14.4,  I:11,   J:13 }, total: 74.25 },
    { criterion: "Results: Supports themes with illustrative quotes / 15", chair: 12.45, lower: 11.7, upper: 13.2, percent:83, markers:{A:10.65,B:11.25,C:15,   D:11.25, E:9,     F:11.55, G:10.2,  H:10.5,  I:7.5,  J:11.25}, total: 78.5 },
    { criterion: "Discussion: Summarises and interprets key findings / 20", chair: 11.6, lower: 10.6, upper: 12.6, percent:58, markers:{A:12,   B:13,   C:13,   D:13,    E:12,    F:13,    G:13.6,  H:13,    I:10.6, J:12 }, total: 70.345 },
    { criterion: "Discussion: Synthesises study strengths, limitations, and implications / 10", chair: 7.0,  lower: 6.5, upper: 7.5, percent:70, markers:{A:7.5,  B:8,     C:10,   D:6.5,   E:6.7,   F:7.5,   G:7.5,   H:7,     I:6.5,  J:8 },  total: 64.25 },
    { criterion: "Clearly communicates and references scientific literature / 10", chair: 7.8,  lower: 7.3, upper: 8.3, percent:78, markers:{A:7,    B:8,     C:6.5,  D:7.5,   E:7.7,   F:7.7,   G:7.5,   H:7,     I:7.5,  J:7.5 }, total: 71.5 },
    { criterion: "Total / 100", chair: 69,   lower: 66.5, upper: 71.5, percent:69, markers:{A:66,   B:74.25,C:78.5, D:70.345,E:64.25,F:71.5, G:69.4,  H:69.65, I:56.1, J:69.5}, total: null }
  ];
  const markerKeys = ["A","B","C","D","E","F","G","H","I","J"];
  
  // DOM
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
  
  /* ===== differences (All markers) ===== */
  function allDiffValue(percent, markerVal){
    if(markerVal==null || percent==null) return null;
    return Number((markerVal - percent).toFixed(2));
  }
  function renderAllDifferences(visible){
    if(!visible){
      allDiffSection.classList.add('hidden');
      allDiffHeader.innerHTML=''; allDiffBody.innerHTML='';
      return;
    }
    allDiffSection.classList.remove('hidden');
    allDiffHeader.innerHTML=''; allDiffBody.innerHTML='';
  
    const headers = ['Criterion','Percent'];
    markerKeys.forEach(k=>{ headers.push(`Marker ${k}`); headers.push('Difference'); });
    allDiffHeader.innerHTML = headers.map(h=>`<th>${h}</th>`).join('');
  
    rows.forEach(r=>{
      const cells = [
        `<td style="text-align:left">${escapeHtml(r.criterion)}</td>`,
        `<td>${fmt(r.percent)}</td>`
      ];
      markerKeys.forEach(k=>{
        const v = r.markers?.[k];
        const d = allDiffValue(r.percent, v);
        const out = (v!=null) && isOut(v, r.lower, r.upper);
        cells.push(`<td class="${out?'bad-cell':''}">${v==null?'—':fmt(v)}</td>`);
        cells.push(`<td class="${out?'bad-cell':''}">${d==null?'—':(d>0?`+${fmt(d)}`:fmt(d))}</td>`);
      });
      const tr = document.createElement('tr');
      tr.innerHTML = cells.join('');
      allDiffBody.appendChild(tr);
    });
  }
  
  /* ===== feedback (local draft) ===== */
  function fbKey(m){ return `coord_feedback_${m}`; }
  function loadFb(m){ return localStorage.getItem(fbKey(m)) || ''; }
  function saveFb(m,t){ localStorage.setItem(fbKey(m), t); setHint(fbHint,'Draft saved'); }
  function clearFb(m){ localStorage.removeItem(fbKey(m)); fbTextarea.value=''; setHint(fbHint,'Cleared'); }
  function showFeedback(m){
    if(m==='all'){ fbWrap.classList.add('hidden'); return; }
    fbWrap.classList.remove('hidden');
    fbTitle.textContent = `Marker ${m}`;
    fbTextarea.value = loadFb(m);
  }
  function setHint(el, text){ el.textContent=text; setTimeout(()=> el.textContent='',1200); }
  
  /* ===== marker summary ===== */
  function generateMarkerSummary(marker){
    if(marker === 'all'){
      markerSummary.classList.add('hidden');
      return;
    }
    
    markerSummary.classList.remove('hidden');
    
    // 计算该marker的统计数据
    const markerData = rows.map(r => ({
      criterion: r.criterion,
      chair: r.chair,
      marker: r.markers?.[marker],
      percent: r.percent
    })).filter(d => d.marker !== null && d.marker !== undefined);
    
    if(markerData.length === 0){
      summaryText.textContent = `No data available for Marker ${marker}.`;
      return;
    }
    
    // 计算平均分和与chair的差异
    const totalScore = markerData.reduce((sum, d) => sum + d.marker, 0);
    const avgScore = totalScore / markerData.length;
    const chairAvg = markerData.reduce((sum, d) => sum + d.chair, 0) / markerData.length;
    const diffFromChair = avgScore - chairAvg;
    
    // 计算一致性（与chair评分的差异程度）
    const differences = markerData.map(d => Math.abs(d.marker - d.chair));
    const avgDifference = differences.reduce((sum, d) => sum + d, 0) / differences.length;
    
    // 计算最高和最低分
    const maxScore = Math.max(...markerData.map(d => d.marker));
    const minScore = Math.min(...markerData.map(d => d.marker));
    
    // 生成总结文本
    let summary = `Marker ${marker} shows `;
    
    if(diffFromChair > 1){
      summary += `a tendency to score higher than the chair (${diffFromChair.toFixed(1)} points above average). `;
    } else if(diffFromChair < -1){
      summary += `a tendency to score lower than the chair (${Math.abs(diffFromChair).toFixed(1)} points below average). `;
    } else {
      summary += `scores that are generally aligned with the chair's expectations. `;
    }
    
    if(avgDifference < 1){
      summary += `The marker demonstrates excellent consistency with the chair's scoring (average difference: ${avgDifference.toFixed(1)} points). `;
    } else if(avgDifference < 2){
      summary += `The marker shows good consistency with the chair's scoring (average difference: ${avgDifference.toFixed(1)} points). `;
    } else {
      summary += `The marker shows some variation from the chair's scoring (average difference: ${avgDifference.toFixed(1)} points). `;
    }
    
    summary += `Overall score range: ${minScore.toFixed(1)} - ${maxScore.toFixed(1)} points.`;
    
    summaryText.textContent = summary;
  }
  
  /* ===== all markers summary ===== */
  function generateAllMarkersSummary(){
    // 计算所有marker的统计数据
    const markerStats = markerKeys.map(marker => {
      const markerData = rows.map(r => ({
        criterion: r.criterion,
        chair: r.chair,
        marker: r.markers?.[marker],
        percent: r.percent
      })).filter(d => d.marker !== null && d.marker !== undefined);
      
      if(markerData.length === 0) return null;
      
      const totalScore = markerData.reduce((sum, d) => sum + d.marker, 0);
      const avgScore = totalScore / markerData.length;
      const chairAvg = markerData.reduce((sum, d) => sum + d.chair, 0) / markerData.length;
      const diffFromChair = avgScore - chairAvg;
      
      const differences = markerData.map(d => Math.abs(d.marker - d.chair));
      const avgDifference = differences.reduce((sum, d) => sum + d, 0) / differences.length;
      
      return {
        marker,
        avgScore,
        diffFromChair,
        avgDifference,
        totalScore: markerData.reduce((sum, d) => sum + d.marker, 0)
      };
    }).filter(Boolean);
    
    if(markerStats.length === 0){
      allMarkersSummaryText.textContent = 'No data available for analysis.';
      return;
    }
    
    // 找出表现最好和最差的marker
    const bestMarker = markerStats.reduce((best, current) => 
      Math.abs(current.diffFromChair) < Math.abs(best.diffFromChair) ? current : best
    );
    
    const worstMarker = markerStats.reduce((worst, current) => 
      Math.abs(current.diffFromChair) > Math.abs(worst.diffFromChair) ? current : worst
    );
    
    // 计算整体统计
    const avgDeviation = markerStats.reduce((sum, m) => sum + Math.abs(m.diffFromChair), 0) / markerStats.length;
    const consistentMarkers = markerStats.filter(m => m.avgDifference < 1.5).length;
    const totalMarkers = markerStats.length;
    
    // 生成总结文本
    let summary = `Analysis of ${totalMarkers} markers shows `;
    
    if(avgDeviation < 1){
      summary += `excellent overall alignment with chair expectations (average deviation: ${avgDeviation.toFixed(1)} points). `;
    } else if(avgDeviation < 2){
      summary += `good overall alignment with chair expectations (average deviation: ${avgDeviation.toFixed(1)} points). `;
    } else {
      summary += `some variation from chair expectations (average deviation: ${avgDeviation.toFixed(1)} points). `;
    }
    
    summary += `Most consistent marker: ${bestMarker.marker} (${bestMarker.diffFromChair.toFixed(1)} points from chair average). `;
    summary += `Most variable marker: ${worstMarker.marker} (${worstMarker.diffFromChair.toFixed(1)} points from chair average). `;
    summary += `${consistentMarkers}/${totalMarkers} markers show good consistency (within 1.5 points of chair scores).`;
    
    allMarkersSummaryText.textContent = summary;
  }
  
  /* ===== events ===== */
  document.getElementById('backBtn').addEventListener('click', ()=>{
    const current = markerSelect.value;
    if(current === 'all'){
      history.back();
    }else{
      markerSelect.value = 'all';
      markerSelect.dispatchEvent(new Event('change'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
  
  document.getElementById('exportCsv').addEventListener('click', ()=>{
    const m = markerSelect.value;
    let cols=["Criterion","Unit Chair","Range 5% Lower","Range 5% Upper"]; 
    if(m==='all') cols=cols.concat(markerKeys.map(k=>`Marker ${k}`)); else cols.push(`Marker ${m}`); 
    cols.push('Total');
    let csv = cols.join(',')+"\n";
    rows.forEach(r=>{
      const base=[r.criterion,r.chair,r.lower,r.upper];
      if(m==='all') csv += base.concat(markerKeys.map(k=> r.markers?.[k] ?? ''), [r.total??'']).join(',')+"\n";
      else csv += base.concat([r.markers?.[m] ?? '', r.total??'']).join(',')+"\n";
    });
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=`analysis_${m}.csv`; a.click();
    URL.revokeObjectURL(url);
  });
  
  // Send feedback (All view) — 这里先用 localStorage 模拟，接上后端时把注释替换为真实 API
  document.getElementById('allFbSend').addEventListener('click', ()=>{
    const marker = allFbSelect.value;
    const text   = allFbTextarea.value.trim();
    if(!text){ setHint(allFbHint,'Please enter a comment before sending.'); return; }
  
    // 示例：接后端时改为
    // fetch('/api/feedback', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ marker, text }) })
  
    localStorage.setItem(`coord_feedback_${marker}`, text);
    setHint(allFbHint, `Sent to Marker ${marker} ✓`);
    allFbTextarea.value='';
  });
  
  document.getElementById('fbSave').addEventListener('click', ()=>{
    const m=markerSelect.value; if(m!=='all') saveFb(m, fbTextarea.value);
  });
  
  document.getElementById('fbSend').addEventListener('click', ()=>{
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
    
    // 模拟发送反馈到后端
    // 实际实现时替换为真实的API调用
    // fetch('/api/feedback', { 
    //   method:'POST', 
    //   headers:{'Content-Type':'application/json'}, 
    //   body: JSON.stringify({ marker: m, text }) 
    // })
    
    // 使用localStorage模拟发送
    localStorage.setItem(`coord_feedback_${m}`, text);
    setHint(fbHint, `Feedback sent to Marker ${m} ✓`);
    fbTextarea.value = '';
  });
  
  document.getElementById('fbClear').addEventListener('click', ()=>{
    const m=markerSelect.value; if(m!=='all') clearFb(m);
  });
  
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
  
  // init
  // ✅ 显示用户名
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
  renderAlignment('all');
  renderAllDifferences(true);
  generateAllMarkersSummary();
  