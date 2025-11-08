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
    try {
      // ✅ 显示用户名
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

      // ✅ 从URL获取project_id和assignment标识
      await resolveAssignmentId();

      if (!ASSIGNMENT_ID) {
        throw new Error('无法确定assignment ID');
      }

      await loadAssignmentFiles();
      setupDocumentNavigation();
      setupGradeSelection();
      setupScoreInputs();
      setupFeedback();
      setupActionButtons();

      // Load rubric data from backend
      await loadRubricData();
      updateAllCriterionDisplays();

    } catch (error) {
      console.error('初始化失败:', error);
      showNotification('初始化失败: ' + error.message, 'error');
    }
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

  // Load rubric data from backend
  async function loadRubricData() {
    if (!ASSIGNMENT_ID) {
      console.error('ASSIGNMENT_ID未定义');
      loadDefaultRubricData();
      return;
    }

    try {
      // 使用现有的assignment status接口获取project_id
      const assignmentResponse = await fetch(`${API_BASE_URL}/uploads/assignment/${ASSIGNMENT_ID}/status`);
      if (!assignmentResponse.ok) {
        throw new Error('Failed to load assignment data');
      }
      const assignmentData = await assignmentResponse.json();

      // 通过project_id获取最新的rubric_id
      const projectResponse = await fetch(`${API_BASE_URL}/uploads/project/${assignmentData.assignment.project_id}/latest-ids`);
      if (!projectResponse.ok) {
        throw new Error('Failed to load project rubric');
      }
      const projectData = await projectResponse.json();

      if (!projectData.rubric) {
        throw new Error('No rubric found for this project');
      }

      // 使用现有的rubric details接口
      const rubricResponse = await fetch(`${API_BASE_URL}/uploads/rubric/${projectData.rubric.rubric_id}/details`);
      if (!rubricResponse.ok) {
        throw new Error('Failed to load rubric details');
      }
      const rubricData = await rubricResponse.json();

      // 转换数据格式以适应前端界面
      criterionData = transformRubricData(rubricData);

      // Update UI with loaded data
      updateRubricUI();

    } catch (error) {
      console.error('Error loading rubric:', error);
      loadDefaultRubricData();
    }
  }

  // 转换后端数据为前端需要的格式
  function transformRubricData(rubricData) {
    const transformedData = {};

    rubricData.criteria.forEach((criterion, index) => {
      const criterionId = index + 1; // 使用序列号作为ID

      // 构建descriptions对象
      const descriptions = {};
      criterion.grade_levels.forEach((level, levelIndex) => {
        descriptions[levelIndex] = {
          points: `${level.min_score}-${level.max_score} points`,
          criteria: [level.description] // 将描述字符串转为数组
        };
      });

      transformedData[criterionId] = {
        title: criterion.title,
        maxScore: criterion.max_score,
        descriptions: descriptions
      };
    });

    return transformedData;
  }

  // 加载assignment关联的文件
  async function loadAssignmentFiles() {
    if (!ASSIGNMENT_ID) {
      console.error('ASSIGNMENT_ID未定义');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/uploads/assignment/${ASSIGNMENT_ID}/files`);
      if (!response.ok) {
        throw new Error('Failed to load assignment files');
      }
      const data = await response.json();

      if (data.files && data.files.length > 0) {
        updateDocumentViewer(data.files);
      } else {
        showNoFilesMessage();
      }
    } catch (error) {
      console.error('Error loading assignment files:', error);
      showNoFilesMessage();
    }
  }

  // 更新文档查看器
  function updateDocumentViewer(files) {
    const documentViewer = $('.document-viewer');
    const thumbnailsContainer = $('.thumbnails');

    // 清空现有内容
    thumbnailsContainer.innerHTML = '';

    // 创建缩略图
    files.forEach((file, index) => {
      const thumbnail = document.createElement('div');
      thumbnail.className = `thumbnail ${index === 0 ? 'active' : ''}`;
      thumbnail.dataset.page = index + 1;
      thumbnail.dataset.uploadId = file.upload_id;

      thumbnail.innerHTML = `
        <div class="thumbnail-icon">📄</div>
        <div class="thumbnail-name">${file.file_name}</div>
      `;

      thumbnailsContainer.appendChild(thumbnail);
    });

    // 更新文档显示
    updateDocumentContent(files[0]);
  }

  // 更新文档内容
  function updateDocumentContent(file) {
    const documentTitle = $('.document-title');
    const documentContent = $('.document-content');

    documentTitle.textContent = file.file_name;

    // 根据文件类型显示不同内容
    if (file.mime_type === 'application/pdf') {
      documentContent.innerHTML = `
        <iframe src="${API_BASE_URL}/uploads/${file.upload_id}/download"
                width="100%" height="600px"
                style="border: none;"></iframe>
      `;
    } else {
      documentContent.innerHTML = `
        <div class="file-preview">
          <p>file type: ${file.file_type}</p>
          <p>not support, please download</p>
          <button class="download-file-btn" data-upload-id="${file.upload_id}">
            download
          </button>
        </div>
      `;
    }
  }

  // 显示无文件提示
  function showNoFilesMessage() {
    const documentContent = $('.document-content');
    documentContent.innerHTML = `
      <div class="no-files-message">
        <p>no assignment file!</p>
      </div>
    `;
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

  // Update rubric UI with loaded data
  function updateRubricUI() {
    const criteriaContainers = $$('.criterion');

    criteriaContainers.forEach((container, index) => {
      const criterionId = index + 1;
      const criterionDataItem = criterionData[criterionId];

      if (!criterionDataItem) {
        console.warn(`No data for criterion ${criterionId}`);
        return;
      }

      // 更新标题
      const titleElement = container.querySelector('.criterion-title');
      if (titleElement) {
        titleElement.textContent = criterionDataItem.title;
      }

      // 更新分数输入
      const scoreInput = container.querySelector('.score-input');
      if (scoreInput) {
        scoreInput.max = criterionDataItem.maxScore;
        scoreInput.placeholder = `0-${criterionDataItem.maxScore}`;
      }

      // 更新最大分数显示
      const maxScoreElement = container.querySelector('.max-score');
      if (maxScoreElement) {
        maxScoreElement.textContent = `/ ${criterionDataItem.maxScore}`;
      }

      // 更新等级选项
      updateGradeOptions(container, criterionDataItem);
    });
  }

  // 更新等级选项
  function updateGradeOptions(container, criterionData) {
    const gradeOptionsContainer = container.querySelector('.grade-options');
    if (!gradeOptionsContainer) return;

    // 清空现有选项
    gradeOptionsContainer.innerHTML = '';

    // 根据数据动态创建等级选项（从高到低）
    const gradeLevels = Object.keys(criterionData.descriptions).length;

    for (let i = gradeLevels - 1; i >= 0; i--) {
      const gradeOption = document.createElement('div');
      gradeOption.className = 'grade-option';
      gradeOption.dataset.grade = i;

      const gradeInfo = gradeData[i] || {
        name: `Level ${i}`,
        color: '#ccc'
      };

      gradeOption.innerHTML = `
        <div class="grade-color" style="background-color: ${gradeInfo.color}"></div>
        <div class="grade-name">${gradeInfo.name}</div>
      `;

      gradeOptionsContainer.appendChild(gradeOption);
    }

    // 重新绑定点击事件
    const gradeOptions = container.querySelectorAll('.grade-option');
    gradeOptions.forEach(option => {
      option.addEventListener('click', () => {
        const grade = parseInt(option.dataset.grade);
        const criterionId = parseInt(container.dataset.criterion);
        selectGrade(criterionId, grade);
      });
    });
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
    // Download button - 修改为从后端获取文件
    downloadBtn?.addEventListener('click', async () => {
    try {
      // 获取当前活动的文件
      const activeThumbnail = $('.thumbnail.active');
      if (!activeThumbnail) return;

      const uploadId = activeThumbnail.dataset.uploadId;
      if (!uploadId) return;

      // 下载文件
      const response = await fetch(`${API_BASE_URL}/uploads/${uploadId}/download`);
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = activeThumbnail.querySelector('.thumbnail-name').textContent;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (error) {
      console.error('Download error:', error);
      alert('下载失败，请重试');
    }
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
        const newGrade = Math.min(3, currentGrade + 1); // Move to higher grade
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
    const gradeInfo = gradeData[grade];
    const criterionInfo = criterionData[criterionId];

    if (!criterionInfo) {
      console.error(`No criterion info for ID: ${criterionId}`);
      return;
    }

    const description = criterionInfo.descriptions[grade];

    // Update grade options
    const gradeOptions = criterion.querySelectorAll('.grade-option');
    gradeOptions.forEach(option => {
      const optionGrade = parseInt(option.dataset.grade);
      option.classList.toggle('active', optionGrade === grade);
    });

    // Update grade info
    const gradeLevel = criterion.querySelector('.grade-level');
    const gradeScore = criterion.querySelector('.grade-score');
    const scoreInput = criterion.querySelector('.score-input');

    if (gradeLevel) gradeLevel.textContent = gradeInfo.name;
    if (gradeScore && scoreInput) {
      const maxScore = criterionInfo.maxScore;
      const currentScore = parseInt(scoreInput.value) || 0;
      gradeScore.textContent = `${currentScore}/${maxScore}`;
    }

    // Update description
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
    setGrade: selectGrade,
    getCurrentPage: () => currentPage,
    setPage: (page) => {
      currentPage = page;
      updateDocumentView();
    }
  };

})();
