/* ═══════════════════════════════════════════════════════════════════════
   PAINEL DE CONTROLE CLÍNICO — js/modules/usuarios.js
   UsuariosMod: Cadastro e Controle de Usuários
   Depende de: supabase.js (_sb), main.js (sid, esc, toast, USER_ROLE)
═══════════════════════════════════════════════════════════════════════ */

const UsuariosMod = (function () {
  'use strict';

  var _lista  = [];
  var _editId = null;

  /* ── Especialidades → Conselho padrão ── */
  var ESPECIALIDADES = [
    { val: 'medico',         label: 'Médico(a)',              conselho: 'CRM'    },
    { val: 'fisioterapeuta', label: 'Fisioterapeuta',         conselho: 'CREFITO'},
    { val: 'psicologo',      label: 'Psicólogo(a)',           conselho: 'CRP'    },
    { val: 'nutricionista',  label: 'Nutricionista',          conselho: 'CRN'    },
    { val: 'dentista',       label: 'Dentista',               conselho: 'CRO'    },
    { val: 'enfermeiro',     label: 'Enfermeiro(a)',          conselho: 'COREN'  },
    { val: 'fonoaudiologo',  label: 'Fonoaudiólogo(a)',       conselho: 'CRFa'   },
    { val: 'terapeuta',      label: 'Terapeuta Ocupacional',  conselho: 'COFFITO'},
    { val: 'farmaceutico',   label: 'Farmacêutico(a)',        conselho: 'CRF'    },
    { val: 'biomedico',      label: 'Biomédico(a)',           conselho: 'CFBM'   },
    { val: 'assistente',     label: 'Assistente Social',      conselho: 'CRESS'  },
    { val: 'outro',          label: 'Outro',                  conselho: ''       }
  ];

  var CONSELHOS = [
    'CRM','CRO','CRP','CRN','CREFITO','COREN','CRFa','COFFITO',
    'CRF','CFBM','CRESS','CFM','CFO','CFP','CFF','CFTS','OUTRO'
  ];

  var ESPECIALIDADES_MEDICAS = [
    'Acupuntura','Alergia e Imunologia','Anestesiologia','Angiologia',
    'Cancerologia','Cardiologia','Cirurgia Cardiovascular','Cirurgia da Mão',
    'Cirurgia de Cabeça e Pescoço','Cirurgia do Aparelho Digestivo',
    'Cirurgia Geral','Cirurgia Pediátrica','Cirurgia Plástica',
    'Cirurgia Torácica','Cirurgia Vascular','Clínica Médica','Coloproctologia',
    'Dermatologia','Endocrinologia e Metabologia','Endoscopia',
    'Gastroenterologia','Genética Médica','Geriatria',
    'Ginecologia e Obstetrícia','Hematologia e Hemoterapia','Homeopatia',
    'Infectologia','Mastologia','Medicina de Emergência',
    'Medicina de Família e Comunidade','Medicina do Trabalho',
    'Medicina do Tráfego','Medicina Esportiva','Medicina Física e Reabilitação',
    'Medicina Intensiva','Medicina Legal e Perícia Médica','Medicina Nuclear',
    'Medicina Preventiva e Social','Nefrologia','Neurocirurgia','Neurologia',
    'Nutrologia','Oftalmologia','Ortopedia e Traumatologia',
    'Otorrinolaringologia','Patologia','Patologia Clínica / Med. Laboratorial',
    'Pediatria','Pneumologia','Psiquiatria',
    'Radiologia e Diagnóstico por Imagem','Radioterapia',
    'Reumatologia','Urologia'
  ];

  var UFS = [
    'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA',
    'MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN',
    'RO','RR','RS','SC','SE','SP','TO'
  ];

  var ROLES = {
    administrador:      { label: 'Administrador',         cls: 'roleBadgeAdmin' },
    profissional_saude: { label: 'Profissional de Saúde', cls: 'roleBadgeProf'  },
    recepcionista:      { label: 'Recepcionista',         cls: 'roleBadgeRecep' },
    faturamento:        { label: 'Faturamento',           cls: 'roleBadgeFat'   }
  };

  /* Módulos permitidos por perfil (null = irrestrito) */
  var ROLE_MODULES = {
    administrador:      null,
    profissional_saude: ['home','pacientes','agenda','admin-recepcao','prontuario',
                         'relatorios','fin-dashboard','recebimentos'],
    recepcionista:      ['home','pacientes','agenda','admin-recepcao'],
    faturamento:        ['home','agenda','relatorios','fin-dashboard','recebimentos',
                         'administrativo','admin-salas','admin-atendimentos','admin-convenios']
  };

  /* ── canAccess ── */
  function canAccess (mod) {
    if (!USER_ROLE || USER_ROLE === 'administrador') return true;
    var allowed = ROLE_MODULES[USER_ROLE];
    if (!allowed) return true;
    return allowed.indexOf(mod) >= 0;
  }

  /* ── Init (aba Cadastro) ── */
  async function init () {
    await _carregar();
    _render();
    _popularSelects();
  }

  /* ── Init (aba Controle) ── */
  async function initControle () {
    if (!_lista.length) await _carregar();
    _renderControle();
  }

  /* ── Carregar perfis ── */
  async function _carregar () {
    var r = await _sb.from('perfis_usuarios').select('*').order('nome', { nullsFirst: false });
    _lista = r.error ? [] : (r.data || []);
    if (r.error) console.error('[UsuariosMod]', r.error.message);
  }

  /* ── Render lista de cadastro ── */
  function _render () {
    var wrap = sid('usuListWrap');
    if (!wrap) return;
    if (!_lista.length) {
      wrap.innerHTML = '<div class="usuVazio">👤 Nenhum usuário cadastrado ainda.<br>'
        + '<small>Clique em "+ Novo Usuário" para começar.</small></div>';
      return;
    }
    wrap.innerHTML = '<div class="usuGrid">' + _lista.map(_renderCard).join('') + '</div>';
  }

  function _renderCard (u) {
    var role  = ROLES[u.role] || { label: u.role || '?', cls: 'roleBadgeAdmin' };
    var esp   = u.especialidade
      ? ESPECIALIDADES.find(function(e){ return e.val === u.especialidade; })
      : null;
    var ativo = u.ativo !== false;
    return '<div class="usuCard' + (ativo ? '' : ' usuCardInativo') + '">'
      + '<div class="usuCardHdr">'
      +   '<div class="usuCardNome">' + esc(u.nome || '—') + '</div>'
      +   '<span class="roleBadge ' + role.cls + '">' + role.label + '</span>'
      + '</div>'
      + '<div class="usuCardMeta">'
      +   (u.email    ? '<div class="usuMetaRow">✉️ ' + esc(u.email)    + '</div>' : '')
      +   (u.telefone ? '<div class="usuMetaRow">📞 ' + esc(u.telefone) + '</div>' : '')
      +   (esp        ? '<div class="usuMetaRow">🩺 ' + esc(esp.label)  + '</div>' : '')
      +   (u.conselho_tipo && u.conselho_numero
            ? '<div class="usuMetaRow">📜 '
              + esc(u.conselho_tipo) + ' ' + esc(u.conselho_numero)
              + (u.conselho_uf ? '/' + esc(u.conselho_uf) : '') + '</div>'
            : '')
      +   (u.especialidade_medica
            ? '<div class="usuMetaRow">🎓 Esp: ' + esc(u.especialidade_medica)
              + (u.rqe_numero ? ' — RQE ' + esc(u.rqe_numero) + (u.rqe_uf ? '/' + esc(u.rqe_uf) : '') : '')
              + '</div>'
            : '')
      + '</div>'
      + '<div class="usuCardStatus">'
      +   (ativo
            ? '<span class="usuAtivo">● Ativo</span>'
            : '<span class="usuInativo">● Inativo</span>')
      + '</div>'
      + '<div class="usuCardAcoes">'
      +   '<button class="btn bS" onclick="UsuariosMod.editar(\'' + u.id + '\')">✏️ Editar</button>'
      +   (ativo
            ? '<button class="btn usuBtnDesativar" onclick="UsuariosMod.toggleAtivo(\'' + u.id + '\',false)">🚫 Desativar</button>'
            : '<button class="btn bG" onclick="UsuariosMod.toggleAtivo(\'' + u.id + '\',true)">✅ Reativar</button>')
      + '</div>'
      + '</div>';
  }

  /* ── Popular selects do modal ── */
  function _popularSelects () {
    var espEl = sid('usuEsp');
    if (espEl && !espEl.dataset.populated) {
      espEl.innerHTML = '<option value="">Selecione a especialidade...</option>'
        + ESPECIALIDADES.map(function(e){
            return '<option value="' + e.val + '">' + esc(e.label) + '</option>';
          }).join('');
      espEl.dataset.populated = '1';
    }
    var ctEl = sid('usuConselhoTipo');
    if (ctEl && !ctEl.dataset.populated) {
      ctEl.innerHTML = '<option value="">Selecione...</option>'
        + CONSELHOS.map(function(c){ return '<option value="' + c + '">' + c + '</option>'; }).join('');
      ctEl.dataset.populated = '1';
    }
    var _ufOpts = '<option value="">UF</option>'
      + UFS.map(function(u){ return '<option value="' + u + '">' + u + '</option>'; }).join('');
    var ufEl = sid('usuConselhoUF');
    if (ufEl && !ufEl.dataset.populated) { ufEl.innerHTML = _ufOpts; ufEl.dataset.populated = '1'; }
    var rqeUfEl = sid('usuRqeUF');
    if (rqeUfEl && !rqeUfEl.dataset.populated) { rqeUfEl.innerHTML = _ufOpts; rqeUfEl.dataset.populated = '1'; }
    var emEl = sid('usuEspMedica');
    if (emEl && !emEl.dataset.populated) {
      emEl.innerHTML = '<option value="">Selecione a especialidade médica...</option>'
        + ESPECIALIDADES_MEDICAS.map(function(s){
            return '<option value="' + esc(s) + '">' + esc(s) + '</option>';
          }).join('');
      emEl.dataset.populated = '1';
    }
  }

  /* ── Abrir modal novo ── */
  function abrirNovo () {
    _editId = null;
    _popularSelects();
    sid('usuModalTitulo').textContent = '+ Novo Usuário';
    sid('usuBtnSalvar').textContent   = 'Criar Usuário';
    sid('usuBtnSalvar').disabled      = false;
    _limparModal();
    var sw = sid('usuSenhaWrap');
    if (sw) sw.style.display = '';
    var em = sid('usuEmail');
    if (em) em.readOnly = false;
    sid('usuModalUsuario').style.display = 'flex';
  }

  /* ── Editar ── */
  function editar (id) {
    var u = _lista.find(function(x){ return String(x.id) === String(id); });
    if (!u) return;
    _editId = id;
    _popularSelects();
    sid('usuModalTitulo').textContent = '✏️ Editar Usuário';
    sid('usuBtnSalvar').textContent   = 'Salvar Alterações';
    sid('usuBtnSalvar').disabled      = false;
    _limparModal();
    var sw = sid('usuSenhaWrap');
    if (sw) sw.style.display = 'none';
    var em = sid('usuEmail');
    if (em) { em.value = u.email || ''; em.readOnly = false; }
    var set = function(id2, val){ var el=sid(id2); if(el) el.value = val||''; };
    set('usuNome',        u.nome);
    set('usuTelefone',    u.telefone);
    set('usuRole',        u.role || 'recepcionista');
    set('usuEsp',         u.especialidade);
    set('usuConselhoTipo',u.conselho_tipo);
    set('usuConselhoNum', u.conselho_numero);
    set('usuConselhoUF',  u.conselho_uf);
    set('usuEspMedica',   u.especialidade_medica);
    set('usuRqeNum',      u.rqe_numero);
    set('usuRqeUF',       u.rqe_uf);
    onRoleChange();
    onEspChange(); /* mostra RQE se for médico */
    sid('usuModalUsuario').style.display = 'flex';
  }

  function fecharModal () {
    var m = sid('usuModalUsuario');
    if (m) m.style.display = 'none';
    _editId = null;
  }

  function _limparModal () {
    ['usuNome','usuTelefone','usuSenha','usuConselhoNum','usuRqeNum'].forEach(function(id2){
      var el=sid(id2); if(el) el.value='';
    });
    var r=sid('usuRole');    if(r) r.value='recepcionista';
    var e=sid('usuEsp');     if(e) e.value='';
    var ct=sid('usuConselhoTipo'); if(ct) ct.value='';
    var uf=sid('usuConselhoUF');   if(uf) uf.value='';
    var em=sid('usuEspMedica');    if(em) em.value='';
    var ru=sid('usuRqeUF');        if(ru) ru.value='';
    var rw=sid('usuRqeWrap');      if(rw) rw.style.display='none';
    onRoleChange();
  }

  /* ── Salvar (criar ou editar) ── */
  async function salvar () {
    var nome  = (sid('usuNome').value  ||'').trim();
    var email = (sid('usuEmail').value ||'').trim().toLowerCase();
    var tel   = (sid('usuTelefone').value||'').trim();
    var role  = sid('usuRole').value;
    var esp   = sid('usuEsp').value;
    var ctipo = (sid('usuConselhoTipo').value||'').trim().toUpperCase();
    var cnum  = (sid('usuConselhoNum').value||'').trim();
    var cuf   = sid('usuConselhoUF').value;
    var espMedica = (sid('usuEspMedica')||{}).value || '';
    var rqeNum    = ((sid('usuRqeNum')||{}).value||'').trim();
    var rqeUF     = (sid('usuRqeUF')||{}).value || '';
    var senha = _editId ? '' : ((sid('usuSenha')||{}).value||'');

    if (!nome)  { toast('Informe o nome completo.','error'); return; }
    if (!email) { toast('Informe o e-mail.','error'); return; }
    if (!_editId && senha.length < 6) {
      toast('Senha deve ter no mínimo 6 caracteres.','error'); return;
    }

    /* Campos obrigatórios para profissional de saúde */
    if (role === 'profissional_saude') {
      if (!ctipo) { toast('Informe o Conselho (CRM, CREFITO, CRO...).','error'); return; }
      if (!cnum)  { toast('Informe o Número do Registro no conselho.','error');  return; }
      if (!cuf)   { toast('Informe a UF do conselho.','error');                   return; }
    }

    var btn = sid('usuBtnSalvar');
    if (btn) { btn.disabled=true; btn.textContent='Salvando...'; }

    var senhaProvis = !_editId
      ? !!(sid('usuSenhaProvis') && sid('usuSenhaProvis').checked)
      : undefined;

    var payload = {
      nome: nome,
      email: email,
      telefone: tel||null,
      role: role,
      especialidade: esp||null,
      conselho_tipo: ctipo||null,
      conselho_numero: cnum||null,
      conselho_uf: cuf||null,
      especialidade_medica: espMedica||null,
      rqe_numero: rqeNum||null,
      rqe_uf: rqeUF||null,
      ativo: true
    };
    if (senhaProvis !== undefined) payload.senha_provisoria = senhaProvis;

    try {
      if (_editId) {
        var r = await _sb.from('perfis_usuarios').update(payload).eq('id', _editId);
        if (r.error) throw r.error;
        toast('✅ Usuário atualizado com sucesso!', 'success');
      } else {
        /* Salvar sessão do admin antes de criar novo usuário */
        var adminSess = (await _sb.auth.getSession()).data.session;

        var su = await _sb.auth.signUp({
          email: email,
          password: senha,
          options: { data: { nome: nome } }
        });
        if (su.error) throw su.error;

        var uid = su.data && su.data.user ? su.data.user.id : null;
        if (!uid) throw new Error('UID não retornado. Verifique se o e-mail já existe.');

        /* Restaurar sessão do admin caso tenha sido alterada */
        var curSess = (await _sb.auth.getSession()).data.session;
        if (adminSess && (!curSess || curSess.user.id !== adminSess.user.id)) {
          await _sb.auth.setSession({
            access_token: adminSess.access_token,
            refresh_token: adminSess.refresh_token
          });
        }

        payload.id = uid;
        var rp = await _sb.from('perfis_usuarios').upsert(payload, { onConflict: 'id' });
        if (rp.error) throw rp.error;

        toast('✅ Usuário criado! Um e-mail de confirmação será enviado.', 'success');
      }
    } catch (err) {
      toast('Erro: ' + err.message, 'error');
      if (btn) { btn.disabled=false; btn.textContent=_editId?'Salvar Alterações':'Criar Usuário'; }
      return;
    }

    fecharModal();
    await _carregar();
    _render();
    /* Atualiza controle se estiver aberto */
    if (sid('ctrlListWrap') && sid('ctrlListWrap').children.length) _renderControle();
  }

  /* ── Ativar / Desativar usuário ── */
  async function toggleAtivo (id, ativo) {
    var u = _lista.find(function(x){ return String(x.id)===String(id); });
    var nome = u ? (u.nome || u.email || 'este usuário') : 'este usuário';
    var acao = ativo ? 'reativar' : 'desativar';
    if (!confirm('Deseja ' + acao + ' o usuário "' + nome + '"?')) return;

    var r = await _sb.from('perfis_usuarios').update({ ativo: ativo }).eq('id', id);
    if (r.error) { toast('Erro: ' + r.error.message, 'error'); return; }
    if (u) u.ativo = ativo;
    _render();
    if (sid('ctrlListWrap')) _renderControle();
    toast(ativo ? '✅ Usuário reativado.' : '🚫 Usuário desativado.', 'success');
  }

  /* ── Mostrar/ocultar campos de profissional ── */
  function onRoleChange () {
    var role = (sid('usuRole')||{}).value || '';
    var w = sid('usuProfWrap');
    if (w) w.style.display = role === 'profissional_saude' ? 'block' : 'none';
    if (role !== 'profissional_saude') {
      var rw = sid('usuRqeWrap');
      if (rw) rw.style.display = 'none';
    }
  }

  /* ── Auto-preencher conselho + mostrar RQE se médico ── */
  function onEspChange () {
    var espEl = sid('usuEsp');
    if (!espEl) return;
    var esp = espEl.value
      ? ESPECIALIDADES.find(function(e){ return e.val === espEl.value; })
      : null;
    if (esp && esp.conselho) {
      var ct = sid('usuConselhoTipo');
      if (ct) ct.value = esp.conselho;
    }
    var rw = sid('usuRqeWrap');
    if (rw) rw.style.display = (espEl.value === 'medico') ? 'block' : 'none';
  }

  /* Ordem de prioridade de roles (maior index = mais permissivo) */
  var ROLE_PRIORITY = ['recepcionista','faturamento','profissional_saude','administrador'];

  function _rolePrimario (roles) {
    var best = roles.reduce(function(acc, r) {
      var ip = ROLE_PRIORITY.indexOf(r);
      var ia = ROLE_PRIORITY.indexOf(acc);
      return ip > ia ? r : acc;
    }, roles[0] || 'recepcionista');
    return best;
  }

  /* ── Render painel de controle ── */
  function _renderControle () {
    var wrap = sid('ctrlListWrap');
    if (!wrap) return;
    if (!_lista.length) {
      wrap.innerHTML = '<div class="usuVazio">👤 Nenhum usuário cadastrado ainda.</div>';
      return;
    }
    wrap.innerHTML = _lista.map(function(u){
      var roles  = Array.isArray(u.roles) && u.roles.length ? u.roles : (u.role ? [u.role] : ['recepcionista']);
      var ativo  = u.ativo !== false;
      var badges = roles.map(function(r){
        var rInfo = ROLES[r] || { label: r, cls: 'roleBadgeAdmin' };
        return '<span class="roleBadge ' + rInfo.cls + '" style="font-size:.68rem">' + rInfo.label + '</span>';
      }).join(' ');
      var checkboxes = Object.entries(ROLES).map(function(e){
        var checked = roles.indexOf(e[0]) >= 0 ? ' checked' : '';
        return '<label class="ctrlCheck">'
          + '<input type="checkbox" value="' + e[0] + '"' + checked
          + ' onchange="UsuariosMod.mudarRoles(\'' + u.id + '\',this)">'
          + '<span class="roleBadge ' + e[1].cls + '" style="font-size:.68rem">' + e[1].label + '</span>'
          + '</label>';
      }).join('');
      return '<div class="ctrlRow' + (ativo ? '' : ' ctrlRowInativo') + '">'
        + '<div class="ctrlRowInfo">'
        +   '<div class="ctrlRowNome">' + esc(u.nome || u.email || '—') + '</div>'
        +   '<div class="ctrlRowEmail">' + esc(u.email || '') + '</div>'
        +   '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">' + badges + '</div>'
        + '</div>'
        + '<div class="ctrlRowSel" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">'
        +   checkboxes
        + '</div>'
        + '<div class="ctrlRowAcoes">'
        +   (ativo
              ? '<button class="btn usuBtnDesativar" title="Desativar usuário" onclick="UsuariosMod.toggleAtivo(\'' + u.id + '\',false)">🚫</button>'
              : '<button class="btn bG" title="Reativar usuário" onclick="UsuariosMod.toggleAtivo(\'' + u.id + '\',true)">✅</button>')
        + '</div>'
        + '</div>';
    }).join('');
  }

  /* ── Mudar perfis de acesso (multi-role) ── */
  async function mudarRoles (id, checkbox) {
    var u = _lista.find(function(x){ return String(x.id)===String(id); });
    if (!u) return;

    var roles = Array.isArray(u.roles) && u.roles.length ? u.roles.slice() : (u.role ? [u.role] : []);
    var val = checkbox.value;
    if (checkbox.checked) {
      if (roles.indexOf(val) < 0) roles.push(val);
    } else {
      roles = roles.filter(function(r){ return r !== val; });
      if (!roles.length) { toast('O usuário deve ter ao menos um perfil.','warn'); checkbox.checked=true; return; }
    }

    var primaryRole = _rolePrimario(roles);
    var r = await _sb.from('perfis_usuarios').update({ role: primaryRole, roles: roles }).eq('id', id);
    if (r.error) { toast('Erro: ' + r.error.message, 'error'); checkbox.checked = !checkbox.checked; return; }

    u.role = primaryRole;
    u.roles = roles;
    _renderControle();
    _render();
    toast('✅ Perfis atualizados.', 'success');
  }

  /* mantido por compatibilidade com código legado */
  async function mudarRole (id, novoRole) {
    await mudarRoles(id, { value: novoRole, checked: true });
  }

  return {
    init, initControle, abrirNovo, editar, fecharModal, salvar,
    toggleAtivo, onRoleChange, onEspChange, mudarRole, mudarRoles,
    canAccess, ROLE_MODULES
  };
})();
