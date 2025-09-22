// rubric.js — 拉取后端数据并渲染到表格
document.addEventListener('DOMContentLoaded', () => {
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
    document.getElementById('backBtn')?.addEventListener('click', () => history.back());
    loadRubric();
  });
  
  async function loadRubric(){
    const url = new URL(location.href);
    const rubricId = url.searchParams.get('rubric') || 'demo';
  
    const metaEl  = document.getElementById('rubric-meta');
    const tbody   = document.getElementById('rubric-body');
  
    let data;
    try {
      // 后端API：GET /api/rubrics/:id 返回rubric数据结构
      const res = await fetch(`/api/rubrics/${encodeURIComponent(rubricId)}`);
      if (!res.ok) throw new Error('Failed to fetch rubric data');
      data = await res.json();
    } catch (error) {
      console.error('Error loading rubric:', error);
      data = demoRubric(); // 接口未通时兜底
    }
  
    // 顶部 meta - 低调的样式
    metaEl.innerHTML = `
      <div style="font-size: 16px; font-weight: 500; color: var(--text); margin-bottom: 2px;">
        ${data.year} · Semester ${data.semester} · ${data.assignment}
      </div>
      <div style="font-size: 14px; color: var(--muted); font-weight: 400;">
        Due: ${data.due}
      </div>
    `;
  
    // 渲染表格
    tbody.innerHTML = '';
    data.criteria.forEach((c, idx) => {
      const tr = document.createElement('tr');
  
      // 左侧 criteria
      const td0 = td();
      td0.innerHTML = `
        <div class="criterion-title">${idx+1}. ${esc(c.title)}</div>
        ${c.subtitle ? `<div style="font-weight:700">${esc(c.subtitle)}</div>` : ''}
        ${c.note ? `<div class="meta" style="margin-top:6px">${esc(c.note)}</div>` : ''}
      `;
      tr.appendChild(td0);
  
      // HD / D / C / P / F
      ['hd','d','c','p','f'].forEach(level => {
        const cell = td();
        const it = (c.levels && c.levels[level]) || {};
        if (it.points !== undefined && it.points !== null) {
          cell.innerHTML += `<div class="badge">${esc(String(it.points))} points</div>`;
        }
        cell.innerHTML += `<div>${nl2br(esc(it.desc || ''))}</div>`;
        if (it.scoreRange) {
          cell.innerHTML += `<div class="score-range">${esc(it.scoreRange)}</div>`;
        }
        tr.appendChild(cell);
      });
  
      // 右侧最大分
      const tdScore = td();
      tdScore.innerHTML = `<div class="meta">/ ${esc(String(c.max ?? ''))}</div>`;
      tr.appendChild(tdScore);
  
      tbody.appendChild(tr);
    });
  }
  
  /* ===== Helpers ===== */
  function td(){ const e = document.createElement('td'); return e; }
  function esc(s){ return String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
  function nl2br(s){ return s.replace(/\n/g,'<br>'); }
  
  /* ===== Demo data (接口未通时使用，不影响后续接入) ===== */
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
  