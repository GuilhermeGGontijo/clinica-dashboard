/* ═══════════════════════════════════════════════════════════════════════
   PAINEL DE CONTROLE CLÍNICO — js/modules/caixa.js
   CaixaMod: Caixa do Dia — Recepção/Liquidação + Fechamento de Turno
   Depende de: supabase.js (_sb), main.js (sid, esc, toast, CU, USER_PROFILE)
═══════════════════════════════════════════════════════════════════════ */

const CaixaMod = (function () {
  'use strict';

  /* ── Configurações de negócio (ajustáveis futuramente via tabela) ── */
  var COMISSAO_POR_ATEND = 2.00;
  var SPLIT_CLINICA      = 0.60;
  var SPLIT_MEDICO       = 0.40;
  var META_COMISSAO      = 50.00;

  /* ── Estado interno ── */
  var _turnoId    = null;
  var _pendentes  = [];
  var _comissao   = 0;
  var _processando = false;
  var _editRecebId = null;
  var _editValor   = 0;

  var FORMAS = ['PIX', 'Dinheiro', 'Cartão de Crédito', 'Cartão de Débito', 'Convênio'];

  /* ══════════════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════════════ */
  async function init () {
    if (!_sb) return;
    var wrap = sid('caixaListWrap');
    if (wrap) wrap.innerHTML = '<div class="loadingState">Carregando caixa do dia...</div>';

    await _carregarOuAbrirTurno();
    await _carregarPendentes();
    _render();
  }

  /* ══════════════════════════════════════════════════════════════════
     TURNO — abre automaticamente se não existir um para hoje
  ══════════════════════════════════════════════════════════════════ */
  async function _carregarOuAbrirTurno () {
    var su = await _sb.auth.getUser();
    var userId = su.data && su.data.user ? su.data.user.id : null;
    if (!userId) return;

    var hoje = _hoje();

    /* Busca turno aberto hoje para este usuário nesta unidade */
    var r = await _sb.from('caixa_turnos')
      .select('id, comissao_recepcionista')
      .eq('recepcionista_id', userId)
      .eq('unidade_id', CU)
      .gte('data_abertura', hoje + 'T00:00:00')
      .is('data_fechamento', null)
      .maybeSingle();

    if (r.data) {
      _turnoId  = r.data.id;
      _comissao = parseFloat(r.data.comissao_recepcionista) || 0;
      return;
    }

    /* Nenhum turno: abre um novo */
    var rn = await _sb.from('caixa_turnos').insert({
      recepcionista_id:     userId,
      unidade_id:           CU,
      data_abertura:        new Date().toISOString(),
      status_auditoria:     'Em Aberto',
      comissao_recepcionista: 0
    }).select('id').single();

    if (!rn.error) {
      _turnoId  = rn.data.id;
      _comissao = 0;
    } else {
      console.error('[CaixaMod] Erro ao abrir turno:', rn.error.message);
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     CARREGAR PENDENTES
  ══════════════════════════════════════════════════════════════════ */
  async function _carregarPendentes () {
    var r = await _sb.from('recebimentos')
      .select('id, valor, status, observacoes, data_recebimento')
      .eq('unidade_id', CU)
      .eq('status', 'PENDENTE')
      .order('data_recebimento', { ascending: false });

    _pendentes = r.data || [];
  }

  /* ══════════════════════════════════════════════════════════════════
     RENDERIZAÇÃO
  ══════════════════════════════════════════════════════════════════ */
  function _render () {
    _renderHdrTurno();
    _renderTermometro();
    _renderStats();
    _renderPendentes();
  }

  function _renderHdrTurno () {
    var el = sid('caixaTurnoInfo');
    if (!el) return;
    if (_turnoId) {
      el.innerHTML = '<span class="cxTurnoBadge ativo">🟢 Turno em aberto</span>';
    } else {
      el.innerHTML = '<span class="cxTurnoBadge fechado">🔴 Sem turno ativo</span>';
    }
  }

  function _renderTermometro () {
    var el = sid('caixaComissao');
    if (!el) return;
    var pct  = Math.min(100, (_comissao / META_COMISSAO) * 100);
    var fmtC = 'R$ ' + _comissao.toFixed(2).replace('.', ',');
    var fmtM = 'R$ ' + META_COMISSAO.toFixed(2).replace('.', ',');
    el.innerHTML =
        '<div class="cxTermTitle">🏆 Comissão do Dia</div>'
      + '<div class="cxTermVal">' + fmtC + '</div>'
      + '<div class="cxTermBarraWrap">'
      +   '<div class="cxTermBarra"><div class="cxTermPreench" style="width:' + pct.toFixed(1) + '%"></div></div>'
      +   '<div class="cxTermPct">' + pct.toFixed(0) + '%</div>'
      + '</div>'
      + '<div class="cxTermMeta">Meta: ' + fmtM + ' · R$ ' + COMISSAO_POR_ATEND.toFixed(2).replace('.', ',') + '/atend</div>';
  }

  function _renderStats () {
    var total = _pendentes.reduce(function (acc, r) { return acc + parseFloat(r.valor || 0); }, 0);
    var el;
    el = sid('caixaCntPend');   if (el) el.textContent = _pendentes.length;
    el = sid('caixaTotalPend'); if (el) el.textContent = 'R$ ' + total.toFixed(2).replace('.', ',');
  }

  function _renderPendentes () {
    var wrap = sid('caixaListWrap');
    if (!wrap) return;

    if (!_pendentes.length) {
      wrap.innerHTML = '<div class="cxVazio">✅ Nenhum pagamento pendente no momento.</div>';
      return;
    }

    wrap.innerHTML = _pendentes.map(function (rec) {
      var val  = 'R$ ' + parseFloat(rec.valor || 0).toFixed(2).replace('.', ',');
      var obs  = rec.observacoes || '—';
      var data = rec.data_recebimento
        ? new Date(rec.data_recebimento + 'T12:00:00').toLocaleDateString('pt-BR')
        : '—';

      return '<div class="cxCard">'
        + '<div class="cxCardLeft">'
        +   '<div class="cxCardVal">' + val + '</div>'
        +   '<div class="cxCardData">' + data + '</div>'
        +   '<div class="cxCardObs">' + esc(obs) + '</div>'
        + '</div>'
        + '<button class="btn bG bSm cxBtnReceber"'
        +   ' onclick="CaixaMod.abrirProcessar(\'' + rec.id + '\',' + parseFloat(rec.valor || 0) + ')">'
        +   '💳 Receber'
        + '</button>'
        + '</div>';
    }).join('');
  }

  /* ══════════════════════════════════════════════════════════════════
     PROCESSAR PAGAMENTO
  ══════════════════════════════════════════════════════════════════ */
  function abrirProcessar (recebId, valor) {
    _editRecebId = recebId;
    _editValor   = valor;
    var modal = sid('caixaModalPag');
    if (!modal) return;
    var el = sid('caixaPagValorLabel');
    if (el) el.textContent = 'R$ ' + parseFloat(valor).toFixed(2).replace('.', ',');
    var sel = sid('caixaPagForma');
    if (sel) sel.value = '';
    var obs = sid('caixaPagObs');
    if (obs) obs.value = '';
    modal.classList.add('open');
    setTimeout(function () { var s = sid('caixaPagForma'); if (s) s.focus(); }, 80);
  }

  function fecharModal () {
    var modal = sid('caixaModalPag');
    if (modal) modal.classList.remove('open');
    _editRecebId = null;
    _editValor   = 0;
  }

  async function confirmarPagamento () {
    if (!_editRecebId || _processando) return;

    var forma = (sid('caixaPagForma') || {}).value;
    var obs   = ((sid('caixaPagObs')  || {}).value || '').trim();
    if (!forma) { toast('Selecione a forma de pagamento', 'warn'); return; }

    _processando = true;
    var btn = sid('caixaBtnConfirmar');
    if (btn) { btn.disabled = true; btn.textContent = 'Processando...'; }

    try {
      var su     = await _sb.auth.getUser();
      var userId = su.data && su.data.user ? su.data.user.id : null;

      var payload = {
        status:           'RECEBIDO',
        forma_pagamento:  forma,
        data_recebimento: _hoje(),
        processado_por:   userId,
        caixa_turno_id:   _turnoId
      };
      if (obs) payload.observacoes = obs;

      var r = await _sb.from('recebimentos').update(payload).eq('id', _editRecebId);
      if (r.error) throw r.error;

      /* Acumula comissão e atualiza o turno */
      _comissao += COMISSAO_POR_ATEND;
      if (_turnoId) {
        await _sb.from('caixa_turnos')
          .update({ comissao_recepcionista: _comissao })
          .eq('id', _turnoId);
      }

      toast('✅ Pagamento registrado! +R$ '
        + COMISSAO_POR_ATEND.toFixed(2).replace('.', ',') + ' de comissão 🏆', 'success');

      fecharModal();
      await _carregarPendentes();
      _render();

    } catch (err) {
      toast('Erro: ' + err.message, 'error');
    } finally {
      _processando = false;
      if (btn) { btn.disabled = false; btn.textContent = '✅ Confirmar Pagamento'; }
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     FECHAR CAIXA
  ══════════════════════════════════════════════════════════════════ */
  async function fecharCaixa () {
    if (!_turnoId) { toast('Nenhum turno em aberto', 'warn'); return; }

    var pendCnt = _pendentes.length;
    var msg = pendCnt
      ? 'Ainda há ' + pendCnt + ' pagamento(s) pendente(s). Fechar mesmo assim?'
      : 'Fechar o caixa deste turno?';
    if (!confirm(msg)) return;

    try {
      /* Totais do turno */
      var r = await _sb.from('recebimentos')
        .select('valor')
        .eq('caixa_turno_id', _turnoId)
        .eq('status', 'RECEBIDO');

      var totalArr  = (r.data || []).reduce(function (acc, x) { return acc + parseFloat(x.valor || 0); }, 0);
      var retido    = parseFloat((totalArr * SPLIT_CLINICA).toFixed(2));
      var repasse   = parseFloat((totalArr * SPLIT_MEDICO).toFixed(2));

      var ru = await _sb.from('caixa_turnos').update({
        data_fechamento:       new Date().toISOString(),
        total_arrecadado:      totalArr,
        total_retido_clinica:  retido,
        total_repasse_medicos: repasse,
        comissao_recepcionista: _comissao,
        status_auditoria:      'Pendente de Auditoria'
      }).eq('id', _turnoId);

      if (ru.error) throw ru.error;

      toast('✅ Caixa fechado! Total: R$ '
        + totalArr.toFixed(2).replace('.', ',')
        + ' · Comissão: R$ ' + _comissao.toFixed(2).replace('.', ','), 'success');

      _turnoId  = null;
      _comissao = 0;
      await init();

    } catch (err) {
      toast('Erro ao fechar caixa: ' + err.message, 'error');
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     UTILS
  ══════════════════════════════════════════════════════════════════ */
  function _hoje () {
    var d = new Date();
    return d.getFullYear() + '-'
      + String(d.getMonth() + 1).padStart(2, '0') + '-'
      + String(d.getDate()).padStart(2, '0');
  }

  /* ══════════════════════════════════════════════════════════════════
     EXPORT
  ══════════════════════════════════════════════════════════════════ */
  return { init, abrirProcessar, fecharModal, confirmarPagamento, fecharCaixa };
})();

/* ══════════════════════════════════════════════════════════════════════════════
   FIM CaixaMod
   ══════════════════════════════════════════════════════════════════════════════ */
