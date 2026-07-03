/* ═══════════════════════════════════════════════════════════════════════
   PAINEL DE CONTROLE CLÍNICO — js/modules/agenda.js
   Agenda legacy + AgendaMod (Supabase-based)
   Depende de: supabase.js, main.js (sid, esc, toast, fmt, pad, brl, CU, ldC, svC...)
═══════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════ */
function getAgHours(){
  const cfg=ldC();
  const st=parseInt(cfg.start)||7;
  const en=parseInt(cfg.end)||18;
  const hours=[];
  for(let h=st;h<en;h++) hours.push(pad(h));
  return hours;
}

function loadAgConfig(){
  const cfg=ldC();
  const sv=String(parseInt(cfg.start)||7);
  const ev=String(parseInt(cfg.end)||18);
  const ss=sid('agStart'); if(ss) ss.value=sv;
  const es=sid('agEnd'); if(es) es.value=ev;
  updateAgHint(parseInt(sv),parseInt(ev));
}

function saveAgConfig(){
  const sv=parseInt(sid('agStart').value)||7;
  const ev=parseInt(sid('agEnd').value)||18;
  if(sv>=ev-1){toast('O horário de fim deve ser pelo menos 2h após o início.','err');loadAgConfig();return;}
  svC({start:sv,end:ev});
  updateAgHint(sv,ev);
  populateFormHours();
  renderAgenda();
}

function updateAgHint(s,e){
  const n=e-s;
  const hint=sid('agCfgHint');
  if(hint) hint.textContent=`— ${n} hora${n!==1?'s':''}/dia`;
}

function setAgFilter(f){
  _agFilter=f;
  const map={all:'afAll',s1:'afS1',s2:'afS2',s3:'afS3'};
  Object.entries(map).forEach(([k,id])=>{const el=sid(id);if(el)el.classList.toggle('active',k===f);});
  renderAgenda();
}
function renderAgenda(){
  const agData=ldA();
  const gc=sid('gcGrid');
  if(!gc) return;
  const hours=getAgHours();
  const isSingle=_agFilter!=='all';
  const sIdx=isSingle?parseInt(_agFilter[1]):null;
  const sC={1:'gcSO1',2:'gcSO2',3:'gcSO3'};
  let h='<table class="gcTable"><thead><tr><th class="gcTh" style="width:70px;min-width:70px">Hora</th>';
  AG_DAYS.forEach((d,i)=>{
    h+=`<th class="gcTh">${AG_LABELS[i]}`;
    if(!isSingle) h+='<div class="gcThSub"><span class="gcThSubLabel gcSub1">S1</span><span class="gcThSubLabel gcSub2">S2</span><span class="gcThSubLabel gcSub3">S3</span></div>';
    h+='</th>';
  });
  h+='</tr></thead><tbody>';
  hours.forEach(hr=>{
    h+=`<tr class="gcHourRow"><td class="gcTimeCell">${hr}:00</td>`;
    AG_DAYS.forEach(d=>{
      const key=`${d}-${hr}`;
      const cd=agData[key]||{};
      if(!isSingle){
        h+='<td class="gcDayGroup"><div class="gcDayCellWrap">';
        [1,2,3].forEach(n=>{
          const rm=cd['s'+n]||{proc:null,bloq:false,prof:'',esp:''};
          if(rm.bloq){
            h+=`<div class="gcSubCell gcSubBloq" onclick="openAgCell('${key}')" title="Bloqueada"><span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:.8rem">🔒</span></div>`;
          } else if(rm.proc||rm.prof){
            h+=`<div class="gcSubCell gcSubOcc${n}" onclick="openAgCell('${key}')" title="Clique para editar"><div class="gcEvtProc">${esc(rm.proc||rm.prof||'')}</div>${(rm.prof&&rm.proc)?`<div class="gcEvtProf">${esc(rm.prof)}</div>`:''}</div>`;
          } else {
            h+=`<div class="gcSubCell gcSubFree" onclick="openAgCell('${key}')" title="Sala ${n} — clique para agendar"><span class="gcSubPlus">+</span></div>`;
          }
        });
        h+='</div></td>';
      } else {
        const rm=cd['s'+sIdx]||{proc:null,bloq:false,prof:'',esp:''};
        if(rm.bloq){
          h+=`<td class="gcDayGroup"><div class="gcSingleCell gcSBloq" onclick="openAgCell('${key}')"><span style="font-size:.75rem;color:var(--s5)">🔒 Bloqueada</span></div></td>`;
        } else if(rm.proc||rm.prof){
          h+=`<td class="gcDayGroup"><div class="gcSingleCell ${sC[sIdx]||'gcSO1'}" onclick="openAgCell('${key}')"><div class="gcSEvt">${rm.proc?`<div class="gcSEvtProc">${esc(rm.proc)}</div>`:''}${rm.prof?`<div class="gcSEvtProf">👤 ${esc(rm.prof)}</div>`:''}${rm.esp?`<div class="gcSEvtEsp">🏥 ${esc(rm.esp)}</div>`:''}</div></div></td>`;
        } else {
          h+=`<td class="gcDayGroup"><div class="gcSingleCell gcSF" onclick="openAgCell('${key}')"><span class="gcSFPlus">+</span><div class="gcSEvt"><div class="gcSEvtProc" style="color:var(--s3)">Livre</div></div></div></td>`;
        }
      }
    });
    h+='</tr>';
  });
  h+='</tbody></table>';
  gc.innerHTML=h;
}

/* ══════════════════════════════════════
   AGENDA — MODAL
══════════════════════════════════════ */
let _agKey=null;

function openAgCell(key){
  _agKey=key;
  const [day,hour]=key.split('-');
  sid('agMTitle').textContent=`${AG_LABELS[AG_DAYS.indexOf(day)]} — ${hour}:00 às ${pad(parseInt(hour)+1)}:00`;

  const cd=(ldA()[key])||{};
  [1,2,3].forEach(i=>{
    const rm=cd['s'+i]||{proc:null,bloq:false,prof:'',esp:''};
    const procInp=sid('agProc'+i);
    procInp.value=rm.proc||''; procInp.disabled=rm.bloq;
    const profInp=sid('agProf'+i);
    profInp.value=rm.prof||''; profInp.disabled=rm.bloq;
    const espInp=sid('agEsp'+i);
    if(espInp){espInp.value=rm.esp||''; espInp.disabled=rm.bloq;}
    const chk=sid('agBloq'+i);
    chk.checked=rm.bloq;
    const row=sid('agRoom'+i);
    rm.bloq?row.classList.add('bloqActive'):row.classList.remove('bloqActive');
  });

  sid('agOvl').classList.add('open');
}

function toggleBloq(i){
  const bloq=sid('agBloq'+i).checked;
  const row=sid('agRoom'+i);
  ['agProc','agProf','agEsp'].forEach(pfx=>{
    const el=sid(pfx+i);
    if(!el) return;
    el.disabled=bloq;
    if(bloq) el.value='';
  });
  bloq?row.classList.add('bloqActive'):row.classList.remove('bloqActive');
}

function saveAgCell(){
  if(!_agKey)return;
  const agData=ldA();
  const cd={};
  [1,2,3].forEach(i=>{
    const bloq=sid('agBloq'+i).checked;
    const proc=bloq?null:(sid('agProc'+i).value.trim()||null);
    const prof=bloq?'':(sid('agProf'+i).value.trim());
    const espEl=sid('agEsp'+i);
    const esp=bloq?'':(espEl?espEl.value.trim():'');
    cd['s'+i]={proc,bloq,prof,esp};
  });
  const empty=[1,2,3].every(i=>!cd['s'+i].proc&&!cd['s'+i].bloq&&!cd['s'+i].prof&&!cd['s'+i].esp);
  if(empty) delete agData[_agKey];
  else agData[_agKey]=cd;
  if(svA(agData)){renderAgenda();closeAgModal();toast('✅ Horário salvo!','');}
}

function closeAgModal(){sid('agOvl').classList.remove('open');_agKey=null;}
document.getElementById('agOvl').addEventListener('click',e=>{if(e.target===e.currentTarget)closeAgModal();});

const AgendaMod = (function () {
  var _dataRef       = new Date();
  var _view          = 'semana';
  var _agendamentos  = [];
  var _salas         = [];
  var _procedimentos = [];
  var _profissionais = [];
  var _filtroProf    = '';
  var _filtroSala    = '';
  var _editandoId    = null;
  var _convenios     = [];
  var _relogioTimer  = null;
  var _inicializado  = false;

  var H_INI   = 7;
  var H_FIM   = 21;
  var SLOT    = 30;
  var SLOT_PX = 54;
  var N_SLOTS = ((H_FIM - H_INI) * 60) / SLOT;
  var Q = "'";

  var DIAS_PT   = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  var DIAS_EXT  = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
  var MESES     = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  var MESES_EXT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  /* ── Init ── */
  function _dbg (msg) {
    var lo = sid('agLoading');
    if (lo) lo.innerHTML = '⏳ ' + msg;
  }

  async function init () {
    _dbg('init() chamado');
    if (!_sb) {
      _dbg('ERRO: _sb não definido');
      console.error('[AgendaMod] _sb não definido'); return;
    }
    _dbg('_sb ok, verificando inicializado...');
    if (_inicializado) {
      try { await _carregarAgendamentos(); } catch(e){ console.error('[AgendaMod] reload',e); }
      render(); return;
    }
    _inicializado = true;
    var lo = sid('agLoading'), gr = sid('agGrade');
    if (lo) lo.style.display = 'block';
    if (gr) gr.style.display = 'none';
    try {
      _dbg('carregando salas/proc/profs...');
      var _timeout = new Promise(function(_, rej){ setTimeout(function(){ rej(new Error('Timeout: Supabase nao respondeu em 8s')); }, 8000); });
      await Promise.race([Promise.all([_carregarSalas(), _carregarProcedimentos(), _carregarProfissionais(), _carregarConvenios()]), _timeout]);
      _dbg('filtros e role...');
      _popularFiltros();
      _ajustarRole();
      _dataRef = _view === 'semana' ? _inicioSemana(new Date()) : _zerarHora(new Date());
      _dbg('carregando agendamentos...');
      await Promise.race([_carregarAgendamentos(), new Promise(function(_, rej){ setTimeout(function(){ rej(new Error('Timeout agendamentos')); }, 8000); })]);
      _dbg('chamando render()...');
    } catch(e) {
      console.error('[AgendaMod] init error', e);
      if (lo) lo.style.display = 'none';
      if (gr) { gr.style.display = 'flex'; gr.innerHTML = '<div style="padding:24px;color:var(--r6)">Erro ao carregar agenda: ' + (e && e.message ? e.message : String(e)) + '</div>'; }
      _inicializado = false;
      return;
    }
    render();
    _iniciarRelogio();
  }

  /* ── Supabase ── */
  async function _carregarSalas () {
    var r = await _sb.from('salas').select('*').eq('ativa', true).eq('unidade_id', CU).order('nome');
    _salas = r.data || [];
  }
  async function _carregarProcedimentos () {
    var r = await _sb.from('procedimentos').select('*').eq('ativo', true).order('nome');
    _procedimentos = r.data || [];
  }
  async function _carregarProfissionais () {
    var r = await _sb.from('perfis_usuarios')
      .select('id,nome,especialidade,role,roles')
      .eq('ativo', true).order('nome');
    /* Filtro client-side: inclui apenas profissionais de saúde
       (role primário = profissional_saude OU roles array contém profissional_saude) */
    _profissionais = (r.data || []).filter(function (p) {
      if (p.role === 'profissional_saude') return true;
      if (Array.isArray(p.roles) && p.roles.indexOf('profissional_saude') >= 0) return true;
      return false;
    });
  }
  async function _carregarConvenios () {
    var r = await _sb.from('convenios').select('id,nome').eq('ativo', true).order('nome');
    _convenios = r.data || [];
  }

  function _popularConvenioSelect (selectedId) {
    var el = sid('agConvenioId'); if (!el) return;
    el.innerHTML = '<option value="">— Selecione o convênio —</option>'
      + _convenios.map(function (c) {
          return '<option value="' + c.id + '"' + (c.id == selectedId ? ' selected' : '') + '>' + esc(c.nome) + '</option>';
        }).join('');
  }

  function onFormaPgtoChange () {
    var forma = ((sid('agFormaPgto') || {}).value) || '';
    var wrap  = sid('agConvenioWrap');
    if (wrap) wrap.style.display = forma === 'CONVENIO' ? 'block' : 'none';
  }

  async function _carregarAgendamentos () {
    var ini, fim;
    if (_view === 'mes') {
      ini = _fmtDate(new Date(_dataRef.getFullYear(), _dataRef.getMonth(), 1));
      fim = _fmtDate(new Date(_dataRef.getFullYear(), _dataRef.getMonth() + 1, 0));
    } else if (_view === 'semana') {
      ini = _fmtDate(_dataRef);
      fim = _fmtDate(new Date(_dataRef.getTime() + 6 * 864e5));
    } else {
      ini = _fmtDate(_dataRef);
      fim = ini;
    }
    var r = await _sb.from('agendamentos')
      .select(`*, pacientes(nome_completo,cpf), profissional:perfis_usuarios!agendamentos_profissional_id_fkey(nome,especialidade), sala:salas!agendamentos_sala_id_fkey(nome), procedimento:procedimentos!agendamentos_procedimento_id_fkey(nome,cor_hex,duracao_min)`)
      .eq('unidade_id', CU)   /* Isolamento multi-tenant */
      .gte('data_agendamento', ini).lte('data_agendamento', fim).order('hora_inicio');
    if (r.error) {
      console.warn('[AgendaMod] join falhou, tentando select simples:', r.error.message);
      var r2 = await _sb.from('agendamentos').select('*').eq('unidade_id', CU).gte('data_agendamento', ini).lte('data_agendamento', fim).order('hora_inicio');
      if (r2.error) { console.error('[AgendaMod] agendamentos error', r2.error); _agendamentos = []; return; }
      _agendamentos = r2.data || [];
      return;
    }
    _agendamentos = r.data || [];
  }

  /* ── Navegação ── */
  async function navData (delta) {
    if (_view === 'mes') {
      _dataRef = new Date(_dataRef.getFullYear(), _dataRef.getMonth() + delta, 1);
    } else if (_view === 'semana') {
      _dataRef = new Date(_dataRef.getTime() + delta * 7 * 864e5);
    } else {
      _dataRef = new Date(_dataRef.getTime() + delta * 864e5);
    }
    await _carregarAgendamentos(); render();
  }
  async function irHoje () {
    if (_view === 'mes') {
      _dataRef = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    } else if (_view === 'semana') {
      _dataRef = _inicioSemana(new Date());
    } else {
      _dataRef = _zerarHora(new Date());
    }
    await _carregarAgendamentos(); render();
  }
  async function setView (v) {
    _view = v;
    ['agVwHoje','agVwSemana','agVwMes','agVwDia'].forEach(function (id) {
      var el = sid(id);
      if (el) el.classList.toggle('active',
        (id === 'agVwHoje'   && v === 'hoje')   ||
        (id === 'agVwSemana' && v === 'semana') ||
        (id === 'agVwMes'    && v === 'mes')    ||
        (id === 'agVwDia'    && v === 'dia')
      );
    });
    if (v === 'semana') _dataRef = _inicioSemana(_dataRef);
    else if (v === 'hoje') _dataRef = _zerarHora(new Date());
    else if (v === 'mes') _dataRef = new Date(_dataRef.getFullYear(), _dataRef.getMonth(), 1);
    await _carregarAgendamentos(); render();
  }

  /* ── Filtros ── */
  function filtrar () {
    _filtroProf = (sid('agFiltroProf') || {}).value || '';
    _filtroSala = (sid('agFiltroSala') || {}).value || '';
    render();
  }
  function _popularFiltros () {
    var sp = sid('agFiltroProf'), ss = sid('agFiltroSala');
    if (!sp || !ss) return;
    sp.innerHTML = '<option value="">&#128100; Todos os profissionais</option>' +
      _profissionais.map(function (p) {
        return '<option value="' + p.id + '">' + p.nome + (p.especialidade ? ' – ' + p.especialidade : '') + '</option>';
      }).join('');
    ss.innerHTML = '<option value="">&#128682; Todas as salas</option>' +
      _salas.map(function (s) { return '<option value="' + s.id + '">' + s.nome + '</option>'; }).join('');
  }
  function _ajustarRole () {
    if (USER_ROLE === 'profissional_saude' && USER_PROFILE) {
      var sel = sid('agFiltroProf');
      if (sel) { sel.value = USER_PROFILE.id; _filtroProf = USER_PROFILE.id; }
    }
  }

  /* ── Render principal ── */
  function render () {
    if (_view === 'mes') { _renderMes(); return; }
    var grade = sid('agGrade'), loading = sid('agLoading');
    if (!grade) return;
    grade.style.display = 'flex';
    if (loading) loading.style.display = 'none';
    _atualizarTitulo();
    var hoje = _fmtDate(new Date());
    var colunas = _buildColunas(hoje);
    var html = '';

    /* Cabeçalho */
    html += '<div class="agGradeHdr"><div class="agGradeHdrTime"></div>';
    colunas.forEach(function (col) {
      if (col.vazio) { html += '<div class="agGradeHdrCol"></div>'; return; }
      html += '<div class="agGradeHdrCol' + (col.isHoje ? ' hoje' : '') + '">' +
              '<span class="agDiaLabel">' + col.label + '</span>' +
              '<span class="agDiaNum">' + col.sublabel + '</span>' +
              (col.extra ? '<div style="font-size:.66rem;color:var(--s4)">' + col.extra + '</div>' : '') +
              '</div>';
    });
    html += '</div>';

    /* Corpo */
    html += '<div class="agGradeBody">';

    /* Coluna de horas */
    html += '<div class="agGradeTimeCol">';
    for (var s = 0; s < N_SLOTS; s++) {
      var mins = H_INI * 60 + s * SLOT;
      var hh = String(Math.floor(mins / 60)).padStart(2, '0');
      var mm = String(mins % 60).padStart(2, '0');
      html += '<div class="agTimeSlot">' + (s % 2 === 0 ? hh + ':' + mm : '') + '</div>';
    }
    html += '</div>';

    /* Colunas de dias/profissionais */
    html += '<div class="agGradeCols">';
    colunas.forEach(function (col) {
      if (col.vazio) {
        html += '<div class="agGradeCol" style="display:flex;align-items:center;justify-content:center;color:var(--s4);font-size:.84rem;flex:1">Nenhum profissional encontrado</div>';
        return;
      }
      var colId = col.id.replace(/[^a-zA-Z0-9_]/g, '_');
      html += '<div class="agGradeCol" id="agCol_' + colId + '">';

      /* Slots — usa data-attrs para evitar aspas aninhadas */
      for (var s2 = 0; s2 < N_SLOTS; s2++) {
        var m2 = H_INI * 60 + s2 * SLOT;
        var h2 = String(Math.floor(m2 / 60)).padStart(2, '0');
        var m2s = String(m2 % 60).padStart(2, '0');
        var slotCls = s2 % 2 === 0 ? 'agSlot agSlotHora' : 'agSlot agSlotMeia';
        html += '<div class="' + slotCls + '" ' +
                'data-data="' + col.data + '" ' +
                'data-hora="' + h2 + ':' + m2s + '" ' +
                'data-prof="' + (col.profId || '') + '" ' +
                'onclick="AgendaMod.slotClick(this)"></div>';
      }

      /* Linha de hora atual */
      if (col.isHoje) {
        var nowD = new Date();
        var nowMins = nowD.getHours() * 60 + nowD.getMinutes();
        if (nowMins >= H_INI * 60 && nowMins <= H_FIM * 60) {
          var topPx2 = ((nowMins - H_INI * 60) / SLOT) * SLOT_PX;
          html += '<div class="agHoraAtual" id="agHora_' + colId + '" style="top:' + topPx2 + 'px"></div>';
        }
      }

      /* Cards de eventos */
      _eventosColuna(col).forEach(function (ag) { html += _renderCard(ag); });
      html += '</div>';
    });
    html += '</div></div>';

    grade.innerHTML = html;

    /* Scroll para hora atual */
    var body = grade.querySelector('.agGradeBody');
    if (body) {
      var now2 = new Date();
      var nm = Math.max(now2.getHours() * 60 + now2.getMinutes() - 90, H_INI * 60);
      body.scrollTop = ((nm - H_INI * 60) / SLOT) * SLOT_PX;
    }
  }

  function _buildColunas (hoje) {
    if (_view === 'semana') {
      var cols = [];
      for (var i = 0; i < 7; i++) {
        var d = new Date(_dataRef.getTime() + i * 864e5);
        cols.push({ id: _fmtDate(d), label: DIAS_PT[d.getDay()], sublabel: d.getDate(), extra: '', data: _fmtDate(d), isHoje: _fmtDate(d) === hoje });
      }
      return cols;
    } else if (_view === 'hoje') {
      var hj = _zerarHora(new Date());
      return [{ id: hoje, label: DIAS_EXT[hj.getDay()], sublabel: hj.getDate() + ' ' + MESES[hj.getMonth()], extra: '', data: hoje, isHoje: true }];
    } else {
      var profs = _profissionais.slice();
      if (_filtroProf) profs = profs.filter(function (p) { return p.id === _filtroProf; });
      if (!profs.length) return [{ vazio: true }];
      return profs.map(function (p) {
        return { id: p.id, label: p.nome.split(' ').slice(0, 2).join(' '), sublabel: p.especialidade || '', extra: '', data: _fmtDate(_dataRef), profId: p.id, isHoje: _fmtDate(_dataRef) === hoje };
      });
    }
  }

  /* ── Render Mês ── */
  function _renderMes () {
    var grade = sid('agGrade'), loading = sid('agLoading');
    if (!grade) return;
    grade.style.display = 'flex';
    grade.style.flexDirection = 'column';
    if (loading) loading.style.display = 'none';
    _atualizarTitulo();

    var hoje    = _fmtDate(new Date());
    var ano     = _dataRef.getFullYear();
    var mes     = _dataRef.getMonth();
    var primDia = new Date(ano, mes, 1);
    var ultDia  = new Date(ano, mes + 1, 0);
    var totalDias = ultDia.getDate();
    var iniciaSem = primDia.getDay();

    var html = '<div class="agMesWrap">';
    html += '<div class="agMesHdr">';
    DIAS_PT.forEach(function (d) { html += '<div class="agMesHdrCell">' + d + '</div>'; });
    html += '</div><div class="agMesCells">';

    for (var b = 0; b < iniciaSem; b++) html += '<div class="agMesCell agMesCellFora"></div>';

    for (var d2 = 1; d2 <= totalDias; d2++) {
      var ds = ano + '-' + String(mes + 1).padStart(2, '0') + '-' + String(d2).padStart(2, '0');
      var isHj = ds === hoje;
      var ags = _agendamentos.filter(function (ag) {
        if (ag.data_agendamento !== ds) return false;
        if (_filtroProf && ag.profissional_id !== _filtroProf) return false;
        if (_filtroSala && ag.sala_id !== _filtroSala) return false;
        return true;
      });

      html += '<div class="agMesCell' + (isHj ? ' agMesCellHoje' : '') + '" onclick="AgendaMod.mesDiaClick(\'' + ds + '\')">';
      html += '<div class="agMesDiaNum' + (isHj ? ' agMesDiaHoje' : '') + '">' + d2 + '</div>';

      var shown = ags.slice(0, 3);
      shown.forEach(function (ag) {
        var cor  = (ag.procedimento && ag.procedimento.cor_hex) ? ag.procedimento.cor_hex : '#3b82f6';
        var nome = ag.pacientes ? ag.pacientes.nome_completo.split(' ')[0] : '—';
        var hora = ag.hora_inicio.substring(0, 5);
        html += '<div class="agMesEvt" style="background:' + cor + '" title="' + esc(nome) + '">' + hora + ' ' + esc(nome) + '</div>';
      });
      if (ags.length > 3) html += '<div class="agMesMais">+' + (ags.length - 3) + ' mais</div>';
      html += '</div>';
    }

    var total = iniciaSem + totalDias;
    var resto = Math.ceil(total / 7) * 7 - total;
    for (var e = 0; e < resto; e++) html += '<div class="agMesCell agMesCellFora"></div>';

    html += '</div></div>';
    grade.innerHTML = html;
  }

  function mesDiaClick (ds) {
    _view = 'semana';
    _dataRef = _inicioSemana(new Date(ds + 'T00:00:00'));
    ['agVwHoje','agVwSemana','agVwMes','agVwDia'].forEach(function (id) {
      var el = sid(id); if (el) el.classList.toggle('active', id === 'agVwSemana');
    });
    _carregarAgendamentos().then(function () { render(); });
  }

  function _eventosColuna (col) {
    return _agendamentos.filter(function (ag) {
      if (_view === 'semana') {
        if (ag.data_agendamento !== col.data) return false;
        if (_filtroProf && ag.profissional_id !== _filtroProf) return false;
      } else {
        if (ag.data_agendamento !== col.data) return false;
        if (ag.profissional_id !== col.profId) return false;
      }
      if (_filtroSala && ag.sala_id !== _filtroSala) return false;
      return true;
    });
  }

  /* Card — usa data-agid e cardClick para evitar aspas aninhadas */
  function _renderCard (ag) {
    var cor = (ag.procedimento && ag.procedimento.cor_hex) ? ag.procedimento.cor_hex : '#3b82f6';
    var topPx = _horaToPx(ag.hora_inicio);
    var hgt = Math.max(_horaToPx(ag.hora_fim) - topPx, 22);
    var nome = ag.pacientes ? ag.pacientes.nome_completo.split(' ').slice(0, 2).join(' ') : '—';
    var proc = ag.procedimento ? ag.procedimento.nome : '';
    var sala = ag.sala ? ag.sala.nome : '';
    var hi = ag.hora_inicio.substring(0, 5), hf = ag.hora_fim.substring(0, 5);
    return '<div class="agCard"' +
      ' style="top:' + topPx + 'px;height:' + hgt + 'px;background:' + cor + '"' +
      ' data-agid="' + ag.id + '"' +
      ' onclick="event.stopPropagation();AgendaMod.cardClick(this)"' +
      ' title="' + esc(nome) + ' | ' + esc(proc) + ' | ' + hi + '-' + hf + '">' +
      '<div class="agCardStatusDot" data-s="' + ag.status + '"></div>' +
      '<div class="agCardNome">' + esc(nome) + '</div>' +
      (hgt > 40 ? '<div class="agCardProc">' + esc(proc) + '</div>' : '') +
      (hgt > 56 ? '<div class="agCardSala">' + esc(sala) + '</div>' : '') +
      (hgt > 70 ? '<div class="agCardHora">' + hi + ' – ' + hf + '</div>' : '') +
      '</div>';
  }

  /* ── Handlers de clique (via data-attrs) ── */
  function slotClick (el) {
    var data = el.getAttribute('data-data') || '';
    var hora = el.getAttribute('data-hora') || '';
    var prof = el.getAttribute('data-prof') || '';
    abrirModalNovo(data, hora, '', prof);
  }
  function cardClick (el) {
    var id = el.getAttribute('data-agid') || '';
    if (id) abrirModalEditar(id);
  }

  /* ── Modal: novo ── */
  function abrirModalNovo (data, hora, salaId, profId) {
    _editandoId = null;
    var mt = sid('agModalTitulo'); if (mt) mt.textContent = 'Novo Agendamento';
    var bd = sid('agBtnDel'); if (bd) bd.style.display = 'none';
    var cf = sid('agConflito'); if (cf) cf.style.display = 'none';
    _popularSelects(); _habilitarCampos(true);
    var el;
    el = sid('agData');       if (el) el.value = data || _fmtDate(_dataRef);
    el = sid('agHoraInicio'); if (el) el.value = hora || '08:00';
    el = sid('agHoraFim');    if (el) el.value = hora ? _somarMin(hora, 30) : '08:30';
    el = sid('agStatus');     if (el) el.value = 'Agendado';
    el = sid('agPacBusca');   if (el) el.value = '';
    el = sid('agPacId');      if (el) el.value = '';
    el = sid('agObs');        if (el) el.value = '';
    el = sid('agPacResultados'); if (el) el.style.display = 'none';
    if (salaId) { el = sid('agSalaId'); if (el) el.value = salaId; }
    if (profId) { el = sid('agProfId'); if (el) el.value = profId; }
    if (_filtroProf && !profId) { el = sid('agProfId'); if (el) el.value = _filtroProf; }
    if (_filtroSala && !salaId) { el = sid('agSalaId'); if (el) el.value = _filtroSala; }
    if (USER_ROLE === 'profissional_saude' && USER_PROFILE) { el = sid('agProfId'); if (el) el.value = USER_PROFILE.id; }
    _popularConvenioSelect(null);
    el = sid('agFormaPgto');  if (el) el.value = '';
    el = sid('agConvenioId'); if (el) el.value = '';
    el = sid('agNumGuia');    if (el) el.value = '';
    el = sid('agValorCob');   if (el) el.value = '';
    onFormaPgtoChange();
    el = sid('modalAgendamento'); if (el) el.style.display = 'flex';
  }

  /* ── Modal: editar ── */
  async function abrirModalEditar (id) {
    var ag = _agendamentos.find(function (a) { return a.id === id; });
    if (!ag) return;
    _editandoId = id;
    var mt = sid('agModalTitulo'); if (mt) mt.textContent = 'Editar Agendamento';
    var cf = sid('agConflito'); if (cf) cf.style.display = 'none';
    var bd = sid('agBtnDel'); if (bd) bd.style.display = USER_ROLE === 'administrador' ? 'inline-flex' : 'none';
    _popularSelects(); _habilitarCampos(true);
    var el;
    el = sid('agData');       if (el) el.value = ag.data_agendamento;
    el = sid('agHoraInicio'); if (el) el.value = ag.hora_inicio.substring(0, 5);
    el = sid('agHoraFim');    if (el) el.value = ag.hora_fim.substring(0, 5);
    el = sid('agStatus');     if (el) el.value = ag.status;
    el = sid('agObs');        if (el) el.value = ag.observacoes || '';
    el = sid('agPacId');      if (el) el.value = ag.paciente_id || '';
    el = sid('agPacBusca');   if (el) el.value = ag.pacientes ? ag.pacientes.nome_completo : '';
    el = sid('agPacResultados'); if (el) el.style.display = 'none';
    await new Promise(function (r) { setTimeout(r, 0); });
    el = sid('agProfId'); if (el) el.value = ag.profissional_id || '';
    el = sid('agSalaId'); if (el) el.value = ag.sala_id || '';
    el = sid('agProcId'); if (el) el.value = ag.procedimento_id || '';
    if (USER_ROLE === 'profissional_saude') _habilitarCampos(false, ['agStatus', 'agObs']);
    _popularConvenioSelect(ag.convenio_id);
    el = sid('agFormaPgto');  if (el) el.value = ag.forma_pagamento  || '';
    el = sid('agConvenioId'); if (el) el.value = ag.convenio_id       || '';
    el = sid('agNumGuia');    if (el) el.value = ag.numero_guia       || '';
    el = sid('agValorCob');   if (el) el.value = ag.valor_cobrado     || '';
    onFormaPgtoChange();
    aoSelecionarProcedimento(); /* auto-preenche valor se vazio */
    el = sid('modalAgendamento'); if (el) el.style.display = 'flex';
  }

  function fecharModal () {
    var el = sid('modalAgendamento'); if (el) el.style.display = 'none';
    _habilitarCampos(true); _editandoId = null;
    el = sid('agPacResultados'); if (el) el.style.display = 'none';
  }

  function _popularSelects () {
    var sp = sid('agProfId'), ss = sid('agSalaId'), sc = sid('agProcId');
    if (sp) sp.innerHTML = '<option value="">Selecione...</option>' +
      _profissionais.map(function (p) { return '<option value="' + p.id + '">' + p.nome + (p.especialidade ? ' – ' + p.especialidade : '') + '</option>'; }).join('');
    if (ss) ss.innerHTML = '<option value="">Selecione...</option>' +
      _salas.map(function (s) { return '<option value="' + s.id + '">' + s.nome + '</option>'; }).join('');
    if (sc) sc.innerHTML = '<option value="">Selecione...</option>' +
      _procedimentos.map(function (p) { return '<option value="' + p.id + '" data-dur="' + (p.duracao_min || 30) + '">' + p.nome + '</option>'; }).join('');
  }

  function _habilitarCampos (hab, excluir) {
    ['agPacBusca','agProfId','agSalaId','agProcId','agData','agHoraInicio','agHoraFim','agStatus','agObs','agFormaPgto','agConvenioId','agNumGuia','agValorCob'].forEach(function (id) {
      var el = sid(id); if (!el) return;
      el.disabled = !hab;
    });
    if (!hab && excluir) excluir.forEach(function (id) { var el = sid(id); if (el) el.disabled = false; });
  }

  /* ── Busca de paciente ── */
  async function buscarPaciente (termo) {
    var pi = sid('agPacId'); if (pi) pi.value = '';
    var drop = sid('agPacResultados'); if (!drop) return;
    if (!termo || termo.length < 2) { drop.style.display = 'none'; return; }
    var r = await _sb.from('pacientes').select('id,nome_completo,cpf').eq('ativo', true)
      .or('nome_completo.ilike.%' + termo + '%,cpf.ilike.%' + termo + '%').limit(8);
    var data = r.data || [];
    if (!data.length) {
      drop.innerHTML = '<div class="agPacItem" style="color:var(--s4);cursor:default">Nenhum paciente encontrado</div>';
    } else {
      drop.innerHTML = data.map(function (p) {
        return '<div class="agPacItem" data-id="' + p.id + '" data-nome="' + p.nome_completo.replace(/"/g,'&quot;') + '" data-cpf="' + p.cpf + '" onclick="AgendaMod.pacItemClick(this)">' +
               '<strong>' + esc(p.nome_completo) + '</strong><small>CPF: ' + p.cpf + '</small></div>';
      }).join('');
    }
    drop.style.display = 'block';
  }

  function pacItemClick (el) {
    var id   = el.getAttribute('data-id')   || '';
    var nome = el.getAttribute('data-nome') || '';
    var cpf  = el.getAttribute('data-cpf')  || '';
    selecionarPaciente(id, nome, cpf);
  }

  function selecionarPaciente (id, nome, cpf) {
    var pi = sid('agPacId'); if (pi) pi.value = id;
    var pb = sid('agPacBusca'); if (pb) pb.value = nome;
    var dr = sid('agPacResultados'); if (dr) dr.style.display = 'none';
  }

  function sugerirFim () {
    var hi = sid('agHoraInicio'); if (!hi || !hi.value) return;
    var pc = sid('agProcId');
    var dur = pc && pc.selectedOptions[0] ? (parseInt(pc.selectedOptions[0].dataset.dur, 10) || 30) : 30;
    var hf = sid('agHoraFim'); if (hf) hf.value = _somarMin(hi.value, dur);
  }
  function aoSelecionarProcedimento () {
    sugerirFim();
    var procEl = sid('agProcId');
    if (!procEl || !procEl.value) return;
    var proc = _procedimentos.find(function (p) { return String(p.id) === String(procEl.value); });
    if (!proc) return;
    var valEl = sid('agValorCob');
    if (valEl && (!valEl.value || parseFloat(valEl.value) === 0)) {
      valEl.value = proc.valor_padrao != null ? parseFloat(proc.valor_padrao).toFixed(2) : '';
    }
  }

  /* ── Validação de conflito ── */
  function _conflito (salaId, profId, data, hi, hf, excluirId) {
    var cs = _agendamentos.filter(function (ag) {
      if (ag.id === excluirId || ag.data_agendamento !== data) return false;
      if (!_sobrepoe(hi, hf, ag.hora_inicio, ag.hora_fim)) return false;
      return (salaId && ag.sala_id === salaId) || (profId && ag.profissional_id === profId);
    });
    if (!cs.length) return null;
    var c = cs[0];
    var pac = c.pacientes ? c.pacientes.nome_completo.split(' ')[0] : 'outro paciente';
    var tipo = (salaId && c.sala_id === salaId) ? 'sala' : 'profissional';
    return 'Conflito de ' + tipo + ': ' + pac + ' — ' + c.hora_inicio.substring(0, 5) + ' às ' + c.hora_fim.substring(0, 5);
  }
  function _sobrepoe (h1i, h1f, h2i, h2f) {
    return _tMin(h1i) < _tMin(h2f) && _tMin(h1f) > _tMin(h2i);
  }

  /* ── Salvar ── */
  async function salvarAgendamento () {
    var pacId  = (sid('agPacId')      || {}).value || '';
    var profId = (sid('agProfId')     || {}).value || '';
    var salaId = (sid('agSalaId')     || {}).value || '';
    var procId = (sid('agProcId')     || {}).value || '';
    var data   = (sid('agData')       || {}).value || '';
    var hi     = (sid('agHoraInicio') || {}).value || '';
    var hf     = (sid('agHoraFim')    || {}).value || '';
    var status = (sid('agStatus')     || {}).value || 'Agendado';
    var obs    = ((sid('agObs')       || {}).value || '').trim();

    if (!profId || !salaId || !procId || !data || !hi || !hf) {
      alert('Preencha: Profissional, Sala, Procedimento, Data e Horários.'); return;
    }
    if (!pacId && !_editandoId) { alert('Selecione um paciente.'); return; }
    if (hi >= hf) { alert('Hora de início deve ser menor que hora de fim.'); return; }

    var msg = _conflito(salaId, profId, data, hi, hf, _editandoId);
    if (msg) {
      var cm = sid('agConflitoMsg'); if (cm) cm.textContent = msg;
      var cb = sid('agConflito');    if (cb) cb.style.display = 'block';
      return;
    }
    var cb2 = sid('agConflito'); if (cb2) cb2.style.display = 'none';

    var formaPgto = ((sid('agFormaPgto')  || {}).value || '').trim() || null;
    var convId    = ((sid('agConvenioId') || {}).value || '').trim() || null;
    var numGuia   = ((sid('agNumGuia')    || {}).value || '').trim() || null;
    var valorCob  = parseFloat((sid('agValorCob') || {}).value) || null;

    var payload = {
      unidade_id: CU, sala_id: salaId || null, profissional_id: profId || null,
      procedimento_id: procId || null, data_agendamento: data,
      hora_inicio: hi, hora_fim: hf, status: status,
      observacoes: obs || null, atualizado_em: new Date().toISOString(),
      forma_pagamento: formaPgto,
      convenio_id:     convId ? parseInt(convId) : null,
      numero_guia:     numGuia,
      valor_cobrado:   valorCob
    };

    var error;
    if (_editandoId) {
      var upd = USER_ROLE === 'profissional_saude'
        ? { status: status, observacoes: obs || null, atualizado_em: payload.atualizado_em }
        : payload;
      var r1 = await _sb.from('agendamentos').update(upd).eq('id', _editandoId);
      error = r1.error;
    } else {
      payload.paciente_id = pacId || null;

      /* Verificar pendência de pagamento antes de inserir */
      if (pacId) {
        var hoje2 = (function () {
          var d = new Date();
          return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        })();
        var chkPend = await _sb.from('agendamentos')
          .select('id, recebimentos(id,status)')
          .eq('paciente_id', pacId)
          .eq('unidade_id', CU)
          .neq('status', 'Cancelado')
          .lt('data_agendamento', hoje2)
          .limit(30);
        if (!chkPend.error && chkPend.data) {
          var temPend = chkPend.data.some(function (ag) {
            return !ag.recebimentos || !ag.recebimentos.length ||
                   ag.recebimentos.every(function (r) { return r.status !== 'RECEBIDO'; });
          });
          if (temPend) {
            alert('⚠️ Paciente com pagamento pendente!\n\nEste paciente possui consultas anteriores sem pagamento confirmado.\nConfirme o pagamento na Recepção ou no módulo de Recebimentos antes de agendar.');
            return;
          }
        }
      }

      var su = await _sb.auth.getUser();
      payload.criado_por = su.data && su.data.user ? su.data.user.id : null;
      var r2 = await _sb.from('agendamentos').insert([payload]);
      error = r2.error;
    }
    if (error) { alert('Erro ao salvar: ' + error.message); return; }
    fecharModal();
    await _carregarAgendamentos();
    render();
    toast('Agendamento salvo!', '');
  }

  /* ── Excluir ── */
  async function excluirAgendamento () {
    if (USER_ROLE !== 'administrador') { alert('Sem permissão para excluir agendamentos.'); return; }
    if (!_editandoId) return;
    if (!confirm('Excluir este agendamento permanentemente?')) return;
    var r = await _sb.from('agendamentos').delete().eq('id', _editandoId);
    if (r.error) { alert('Erro ao excluir: ' + r.error.message); return; }
    fecharModal();
    await _carregarAgendamentos();
    render();
    toast('Agendamento excluído.', '');
  }

  /* ── Relógio ── */
  function _iniciarRelogio () {
    if (_relogioTimer) clearInterval(_relogioTimer);
    _relogioTimer = setInterval(function () {
      var now = new Date(), nm = now.getHours() * 60 + now.getMinutes();
      var tp = ((nm - H_INI * 60) / SLOT) * SLOT_PX;
      document.querySelectorAll('[id^="agHora_"]').forEach(function (el) { el.style.top = tp + 'px'; });
    }, 60000);
  }

  /* ── Utils ── */
  function _inicioSemana (d) { var r = new Date(d); r.setDate(r.getDate() - r.getDay()); return _zerarHora(r); }
  function _zerarHora (d) { var r = new Date(d); r.setHours(0, 0, 0, 0); return r; }
  function _fmtDate (d) {
    return d.getFullYear() + '-'
      + String(d.getMonth() + 1).padStart(2, '0') + '-'
      + String(d.getDate()).padStart(2, '0');
  }
  function _horaToPx (t) { var p = t.split(':').map(Number); return ((p[0] * 60 + p[1] - H_INI * 60) / SLOT) * SLOT_PX; }
  function _tMin (t) { var p = t.split(':').map(Number); return p[0] * 60 + (p[1] || 0); }
  function _somarMin (t, min) {
    var p = t.split(':').map(Number), tot = p[0] * 60 + p[1] + min;
    return String(Math.floor(tot / 60)).padStart(2, '0') + ':' + String(tot % 60).padStart(2, '0');
  }
  function _atualizarTitulo () {
    var el = sid('agTitulo'); if (!el) return;
    if (_view === 'semana') {
      var fim = new Date(_dataRef.getTime() + 6 * 864e5);
      el.textContent = _dataRef.getDate() + ' – ' + fim.getDate() + ' ' + MESES[fim.getMonth()] + ' ' + fim.getFullYear();
    } else if (_view === 'mes') {
      el.textContent = MESES_EXT[_dataRef.getMonth()] + ' ' + _dataRef.getFullYear();
    } else if (_view === 'hoje') {
      var hj = new Date();
      el.textContent = 'Hoje — ' + DIAS_EXT[hj.getDay()] + ', ' + hj.getDate() + ' de ' + MESES[hj.getMonth()];
    } else {
      el.textContent = DIAS_EXT[_dataRef.getDay()] + ', ' + _dataRef.getDate() + ' de ' + MESES[_dataRef.getMonth()] + ' de ' + _dataRef.getFullYear();
    }
  }

  return { init, render, navData, irHoje, setView, filtrar, abrirModalNovo, abrirModalEditar,
           fecharModal, salvarAgendamento, excluirAgendamento, buscarPaciente, selecionarPaciente,
           pacItemClick, slotClick, cardClick, sugerirFim, aoSelecionarProcedimento, mesDiaClick,
           onFormaPgtoChange };
})();

/* ══════════════════════════════════════════════════════════════════════════════
   PRONTUÁRIO ELETRÔNICO — ProntuarioMod
   Cole DENTRO do bloco <script> existente, junto com AgendaMod e demais módulos.
   Depende de: _sb, CU, USER_ROLE, USER_PROFILE, sid(), esc(), toast(), switchSidebar()
   ══════════════════════════════════════════════════════════════════════════════ */

