// view-feedback.js — 显示Marker的分数对比和反馈

/* ===== 全局变量 ===== */
let currentProjectId = null; // 保存当前项目ID
let currentAssignmentInfo = null; // 保存当前assignment信息
let currentRubricData = null; // 保存当前rubric的详细数据

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
        if (user) {
          const usernameEl = document.getElementById("username");
          if (usernameEl) {
            usernameEl.textContent = user.name || user.email || 'User';
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
    
    // 保存完整的rubric数据
    currentRubricData = data;
    console.log("✅ Full rubric data loaded:", currentRubricData);
    
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
    
    // 保存项目ID和assignment信息
    currentProjectId = projectId;
    if (data?.assignments && data.assignments.length > 0) {
        const assignmentId = getQueryParams().assignmentId;
        if (assignmentId) {
            const assignment = data.assignments.find(a => a.assignment_id == assignmentId);
            if (assignment?.file) {
                currentAssignmentInfo = assignment.file;
                console.log("✅ Assignment file info loaded:", currentAssignmentInfo);
            }
        }
    }
    
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
    const difference = markerTotal - coordinatorTotal;
    const absDifference = Math.abs(difference);
    const deviationPercent = totalMax > 0 ? (absDifference / totalMax) * 100 : 0;
    
    scoreDifferenceEl.textContent = difference > 0 ? `+${difference}` : `${difference}`;
    
    // 根据偏差百分比设置颜色：>5%红色, >2.5%黄色, <=2.5%绿色
    if (deviationPercent > 5) {
      scoreDifferenceEl.className = 'difference-value danger';
    } else if (deviationPercent > 2.5) {
      scoreDifferenceEl.className = 'difference-value warning';
    } else {
      scoreDifferenceEl.className = 'difference-value good';
    }
  } else {
    scoreDifferenceEl.textContent = "-";
    scoreDifferenceEl.className = "difference-value neutral";
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
      td3.innerHTML = `<span>-</span>`;
    } else {
      const markerValForDiff = (typeof c.markerScore === 'number') ? c.markerScore : 0;
      const diff = markerValForDiff - c.coordinatorScore;
      const diffText = diff > 0 ? `+${diff}` : `${diff}`;
      
      // 计算该criterion的偏差百分比
      const absDiff = Math.abs(diff);
      const criterionDeviationPercent = c.max > 0 ? (absDiff / c.max) * 100 : 0;
      
      // 单个criterion：>5%红色，否则根据差异大小设置颜色
      let colorClass = '';
      if (criterionDeviationPercent > 5) {
        colorClass = 'danger';
      } else if (criterionDeviationPercent > 0) {
        // 有差异但不超过5%，根据差异大小设置为黄色或绿色
        if (criterionDeviationPercent > 2.5) {
          colorClass = 'warning';
        } else {
          colorClass = 'good';
        }
      } else {
        // 没有差异
        colorClass = 'good';
      }
      
      td3.innerHTML = `<span class="${colorClass}">${diffText}</span>`;
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

/* ===== Excel生成和下载功能 ===== */
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

/* ===== 下载功能事件处理器 ===== */
document.addEventListener('DOMContentLoaded', () => {
  // Download Rubric按钮
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

  // Download Assignment按钮
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
});

// 全局goToResetPassword函数
window.goToResetPassword = function() {
  window.location.href = '/reset-password';
};
