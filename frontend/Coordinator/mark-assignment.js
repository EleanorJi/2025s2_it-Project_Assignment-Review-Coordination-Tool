// Assignment Marking Interface - Interactive Functionality
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));


  let originalData = null; // To store the original criterion data
  // Criterion data - will be loaded from backend
  let criterionData = {};

  // API Configuration
  const API_BASE_URL = '/api'; // Adjust based on your backend
  let ASSIGNMENT_ID = null; // Changed to variable, dynamically retrieved
  let PROJECT_ID = null; // Store project_id

  // Current state
  let currentPage = 1;
  // Grade data structure (reordered from high to low)
  let gradeData = {};
  let currentGrades = {}; // Default to High Distinction

  // Add PDF.js configuration at file beginning
  const pdfjsLib = window['pdfjs-dist/build/pdf'];
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

  // PDF viewer state
  let pdfDoc = null;
  let currentPdfPage = 1;
  let totalPdfPages = 0;
  let currentScale = 1.0;
  const SCALE_STEP = 0.1;
  const MIN_SCALE = 0.3;
  const MAX_SCALE = 5.0;

  // Store all pages' canvas and dimensions
  let pageCanvases = [];
  let pageHeights = [];
  let totalHeight = 0;

  // Initialize the interface
  async function init() {
    // ✅ Display username
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

    // Debug use, check current user information
    // getCurrentUser();

    // ✅ Get project_id and assignment identifier from URL
    await resolveAssignmentId();

    if (!ASSIGNMENT_ID) {
      throw new Error('Unable to determine assignment ID');
    }

    // Display Assignment and project information (name, due date, etc.)
    setupAssignmentDetails();

    // Load rubric data from backend
    await loadRubricData();

    // ✅ New addition: load saved scores and feedback data
    await loadSavedScoresAndFeedback();

    if (window.savedScoresData?.finalized) {
      console.log('✅ 检测到 finalized 状态，锁定所有输入');
      lockAllInputs();
    }

    generateCriteriaHTML();

    setupDocumentNavigation();
    setupGradeSelection();
    setupScoreInputs();
    setupFeedback();
    setupActionButtons();
    
    updateAllCriterionDisplays();
    updateTotalScoreDisplay();
  }

  // Load saved scores and feedback data from backend
  async function loadSavedScoresAndFeedback() {
    try {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        console.warn('Unable to get current user info, skipping loading saved data');
        return;
      }

      let response;
      if (currentUser.role === 'COORDINATOR') {
        response = await fetch(`${API_BASE_URL}/uploads/scoring/baseline/${ASSIGNMENT_ID}`);
      } else if (currentUser.role === 'MARKER') {
        response = await fetch(`${API_BASE_URL}/uploads/scoring/marker/${ASSIGNMENT_ID}/${currentUser.userId}`);
      } else {
        console.warn('Unknown user role, skipping loading saved data');
        return;
      }

      if (!response.ok) {
        if (response.status === 404) {
          console.log('No saved data found, using default values');
          return;
        }
        throw new Error(`Loading failed: ${response.status}`);
      }

      const data = await response.json();

      // Handle different data structures based on user role
      const scoresData = currentUser.role === 'COORDINATOR'
        ? data.baseline_scores
        : data.marker_scores;

      if (!scoresData || scoresData.length === 0) {
        console.log('No saved score data');
        return;
      }

      // Create mapping for subsequent use
      window.savedScoresData = {
        scores: {},
        feedback: {},
        finalized: currentUser.role === 'MARKER'
          ? (data.marker_scores?.[0]?.finalized || false)
          : (data.baseline_scores?.[0]?.finalized || false)
      };
      console.log('✅ Set finalized status:', window.savedScoresData.finalized);

      // Process scores and feedback data - directly use seq_no as frontend ID
      scoresData.forEach(scoreItem => {
        // Find corresponding frontend criterion based on backend criterion_id (using seq_no)
        const criterion = originalData.criteria.find(c => c.criterion_id === scoreItem.criterion_id);
        if (criterion) {
          const frontendCriterionId = criterion.seq_no; // seq_no is the frontend ID

          // Save scores
          window.savedScoresData.scores[frontendCriterionId] = scoreItem.score;

          // Save feedback
          if (scoreItem.comment) {
            window.savedScoresData.feedback[frontendCriterionId] = scoreItem.comment;
          }

          // Set corresponding grade based on score
          if (scoreItem.matched_level && gradeData[frontendCriterionId]) {
            const matchedGrade = findMatchingGrade(frontendCriterionId, scoreItem.score);
            if (matchedGrade !== null) {
              currentGrades[frontendCriterionId] = matchedGrade;
            }
          }
        }
      });

      console.log('✅ Saved data loaded successfully:', window.savedScoresData);

    } catch (error) {
      console.error('❌ Failed to load saved data:', error);
      // Don't throw error, continue using default values
    }
  }

  // Find matching grade based on score
  function findMatchingGrade(criterionId, score) {
    const grades = gradeData[criterionId];
    if (!grades) return null;

    // Sort grades by index (0, 1, 2, 3, 4) - already sorted by score from high to low
    const sortedGrades = Object.keys(grades)
      .map(grade => parseInt(grade))
      .sort((a, b) => a - b);

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

  // Parse URL parameters to get real assignment_id
  async function resolveAssignmentId() {

    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('project');
    const assignmentParam = urlParams.get('assignment');

    if (!projectId) {
      throw new Error('Missing project_id parameter in URL');
    }

    if (!assignmentParam || !['assignment1', 'assignment2'].includes(assignmentParam)) {
      throw new Error('assignment parameter must be assignment1 or assignment2');
    }

    PROJECT_ID = projectId;

    try {
      // Call existing interface to get latest-ids
      const response = await fetch(`${API_BASE_URL}/uploads/project/${PROJECT_ID}/latest-ids`);
      if (!response.ok) {
        throw new Error('Failed to get project info');
      }

      const data = await response.json();

      // Select corresponding assignment_id based on assignment parameter
      if (assignmentParam === 'assignment1' && data.assignment1) {
        ASSIGNMENT_ID = data.assignment1.assignment_id;
      } else if (assignmentParam === 'assignment2' && data.assignment2) {
        ASSIGNMENT_ID = data.assignment2.assignment_id;
      } else {
        throw new Error(`Cannot find corresponding assignment: ${assignmentParam}`);
      }
      console.log(`✅ Parse successful: project_id=${PROJECT_ID}`);
      console.log(`✅ Parse successful: ${assignmentParam} -> assignment_id=${ASSIGNMENT_ID}`);

    } catch (error) {
      console.error('Failed to parse assignment ID:', error);
      throw new Error(`Unable to parse assignment ID: ${error.message}`);
    }
  }

  // Display Assignment and project information (name, due date, etc.)
  async function setupAssignmentDetails() {
    try {
      if (!ASSIGNMENT_ID) {
        console.error('Assignment ID is not available');
        return;
      }

      // 1. Get assignment details
      const assignmentResponse = await fetch(`/api/uploads/assignment/${ASSIGNMENT_ID}/status`);
      if (!assignmentResponse.ok) {
        throw new Error(`Failed to fetch assignment details: ${assignmentResponse.status}`);
      }

      const assignmentData = await assignmentResponse.json();
      const assignment = assignmentData.assignment;

      // Set PROJECT_ID (if not yet set)
      if (!PROJECT_ID && assignment.project_id) {
        PROJECT_ID = assignment.project_id;
      }

      // 2. Get project details
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

      // 3. Format date
      let dueDateText = 'Due date not set';
      if (assignment.due_at_local_iso) {
        dueDateText = `Due: ${prettyFromIsoLocal(assignment.due_at_local_iso)}`;
      } else if (assignment.due_at_pretty) {
        dueDateText = `Due: ${assignment.due_at_pretty}`;
      } else if (assignment.due_at) {
        // Fallback: best-effort pretty print without timezone conversion
        dueDateText = `Due: ${prettyFromIsoLocal(String(assignment.due_at).replace(' ', 'T'))}`;
      }

      // 4. Update page elements
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

      // Wire edit due date button (Coordinator only)
      const editBtn = document.getElementById('edit-due-btn');
      try {
        const rawUser = localStorage.getItem('user');
        const user = rawUser ? JSON.parse(rawUser) : null;
        const isCoordinator = user && user.role === 'COORDINATOR';
        if (isCoordinator && editBtn) {
          editBtn.style.display = 'inline-block';

          // Parse current due date for later comparison
          const parseLocalIsoToDate = (isoLocal) => {
            if (!isoLocal) return null;
            const m = String(isoLocal).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
            if (!m) return null;
            const [_, y, mo, d, hh, mm, ss] = m;
            return new Date(parseInt(y), parseInt(mo) - 1, parseInt(d), parseInt(hh), parseInt(mm), parseInt(ss || '00'));
          };

          const originalDue = assignment.due_at_local_iso
            ? parseLocalIsoToDate(assignment.due_at_local_iso)
            : (assignment.due_at ? new Date(String(assignment.due_at).replace(' ', 'T')) : null);

          editBtn.addEventListener('click', () => {
            // If original due date already passed, block editing
            if (originalDue && new Date() > originalDue) {
              showNotification('原始截止时间已过，无法更改', 'error');
              return;
            }
            openEditDueDialog(assignment);
          });
        }
      } catch (_) {
        // ignore
      }

    } catch (error) {
      console.error('❌ Failed to setup assignment details:', error);

      // Set default values as fallback
      const assignmentTitleEl = document.querySelector('.assignment-title');
      const dueDateEl = document.querySelector('.due-date');

      if (assignmentTitleEl) {
        assignmentTitleEl.textContent = 'Unnamed Project - Unnamed Assignment';
      }

      if (dueDateEl) {
        dueDateEl.textContent = 'Due: Date not available';
      }
      // Wire edit due date button in fallback (Coordinator only, without due check)
      const editBtn = document.getElementById('edit-due-btn');
      try {
        const rawUser = localStorage.getItem('user');
        const user = rawUser ? JSON.parse(rawUser) : null;
        const isCoordinator = user && user.role === 'COORDINATOR';
        if (isCoordinator && editBtn) {
          editBtn.style.display = 'inline-block';
          editBtn.addEventListener('click', () => openEditDueDialog({ assignment_id: ASSIGNMENT_ID }));
        }
      } catch (_) { /* noop */ }

    }
  }

  // Date formatting helper function (matching your provided format: Tue Sep 16, 2025 10:00)
  function formatDueDateInTz(date, tz) {
    const z = new Intl.DateTimeFormat('en-AU', {
      timeZone: tz,
      year: 'numeric', month: 'short', day: '2-digit', weekday: 'short',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(date).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
    // Compose like: Wed, Oct 15, 2025, 00:46
    return `${z.weekday}, ${z.month} ${z.day.replace(/^0/, '')}, ${z.year}, ${z.hour}:${z.minute}`;
  }

  // Render pretty string from ISO-like local (YYYY-MM-DDTHH:MM:SS) without timezone shift
  function prettyFromIsoLocal(isoLocal) {
    // Parse components instead of new Date() to avoid timezone conversion
    const m = String(isoLocal).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return isoLocal;
    const [_, y, mo, d, hh, mm] = m;
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    // Compute weekday using Date in UTC to avoid offset, but only for weekday
    const weekdayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const dt = new Date(Date.UTC(parseInt(y), parseInt(mo)-1, parseInt(d)));
    const weekday = weekdayNames[dt.getUTCDay()];
    return `${weekday}, ${monthNames[parseInt(mo)-1]} ${parseInt(d)}, ${y}, ${hh}:${mm}`;
  }

  function toDatetimeLocalValue(date) {
    const pad = (n) => String(n).padStart(2, '0');
    const y = date.getFullYear();
    const m = pad(date.getMonth()+1);
    const d = pad(date.getDate());
    const hh = pad(date.getHours());
    const mm = pad(date.getMinutes());
    return `${y}-${m}-${d}T${hh}:${mm}`;
  }

  function openEditDueDialog(assignment) {
    const modal = document.createElement('div');
    modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:10000;`;
    const card = document.createElement('div');
    card.style.cssText = `background:#fff;padding:16px 20px;border-radius:8px;min-width:340px;max-width:92%;`;
    card.innerHTML = `
      <div style="font-weight:700;margin-bottom:12px;font-size:16px;">Edit Due Date</div>
      <div style="margin-bottom:6px;color:#555;font-size:12px;">Due date</div>
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:12px;">
        <input id="edit-due-date" type="date" style="flex:1;padding:8px;border:1px solid #e2e8f0;border-radius:6px;" />
        <input id="edit-due-time" type="time" style="flex:1;padding:8px;border:1px solid #e2e8f0;border-radius:6px;" />
      </div>
      <div id="edit-due-err" style="display:none;color:#DC2626;font-weight:600;font-size:12px;margin-top:4px;">Please select a valid due date.</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">
        <button id="cancel-due" class="btn">Cancel</button>
        <button id="save-due" class="btn primary">Save</button>
      </div>
    `;
    modal.appendChild(card);
    document.body.appendChild(modal);

    // Prefill current due
    const dateInput = card.querySelector('#edit-due-date');
    const timeInput = card.querySelector('#edit-due-time');
    const errLine = card.querySelector('#edit-due-err');

    const parseLocalIso = (isoLocal) => {
      const m = String(isoLocal).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
      if (!m) return null;
      const [_, y, mo, d, hh, mm] = m;
      return { date: `${y}-${mo}-${d}`, time: `${hh}:${mm}` };
    };

    let seed = null;
    if (assignment.due_at_local_iso) seed = parseLocalIso(assignment.due_at_local_iso);
    if (!seed && assignment.due_at) seed = parseLocalIso(String(assignment.due_at).replace(' ', 'T'));
    if (!seed) {
      const now = new Date();
      seed = { date: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`, time: `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}` };
    }
    dateInput.value = seed.date;
    timeInput.value = seed.time;

    card.querySelector('#cancel-due').addEventListener('click', () => document.body.removeChild(modal));
    card.querySelector('#save-due').addEventListener('click', async () => {
      try {
        const due = (dateInput.value || '').trim();
        const time = (timeInput.value || '').trim();
        if (!due) { errLine.style.display = 'block'; return; }
        const dueDateTime = `${due}T${time ? time : '23:59'}:59`;

        const resp = await fetch(`/api/uploads/assignment/${assignment.assignment_id}/due`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ due_at: dueDateTime })
        });
        if (!resp.ok) throw new Error(await resp.text());
        const data = await resp.json();
        // Update UI
        const dueDateEl = document.querySelector('.due-date');
        if (dueDateEl) {
          if (data.assignment?.due_at_local_iso) {
            dueDateEl.textContent = `Due: ${prettyFromIsoLocal(data.assignment.due_at_local_iso)}`;
          } else if (data.assignment?.due_at_pretty) {
            dueDateEl.textContent = `Due: ${data.assignment.due_at_pretty}`;
          }
        }
        showNotification('Due date updated', 'success');
        document.body.removeChild(modal);
      } catch (e) {
        console.error(e);
        showNotification('Failed to update due date', 'error');
      }
    });
  }


  // Load rubric data from backend
  async function loadRubricData() {
    try {
      if (!PROJECT_ID) {
        throw new Error('Project ID is not available');
      }

      // Get project's latest ID information
      const idsResponse = await fetch(`${API_BASE_URL}/uploads/project/${PROJECT_ID}/latest-ids`);
      if (!idsResponse.ok) {
        throw new Error('Failed to load project IDs');
      }

      const idsData = await idsResponse.json();
      if (!idsData.rubric) {
        throw new Error('No rubric found for this project');
      }

      // Use obtained rubric_id to get grading criteria details
      const rubricId = idsData.rubric.rubric_id;
      const response = await fetch(`${API_BASE_URL}/uploads/rubric/${rubricId}/details`);
      if (!response.ok) {
        throw new Error('Failed to load rubric data');
      }

      const data = await response.json();
      originalData = data; // Save original data
      criterionData = formatRubric(data);
      console.log('✅ original Criterion data:', data);

      // Initialize currentGrades and gradeData based on rubric data
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

    // Iterate through all grading criteria
    data.criteria.forEach((criterion, index) => {
      const criterionId = index + 1; // Use 1-based index as key
      const descriptions = {};

      // Sort grade levels by max_score from high to low (same as initializeGradeData)
      const sortedLevels = [...criterion.grade_levels].sort((a, b) => b.max_score - a.max_score);

      // Create descriptions with dynamic indices (0 = highest, 1 = second highest, etc.)
      sortedLevels.forEach((level, gradeIndex) => {
        // Split description text by line breaks into array, filter empty lines
        const criteriaList = level.description
          .split('\n')
          .map(item => item.trim())
          .filter(item => item.length > 0);

        // Build points string, format like: "0-4 points"
        const points = `${level.min_score}-${level.max_score} points`;

        descriptions[gradeIndex] = {
          points: points,
          criteria: criteriaList
        };
      });

      // Build data structure for each grading criterion
      formattedData[criterionId] = {
        title: criterion.title,
        maxScore: criterion.max_score,
        descriptions: descriptions
      };
    });

    return formattedData;
  }

  // Initialize gradeData and currentGrades based on rubric data
  function initializeGradeData(rubricData) {
    // Reset gradeData and currentGrades
    gradeData = {};
    currentGrades = {};

    // Iterate through each grading criterion
    rubricData.criteria.forEach((criterion, index) => {
      const criterionId = index + 1;

      // Initialize default grade for each grading criterion (select highest grade)
      if (criterion.grade_levels && criterion.grade_levels.length > 0) {
        // Sort grade levels by max_score from high to low
        const sortedLevels = [...criterion.grade_levels].sort((a, b) => b.max_score - a.max_score);
        
        // Build gradeData data structure with dynamic ordering
        gradeData[criterionId] = {};

        // Create grade mapping with dynamic indices (0 = highest, 1 = second highest, etc.)
        sortedLevels.forEach((level, gradeIndex) => {
          gradeData[criterionId][gradeIndex] = {
            name: level.level_name,
            color: getGradeColor(gradeIndex, criterion.grade_levels.length),
            score: `${level.min_score}-${level.max_score}`,
            min_score: level.min_score,
            max_score: level.max_score,
            description: level.description,
            original_seq_no: level.seq_no // Keep original seq_no for reference
          };
        });

        // Set default grade to highest (index 0)
        currentGrades[criterionId] = 0;
      }
    });
  }

  // Get corresponding color based on grade sequence number and total grade levels (supports 5 levels)
  function getGradeColor(seqNo, totalLevels) {
    // Color mapping for 5 levels (from high to low)
    const colorMappings = {
      5: [ // Case with 5 levels
        'var(--grade-high-distinction)', // Index 0 - Highest level
        'var(--grade-distinction)',      // Index 1 - Second highest
        'var(--grade-credit)',           // Index 2 - Third highest
        'var(--grade-pass)',             // Index 3 - Fourth highest
        'var(--grade-fail)'              // Index 4 - Lowest level
      ],
      4: [ // Case with 4 levels
        'var(--grade-high-distinction)', // Index 0 - Highest level
        'var(--grade-distinction)',      // Index 1 - Second highest
        'var(--grade-credit)',           // Index 2 - Third highest
        'var(--grade-pass)'              // Index 3 - Lowest level
      ],
      3: [ // Case with 3 levels
        'var(--grade-high-distinction)', // Index 0 - Highest level
        'var(--grade-distinction)',      // Index 1 - Second highest
        'var(--grade-pass)'              // Index 2 - Lowest level
      ],
      2: [ // Case with 2 levels
        'var(--grade-pass)',             // Index 0 - Higher level
        'var(--grade-fail)'              // Index 1 - Lower level
      ]
    };

    // Select appropriate color mapping based on total grade levels
    const colors = colorMappings[totalLevels] || colorMappings[4]; // Default to 4-level mapping

    // Use seqNo directly as color index (seqNo 0 = highest grade = first color)
    const colorIndex = seqNo;

    // Ensure color index is within valid range
    const safeIndex = Math.max(0, Math.min(colorIndex, colors.length - 1));
    return colors[safeIndex] || 'var(--grade-pass)';
  }

  // Backup default data loading function (updated for dynamic grade levels)
  function loadDefaultRubricData() {
    // Use default 5-level data with dynamic ordering (0 = highest, 4 = lowest)
    currentGrades = { 1: 0, 2: 0, 3: 0 }; // Default select highest level (index 0)
    gradeData = {
      1: {
        0: { name: 'High Distinction', color: 'var(--grade-high-distinction)', score: '9-10', min_score: 9, max_score: 10 },
        1: { name: 'Distinction', color: 'var(--grade-distinction)', score: '7-8', min_score: 7, max_score: 8 },
        2: { name: 'Credit', color: 'var(--grade-credit)', score: '5-6', min_score: 5, max_score: 6 },
        3: { name: 'Pass', color: 'var(--grade-pass)', score: '0-4', min_score: 0, max_score: 4 },
        4: { name: 'Fail', color: 'var(--grade-fail)', score: '0-0', min_score: 0, max_score: 0 }
      },
      2: {
        0: { name: 'High Distinction', color: 'var(--grade-high-distinction)', score: '9-10', min_score: 9, max_score: 10 },
        1: { name: 'Distinction', color: 'var(--grade-distinction)', score: '7-8', min_score: 7, max_score: 8 },
        2: { name: 'Credit', color: 'var(--grade-credit)', score: '5-6', min_score: 5, max_score: 6 },
        3: { name: 'Pass', color: 'var(--grade-pass)', score: '0-4', min_score: 0, max_score: 4 },
        4: { name: 'Fail', color: 'var(--grade-fail)', score: '0-0', min_score: 0, max_score: 0 }
      },
      3: {
        0: { name: 'High Distinction', color: 'var(--grade-high-distinction)', score: '9-10', min_score: 9, max_score: 10 },
        1: { name: 'Distinction', color: 'var(--grade-distinction)', score: '7-8', min_score: 7, max_score: 8 },
        2: { name: 'Credit', color: 'var(--grade-credit)', score: '5-6', min_score: 5, max_score: 6 },
        3: { name: 'Pass', color: 'var(--grade-pass)', score: '0-4', min_score: 0, max_score: 4 },
        4: { name: 'Fail', color: 'var(--grade-fail)', score: '0-0', min_score: 0, max_score: 0 }
      }
    };

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

    console.log('⚠️ Using default rubric data with dynamic grade levels');
  }

  // Dynamically generate grading criteria HTML
  function generateCriteriaHTML() {
    const container = $('.marking-criteria');
    if (!container) {
      console.error('Marking criteria container not found');
      return;
    }

    // Clear container
    container.innerHTML = '';

    // Get number of criteria
    const criterionIds = Object.keys(criterionData);
    const lastCriterionId = criterionIds[criterionIds.length - 1];

    // Dynamically generate each grading criterion
    criterionIds.forEach(criterionId => {
      const criterion = criterionData[criterionId];
      const currentGrade = currentGrades[criterionId] || 4;

      // ✅ Use saved scores or default values
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
              <input type="number" id="score-input-${criterionId}" class="score-input"
                     min="0" max="${criterion.maxScore}" value="${initialScore}" step="0.1"
                     ${window.savedScoresData?.finalized ? 'disabled' : ''}/>
              <span class="max-score">/ ${criterion.maxScore}</span>
            </div>
          </div>

          <div class="grade-info">
            <div class="grade-level">${gradeData[criterionId]?.[currentGrade]?.name || 'High Distinction'}</div>
            <div class="grade-score">${initialScore}/${criterion.maxScore}</div>
          </div>

          <div class="grade-description">
            <!-- Description content will be dynamically updated by updateCriterionDisplay -->
          </div>

          <div class="feedback-section">
            <button class="show-feedback-btn" ${window.savedScoresData?.finalized ? 'style="display: none;"' : ''}>+ Add Feedback</button>
            <div class="criterion-feedback ${window.savedScoresData?.feedback?.[criterionId] ? '' : 'hidden'}">
              <div class="feedback-header">
                <span>Criterion Feedback</span>
                ${!window.savedScoresData?.finalized ? '<button class="close-feedback">×</button>' : ''}
              </div>
              <textarea placeholder="Please write your feedback on this criterion."
                        ${window.savedScoresData?.finalized ? 'disabled' : ''}>${window.savedScoresData?.feedback?.[criterionId] || ''}</textarea>
            </div>
          </div>

          ${isLastCriterion ? `
            <!-- Only add action buttons to the last criterion -->
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

  // Update total score display
  function updateTotalScoreDisplay() {
    const totalScoreElement = document.querySelector('.total-score-display');
    if (totalScoreElement) {
      const totalScore = calculateWeightedTotalScore();
      totalScoreElement.textContent = totalScore === 0 ? '/100' : `${totalScore}/100`;
    }
  }
  // Calculate weighted total score (based on 100-point system)
  function calculateWeightedTotalScore() {
    const scores = getCurrentScores();
    let totalWeightedScore = 0;
    let totalMaxScore = 0;

    // Calculate weighted score for each criterion
    Object.keys(scores).forEach(criterionId => {
      const score = scores[criterionId];
      const criterion = criterionData[criterionId];

      if (criterion) {
        const maxScore = criterion.maxScore;
        // Calculate weighted score for this criterion in 100-point system
        const weightedScore = (score / maxScore) * (maxScore / 100) * 100;
        totalWeightedScore += weightedScore;
        totalMaxScore += maxScore;
      }
    });

    // If total is not 100, need to scale proportionally
    const scalingFactor = totalMaxScore > 0 ? 100 / totalMaxScore : 0;
    const finalScore = totalWeightedScore * scalingFactor;

    return Math.round(finalScore * 10) / 10; // Keep one decimal place
  }

  // Generate grade options HTML for single grading criterion
  function generateGradeOptions(criterionId, currentGrade) {
    const grades = gradeData[criterionId];
    if (!grades) {
      console.warn('No grade data for criterion:', criterionId);
      return '';
    }

    // Sort grades by index (0, 1, 2, 3, 4) - already sorted by score from high to low
    const sortedGrades = Object.keys(grades).sort((a, b) => parseInt(a) - parseInt(b));

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

  // Initialize PDF viewer
  async function setupPdfViewer() {
      try {
          // 1. Get assignment file information
          const filesResponse = await fetch(`${API_BASE_URL}/uploads/assignment/${ASSIGNMENT_ID}/files`);
          if (!filesResponse.ok) {
              throw new Error('Failed to fetch assignment files');
          }

          const filesData = await filesResponse.json();
          if (!filesData.files || filesData.files.length === 0) {
              throw new Error('No files found for this assignment');
          }

          // Get first file (assume it's PDF)
          const fileInfo = filesData.files[0];
          console.log('File info:', fileInfo);

          // 2. Get PDF file
          const pdfResponse = await fetch(`${API_BASE_URL}/uploads/${fileInfo.upload_id}/download`);
          if (!pdfResponse.ok) {
              throw new Error('Failed to download PDF file');
          }

          const pdfBlob = await pdfResponse.blob();
          const pdfUrl = URL.createObjectURL(pdfBlob);

          // 3. Use PDF.js to load PDF
          const loadingTask = pdfjsLib.getDocument(pdfUrl);
          pdfDoc = await loadingTask.promise;

          totalPdfPages = pdfDoc.numPages;
          currentPdfPage = 1;

          // 4. Render all pages to continuous canvas
          await renderAllPages();

          // 5. Update page information
          updatePagination();


          // 7. Set scroll listener
          setupScrollListener();

      } catch (error) {
          console.error('Error loading PDF:', error);
          showPdfError('Failed to load PDF: ' + error.message);
      }
  }

  // Render all pages to continuous canvas
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

              // Create page wrapper
              const pageWrapper = document.createElement('div');
              pageWrapper.className = 'pdf-page-wrapper';
              pageWrapper.style.cssText = `
                  position: relative;
                  margin: 0 auto 20px auto;
                  max-width: 100%;
                  display: flex;
                  justify-content: center;
              `;

              const canvas = document.createElement('canvas');
              canvas.className = 'pdf-page-canvas';

              // 设置canvas的实际尺寸（基于缩放后的viewport）
              canvas.height = viewport.height;
              canvas.width = viewport.width;

              // 计算显示尺寸，保持A4比例
              const maxWidth = 800;
              const displayWidth = Math.min(viewport.width, maxWidth);
              const displayHeight = (viewport.height * displayWidth) / viewport.width;

              // 设置CSS样式，确保按A4比例显示并应用缩放
              canvas.style.cssText = `
                  display: block;
                  width: ${displayWidth}px;
                  height: ${displayHeight}px;
                  max-width: 100%;
                  border: 1px solid #ddd;
                  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
              `;

              const renderContext = {
                  canvasContext: canvas.getContext('2d'),
                  viewport: viewport
              };

              await page.render(renderContext).promise;

              pageWrapper.appendChild(canvas);
              canvasContainer.appendChild(pageWrapper);

              // Use wrapper's height
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

  // Set scroll listener
  function setupScrollListener() {
      const pdfViewer = document.getElementById('pdf-viewer');

      pdfViewer.addEventListener('scroll', () => {
          updateCurrentPageFromScroll();
      });
  }

  // Update current page based on scroll position
  function updateCurrentPageFromScroll() {
      const pdfViewer = document.getElementById('pdf-viewer');
      const scrollTop = pdfViewer.scrollTop;
      const viewerHeight = pdfViewer.clientHeight;

      let accumulatedHeight = 0;
      let newCurrentPage = 1;

      // Get all page wrappers
      const pageWrappers = document.querySelectorAll('.pdf-page-wrapper');

      for (let i = 0; i < pageWrappers.length; i++) {
          const wrapper = pageWrappers[i];
          const wrapperHeight = wrapper.offsetHeight;
          accumulatedHeight += wrapperHeight;

          // If scroll position exceeds half of current page accumulated height, consider entering next page
          if (scrollTop + (viewerHeight / 2) < accumulatedHeight) {
              newCurrentPage = i + 1;
              break;
          }
      }

      // Update current page (if changed)
      if (newCurrentPage !== currentPdfPage) {
          currentPdfPage = newCurrentPage;
          updatePagination();
      }
  }

  // Scroll to specified page
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

  // Scroll down function for scroll button
  function scrollDown() {
      const pdfViewer = document.getElementById('pdf-viewer');
      const currentScroll = pdfViewer.scrollTop;
      const scrollAmount = 200; // Scroll by 200px each time
      
      pdfViewer.scrollTo({
          top: currentScroll + scrollAmount,
          behavior: 'smooth'
      });
  }

  // Render PDF page
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

  // Set PDF control functions
  function setupPdfControls() {
      // Page flip buttons
      document.getElementById('prev-page').addEventListener('click', prevPage);
      document.getElementById('next-page').addEventListener('click', nextPage);

      // Page number input
      document.getElementById('page-number').addEventListener('change', (e) => {
          const pageNum = parseInt(e.target.value);
          if (pageNum >= 1 && pageNum <= totalPdfPages) {
              goToPage(pageNum);
          }
      });

      // Zoom buttons
      document.getElementById('zoom-in').addEventListener('click', zoomIn);
      document.getElementById('zoom-out').addEventListener('click', zoomOut);

      // Download button
      document.querySelector('.download-btn').addEventListener('click', downloadPdf);

      // Scroll button
      const scrollBtn = document.getElementById('scroll-down-btn');
      if (scrollBtn) {
          scrollBtn.addEventListener('click', scrollDown);
      }

      // Keyboard navigation
      document.addEventListener('keydown', handleKeyboardNavigation);
  }

  // Page flip functions
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

  // Modify zoom function - re-render all pages
  async function updateZoom() {
      const zoomLevelEl = document.getElementById('zoom-level');
      if (zoomLevelEl) {
          zoomLevelEl.textContent = Math.round(currentScale * 100) + '%';
      }
      
      // Show loading state
      showPdfLoading(true);
      
      try {
          await renderAllPages();
          
          // Scroll back to current page after a short delay
          setTimeout(() => {
              scrollToPage(currentPdfPage);
              showPdfLoading(false);
          }, 200);
      } catch (error) {
          console.error('Error updating zoom:', error);
          showPdfLoading(false);
      }
  }

  // Zoom functions
  async function zoomIn() {
      if (currentScale < MAX_SCALE) {
          const newScale = Math.min(MAX_SCALE, currentScale + SCALE_STEP);
          currentScale = Math.round(newScale * 10) / 10; // Round to 1 decimal place
          await updateZoom();
      }
  }

  async function zoomOut() {
      if (currentScale > MIN_SCALE) {
          const newScale = Math.max(MIN_SCALE, currentScale - SCALE_STEP);
          currentScale = Math.round(newScale * 10) / 10; // Round to 1 decimal place
          await updateZoom();
      }
  }

  // Download function
  async function downloadPdf() {
      try {
          // Get file information
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

          // Create temporary link for download
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

  // Update page information
  function updatePagination() {
      document.getElementById('current-page').textContent = currentPdfPage;
      document.getElementById('total-pages').textContent = totalPdfPages;
      document.getElementById('page-number').value = currentPdfPage;

      // Update button status
      document.getElementById('prev-page').disabled = currentPdfPage <= 1;
      document.getElementById('next-page').disabled = currentPdfPage >= totalPdfPages;
  }


  // Keyboard navigation
  function handleKeyboardNavigation(e) {
      // Ensure focus is not in input fields
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
          case '0':
              e.preventDefault();
              // Reset zoom to 100%
              currentScale = 1.0;
              updateZoom();
              break;
          case 'Home':
              e.preventDefault();
              goToPage(1);
              break;
          case 'End':
              e.preventDefault();
              goToPage(totalPdfPages);
              break;
          case ' ':
              e.preventDefault();
              scrollDown();
              break;
      }
  }
  // Show/hide loading state
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

  // Show error message
  function showPdfError(message) {
      const errorEl = document.getElementById('pdf-error');
      errorEl.textContent = message;
      errorEl.style.display = 'block';
      showPdfLoading(false);
  }


  //=====================================pdf end=====================================

  // Grade selection
  function setupGradeSelection() {
    // 如果是 finalized 状态，不设置等级选择事件
    if (window.savedScoresData?.finalized) {
      return;
    }
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

      // Arrow navigation (adjusted for dynamic grade levels)
      leftArrow?.addEventListener('click', () => {
        const currentGrade = currentGrades[criterionId];
        const newGrade = Math.max(0, currentGrade - 1); // Move to higher grade (lower index)
        selectGrade(criterionId, newGrade);
      });

      rightArrow?.addEventListener('click', () => {
        const currentGrade = currentGrades[criterionId];
        const grades = gradeData[criterionId];
        if (grades) {
          const maxGradeIndex = Math.max(...Object.keys(grades).map(g => parseInt(g)));
          const newGrade = Math.min(maxGradeIndex, currentGrade + 1); // Move to lower grade (higher index)
          selectGrade(criterionId, newGrade);
        }
      });
    });
  }

  function selectGrade(criterionId, grade) {
    currentGrades[criterionId] = grade;
    updateCriterionDisplay(criterionId);
    updateTotalScoreDisplay();
  }

  // Update single grading criterion display
  function updateCriterionDisplay(criterionId) {
    const criterion = $(`.criterion[data-criterion="${criterionId}"]`);
    if (!criterion) return;

    const grade = currentGrades[criterionId];
    const gradeInfo = gradeData[criterionId][grade];
    // console.log('gradeData:', gradeData);
    // console.log('criterionId:', criterionId);
    // console.log('grade:', grade);
    // console.log('gradeInfo:', gradeInfo);

    // ✅ Add safety check
    const criterionInfo = criterionData[criterionId];
    if (!criterionInfo) {
      console.warn(`Criterion data not found for ID: ${criterionId}`);
      return;
    }

    const description = criterionInfo.descriptions[grade];

    // ✅ Add safety check for description
    if (!description) {
      console.warn(`Description not found for criterion ${criterionId}, grade ${grade}`);
      return;
    }

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
      const currentScore = parseFloat(scoreInput.value) || 0;
      gradeScore.textContent = `${currentScore.toFixed(1)}/${maxScore}`;
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

  // Update all grading criteria displays
  function updateAllCriterionDisplays() {
    Object.keys(currentGrades).forEach(criterionId => {
      updateCriterionDisplay(parseInt(criterionId));
    });
  }

  // Automatically select corresponding grade when manually inputting score
  function setupScoreInputs() {
     // 如果是 finalized 状态，不设置分数输入事件
     if (window.savedScoresData?.finalized) {
       return;
     }
    const scoreInputs = $$('.score-input');

    scoreInputs.forEach(input => {
      input.addEventListener('input', () => {
        const criterionId = parseInt(input.id.split('-')[2]);
        const maxScore = parseFloat(input.max);
        let score = parseFloat(input.value) || 0;

        // Add score validation
        let scoreAdjusted = false;
        if (score > maxScore) {
          score = maxScore;
          input.value = maxScore;
          scoreAdjusted = true;

          // Show notification
          showNotification(`Score cannot exceed maximum ${maxScore} points`, 'warning');
        }

        // Pass criterionId parameter
        const grade = calculateGradeFromScore(score, maxScore, criterionId);
        selectGrade(criterionId, grade);
        updateTotalScoreDisplay();

        // If score was adjusted, force update current criterion display
        if (scoreAdjusted) {
          updateCriterionDisplay(criterionId);
        }
      });

      // Add blur event for final validation
      input.addEventListener('blur', () => {
        const criterionId = parseInt(input.id.split('-')[2]);
        const maxScore = parseFloat(input.max);
        let score = parseFloat(input.value) || 0;

        if (score > maxScore) {
          score = maxScore;
          input.value = maxScore;
          showNotification(`Score adjusted to maximum ${maxScore} points`, 'info');
          updateCriterionDisplay(criterionId); // Force update display
        }
      });
    });
  }

  // Calculate corresponding grade based on score (dynamic grade levels)
  function calculateGradeFromScore(score, maxScore, criterionId) {
    const grades = gradeData[criterionId];
    if (!grades) {
      console.warn('Grade data not found for criterion:', criterionId);
      return 0; // Default return highest grade (index 0)
    }

    // Sort grades by index (0, 1, 2, 3, 4) - already sorted by score from high to low
    const sortedGrades = Object.keys(grades)
      .map(grade => parseInt(grade))
      .sort((a, b) => a - b);

    // Iterate through grades to find corresponding grade for score
    for (const grade of sortedGrades) {
      const gradeInfo = grades[grade];
      if (gradeInfo && gradeInfo.min_score !== undefined && gradeInfo.max_score !== undefined) {
        if (score >= gradeInfo.min_score && score <= gradeInfo.max_score) {
          return grade;
        }
      }
    }

    // If score is out of range, return closest grade
    if (score < (grades[sortedGrades[sortedGrades.length - 1]]?.min_score || 0)) {
      return sortedGrades[sortedGrades.length - 1]; // Return lowest grade
    }
    return sortedGrades[0]; // Return highest grade
  }


  // Feedback functionality
  function setupFeedback() {
    // 如果是 finalized 状态，不设置反馈事件
    if (window.savedScoresData?.finalized) {
        return;
    }
    const showFeedbackBtns = $$('.show-feedback-btn');
    const closeButtons = $$('.close-feedback');

    // Show feedback buttons - if saved feedback exists, auto expand
    showFeedbackBtns.forEach(button => {
      const criterion = button.closest('.criterion');
      const criterionId = parseInt(criterion.dataset.criterion);

      // If saved feedback exists, auto expand
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

    // If already submitted, return directly without setting event listeners
    if (window.savedScoresData?.finalized) {
      return;
    }

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
          // 提交后锁定所有输入框
          lockAllInputs();
          // 提交后禁用按钮
          disableActionButtons();
        } catch (error) {
          console.error('Error submitting marks:', error);
          showNotification('Failed to submit marks', 'error');
        }
      }
    });
  }

  // Disable action buttons
  function disableActionButtons() {
    const saveBtn = $('#saveBtn');
    const submitBtn = $('#submitBtn');
    const actionButtons = $('.action-buttons');

    if (saveBtn) saveBtn.disabled = true;
    if (submitBtn) submitBtn.disabled = true;

    // Or replace with submitted message
    if (actionButtons) {
      actionButtons.innerHTML = `
        <div class="total-score-display">/100</div>
        <div class="finalized-message">Marks have been submitted.</div>
      `;
      updateTotalScoreDisplay();
    }
  }

  // 锁定所有输入框（save后调用）
  function lockAllInputs() {
    // 锁定所有分数输入框
    const scoreInputs = $$('.score-input');
    scoreInputs.forEach(input => {
      input.disabled = true;
      input.style.backgroundColor = '#f5f5f5';
      input.style.color = '#999';
    });

    // 锁定所有反馈文本框
    const feedbackTextareas = $$('.criterion-feedback textarea');
    feedbackTextareas.forEach(textarea => {
      textarea.disabled = true;
      textarea.style.backgroundColor = '#f5f5f5';
      textarea.style.color = '#999';
    });

    // 锁定所有等级选择按钮
    const gradeButtons = $$('.grade-btn');
    gradeButtons.forEach(button => {
      button.disabled = true;
      button.style.backgroundColor = '#f5f5f5';
      button.style.color = '#999';
      button.style.cursor = 'not-allowed';
    });

    // 添加锁定状态的视觉指示
    const markingCriteria = $('.marking-criteria');
    if (markingCriteria) {
      markingCriteria.classList.add('locked');
    }
  }


  //===========================Save scores to backend===========================

  // Get current user information
  function getCurrentUser() {
    try {
      const rawUser = localStorage.getItem("user");
      if (rawUser) {
        const user = JSON.parse(rawUser);

        // First log to check user data structure
        console.log("User Info:", user);
        console.log("Available fields:", Object.keys(user));

        // Adjust field names based on log results
        // Common field names might be: id, userId, user_id, role, userRole, etc.
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

  // Save marks to backend - select different interfaces based on user role
  async function saveMarks() {
    if (window.savedScoresData?.finalized) {
      showNotification('Marks for this assignment have been submitted and cannot be resubmitted', 'error');
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
      // COORDINATOR uses baseline interface
      url = `${API_BASE_URL}/uploads/scoring/baseline/batch`;
      requestBody = {
        assignment_id: ASSIGNMENT_ID,
        scores: transformScoresForBackend(marksData.scores, marksData.feedback)
      };
    } else if (currentUser.role === 'MARKER') {
      // MARKER uses marker interface
      url = `${API_BASE_URL}/uploads/scoring/marker/batch`;
      requestBody = {
        assignment_id: ASSIGNMENT_ID,
        marker_id: currentUser.userId, // Add marker_id
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

  // Submit marks to backend - save first then confirm
  async function submitMarks() {
    if (window.savedScoresData?.finalized) {
      showNotification('Marks for this assignment have been submitted and cannot be resubmitted', 'error');
      return;
    }
    const currentUser = getCurrentUser();

    // Step 1: First save scores in batch
    const saveResult = await saveMarks();

    // Step 2: Confirm scores - now use batch confirmation
    let submitUrl;
    let submitBody;

    // Get all criterion_ids that need confirmation (from originalData)
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

  // Helper function: convert frontend score format to backend required format
  function transformScoresForBackend(scores, feedback) {
    if (!originalData || !originalData.criteria) {
      throw new Error('Rubric data not loaded yet');
    }

    return originalData.criteria.map(criterion => {
      // Use criterion.seq_no as frontend storage key (since frontend might store by order)
      // Or if you use other keys in frontend, adjust accordingly
      const frontendKey = criterion.seq_no.toString(); // Or criterion.criterion_id.toString()

      return {
        criterion_id: criterion.criterion_id, // Use real ID returned by backend
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

  // ==================End save scores to backend=================

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
    // Create modal background
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

    // Create dialog
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: #fff;
      border-radius: 8px;
      padding: 0;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
      border: 1px solid #E6EAF2;
      max-width: 400px;
      width: 90%;
      overflow: hidden;
    `;

    // Create title bar
    const titleBar = document.createElement('div');
    titleBar.style.cssText = `
      background: #F5F7FB;
      padding: 16px 20px;
      border-bottom: 1px solid #E6EAF2;
    `;
    titleBar.innerHTML = '<span style="color: #0F172A; font-weight: 600; font-size: 16px;">Confirm Action</span>';

    // Create content area
    const content = document.createElement('div');
    content.style.cssText = `
      padding: 20px;
      color: #0F172A;
      font-size: 14px;
      line-height: 1.5;
    `;
    content.innerHTML = 'Are you sure you want to go back?<br>Your progress will not be saved.';

    // Create button area
    const buttonArea = document.createElement('div');
    buttonArea.style.cssText = `
      padding: 16px 20px;
      background: #F5F7FB;
      border-top: 1px solid #E6EAF2;
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    `;

    // Create Cancel button
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      background: #fff;
      color: #0F172A;
      border: 1px solid #E6EAF2;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      transition: all 0.2s;
    `;
    cancelBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
    });

    // 添加Cancel按钮hover效果
    cancelBtn.addEventListener('mouseenter', () => {
      cancelBtn.style.background = '#F5F7FB';
      cancelBtn.style.borderColor = '#0F172A';
    });
    cancelBtn.addEventListener('mouseleave', () => {
      cancelBtn.style.background = '#fff';
      cancelBtn.style.borderColor = '#E6EAF2';
    });

    // 创建OK按钮
    const okBtn = document.createElement('button');
    okBtn.textContent = 'OK';
    okBtn.style.cssText = `
      background: #0F172A;
      color: #fff;
      border: 1px solid #0F172A;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      transition: all 0.2s;
    `;
    okBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
        window.history.back();
    });

    // 添加OK按钮hover效果
    okBtn.addEventListener('mouseenter', () => {
      okBtn.style.background = '#1a202c';
    });
    okBtn.addEventListener('mouseleave', () => {
      okBtn.style.background = '#0F172A';
    });

    // Assemble dialog
    buttonArea.appendChild(cancelBtn);
    buttonArea.appendChild(okBtn);
    dialog.appendChild(titleBar);
    dialog.appendChild(content);
    dialog.appendChild(buttonArea);
    modal.appendChild(dialog);

    // Add to page
    document.body.appendChild(modal);

    // Click background to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });

    // ESC key to close
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

    // 初始化dropdown和logout功能
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