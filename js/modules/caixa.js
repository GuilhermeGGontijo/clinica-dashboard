/* ═══════════════════════════════════════════════════════════════════════
   PAINEL DE CONTROLE CLÍNICO — js/modules/caixa.js
   CaixaMod: Caixa do Dia — Atendimentos de hoje + Fechamento de Turno
   Depende de: supabase.js (_sb), main.js (sid, esc, toast, CU)
═══════════════════════════════════════════════════════════════════════ */

const CaixaMod = (function () {
  'use strict';

  var COMISSAO_POR_ATEND = 2.00;

  var _turnoId    = null;
  var _comissao   = 0;
  var _atendHoje  = [];
  var _processando = false;
  var _editAgId   = null;
  var _editRecebId = null; // recebimento_id para UPDATE (orçamentos odonto)

  var FORMAS = { DINHEIRO: 'Dinheiro', PIX: 'PIX', CREDITO: 'Crédito', DEBITO: 'Débito', CONVENIO: 'Convênio' };

  /* ══════════════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════════════ */
  async function init () {
    if (!_sb) return;
    var wrap = sid('caixaListWrap');
    if (wrap) wrap.innerHTML = '<div class="loadingState">Carregando caixa do dia...</div>';
    await _carregarOuAbrirTurno();
    await _carregarAtendHoje();
    _render();
  }

  async function atualizar () {
    await _carregarAtendHoje();
    _render();
    toast('Lista atualizada', 'info');
  }

  /* ══════════════════════════════════════════════════════════════════
     TURNO
  ══════════════════════════════════════════════════════════════════ */
  async function _carregarOuAbrirTurno () {
    var su = await _sb.auth.getUser();
    var userId = su.data && su.data.user ? su.data.user.id : null;
    if (!userId) return;

    var hoje = _hoje();
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

    var rn = await _sb.from('caixa_turnos').insert({
      recepcionista_id:       userId,
      unidade_id:             CU,
      data_abertura:          new Date().toISOString(),
      status_auditoria:       'Em Aberto',
      comissao_recepcionista: 0
    }).select('id').single();

    if (!rn.error) { _turnoId = rn.data.id; _comissao = 0; }
    else console.error('[CaixaMod] Erro ao abrir turno:', rn.error.message);
  }

  /* ══════════════════════════════════════════════════════════════════
     CARREGAR ATENDIMENTOS DE HOJE
  ══════════════════════════════════════════════════════════════════ */
  async function _carregarAtendHoje () {
    var hoje = _hoje();

    /* 1. Apenas campos base — sem joins que podem falhar */
    var rAg = await _sb.from('agendamentos')
      .select('id,hora_inicio,valor_cobrado,status,paciente_id,profissional_id,procedimento_id,observacoes,criado_por')
      .gte('data_agendamento', hoje)
      .lte('data_agendamento', hoje)
      .eq('unidade_id', CU)
      .neq('status', 'Cancelado')
      .order('hora_inicio');

    if (rAg.error) {
      console.error('[CaixaMod]', rAg.error.message);
      var wrap = sid('caixaListWrap');
      if (wrap) wrap.innerHTML = '<div class="cxVazio">⚠️ Erro ao carregar: ' + rAg.error.message + '</div>';
      _atendHoje = [];
      return;
    }

    _atendHoje = rAg.data || [];
    if (!_atendHoje.length) return;

    var agIds = _atendHoje.map(function (a) { return a.id; });

    /* 2. Recebimentos */
    var rReceb = await _sb.from('recebimentos')
      .select('agendamento_id,id,valor,status,forma_pagamento')
      .in('agendamento_id', agIds);
    var recebMap = {};
    if (!rReceb.error) {
      (rReceb.data || []).forEach(function (rb) {
        if (!recebMap[rb.agendamento_id]) recebMap[rb.agendamento_id] = [];
        recebMap[rb.agendamento_id].push(rb);
      });
    }
    _atendHoje.forEach(function (ag) { ag.recebimentos = recebMap[ag.id] || []; });

    /* 3. Pacientes */
    var pIds = _atendHoje.map(function (ag) { return ag.paciente_id; }).filter(Boolean)
      .filter(function (v, i, a) { return a.indexOf(v) === i; });
    if (pIds.length) {
      var rPac = await _sb.from('pacientes').select('id,nome_completo').in('id', pIds);
      var pacMap = {};
      (rPac.data || []).forEach(function (p) { pacMap[p.id] = p.nome_completo; });
      _atendHoje.forEach(function (ag) { ag.pacientes = { nome_completo: pacMap[ag.paciente_id] || null }; });
    }

    /* 4. Procedimentos */
    var prIds = _atendHoje.map(function (ag) { return ag.procedimento_id; }).filter(Boolean)
      .filter(function (v, i, a) { return a.indexOf(v) === i; });
    if (prIds.length) {
      var rProc = await _sb.from('procedimentos').select('id,nome,valor_padrao,valor_repasse,tipo_repasse').in('id', prIds);
      var procMap = {};
      (rProc.data || []).forEach(function (p) { procMap[p.id] = p; });
      _atendHoje.forEach(function (ag) { ag.procedimento = procMap[ag.procedimento_id] || null; });
    }

    /* 5. Profissionais */
    var pfIds = _atendHoje.map(function (ag) { return ag.profissional_id; }).filter(Boolean)
      .filter(function (v, i, a) { return a.indexOf(v) === i; });
    if (pfIds.length) {
      var rProf = await _sb.from('perfis_usuarios').select('id,nome').in('id', pfIds);
      var profMap = {};
      (rProf.data || []).forEach(function (p) { profMap[p.id] = p; });
      _atendHoje.forEach(function (ag) { ag.profissional = profMap[ag.profissional_id] || null; });
    }

    /* 6. Criadores (Recepcionistas) — busca direta por UUID, sem FK hint */
    var crIds = _atendHoje.map(function (ag) { return ag.criado_por; }).filter(Boolean)
      .filter(function (v, i, a) { return a.indexOf(v) === i; });
    if (crIds.length) {
      var rCriad = await _sb.from('perfis_usuarios').select('id,nome').in('id', crIds);
      var criadMap = {};
      (rCriad.data || []).forEach(function (p) { criadMap[p.id] = p.nome; });
      _atendHoje.forEach(function (ag) { ag.criador = { nome: criadMap[ag.criado_por] || null }; });
    }

    /* 7. Orçamentos odontológicos do dia (recebimentos com prefixo ODONTO:) */
    var rOdReceb = await _sb.from('recebimentos')
      .select('id,valor,status,forma_pagamento,observacoes,criado_por')
      .eq('unidade_id', CU)
      .like('observacoes', 'ODONTO:%')
      .eq('data_recebimento', hoje);

    if (!rOdReceb.error && rOdReceb.data && rOdReceb.data.length) {
      /* extrair orcamento_id do campo observacoes */
      var orcIdRgx = /^ODONTO:([0-9a-f-]{36})/i;
      var orcIds = rOdReceb.data.map(function (rb) {
        var m = orcIdRgx.exec(rb.observacoes || '');
        return m ? m[1] : null;
      }).filter(Boolean).filter(function (v, i, a) { return a.indexOf(v) === i; });

      if (orcIds.length) {
        /* Orçamentos */
        var rOrcs = await _sb.from('orcamentos')
          .select('id,paciente_id,profissional_id,valor_total,data_criacao')
          .in('id', orcIds);
        var orcMap = {};
        (rOrcs.data || []).forEach(function (o) { orcMap[o.id] = o; });

        /* Pacientes */
        var odPacIds = (rOrcs.data || []).map(function (o) { return o.paciente_id; }).filter(Boolean)
          .filter(function (v, i, a) { return a.indexOf(v) === i; });
        var odPacMap = {};
        if (odPacIds.length) {
          var rOdPac = await _sb.from('pacientes').select('id,nome_completo').in('id', odPacIds);
          (rOdPac.data || []).forEach(function (p) { odPacMap[p.id] = p.nome_completo; });
        }

        /* Profissionais */
        var odProfIds = (rOrcs.data || []).map(function (o) { return o.profissional_id; }).filter(Boolean)
          .filter(function (v, i, a) { return a.indexOf(v) === i; });
        var odProfMap = {};
        if (odProfIds.length) {
          var rOdProf = await _sb.from('perfis_usuarios').select('id,nome').in('id', odProfIds);
          (rOdProf.data || []).forEach(function (p) { odProfMap[p.id] = p.nome; });
        }

        /* Itens (procedimentos por dente) */
        var rOdItens = await _sb.from('orcamento_itens')
          .select('orcamento_id,dente_numero,odonto_procedimentos(nome_intervencao)')
          .in('orcamento_id', orcIds);
        var odItensMap = {};
        (rOdItens.data || []).forEach(function (it) {
          if (!odItensMap[it.orcamento_id]) odItensMap[it.orcamento_id] = [];
          odItensMap[it.orcamento_id].push(it);
        });

        /* Construir pseudo-registros e mesclar */
        var odRecords = rOdReceb.data.map(function (rb) {
          var m     = orcIdRgx.exec(rb.observacoes || '');
          var orcId = m ? m[1] : null;
          var orc   = orcId ? (orcMap[orcId] || {}) : {};
          var itens = orcId ? (odItensMap[orcId] || []) : [];
          var descProc = itens.length
            ? itens.map(function (it) {
                var np = (it.odonto_procedimentos && it.odonto_procedimentos.nome_intervencao) || '';
                return 'D.' + it.dente_numero + (np ? ' ' + np : '');
              }).join(', ')
            : 'Atendimento Odontológico';
          var horaStr = orc.data_criacao
            ? new Date(orc.data_criacao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            : '—';
          return {
            id:            rb.id,          /* usa recebimento_id como chave */
            _tipo:         'odonto',
            _recebId:      rb.id,
            hora_inicio:   horaStr,
            valor_cobrado: orc.valor_total || rb.valor,
            status:        'Realizado',
            paciente_id:   orc.paciente_id,
            pacientes:     { nome_completo: odPacMap[orc.paciente_id] || '—' },
            procedimento:  { nome: '🦷 ' + descProc },
            profissional:  { nome: odProfMap[orc.profissional_id] || '—' },
            criador:       { nome: odProfMap[orc.profissional_id] || '—' },
            recebimentos:  [rb]
          };
        });

        _atendHoje = _atendHoje.concat(odRecords);
        _atendHoje.sort(function (a, b) {
          return (a.hora_inicio || '').localeCompare(b.hora_inicio || '');
        });
      }
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     RENDERIZAÇÃO
  ══════════════════════════════════════════════════════════════════ */
  function _render () {
    _renderHdrTurno();
    _renderKpis();
    _renderTabela();
  }

  function _renderHdrTurno () {
    var el = sid('caixaTurnoInfo');
    if (!el) return;
    el.innerHTML = _turnoId
      ? '<span class="cxTurnoBadge ativo">🟢 Turno em aberto</span>'
      : '<span class="cxTurnoBadge fechado">🔴 Sem turno ativo</span>';
  }

  function _renderKpis () {
    var pagos = _atendHoje.filter(function (ag) {
      return ag.recebimentos && ag.recebimentos.some(function (rb) { return rb.status === 'RECEBIDO'; });
    });
    var pendentes = _atendHoje.filter(function (ag) {
      return !ag.recebimentos || !ag.recebimentos.some(function (rb) { return rb.status === 'RECEBIDO'; });
    });
    var totalArrecadado = pagos.reduce(function (acc, ag) {
      var receb = ag.recebimentos.find(function (rb) { return rb.status === 'RECEBIDO'; });
      return acc + (parseFloat((receb || {}).valor) || 0);
    }, 0);
    var totalPendente = pendentes.reduce(function (acc, ag) {
      return acc + (parseFloat(ag.valor_cobrado) || parseFloat(((ag.procedimento) || {}).valor_padrao) || 0);
    }, 0);

    var el;
    el = sid('caixaKpiAgend');        if (el) el.textContent = _atendHoje.length;
    el = sid('caixaKpiPagos');        if (el) el.textContent = pagos.length;
    el = sid('caixaKpiPend');         if (el) el.textContent = pendentes.length;
    el = sid('caixaTotalArrecadado'); if (el) el.textContent = 'R$ ' + totalArrecadado.toFixed(2).replace('.', ',');
    el = sid('caixaTotalPend');       if (el) el.textContent = 'R$ ' + totalPendente.toFixed(2).replace('.', ',');
    el = sid('caixaKpiComissao');     if (el) el.textContent = 'R$ ' + _comissao.toFixed(2).replace('.', ',');
  }

  function _renderTabela () {
    var wrap = sid('caixaListWrap');
    if (!wrap) return;

    if (!_atendHoje.length) {
      wrap.innerHTML = '<div class="cxVazio">📋 Nenhum agendamento para hoje nesta unidade.</div>';
      return;
    }

    var html = '<div class="cxTableScroll"><table class="cxTable">'
      + '<colgroup>'
      + '<col class="col-hora"/><col class="col-pac"/><col class="col-proc"/>'
      + '<col class="col-prof"/><col class="col-recep"/><col class="col-val"/>'
      + '<col class="col-forma"/><col class="col-st"/><col class="col-ac"/>'
      + '</colgroup>'
      + '<thead><tr>'
      + '<th>Hora</th><th>Paciente</th><th>Procedimento</th><th>Profissional</th>'
      + '<th>Recepcionista</th><th>Valor</th><th>Forma Pgto</th><th>Status</th><th>Ação</th>'
      + '</tr></thead><tbody>';

    _atendHoje.forEach(function (ag) {
      var receb = ag.recebimentos && ag.recebimentos.find(function (rb) { return rb.status === 'RECEBIDO'; });
      var pago  = !!receb;

      var hora    = (ag.hora_inicio  || '').substring(0, 5);
      var pac     = (ag.pacientes   && ag.pacientes.nome_completo) || '—';
      var proc    = (ag.procedimento && ag.procedimento.nome) || ag.observacoes || '—';
      var prof    = (ag.profissional && ag.profissional.nome)      || '—';
      var recepNome = (ag.criador    && ag.criador.nome)           || '—';
      var valor   = pago
        ? (parseFloat(receb.valor) || 0)
        : (parseFloat(ag.valor_cobrado) || parseFloat(((ag.procedimento) || {}).valor_padrao) || 0);
      var forma   = pago ? (FORMAS[receb.forma_pagamento] || receb.forma_pagamento || '—') : '—';

      var badge = pago
        ? '<span class="cxStPago">✅ Recebido</span>'
        : '<span class="cxStPend">⏳ Pendente</span>';

      var recebArg = ag._tipo === 'odonto'
        ? '\'' + ag.id + '\',' + valor.toFixed(2) + ',\'' + ag._recebId + '\''
        : '\'' + ag.id + '\',' + valor.toFixed(2);
      var acao = pago
        ? '<span style="color:var(--s4);font-size:.8rem">—</span>'
        : '<button class="btn bG bSm" onclick="CaixaMod.abrirReceber(' + recebArg + ')">💰 Receber</button>';

      html += '<tr class="' + (pago ? '' : 'cxRowPend') + '">'
        + '<td class="cxTdHora">' + hora + '</td>'
        + '<td class="cxTdPac">'  + esc(pac)      + '</td>'
        + '<td class="cxTdProc">' + esc(proc)     + '</td>'
        + '<td class="cxTdProf">' + esc(prof)     + '</td>'
        + '<td class="cxTdRecep">'+ esc(recepNome)+ '</td>'
        + '<td class="cxTdVal">'  + (valor > 0 ? 'R$ ' + valor.toFixed(2).replace('.', ',') : '—') + '</td>'
        + '<td class="cxTdForma">'+ forma         + '</td>'
        + '<td>'                  + badge         + '</td>'
        + '<td>'                  + acao          + '</td>'
        + '</tr>';
    });

    html += '</tbody></table></div>';
    wrap.innerHTML = html;
  }

  /* ══════════════════════════════════════════════════════════════════
     MODAL — RECEBER PAGAMENTO
  ══════════════════════════════════════════════════════════════════ */
  function abrirReceber (agId, valor, recebId) {
    _editAgId    = agId;
    _editRecebId = recebId || null;
    var modal = sid('caixaModalPag');
    if (!modal) return;
    var el = sid('caixaPagValorLabel');
    if (el) el.textContent = 'R$ ' + parseFloat(valor).toFixed(2).replace('.', ',');
    var sel = sid('caixaPagForma'); if (sel) sel.value = '';
    var obs = sid('caixaPagObs');   if (obs) obs.value = '';
    modal.classList.add('open');
    setTimeout(function () { var s = sid('caixaPagForma'); if (s) s.focus(); }, 80);
  }

  function fecharModal () {
    var modal = sid('caixaModalPag');
    if (modal) modal.classList.remove('open');
    _editAgId    = null;
    _editRecebId = null;
  }

  async function confirmarPagamento () {
    if (!_editAgId || _processando) return;
    var forma = ((sid('caixaPagForma') || {}).value || '').trim();
    var obs   = ((sid('caixaPagObs')   || {}).value || '').trim();
    if (!forma) { toast('Selecione a forma de pagamento', 'warn'); return; }

    _processando = true;
    var btn = sid('caixaBtnConfirmar');
    if (btn) { btn.disabled = true; btn.textContent = 'Processando...'; }

    try {
      var su     = await _sb.auth.getUser();
      var userId = su.data && su.data.user ? su.data.user.id : null;

      var ag    = _atendHoje.find(function (a) { return a.id === _editAgId; });
      var valor = ag ? (parseFloat(ag.valor_cobrado) || parseFloat(((ag.procedimento) || {}).valor_padrao) || 0) : 0;

      var r;
      if (_editRecebId) {
        /* Orçamento odontológico: atualiza recebimento PENDENTE existente */
        r = await _sb.from('recebimentos').update({
          forma_pagamento:  forma,
          status:           'RECEBIDO',
          data_recebimento: _hoje(),
          criado_por:       userId,
          caixa_turno_id:   _turnoId,
          observacoes:      (ag && ag.procedimento ? ag.procedimento.nome + (obs ? ' | ' + obs : '') : obs) || null
        }).eq('id', _editRecebId);
      } else {
        /* Agendamento normal: insere novo recebimento */
        r = await _sb.from('recebimentos').insert({
          agendamento_id:   _editAgId,
          unidade_id:       CU,
          forma_pagamento:  forma,
          valor:            valor,
          data_recebimento: _hoje(),
          status:           'RECEBIDO',
          criado_por:       userId,
          caixa_turno_id:   _turnoId,
          observacoes:      obs || null
        });
      }
      if (r.error) throw r.error;

      _comissao += COMISSAO_POR_ATEND;
      if (_turnoId) {
        await _sb.from('caixa_turnos')
          .update({ comissao_recepcionista: _comissao })
          .eq('id', _turnoId);
      }

      toast('✅ Pagamento registrado! +R$ ' + COMISSAO_POR_ATEND.toFixed(2).replace('.', ',') + ' de comissão 🏆', 'success');
      fecharModal();
      await _carregarAtendHoje();
      _render();

    } catch (err) {
      toast('Erro: ' + err.message, 'error');
    } finally {
      _processando = false;
      if (btn) { btn.disabled = false; btn.textContent = '✅ Confirmar Pagamento'; }
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     FECHAR CAIXA + RELATÓRIO
  ══════════════════════════════════════════════════════════════════ */
  async function fecharCaixa () {
    if (!_turnoId) { toast('Nenhum turno em aberto', 'warn'); return; }

    var pendentes = _atendHoje.filter(function (ag) {
      return !ag.recebimentos || !ag.recebimentos.some(function (rb) { return rb.status === 'RECEBIDO'; });
    });
    var msg = pendentes.length
      ? 'Ainda há ' + pendentes.length + ' atendimento(s) sem pagamento. Fechar mesmo assim?'
      : 'Fechar o caixa deste turno?';
    if (!confirm(msg)) return;

    try {
      var pagos = _atendHoje.filter(function (ag) {
        return ag.recebimentos && ag.recebimentos.some(function (rb) { return rb.status === 'RECEBIDO'; });
      });
      var totalArr = pagos.reduce(function (acc, ag) {
        var receb = ag.recebimentos.find(function (rb) { return rb.status === 'RECEBIDO'; });
        return acc + (parseFloat((receb || {}).valor) || 0);
      }, 0);
      var totalRepasse = pagos.reduce(function (acc, ag) {
        var receb = ag.recebimentos.find(function (rb) { return rb.status === 'RECEBIDO'; });
        var valorBase = parseFloat((receb || {}).valor) || 0;
        var proc = ag.procedimento;
        if (!proc) return acc;
        var vr = parseFloat(proc.valor_repasse) || 0;
        var rep = proc.tipo_repasse === 'percentual' ? valorBase * (vr / 100)
                : (proc.tipo_repasse === 'fixo' && vr > 0) ? vr : 0;
        return acc + rep;
      }, 0);
      var totalRetido = totalArr - totalRepasse;

      var ru = await _sb.from('caixa_turnos').update({
        data_fechamento:        new Date().toISOString(),
        total_arrecadado:       totalArr,
        total_retido_clinica:   totalRetido,
        total_repasse_medicos:  totalRepasse,
        comissao_recepcionista: _comissao,
        status_auditoria:       'Pendente de Auditoria'
      }).eq('id', _turnoId);

      if (ru.error) throw ru.error;

      toast('✅ Caixa fechado! Total: R$ ' + totalArr.toFixed(2).replace('.', ',')
        + ' · Comissão: R$ ' + _comissao.toFixed(2).replace('.', ','), 'success');

      _imprimirRelatorio(totalArr, totalRetido, totalRepasse, pagos.length, pendentes.length);

      _turnoId  = null;
      _comissao = 0;
      await init();

    } catch (err) {
      toast('Erro ao fechar caixa: ' + err.message, 'error');
    }
  }

  function _imprimirRelatorio (totalArr, totalRetido, totalRepasse, cntPagos, cntPend) {
    var agora = new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    var linhas = _atendHoje.map(function (ag) {
      var receb = ag.recebimentos && ag.recebimentos.find(function (rb) { return rb.status === 'RECEBIDO'; });
      var pago  = !!receb;
      var hora  = (ag.hora_inicio || '').substring(0, 5);
      var pac   = (ag.pacientes    && ag.pacientes.nome_completo) || '—';
      var proc  = (ag.procedimento && ag.procedimento.nome)      || '—';
      var prof  = (ag.profissional && ag.profissional.nome)      || '—';
      var recepNome = (ag.criador  && ag.criador.nome)           || '—';
      var valor = pago ? (parseFloat(receb.valor) || 0)
                       : (parseFloat(ag.valor_cobrado) || parseFloat(((ag.procedimento) || {}).valor_padrao) || 0);
      var forma = pago ? (FORMAS[receb.forma_pagamento] || receb.forma_pagamento || '—') : '—';
      return '<tr>'
        + '<td>' + hora + '</td>'
        + '<td>' + pac + '</td>'
        + '<td>' + proc + '</td>'
        + '<td>' + prof + '</td>'
        + '<td>' + recepNome + '</td>'
        + '<td style="text-align:right">R$ ' + valor.toFixed(2).replace('.', ',') + '</td>'
        + '<td>' + forma + '</td>'
        + '<td style="text-align:center">' + (pago ? '✅ Pago' : '⏳ Pendente') + '</td>'
        + '</tr>';
    }).join('');

    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Relatório de Caixa</title>'
      + '<style>'
      + 'body{font-family:Arial,sans-serif;padding:24px;color:#222;font-size:13px}'
      + 'h1{font-size:18px;color:#1a6e2e;margin-bottom:4px}'
      + '.sub{color:#666;font-size:.85rem;margin-bottom:20px}'
      + 'table{width:100%;border-collapse:collapse;margin-bottom:20px}'
      + 'th{background:#1a6e2e;color:#fff;padding:8px 10px;text-align:left;font-size:.82rem}'
      + 'td{padding:7px 10px;border-bottom:1px solid #e5e7eb;font-size:.82rem}'
      + 'tr:nth-child(even){background:#f9fafb}'
      + '.totais{border-top:2px solid #1a6e2e;padding-top:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px}'
      + '.tItem{background:#f0fdf4;border-radius:8px;padding:12px 16px}'
      + '.tLabel{font-size:.75rem;color:#666;margin-bottom:4px}'
      + '.tVal{font-size:1.1rem;font-weight:800;color:#1a6e2e}'
      + '.tValR{font-size:1.1rem;font-weight:800;color:#dc2626}'
      + '@media print{.noprint{display:none!important}}'
      + '</style></head><body>'
      + '<h1>🏦 Relatório de Fechamento de Caixa</h1>'
      + '<div class="sub">Emitido em: ' + agora + '</div>'
      + '<table><thead><tr><th>Hora</th><th>Paciente</th><th>Procedimento</th><th>Profissional</th><th>Recepcionista</th><th>Valor</th><th>Forma</th><th>Status</th></tr></thead>'
      + '<tbody>' + linhas + '</tbody></table>'
      + '<div class="totais">'
      + '<div class="tItem"><div class="tLabel">💰 Total Arrecadado</div><div class="tVal">R$ ' + totalArr.toFixed(2).replace('.', ',') + '</div></div>'
      + '<div class="tItem"><div class="tLabel">🏥 Retido Clínica</div><div class="tVal">R$ ' + totalRetido.toFixed(2).replace('.', ',') + '</div></div>'
      + '<div class="tItem"><div class="tLabel">👨‍⚕️ Repasse Profissionais</div><div class="tVal">R$ ' + totalRepasse.toFixed(2).replace('.', ',') + '</div></div>'
      + '<div class="tItem"><div class="tLabel">✅ Atendimentos Pagos</div><div class="tVal">' + cntPagos + '</div></div>'
      + '<div class="tItem"><div class="tLabel">⏳ Pendentes</div><div class="tVal ' + (cntPend > 0 ? 'tValR' : '') + '">' + cntPend + '</div></div>'
      + '<div class="tItem"><div class="tLabel">🏆 Comissão Recepcionista</div><div class="tVal">R$ ' + _comissao.toFixed(2).replace('.', ',') + '</div></div>'
      + '</div>'
      + '<br><button class="noprint btn" onclick="window.print()" style="background:#1a6e2e;color:#fff;border:none;padding:10px 22px;border-radius:8px;cursor:pointer;font-size:.9rem;font-weight:700">🖨️ Imprimir Relatório</button>'
      + '</body></html>';

    var w = window.open('', '_blank', 'width=820,height=650');
    if (w) { w.document.write(html); w.document.close(); }
    else toast('Habilite popups para imprimir o relatório', 'warn');
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

  /* Compatibilidade com chamadas antigas */
  function abrirProcessar (recebId, valor) { toast('Use o botão 💰 Receber na tabela', 'info'); }

  return { init, atualizar, abrirReceber, abrirProcessar, fecharModal, confirmarPagamento, fecharCaixa };
})();
