// Past Assignment – grouped by semester with collapse + actions
(function () {
    const $  = (s, r=document) => r.querySelector(s);
  
    // ===== Demo data（可替换为后端返回）=====
    // 结构：year, semester, items[{title, reportUrl?, rubricUrl?}]
    const data = [
      {
        year: 2024, semester: 'Semester 2',
        items: [
          { title: 'Assignment 1 (Round 1)', reportUrl: '#', rubricUrl: '#' },
          { title: 'Assignment 1 (Round 2)', reportUrl: '#', rubricUrl: '#' },
          { title: 'Assignment 2 (Round 1)', reportUrl: '#', rubricUrl: '#' },
        ]
      },
      {
        year: 2024, semester: 'Semester 1',
        items: [
          { title: 'Assignment 1 (Round 1)', reportUrl: '#', rubricUrl: '#' },
          { title: 'Assignment 2 (Round 1)', reportUrl: '#', rubricUrl: '#' },
        ]
      },
      {
        year: 2023, semester: 'Semester 2',
        items: [
          { title: 'Assignment 1 (Round 2)', reportUrl: '#', rubricUrl: '#' },
          { title: 'Assignment 2 (Round 1)', reportUrl: '#', rubricUrl: '#' },
        ]
      }
    ];
  
    // ===== Render =====
    const host = $('#paContainer');
  
    function render() {
      host.innerHTML = '';
      data.forEach(group => host.appendChild(renderGroup(group)));
    }
  
    function renderGroup(group) {
      const block = document.createElement('div');
      block.className = 'pa-block';
  
      // Header
      const hd = document.createElement('div');
      hd.className = 'pa-hd';
      const title = document.createElement('div');
      title.className = 'pa-title';
      title.textContent = `${group.year} · ${group.semester}`;
      const toggle = document.createElement('div');
      toggle.className = 'pa-toggle';
      toggle.textContent = '▾';
      hd.append(title, toggle);
      block.append(hd);
  
      // List
      const list = document.createElement('div');
      list.className = 'pa-list';
      group.items.forEach(item => list.appendChild(renderRow(item)));
      block.append(list);
  
      // Collapse
      hd.addEventListener('click', () => {
        const collapsed = block.classList.toggle('collapsed');
        toggle.textContent = collapsed ? '▸' : '▾';
      });
  
      return block;
    }
  
    function renderRow(item) {
      const row = document.createElement('div');
      row.className = 'pa-row';
  
      const left = document.createElement('div');
      left.className = 'pa-muted';
      left.textContent = item.title;
  
      const acts = document.createElement('div');
      acts.className = 'pa-actions';
      acts.append(
        makeBtn('View report', () => openOrToast(item.reportUrl, 'Report not available')),
        makeBtn('Open rubric', () => openOrToast(item.rubricUrl, 'Rubric not available'))
      );
  
      row.append(left, acts);
      return row;
    }
  
    function makeBtn(text, onClick) {
      const b = document.createElement('button');
      b.className = 'btn sm';
      b.textContent = text;
      b.addEventListener('click', onClick);
      return b;
    }
  
    function openOrToast(url, fallbackMsg) {
      if (url && url !== '#') {
        window.open(url, '_blank', 'noopener');
      } else {
        toast(fallbackMsg);
      }
    }
  
    // Simple toast（使用全局 .toast 样式）
    function toast(msg, ms=2000){
      const t=document.createElement('div');
      t.className='toast'; t.textContent=msg; document.body.appendChild(t);
      requestAnimationFrame(()=> t.classList.add('show'));
      setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=> t.remove(), 200); }, ms);
    }
  
    render();
  })();
  