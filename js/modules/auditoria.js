/* ═══════════════════════════════════════════════════════════════════════
   PAINEL DE CONTROLE CLÍNICO — js/modules/auditoria.js
   AuditoriaMod: Auditoria Financeira — Visão por atendimento
   Fontes: agendamentos + recebimentos + procedimentos
   Depende de: supabase.js (_sb), main.js (sid, esc, toast, CU, USER_ROLE)
═══════════════════════════════════════════════════════════════════════ */

const AuditoriaMod = (function () {
  'use strict';

  var _dados = [];

  /* ══════════════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════════════ */
  async function init () {
    if (!_sb) return;
    var role = window.USER_ROLE || '';
    if (role !== 'administrador' && role !== 'faturamento') {
      var sec = sid('secAuditoria');
      if (sec) sec.innerHTML = '<div class="loadingState" style="color:var(--r5)">⛔ Acesso restrito a administradores e faturamento.</div>';
      return;
    }
    _setupFiltrosDefault();
    await _carregar();
    _render();
  }

  /* ══════════════════════════════════════════════════════════════════
     FILTROS
  ══════════════════════════════════════════════════════════════════ */
  function _setupFiltrosDefault () {
    var hoje = new Date();
    var ini  = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    var fim  = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    var elIni = sid('audFiltroIni');
    var elFim = sid('audFiltroFim');
    if (elIni && !elIni.value) elIni.value = _d(ini);
    if (elFim && !elFim.value) elFim.value = _d(fim);
  }

  async function filtrar () {
    var tbody = sid('audTbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="10" class="audVazio">Carregando...</td></tr>';
    await _carregar();
    _render();
  }

  /* ══════════════════════════════════════════════════════════════════
     CARREGAR — agendamentos + recebimentos + procedimentos
  ══════════════════════════════════════════════════════════════════ */
  async function _carregar () {
    var ini    = ((sid('audFiltroIni')    || {}).value || '').trim();
    var fim    = ((sid('audFiltroFim')    || {}).value || '').trim();
    var stFilt = ((sid('audFiltroStatus') || {}).value || '').trim();

    var query = _sb.from('agendamentos')
      .select([
        'id', 'data_agendamento', 'hora_inicio', 'status', 'valor_cobrado',
        'paciente:paciente_id(nome_completo)',
        'profissional:profissional_id(nome)',
        'procedimento:procedimento_id(nome,valor_repasse,tipo_repasse)',
        'criador:criado_por(nome)',
        'recebimentos(id,valor,status,forma_pagamento,data_recebimento)'
      ].join(','))
      .eq('unidade_id', CU)
      .neq('status', 'Cancelado')
      .order('data_agendamento', { ascending: false })
      .limit(500);

    if (ini) query = query.gte('data_agendamento', ini);
    if (fim) query = query.lte('data_agendamento', fim);

    var r = await query;
    _dados = r.data || [];

    if (stFilt === 'RECEBIDO') {
      _dados = _dados.filter(function (ag) {
        return ag.recebimentos && ag.recebimentos.some(function (rb) { return rb.status === 'RECEBIDO'; });
      });
    } else if (stFilt === 'PENDENTE') {
      _dados = _dados.filter(function (ag) {
        return !ag.recebimentos || !ag.recebimentos.some(function (rb) { return rb.status === 'RECEBIDO'; });
      });
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     CÁLCULO DE REPASSE POR ATENDIMENTO
  ══════════════════════════════════════════════════════════════════ */
  function _calcRepasse (ag) {
    var receb = ag.recebimentos && ag.recebimentos.find(function (rb) { return rb.status === 'RECEBIDO'; });
    var valorBase = receb
      ? (parseFloat(receb.valor) || 0)
      : (parseFloat(ag.valor_cobrado) || 0);

    var repasse = 0, percRepasse = 0;
    var proc = ag.procedimento;
    if (proc) {
      var vr = parseFloat(proc.valor_repasse) || 0;
      if (proc.tipo_repasse === 'percentual') {
        repasse = valorBase * (vr / 100);
        percRepasse = vr;
      } else if (proc.tipo_repasse === 'fixo' && vr > 0) {
        repasse = vr;
        percRepasse = valorBase > 0 ? (vr / valorBase) * 100 : 0;
      }
    }

    var retido = valorBase - repasse;
    return { valorBase: valorBase, repasse: repasse, retido: retido, percRepasse: percRepasse, receb: receb };
  }

  /* ══════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════ */
  function _render () {
    _renderKpis();
    _renderTabela();
  }

  function _renderKpis () {
    var totalArr = 0, totalRetido = 0, totalRepasse = 0, pagos = 0, pendentes = 0;

    _dados.forEach(function (ag) {
      var c = _calcRepasse(ag);
      if (c.receb) {
        totalArr     += c.valorBase;
        totalRetido  += c.retido;
        totalRepasse += c.repasse;
        pagos++;
      } else {
        pendentes++;
      }
    });

    _kpi('audKpiTotal',     _fmt(totalArr));
    _kpi('audKpiRetido',    _fmt(totalRetido));
    _kpi('audKpiRepasse',   _fmt(totalRepasse));
    _kpi('audKpiComissao',  pagos);
    _kpi('audKpiPendentes', pendentes);

    /* Atualiza labels dos KPIs */
    _lbl('audKpiComissao',  '✅ Atendimentos Pagos');
    _lbl('audKpiPendentes', '⏳ Pagamentos Pendentes');
  }

  function _renderTabela () {
    var tbody = sid('audTbody');
    if (!tbody) return;

    if (!_dados.length) {
      tbody.innerHTML = '<tr><td colspan="11" class="audVazio">Nenhum atendimento encontrado para o período selecionado.</td></tr>';
      return;
    }

    var FORMA = { DINHEIRO: 'Dinheiro', PIX: 'PIX', CREDITO: 'Crédito', DEBITO: 'Débito', CONVENIO: 'Convênio' };

    tbody.innerHTML = _dados.map(function (ag) {
      var c = _calcRepasse(ag);
      var pago = !!c.receb;

      var d   = new Date(ag.data_agendamento + 'T00:00:00');
      var dt  = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
      var hr  = (ag.hora_inicio || '').substring(0, 5);

      var pac    = (ag.paciente     && ag.paciente.nome_completo) || '—';
      var prof   = (ag.profissional && ag.profissional.nome)      || '—';
      var proc   = (ag.procedimento && ag.procedimento.nome)      || '—';
      var recep  = (ag.criador      && ag.criador.nome)           || '—';
      var perc   = c.percRepasse > 0 ? c.percRepasse.toFixed(0) + '%' : '—';
      var forma  = pago ? (FORMA[c.receb.forma_pagamento] || c.receb.forma_pagamento || '—') : '—';

      var badge = pago
        ? '<span class="audBadge audBdOk">✅ Pago</span>'
        : '<span class="audBadge audBdPend">⏳ Pendente</span>';

      return '<tr class="' + (pago ? '' : 'audRowPend') + '">'
        + '<td class="audTdData">' + dt + '<br><small class="audHora">' + hr + '</small></td>'
        + '<td class="audTdPac">'   + esc(pac)   + '</td>'
        + '<td class="audTdProf">'  + esc(prof)  + '</td>'
        + '<td class="audTdProc">'  + esc(proc)  + '</td>'
        + '<td class="audTdRecep">' + esc(recep) + '</td>'
        + '<td class="audNum">'     + _fmt(c.valorBase) + '</td>'
        + '<td class="audNum audPercCol">' + perc + '</td>'
        + '<td class="audNum audColorG">'  + _fmt(c.retido)  + '</td>'
        + '<td class="audNum audColorB">'  + _fmt(c.repasse) + '</td>'
        + '<td class="audTdForma">' + forma + '</td>'
        + '<td>' + badge + '</td>'
        + '</tr>';
    }).join('');
  }

  /* ══════════════════════════════════════════════════════════════════
     UTILS
  ══════════════════════════════════════════════════════════════════ */
  function _kpi (id, val) { var el = sid(id); if (el) el.textContent = val; }
  function _lbl (kpiId, txt) {
    var el = sid(kpiId);
    if (el && el.nextElementSibling) el.nextElementSibling.textContent = txt;
  }
  function _n  (v) { return parseFloat(v || 0); }
  function _fmt(v) { return 'R$ ' + _n(v).toFixed(2).replace('.', ','); }
  function _d  (dt) { return dt.toISOString().split('T')[0]; }

  /* Mantido por compatibilidade (turno-based) */
  async function marcarAuditado () {}

  return { init, filtrar, marcarAuditado };
})();
