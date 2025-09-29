// Past Task – Marker Portal
(function () {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  // 显示用户名
  function displayUsername() {
    try {
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
    } catch (err) {
      console.error("Failed to load username:", err);
    }
  }

  // 初始化
  function init() {
    console.log('🚀 Marker Past Task 初始化...');
    displayUsername();
    
    // 这里可以添加获取past task数据的逻辑
    // 目前显示空状态
    const container = $('#paContainer');
    if (container) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #6B7280;">
          <p>No past tasks available.</p>
        </div>
      `;
    }
  }

  // 页面加载完成后初始化
  document.addEventListener('DOMContentLoaded', init);

})();
