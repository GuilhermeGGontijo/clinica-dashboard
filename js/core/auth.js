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
    await UnidadesMod.initSilencioso();
    renderGlobal(); renderLanc(); renderAgenda(); renderAll(); onMonthChange();
    /* Primeiro acesso: exigir troca de senha */
    if (USER_PROFILE && USER_PROFILE.senha_provisoria) {
      setTimeout(abrirTrocaSenha, 800);
    }
  }
}

async function doLogout() {
  await _sb.auth.signOut();
  document.getElementById('loginOverlay').style.display = 'flex';
}

/* ── Recuperação de senha ("Esqueci minha senha") ── */
function mostrarEsqueciSenha() {
  var lb = document.getElementById('loginBox');
  if (!lb) return;
  lb.innerHTML = ''
    + '<div id="loginLogo" style="font-size:3rem;text-align:center;margin-bottom:6px">🔑</div>'
    + '<h2 style="text-align:center">Recuperar Senha</h2>'
    + '<p style="text-align:center;font-size:.83rem;color:#94a3b8;margin-bottom:18px">Informe seu e-mail e enviaremos<br>um link para redefinir a senha.</p>'
    + '<input class="lField" type="email" id="recovEmail" placeholder="Seu e-mail" autocomplete="email"/>'
    + '<button id="loginBtn" onclick="doEnviarRecuperacao()" style="margin-top:10px">Enviar Link</button>'
    + '<div id="loginErr"></div>'
    + '<div style="text-align:center;margin-top:16px">'
    +   '<a href="#" onclick="location.reload();return false;" '
    +     'style="font-size:.8rem;color:#64748b;text-decoration:none">← Voltar para o login</a>'
    + '</div>';
}

async function doEnviarRecuperacao() {
  var email = (document.getElementById('recovEmail').value||'').trim();
  var errEl = document.getElementById('loginErr');
  errEl.style.color = '';
  if (!email) { errEl.textContent = 'Informe seu e-mail.'; return; }
  var btn = document.getElementById('loginBtn');
  btn.disabled = true; btn.textContent = 'Enviando...';
  var r = await _sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname
  });
  btn.disabled = false; btn.textContent = 'Enviar Link';
  if (r.error) {
    errEl.textContent = 'Erro: ' + r.error.message;
  } else {
    errEl.style.color = '#22c55e';
    errEl.textContent = '✅ Link enviado! Verifique sua caixa de entrada.';
  }
}

/* ── Troca de senha no primeiro acesso ── */
function abrirTrocaSenha() {
  var m = document.getElementById('modalTrocaSenha');
  if (m) { m.style.display = 'flex'; }
}

async function salvarTrocaSenha() {
  var p1 = (document.getElementById('trocaPass1').value||'');
  var p2 = (document.getElementById('trocaPass2').value||'');
  var errEl = document.getElementById('trocaErr');
  errEl.textContent = '';
  if (p1.length < 6) { errEl.textContent = 'Mínimo 6 caracteres.'; return; }
  if (p1 !== p2)     { errEl.textContent = 'As senhas não coincidem.'; return; }
  var btn = document.getElementById('trocaBtn');
  btn.disabled = true; btn.textContent = 'Salvando...';
  var r = await _sb.auth.updateUser({ password: p1 });
  if (r.error) {
    errEl.textContent = 'Erro: ' + r.error.message;
    btn.disabled = false; btn.textContent = 'Salvar Nova Senha';
    return;
  }
  /* Marcar senha_provisoria = false */
  var sess = await _sb.auth.getUser();
  var uid = sess.data && sess.data.user ? sess.data.user.id : null;
  if (uid) {
    await _sb.from('perfis_usuarios').update({ senha_provisoria: false }).eq('id', uid);
    if (typeof USER_PROFILE !== 'undefined' && USER_PROFILE) USER_PROFILE.senha_provisoria = false;
  }
  var m = document.getElementById('modalTrocaSenha');
  if (m) m.style.display = 'none';
  if (typeof toast !== 'undefined') toast('✅ Senha alterada com sucesso!', 'success');
}
