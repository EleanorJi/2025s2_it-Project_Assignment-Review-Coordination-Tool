// signup.js
// 邀请注册流程：验证 token → 预填邮箱/展示 scope → 提交创建账号 → 跳到确认页

(async function () {
  // ====== DOM ======
  const qs       = new URLSearchParams(location.search);
  const token    = qs.get('token');
  const emailEl  = document.getElementById('email');
  const scopeEl  = document.getElementById('inviteScope');
  const banner   = document.getElementById('inviteBanner');
  const statusEl = document.getElementById('status');
  const btn      = document.getElementById('btn');
  let inviteScope = ''; // 保存后端返回的 scope，供确认页展示

  // ====== 无 token 直接阻断 ======
  if (!token) {
    statusEl.className = 'msg err';
    statusEl.textContent = 'Missing invitation token.';
    if (btn) btn.disabled = true;
    return;
  }

  // ====== 内嵌通知（toast）工具 ======
  function showToast({ title, desc, type = 'info', autoCloseMs = 8000 } = {}) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.classList.remove('info', 'success', 'warn', 'error', 'hidden');
    toast.classList.add(type);

    const t = document.getElementById('toast-title');
    const d = document.getElementById('toast-desc');
    if (t && title) t.textContent = title;
    if (d && desc)  d.textContent = desc;

    const close = () => toast.classList.add('hidden');
    const byId = (id) => document.getElementById(id);
    byId('toast-close')?.addEventListener('click', close, { once: true });
    byId('toast-dismiss')?.addEventListener('click', close, { once: true });
    byId('toast-ok')?.addEventListener('click', close, { once: true });

    if (autoCloseMs) setTimeout(close, autoCloseMs);
  }

  // ====== 校验邀请并预填 ======
  try {
    const r = await fetch('/api/invitations/verify?token=' + encodeURIComponent(token));
    const data = await r.json();
    if (!r.ok || data.success === false) {
      throw new Error(data.message || 'Invalid or expired invitation.');
    }

    // 预填邮箱、显示 banner、写入 scope
    if (emailEl) emailEl.value = data.email || '';
    if (banner) banner.hidden = false;
    const inviteText = document.getElementById('inviteText');
    if (inviteText) inviteText.textContent = 'You were invited by the coordinator to join moderation.';
    if (data.scope && scopeEl) scopeEl.textContent = 'Scope: ' + data.scope;
    inviteScope = data.scope || '';

    // 弹出通知（支持 URL 覆盖 title/desc/type）
    showToast({
      title: qs.get('title') || 'You’re invited to join moderation',
      desc:  qs.get('desc')  || (inviteScope ? ('Scope: ' + inviteScope) : 'Your invitation has been verified.'),
      type:  qs.get('type')  || 'info'
    });
  } catch (e) {
    statusEl.className = 'msg err';
    statusEl.textContent = e.message;
    if (btn) btn.disabled = true;
    return;
  }

  // ====== 提交注册 ======
  document.getElementById('signupForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    statusEl.className = 'msg';
    statusEl.textContent = 'Creating account…';
    if (btn) btn.disabled = true;

    const name = document.getElementById('name')?.value.trim() || '';
    const password = document.getElementById('password')?.value || '';
    const confirm  = document.getElementById('confirm')?.value || '';
    const agree    = document.getElementById('agree')?.checked;

    // 基础校验
    if (!name || password.length < 8 || password !== confirm || !agree) {
      statusEl.className = 'msg err';
      statusEl.textContent = !agree ? 'Please agree to the terms.' :
        (password !== confirm ? 'Passwords do not match.' :
        (password.length < 8 ? 'Password too short.' : 'Please complete all fields.'));
      if (btn) btn.disabled = false;
      return;
    }

    try {
    
      const res = await fetch('/api/invitations/complete-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name, password })
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.message || 'Sign-up failed.');
      }

      // 注册成功 → 跳到确认页（再由确认页进入登录页）
      statusEl.className = 'msg ok';
      statusEl.textContent = 'Account created. Redirecting…';

      // 登录页地址 & 自动跳秒数：可按需调整
      const next = '/login.html';                       // 登录页（如果不是根路径改成 '/index.html'）
      const s = 0;                            // 0=不自动跳；3=3秒后自动跳

      const emailParam = encodeURIComponent(emailEl?.value || '');
      const scopeParam = encodeURIComponent(inviteScope || '');
      location.href = `/confirm.html?next=${encodeURIComponent(next)}&s=${s}&email=${emailParam}&scope=${scopeParam}`;
    } catch (err) {
      statusEl.className = 'msg err';
      statusEl.textContent = err.message;
      if (btn) btn.disabled = false;
    }
  });
})();

