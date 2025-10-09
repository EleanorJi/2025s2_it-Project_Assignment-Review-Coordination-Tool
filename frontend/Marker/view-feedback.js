// view-feedback.js — 显示Marker的分数对比和反馈
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('backBtn')?.addEventListener('click', () => history.back());
    init();
});

  // Initialize the interface
  async function init() {
    // ✅ 显示用户名
    try {
      const rawUser = localStorage.getItem("user");
      // console.log("User Info:", rawUser);
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

    // 获取并显示反馈数据
    const feedbackData = await fetchFeedbackData();
//    const feedbackData = demoFeedback(); // 使用demo数据测试
    console.log('Feedback Data:', feedbackData);

    loadFeedback(feedbackData);
  }

// 主函数：获取反馈数据
async function fetchFeedbackData() {
    try {
        // 获取URL参数和用户信息
        const queryParams = getQueryParams();
        const currentUser = getCurrentUser();

        // 检查必要的参数是否存在
        if (!queryParams.assignmentId) {
            throw new Error('Assignment ID not found in URL parameters');
        }

        if (!currentUser || !currentUser.userId) {
            throw new Error('User information not available');
        }

        const assignmentId = queryParams.assignmentId;
        const markerId = currentUser.userId;

        console.log('Fetching feedback for:', { assignmentId, markerId });

        // 并行获取所有需要的数据
        const [assignmentData, baselineData, markerData, feedbackData] = await Promise.all([
            fetchAssignmentData(assignmentId),
            fetchBaselineData(assignmentId),
            fetchMarkerData(assignmentId, markerId),
            fetchFeedbackContent(assignmentId, markerId)
        ]);

        // 获取项目信息
        const projectData = await fetchProjectData(assignmentData.project_id);
        console.log('projectData:', projectData);
        const projectInfo = projectData.project || {};
        // 获取rubric信息
        const rubricData = await fetchRubricDetails(projectData.rubric.rubric_id);
        console.log('rubricData:', rubricData);


        // 转换数据格式为前端需要的格式
        const transformedData = transformData(
            assignmentData,
            projectInfo,
            baselineData,
            markerData,
            feedbackData,
            rubricData
        );

        console.log('Transformed feedback data:', transformedData);
        return transformedData;

    } catch (error) {
        console.error('Error loading feedback:', error);
        // 接口出错时使用demo数据兜底
        return demoFeedback();
    }
}

// 获取rubric详情
async function fetchRubricDetails(rubricId) {
    const res = await fetch(`/api/uploads/rubric/${rubricId}/details`);
    if (!res.ok) throw new Error('Failed to fetch rubric details');
    const data = await res.json();
    return data.criteria || [];
}

// 获取assignment信息
async function fetchAssignmentData(assignmentId) {
    const res = await fetch(`/api/uploads/assignment/${assignmentId}/status`);
    if (!res.ok) throw new Error('Failed to fetch assignment data');
    const data = await res.json();
    return data.assignment;
}

// 获取项目信息
async function fetchProjectData(projectId) {
    const res = await fetch(`/api/uploads/project/${projectId}/status`);
    if (!res.ok) throw new Error('Failed to fetch project data');
    const data = await res.json();
    return data;
}

// 获取baseline分数
async function fetchBaselineData(assignmentId) {
    const res = await fetch(`/api/uploads/scoring/baseline/${assignmentId}`);
    if (!res.ok) throw new Error('Failed to fetch baseline data');
    const data = await res.json();
    // 只返回 finalized 为 true 的 baseline 分数
    return (data.baseline_scores || []).filter(score => score.finalized === true);
}

// 获取marker分数
async function fetchMarkerData(assignmentId, markerId) {
    const res = await fetch(`/api/uploads/scoring/marker/${assignmentId}/${markerId}`);
    if (!res.ok) throw new Error('Failed to fetch marker data');
    const data = await res.json();
    return data.marker_scores || [];
}


// 获取feedback内容
async function fetchFeedbackContent(assignmentId, markerId) {
    try {
        const res = await fetch(`/api/feedback/${assignmentId}/${markerId}`);
        if (!res.ok) {
            // 如果接口返回404或其他错误，返回空数组
            if (res.status === 404) {
                return [];
            }
            throw new Error('Failed to fetch feedback content');
        }
        const data = await res.json();
        return data.data || [];
    } catch (error) {
        console.warn('Failed to fetch feedback content, using empty array:', error);
        return [];
    }
}

// 数据转换函数
function transformData(assignmentData, projectData, baselineData, markerData, feedbackData, rubricData) {
  const projectName = projectData?.name || 'Unknown Project';
  const assignmentDisplayName = `${projectName} - Moderation ${assignmentData.round || 0}`;

  // 以 rubricData 为基准构建每条 criterion（更稳健）
  const criteria = (rubricData || []).map((r, index) => {
    const baseline = (baselineData || []).find(b => b.criterion_id === r.criterion_id);
    const marker = (markerData || []).find(m => m.criterion_id === r.criterion_id);

    return {
      criterion_id: r.criterion_id,
      title: baseline?.criterion_title || r.title || `Criterion ${index + 1}`,
      subtitle: r.description || '',
      max: r.max_score || baseline?.criterion_max_score || 0,
      // 用 null 表示缺失（便于后续判断），存在则为 number
      markerScore: typeof marker?.score === 'number' ? marker.score : null,
      // 只有当 baseline 存在且 finalized 时才显示 coordinator 分数
      coordinatorScore: (baseline && baseline.finalized && typeof baseline.score === 'number') ? baseline.score : null,
      coordinatorFeedback: baseline?.comment || '',
      markerComments: marker?.comment || ''
    };
  });

  return {
    assignment: assignmentDisplayName,
    due: formatDate(assignmentData.due_at) || 'Not set',
    feedbackDate: formatDate(new Date()),
    criteria,
    allFeedback: feedbackData || []
  };
}



// 从URL中获取查询参数 (assignment_id, project)
function getQueryParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    assignmentId: params.get('assignment_id'),
    project: params.get('project')
  };
}

async function loadFeedback(data){
  const url = new URL(location.href);
  const taskId = url.searchParams.get('task') || 'assignment-1';
  const assignmentId = url.searchParams.get('assignment') || 'assignment-1';

  const metaEl = document.getElementById('feedback-meta');
  const tbody = document.getElementById('feedback-body');
  const markerScoreEl = document.getElementById('marker-score');
  const coordinatorScoreEl = document.getElementById('coordinator-score');
  const scoreDifferenceEl = document.getElementById('score-difference');
  const coordinatorFeedbackEl = document.getElementById('coordinator-feedback');

  // 顶部 meta
  metaEl.innerHTML = `
    <div style="font-size: 16px; font-weight: 500; color: var(--text); margin-bottom: 2px;">
      ${data.assignment}
    </div>
    <div style="font-size: 14px; color: var(--muted); font-weight: 400;">
      Due: ${data.due} • Feedback Date: ${data.feedbackDate}
    </div>
  `;

  // --- 计算总分（只把真实存在的 number 加入总和） ---
  const markerTotal = data.criteria.reduce((sum, c) => sum + (typeof c.markerScore === 'number' ? c.markerScore : 0), 0);
  const coordinatorTotal = data.criteria.reduce((sum, c) => sum + (typeof c.coordinatorScore === 'number' ? c.coordinatorScore : 0), 0);
  const totalMax = data.criteria.reduce((sum, c) => sum + (c.max || 0), 0);

  // 是否至少有一个 finalized 的 baseline 存在
  const hasAnyBaseline = data.criteria.some(c => c.coordinatorScore !== null);

  // 更新顶部总分显示
  markerScoreEl.textContent = `${markerTotal}/${totalMax}`;
  coordinatorScoreEl.textContent = hasAnyBaseline ? `${coordinatorTotal}/${totalMax}` : "-";

  // 更新总体分差显示（只有在存在 baseline 时才计算差值）
  if (hasAnyBaseline) {
    const difference = coordinatorTotal - markerTotal;
    scoreDifferenceEl.textContent = difference > 0 ? `+${difference}` : `${difference}`;
    scoreDifferenceEl.className = 'difference-value';
    scoreDifferenceEl.classList.remove('difference-large','positive','negative','neutral');
    if (Math.abs(difference) > 5) {
      scoreDifferenceEl.classList.add('large-diff');
    } else if (difference > 0) {
      scoreDifferenceEl.classList.add('positive');
    } else if (difference < 0) {
      scoreDifferenceEl.classList.add('negative');
    } else {
      scoreDifferenceEl.classList.add('neutral');
    }
  } else {
    scoreDifferenceEl.textContent = "-";
    scoreDifferenceEl.className = "difference-value difference-neutral";
  }

  // --- 渲染表格行 ---
  tbody.innerHTML = '';
  data.criteria.forEach((c, idx) => {
    const tr = document.createElement('tr');

    // 左侧 criteria 描述
    const td0 = td();
    td0.innerHTML = `
      <div class="criterion-title">${idx+1}. ${esc(c.title)}</div>
      ${c.subtitle ? `<div class="criterion-subtitle">${esc(c.subtitle)}</div>` : ''}
      ${c.note ? `<div class="criterion-note">${esc(c.note)}</div>` : ''}
    `;
    tr.appendChild(td0);

    // Marker 分数显示（如果缺失显示 "-/max"）
    const td1 = td();
    td1.className = 'score-cell score-marker';
    const markerDisplay = (typeof c.markerScore === 'number') ? `${c.markerScore}/${c.max || 0}` : `-/${c.max || 0}`;
    td1.textContent = markerDisplay;
    tr.appendChild(td1);

    // Coordinator (baseline) 分数显示（缺失则 "-/max"）
    const td2 = td();
    td2.className = 'score-cell score-coordinator';
    const coordinatorDisplay = (typeof c.coordinatorScore === 'number') ? `${c.coordinatorScore}/${c.max || 0}` : `-/${c.max || 0}`;
    td2.textContent = coordinatorDisplay;
    tr.appendChild(td2);

    // Difference 列：只有当 coordinator 存在时才计算差值，否则显示 "-"
    const td3 = td();
    td3.className = 'difference-cell';
    if (typeof c.coordinatorScore !== 'number') {
      td3.innerHTML = `<span class="difference-neutral">-</span>`;
    } else {
      const markerValForDiff = (typeof c.markerScore === 'number') ? c.markerScore : 0;
      const diff = c.coordinatorScore - markerValForDiff;
      const diffText = diff > 0 ? `+${diff}` : `${diff}`;
      td3.innerHTML = `<span class="${getDifferenceClass(diff)}">${diffText}</span>`;
    }
    tr.appendChild(td3);

    // Feedback 列（保持原样）
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

  // 更新文本反馈区（保持原逻辑）
  coordinatorFeedbackEl.innerHTML = '';
  if (data.allFeedback && data.allFeedback.length > 0) {
      data.allFeedback.forEach((fb, idx) => {
          const div = document.createElement('div');
          div.className = 'feedback-block';
          div.innerHTML = `
              <div class="feedback-date">${idx+1} • ${formatDate(fb.created_at || new Date())}</div>
              <div class="feedback-content">${esc(fb.content || 'No feedback provided')}</div>
          `;
          coordinatorFeedbackEl.appendChild(div);
      });
  } else {
      coordinatorFeedbackEl.textContent = 'No detailed feedback provided.';
      coordinatorFeedbackEl.classList.add('empty');
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
// 日期格式化辅助函数
function formatDate(dateString) {
    if (!dateString) return 'Unknown date';

    const date = new Date(dateString);
    const options = {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };

    return date.toLocaleDateString('en-US', options);
}



  // 获取当前用户信息
  function getCurrentUser() {
    try {
      const rawUser = localStorage.getItem("user");
      if (rawUser) {
        const user = JSON.parse(rawUser);

        // 先log检查一下用户数据的结构
        console.log("User Info:", user);
        console.log("Available fields:", Object.keys(user));

        // 根据log结果调整字段名
        // 常见的字段名可能是：id, userId, user_id, role, userRole, etc.
        return {
          userId: user.id,
          role: user.role
        };
      }
      return null;
    } catch (err) {
      console.error("Failed to load user info:", err);
      return null;
    }
  }

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

// 初始化dropdown和logout功能
document.addEventListener('DOMContentLoaded', () => {
  // 初始化dropdown
  const accountEl = document.querySelector('.account');
  const dropdown = document.querySelector('.dropdown-menu');
  const logoutBtn = document.querySelector('.dropdown-item');

  if (accountEl && dropdown) {
    accountEl.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('show');
    });

    // 点击其他地方关闭下拉菜单
    document.addEventListener('click', () => {
      dropdown.classList.remove('show');
    });
  }

  // 登出功能
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const response = await fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'include'
        });

        const data = await response.json();

        if (data.success) {
          localStorage.removeItem('user');
          localStorage.removeItem('userRole');
          document.cookie = "userId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
          window.location.href = '/login';
        } else {
          alert("Logout failed: " + data.message);
        }
      } catch (error) {
        console.error('Logout error:', error);
        localStorage.removeItem('user');
        localStorage.removeItem('userRole');
        document.cookie = "userId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        window.location.href = '/login';
      }
    });
  }

  // 全局logout函数
  window.logout = async function() {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });

      const data = await response.json();

      if (data.success) {
        localStorage.removeItem('user');
        localStorage.removeItem('userRole');
        document.cookie = "userId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        window.location.href = '/login';
      } else {
        alert("Logout failed: " + data.message);
      }
    } catch (error) {
      console.error('Logout error:', error);
      localStorage.removeItem('user');
      localStorage.removeItem('userRole');
      document.cookie = "userId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
      window.location.href = '/login';
    }
  };
});
