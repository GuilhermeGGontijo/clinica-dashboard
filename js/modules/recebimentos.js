/* ═══════════════════════════════════════════════════════════════════════
   PAINEL DE CONTROLE CLÍNICO — js/modules/recebimentos.js
   RecebMod: Módulo de Recebimentos e Caixa
   Depende de: supabase.js (_sb), main.js (sid, esc, toast, CU)
═══════════════════════════════════════════════════════════════════════ */

const RecebMod = (function () {
  'use strict';

  var _dados     = [];
  var _convenios = [];
  var _editAgId  = null;   // agendamento_id da baixa em curso

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
    var r = await _sb.from('agendamentos')
      .select('id, data_agendamento, hora_inicio, paciente:paciente_id(nome_completo), recebimentos(id,status)')
      .eq('unidade_id', CU)
      .neq('status', 'Cancelado')
      .lte('data_agendamento', hoje)
      .order('data_agendamento', { ascending: false })
      .limit(100);

    var wrap = sid('recebAlertaPend');
    if (!wrap) return;
    if (r.error || !r.data) { wrap.style.display = 'none'; return; }

    var pendentes = r.data.filter(function (ag) {
      return !ag.recebimentos || !ag.recebimentos.length ||
             ag.recebimentos.every(function (rb) { return rb.status !== 'RECEBIDO'; });
    });

    if (!pendentes.length) { wrap.style.display = 'none'; return; }

    var lista = pendentes.slice(0, 8).map(function (ag) {
      var nome = (ag.paciente && ag.paciente.nome_completo) || '—';
      var d = new Date(ag.data_agendamento + 'T00:00:00');
      var dt = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      var hr = (ag.hora_inicio || '').substring(0, 5);
      return '<span class="recebPendItem">' + esc(nome) + ' <small>' + dt + ' ' + hr + '</small>'
        + '<button class="recebPendBtnBaixa" onclick="RecebMod.abrirBaixa(\'' + ag.id + '\')" title="Dar baixa">💰</button>'
        + '</span>';
    }).join('');

    var mais = pendentes.length > 8 ? '<span class="recebPendMais">+' + (pendentes.length - 8) + ' mais</span>' : '';

    wrap.style.display = 'flex';
    wrap.innerHTML = '<div class="recebAlertaIcon">⚠️</div>'
      + '<div class="recebAlertaBody">'
      + '<strong>' + pendentes.length + ' paciente' + (pendentes.length > 1 ? 's' : '') + ' com pagamento pendente</strong>'
      + '<div class="recebPendLista">' + lista + mais + '</div>'
      + '</div>';
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

    var query = _sb.from('agendamentos')
      .select('id,data_agendamento,hora_inicio,status,forma_pagamento,convenio_id,numero_guia,valor_cobrado,' +
              'paciente:paciente_id(nome_completo),' +
              'profissional:profissional_id(nome),' +
              'procedimento:procedimento_id(nome,valor),' +
              'recebimentos(id,forma_pagamento,valor,data_recebimento,status)')
      .eq('unidade_id', CU)
      .neq('status', 'Falta')
      .order('data_agendamento', { ascending: false });

    if (ini) query = query.gte('data_agendamento', ini);
    if (fim) query = query.lte('data_agendamento', fim);
    if (stFilt === 'PENDENTE') query = query.is('recebimentos', null);

    var r = await query.limit(300);
    _dados = r.data || [];

    if (stFilt === 'PENDENTE') {
      _dados = _dados.filter(function (a) { return !a.recebimentos || !a.recebimentos.length; });
    } else if (stFilt === 'RECEBIDO') {
      _dados = _dados.filter(function (a) { return a.recebimentos && a.recebimentos.length; });
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
    var recebidos = _dados.filter(function (a) { return a.recebimentos && a.recebimentos.length; });
    var pendentes = total - recebidos.length;
    var valorTotal = recebidos.reduce(function (acc, a) {
      return acc + (parseFloat((a.recebimentos[0] || {}).valor) || 0);
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
      var receb = ag.recebimentos && ag.recebimentos.length ? ag.recebimentos[0] : null;
      var pago  = !!receb;

      var valor  = receb
        ? parseFloat(receb.valor) || 0
        : parseFloat(ag.valor_cobrado) || parseFloat((ag.procedimento || {}).valor) || 0;

      var forma  = receb
        ? (FORMAS[receb.forma_pagamento] || receb.forma_pagamento || '—')
        : (ag.forma_pagamento ? (FORMAS[ag.forma_pagamento] || ag.forma_pagamento) : '—');

      var d      = new Date(ag.data_agendamento + 'T00:00:00');
      var dtFmt  = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

      var stCls  = pago ? 'recebStPago' : 'recebStPend';
      var stLbl  = pago ? '✅ Recebido' : '⏳ Pendente';

      html += '<tr>'
        + '<td class="recebTdData">' + dtFmt + '<br><small class="recebHora">' + (ag.hora_inicio || '').substring(0,5) + '</small></td>'
        + '<td>' + esc((ag.paciente     && ag.paciente.nome_completo) || '—') + '</td>'
        + '<td>' + esc((ag.procedimento && ag.procedimento.nome)      || '—') + '</td>'
        + '<td>' + esc((ag.profissional && ag.profissional.nome)      || '—') + '</td>'
        + '<td class="recebValor">' + (valor > 0 ? 'R$ ' + valor.toFixed(2).replace('.', ',') : '—') + '</td>'
        + '<td>' + forma + '</td>'
        + '<td><span class="' + stCls + '">' + stLbl + '</span></td>'
        + '<td>'
        + (pago
          ? '<button class="btn bSm recebBtnEstorno" onclick="RecebMod.estornar(' + receb.id + ')">↩ Estornar</button>'
          : '<button class="btn bG bSm recebBtnBaixa" onclick="RecebMod.abrirBaixa(' + ag.id + ')">💰 Dar Baixa</button>')
        + '</td>'
        + '</tr>';
    });

    html += '</tbody></table></div>';
    wrap.innerHTML = html;
  }

  /* ══════════════════════════════════════════════════════════════════
     MODAL DE BAIXA
  ══════════════════════════════════════════════════════════════════ */
  function abrirBaixa(agId) {
    var ag = _dados.find(function (a) { return a.id === agId; });
    if (!ag) return;
    _editAgId = agId;

    /* Pre-fill */
    var formaEl  = sid('recebForma');
    var valorEl  = sid('recebValorInput');
    var dataEl   = sid('recebData');
    var obsEl    = sid('recebObs');
    var convEl   = sid('recebConvenioId');

    if (formaEl) formaEl.value = ag.forma_pagamento || 'DINHEIRO';

    var val = parseFloat(ag.valor_cobrado) || parseFloat((ag.procedimento || {}).valor) || 0;
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
        + ' — ' + ((ag.procedimento && ag.procedimento.nome) || '—');
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
      await _carregar();
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
    if (!confirm('Confirmar estorno deste recebimento?')) return;
    var r = await _sb.from('recebimentos').delete().eq('id', recebId);
    if (r.error) { toast('Erro ao estornar', 'error'); return; }
    toast('Estorno realizado', 'success');
    await _carregar();
    _renderKpis();
    _renderTabela();
  }

  /* ══════════════════════════════════════════════════════════════════
     UTILS
  ══════════════════════════════════════════════════════════════════ */
  function _fmtDate(d) {
    return d.getFullYear() + '-'
      + String(d.getMonth() + 1).padStart(2, '0') + '-'
      + String(d.getDate()).padStart(2, '0');
  }

  return { init, filtrar, abrirBaixa, fecharModal, salvarBaixa, estornar, onFormaChange };
})();
