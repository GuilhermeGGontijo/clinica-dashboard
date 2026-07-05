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

    /* ── 1. Agendamentos com joins (sem recebimentos, sem criador) ── */
    var q1 = _sb.from('agendamentos')
      .select([
        'id', 'data_agendamento', 'hora_inicio', 'status', 'valor_cobrado',
        'paciente_id', 'criado_por',
        'pacientes(nome_completo)',
        'profissional:perfis_usuarios!agendamentos_profissional_id_fkey(nome)',
        'procedimento:procedimentos!agendamentos_procedimento_id_fkey(nome,valor_repasse,tipo_repasse)'
      ].join(','))
      .eq('unidade_id', CU)
      .neq('status', 'Cancelado')
      .order('data_agendamento', { ascending: false })
      .limit(500);

    if (ini) q1 = q1.gte('data_agendamento', ini);
    if (fim) q1 = q1.lte('data_agendamento', fim);
    var r = await q1;

    if (r.error) {
      /* Fallback: apenas campos base */
      console.warn('[AuditoriaMod] join falhou, usando campos base:', r.error.message);
      var q2 = _sb.from('agendamentos')
        .select('id,data_agendamento,hora_inicio,status,valor_cobrado,paciente_id,profissional_id,procedimento_id,criado_por')
        .eq('unidade_id', CU)
        .neq('status', 'Cancelado')
        .order('data_agendamento', { ascending: false })
        .limit(500);
      if (ini) q2 = q2.gte('data_agendamento', ini);
      if (fim) q2 = q2.lte('data_agendamento', fim);
      r = await q2;
    }

    if (r.error) {
      console.error('[AuditoriaMod]', r.error.message);
      var tbody = sid('audTbody');
      if (tbody) tbody.innerHTML = '<tr><td colspan="11" class="audVazio">⚠️ Erro ao carregar dados: ' + r.error.message + '</td></tr>';
      _dados = [];
      return;
    }

    _dados = r.data || [];

    if (_dados.length) {
      var agIds = _dados.map(function (a) { return a.id; });

      /* ── 2. Recebimentos por query separada ── */
      var rReceb = await _sb.from('recebimentos')
        .select('agendamento_id,id,valor,status,forma_pagamento,data_recebimento')
        .in('agendamento_id', agIds);

      var recebMap = {};
      if (!rReceb.error && rReceb.data) {
        rReceb.data.forEach(function (rb) {
          if (!recebMap[rb.agendamento_id]) recebMap[rb.agendamento_id] = [];
          recebMap[rb.agendamento_id].push(rb);
        });
      }
      _dados.forEach(function (ag) { ag.recebimentos = recebMap[ag.id] || []; });

      /* ── 3. Nomes de pacientes por query separada (fallback) ── */
      var semNome = _dados.filter(function (ag) {
        return ag.paciente_id && !(ag.pacientes && ag.pacientes.nome_completo);
      });
      if (semNome.length) {
        var patIds = semNome.map(function (ag) { return ag.paciente_id; });
        var rPac = await _sb.from('pacientes').select('id,nome_completo').in('id', patIds);
        if (!rPac.error && rPac.data) {
          var pacMap = {};
          rPac.data.forEach(function (p) { pacMap[p.id] = p.nome_completo; });
          _dados.forEach(function (ag) {
            if (ag.paciente_id && !(ag.pacientes && ag.pacientes.nome_completo))
              ag.pacientes = { nome_completo: pacMap[ag.paciente_id] || null };
          });
        }
      }

      /* ── 4. Profissional por query separada (fallback se join falhou) ── */
      var semProf = _dados.filter(function (ag) {
        return ag.profissional_id && !(ag.profissional && ag.profissional.nome);
      });
      if (semProf.length) {
        var pfIds = semProf.map(function (ag) { return ag.profissional_id; })
          .filter(function (v, i, a) { return a.indexOf(v) === i; });
        var rProf = await _sb.from('perfis_usuarios').select('id,nome').in('id', pfIds);
        var profMap = {};
        (rProf.data || []).forEach(function (p) { profMap[p.id] = p; });
        _dados.forEach(function (ag) {
          if (ag.profissional_id && !(ag.profissional && ag.profissional.nome))
            ag.profissional = profMap[ag.profissional_id] || null;
        });
      }

      /* ── 5. Procedimento por query separada (fallback se join falhou) ── */
      var semProc = _dados.filter(function (ag) {
        return ag.procedimento_id && !(ag.procedimento && ag.procedimento.nome);
      });
      if (semProc.length) {
        var prIds = semProc.map(function (ag) { return ag.procedimento_id; })
          .filter(function (v, i, a) { return a.indexOf(v) === i; });
        var rProc = await _sb.from('procedimentos').select('id,nome,valor_repasse,tipo_repasse').in('id', prIds);
        var procMap = {};
        (rProc.data || []).forEach(function (p) { procMap[p.id] = p; });
        _dados.forEach(function (ag) {
          if (ag.procedimento_id && !(ag.procedimento && ag.procedimento.nome))
            ag.procedimento = procMap[ag.procedimento_id] || null;
        });
      }

      /* ── 6. Criadores (Recepcionistas) — busca direta por UUID sem FK hint ── */
      var crIds = _dados.map(function (ag) { return ag.criado_por; }).filter(Boolean)
        .filter(function (v, i, a) { return a.indexOf(v) === i; });
      if (crIds.length) {
        var rCriad = await _sb.from('perfis_usuarios').select('id,nome').in('id', crIds);
        var criadMap = {};
        (rCriad.data || []).forEach(function (p) { criadMap[p.id] = p.nome; });
        _dados.forEach(function (ag) { ag.criador = { nome: criadMap[ag.criado_por] || null }; });
      }
    }

    /* ── 7. Orçamentos odontológicos (recebimentos ODONTO:) ── */
    var qOdonto = _sb.from('recebimentos')
      .select('id,valor,status,forma_pagamento,observacoes,data_recebimento,criado_por')
      .eq('unidade_id', CU)
      .like('observacoes', 'ODONTO:%');
    if (ini) qOdonto = qOdonto.gte('data_recebimento', ini);
    if (fim) qOdonto = qOdonto.lte('data_recebimento', fim);
    var rOdonto = await qOdonto;
    var oRecbs = (!rOdonto.error && rOdonto.data) ? rOdonto.data : [];

    if (oRecbs.length) {
      var orcIds3 = oRecbs.map(function (rb) {
        var m = rb.observacoes.match(/^ODONTO:([^\s|]+)/i);
        return m ? m[1] : null;
      }).filter(Boolean).filter(function (v, i, a) { return a.indexOf(v) === i; });

      var orcMap3 = {};
      if (orcIds3.length) {
        var rOrcs3 = await _sb.from('orcamentos').select('id,paciente_id,profissional_id').in('id', orcIds3);
        (rOrcs3.data || []).forEach(function (o) { orcMap3[o.id] = o; });
      }

      var oPacIds3 = Object.values(orcMap3).map(function (o) { return o.paciente_id; }).filter(Boolean)
        .filter(function (v, i, a) { return a.indexOf(v) === i; });
      var oPacMap3 = {};
      if (oPacIds3.length) {
        var rOP3 = await _sb.from('pacientes').select('id,nome_completo').in('id', oPacIds3);
        (rOP3.data || []).forEach(function (p) { oPacMap3[p.id] = p.nome_completo; });
      }

      var oProfIds3 = Object.values(orcMap3).map(function (o) { return o.profissional_id; }).filter(Boolean)
        .filter(function (v, i, a) { return a.indexOf(v) === i; });
      var oProfMap3 = {};
      if (oProfIds3.length) {
        var rOPr3 = await _sb.from('perfis_usuarios').select('id,nome').in('id', oProfIds3);
        (rOPr3.data || []).forEach(function (p) { oProfMap3[p.id] = p.nome; });
      }

      var oCreatIds3 = oRecbs.map(function (rb) { return rb.criado_por; }).filter(Boolean)
        .filter(function (v, i, a) { return a.indexOf(v) === i; });
      var oCreatMap3 = {};
      if (oCreatIds3.length) {
        var rOCr3 = await _sb.from('perfis_usuarios').select('id,nome').in('id', oCreatIds3);
        (rOCr3.data || []).forEach(function (p) { oCreatMap3[p.id] = p.nome; });
      }

      var oNorm = oRecbs.map(function (rb) {
        var m = rb.observacoes.match(/^ODONTO:([^\s|]+)\s*\|\s*(.*)$/i);
        var orcId   = m ? m[1] : null;
        var descProc = m && m[2] ? m[2].substring(0, 80) : 'Odontologia';
        var orc     = orcId ? (orcMap3[orcId] || {}) : {};
        return {
          _tipo:            'odonto',
          data_agendamento: rb.data_recebimento,
          hora_inicio:      null,
          status:           'Realizado',
          valor_cobrado:    rb.valor,
          paciente_id:      orc.paciente_id || null,
          pacientes:        { nome_completo: oPacMap3[orc.paciente_id] || '—' },
          profissional:     { nome: oProfMap3[orc.profissional_id] || '—' },
          procedimento:     { nome: '🦷 ' + descProc },
          criador:          { nome: oCreatMap3[rb.criado_por] || '—' },
          recebimentos:     [{ id: rb.id, valor: rb.valor, status: rb.status,
                               forma_pagamento: rb.forma_pagamento,
                               data_recebimento: rb.data_recebimento }]
        };
      });

      _dados = _dados.concat(oNorm);
      _dados.sort(function (a, b) {
        return new Date(b.data_agendamento) - new Date(a.data_agendamento);
      });
    }

    /* ── Filtro de status (inclui odonto) ── */
    if (stFilt === 'RECEBIDO') {
      _dados = _dados.filter(function (ag) {
        if (ag._tipo === 'odonto') return ag.recebimentos[0] && ag.recebimentos[0].status === 'RECEBIDO';
        return ag.recebimentos && ag.recebimentos.some(function (rb) { return rb.status === 'RECEBIDO'; });
      });
    } else if (stFilt === 'PENDENTE') {
      _dados = _dados.filter(function (ag) {
        if (ag._tipo === 'odonto') return !ag.recebimentos[0] || ag.recebimentos[0].status !== 'RECEBIDO';
        return !ag.recebimentos || !ag.recebimentos.some(function (rb) { return rb.status === 'RECEBIDO'; });
      });
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     CÁLCULO DE REPASSE POR ATENDIMENTO
  ══════════════════════════════════════════════════════════════════ */
  function _calcRepasse (ag) {
    if (ag._tipo === 'odonto') {
      var rb0 = ag.recebimentos && ag.recebimentos[0];
      var isPago = rb0 && rb0.status === 'RECEBIDO';
      var vb = parseFloat(ag.valor_cobrado) || 0;
      return { valorBase: vb, repasse: 0, retido: vb, percRepasse: 0, receb: isPago ? rb0 : null };
    }
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

      var pac    = (ag.pacientes    && ag.pacientes.nome_completo) || '—';
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
