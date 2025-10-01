// rubric.js — 拉取后端数据并渲染到表格
document.addEventListener('DOMContentLoaded', () => {
    // ✅ 显示用户名
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
    
    // 初始化dropdown
    const usernameEl = document.getElementById('username');
    const dropdown = document.querySelector('.dropdown-menu');
    const logoutBtn = document.querySelector('.dropdown-item');

    if (usernameEl && dropdown) {
      usernameEl.addEventListener('click', (e) => {
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
    
    document.getElementById('backBtn')?.addEventListener('click', () => history.back());
    loadRubric();
  });
  
    async function loadRubric(){
      const url = new URL(location.href);
      const projectId = url.searchParams.get('project') || 'demo';

      const metaEl = document.getElementById('rubric-meta');
      const tbody = document.getElementById('rubric-body');

      // 显示加载状态
      metaEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; color: var(--muted);">
          <div class="loading"></div>
          <span>Loading rubric data for project ${projectId}...</span>
        </div>
      `;
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px; color: var(--muted);">Loading rubric criteria...</td></tr>';

      let rubricId;
      let data;

      try {
        // 第一步：通过project_id获取最新的rubric_id
        console.log('🌐 获取最新rubric_id...');
        const rubricRes = await fetch(`/api/uploads/project/${encodeURIComponent(projectId)}/latest-rubric`);

        if (!rubricRes.ok) {
          console.log('rubric_id获取错误:', rubricId);
          const errorText = await rubricRes.text();
          throw new Error(`Failed to get rubric ID: ${rubricRes.status} - ${errorText}`);
        }

        const rubricInfo = await rubricRes.json();
        rubricId = rubricInfo.rubric_id;
        console.log('✅ 获取到rubric_id:', rubricId);

        // 第二步：通过rubric_id获取详细的rubric数据
        console.log('🌐 获取rubric详情...');
        const detailRes = await fetch(`/api/uploads/rubric/${encodeURIComponent(rubricId)}/details`);

        if (!detailRes.ok) {
          const errorText = await detailRes.text();
          throw new Error(`Failed to get rubric details: ${detailRes.status} - ${errorText}`);
        }

        data = await detailRes.json();
        console.log('✅ 获取到rubric详情数据:', data);

        // 使用后端返回的数据更新UI
        updateRubricUI(data, metaEl, tbody);

      } catch (error) {
        console.error('❌ 加载rubric错误:', error);

        // 显示错误信息
        metaEl.innerHTML = `
          <div style="color: #dc3545; margin-bottom: 8px;">
            Failed to load rubric data
          </div>
          <div style="font-size: 12px; color: var(--muted);">
            Error: ${esc(error.message)}
          </div>
        `;

        tbody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; padding: 20px; color: #dc3545;">
              Error loading data. Please check the console for details.
            </td>
          </tr>
        `;

        // 使用demo数据作为fallback
        try {
          data = demoRubric();
          updateRubricUI(data, metaEl, tbody);
          console.log('🔄 使用demo数据作为fallback');
        } catch (demoError) {
          console.error('❌ 连demo数据也失败了:', demoError);
        }
      }
    }

    function updateRubricUI(data, metaEl, tbody) {
      // 更新meta信息 - 使用后端返回的数据结构
      metaEl.innerHTML = `
        <div style="font-size: 16px; font-weight: 500; color: var(--text); margin-bottom: 2px;">
          Rubric ID: ${data.rubric.rubric_id} · ${data.rubric.rows} Rows · ${data.rubric.columns} Columns
        </div>
        <div style="font-size: 14px; color: var(--muted); font-weight: 400;">
          Version: ${data.rubric.version} · Created: ${new Date(data.rubric.created_at).toLocaleDateString()} ·
          ${data.summary.criteria_count} Criteria, ${data.summary.grade_levels_count} Grade Levels
        </div>
      `;

      // 渲染表格
      tbody.innerHTML = '';

      if (!data.criteria || data.criteria.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; padding: 20px; color: var(--muted);">
              No criteria found for this rubric.
            </td>
          </tr>
        `;
        return;
      }

      data.criteria.forEach((criterion, idx) => {
        const tr = document.createElement('tr');

        // 左侧 criteria - 使用后端字段名
        const td0 = td();
        td0.innerHTML = `
          <div class="criterion-title">${criterion.seq_no || idx + 1}. ${esc(criterion.title)}</div>
          ${criterion.description ? `<div style="font-weight: 400; margin-top: 4px; color: var(--muted);">${esc(criterion.description)}</div>` : ''}
        `;
        tr.appendChild(td0);

        // 根据后端返回的等级水平渲染列
        // 等级顺序为: HD, D, C, P, F
        const gradeLevelOrder = ['High Distinction', 'Distinction', 'Credit', 'Pass', 'Fail'];

        gradeLevelOrder.forEach(levelName => {
          const level = criterion.grade_levels?.find(l => l.level_name === levelName);
          const cell = td();

          if (level) {
            // 显示分数范围
            if (level.min_score !== undefined && level.max_score !== undefined) {
              cell.innerHTML += `<div class="badge">${level.min_score} - ${level.max_score}</div>`;
            }
            // 显示描述
            if (level.description) {
              cell.innerHTML += `<div>${nl2br(esc(level.description))}</div>`;
            }
            // 显示分数范围标签
            if (level.min_score !== undefined && level.max_score !== undefined) {
              cell.innerHTML += `<div class="score-range">(${level.min_score} - ${level.max_score})</div>`;
            }
          } else {
            cell.innerHTML = '<div style="color: var(--muted); font-style: italic;">Not defined</div>';
          }
          tr.appendChild(cell);
        });

        // 右侧最大分 - 使用max_score字段
        const tdScore = td();
        tdScore.innerHTML = `<div class="meta" style="font-weight: 700;">/ ${esc(String(criterion.max_score ?? '0'))}</div>`;
        tr.appendChild(tdScore);

        tbody.appendChild(tr);
      });
    }

  /* ===== Helpers ===== */
  function td(){ const e = document.createElement('td'); return e; }
  function esc(s){ return String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
  function nl2br(s){ return s.replace(/\n/g,'<br>'); }
  
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
