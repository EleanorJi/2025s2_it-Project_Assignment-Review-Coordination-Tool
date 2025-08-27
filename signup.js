// Sign-up flow: verify invitation token, prefill email, accept invitation
(async function(){
  const qs = new URLSearchParams(location.search);
  const token = qs.get('token');
  const emailEl = document.getElementById('email');
  const scopeEl = document.getElementById('inviteScope');
  const banner  = document.getElementById('inviteBanner');
  const status  = document.getElementById('status');
  const btn     = document.getElementById('btn');

  if (!token) {
    status.className='msg err';
    status.textContent='Missing invitation token.';
    btn.disabled = true;
    return;
  }

  // Verify token & prefill email/scope
  try{
    const r = await fetch('/api/invitations/verify?token='+encodeURIComponent(token));
    const data = await r.json();
    if (!r.ok || data.success===false) throw new Error(data.message || 'Invalid or expired invitation.');
    emailEl.value = data.email;
    banner.hidden = false;
    document.getElementById('inviteText').textContent = 'You were invited by the coordinator to join moderation.';
    if (data.scope) scopeEl.textContent = 'Scope: ' + data.scope;
  }catch(e){
    status.className='msg err'; status.textContent=e.message; btn.disabled=true; return;
  }

  document.getElementById('signupForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    status.className='msg'; status.textContent='Creating account…';

    const name = document.getElementById('name').value.trim();
    const password = document.getElementById('password').value;
    const confirm = document.getElementById('confirm').value;
    const agree = document.getElementById('agree').checked;

    if (!name || password.length < 8 || password !== confirm || !agree) {
      status.className='msg err';
      status.textContent = !agree ? 'Please agree to the terms.' :
        (password !== confirm ? 'Passwords do not match.' :
        (password.length < 8 ? 'Password too short.' : 'Please complete all fields.'));
      return;
    }

    try{
      const res = await fetch('/api/invitations/accept', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ token, name, password })
      });
      const data = await res.json();
      if (!res.ok || data.success===false) throw new Error(data.message || 'Sign-up failed.');

      status.className='msg ok';
      status.textContent='Account created. Redirecting to sign in…';
      setTimeout(()=>location.href='/', 1500);
    }catch(err){
      status.className='msg err'; status.textContent=err.message;
    }
  });
})();