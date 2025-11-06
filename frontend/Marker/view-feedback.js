// view-feedback.js — Display Marker's score comparison and feedback

/* ===== Global Variables ===== */
let currentProjectId = null; // Store current project ID
let currentAssignmentInfo = null; // Store current assignment information
let currentRubricData = null; // Store detailed rubric data

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('backBtn')?.addEventListener('click', () => history.back());
    init();
});

  // Initialize the interface
  async function init() {
    // ✅ Display username
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

    // Get and display feedback data
    const feedbackData = await fetchFeedbackData();
//    const feedbackData = demoFeedback(); // Use demo data for testing
    console.log('Feedback Data:', feedbackData);

    loadFeedback(feedbackData);
  }

// Main function: Get feedback data
async function fetchFeedbackData() {
    try {
        // Get URL parameters and user information
        const queryParams = getQueryParams();
        const currentUser = getCurrentUser();

        // Check if required parameters exist
        if (!queryParams.assignmentId) {
            throw new Error('Assignment ID not found in URL parameters');
        }

        if (!currentUser || !currentUser.userId) {
            throw new Error('User information not available');
        }

        const assignmentId = queryParams.assignmentId;
        const markerId = currentUser.userId;

        console.log('Fetching feedback for:', { assignmentId, markerId });

        // Fetch all required data in parallel
        const [assignmentData, baselineData, markerData, feedbackData] = await Promise.all([
            fetchAssignmentData(assignmentId),
            fetchBaselineData(assignmentId),
            fetchMarkerData(assignmentId, markerId),
            fetchFeedbackContent(assignmentId, markerId)
        ]);

        // Get project information
        const projectData = await fetchProjectData(assignmentData.project_id);
        console.log('projectData:', projectData);
        const projectInfo = projectData.project || {};
        // Get rubric information
        const rubricData = await fetchRubricDetails(projectData.rubric.rubric_id);
        console.log('rubricData:', rubricData);


        // Transform data format to what the frontend needs
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
        // Use demo data as fallback when API fails
        return demoFeedback();
    }
}

// Get rubric details
async function fetchRubricDetails(rubricId) {
    const res = await fetch(`/api/uploads/rubric/${rubricId}/details`);
    if (!res.ok) throw new Error('Failed to fetch rubric details');
    const data = await res.json();
    
    // Save complete rubric data
    currentRubricData = data;
    console.log("✅ Full rubric data loaded:", currentRubricData);
    
    return data.criteria || [];
}

// Get assignment information
async function fetchAssignmentData(assignmentId) {
    const res = await fetch(`/api/uploads/assignment/${assignmentId}/status`);
    if (!res.ok) throw new Error('Failed to fetch assignment data');
    const data = await res.json();
    return data.assignment;
}

// Get project information
async function fetchProjectData(projectId) {
    const res = await fetch(`/api/uploads/project/${projectId}/status`);
    if (!res.ok) throw new Error('Failed to fetch project data');
    const data = await res.json();
    
    // Save project ID and assignment information
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

// Get baseline scores
async function fetchBaselineData(assignmentId) {
    const res = await fetch(`/api/uploads/scoring/baseline/${assignmentId}`);
    if (!res.ok) throw new Error('Failed to fetch baseline data');
    const data = await res.json();
    // Only return baseline scores where finalized is true
    return (data.baseline_scores || []).filter(score => score.finalized === true);
}

// Get marker scores
async function fetchMarkerData(assignmentId, markerId) {
    const res = await fetch(`/api/uploads/scoring/marker/${assignmentId}/${markerId}`);
    if (!res.ok) throw new Error('Failed to fetch marker data');
    const data = await res.json();
    return data.marker_scores || [];
}


// Get feedback content
async function fetchFeedbackContent(assignmentId, markerId) {
    try {
        const res = await fetch(`/api/feedback/${assignmentId}/${markerId}`);
        if (!res.ok) {
            // If API returns 404 or other error, return empty array
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

// Data transformation function
function transformData(assignmentData, projectData, baselineData, markerData, feedbackData, rubricData) {
  const projectName = projectData?.name || 'Unknown Project';
  const assignmentDisplayName = `${projectName} - Moderation ${assignmentData.round || 0}`;

  // Build each criterion based on rubricData (more robust)
  const criteria = (rubricData || []).map((r, index) => {
    const baseline = (baselineData || []).find(b => b.criterion_id === r.criterion_id);
    const marker = (markerData || []).find(m => m.criterion_id === r.criterion_id);

    return {
      criterion_id: r.criterion_id,
      title: baseline?.criterion_title || r.title || `Criterion ${index + 1}`,
      subtitle: r.description || '',
      max: r.max_score || baseline?.criterion_max_score || 0,
      // Use null to indicate missing (for subsequent judgment), otherwise it's a number
      markerScore: typeof marker?.score === 'number' ? marker.score : null,
      // Only show coordinator score when baseline exists and is finalized
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



// Get query parameters from URL (assignment_id, project)
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

  // Top meta information
  metaEl.innerHTML = `
    <div style="font-size: 16px; font-weight: 500; color: var(--text); margin-bottom: 2px;">
      ${data.assignment}
    </div>
    <div style="font-size: 14px; color: var(--muted); font-weight: 400;">
      Due: ${data.due} • Feedback Date: ${data.feedbackDate}
    </div>
  `;

  // --- Calculate total score (only add actual numbers to the sum) ---
  const markerTotal = data.criteria.reduce((sum, c) => sum + (typeof c.markerScore === 'number' ? c.markerScore : 0), 0);
  const coordinatorTotal = data.criteria.reduce((sum, c) => sum + (typeof c.coordinatorScore === 'number' ? c.coordinatorScore : 0), 0);
  const totalMax = data.criteria.reduce((sum, c) => sum + (c.max || 0), 0);

  // Check if at least one finalized baseline exists
  const hasAnyBaseline = data.criteria.some(c => c.coordinatorScore !== null);

  // Update top total score display
  markerScoreEl.textContent = `${markerTotal.toFixed(1)}/${totalMax.toFixed(1)}`;
  coordinatorScoreEl.textContent = hasAnyBaseline ? `${coordinatorTotal.toFixed(1)}/${totalMax.toFixed(1)}` : "-";

  // Update overall score difference display (only calculate difference when baseline exists)
  if (hasAnyBaseline) {
    const difference = markerTotal - coordinatorTotal;
    const absDifference = Math.abs(difference);
    const deviationPercent = totalMax > 0 ? (absDifference / totalMax) * 100 : 0;
    
    scoreDifferenceEl.textContent = difference > 0 ? `+${difference.toFixed(1)}` : `${difference.toFixed(1)}`;
    
    // Set color based on deviation percentage: >5% red, >2.5% yellow, <=2.5% green
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

  // --- Render table rows ---
  tbody.innerHTML = '';
  data.criteria.forEach((c, idx) => {
    const tr = document.createElement('tr');

    // Left side criteria description
    const td0 = td();
    td0.innerHTML = `
      <div class="criterion-title">${idx+1}. ${esc(c.title)}</div>
      ${c.subtitle ? `<div class="criterion-subtitle">${esc(c.subtitle)}</div>` : ''}
      ${c.note ? `<div class="criterion-note">${esc(c.note)}</div>` : ''}
    `;
    tr.appendChild(td0);

    // Marker score display (show "-/max" if missing)
    const td1 = td();
    td1.className = 'score-cell score-marker';
    const markerDisplay = (typeof c.markerScore === 'number') ? `${c.markerScore.toFixed(1)}/${(c.max || 0).toFixed(1)}` : `-/${(c.max || 0).toFixed(1)}`;
    td1.textContent = markerDisplay;
    tr.appendChild(td1);

    // Coordinator (baseline) score display (show "-/max" if missing)
    const td2 = td();
    td2.className = 'score-cell score-coordinator';
    const coordinatorDisplay = (typeof c.coordinatorScore === 'number') ? `${c.coordinatorScore.toFixed(1)}/${(c.max || 0).toFixed(1)}` : `-/${(c.max || 0).toFixed(1)}`;
    td2.textContent = coordinatorDisplay;
    tr.appendChild(td2);

    // Difference column: only calculate difference when coordinator exists, otherwise show "-"
    const td3 = td();
    td3.className = 'difference-cell';
    if (typeof c.coordinatorScore !== 'number') {
      td3.innerHTML = `<span>-</span>`;
    } else {
      const markerValForDiff = (typeof c.markerScore === 'number') ? c.markerScore : 0;
      const diff = markerValForDiff - c.coordinatorScore;
      const diffText = diff > 0 ? `+${diff.toFixed(1)}` : `${diff.toFixed(1)}`;
      
      // Calculate deviation percentage for this criterion
      const absDiff = Math.abs(diff);
      const criterionDeviationPercent = c.max > 0 ? (absDiff / c.max) * 100 : 0;
      
      // Single criterion: >5% red, otherwise set color based on difference size
      let colorClass = '';
      if (criterionDeviationPercent > 5) {
        colorClass = 'danger';
      } else if (criterionDeviationPercent > 0) {
        // Has difference but not exceeding 5%, set to yellow or green based on difference size
        if (criterionDeviationPercent > 2.5) {
          colorClass = 'warning';
        } else {
          colorClass = 'good';
        }
      } else {
        // No difference
        colorClass = 'good';
      }
      
      td3.innerHTML = `<span class="${colorClass}">${diffText}</span>`;
    }
    tr.appendChild(td3);

    // Feedback column (keep as is)
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

  // Update text feedback area (keep original logic)
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
// Date formatting helper function
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

/* ===== Demo data (used when API is not available) ===== */
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

// Initialize dropdown and logout functionality
document.addEventListener('DOMContentLoaded', () => {
  // Initialize dropdown
  const accountEl = document.querySelector('.account');
  const dropdown = document.querySelector('.dropdown-menu');
  const allDropdownItems = document.querySelectorAll('.dropdown-item');
  const logoutBtn = allDropdownItems.length > 1 ? allDropdownItems[1] : null;

  if (accountEl && dropdown) {
    accountEl.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('show');
    });

    // Click elsewhere to close dropdown menu
    document.addEventListener('click', () => {
      dropdown.classList.remove('show');
    });
  }

  // Logout functionality
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

  // Global logout function
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

/* ===== Excel generation and download functionality ===== */
function generateExcelFromRubric(rubricData) {
  // Create new workbook
  const wb = XLSX.utils.book_new();
  
  // Prepare data
  const worksheetData = [];
  
  // Add header row - Max Score column moved to the end
  const headers = ['Criterion', 'Description'];
  
  // Get all grade levels
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
  
  // Sort by seq_no
  allGradeLevels.sort((a, b) => a.seq_no - b.seq_no);
  
  // Add grade level column headers
  allGradeLevels.forEach(level => {
    headers.push(`${level.level_name} (${level.min_score}-${level.max_score})`);
  });
  
  // Add Criteria Score column header (at the end)
  headers.push('Criteria Score');
  
  worksheetData.push(headers);
  
  // Add data for each criterion
  rubricData.criteria.forEach(criterion => {
    const row = [
      criterion.title,
      criterion.description || ''
    ];
    
    // Add description for each grade level
    allGradeLevels.forEach(level => {
      const gradeLevel = criterion.grade_levels.find(gl => gl.level_name === level.level_name);
      row.push(gradeLevel ? gradeLevel.description : '');
    });
    
    // Add Criteria Score (at the end, with "/" prefix)
    row.push(`/${criterion.max_score}`);
    
    worksheetData.push(row);
  });
  
  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet(worksheetData);
  
  // Set column widths
  const colWidths = [
    { wch: 20 }, // Criterion
    { wch: 30 }, // Description
  ];
  
  // Set width for grade level columns
  allGradeLevels.forEach(() => {
    colWidths.push({ wch: 25 });
  });
  
  // Set width for Criteria Score column
  colWidths.push({ wch: 15 }); // Criteria Score
  
  ws['!cols'] = colWidths;
  
  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Rubric');
  
  // Generate Excel file
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  
  return excelBuffer;
}

/* ===== Download Excel file ===== */
function downloadExcelFile(excelBuffer, filename) {
  const blob = new Blob([excelBuffer], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
  });
  
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

/* ===== Download functionality event handlers ===== */
document.addEventListener('DOMContentLoaded', () => {
  // Download Rubric button
  document.getElementById('downloadRubric')?.addEventListener('click', () => {
    if (!currentRubricData) {
      alert('Rubric data not found. Please ensure the rubric has been uploaded and processed.');
      return;
    }
    
    try {
      // Generate Excel file
      const excelBuffer = generateExcelFromRubric(currentRubricData);
      
      // Generate filename
      const filename = `rubric_${new Date().toISOString().slice(0, 10)}.xlsx`;
      
      // Download Excel file
      downloadExcelFile(excelBuffer, filename);
      
      console.log("✅ Rubric Excel file generated and downloaded");
    } catch (error) {
      console.error("❌ Failed to generate rubric Excel:", error);
      alert('Failed to generate rubric Excel file. Please try again.');
    }
  });

  // Download Assignment button
  document.getElementById('downloadAssignment')?.addEventListener('click', () => {
    if (!currentAssignmentInfo) {
      alert('Assignment file not found. Please ensure the assignment has been uploaded.');
      return;
    }
    
    // Create download link
    const link = document.createElement('a');
    link.href = currentAssignmentInfo.download_url;
    link.download = currentAssignmentInfo.file_name;
    link.click();
  });
});

// Global goToResetPassword function
window.goToResetPassword = function() {
  window.location.href = '/reset-password';
};
