// Assignment Marking Interface - Interactive Functionality
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

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

    // ✅ 从URL获取project_id和assignment标识
    await resolveAssignmentId();

    if (!ASSIGNMENT_ID) {
      throw new Error('无法确定assignment ID');
    }

    // 显示Assignment和project的信息（名称、截止日期等）
    setupAssignmentDetails();

    // Load rubric data from backend
    await loadRubricData();
    generateCriteriaHTML();

    setupDocumentNavigation();
    setupGradeSelection();
    setupScoreInputs();
    setupFeedback();
    setupActionButtons();

    updateAllCriterionDisplays();
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
              <input type="number" id="score-input-${criterionId}" class="score-input" min="0" max="${criterion.maxScore}" value="${criterion.maxScore}" />
              <span class="max-score">/ ${criterion.maxScore}</span>
            </div>
          </div>

          <div class="grade-info">
            <div class="grade-level">${gradeData[criterionId]?.[currentGrade]?.name || 'High Distinction'}</div>
            <div class="grade-score">${criterion.maxScore}/${criterion.maxScore}</div>
          </div>

          <div class="grade-description">
            <!-- 描述内容将由updateCriterionDisplay动态更新 -->
          </div>

          <div class="feedback-section">
            <button class="show-feedback-btn">+ Add Feedback</button>
            <div class="criterion-feedback hidden">
              <div class="feedback-header">
                <span>Criterion Feedback</span>
                <button class="close-feedback">×</button>
              </div>
              <textarea placeholder="will be included in the overall feedback and visible to students"></textarea>
            </div>
          </div>

          ${isLastCriterion ? `
            <!-- 只在最后一个标准添加操作按钮 -->
            <div class="action-buttons">
              <button class="btn btn-secondary" id="saveBtn">Save Draft</button>
              <button class="btn btn-primary" id="submitBtn">Submit Marks</button>
            </div>
          ` : ''}
        </div>
      `;

      container.innerHTML += criterionHTML;
    });

    console.log('✅ Criteria HTML generated for', criterionIds.length, 'criteria');
    console.log('✅ Action buttons added to last criterion:', lastCriterionId);
  }

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

  // Document navigation
  function setupDocumentNavigation() {
    const thumbnails = $$('.thumbnail');
    const pagination = $('.pagination');
    const viewBtn = $('.view-btn');
    const downloadBtn = $('.download-btn');

    // Thumbnail navigation
    thumbnails.forEach(thumb => {
      thumb.addEventListener('click', () => {
        const page = parseInt(thumb.dataset.page);
        if (page !== currentPage) {
          currentPage = page;
          updateDocumentView();
        }
      });
    });

    // View as text button
    viewBtn?.addEventListener('click', () => {
      alert('Switching to text view...');
    });

    // Download button
    downloadBtn?.addEventListener('click', () => {
      alert('Downloading document...');
    });
  }

  function updateDocumentView() {
    const thumbnails = $$('.thumbnail');
    const pagination = $('.pagination');

    // Update active thumbnail
    thumbnails.forEach(thumb => {
      const page = parseInt(thumb.dataset.page);
      thumb.classList.toggle('active', page === currentPage);
    });

    // Update pagination
    if (pagination) {
      pagination.textContent = `${currentPage} of 2`;
    }

    // Update document content (simulate different pages)
    const documentTitle = $('.document-title');
    const documentText = $('.document-text');

    if (currentPage === 1) {
      documentTitle.textContent = 'The Case for Friction: Why Good Design Isn\'t Always Seamless';
      documentText.innerHTML = `
        <p>In the world of design, there's an almost universal push toward seamlessness. We want our apps to be intuitive, our websites to be frictionless, and our user experiences to be as smooth as possible. But what if this relentless pursuit of seamlessness is actually counterproductive?</p>

        <p>Friction—those moments of pause, confirmation, or even difficulty in an interface—is often seen as the enemy of good design. Yet, when applied thoughtfully, friction can be a powerful tool for creating better, more ethical, and more meaningful user experiences.</p>

        <p>Consider the confirmation screen before deleting important data. While it might seem like an unnecessary step, this moment of friction serves a crucial purpose: it prevents costly mistakes and gives users a chance to reconsider their actions. This is friction in service of user protection.</p>

        <p>In educational contexts, friction can enhance learning. When students must work through challenging problems or navigate complex interfaces, they develop deeper understanding and problem-solving skills. The struggle itself becomes part of the learning process.</p>

        <p>Ethical design often requires friction. Consent forms, privacy settings, and data sharing agreements need to be clear and deliberate, not hidden or rushed. This friction ensures users make informed decisions about their data and privacy.</p>

        <p>Social interactions also benefit from intentional friction. The slight delay in messaging apps, the need to confirm friend requests, or the process of joining a group—these moments of friction create space for reflection and intentional connection.</p>

        <p>Even in physical design, friction serves important purposes. The gates at train stations, while seemingly inconvenient, help manage crowd flow and prevent accidents. The resistance in a good door handle provides tactile feedback about the door's state.</p>

        <p>The key is not to eliminate friction entirely, but to use it strategically. Good friction serves a purpose: it protects, educates, creates space for reflection, or enhances the overall experience. Bad friction is simply an obstacle with no clear benefit.</p>

        <p>As designers, we should ask ourselves: What is this friction protecting? What is it teaching? What is it enabling? When we can answer these questions clearly, friction becomes not just acceptable, but essential to good design.</p>
      `;
    } else {
      documentTitle.textContent = 'Design Principles and User Experience';
      documentText.innerHTML = `
        <p>When designing user interfaces, it's crucial to balance usability with intentional friction. This balance creates experiences that are both efficient and thoughtful.</p>

        <p>User research consistently shows that while users appreciate smooth interactions, they also value moments that make them pause and think. These moments can prevent errors, encourage learning, and create more meaningful interactions.</p>

        <p>The challenge for designers is to identify where friction adds value and where it simply creates frustration. This requires deep understanding of user goals, context, and the broader impact of design decisions.</p>
      `;
    }
  }

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
  }

  function updateCriterionDisplay(criterionId) {
    const criterion = $(`.criterion[data-criterion="${criterionId}"]`);
    if (!criterion) return;

    const grade = currentGrades[criterionId];
    const gradeInfo = gradeData[criterionId][grade];
    console.log('gradeData:', gradeData);
    console.log('criterionId:', criterionId);
    console.log('grade:', grade);
    console.log('gradeInfo:', gradeInfo);

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
      const currentScore = parseInt(scoreInput.value) || 0;
      gradeScore.textContent = `${currentScore}/${maxScore}`;
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

  function updateAllCriterionDisplays() {
    Object.keys(currentGrades).forEach(criterionId => {
      updateCriterionDisplay(parseInt(criterionId));
    });
  }

  // Score input functionality
  function setupScoreInputs() {
    const scoreInputs = $$('.score-input');

    scoreInputs.forEach(input => {
      input.addEventListener('input', () => {
        const criterionId = parseInt(input.id.split('-')[2]);
        const score = parseInt(input.value) || 0;
        const maxScore = parseInt(input.max);

        // Calculate grade based on score
        const grade = calculateGradeFromScore(score, maxScore);
        selectGrade(criterionId, grade);
      });
    });
  }

  function calculateGradeFromScore(score, maxScore) {
    const percentage = (score / maxScore) * 100;

    if (percentage >= 80) return 3; // High Distinction
    if (percentage >= 70) return 2; // Distinction
    if (percentage >= 60) return 1; // Credit
    return 0; // Pass
  }


  // Feedback functionality
  function setupFeedback() {
    const showFeedbackBtns = $$('.show-feedback-btn');
    const closeButtons = $$('.close-feedback');

    // Show feedback buttons
    showFeedbackBtns.forEach(button => {
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

    saveBtn?.addEventListener('click', async () => {
      try {
        InteractionUtils.showLoading(saveBtn, 'Saving Draft...');
        await saveMarks();
        InteractionUtils.showToast('Draft saved successfully', 'success');
      } catch (error) {
        console.error('Error saving marks:', error);
        InteractionUtils.showToast('Failed to save draft', 'error');
      } finally {
        InteractionUtils.hideLoading(saveBtn);
      }
    });

    submitBtn?.addEventListener('click', async () => {
      if (confirm('Are you sure you want to submit these marks? This action cannot be undone.')) {
        try {
          InteractionUtils.showLoading(submitBtn, 'Submitting Marks...');
          await submitMarks();
          InteractionUtils.showToast('Marks submitted successfully', 'success');
          // Optionally redirect or disable editing
        } catch (error) {
          console.error('Error submitting marks:', error);
          InteractionUtils.showToast('Failed to submit marks', 'error');
        } finally {
          InteractionUtils.hideLoading(submitBtn);
        }
      }
    });
  }

  // Save marks to backend
  async function saveMarks() {
    const marksData = {
      assignmentId: ASSIGNMENT_ID,
      criteria: currentGrades,
      scores: getCurrentScores(),
      feedback: getCurrentFeedback(),
      timestamp: new Date().toISOString()
    };

    const response = await fetch(`${API_BASE_URL}/assignments/${ASSIGNMENT_ID}/marks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(marksData)
    });

    if (!response.ok) {
      throw new Error('Failed to save marks');
    }

    return response.json();
  }

  // Submit marks to backend
  async function submitMarks() {
    const marksData = {
      assignmentId: ASSIGNMENT_ID,
      criteria: currentGrades,
      scores: getCurrentScores(),
      feedback: getCurrentFeedback(),
      status: 'submitted',
      timestamp: new Date().toISOString()
    };

    const response = await fetch(`${API_BASE_URL}/assignments/${ASSIGNMENT_ID}/marks/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(marksData)
    });

    if (!response.ok) {
      throw new Error('Failed to submit marks');
    }

    return response.json();
  }

  // Get current scores from inputs
  function getCurrentScores() {
    const scores = {};
    const scoreInputs = $$('.score-input');
    scoreInputs.forEach(input => {
      const criterionId = parseInt(input.id.split('-')[2]);
      scores[criterionId] = parseInt(input.value) || 0;
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
      updateDocumentView();
    }
  };

})();