/* ═══════════════════════════════════════════════════════════════════════
   PAINEL DE CONTROLE CLÍNICO — js/core/auth.js
   Autenticação: login, logout, recuperação de senha
   Depende de: supabase.js (_sb já disponível globalmente)
═══════════════════════════════════════════════════════════════════════ */

function togglePass(fieldId, btn) {
  const f = document.getElementById(fieldId);
  if (!f) return;
  if (f.type === 'password') { f.type = 'text'; btn.textContent = '🙈'; }
  else { f.type = 'password'; btn.textContent = '👁'; }
}

async function doPasswordReset() {
  const p1 = (document.getElementById('newPass1').value||'');
  const p2 = (document.getElementById('newPass2').value||'');
  const errEl = document.getElementById('loginErr');
  errEl.style.color = '';
  if(p1.length < 6){ errEl.textContent = 'Mínimo 6 caracteres.'; return; }
  if(p1 !== p2){ errEl.textContent = 'As senhas não coincidem.'; return; }
  document.getElementById('loginBtn').textContent = 'Salvando...';
  errEl.textContent = '';
  /* Estabelece sessão explicitamente com os tokens do URL */
  const _hp = new URLSearchParams(window.location.hash.replace(/^#/,''));
  const _at = _hp.get('access_token');
  const _rt = _hp.get('refresh_token');
  if(_at && _rt){
    const {error:se} = await _sb.auth.setSession({access_token:_at, refresh_token:_rt});
    if(se){ errEl.textContent='Sessão expirada. Solicite um novo link de redefinição.'; document.getElementById('loginBtn').textContent='Salvar senha'; return; }
  }
  const {error} = await _sb.auth.updateUser({password: p1});
  if(error){
    errEl.textContent = 'Erro: ' + error.message;
    document.getElementById('loginBtn').textContent = 'Salvar senha';
  } else {
    errEl.style.color = '#22c55e';
    errEl.textContent = '✅ Senha alterada com sucesso! Entrando...';
    setTimeout(async ()=>{
      history.replaceState(null,'',window.location.pathname);
      window.location.reload();
    }, 2000);
  }
}

async function doLogin() {
  const email = (document.getElementById('loginEmail').value||'').trim();
  const pass  = document.getElementById('loginPassword').value;
  document.getElementById('loginErr').textContent = '';
  document.getElementById('loginBtn').textContent = 'Entrando...';
  const {error} = await _sb.auth.signInWithPassword({email, password: pass});
  document.getElementById('loginBtn').textContent = 'Entrar';
  if (error) {
    document.getElementById('loginErr').textContent = 'E-mail ou senha incorretos.';
  } else {
    document.getElementById('loginOverlay').style.display = 'none';
    await supaLoad();
    await loadUserProfile(); applyRoleVisibility();
    showSidebar(); switchSidebar('home');
    renderGlobal(); renderLanc(); renderAgenda(); renderAll(); onMonthChange();
  }
}

async function doLogout() {
  await _sb.auth.signOut();
  document.getElementById('loginOverlay').style.display = 'flex';
}
