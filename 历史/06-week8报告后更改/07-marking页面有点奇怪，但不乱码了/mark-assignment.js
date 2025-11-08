// Assignment Marking Interface - Interactive Functionality
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // Grade data structure (reordered from high to low)
  const gradeData = {
    3: { name: 'High Distinction', color: 'var(--grade-high-distinction)', score: '9-10' },
    2: { name: 'Distinction', color: 'var(--grade-distinction)', score: '7-8' },
    1: { name: 'Credit', color: 'var(--grade-credit)', score: '5-6' },
    0: { name: 'Pass', color: 'var(--grade-pass)', score: '0-4' }
  };

  // Criterion data - will be loaded from backend
  let criterionData = {};

  // API Configuration
  const API_BASE_URL = '/api'; // Adjust based on your backend
  let ASSIGNMENT_ID = null; // 改为变量，动态获取
  let PROJECT_ID = null; // 存储project_id

  // Current state
  let currentPage = 1;
  let currentGrades = { 1: 3, 2: 3, 3: 3 }; // Default to High Distinction

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

    // 动态生成评分标准UI
    createDynamicRubricUI(criterionData.criteria);

    setupDocumentNavigation();
//    setupFeedback();
    setupActionButtons();
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
      criterionData = data;

      console.log('✅ Criterion data stored:', criterionData);

    } catch (error) {
      console.error('Error loading rubric:', error);
      // Fallback to default data
      loadDefaultRubricData();
    }
  }

  // 动态生成评分标准UI
  function createDynamicRubricUI(criteria) {
    const markingCriteriaContainer = $('.marking-criteria');

    // 清空现有内容
    markingCriteriaContainer.innerHTML = '';

    // 按seq_no排序
    const sortedCriteria = criteria.sort((a, b) => a.seq_no - b.seq_no);

    // 为每个评分标准生成HTML
    sortedCriteria.forEach((criterion, index) => {
      const criterionNumber = index + 1;
      const maxScore = criterion.max_score;

      // 生成等级选项（按分数从高到低排序）
      const sortedLevels = criterion.grade_levels.sort((a, b) => b.max_score - a.max_score);
      const gradeOptionsHTML = sortedLevels.map((level, levelIndex) => `
        <div class="grade-option ${levelIndex === 0 ? 'active' : ''}"
             data-grade-level-id="${level.grade_level_id}"
             data-min-score="${level.min_score}"
             data-max-score="${level.max_score}">
          ${level.level_name}
        </div>
      `).join('');

      // 生成等级描述
      const gradeDescriptionsHTML = sortedLevels.map(level => `
        <div class="grade-level-description" data-level-id="${level.grade_level_id}">
          <strong>${level.min_score}-${level.max_score} points:</strong>
          <p>${level.description}</p>
        </div>
      `).join('');

      const criterionHTML = `
        <div class="criterion" data-criterion="${criterion.criterion_id}" data-criterion-number="${criterionNumber}">
          <div class="criterion-header">
            <div class="criterion-number">${criterionNumber}.</div>
            <div class="criterion-title">${criterion.title}</div>
          </div>

          ${criterion.description ? `
            <div class="criterion-description">
              <p>${criterion.description}</p>
            </div>
          ` : ''}

          <div class="grade-selector">
            <button class="grade-arrow left">‹</button>
            <div class="grade-options">
              ${gradeOptionsHTML}
            </div>
            <button class="grade-arrow right">›</button>
          </div>

          <div class="score-input-section">
            <div class="score-input-container">
              <label for="score-input-${criterionNumber}">Manual Score:</label>
              <input type="number" id="score-input-${criterionNumber}"
                     class="score-input"
                     min="0"
                     max="${maxScore}"
                     step="0.1"
                     value="0"
                     data-criterion="${criterion.criterion_id}" />
              <span class="max-score">/ ${maxScore}</span>
            </div>
          </div>

          <div class="grade-info">
            <div class="grade-level">Not Graded</div>
            <div class="grade-score">0/${maxScore}</div>
          </div>

          <div class="grade-description">
            ${gradeDescriptionsHTML}
          </div>

          <div class="feedback-section">
            <button class="show-feedback-btn">+ Add Feedback</button>
            <div class="criterion-feedback hidden">
              <div class="feedback-header">
                <span>Criterion Feedback</span>
                <button class="close-feedback">×</button>
              </div>
              <textarea placeholder="will be included in the overall feedback and visible to students"
                        data-criterion="${criterion.criterion_id}"></textarea>
            </div>
          </div>
        </div>
      `;

      markingCriteriaContainer.insertAdjacentHTML('beforeend', criterionHTML);
    });

    // 添加总分显示区域
    const totalScoreHTML = `
      <div class="total-score-section">
        <div class="total-score-container">
          <div class="total-score-label">Total Score:</div>
          <div class="total-score-display">
            <span id="current-total">0</span> / <span id="max-total">${sortedCriteria.reduce((sum, criterion) => sum + criterion.max_score, 0)}</span>
          </div>
        </div>
        <div class="total-percentage">
          <span id="total-percentage">0%</span>
        </div>
      </div>
    `;

    markingCriteriaContainer.insertAdjacentHTML('beforeend', totalScoreHTML);

    // 重新绑定事件
    bindCriterionEvents();

    // 初始化总分显示
    updateTotalScore();

    console.log(`✅ Generated ${sortedCriteria.length} criteria dynamically`);
  }

  // 绑定评分标准事件
  function bindCriterionEvents() {
    // 等级选择箭头事件
    const gradeArrows = document.querySelectorAll('.grade-arrow');
    gradeArrows.forEach(arrow => {
      // 移除现有的事件监听器（通过克隆替换）
      const newArrow = arrow.cloneNode(true);
      arrow.parentNode.replaceChild(newArrow, arrow);

      newArrow.addEventListener('click', function() {
        const gradeOptions = this.parentElement.querySelector('.grade-options');
        const activeOption = gradeOptions.querySelector('.grade-option.active');
        const allOptions = gradeOptions.querySelectorAll('.grade-option');
        const currentIndex = Array.from(allOptions).indexOf(activeOption);

        if (this.classList.contains('left')) {
          // 向左选择（选择更低的等级）
          const prevIndex = (currentIndex + 1) % allOptions.length;
          allOptions.forEach(option => option.classList.remove('active'));
          allOptions[prevIndex].classList.add('active');
        } else {
          // 向右选择（选择更高的等级）
          const nextIndex = (currentIndex - 1 + allOptions.length) % allOptions.length;
          allOptions.forEach(option => option.classList.remove('active'));
          allOptions[nextIndex].classList.add('active');
        }

        updateScoreFromGradeSelection(this.closest('.criterion'));
      });
    });

    // 分数输入变化事件
    const scoreInputs = document.querySelectorAll('.score-input');
    scoreInputs.forEach(input => {
      const newInput = input.cloneNode(true);
      input.parentNode.replaceChild(newInput, input);

      newInput.addEventListener('input', function() {
        updateGradeSelectionFromScore(this.closest('.criterion'));
        updateTotalScore(); // 自动更新总分
      });
    });

    // 反馈按钮事件
    const showFeedbackBtns = document.querySelectorAll('.show-feedback-btn');
    showFeedbackBtns.forEach(btn => {
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);

      newBtn.addEventListener('click', function() {
        const feedback = this.parentElement.querySelector('.criterion-feedback');
        feedback.classList.remove('hidden');
        this.style.display = 'none';
      });
    });

    const closeFeedbackBtns = document.querySelectorAll('.close-feedback');
    closeFeedbackBtns.forEach(btn => {
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);

      newBtn.addEventListener('click', function() {
        const feedback = this.closest('.criterion-feedback');
        feedback.classList.add('hidden');
        const showBtn = feedback.closest('.criterion').querySelector('.show-feedback-btn');
        showBtn.style.display = 'block';
      });
    });
  }

  // 根据等级选择更新分数
  function updateScoreFromGradeSelection(criterionElement) {
    const activeGrade = criterionElement.querySelector('.grade-option.active');
    const minScore = parseFloat(activeGrade.dataset.minScore);
    const maxScore = parseFloat(activeGrade.dataset.maxScore);
    const levelName = activeGrade.textContent;

    // 设置分数为最高分（或平均值，根据你的需求调整）
    const score = maxScore;
    const scoreInput = criterionElement.querySelector('.score-input');
    scoreInput.value = score;

    // 更新显示信息
    const gradeLevel = criterionElement.querySelector('.grade-level');
    const gradeScore = criterionElement.querySelector('.grade-score');
    gradeLevel.textContent = levelName;
    gradeScore.textContent = `${score}/${scoreInput.getAttribute('max')}`;

    // 更新总分
    updateTotalScore();
  }

  // 根据分数输入更新等级选择
  function updateGradeSelectionFromScore(criterionElement) {
    const scoreInput = criterionElement.querySelector('.score-input');
    const score = parseFloat(scoreInput.value) || 0;
    const maxScore = parseFloat(scoreInput.getAttribute('max'));
    const gradeOptions = criterionElement.querySelectorAll('.grade-option');

    // 找到匹配的等级
    let matchedLevel = null;
    for (let i = 0; i < gradeOptions.length; i++) {
      const option = gradeOptions[i];
      const minScore = parseFloat(option.dataset.minScore);
      const maxScore = parseFloat(option.dataset.maxScore);

      if (score >= minScore && score <= maxScore) {
        matchedLevel = option;
        break; // 退出循环
      }
    }

    const gradeLevel = criterionElement.querySelector('.grade-level');
    if (matchedLevel) {
      gradeOptions.forEach(option => option.classList.remove('active'));
      matchedLevel.classList.add('active');
      gradeLevel.textContent = matchedLevel.textContent;
    } else {
      gradeLevel.textContent = 'Custom Score';
    }

    // 格式化显示分数，保留一位小数
    const formattedScore = score % 1 === 0 ? score.toString() : score.toFixed(1);
    const gradeScore = criterionElement.querySelector('.grade-score');
    gradeScore.textContent = `${formattedScore}/${maxScore}`;
  }

  // 更新总分显示
  function updateTotalScore() {
    let currentTotal = 0;
    let maxTotal = 0;

    const criteria = document.querySelectorAll('.criterion');
    criteria.forEach(criterion => {
      const scoreInput = criterion.querySelector('.score-input');
      const score = parseFloat(scoreInput.value) || 0;
      const maxScore = parseFloat(scoreInput.getAttribute('max')) || 0;

      currentTotal += score;
      maxTotal += maxScore;
    });

    // 格式化显示
    const formattedCurrentTotal = currentTotal % 1 === 0 ? currentTotal.toString() : currentTotal.toFixed(1);
    const percentage = maxTotal > 0 ? Math.round((currentTotal / maxTotal) * 100) : 0;

    // 更新显示
    const currentTotalElement = document.getElementById('current-total');
    const totalPercentageElement = document.getElementById('total-percentage');

    if (currentTotalElement) {
      currentTotalElement.textContent = formattedCurrentTotal;
    }

    if (totalPercentageElement) {
      totalPercentageElement.textContent = `${percentage}%`;
    }

    console.log(`📊 总分更新: ${formattedCurrentTotal}/${maxTotal} (${percentage}%)`);
  }

  // 获取所有评分数据
  function getAllScores() {
    const scores = {};
    const criteria = document.querySelectorAll('.criterion');

    criteria.forEach(criterion => {
      const criterionId = criterion.dataset.criterionId;
      const scoreInput = criterion.querySelector('.score-input');
      const feedbackTextarea = criterion.querySelector('.criterion-feedback textarea');
      const activeGrade = criterion.querySelector('.grade-option.active');

      const score = parseFloat(scoreInput.value) || 0;
      const feedback = feedbackTextarea ? feedbackTextarea.value : '';

      scores[criterionId] = {
        score: score,
        feedback: feedback,
        gradeLevelId: activeGrade ? activeGrade.dataset.gradeLevelId : null
      };
    });

    return scores;
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
        await saveMarks();
        showNotification('Draft saved successfully', 'success');
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
          // Optionally redirect or disable editing
        } catch (error) {
          console.error('Error submitting marks:', error);
          showNotification('Failed to submit marks', 'error');
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
      const criterionId = input.dataset.criterionId;
      scores[criterionId] = parseFloat(input.value) || 0;
    });
    return scores;
  }

  // Get current feedback
  function getCurrentFeedback() {
    const feedback = {};
    const feedbackTextareas = $$('.criterion-feedback textarea');
    feedbackTextareas.forEach(textarea => {
      const criterionId = textarea.dataset.criterionId;
      if (criterionId) {
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
    backBtn?.addEventListener('click', () => {
      if (confirm('Are you sure you want to go back? Your progress will be saved.')) {
        // Navigate back or save and navigate
        window.history.back();
      }
    });
  }

  // Initialize everything when DOM is loaded
  document.addEventListener('DOMContentLoaded', () => {
    init();
    setupBackButton();
  });

  // Expose some functions for external use
  window.markingInterface = {
    getCurrentGrades: () => currentGrades,
    getCurrentPage: () => currentPage,
    setPage: (page) => {
      currentPage = page;
      updateDocumentView();
    }
  };

})();