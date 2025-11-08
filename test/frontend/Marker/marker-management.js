// 激活 sidebar
document.querySelectorAll('.nav-item').forEach(b=>{
  b.addEventListener('click',()=>{
    document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    
    // 根据data-view属性进行页面导航
    const view = b.dataset.view;
    switch(view) {
      case 'overview':
        window.location.href = 'marker-dashboard.html';
        break;
      case 'mark':
      case 'marker-management':
        // 当前页面，不需要跳转
        break;
      case 'report':
        // 这里可以链接到feedback页面或报告页面
        alert('Report/Feedback page - to be implemented');
        break;
      case 'past':
        // 这里可以链接到历史作业页面
        alert('Past Assignment page - to be implemented');
        break;
      default:
        console.log('Unknown view:', view);
    }
  });
});

// 按钮功能
document.addEventListener('DOMContentLoaded', function() {
  // 为所有按钮添加点击事件
  document.querySelectorAll('.btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const buttonText = e.target.textContent.trim();
      
      switch(buttonText) {
        case 'Mark Assignment':
          // 链接到marking页面，添加加载状态
          InteractionUtils.showLoading(e.target, 'Opening Assignment...');
          setTimeout(() => {
            window.location.href = 'mark-assignment.html';
          }, 500);
          break;
        case 'View Rubric':
          // 链接到rubric页面，传递assignment ID参数
          InteractionUtils.showLoading(e.target, 'Loading Rubric...');
          setTimeout(() => {
            const assignmentId = generateAssignmentId(e.target.closest('.inner-card').querySelector('.task-title').textContent);
            window.location.href = `rubric.html?assignment=${encodeURIComponent(assignmentId)}`;
          }, 500);
          break;
        case 'View Analysis':
          // 链接到analysis页面
          InteractionUtils.showLoading(e.target, 'Opening Analysis...');
          setTimeout(() => {
            window.location.href = 'feedback.html';
          }, 500);
          break;
        case 'View Feedback':
          // 链接到view-feedback页面
          InteractionUtils.showLoading(e.target, 'Opening Feedback...');
          setTimeout(() => {
            const assignmentId = generateAssignmentId(e.target.closest('.inner-card').querySelector('.task-title').textContent);
            window.location.href = `view-feedback.html?task=${encodeURIComponent(assignmentId)}`;
          }, 500);
          break;
        default:
          console.log('Button clicked:', buttonText);
      }
    });
  });
});

// 生成Assignment ID的函数
function generateAssignmentId(title) {
  // 从标题中提取信息生成assignment ID
  // 例如: "2025 · Semester 1 · Assignment 1" -> "assignment_1_2025_sem1"
  const match = title.match(/(\d{4})\s*·\s*Semester\s*(\d+)\s*·\s*Assignment\s*(\d+)/);
  if (match) {
    const [, year, semester, assignment] = match;
    return `assignment_${assignment}_${year}_sem${semester}`;
  }
  // 如果格式不匹配，使用默认ID
  return 'demo';
}
