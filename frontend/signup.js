// signup.js
// Invitation sign-up flow: verify token → pre-fill email/show scope → submit to create account → go to confirmation page

(async function () {
  // ====== DOM ======
  const qs       = new URLSearchParams(location.search);
  const token    = qs.get('token');
  const emailEl  = document.getElementById('email');
  const scopeEl  = document.getElementById('inviteScope');
  const banner   = document.getElementById('inviteBanner');
  const statusEl = document.getElementById('status');
  const btn      = document.getElementById('btn');
  let inviteScope = ''; // save the scope returned by backend for display on confirmation page
  

  // ====== Block if no token ======
  if (!token) {
    statusEl.className = 'msg err';
    statusEl.textContent = 'Missing invitation token.';
    if (btn) btn.disabled = true;
    return;
  }

  // ====== Toast notification tool ======
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

  // ====== Verify invitation and pre-fill ======
  try {
    const r = await fetch('/api/invitations/verify?token=' + encodeURIComponent(token));
    const data = await r.json();
    if (!r.ok || data.success === false) {
      throw new Error(data.message || 'Invalid or expired invitation.');
    }

    // Pre-fill email, show banner, and write scope
    if (emailEl) emailEl.value = data.email || '';
    if (banner) banner.hidden = false;
    const inviteText = document.getElementById('inviteText');
    if (inviteText) inviteText.textContent = 'You were invited by the coordinator to join moderation.';
    if (data.scope && scopeEl) scopeEl.textContent = 'Scope: ' + data.scope;
    inviteScope = data.scope || '';

    // Show toast notification (supports URL overrides for title/desc/type)
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

  // ====== Submit registration ======
  document.getElementById('signupForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    statusEl.className = 'msg';
    statusEl.textContent = 'Creating account…';
    if (btn) btn.disabled = true;

    const name = document.getElementById('name')?.value.trim() || '';
    const password = document.getElementById('password')?.value || '';
    const confirm  = document.getElementById('confirm')?.value || '';
    const agree    = document.getElementById('agree')?.checked;

    // Basic validation
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

      // Registration successful → Redirect to confirmation page (then to login page)
      statusEl.className = 'msg ok';
      statusEl.textContent = 'Account created. Redirecting…';

      // Login page URL & auto-jump seconds: adjustable as needed
      const next = '/login';                       // Login page (change to '/index.html' if not root path)
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

