// mark.js — Flexible Weights (editable), with Normalize & Auto-from-Max
(() => {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  // —— 示例数据（可用你实际从 Excel/后端来的数据替换）——
  let rows = [
    { criterion:'Introduction: Applies theoretical framework', max:100, score:72, note:'', weight:15 },
    { criterion:'Locates, synthesises and critically analyses literature', max:100, score:60, note:'', weight:10 },
    { criterion:'Develops significant themes', max:100, score:67, note:'', weight:20 },
    { criterion:'Supports themes with illustrative quotes', max:100, score:83, note:'', weight:15 },
    { criterion:'Summarises and interprets key findings', max:100, score:58, note:'', weight:20 },
    { criterion:'Synthesises strengths, limitations & implications', max:100, score:70, note:'', weight:10 },
    { criterion:'Communicates and references scientific literature', max:100, score:78, note:'', weight:10 },
  ];

  const bodyEl        = $('#rubricBody');
  const totalMaxEl    = $('#totalMax');
  const totalWeightEl = $('#totalWeight');
  const totalScoreEl  = $('#totalScore');
  const totalPctEl    = $('#totalPct');
  const sumHintEl     = $('#sumHint');
  const totalsRow     = $('#totalsRow');

  // 若页面没有按钮，自动插入
  function ensureButtons() {
    let normBtn = $('#btnNormalize');
    let autoBtn = $('#btnAutoFromMax');
    if (!totalsRow) return;

    if (!autoBtn) {
      const b = document.createElement('button');
      b.id = 'btnAutoFromMax';
      b.className = 'btn';
      b.style.marginRight = '8px';
      b.textContent = 'Auto from Max';
      totalsRow.querySelector('td:last-child')?.prepend(b);
    }
    if (!normBtn) {
      const b = document.createElement('button');
      b.id = 'btnNormalize';
      b.className = 'btn';
      b.style.marginRight = '8px';
      b.textContent = 'Normalize to 100%';
      totalsRow.querySelector('td:last-child')?.prepend(b);
    }
  }
  ensureButtons();

  const fmtPct = n => (Math.round(n*10)/10).toFixed(1) + '%';
  const clampNum = v => {
    const n = Number(v);
    if (!isFinite(n)) return 0;
    return n;
  };

  function render() {
    bodyEl.innerHTML = '';
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');

      // #
      const tdIdx = document.createElement('td'); tdIdx.textContent = String(i+1);

      // Criterion
      const tdC = document.createElement('td'); tdC.textContent = r.criterion;

      // Max (可改、不影响权重，权重单独列)
      const tdMax = document.createElement('td');
      const maxInput = document.createElement('input');
      maxInput.type = 'number'; maxInput.min='0'; maxInput.step='1';
      maxInput.className='num'; maxInput.value = r.max;
      maxInput.addEventListener('input', () => {
        r.max = clampNum(maxInput.value);
        computeTotals();
      });
      tdMax.appendChild(maxInput);

      // Weight(%) —— 可编辑
      const tdW = document.createElement('td');
      const wInput = document.createElement('input');
      wInput.type='number'; wInput.min='0'; wInput.step='0.1';
      wInput.className='num'; wInput.value = (r.weight ?? 0).toFixed(1);
      wInput.addEventListener('input', () => {
        r.weight = clampNum(wInput.value);
        computeTotals();
      });
      const suffix = document.createElement('span');
      suffix.textContent = ' %';
      suffix.style.marginLeft = '4px';
      tdW.appendChild(wInput);
      tdW.appendChild(suffix);

      // Score(可编辑)
      const tdS = document.createElement('td');
      const scoreInput = document.createElement('input');
      scoreInput.type='number'; scoreInput.min='0'; scoreInput.step='1';
      scoreInput.className='num'; scoreInput.value = r.score ?? 0;
      scoreInput.addEventListener('input', () => {
        r.score = clampNum(scoreInput.value);
        computeTotals();
      });
      tdS.appendChild(scoreInput);

      // Note
      const tdN = document.createElement('td');
      const noteInput = document.createElement('input');
      noteInput.className='input'; noteInput.placeholder='Optional note...';
      noteInput.value = r.note || '';
      noteInput.addEventListener('input', ()=> r.note = noteInput.value);
      tdN.appendChild(noteInput);

      tr.append(tdIdx, tdC, tdMax, tdW, tdS, tdN);
      bodyEl.appendChild(tr);
    });

    wireFooterButtons();
    computeTotals();
  }

  // —— 合计/整体分计算 —— 
  function computeTotals() {
    const sumMax    = rows.reduce((s, r) => s + (Number(r.max)||0), 0);
    const sumScore  = rows.reduce((s, r) => s + (Number(r.score)||0), 0);
    const sumWeight = rows.reduce((s, r) => s + (Number(r.weight)||0), 0);

    totalMaxEl.textContent    = sumMax;
    totalScoreEl.textContent  = sumScore;
    totalWeightEl.textContent = fmtPct(sumWeight);

    // Overall% = Σ( (score/max) * weight )
    const overallPct = rows.reduce((acc, r) => {
      const max   = Number(r.max)   || 0;
      const score = Number(r.score) || 0;
      const w     = Number(r.weight)|| 0;
      const rate  = max > 0 ? score / max : 0;
      return acc + rate * w;
    }, 0);

    totalPctEl.textContent = fmtPct(overallPct);

    // 提示：权重总和需为 100%
    const ok = Math.abs(sumWeight - 100) < 0.05;
    totalsRow.classList.toggle('bad-bg', !ok);
    sumHintEl.innerHTML = ok ? '' : '当前权重总和 ≠ 100%，请手动调整或点击 Normalize。';
    sumHintEl.classList.toggle('bad', !ok);
  }

  // —— 辅助：按 Max 自动生成权重 —— 
  function autoFromMax() {
    const sumMax = rows.reduce((s, r) => s + (Number(r.max)||0), 0);
    if (sumMax <= 0) {
      // 均分
      const even = 100 / rows.length;
      rows.forEach(r => r.weight = even);
      return fixRounding();
    }
    rows.forEach(r => {
      const w = (Number(r.max)||0) / sumMax * 100;
      r.weight = w;
    });
    fixRounding();
  }

  // —— 辅助：把当前权重按比例缩放到合计 100 —— 
  function normalizeWeights() {
    const sum = rows.reduce((s, r) => s + (Number(r.weight)||0), 0);
    if (sum <= 0) {
      const even = 100 / rows.length;
      rows.forEach(r => r.weight = even);
      return fixRounding();
    }
    const factor = 100 / sum;
    rows.forEach(r => r.weight = (Number(r.weight)||0) * factor);
    fixRounding();
  }

  // —— 修正四舍五入误差：保留 1 位小数且最终总和=100.0 —— 
  function fixRounding() {
    // 先四舍五入到 0.1
    rows.forEach(r => r.weight = Math.round((Number(r.weight)||0) * 10) / 10);
    let total = rows.reduce((s, r) => s + (Number(r.weight)||0), 0);
    total = Math.round(total * 10) / 10;
    const diff = Math.round((100 - total) * 10) / 10; // 差值（可能是 +/-0.1）

    if (Math.abs(diff) > 0) {
      // 调整到最后一行
      const last = rows[rows.length - 1];
      last.weight = Math.round((Number(last.weight)||0 + diff) * 10) / 10;
    }
  }

  function wireFooterButtons() {
    $('#btnNormalize')?.addEventListener('click', () => {
      normalizeWeights();
      // 更新输入框显示
      syncWeightInputs();
      computeTotals();
    });
    $('#btnAutoFromMax')?.addEventListener('click', () => {
      autoFromMax();
      syncWeightInputs();
      computeTotals();
    });
  }

  function syncWeightInputs() {
    // 把 rows 的权重回写到表格输入框
    $$('#rubricBody tr').forEach((tr, i) => {
      const wInput = tr.querySelector('td:nth-child(4) input');
      if (wInput && rows[i]) wInput.value = (rows[i].weight ?? 0).toFixed(1);
    });
  }

  // 保存/发布（带上权重）
  $('#btnSave')?.addEventListener('click', ()=>{
    console.log('[save]', rows);
    alert('Saved (console 有 rows，包括权重)');
  });
  $('#btnPublish')?.addEventListener('click', ()=>{
    console.log('[publish]', rows);
    alert('Published (console 有 rows，包括权重)');
  });

  render();
})();
