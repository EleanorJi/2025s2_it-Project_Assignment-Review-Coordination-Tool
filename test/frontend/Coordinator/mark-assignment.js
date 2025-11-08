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
  const API_BASE_URL = 'http://localhost:3000/api'; // Adjust based on your backend
  const ASSIGNMENT_ID = 'assignment_1_2025_sem1'; // This should come from URL params or state

  // Current state
  let currentPage = 1;
  let currentGrades = { 1: 3, 2: 3, 3: 3 }; // Default to High Distinction

  // Initialize the interface
  async function init() {
    setupDocumentNavigation();
    setupGradeSelection();
    setupScoreInputs();
    setupFeedback();
    setupActionButtons();
    
    // Load rubric data from backend
    await loadRubricData();
    updateAllCriterionDisplays();
  }

  // Load rubric data from backend
  async function loadRubricData() {
    try {
      const response = await fetch(`${API_BASE_URL}/assignments/${ASSIGNMENT_ID}/rubric`);
      if (!response.ok) {
        throw new Error('Failed to load rubric data');
      }
      const data = await response.json();
      criterionData = data.criteria;
      
      // Update UI with loaded data
      updateRubricUI();
    } catch (error) {
      console.error('Error loading rubric:', error);
      // Fallback to default data
      loadDefaultRubricData();
    }
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
    Object.keys(criterionData).forEach(criterionId => {
      const criterion = $(`.criterion[data-criterion="${criterionId}"]`);
      if (criterion) {
        const titleElement = criterion.querySelector('.criterion-title');
        if (titleElement) {
          titleElement.textContent = criterionData[criterionId].title;
        }
        
        const scoreInput = criterion.querySelector('.score-input');
        if (scoreInput) {
          scoreInput.max = criterionData[criterionId].maxScore;
        }
        
        const maxScoreElement = criterion.querySelector('.max-score');
        if (maxScoreElement) {
          maxScoreElement.textContent = `/ ${criterionData[criterionId].maxScore}`;
        }
      }
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
