/* ═══════════════════════════════════════════════════════════════════════
   PAINEL DE CONTROLE CLÍNICO — js/modules/recebimentos.js
   RecebMod: Módulo de Recebimentos e Caixa
   Depende de: supabase.js (_sb), main.js (sid, esc, toast, CU)
═══════════════════════════════════════════════════════════════════════ */

const RecebMod = (function () {
  'use strict';

  var _dados          = [];
  var _convenios      = [];
  var _pendentesAlert = [];
  var _editAgId       = null;   // agendamento_id da baixa em curso
  var _userId         = null;   // ID do usuário logado (para filtrar pendentes)

  var FORMAS = {
    DINHEIRO: 'Dinheiro',
    PIX:      'PIX',
    CREDITO:  'Cartão de Crédito',
    DEBITO:   'Cartão de Débito',
    CONVENIO: 'Convênio'
  };

  /* ══════════════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════════════ */
  async function init() {
    if (!_sb) return;
    var wrap = sid('recebListWrap');
    if (wrap) wrap.innerHTML = '<div class="loadingState">Carregando recebimentos...</div>';
    /* Captura o userId atual para filtrar pendentes por recepcionista */
    var su = await _sb.auth.getUser();
    _userId = su.data && su.data.user ? su.data.user.id : null;
    _setupFiltros();
    await Promise.all([_carregarConvenios(), _carregar(), _carregarAlertaPendentes()]);
    _renderKpis();
    _renderTabela();
  }

  /* ══════════════════════════════════════════════════════════════════
     ALERTA DE PAGAMENTOS PENDENTES (pacientes sem recebimento)
  ══════════════════════════════════════════════════════════════════ */
  async function _carregarAlertaPendentes () {
    var hoje = _fmtDate(new Date());
    var query = _sb.from('agendamentos')
      .select('id,data_agendamento,hora_inicio,valor_cobrado,forma_pagamento,convenio_id,status,paciente_id,procedimento_id')
      .eq('unidade_id', CU)
      .neq('status', 'Cancelado')
      .lte('data_agendamento', hoje)
      .order('data_agendamento', { ascending: false })
      .limit(100);
    if (_userId) query = query.eq('criado_por', _userId);
    var r = await query;

    var wrap = sid('recebAlertaPend');
    if (!wrap) return;
    if (r.error || !r.data) { wrap.style.display = 'none'; return; }

    var ags = r.data;
    if (ags.length) {
      var agIds = ags.map(function(a){return a.id;});
      /* recebimentos separado */
      var rR = await _sb.from('recebimentos').select('agendamento_id,id,status').in('agendamento_id', agIds);
      var rmMap = {};
      if (!rR.error) rR.data.forEach(function(rb){ if(!rmMap[rb.agendamento_id]) rmMap[rb.agendamento_id]=[]; rmMap[rb.agendamento_id].push(rb); });
      ags.forEach(function(ag){ ag.recebimentos = rmMap[ag.id]||[]; });
      /* pacientes separado */
      var pIds = ags.map(function(a){return a.paciente_id;}).filter(Boolean);
      if (pIds.length) {
        var rP = await _sb.from('pacientes').select('id,nome_completo').in('id', pIds);
        var pMap = {}; (rP.data||[]).forEach(function(p){pMap[p.id]=p.nome_completo;});
        ags.forEach(function(ag){ ag.paciente = {nome_completo: pMap[ag.paciente_id]||null}; });
      }
      /* procedimentos separado */
      var prIds = ags.map(function(a){return a.procedimento_id;}).filter(Boolean);
      if (prIds.length) {
        var rPr = await _sb.from('procedimentos').select('id,nome,valor_padrao').in('id', prIds);
        var prMap = {}; (rPr.data||[]).forEach(function(p){prMap[p.id]=p;});
        ags.forEach(function(ag){ ag.procedimento = prMap[ag.procedimento_id]||null; });
      }
    }

    _pendentesAlert = ags.filter(function (ag) {
      return !ag.recebimentos || !ag.recebimentos.length ||
             ag.recebimentos.every(function (rb) { return rb.status !== 'RECEBIDO'; });
    });

    if (!_pendentesAlert.length) { wrap.style.display = 'none'; return; }

    var MOSTRAR = 10;
    var linhas = _pendentesAlert.slice(0, MOSTRAR).map(function (ag) {
      var nome = (ag.paciente && ag.paciente.nome_completo) || '—';
      var d = new Date(ag.data_agendamento + 'T00:00:00');
      var dt = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
      var hr = (ag.hora_inicio || '').substring(0, 5);
      var val = parseFloat(ag.valor_cobrado) || parseFloat((ag.procedimento || {}).valor_padrao) || 0;
      var valStr = val > 0 ? 'R$ ' + val.toFixed(2).replace('.', ',') : '—';
      return '<tr>'
        + '<td class="rpNome">' + esc(nome) + '</td>'
        + '<td class="rpData">' + dt + ' · ' + hr + '</td>'
        + '<td class="rpProc">' + esc((ag.procedimento && ag.procedimento.nome) || '—') + '</td>'
        + '<td class="rpVal">' + valStr + '</td>'
        + '<td class="rpAcao"><button class="btn bG bSm recebPendBtnBaixa" onclick="RecebMod.abrirBaixa(\'' + ag.id + '\')">💰 Dar Baixa</button></td>'
        + '</tr>';
    }).join('');

    var mais = _pendentesAlert.length > MOSTRAR
      ? '<tr><td colspan="5" style="text-align:center;padding:6px 0;font-size:.75rem;color:var(--s5)">+ ' + (_pendentesAlert.length - MOSTRAR) + ' outros agendamentos pendentes</td></tr>'
      : '';

    wrap.style.display = 'block';
    wrap.innerHTML = '<div class="recebAlertaTopo"><span class="recebAlertaIcon">⚠️</span>'
      + '<strong>' + _pendentesAlert.length + ' pagamento' + (_pendentesAlert.length > 1 ? 's' : '') + ' pendente' + (_pendentesAlert.length > 1 ? 's' : '') + '</strong>'
      + '</div>'
      + '<div class="recebPendTableWrap"><table class="recebPendTable">'
      + '<thead><tr><th>Paciente</th><th>Data · Hora</th><th>Procedimento</th><th>Valor</th><th>Ação</th></tr></thead>'
      + '<tbody>' + linhas + mais + '</tbody>'
      + '</table></div>';
  }

  async function _carregarConvenios() {
    var r = await _sb.from('convenios').select('id,nome').eq('ativo', true).order('nome');
    _convenios = r.data || [];
  }

  /* ══════════════════════════════════════════════════════════════════
     CARREGAR AGENDAMENTOS + RECEBIMENTOS
  ══════════════════════════════════════════════════════════════════ */
  async function _carregar() {
    var ini    = ((sid('recebFiltroIni')    || {}).value) || '';
    var fim    = ((sid('recebFiltroFim')    || {}).value) || '';
    var stFilt = ((sid('recebFiltroStatus') || {}).value) || '';

    /* 1. Apenas campos base — sem joins que podem falhar */
    var q = _sb.from('agendamentos')
      .select('id,data_agendamento,hora_inicio,status,forma_pagamento,convenio_id,numero_guia,valor_cobrado,paciente_id,profissional_id,procedimento_id,observacoes')
      .eq('unidade_id', CU)
      .neq('status', 'Cancelado')
      .order('data_agendamento', { ascending: false });

    if (ini) q = q.gte('data_agendamento', ini);
    if (fim) q = q.lte('data_agendamento', fim);
    var r = await q.limit(300);
    _dados = r.data || [];
    if (!_dados.length) return;

    var agIds = _dados.map(function (a) { return a.id; });

    /* 2. Recebimentos por query separada */
    var rReceb = await _sb.from('recebimentos')
      .select('agendamento_id,id,forma_pagamento,valor,data_recebimento,status')
      .in('agendamento_id', agIds);
    var recebMap = {};
    if (!rReceb.error) {
      (rReceb.data || []).forEach(function (rb) {
        if (!recebMap[rb.agendamento_id]) recebMap[rb.agendamento_id] = [];
        recebMap[rb.agendamento_id].push(rb);
      });
    }
    _dados.forEach(function (ag) { ag.recebimentos = recebMap[ag.id] || []; });

    /* 3. Pacientes por query separada */
    var pIds = _dados.map(function (ag) { return ag.paciente_id; }).filter(Boolean)
      .filter(function (v, i, a) { return a.indexOf(v) === i; });
    if (pIds.length) {
      var rPac = await _sb.from('pacientes').select('id,nome_completo').in('id', pIds);
      var pacMap = {};
      (rPac.data || []).forEach(function (p) { pacMap[p.id] = p.nome_completo; });
      _dados.forEach(function (ag) { ag.paciente = { nome_completo: pacMap[ag.paciente_id] || null }; });
    }

    /* 4. Procedimentos por query separada */
    var prIds = _dados.map(function (ag) { return ag.procedimento_id; }).filter(Boolean)
      .filter(function (v, i, a) { return a.indexOf(v) === i; });
    if (prIds.length) {
      var rProc = await _sb.from('procedimentos').select('id,nome,valor_padrao').in('id', prIds);
      var procMap = {};
      (rProc.data || []).forEach(function (p) { procMap[p.id] = p; });
      _dados.forEach(function (ag) { ag.procedimento = procMap[ag.procedimento_id] || null; });
    }

    /* 5. Profissionais por query separada */
    var pfIds = _dados.map(function (ag) { return ag.profissional_id; }).filter(Boolean)
      .filter(function (v, i, a) { return a.indexOf(v) === i; });
    if (pfIds.length) {
      var rProf = await _sb.from('perfis_usuarios').select('id,nome').in('id', pfIds);
      var profMap = {};
      (rProf.data || []).forEach(function (p) { profMap[p.id] = p; });
      _dados.forEach(function (ag) { ag.profissional = profMap[ag.profissional_id] || null; });
    }

    /* 6. Filtro de status */
    if (stFilt === 'PENDENTE') {
      _dados = _dados.filter(function (a) {
        return !a.recebimentos || !a.recebimentos.some(function(rb){ return rb.status === 'RECEBIDO'; });
      });
    } else if (stFilt === 'RECEBIDO') {
      _dados = _dados.filter(function (a) {
        return a.recebimentos && a.recebimentos.some(function(rb){ return rb.status === 'RECEBIDO'; });
      });
    } else if (stFilt === 'ESTORNADO') {
      _dados = _dados.filter(function (a) {
        return a.recebimentos && a.recebimentos.some(function(rb){ return rb.status === 'ESTORNADO'; })
          && !a.recebimentos.some(function(rb){ return rb.status === 'RECEBIDO'; });
      });
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     FILTROS + DEFAULTS
  ══════════════════════════════════════════════════════════════════ */
  function _setupFiltros() {
    var hoje = new Date();
    var ini  = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    var fim  = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    var elIni = sid('recebFiltroIni');
    var elFim = sid('recebFiltroFim');
    if (elIni && !elIni.value) elIni.value = _fmtDate(ini);
    if (elFim && !elFim.value) elFim.value = _fmtDate(fim);
  }

  async function filtrar() {
    var wrap = sid('recebListWrap');
    if (wrap) wrap.innerHTML = '<div class="loadingState">Filtrando...</div>';
    await Promise.all([_carregar(), _carregarAlertaPendentes()]);
    _renderKpis();
    _renderTabela();
  }

  /* ══════════════════════════════════════════════════════════════════
     KPIs
  ══════════════════════════════════════════════════════════════════ */
  function _renderKpis() {
    var total     = _dados.length;
    var recebidos = _dados.filter(function (a) {
      return a.recebimentos && a.recebimentos.some(function(rb){ return rb.status === 'RECEBIDO'; });
    });
    var pendentes = _dados.filter(function (a) {
      return !a.recebimentos || !a.recebimentos.some(function(rb){ return rb.status === 'RECEBIDO'; });
    }).length;
    var valorTotal = recebidos.reduce(function (acc, a) {
      var receb = a.recebimentos.find(function(rb){ return rb.status === 'RECEBIDO'; });
      return acc + (parseFloat((receb || {}).valor) || 0);
    }, 0);

    var el;
    el = sid('recebKpiTotal'); if (el) el.textContent = total;
    el = sid('recebKpiPagos'); if (el) el.textContent = recebidos.length;
    el = sid('recebKpiPend');  if (el) el.textContent = pendentes;
    el = sid('recebKpiValor'); if (el) el.textContent = 'R$ ' + valorTotal.toFixed(2).replace('.', ',');
  }

  /* ══════════════════════════════════════════════════════════════════
     TABELA
  ══════════════════════════════════════════════════════════════════ */
  function _renderTabela() {
    var wrap = sid('recebListWrap');
    if (!wrap) return;

    if (!_dados.length) {
      wrap.innerHTML = '<div class="recebVazio">Nenhum agendamento encontrado para o período selecionado.</div>';
      return;
    }

    var html = '<div class="recebTableWrap"><table class="recebTable">'
      + '<thead><tr>'
      + '<th>Data</th><th>Paciente</th><th>Procedimento</th><th>Profissional</th>'
      + '<th>Valor</th><th>Forma</th><th>Status</th><th>Ação</th>'
      + '</tr></thead><tbody>';

    _dados.forEach(function (ag) {
      var receb    = ag.recebimentos && ag.recebimentos.find(function(rb){ return rb.status === 'RECEBIDO'; });
      var estorn   = !receb && ag.recebimentos && ag.recebimentos.find(function(rb){ return rb.status === 'ESTORNADO'; });
      var pago     = !!receb;

      var valor  = receb
        ? parseFloat(receb.valor) || 0
        : estorn
          ? parseFloat(estorn.valor) || 0
          : parseFloat(ag.valor_cobrado) || parseFloat((ag.procedimento || {}).valor_padrao) || 0;

      var forma  = receb
        ? (FORMAS[receb.forma_pagamento] || receb.forma_pagamento || '—')
        : estorn
          ? (FORMAS[estorn.forma_pagamento] || estorn.forma_pagamento || '—')
          : (ag.forma_pagamento ? (FORMAS[ag.forma_pagamento] || ag.forma_pagamento) : '—');

      var d      = new Date(ag.data_agendamento + 'T00:00:00');
      var dtFmt  = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

      var stCls  = pago ? 'recebStPago' : estorn ? 'recebStEstornado' : 'recebStPend';
      var stLbl  = pago ? '✅ Recebido'  : estorn ? '↩ Estornado'      : '⏳ Pendente';

      var acao;
      if (pago) {
        acao = '<button class="btn bSm recebBtnEstorno" onclick="RecebMod.estornar(\'' + receb.id + '\')">↩ Estornar</button>';
      } else if (estorn) {
        acao = '<button class="btn bG bSm recebBtnBaixa" onclick="RecebMod.abrirBaixa(\'' + ag.id + '\')">💰 Dar Baixa</button>';
      } else {
        acao = '<button class="btn bG bSm recebBtnBaixa" onclick="RecebMod.abrirBaixa(\'' + ag.id + '\')">💰 Dar Baixa</button>';
      }

      html += '<tr class="' + (estorn ? 'recebRowEstornado' : '') + '">'
        + '<td class="recebTdData">' + dtFmt + '<br><small class="recebHora">' + (ag.hora_inicio || '').substring(0,5) + '</small></td>'
        + '<td>' + esc((ag.paciente     && ag.paciente.nome_completo) || '—') + '</td>'
        + '<td>' + esc((ag.procedimento && ag.procedimento.nome) || ag.observacoes || '—') + '</td>'
        + '<td>' + esc((ag.profissional && ag.profissional.nome)      || '—') + '</td>'
        + '<td class="recebValor' + (estorn ? ' recebValorEstorn' : '') + '">' + (valor > 0 ? 'R$ ' + valor.toFixed(2).replace('.', ',') : '—') + '</td>'
        + '<td>' + forma + '</td>'
        + '<td><span class="' + stCls + '">' + stLbl + '</span></td>'
        + '<td>' + acao + '</td>'
        + '</tr>';
    });

    html += '</tbody></table></div>';
    wrap.innerHTML = html;
  }

  /* ══════════════════════════════════════════════════════════════════
     MODAL DE BAIXA
  ══════════════════════════════════════════════════════════════════ */
  async function abrirBaixa(agId) {
    var ag = _dados.find(function (a) { return a.id === agId; })
           || _pendentesAlert.find(function (a) { return a.id === agId; });
    if (!ag) {
      var r = await _sb.from('agendamentos')
        .select('id,data_agendamento,hora_inicio,status,forma_pagamento,convenio_id,valor_cobrado,paciente_id,procedimento_id,observacoes')
        .eq('id', agId).single();
      if (r.error || !r.data) { toast('Agendamento não encontrado.', 'err'); return; }
      ag = r.data;
      if (ag.paciente_id) {
        var rp = await _sb.from('pacientes').select('nome_completo').eq('id', ag.paciente_id).single();
        ag.paciente = rp.data || null;
      }
      if (ag.procedimento_id) {
        var rpr = await _sb.from('procedimentos').select('nome,valor_padrao').eq('id', ag.procedimento_id).single();
        ag.procedimento = rpr.data || null;
      }
    }
    _editAgId = agId;

    /* Pre-fill */
    var formaEl  = sid('recebForma');
    var valorEl  = sid('recebValorInput');
    var dataEl   = sid('recebData');
    var obsEl    = sid('recebObs');
    var convEl   = sid('recebConvenioId');

    if (formaEl) formaEl.value = ag.forma_pagamento || 'DINHEIRO';

    var val = parseFloat(ag.valor_cobrado) || parseFloat((ag.procedimento || {}).valor_padrao) || 0;
    if (valorEl) valorEl.value = val > 0 ? val.toFixed(2) : '';

    if (dataEl)  dataEl.value  = _fmtDate(new Date());
    if (obsEl)   obsEl.value   = '';

    if (convEl) {
      convEl.innerHTML = '<option value="">— Selecione —</option>'
        + _convenios.map(function (c) {
          return '<option value="' + c.id + '"' + (ag.convenio_id == c.id ? ' selected' : '') + '>' + esc(c.nome) + '</option>';
        }).join('');
      convEl.value = ag.convenio_id || '';
    }

    /* Paciente info no modal */
    var info = sid('recebModalInfo');
    if (info) {
      var d = new Date(ag.data_agendamento + 'T00:00:00');
      info.textContent = ((ag.paciente && ag.paciente.nome_completo) || '—')
        + ' — ' + d.toLocaleDateString('pt-BR') + ' ' + (ag.hora_inicio || '').substring(0,5)
        + ' — ' + ((ag.procedimento && ag.procedimento.nome) || ag.observacoes || '—');
    }

    onFormaChange();
    var m = sid('modalRecebimento'); if (m) m.style.display = 'flex';
  }

  function fecharModal() {
    var m = sid('modalRecebimento'); if (m) m.style.display = 'none';
    _editAgId = null;
  }

  function onFormaChange() {
    var forma    = ((sid('recebForma') || {}).value) || '';
    var convWrap = sid('recebConvenioWrap');
    if (convWrap) convWrap.style.display = forma === 'CONVENIO' ? 'block' : 'none';
  }

  /* ══════════════════════════════════════════════════════════════════
     SALVAR BAIXA
  ══════════════════════════════════════════════════════════════════ */
  async function salvarBaixa() {
    var forma  = ((sid('recebForma')      || {}).value) || '';
    var convId = ((sid('recebConvenioId') || {}).value) || null;
    var valor  = parseFloat((sid('recebValorInput') || {}).value);
    var data   = ((sid('recebData')       || {}).value) || _fmtDate(new Date());
    var obs    = ((sid('recebObs')        || {}).value || '').trim();

    if (!forma)                     { toast('Selecione a forma de pagamento', 'warn'); return; }
    if (isNaN(valor) || valor <= 0) { toast('Informe um valor válido', 'warn'); return; }

    var btn = document.querySelector('[onclick="RecebMod.salvarBaixa()"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Registrando...'; }

    try {
      var su     = await _sb.auth.getUser();
      var userId = su.data && su.data.user ? su.data.user.id : null;

      var payload = {
        agendamento_id:   _editAgId,
        unidade_id:       CU,
        forma_pagamento:  forma,
        convenio_id:      convId ? parseInt(convId) : null,
        valor:            valor,
        data_recebimento: data,
        status:           'RECEBIDO',
        observacoes:      obs || null,
        criado_por:       userId
      };

      var r = await _sb.from('recebimentos').insert(payload);
      if (r.error) throw r.error;

      toast('✅ Pagamento registrado com sucesso!', 'success');
      fecharModal();
      await Promise.all([_carregar(), _carregarAlertaPendentes()]);
      _renderKpis();
      _renderTabela();
    } catch (err) {
      toast('Erro ao registrar: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '✅ Confirmar Recebimento'; }
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     ESTORNO
  ══════════════════════════════════════════════════════════════════ */
  async function estornar(recebId) {
    if (!confirm('Confirmar estorno deste recebimento? O status será alterado para "Estornado".')) return;
    var r = await _sb.from('recebimentos')
      .update({ status: 'ESTORNADO' })
      .eq('id', recebId);
    if (r.error) { toast('Erro ao estornar: ' + r.error.message, 'error'); return; }
    toast('↩ Estorno registrado com sucesso', 'success');
    await Promise.all([_carregar(), _carregarAlertaPendentes()]);
    _renderKpis();
    _renderTabela();
  }

  async function atualizar() {
    var wrap = sid('recebListWrap');
    if (wrap) wrap.innerHTML = '<div class="loadingState">Atualizando...</div>';
    await Promise.all([_carregar(), _carregarAlertaPendentes()]);
    _renderKpis();
    _renderTabela();
    toast('Lista atualizada ✓', 'info');
  }

  /* ══════════════════════════════════════════════════════════════════
     UTILS
  ══════════════════════════════════════════════════════════════════ */
  function _fmtDate(d) {
    return d.getFullYear() + '-'
      + String(d.getMonth() + 1).padStart(2, '0') + '-'
      + String(d.getDate()).padStart(2, '0');
  }

  return { init, filtrar, atualizar, abrirBaixa, fecharModal, salvarBaixa, estornar, onFormaChange };
})();
