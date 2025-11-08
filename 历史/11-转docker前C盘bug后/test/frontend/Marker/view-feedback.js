// view-feedback.js — 显示Marker的分数对比和反馈
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('backBtn')?.addEventListener('click', () => history.back());
    loadFeedback();
});

async function loadFeedback(){
  const url = new URL(location.href);
  const taskId = url.searchParams.get('task') || 'assignment-1';
  const assignmentId = url.searchParams.get('assignment') || 'assignment-1';

  const metaEl = document.getElementById('feedback-meta');
  const tbody = document.getElementById('feedback-body');
  const markerScoreEl = document.getElementById('marker-score');
  const coordinatorScoreEl = document.getElementById('coordinator-score');
  const scoreDifferenceEl = document.getElementById('score-difference');
  const coordinatorFeedbackEl = document.getElementById('coordinator-feedback');
  const markerCommentsEl = document.getElementById('marker-comments');

  let data;
  try {
    // 后端API：GET /api/feedback/:taskId 返回反馈数据结构
    const res = await fetch(`/api/feedback/${encodeURIComponent(taskId)}`);
    if (!res.ok) throw new Error('Failed to fetch feedback data');
    data = await res.json();
  } catch (error) {
    console.error('Error loading feedback:', error);
    data = demoFeedback(); // 接口未通时兜底
  }

  // 顶部 meta
  metaEl.innerHTML = `
    <div style="font-size: 16px; font-weight: 500; color: var(--text); margin-bottom: 2px;">
      ${data.year} · Semester ${data.semester} · ${data.assignment}
    </div>
    <div style="font-size: 14px; color: var(--muted); font-weight: 400;">
      Due: ${data.due} • Feedback Date: ${data.feedbackDate}
    </div>
  `;

  // 计算总分
  const markerTotal = data.criteria.reduce((sum, c) => sum + (c.markerScore || 0), 0);
  const coordinatorTotal = data.criteria.reduce((sum, c) => sum + (c.coordinatorScore || 0), 0);
  const totalMax = data.criteria.reduce((sum, c) => sum + (c.max || 0), 0);
  const difference = coordinatorTotal - markerTotal;

  // 更新总分显示
  markerScoreEl.textContent = `${markerTotal}/${totalMax}`;
  coordinatorScoreEl.textContent = `${coordinatorTotal}/${totalMax}`;
  
  // 更新分差显示
  scoreDifferenceEl.textContent = difference > 0 ? `+${difference}` : `${difference}`;
  scoreDifferenceEl.className = 'difference-value';
  
  if (Math.abs(difference) > 5) {
    scoreDifferenceEl.classList.add('large-diff');
  } else if (difference > 0) {
    scoreDifferenceEl.classList.add('positive');
  } else if (difference < 0) {
    scoreDifferenceEl.classList.add('negative');
  } else {
    scoreDifferenceEl.classList.add('neutral');
  }

  // 渲染表格
  tbody.innerHTML = '';
  data.criteria.forEach((c, idx) => {
    const tr = document.createElement('tr');
    const markerScore = c.markerScore || 0;
    const coordinatorScore = c.coordinatorScore || 0;
    const diff = coordinatorScore - markerScore;

    // 左侧 criteria
    const td0 = td();
    td0.innerHTML = `
      <div class="criterion-title">${idx+1}. ${esc(c.title)}</div>
      ${c.subtitle ? `<div class="criterion-subtitle">${esc(c.subtitle)}</div>` : ''}
      ${c.note ? `<div class="criterion-note">${esc(c.note)}</div>` : ''}
    `;
    tr.appendChild(td0);

    // Marker Score
    const td1 = td();
    td1.className = 'score-cell score-marker';
    td1.innerHTML = `${markerScore}/${c.max || 0}`;
    tr.appendChild(td1);

    // Coordinator Score
    const td2 = td();
    td2.className = 'score-cell score-coordinator';
    td2.innerHTML = `${coordinatorScore}/${c.max || 0}`;
    tr.appendChild(td2);

    // Difference
    const td3 = td();
    td3.className = 'difference-cell';
    const diffText = diff > 0 ? `+${diff}` : `${diff}`;
    td3.innerHTML = `<span class="${getDifferenceClass(diff)}">${diffText}</span>`;
    tr.appendChild(td3);

    // Feedback
    const td4 = td();
    td4.className = 'feedback-text-cell';
    td4.innerHTML = `
      <div class="feedback-item">
        <div class="feedback-source">Coordinator</div>
        <div class="feedback-content">${esc(c.coordinatorFeedback || 'No feedback provided')}</div>
      </div>
      <div class="feedback-item">
        <div class="feedback-source">Your Comments</div>
        <div class="feedback-content">${esc(c.markerComments || 'No comments provided')}</div>
      </div>
    `;
    tr.appendChild(td4);

    tbody.appendChild(tr);
  });

  // 更新文本反馈
  coordinatorFeedbackEl.textContent = data.coordinatorFeedback || 'No detailed feedback provided.';
  if (!data.coordinatorFeedback) {
    coordinatorFeedbackEl.classList.add('empty');
  }

  markerCommentsEl.textContent = data.markerComments || 'No comments provided.';
  if (!data.markerComments) {
    markerCommentsEl.classList.add('empty');
  }
}

function getDifferenceClass(diff) {
  if (Math.abs(diff) > 5) {
    return 'difference-large';
  } else if (diff > 0) {
    return 'difference-positive';
  } else if (diff < 0) {
    return 'difference-negative';
  } else {
    return 'difference-neutral';
  }
}

/* ===== Helpers ===== */
function td(){ const e = document.createElement('td'); return e; }
function esc(s){ return String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

/* ===== Demo data (接口未通时使用) ===== */
function demoFeedback(){
  return {
    year: '2025',
    semester: '1',
    assignment: 'Assignment 1',
    due: 'Tue Sep 16, 2025 10:00',
    feedbackDate: 'Wed Sep 17, 2025 14:30',
    criteria: [
      {
        title:'Introduction: Applies theoretical framework to topic',
        subtitle: 'Clear justification and framework application',
        max: 15,
        markerScore: 12,
        coordinatorScore: 15,
        coordinatorFeedback: 'Good theoretical framework application, but could be more comprehensive in justification.',
        markerComments: 'Applied cognitive load theory effectively to explain the phenomenon.'
      },
      {
        title:'Introduction: Locates, synthesises and critically analyses literature',
        subtitle: 'Literature review quality and critical analysis',
        max: 10,
        markerScore: 8,
        coordinatorScore: 7,
        coordinatorFeedback: 'Literature review is adequate but lacks critical analysis depth.',
        markerComments: 'Found relevant contemporary papers and synthesized key findings well.'
      },
      {
        title:'Results: Develops significant themes',
        subtitle: 'Theme development and analysis quality',
        max: 10,
        markerScore: 6,
        coordinatorScore: 9,
        coordinatorFeedback: 'Excellent theme development with clear progression and insightful analysis.',
        markerComments: 'Identified main themes but could have developed them more thoroughly.'
      },
      {
        title:'Discussion: Critical evaluation and implications',
        subtitle: 'Critical thinking and practical implications',
        max: 15,
        markerScore: 10,
        coordinatorScore: 8,
        coordinatorFeedback: 'Good critical evaluation but implications could be more practical.',
        markerComments: 'Provided thorough critical analysis with clear implications for practice.'
      }
    ],
    coordinatorFeedback: 'Overall, this is a solid piece of work with good theoretical grounding and clear writing. The main areas for improvement are in the literature review section where more critical analysis would strengthen the argument, and in the results section where theme development could be more comprehensive. The discussion shows good critical thinking skills.',
    markerComments: 'I found this assignment challenging but rewarding to mark. The student demonstrated good understanding of the theoretical concepts and applied them effectively. The writing was clear and well-structured throughout.'
  };
}
