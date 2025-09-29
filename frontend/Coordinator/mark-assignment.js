// Assignment Marking Interface - Interactive Functionality
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));


  let originalData = null; // To store the original criterion data
  // Criterion data - will be loaded from backend
  let criterionData = {};

  // API Configuration
  const API_BASE_URL = '/api'; // Adjust based on your backend
  let ASSIGNMENT_ID = null; // 改为变量，动态获取
  let PROJECT_ID = null; // 存储project_id

  // Current state
  let currentPage = 1;
  // Grade data structure (reordered from high to low)
  let gradeData = {};
  let currentGrades = {}; // Default to High Distinction

  // 在文件开头添加PDF.js配置
  const pdfjsLib = window['pdfjs-dist/build/pdf'];
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

  // PDF查看器状态
  let pdfDoc = null;
  let currentPdfPage = 1;
  let totalPdfPages = 0;
  let currentScale = 1.0;
  const SCALE_STEP = 0.25;
  const MIN_SCALE = 0.5;
  const MAX_SCALE = 3.0;

  // 存储所有页面的canvas和尺寸
  let pageCanvases = [];
  let pageHeights = [];
  let totalHeight = 0;

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

    // 调试用，查看当前用户信息
    // getCurrentUser();

    // ✅ 从URL获取project_id和assignment标识
    await resolveAssignmentId();

    if (!ASSIGNMENT_ID) {
      throw new Error('无法确定assignment ID');
    }

    // 显示Assignment和project的信息（名称、截止日期等）
    setupAssignmentDetails();

    // Load rubric data from backend
    await loadRubricData();

    // ✅ 新增：加载已保存的分数和反馈数据
    await loadSavedScoresAndFeedback();

    generateCriteriaHTML();

    setupDocumentNavigation();
    setupGradeSelection();
    setupScoreInputs();
    setupFeedback();
    setupActionButtons();
    
    updateAllCriterionDisplays();
    updateTotalScoreDisplay();
  }

  // 加载已保存到后端的的score和feedback数据
  async function loadSavedScoresAndFeedback() {
    try {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        console.warn('无法获取当前用户信息，跳过加载已保存数据');
        return;
      }

      let response;
      if (currentUser.role === 'COORDINATOR') {
        response = await fetch(`${API_BASE_URL}/uploads/scoring/baseline/${ASSIGNMENT_ID}`);
      } else if (currentUser.role === 'MARKER') {
        response = await fetch(`${API_BASE_URL}/uploads/scoring/marker/${ASSIGNMENT_ID}/${currentUser.userId}`);
      } else {
        console.warn('未知用户角色，跳过加载已保存数据');
        return;
      }

      if (!response.ok) {
        if (response.status === 404) {
          console.log('未找到已保存的数据，使用默认值');
          return;
        }
        throw new Error(`加载失败: ${response.status}`);
      }

      const data = await response.json();

      // 根据用户角色处理不同的数据结构
      const scoresData = currentUser.role === 'COORDINATOR'
        ? data.baseline_scores
        : data.marker_scores;

      if (!scoresData || scoresData.length === 0) {
        console.log('没有已保存的分数数据');
        return;
      }

      // 创建映射以便后续使用
      window.savedScoresData = {
        scores: {},
        feedback: {},
        finalized: currentUser.role === 'MARKER'
          ? (data.marker_scores?.[0]?.finalized || false)
          : (data.baseline_scores?.[0]?.finalized || false)
      };
      console.log('✅ 设置的 finalized 状态:', window.savedScoresData.finalized);

      // 处理分数和反馈数据 - 直接使用seq_no作为前端ID
      scoresData.forEach(scoreItem => {
        // 根据后端criterion_id找到对应的前端criterion（使用seq_no）
        const criterion = originalData.criteria.find(c => c.criterion_id === scoreItem.criterion_id);
        if (criterion) {
          const frontendCriterionId = criterion.seq_no; // seq_no就是前端ID

          // 保存分数
          window.savedScoresData.scores[frontendCriterionId] = scoreItem.score;

          // 保存反馈
          if (scoreItem.comment) {
            window.savedScoresData.feedback[frontendCriterionId] = scoreItem.comment;
          }

          // 根据分数设置对应的等级
          if (scoreItem.matched_level && gradeData[frontendCriterionId]) {
            const matchedGrade = findMatchingGrade(frontendCriterionId, scoreItem.score);
            if (matchedGrade !== null) {
              currentGrades[frontendCriterionId] = matchedGrade;
            }
          }
        }
      });

      console.log('✅ 已保存的数据加载成功:', window.savedScoresData);

    } catch (error) {
      console.error('❌ 加载已保存数据失败:', error);
      // 不抛出错误，继续使用默认值
    }
  }

  // 根据分数查找匹配的等级
  function findMatchingGrade(criterionId, score) {
    const grades = gradeData[criterionId];
    if (!grades) return null;

    // 按等级从高到低排序
    const sortedGrades = Object.keys(grades)
      .map(grade => parseInt(grade))
      .sort((a, b) => b - a);

    for (const grade of sortedGrades) {
      const gradeInfo = grades[grade];
      if (gradeInfo && gradeInfo.min_score !== undefined && gradeInfo.max_score !== undefined) {
        if (score >= gradeInfo.min_score && score <= gradeInfo.max_score) {
          return grade;
        }
      }
    }

    return null;
  }

  // 解析URL参数，获取真实的assignment_id
  async function resolveAssignmentId() {

    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('project');
    const assignmentParam = urlParams.get('assignment');

    if (!projectId) {
      throw new Error('URL中缺少project_id参数');
    }

    if (!assignmentParam || !['assignment1', 'assignment2'].includes(assignmentParam)) {
      throw new Error('assignment参数必须是assignment1或assignment2');
    }

    PROJECT_ID = projectId;

    try {
      // 调用现有接口获取latest-ids
      const response = await fetch(`${API_BASE_URL}/uploads/project/${PROJECT_ID}/latest-ids`);
      if (!response.ok) {
        throw new Error('获取项目信息失败');
      }

      const data = await response.json();

      // 根据assignment参数选择对应的assignment_id
      if (assignmentParam === 'assignment1' && data.assignment1) {
        ASSIGNMENT_ID = data.assignment1.assignment_id;
      } else if (assignmentParam === 'assignment2' && data.assignment2) {
        ASSIGNMENT_ID = data.assignment2.assignment_id;
      } else {
        throw new Error(`找不到对应的assignment: ${assignmentParam}`);
      }
      console.log(`✅ 解析成功: project_id=${PROJECT_ID}`);
      console.log(`✅ 解析成功: ${assignmentParam} -> assignment_id=${ASSIGNMENT_ID}`);

    } catch (error) {
      console.error('解析assignment ID失败:', error);
      throw new Error(`无法解析assignment ID: ${error.message}`);
    }
  }

  // 显示Assignment和project的信息（名称、截止日期等）
  async function setupAssignmentDetails() {
    try {
      if (!ASSIGNMENT_ID) {
        console.error('Assignment ID is not available');
        return;
      }

      // 1. 获取assignment详细信息
      const assignmentResponse = await fetch(`/api/uploads/assignment/${ASSIGNMENT_ID}/status`);
      if (!assignmentResponse.ok) {
        throw new Error(`Failed to fetch assignment details: ${assignmentResponse.status}`);
      }

      const assignmentData = await assignmentResponse.json();
      const assignment = assignmentData.assignment;

      // 设置PROJECT_ID（如果尚未设置）
      if (!PROJECT_ID && assignment.project_id) {
        PROJECT_ID = assignment.project_id;
      }

      // 2. 获取project详细信息
      let projectName = 'Unnamed Project';
      if (PROJECT_ID) {
        try {
          const projectResponse = await fetch(`/api/uploads/project/${PROJECT_ID}/status`);
          if (projectResponse.ok) {
            const projectData = await projectResponse.json();
            projectName = projectData.project.name || projectName;
            console.log('✅ Project name fetched:', projectName);
          }
        } catch (projectError) {
          console.warn('Failed to fetch project details, using default name:', projectError);
        }
      }

      // 3. 格式化日期
      let dueDateText = 'Due date not set';
      if (assignment.due_at) {
        const dueDate = new Date(assignment.due_at);
        dueDateText = `Due: ${formatDueDate(dueDate)}`;
      }

      // 4. 更新页面元素
      const assignmentTitleEl = document.querySelector('.assignment-title');
      const dueDateEl = document.querySelector('.due-date');

      if (assignmentTitleEl) {
        assignmentTitleEl.textContent = `${projectName} - ${assignment.name}`;
      }

      if (dueDateEl) {
        dueDateEl.textContent = dueDateText;
      }

      console.log('✅ Assignment details loaded:', {
        projectName,
        assignmentName: assignment.name,
        dueDate: assignment.due_at
      });

    } catch (error) {
      console.error('❌ Failed to setup assignment details:', error);

      // 设置默认值作为fallback
      const assignmentTitleEl = document.querySelector('.assignment-title');
      const dueDateEl = document.querySelector('.due-date');

      if (assignmentTitleEl) {
        assignmentTitleEl.textContent = 'Unnamed Project - Unnamed Assignment';
      }

      if (dueDateEl) {
        dueDateEl.textContent = 'Due: Date not available';
      }
    }
  }

  // 日期格式化辅助函数（匹配你提供的格式：Tue Sep 16, 2025 10:00）
  function formatDueDate(date) {
    const options = {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    return date.toLocaleDateString('en-US', options);
  }


  // Load rubric data from backend
  async function loadRubricData() {
    try {
      if (!PROJECT_ID) {
        throw new Error('Project ID is not available');
      }

      // 获取项目的最新ID信息
      const idsResponse = await fetch(`${API_BASE_URL}/uploads/project/${PROJECT_ID}/latest-ids`);
      if (!idsResponse.ok) {
        throw new Error('Failed to load project IDs');
      }

      const idsData = await idsResponse.json();
      if (!idsData.rubric) {
        throw new Error('No rubric found for this project');
      }

      // 使用获取到的rubric_id来获取评分标准详情
      const rubricId = idsData.rubric.rubric_id;
      const response = await fetch(`${API_BASE_URL}/uploads/rubric/${rubricId}/details`);
      if (!response.ok) {
        throw new Error('Failed to load rubric data');
      }

      const data = await response.json();
      originalData = data; // 保存原始数据
      criterionData = formatRubric(data);
      console.log('✅ original Criterion data:', data);

      // 根据rubric数据初始化currentGrades和gradeData
      initializeGradeData(data);

      console.log('✅ Criterion data stored:', criterionData);
      console.log('✅ Grade data initialized:', gradeData);
      console.log('✅ Current grades initialized:', currentGrades);

    } catch (error) {
      console.error('Error loading rubric:', error);
      // Fallback to default data
      loadDefaultRubricData();
    }
  }

  // Format rubric data into desired structure
  function formatRubric(data) {
    const formattedData = {};

    // 遍历所有评分标准
    data.criteria.forEach((criterion, index) => {
      const criterionId = index + 1; // 使用1-based索引作为键
      const descriptions = {};

      // 遍历该标准的所有等级水平
      criterion.grade_levels.forEach((level, levelIndex) => {
        // 将描述文本按换行符分割成数组，并过滤空行
        const criteriaList = level.description
          .split('\n')
          .map(item => item.trim())
          .filter(item => item.length > 0);

        // 构建points字符串，格式如："0-4 points"
        const points = `${level.min_score}-${level.max_score} points`;

        descriptions[4 - levelIndex] = {
          points: points,
          criteria: criteriaList
        };
      });

      // 构建每个评分标准的数据结构
      formattedData[criterionId] = {
        title: criterion.title,
        maxScore: criterion.max_score,
        descriptions: descriptions
      };
    });

    return formattedData;
  }

  // 根据rubric数据初始化gradeData和currentGrades
  function initializeGradeData(rubricData) {
    // 重置gradeData和currentGrades
    gradeData = {};
    currentGrades = {};

    // 遍历每个评分标准
    rubricData.criteria.forEach((criterion, index) => {
      const criterionId = index + 1;

      // 为每个评分标准初始化默认等级（选择最高等级）
      if (criterion.grade_levels && criterion.grade_levels.length > 0) {
        // 按seq_no降序排序，选择最高的等级作为默认值
        const sortedLevels = [...criterion.grade_levels].sort((a, b) => b.seq_no - a.seq_no);
        currentGrades[criterionId] = sortedLevels[0].seq_no - 1;

        // 构建gradeData数据结构
        gradeData[criterionId] = {};

        // 为每个评分标准创建独立的等级映射
        criterion.grade_levels.forEach(level => {
          gradeData[criterionId][5 - level.seq_no] = {
            name: level.level_name,
            color: getGradeColor(5 - level.seq_no, criterion.grade_levels.length),
            score: `${level.min_score}-${level.max_score}`,
            min_score: level.min_score,
            max_score: level.max_score,
            description: level.description
          };
        });
      }
    });
  }

  // 根据等级序号和总等级数量获取对应的颜色（支持5个级别）
  function getGradeColor(seqNo, totalLevels) {
    // 5个级别的颜色映射（从高到低）
    const colorMappings = {
      5: [ // 5个级别的情况
        'var(--grade-high-distinction)', // 最高等级 - 级别4
        'var(--grade-distinction)',      // 级别3
        'var(--grade-credit)',           // 级别2
        'var(--grade-pass)',             // 级别1
        'var(--grade-fail)'              // 最低等级 - 级别0
      ],
      4: [ // 4个级别的情况（保持原有逻辑）
        'var(--grade-high-distinction)', // 最高等级
        'var(--grade-distinction)',
        'var(--grade-credit)',
        'var(--grade-pass)'
      ],
      3: [ // 3个级别的情况
        'var(--grade-high-distinction)',
        'var(--grade-distinction)',
        'var(--grade-pass)'
      ],
      2: [ // 2个级别的情况
        'var(--grade-pass)',
        'var(--grade-fail)'
      ]
    };

    // 根据总等级数量选择合适的颜色映射
    const colors = colorMappings[totalLevels] || colorMappings[4]; // 默认使用4级映射

    // 计算颜色索引（seqNo从高到低，需要映射到颜色数组）
    const colorIndex = totalLevels - 1 - seqNo;

    // 确保颜色索引在有效范围内
    const safeIndex = Math.max(0, Math.min(colorIndex, colors.length - 1));
    return colors[safeIndex] || 'var(--grade-pass)';
  }

  // 备用默认数据加载函数（更新为支持5个级别）
  function loadDefaultRubricData() {
    // 使用默认的5个级别数据
    currentGrades = { 1: 4, 2: 4, 3: 4 }; // 默认选择最高等级（级别4）
    gradeData = {
      4: { name: 'High Distinction', color: 'var(--grade-high-distinction)', score: '9-10' },
      3: { name: 'Distinction', color: 'var(--grade-distinction)', score: '7-8' },
      2: { name: 'Credit', color: 'var(--grade-credit)', score: '5-6' },
      1: { name: 'Pass', color: 'var(--grade-pass)', score: '0-4' },
      0: { name: 'Fail', color: 'var(--grade-fail)', score: '0-0' }
    };

    console.log('⚠️ Using default rubric data with 5 levels');
  }

  // Fallback default rubric data
  function loadDefaultRubricData() {
    criterionData = {
      1: {
        title: 'Introduction: Applies theoretical framework to topic',
        maxScore: 15,
        descriptions: {
          0: { points: '0-4 points', criteria: ['Limited justification for investigating the phenomenon.', 'Basic definition of key terms.', 'Minimal application of theoretical framework.'] },
          1: { points: '5-6 points', criteria: ['Adequate justification for investigating the phenomenon.', 'Clear definition of most key terms.', 'Some application of theoretical framework.'] },
          2: { points: '7-8 points', criteria: ['Good justification for investigating the phenomenon.', 'Clear definition of key terms.', 'Good application of theoretical framework.'] },
          3: { points: '12-15 points', criteria: ['Articulates a compelling justification for investigating the phenomenon.', 'Provides a clear, comprehensive definition of all relevant key terms and constructs.', 'Applies highly relevant theoretical framework/s to provide an insightful explanation of the impacts of caregiving on development.'] }
        }
      },
      2: {
        title: 'Introduction: Locates, synthesises and critically analyses literature',
        maxScore: 10,
        descriptions: {
          0: { points: '0-3 points', criteria: ['Limited literature review.', 'Basic synthesis of findings.', 'Minimal critical analysis.'] },
          1: { points: '4-5 points', criteria: ['Adequate literature review.', 'Some synthesis of findings.', 'Basic critical analysis.'] },
          2: { points: '6-7 points', criteria: ['Good literature review.', 'Good synthesis of findings.', 'Some critical analysis.'] },
          3: { points: '8-10 points', criteria: ['Locates most relevant, influential, contemporary, peer-reviewed papers.', 'Concisely synthesizes the key findings relevant to the topic.', 'Critically evaluates key strengths, weaknesses and gaps in the literature.'] }
        }
      },
      3: {
        title: 'Results: Develops significant themes',
        maxScore: 10,
        descriptions: {
          0: { points: '0-3 points', criteria: ['Limited theme development.', 'Basic analysis.', 'Minimal insight.'] },
          1: { points: '4-5 points', criteria: ['Some theme development.', 'Adequate analysis.', 'Basic insight.'] },
          2: { points: '6-7 points', criteria: ['Good theme development.', 'Good analysis.', 'Some insight.'] },
          3: { points: '8-10 points', criteria: ['Locates most relevant, influential, contemporary, peer-reviewed papers.', 'Concisely synthesizes the key findings relevant to the topic.', 'Critically evaluates key strengths, weaknesses and gaps in the literature.'] }
        }
      }
    };
  }

  // 动态生成评分标准HTML
  function generateCriteriaHTML() {
    const container = $('.marking-criteria');
    if (!container) {
      console.error('Marking criteria container not found');
      return;
    }

    // 清空容器
    container.innerHTML = '';

    // 获取标准数量
    const criterionIds = Object.keys(criterionData);
    const lastCriterionId = criterionIds[criterionIds.length - 1];

    // 动态生成每个评分标准
    criterionIds.forEach(criterionId => {
      const criterion = criterionData[criterionId];
      const currentGrade = currentGrades[criterionId] || 4;

      // ✅ 使用已保存的分数或默认值
      const savedScore = window.savedScoresData?.scores?.[criterionId];
      const initialScore = savedScore !== undefined ? savedScore : criterion.maxScore;

      const isLastCriterion = criterionId === lastCriterionId;

      const criterionHTML = `
        <div class="criterion" data-criterion="${criterionId}">
          <div class="criterion-header">
            <div class="criterion-number">${criterionId}.</div>
            <div class="criterion-title">${criterion.title}</div>
          </div>

          <div class="grade-selector">
            <button class="grade-arrow left">‹</button>
            <div class="grade-options">
              ${generateGradeOptions(criterionId, currentGrade)}
            </div>
            <button class="grade-arrow right">›</button>
          </div>

          <div class="score-input-section">
            <div class="score-input-container">
              <label for="score-input-${criterionId}">Manual Score:</label>
              <input type="number" id="score-input-${criterionId}" class="score-input" min="0" max="${criterion.maxScore}" value="${initialScore}" step="0.1"/>
              <span class="max-score">/ ${criterion.maxScore}</span>
            </div>
          </div>

          <div class="grade-info">
            <div class="grade-level">${gradeData[criterionId]?.[currentGrade]?.name || 'High Distinction'}</div>
            <div class="grade-score">${initialScore}/${criterion.maxScore}</div>
          </div>

          <div class="grade-description">
            <!-- 描述内容将由updateCriterionDisplay动态更新 -->
          </div>

          <div class="feedback-section">
            <button class="show-feedback-btn">+ Add Feedback</button>
            <div class="criterion-feedback ${window.savedScoresData?.feedback?.[criterionId] ? '' : 'hidden'}">
              <div class="feedback-header">
                <span>Criterion Feedback</span>
                <button class="close-feedback">×</button>
              </div>
              <textarea placeholder="Please write your feedback on this criterion.">${window.savedScoresData?.feedback?.[criterionId] || ''}</textarea>
            </div>
          </div>

          ${isLastCriterion ? `
            <!-- 只在最后一个标准添加操作按钮 -->
            <div class="action-buttons">
              <div class="total-score-display">/100</div>
              ${!window.savedScoresData?.finalized ? `
                <button class="btn btn-secondary" id="saveBtn">Save Draft</button>
                <button class="btn btn-primary" id="submitBtn">Submit Marks</button>
              ` : `
                <div class="finalized-message">Marks have been submitted.</div>
              `}
            </div>
          ` : ''}
        </div>
      `;

      container.innerHTML += criterionHTML;
    });

    console.log('✅ Criteria HTML generated for', criterionIds.length, 'criteria');
    console.log('✅ Action buttons added to last criterion:', lastCriterionId);
  }

  // 更新总分显示
  function updateTotalScoreDisplay() {
    const totalScoreElement = document.querySelector('.total-score-display');
    if (totalScoreElement) {
      const totalScore = calculateWeightedTotalScore();
      totalScoreElement.textContent = totalScore === 0 ? '/100' : `${totalScore}/100`;
    }
  }
  // 计算加权总分（基于100分制）
  function calculateWeightedTotalScore() {
    const scores = getCurrentScores();
    let totalWeightedScore = 0;
    let totalMaxScore = 0;

    // 计算每个criterion的权重分数
    Object.keys(scores).forEach(criterionId => {
      const score = scores[criterionId];
      const criterion = criterionData[criterionId];

      if (criterion) {
        const maxScore = criterion.maxScore;
        // 计算该criterion在100分中的权重分数
        const weightedScore = (score / maxScore) * (maxScore / 100) * 100;
        totalWeightedScore += weightedScore;
        totalMaxScore += maxScore;
      }
    });

    // 如果总分不是100，需要按比例调整
    const scalingFactor = totalMaxScore > 0 ? 100 / totalMaxScore : 0;
    const finalScore = totalWeightedScore * scalingFactor;

    return Math.round(finalScore * 10) / 10; // 保留一位小数
  }

  // 生成单个评分标准的等级选项HTML
  function generateGradeOptions(criterionId, currentGrade) {
    const grades = gradeData[criterionId];
    if (!grades) {
      console.warn('No grade data for criterion:', criterionId);
      return '';
    }

    // 按等级从高到低排序（4, 3, 2, 1, 0）- 确保HTML显示顺序正确
    const sortedGrades = Object.keys(grades).sort((a, b) => b - a);

    return sortedGrades.map(grade => {
      const gradeInfo = grades[grade];
      const isActive = parseInt(grade) === parseInt(currentGrade);
      return `<div class="grade-option ${isActive ? 'active' : ''}" data-grade="${grade}">${gradeInfo.name}</div>`;
    }).join('');
  }

  // =======================================pdf viewer=======================================

  // Document navigation
  function setupDocumentNavigation() {
      setupPdfViewer();
      setupPdfControls();
  }

  // 初始化PDF查看器
  async function setupPdfViewer() {
      try {
          // 1. 获取assignment的文件信息
          const filesResponse = await fetch(`${API_BASE_URL}/uploads/assignment/${ASSIGNMENT_ID}/files`);
          if (!filesResponse.ok) {
              throw new Error('Failed to fetch assignment files');
          }

          const filesData = await filesResponse.json();
          if (!filesData.files || filesData.files.length === 0) {
              throw new Error('No files found for this assignment');
          }

          // 取第一个文件（假设是PDF）
          const fileInfo = filesData.files[0];
          console.log('File info:', fileInfo);

          // 2. 获取PDF文件
          const pdfResponse = await fetch(`${API_BASE_URL}/uploads/${fileInfo.upload_id}/download`);
          if (!pdfResponse.ok) {
              throw new Error('Failed to download PDF file');
          }

          const pdfBlob = await pdfResponse.blob();
          const pdfUrl = URL.createObjectURL(pdfBlob);

          // 3. 使用PDF.js加载PDF
          const loadingTask = pdfjsLib.getDocument(pdfUrl);
          pdfDoc = await loadingTask.promise;

          totalPdfPages = pdfDoc.numPages;
          currentPdfPage = 1;

          // 4. 渲染所有页面到连续画布
          await renderAllPages();

          // 5. 更新页面信息
          updatePagination();

          // 6. 更新缩略图
          updateThumbnails();

          // 7. 设置滚动监听
          setupScrollListener();

      } catch (error) {
          console.error('Error loading PDF:', error);
          showPdfError('Failed to load PDF: ' + error.message);
      }
  }

  // 渲染所有页面到连续画布
  async function renderAllPages() {
      try {
          showPdfLoading(true);

          const container = document.getElementById('pdf-viewer');
          container.innerHTML = '';

          pageCanvases = [];
          pageHeights = [];
          totalHeight = 0;

          const canvasContainer = document.createElement('div');
          canvasContainer.className = 'pdf-canvas-container';
          canvasContainer.style.cssText = `
              width: 100%;
              position: relative;
          `;

          for (let i = 1; i <= totalPdfPages; i++) {
              const page = await pdfDoc.getPage(i);
              const viewport = page.getViewport({ scale: currentScale });

              // 创建页面包装器
              const pageWrapper = document.createElement('div');
              pageWrapper.className = 'pdf-page-wrapper';
              pageWrapper.style.cssText = `
                  position: relative;
                  margin: 0 auto 20px auto;
                  max-width: 100%;
              `;

              const canvas = document.createElement('canvas');
              canvas.className = 'pdf-page-canvas';
              canvas.style.cssText = `
                  display: block;
                  width: 100%;
                  height: auto;
                  border: 1px solid #ddd;
                  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
              `;

              canvas.height = viewport.height;
              canvas.width = viewport.width;

              const renderContext = {
                  canvasContext: canvas.getContext('2d'),
                  viewport: viewport
              };

              await page.render(renderContext).promise;

              pageWrapper.appendChild(canvas);
              canvasContainer.appendChild(pageWrapper);

              // 使用包装器的高度
              const pageHeight = pageWrapper.offsetHeight;
              pageCanvases.push(canvas);
              pageHeights.push(pageHeight);
              totalHeight += pageHeight;
          }

          container.appendChild(canvasContainer);
          showPdfLoading(false);

      } catch (error) {
          console.error('Error rendering all pages:', error);
          showPdfError('Failed to render pages');
          showPdfLoading(false);
      }
  }

  // 设置滚动监听
  function setupScrollListener() {
      const pdfViewer = document.getElementById('pdf-viewer');

      pdfViewer.addEventListener('scroll', () => {
          updateCurrentPageFromScroll();
      });
  }

  // 根据滚动位置更新当前页面
  function updateCurrentPageFromScroll() {
      const pdfViewer = document.getElementById('pdf-viewer');
      const scrollTop = pdfViewer.scrollTop;
      const viewerHeight = pdfViewer.clientHeight;

      let accumulatedHeight = 0;
      let newCurrentPage = 1;

      // 获取所有页面包装器
      const pageWrappers = document.querySelectorAll('.pdf-page-wrapper');

      for (let i = 0; i < pageWrappers.length; i++) {
          const wrapper = pageWrappers[i];
          const wrapperHeight = wrapper.offsetHeight;
          accumulatedHeight += wrapperHeight;

          // 如果滚动位置超过当前页面累计高度的一半，则认为进入下一页
          if (scrollTop + (viewerHeight / 2) < accumulatedHeight) {
              newCurrentPage = i + 1;
              break;
          }
      }

      // 更新当前页面（如果发生变化）
      if (newCurrentPage !== currentPdfPage) {
          currentPdfPage = newCurrentPage;
          updatePagination();
          updateActiveThumbnail();
      }
  }

  // 滚动到指定页面
  function scrollToPage(pageNum) {
      const pdfViewer = document.getElementById('pdf-viewer');

      if (pageNum < 1 || pageNum > totalPdfPages) return;

      const pageWrappers = document.querySelectorAll('.pdf-page-wrapper');
      let scrollPosition = 0;

      for (let i = 0; i < pageNum - 1; i++) {
          if (pageWrappers[i]) {
              scrollPosition += pageWrappers[i].offsetHeight;
          }
      }

      pdfViewer.scrollTo({
          top: scrollPosition,
          behavior: 'smooth'
      });
  }

  // 渲染PDF页面
  async function renderPage(pageNum) {
      try {
          showPdfLoading(true);

          const page = await pdfDoc.getPage(pageNum);
          const canvas = document.getElementById('pdf-canvas');
          const ctx = canvas.getContext('2d');

          const viewport = page.getViewport({ scale: currentScale });
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          const renderContext = {
              canvasContext: ctx,
              viewport: viewport
          };

          await page.render(renderContext).promise;
          showPdfLoading(false);

      } catch (error) {
          console.error('Error rendering page:', error);
          showPdfError('Failed to render page');
      }
  }

  // 设置PDF控制功能
  function setupPdfControls() {
      // 翻页按钮
      document.getElementById('prev-page').addEventListener('click', prevPage);
      document.getElementById('next-page').addEventListener('click', nextPage);

      // 页码输入
      document.getElementById('page-number').addEventListener('change', (e) => {
          const pageNum = parseInt(e.target.value);
          if (pageNum >= 1 && pageNum <= totalPdfPages) {
              goToPage(pageNum);
          }
      });

      // 缩放按钮
      document.getElementById('zoom-in').addEventListener('click', zoomIn);
      document.getElementById('zoom-out').addEventListener('click', zoomOut);

      // 下载按钮
      document.querySelector('.download-btn').addEventListener('click', downloadPdf);

      // 键盘导航
      document.addEventListener('keydown', handleKeyboardNavigation);
  }

  // 翻页功能
  async function prevPage() {
      if (currentPdfPage > 1) {
          scrollToPage(currentPdfPage - 1);
      }
  }

  async function nextPage() {
      if (currentPdfPage < totalPdfPages) {
          scrollToPage(currentPdfPage + 1);
      }
  }

  async function goToPage(pageNum) {
      scrollToPage(pageNum);
  }

  // 修改缩放功能 - 重新渲染所有页面
  async function updateZoom() {
      document.getElementById('zoom-level').textContent = Math.round(currentScale * 100) + '%';
      await renderAllPages();

      // 滚动回当前页面
      setTimeout(() => {
          scrollToPage(currentPdfPage);
      }, 100);
  }

  // 缩放功能
  async function zoomIn() {
      if (currentScale < MAX_SCALE) {
          currentScale += SCALE_STEP;
          await updateZoom();
      }
  }

  async function zoomOut() {
      if (currentScale > MIN_SCALE) {
          currentScale -= SCALE_STEP;
          await updateZoom();
      }
  }

  // 下载功能
  async function downloadPdf() {
      try {
          // 获取文件信息
          const filesResponse = await fetch(`${API_BASE_URL}/uploads/assignment/${ASSIGNMENT_ID}/files`);
          if (!filesResponse.ok) {
              throw new Error('Failed to fetch file info');
          }

          const filesData = await filesResponse.json();
          if (!filesData.files || filesData.files.length === 0) {
              throw new Error('No files found');
          }

          const fileInfo = filesData.files[0];
          const downloadUrl = `${API_BASE_URL}/uploads/${fileInfo.upload_id}/download`;

          // 创建临时链接进行下载
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = fileInfo.file_name;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

      } catch (error) {
          console.error('Error downloading PDF:', error);
          alert('Failed to download PDF: ' + error.message);
      }
  }

  // 更新页面信息
  function updatePagination() {
      document.getElementById('current-page').textContent = currentPdfPage;
      document.getElementById('total-pages').textContent = totalPdfPages;
      document.getElementById('page-number').value = currentPdfPage;

      // 更新按钮状态
      document.getElementById('prev-page').disabled = currentPdfPage <= 1;
      document.getElementById('next-page').disabled = currentPdfPage >= totalPdfPages;
  }

  // 更新缩略图
  function updateThumbnails() {
      const thumbnailsContainer = document.querySelector('.document-thumbnails');
      thumbnailsContainer.innerHTML = '';

      for (let i = 1; i <= totalPdfPages; i++) {
          const thumbnail = document.createElement('div');
          thumbnail.className = `thumbnail ${i === currentPdfPage ? 'active' : ''}`;
          thumbnail.dataset.page = i;
          thumbnail.textContent = i;
          thumbnail.addEventListener('click', () => goToPage(i));
          thumbnailsContainer.appendChild(thumbnail);
      }
  }

  // 更新活动缩略图
  function updateActiveThumbnail() {
      const thumbnails = document.querySelectorAll('.thumbnail');
      thumbnails.forEach(thumb => {
          const pageNum = parseInt(thumb.dataset.page);
          thumb.classList.toggle('active', pageNum === currentPdfPage);
      });
  }

  // 键盘导航
  function handleKeyboardNavigation(e) {
      // 确保焦点不在输入框中
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch(e.key) {
          case 'ArrowLeft':
          case 'PageUp':
              e.preventDefault();
              prevPage();
              break;
          case 'ArrowRight':
          case 'PageDown':
              e.preventDefault();
              nextPage();
              break;
          case '+':
          case '=':
              e.preventDefault();
              zoomIn();
              break;
          case '-':
              e.preventDefault();
              zoomOut();
              break;
          case 'Home':
              e.preventDefault();
              goToPage(1);
              break;
          case 'End':
              e.preventDefault();
              goToPage(totalPdfPages);
              break;
      }
  }
  // 显示/隐藏加载状态
  function showPdfLoading(show) {
      const loadingEl = document.getElementById('pdf-loading');
      const pdfViewer = document.getElementById('pdf-viewer');

      if (show) {
          loadingEl.style.display = 'block';
          pdfViewer.style.display = 'none';
      } else {
          loadingEl.style.display = 'none';
          pdfViewer.style.display = 'block';
      }
  }

  // 显示错误信息
  function showPdfError(message) {
      const errorEl = document.getElementById('pdf-error');
      errorEl.textContent = message;
      errorEl.style.display = 'block';
      showPdfLoading(false);
  }


  //=====================================pdf end=====================================

  // Grade selection
  function setupGradeSelection() {
    const criteria = $$('.criterion');

    criteria.forEach(criterion => {
      const criterionId = parseInt(criterion.dataset.criterion);
      const gradeOptions = criterion.querySelectorAll('.grade-option');
      const leftArrow = criterion.querySelector('.grade-arrow.left');
      const rightArrow = criterion.querySelector('.grade-arrow.right');

      // Grade option clicks
      gradeOptions.forEach(option => {
        option.addEventListener('click', () => {
          const grade = parseInt(option.dataset.grade);
          selectGrade(criterionId, grade);
        });
      });

      // Arrow navigation (adjusted for high-to-low order)
      leftArrow?.addEventListener('click', () => {
        const currentGrade = currentGrades[criterionId];
        const newGrade = Math.min(4, currentGrade + 1); // Move to higher grade
        selectGrade(criterionId, newGrade);
      });

      rightArrow?.addEventListener('click', () => {
        const currentGrade = currentGrades[criterionId];
        const newGrade = Math.max(0, currentGrade - 1); // Move to lower grade
        selectGrade(criterionId, newGrade);
      });
    });
  }

  function selectGrade(criterionId, grade) {
    currentGrades[criterionId] = grade;
    updateCriterionDisplay(criterionId);
    updateTotalScoreDisplay();
  }

  // 更新单个评分标准的显示
  function updateCriterionDisplay(criterionId) {
    const criterion = $(`.criterion[data-criterion="${criterionId}"]`);
    if (!criterion) return;

    const grade = currentGrades[criterionId];
    const gradeInfo = gradeData[criterionId][grade];
    // console.log('gradeData:', gradeData);
    // console.log('criterionId:', criterionId);
    // console.log('grade:', grade);
    // console.log('gradeInfo:', gradeInfo);

    // ✅ 添加安全检查
    const criterionInfo = criterionData[criterionId];
    if (!criterionInfo) {
      console.warn(`Criterion data not found for ID: ${criterionId}`);
      return;
    }

    const description = criterionInfo.descriptions[grade];

    // ✅ 添加对description的安全检查
    if (!description) {
      console.warn(`Description not found for criterion ${criterionId}, grade ${grade}`);
      return;
    }

    // 更新grade options
    const gradeOptions = criterion.querySelectorAll('.grade-option');
    gradeOptions.forEach(option => {
      const optionGrade = parseInt(option.dataset.grade);
      option.classList.toggle('active', optionGrade === grade);
    });

    // 更新grade info
    const gradeLevel = criterion.querySelector('.grade-level');
    const gradeScore = criterion.querySelector('.grade-score');
    const scoreInput = criterion.querySelector('.score-input');

    if (gradeLevel) gradeLevel.textContent = gradeInfo.name;
    if (gradeScore && scoreInput) {
      const maxScore = criterionInfo.maxScore;
      const currentScore = parseFloat(scoreInput.value) || 0;
      gradeScore.textContent = `${currentScore.toFixed(1)}/${maxScore}`;
    }

    // 更新description
    const gradeDescription = criterion.querySelector('.grade-description');
    if (gradeDescription && description) {
      gradeDescription.innerHTML = `
        <strong>${description.points}:</strong>
        <ul>
          ${description.criteria.map(criterion => `<li>${criterion}</li>`).join('')}
        </ul>
      `;
    }
  }

  // 更新所有评分标准的显示
  function updateAllCriterionDisplays() {
    Object.keys(currentGrades).forEach(criterionId => {
      updateCriterionDisplay(parseInt(criterionId));
    });
  }

  // 当手动输入分数时，自动选择对应的等级
  function setupScoreInputs() {
    const scoreInputs = $$('.score-input');

    scoreInputs.forEach(input => {
      input.addEventListener('input', () => {
        const criterionId = parseInt(input.id.split('-')[2]);
        const maxScore = parseFloat(input.max);
        let score = parseFloat(input.value) || 0;

        // 添加分数验证
        let scoreAdjusted = false;
        if (score > maxScore) {
          score = maxScore;
          input.value = maxScore;
          scoreAdjusted = true;

          // 显示提示信息
          showNotification(`Score cannot exceed maximum ${maxScore} points`, 'warning');
        }

        // 传递 criterionId 参数
        const grade = calculateGradeFromScore(score, maxScore, criterionId);
        selectGrade(criterionId, grade);
        updateTotalScoreDisplay();

        // 如果分数被调整，强制更新当前criterion的显示
        if (scoreAdjusted) {
          updateCriterionDisplay(criterionId);
        }
      });

      // 添加 blur 事件进行最终验证
      input.addEventListener('blur', () => {
        const criterionId = parseInt(input.id.split('-')[2]);
        const maxScore = parseFloat(input.max);
        let score = parseFloat(input.value) || 0;

        if (score > maxScore) {
          score = maxScore;
          input.value = maxScore;
          showNotification(`Score adjusted to maximum ${maxScore} points`, 'info');
          updateCriterionDisplay(criterionId); // 强制更新显示
        }
      });
    });
  }

  // 根据分数计算对应的等级（假设5个等级）
  function calculateGradeFromScore(score, maxScore, criterionId) {
    const grades = gradeData[criterionId];
    if (!grades) {
      console.warn('Grade data not found for criterion:', criterionId);
      return 4; // 默认返回最高等级
    }

    // 按等级从高到低排序
    const sortedGrades = Object.keys(grades)
      .map(grade => parseInt(grade))
      .sort((a, b) => b - a);

    // 遍历等级，找到分数对应的等级
    for (const grade of sortedGrades) {
      const gradeInfo = grades[grade];
      if (gradeInfo && gradeInfo.min_score !== undefined && gradeInfo.max_score !== undefined) {
        if (score >= gradeInfo.min_score && score <= gradeInfo.max_score) {
          return grade;
        }
      }
    }

    // 如果分数超出范围，返回最接近的等级
    if (score < (grades[sortedGrades[sortedGrades.length - 1]]?.min_score || 0)) {
      return sortedGrades[sortedGrades.length - 1]; // 返回最低等级
    }
    return sortedGrades[0]; // 返回最高等级
  }


  // Feedback functionality
  function setupFeedback() {
    const showFeedbackBtns = $$('.show-feedback-btn');
    const closeButtons = $$('.close-feedback');

    // Show feedback buttons - 如果有保存的反馈，自动展开
    showFeedbackBtns.forEach(button => {
      const criterion = button.closest('.criterion');
      const criterionId = parseInt(criterion.dataset.criterion);

      // 如果有保存的反馈，自动展开
      if (window.savedScoresData?.feedback?.[criterionId]) {
        const feedback = button.nextElementSibling;
        if (feedback) {
          feedback.classList.remove('hidden');
          button.style.display = 'none';
        }
      }

      button.addEventListener('click', () => {
        const feedback = button.nextElementSibling;
        if (feedback) {
          feedback.classList.remove('hidden');
          button.style.display = 'none';
        }
      });
    });

    // Close feedback buttons
    closeButtons.forEach(button => {
      button.addEventListener('click', () => {
        const feedback = button.closest('.criterion-feedback');
        const showBtn = feedback.previousElementSibling;
        if (feedback && showBtn) {
          feedback.classList.add('hidden');
          showBtn.style.display = 'block';
        }
      });
    });

    // Auto-save feedback
    const textareas = $$('.criterion-feedback textarea');
    textareas.forEach(textarea => {
      textarea.addEventListener('input', () => {
        // Auto-save functionality could be implemented here
        console.log('Feedback updated:', textarea.value);
      });
    });
  }

  // Action buttons functionality
  function setupActionButtons() {
    const saveBtn = $('#saveBtn');
    const submitBtn = $('#submitBtn');

    // 如果已提交，直接返回，不设置事件监听
    if (window.savedScoresData?.finalized) {
      return;
    }

    saveBtn?.addEventListener('click', async () => {
      try {
        await saveMarks();
        showNotification('Draft saved successfully', 'success');
        // Save后锁定所有输入框
        lockAllInputs();
      } catch (error) {
        console.error('Error saving marks:', error);
        showNotification('Failed to save draft', 'error');
      }
    });

    submitBtn?.addEventListener('click', async () => {
      if (confirm('Are you sure you want to submit these marks? This action cannot be undone.')) {
        try {
          await submitMarks();
          showNotification('Marks submitted successfully', 'success');
          // 提交后禁用按钮
          disableActionButtons();
        } catch (error) {
          console.error('Error submitting marks:', error);
          showNotification('Failed to submit marks', 'error');
        }
      }
    });
  }

  // 禁用操作按钮
  function disableActionButtons() {
    const saveBtn = $('#saveBtn');
    const submitBtn = $('#submitBtn');
    const actionButtons = $('.action-buttons');

    if (saveBtn) saveBtn.disabled = true;
    if (submitBtn) submitBtn.disabled = true;

    // 或者替换为已提交的消息
    if (actionButtons) {
      actionButtons.innerHTML = `
        <div class="total-score-display">/100</div>
        <div class="finalized-message">Marks have been submitted.</div>
      `;
      updateTotalScoreDisplay();
    }
  }

  //===========================存分数到后端===========================

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

  // Save marks to backend - 根据用户角色选择不同的接口
  async function saveMarks() {
    if (window.savedScoresData?.finalized) {
      showNotification('此作业的评分已提交，无法再次提交', 'error');
      return;
    }
    const currentUser = getCurrentUser();
    const marksData = {
      assignmentId: ASSIGNMENT_ID,
      criteria: currentGrades,
      scores: getCurrentScores(),
      feedback: getCurrentFeedback(),
      timestamp: new Date().toISOString()
    };

    let url;
    let requestBody;

    if (currentUser.role === 'COORDINATOR') {
      // COORDINATOR 使用 baseline 接口
      url = `${API_BASE_URL}/uploads/scoring/baseline/batch`;
      requestBody = {
        assignment_id: ASSIGNMENT_ID,
        scores: transformScoresForBackend(marksData.scores, marksData.feedback)
      };
    } else if (currentUser.role === 'MARKER') {
      // MARKER 使用 marker 接口
      url = `${API_BASE_URL}/uploads/scoring/marker/batch`;
      requestBody = {
        assignment_id: ASSIGNMENT_ID,
        marker_id: currentUser.userId, // 添加 marker_id
        scores: transformScoresForBackend(marksData.scores, marksData.feedback)
      };
    } else {
      throw new Error('Unknown user role');
    }

    console.log('Saving marks with data:', requestBody);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error('Failed to save marks');
    }

    return response.json();
  }

  // Submit marks to backend - 先保存再确认
  async function submitMarks() {
    if (window.savedScoresData?.finalized) {
      showNotification('此作业的评分已提交，无法再次提交', 'error');
      return;
    }
    const currentUser = getCurrentUser();

    // 第一步：先批量保存分数
    const saveResult = await saveMarks();

    // 第二步：确认分数 - 现在使用批量确认
    let submitUrl;
    let submitBody;

    // 获取所有需要确认的criterion_id（从originalData中获取）
    const criterionIds = originalData.criteria.map(criterion => criterion.criterion_id);

    if (currentUser.role === 'COORDINATOR') {
      submitUrl = `${API_BASE_URL}/uploads/scoring/baseline/submit`;
      submitBody = {
        assignment_id: ASSIGNMENT_ID,
        criterion_ids: criterionIds
      };
    } else if (currentUser.role === 'MARKER') {
      submitUrl = `${API_BASE_URL}/uploads/scoring/marker/submit`;
      submitBody = {
        assignment_id: ASSIGNMENT_ID,
        marker_id: currentUser.userId,
        criterion_ids: criterionIds
      };
    } else {
      throw new Error('Unknown user role');
    }

    console.log('Submitting marks with data:', submitBody);

    const submitResponse = await fetch(submitUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(submitBody)
    });

    if (!submitResponse.ok) {
      throw new Error('Failed to submit marks');
    }

    return submitResponse.json();
  }

  // 辅助函数：将前端分数格式转换为后端需要的格式
  function transformScoresForBackend(scores, feedback) {
    if (!originalData || !originalData.criteria) {
      throw new Error('Rubric data not loaded yet');
    }

    return originalData.criteria.map(criterion => {
      // 使用 criterion.seq_no 作为前端存储的键（因为前端可能是按顺序存储的）
      // 或者如果你在前端使用了其他键，需要相应调整
      const frontendKey = criterion.seq_no.toString(); // 或者 criterion.criterion_id.toString()

      return {
        criterion_id: criterion.criterion_id, // 使用后端返回的真实ID
        score: scores[frontendKey] || 0,
        comment: feedback[frontendKey] || null
      };
    });
  }

  // Get current scores from inputs
  function getCurrentScores() {
    const scores = {};
    const scoreInputs = $$('.score-input');
    scoreInputs.forEach(input => {
      const criterionId = parseInt(input.id.split('-')[2]);
      scores[criterionId] = parseFloat(input.value) || 0;
    });
    return scores;
  }

  // Get current feedback
  function getCurrentFeedback() {
    const feedback = {};
    const feedbackTextareas = $$('.criterion-feedback textarea');
    feedbackTextareas.forEach(textarea => {
      const criterion = textarea.closest('.criterion');
      if (criterion) {
        const criterionId = parseInt(criterion.dataset.criterion);
        feedback[criterionId] = textarea.value;
      }
    });
    return feedback;
  }

  // ==================结束存分数到后端=================

  // Show notification
  function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 4px;
      color: white;
      font-weight: 600;
      z-index: 1000;
      background: ${type === 'success' ? '#10B981' : type === 'error' ? '#DC2626' : '#3B82F6'};
    `;

    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  // Back button functionality
  function setupBackButton() {
    const backBtn = $('.back-btn');
    backBtn?.addEventListener('click', showBackConfirmation);
  }

  /* ===== Back Confirmation Dialog ===== */
  function showBackConfirmation(){
    // 创建模态背景
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
    `;

    // 创建对话框
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: #2d3748;
      border-radius: 12px;
      padding: 0;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      max-width: 400px;
      width: 90%;
      overflow: hidden;
    `;

    // 创建标题栏
    const titleBar = document.createElement('div');
    titleBar.style.cssText = `
      background: #1a202c;
      padding: 16px 20px;
      border-bottom: 1px solid #4a5568;
    `;
    titleBar.innerHTML = '<span style="color: white; font-weight: bold; font-size: 16px;">127.0.0.1:5501 says</span>';

    // 创建内容区域
    const content = document.createElement('div');
    content.style.cssText = `
      padding: 20px;
      color: white;
      font-size: 14px;
      line-height: 1.5;
    `;
    content.innerHTML = 'Are you sure you want to go back?<br>Your progress will be saved.';

    // 创建按钮区域
    const buttonArea = document.createElement('div');
    buttonArea.style.cssText = `
      padding: 16px 20px;
      background: #1a202c;
      border-top: 1px solid #4a5568;
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    `;

    // 创建Cancel按钮
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      background: #4a5568;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
    `;
    cancelBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
    });

    // 创建OK按钮
    const okBtn = document.createElement('button');
    okBtn.textContent = 'OK';
    okBtn.style.cssText = `
      background: #667eea;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
    `;
    okBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
      window.history.back();
    });

    // 组装对话框
    buttonArea.appendChild(cancelBtn);
    buttonArea.appendChild(okBtn);
    dialog.appendChild(titleBar);
    dialog.appendChild(content);
    dialog.appendChild(buttonArea);
    modal.appendChild(dialog);

    // 添加到页面
    document.body.appendChild(modal);

    // 点击背景关闭
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });

    // ESC键关闭
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        document.body.removeChild(modal);
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);
  }

  // Initialize everything when DOM is loaded
  document.addEventListener('DOMContentLoaded', () => {
    init();
    setupBackButton();
  });

  // Expose some functions for external use
  window.markingInterface = {
    getCurrentGrades: () => currentGrades,
    setGrade: selectGrade,
    getCurrentPage: () => currentPage,
    setPage: (page) => {
      currentPage = page;
    }
  };

})();