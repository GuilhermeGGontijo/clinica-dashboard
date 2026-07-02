/* ═══════════════════════════════════════════════════════════════════════
   PAINEL DE CONTROLE CLÍNICO — js/modules/auditoria.js
   AuditoriaMod: Auditoria Financeira — Visão Admin/Faturamento
   Depende de: supabase.js (_sb), main.js (sid, esc, toast, CU, USER_ROLE)
═══════════════════════════════════════════════════════════════════════ */

const AuditoriaMod = (function () {
  'use strict';

  var _turnos    = [];
  var _auditando = false;

  /* ══════════════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════════════ */
  async function init () {
    if (!_sb) return;

    var role = window.USER_ROLE || '';
    if (role !== 'administrador' && role !== 'faturamento') {
      var sec = sid('secAuditoria');
      if (sec) sec.innerHTML = '<div class="loadingState" style="color:var(--r5,#ef4444)">⛔ Acesso restrito a administradores e faturamento.</div>';
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
    if (elIni && !elIni.value) elIni.value = ini.toISOString().split('T')[0];
    if (elFim && !elFim.value) elFim.value = fim.toISOString().split('T')[0];
  }

  async function filtrar () {
    await _carregar();
    _render();
  }

  /* ══════════════════════════════════════════════════════════════════
     CARREGAR DADOS
  ══════════════════════════════════════════════════════════════════ */
  async function _carregar () {
    var ini    = ((sid('audFiltroIni')    || {}).value || '').trim();
    var fim    = ((sid('audFiltroFim')    || {}).value || '').trim();
    var status = ((sid('audFiltroStatus') || {}).value || '').trim();

    var query = _sb.from('caixa_turnos')
      .select([
        'id',
        'data_abertura',
        'data_fechamento',
        'total_arrecadado',
        'total_retido_clinica',
        'total_repasse_medicos',
        'comissao_recepcionista',
        'status_auditoria',
        'auditor_id',
        'data_auditoria',
        'recepcionista:recepcionista_id(nome)',
        'unidade:unidade_id(name)'
      ].join(','))
      .order('data_abertura', { ascending: false })
      .limit(200);

    if (ini)    query = query.gte('data_abertura', ini + 'T00:00:00');
    if (fim)    query = query.lte('data_abertura', fim + 'T23:59:59');
    if (status) query = query.eq('status_auditoria', status);
    if (CU)     query = query.eq('unidade_id', CU);

    var r   = await query;
    _turnos = r.data || [];
  }

  /* ══════════════════════════════════════════════════════════════════
     RENDERIZAÇÃO
  ══════════════════════════════════════════════════════════════════ */
  function _render () {
    _renderKpis();
    _renderTabela();
  }

  function _renderKpis () {
    var fechados = _turnos.filter(function (t) { return !!t.data_fechamento; });

    var total   = _soma(fechados, 'total_arrecadado');
    var retido  = _soma(fechados, 'total_retido_clinica');
    var repasse = _soma(fechados, 'total_repasse_medicos');
    var comiss  = _soma(fechados, 'comissao_recepcionista');
    var pend    = _turnos.filter(function (t) { return t.status_auditoria === 'Pendente de Auditoria'; }).length;

    _setKpi('audKpiTotal',     _fmt(total));
    _setKpi('audKpiRetido',    _fmt(retido));
    _setKpi('audKpiRepasse',   _fmt(repasse));
    _setKpi('audKpiComissao',  _fmt(comiss));
    _setKpi('audKpiPendentes', pend);
  }

  function _setKpi (id, val) {
    var el = sid(id);
    if (el) el.textContent = val;
  }

  function _renderTabela () {
    var tbody = sid('audTbody');
    if (!tbody) return;

    if (!_turnos.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="audVazio">Nenhum registro encontrado</td></tr>';
      return;
    }

    tbody.innerHTML = _turnos.map(function (t) {
      var recep   = (t.recepcionista && t.recepcionista.nome) ? esc(t.recepcionista.nome) : '—';
      var data    = t.data_abertura
        ? new Date(t.data_abertura).toLocaleDateString('pt-BR')
        : '—';
      var fechado = t.data_fechamento
        ? new Date(t.data_fechamento).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        : '<span class="audAberto">Em aberto</span>';

      var total   = _fmt(_n(t.total_arrecadado));
      var retido  = _fmt(_n(t.total_retido_clinica));
      var repasse = _fmt(_n(t.total_repasse_medicos));

      var badge = {
        'Em Aberto':             '<span class="audBadge audBdAberto">Em Aberto</span>',
        'Pendente de Auditoria': '<span class="audBadge audBdPend">⏳ Pendente</span>',
        'Auditado':              '<span class="audBadge audBdOk">✅ Auditado</span>'
      }[t.status_auditoria] || esc(t.status_auditoria || '—');

      var acao = '';
      if (t.status_auditoria === 'Pendente de Auditoria') {
        acao = '<button class="btn bG bSm" onclick="AuditoriaMod.marcarAuditado(\'' + t.id + '\')">🔍 Auditar</button>';
      } else if (t.status_auditoria === 'Auditado' && t.data_auditoria) {
        acao = '<span class="audTs">' + new Date(t.data_auditoria).toLocaleDateString('pt-BR') + '</span>';
      }

      return '<tr>'
        + '<td>' + data + '</td>'
        + '<td>' + recep + '</td>'
        + '<td>' + fechado + '</td>'
        + '<td class="audNum">' + total + '</td>'
        + '<td class="audNum audColorG">' + retido + '</td>'
        + '<td class="audNum audColorB">' + repasse + '</td>'
        + '<td>' + badge + '</td>'
        + '<td>' + acao + '</td>'
        + '</tr>';
    }).join('');
  }

  /* ══════════════════════════════════════════════════════════════════
     AUDITAR
  ══════════════════════════════════════════════════════════════════ */
  async function marcarAuditado (turnoId) {
    if (_auditando) return;
    if (!confirm('Marcar este caixa como Auditado? Esta ação é registrada.')) return;

    _auditando = true;
    try {
      var su     = await _sb.auth.getUser();
      var userId = su.data && su.data.user ? su.data.user.id : null;

      var r = await _sb.from('caixa_turnos').update({
        status_auditoria: 'Auditado',
        auditor_id:       userId,
        data_auditoria:   new Date().toISOString()
      }).eq('id', turnoId);

      if (r.error) throw r.error;
      toast('✅ Caixa marcado como Auditado', 'success');
      await _carregar();
      _render();

    } catch (err) {
      toast('Erro ao auditar: ' + err.message, 'error');
    } finally {
      _auditando = false;
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     UTILS
  ══════════════════════════════════════════════════════════════════ */
  function _n   (v) { return parseFloat(v || 0); }
  function _fmt (v) { return 'R$ ' + _n(v).toFixed(2).replace('.', ','); }
  function _soma (arr, key) {
    return arr.reduce(function (acc, t) { return acc + _n(t[key]); }, 0);
  }

  /* ══════════════════════════════════════════════════════════════════
     EXPORT
  ══════════════════════════════════════════════════════════════════ */
  return { init, filtrar, marcarAuditado };
})();

/* ══════════════════════════════════════════════════════════════════════════════
   FIM AuditoriaMod
   ══════════════════════════════════════════════════════════════════════════════ */
