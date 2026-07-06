/* ════════════════════════════════════════════════════════════════════
   RELATÓRIOS — js/modules/relatorios.js
   Fontes: agendamentos + recebimentos ODONTO: + recebimentos_avulsos
   Filtros: profissional, convênio, procedimento, forma_pagamento, status
   PDF: paisagem A4 via body.rel-imprimindo + @page dinâmico
════════════════════════════════════════════════════════════════════ */
var RelatoriosMod = (function () {
  'use strict';

  var _dadosRaw  = [];
  var _dadosFilt = [];
  var _tab       = 'financeiro';
  var _profissionais = [];
  var _convenios     = [];
  var _procedimentos = [];
  var _dadosDRE = { custos: [], repasses: [] };
  var _dadosLab = { recepcoes: [] };

  var FORMAS = {
    DINHEIRO: 'Dinheiro', PIX: 'PIX',
    CREDITO:  'Cartão Crédito', DEBITO: 'Cartão Débito', CONVENIO: 'Convênio'
  };
  var STATUS_CORES = {
    'Realizado': 'var(--g6)', 'Faltou': 'var(--r6)',
    'Agendado':  'var(--b5)', 'Cancelado': 'var(--s4)'
  };

  /* ════════════════════════════════════════════════════════════
     INIT
  ════════════════════════════════════════════════════════════ */
  async function init() {
    var wrap = sid('secRelatorios');
    if (!wrap || !_sb) return;

    wrap.innerHTML = _htmlEstrutura();
    await _carregarOpcoesFiltros();

    var hoje = new Date();
    var ini  = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    var fim  = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    var iniEl = sid('relFiltIni');
    var fimEl = sid('relFiltFim');
    if (iniEl) iniEl.value = ini.toISOString().slice(0, 10);
    if (fimEl) fimEl.value = fim.toISOString().slice(0, 10);

    gerar();
  }

  /* ── HTML da estrutura ── */
  function _htmlEstrutura() {
    return (
      '<div class="secModHdr" style="flex-wrap:wrap;gap:12px;align-items:flex-end">' +
        '<div><div class="secModTitle">📊 Relatórios</div>' +
        '<div class="secModSub">Faturamento, atendimentos e produção por período</div></div>' +
        '<div class="relBtnGroup">' +
          '<button class="btn bG" onclick="RelatoriosMod.gerar()">🔄 Atualizar</button>' +
          '<button class="btn" style="background:var(--r6);color:#fff;border-color:var(--r6)" onclick="RelatoriosMod.exportarPDF()">📄 Exportar PDF</button>' +
        '</div>' +
      '</div>' +

      '<div class="relFiltros">' +
        _filtGrp('De',          '<input type="date" id="relFiltIni" class="relFiltInp">') +
        _filtGrp('Até',         '<input type="date" id="relFiltFim" class="relFiltInp">') +
        _filtGrp('Profissional','<select id="relFiltProf" class="relFiltSel"><option value="">Todos</option></select>') +
        _filtGrp('Convênio',    '<select id="relFiltConv" class="relFiltSel"><option value="">Todos</option></select>') +
        _filtGrp('Procedimento','<select id="relFiltProc" class="relFiltSel"><option value="">Todos</option></select>') +
        _filtGrp('Forma Pgto',
          '<select id="relFiltForma" class="relFiltSel">' +
            '<option value="">Todas</option><option value="DINHEIRO">Dinheiro</option>' +
            '<option value="PIX">PIX</option><option value="CREDITO">Cartão Crédito</option>' +
            '<option value="DEBITO">Cartão Débito</option><option value="CONVENIO">Convênio</option>' +
          '</select>') +
        _filtGrp('Status',
          '<select id="relFiltStatus" class="relFiltSel">' +
            '<option value="">Todos</option><option value="Realizado">Realizado</option>' +
            '<option value="Faltou">Faltou</option><option value="Agendado">Agendado</option>' +
          '</select>') +
        '<div class="relFiltGrp" style="justify-content:flex-end">' +
          '<button class="btn bP" style="height:32px;padding:0 16px;font-size:.8rem" onclick="RelatoriosMod.gerar()">Buscar</button>' +
        '</div>' +
      '</div>' +

      '<div id="relKpisWrap"></div>' +

      '<div class="relTabNav">' +
        '<button class="relTab relTabAtivo" data-tab="financeiro"   onclick="RelatoriosMod.mudarTab(\'financeiro\')"  >💰 Financeiro</button>' +
        '<button class="relTab"             data-tab="atendimentos" onclick="RelatoriosMod.mudarTab(\'atendimentos\')">📅 Atendimentos</button>' +
        '<button class="relTab"             data-tab="producao"     onclick="RelatoriosMod.mudarTab(\'producao\')"    >👩‍⚕️ Produção</button>' +
        '<button class="relTab"             data-tab="dre"          onclick="RelatoriosMod.mudarTab(\'dre\')"         >📈 DRE</button>' +
        '<button class="relTab"             data-tab="laboratorio"  onclick="RelatoriosMod.mudarTab(\'laboratorio\')" >🔬 Laboratório</button>' +
      '</div>' +

      '<div id="relPanelFinanceiro"   class="relPanel"></div>' +
      '<div id="relPanelAtendimentos" class="relPanel" style="display:none"></div>' +
      '<div id="relPanelProducao"     class="relPanel" style="display:none"></div>' +
      '<div id="relPanelDre"          class="relPanel" style="display:none"></div>' +
      '<div id="relPanelLaboratorio"  class="relPanel" style="display:none"></div>' +
      '<div id="relPrintArea"></div>'
    );
  }

  function _filtGrp(lbl, ctrl) {
    return '<div class="relFiltGrp"><label class="relFiltLbl">' + lbl + '</label>' + ctrl + '</div>';
  }

  /* ════════════════════════════════════════════════════════════
     OPÇÕES DOS SELECTS
  ════════════════════════════════════════════════════════════ */
  async function _carregarOpcoesFiltros() {
    var rs = await Promise.all([
      _sb.from('perfis_usuarios').select('id,nome').order('nome'),
      _sb.from('convenios').select('id,nome').eq('ativo', true).order('nome'),
      _sb.from('procedimentos').select('id,nome').eq('ativo', true).order('nome')
    ]);
    _profissionais = rs[0].data || [];
    _convenios     = rs[1].data || [];
    _procedimentos = rs[2].data || [];
    _populateSelects();
  }

  function _populateSelects() {
    function fill(id, arr) {
      var el = sid(id);
      if (!el) return;
      el.innerHTML = '<option value="">Todos</option>' +
        arr.map(function (x) { return '<option value="' + x.id + '">' + esc(x.nome) + '</option>'; }).join('');
    }
    fill('relFiltProf', _profissionais);
    fill('relFiltConv', _convenios);
    fill('relFiltProc', _procedimentos);
  }

  /* ════════════════════════════════════════════════════════════
     GERAR
  ════════════════════════════════════════════════════════════ */
  async function gerar() {
    var ini = ((sid('relFiltIni') || {}).value || '').trim();
    var fim = ((sid('relFiltFim') || {}).value || '').trim();
    if (!ini || !fim) { toast('Selecione o período completo.', 'error'); return; }

    var kw = sid('relKpisWrap');
    if (kw) kw.innerHTML = '<div class="relCarregando">⏳ Carregando dados…</div>';

    await Promise.all([
      _carregarDados(ini, fim),
      _carregarDadosDRE(ini, fim),
      _carregarDadosLab(ini, fim)
    ]);
    _aplicarFiltros();
    _renderKPIs();
    _renderTab(_tab);
  }

  /* ════════════════════════════════════════════════════════════
     CARREGAR DADOS (três fontes)
  ════════════════════════════════════════════════════════════ */
  async function _carregarDados(ini, fim) {
    _dadosRaw = [];

    /* ── 1. Agendamentos ── */
    var q1 = _sb.from('agendamentos')
      .select([
        'id,data_agendamento,hora_inicio,status,valor_cobrado',
        'paciente_id,profissional_id,procedimento_id,convenio_id,forma_pagamento',
        'pacientes(nome_completo)',
        'profissional:perfis_usuarios!agendamentos_profissional_id_fkey(nome)',
        'procedimento:procedimentos!agendamentos_procedimento_id_fkey(nome)',
        'convenio:convenios!agendamentos_convenio_id_fkey(nome)'
      ].join(','))
      .eq('unidade_id', CU).neq('status', 'Cancelado')
      .gte('data_agendamento', ini).lte('data_agendamento', fim)
      .order('data_agendamento', { ascending: false }).limit(2000);

    var r1 = await q1;
    if (r1.error) {
      r1 = await _sb.from('agendamentos')
        .select('id,data_agendamento,hora_inicio,status,valor_cobrado,paciente_id,profissional_id,procedimento_id,convenio_id,forma_pagamento')
        .eq('unidade_id', CU).neq('status', 'Cancelado')
        .gte('data_agendamento', ini).lte('data_agendamento', fim)
        .order('data_agendamento', { ascending: false }).limit(2000);
    }
    var ags = r1.error ? [] : (r1.data || []);
    if (ags.length) await _enriquecerNomes(ags);

    /* Recebimentos vinculados */
    var recebMap = {};
    if (ags.length) {
      var agIds = ags.map(function (a) { return a.id; });
      var rRec = await _sb.from('recebimentos')
        .select('agendamento_id,valor,status,forma_pagamento').in('agendamento_id', agIds);
      (rRec.data || []).forEach(function (rb) {
        if (!recebMap[rb.agendamento_id]) recebMap[rb.agendamento_id] = [];
        recebMap[rb.agendamento_id].push(rb);
      });
    }

    ags.forEach(function (ag) {
      var recbs = recebMap[ag.id] || [];
      var pago  = recbs.find(function (rb) { return rb.status === 'RECEBIDO'; });
      var forma = (pago && pago.forma_pagamento) || ag.forma_pagamento || null;
      _dadosRaw.push({
        _fonte: 'agendamento',
        data:   ag.data_agendamento,
        hora:   ag.hora_inicio,
        status: ag.status || 'Agendado',
        paciente_id:      ag.paciente_id,
        paciente_nome:    (ag.pacientes    && ag.pacientes.nome_completo)  || '—',
        profissional_id:  ag.profissional_id,
        profissional_nome:(ag.profissional && ag.profissional.nome)        || '—',
        procedimento_id:  ag.procedimento_id,
        procedimento_nome:(ag.procedimento && ag.procedimento.nome)        || '—',
        convenio_id:      ag.convenio_id,
        convenio_nome:    (ag.convenio     && ag.convenio.nome)            || null,
        forma_pagamento:  forma,
        valor:            parseFloat(ag.valor_cobrado) || 0,
        recebido:         !!pago
      });
    });

    /* ── 2. Odontograma (recebimentos ODONTO:) ── */
    var rOdo = await _sb.from('recebimentos')
      .select('id,valor,status,forma_pagamento,observacoes,data_recebimento')
      .eq('unidade_id', CU).like('observacoes', 'ODONTO:%')
      .gte('data_recebimento', ini).lte('data_recebimento', fim);
    var oRecbs = (rOdo.error || !rOdo.data) ? [] : rOdo.data;

    if (oRecbs.length) {
      var orcIds = oRecbs.map(function (rb) {
        var m = rb.observacoes.match(/^ODONTO:([^\s|]+)/i);
        return m ? m[1] : null;
      }).filter(Boolean);

      var orcMap = {}, odoPacMap = {}, odoProfMap = {};
      if (orcIds.length) {
        var rOrc = await _sb.from('orcamentos_odonto').select('id,paciente_id,profissional_id').in('id', orcIds);
        (rOrc.data || []).forEach(function (o) { orcMap[o.id] = o; });
        var pIds  = Object.values(orcMap).map(function (o) { return o.paciente_id;    }).filter(Boolean);
        var pfIds = Object.values(orcMap).map(function (o) { return o.profissional_id; }).filter(Boolean);
        if (pIds.length) {
          var rPac = await _sb.from('pacientes').select('id,nome_completo').in('id', pIds);
          (rPac.data || []).forEach(function (p) { odoPacMap[p.id] = p.nome_completo; });
        }
        if (pfIds.length) {
          var rPrf = await _sb.from('perfis_usuarios').select('id,nome').in('id', pfIds);
          (rPrf.data || []).forEach(function (p) { odoProfMap[p.id] = p.nome; });
        }
      }

      oRecbs.forEach(function (rb) {
        var m    = rb.observacoes.match(/^ODONTO:([^\s|]+)\s*\|\s*(.*)$/i);
        var oid  = m ? m[1] : null;
        var desc = m && m[2] ? m[2].substring(0, 80) : 'Odontologia';
        var orc  = oid ? (orcMap[oid] || {}) : {};
        _dadosRaw.push({
          _fonte: 'odonto',
          data:   rb.data_recebimento,
          hora:   null,
          status: 'Realizado',
          paciente_id:      orc.paciente_id      || null,
          paciente_nome:    odoPacMap[orc.paciente_id]      || '—',
          profissional_id:  orc.profissional_id  || null,
          profissional_nome:odoProfMap[orc.profissional_id] || '—',
          procedimento_id:  null,
          procedimento_nome:'🦷 ' + desc,
          convenio_id:      null,
          convenio_nome:    null,
          forma_pagamento:  rb.forma_pagamento,
          valor:            parseFloat(rb.valor) || 0,
          recebido:         rb.status === 'RECEBIDO'
        });
      });
    }

    /* ── 3. Recebimentos avulsos (tabela pode não existir) ── */
    try {
      var rAv = await _sb.from('recebimentos_avulsos')
        .select('id,valor,status,forma_pagamento,descricao,data_recebimento,paciente_id,profissional_id')
        .eq('unidade_id', CU)
        .gte('data_recebimento', ini).lte('data_recebimento', fim);
      if (!rAv.error && rAv.data) {
        rAv.data.forEach(function (av) {
          _dadosRaw.push({
            _fonte: 'avulso',
            data:   av.data_recebimento,
            hora:   null,
            status: 'Realizado',
            paciente_id:      av.paciente_id      || null,
            paciente_nome:    '—',
            profissional_id:  av.profissional_id  || null,
            profissional_nome:'—',
            procedimento_id:  null,
            procedimento_nome:av.descricao || 'Avulso',
            convenio_id:      null,
            convenio_nome:    null,
            forma_pagamento:  av.forma_pagamento,
            valor:            parseFloat(av.valor) || 0,
            recebido:         av.status === 'RECEBIDO'
          });
        });
      }
    } catch (_e) { /* tabela inexistente — silencioso */ }

    _dadosRaw.sort(function (a, b) { return new Date(b.data) - new Date(a.data); });
  }

  async function _enriquecerNomes(ags) {
    var semProf = ags.filter(function (a) { return a.profissional_id && !(a.profissional && a.profissional.nome); });
    var semProc = ags.filter(function (a) { return a.procedimento_id && !(a.procedimento && a.procedimento.nome); });
    var semPac  = ags.filter(function (a) { return a.paciente_id     && !(a.pacientes   && a.pacientes.nome_completo); });

    var ps = [];
    if (semProf.length) {
      var pfIds = [...new Set(semProf.map(function (a) { return a.profissional_id; }))];
      ps.push(_sb.from('perfis_usuarios').select('id,nome').in('id', pfIds).then(function (r) {
        var m = {}; (r.data || []).forEach(function (p) { m[p.id] = p; });
        semProf.forEach(function (a) { a.profissional = m[a.profissional_id] || null; });
      }));
    }
    if (semProc.length) {
      var prIds = [...new Set(semProc.map(function (a) { return a.procedimento_id; }))];
      ps.push(_sb.from('procedimentos').select('id,nome').in('id', prIds).then(function (r) {
        var m = {}; (r.data || []).forEach(function (p) { m[p.id] = p; });
        semProc.forEach(function (a) { a.procedimento = m[a.procedimento_id] || null; });
      }));
    }
    if (semPac.length) {
      var pacIds = [...new Set(semPac.map(function (a) { return a.paciente_id; }))];
      ps.push(_sb.from('pacientes').select('id,nome_completo').in('id', pacIds).then(function (r) {
        var m = {}; (r.data || []).forEach(function (p) { m[p.id] = p; });
        semPac.forEach(function (a) { a.pacientes = m[a.paciente_id] || null; });
      }));
    }
    await Promise.all(ps);
  }

  /* ════════════════════════════════════════════════════════════
     FILTROS IN-MEMORY
  ════════════════════════════════════════════════════════════ */
  function _aplicarFiltros() {
    var profId = ((sid('relFiltProf')   || {}).value || '').trim();
    var convId = ((sid('relFiltConv')   || {}).value || '').trim();
    var procId = ((sid('relFiltProc')   || {}).value || '').trim();
    var forma  = ((sid('relFiltForma')  || {}).value || '').trim();
    var status = ((sid('relFiltStatus') || {}).value || '').trim();

    _dadosFilt = _dadosRaw.filter(function (d) {
      if (profId && String(d.profissional_id) !== profId) return false;
      if (convId && String(d.convenio_id)     !== convId) return false;
      if (procId && String(d.procedimento_id) !== procId) return false;
      if (forma  && d.forma_pagamento         !== forma)  return false;
      if (status && d.status                  !== status) return false;
      return true;
    });
  }

  /* ════════════════════════════════════════════════════════════
     KPIs
  ════════════════════════════════════════════════════════════ */
  function _renderKPIs() {
    var wrap = sid('relKpisWrap');
    if (!wrap) return;

    var fat = 0, atend = 0, falt = 0, agend = 0;
    var pacIds = new Set();
    _dadosFilt.forEach(function (d) {
      agend++;
      if (d.paciente_id) pacIds.add(d.paciente_id);
      if (d.status === 'Realizado') { atend++; fat += d.valor; }
      else if (d.status === 'Faltou') falt++;
    });
    var taxa   = (atend + falt) > 0 ? Math.round(atend / (atend + falt) * 100) : 0;
    var ticket = atend > 0 ? fat / atend : 0;
    var tCor   = taxa >= 80 ? 'relKpiG' : taxa >= 60 ? 'relKpiY' : 'relKpiR';

    wrap.innerHTML = '<div class="relKpis">' +
      _kpiCard('💰', 'Faturamento Bruto', _brl(fat),    'relKpiG') +
      _kpiCard('🎫', 'Ticket Médio',      _brl(ticket), 'relKpiB') +
      _kpiCard('👤', 'Pac. Únicos',       pacIds.size,  'relKpiB') +
      _kpiCard('📅', 'Agendamentos',      agend,        '')        +
      _kpiCard('✅', 'Atendidos',         atend,        'relKpiG') +
      _kpiCard('❌', 'Faltantes',         falt,         'relKpiR') +
      _kpiCard('📊', 'Comparecimento',    taxa + '%',   tCor)      +
      '</div>';
  }

  function _kpiCard(ico, lbl, val, cor) {
    return '<div class="audKpiCard ' + cor + '">' +
      '<div style="font-size:1.1rem;margin-bottom:3px">' + ico + '</div>' +
      '<div class="audKpiVal">' + val + '</div>' +
      '<div class="audKpiLbl">' + lbl + '</div>' +
      '</div>';
  }

  /* ════════════════════════════════════════════════════════════
     TABS
  ════════════════════════════════════════════════════════════ */
  function mudarTab(tab) {
    _tab = tab;
    ['financeiro', 'atendimentos', 'producao', 'dre', 'laboratorio'].forEach(function (t) {
      var btn   = document.querySelector('.relTab[data-tab="' + t + '"]');
      var panel = sid('relPanel' + t.charAt(0).toUpperCase() + t.slice(1));
      if (btn)   btn.classList.toggle('relTabAtivo', t === tab);
      if (panel) panel.style.display = (t === tab) ? '' : 'none';
    });
    _renderTab(tab);
  }
  function _renderTab(tab) {
    if (tab === 'financeiro')        _renderFinanceiro();
    else if (tab === 'atendimentos') _renderAtendimentos();
    else if (tab === 'producao')     _renderProducao();
    else if (tab === 'dre')         _renderDRE();
    else if (tab === 'laboratorio') _renderLaboratorio();
  }

  /* ── Tab Financeiro ── */
  function _renderFinanceiro() {
    var panel = sid('relPanelFinanceiro');
    if (!panel) return;

    var formaMap = {};
    _dadosFilt.forEach(function (d) {
      if (d.status !== 'Realizado') return;
      var f = d.forma_pagamento || 'NAO_INF';
      if (!formaMap[f]) formaMap[f] = { nome: FORMAS[f] || f, total: 0, qtd: 0 };
      formaMap[f].total += d.valor;
      formaMap[f].qtd++;
    });
    var fatTot = Object.values(formaMap).reduce(function (s, f) { return s + f.total; }, 0);

    var resLinhas = Object.values(formaMap)
      .sort(function (a, b) { return b.total - a.total; })
      .map(function (f) {
        return '<tr><td>' + esc(f.nome) + '</td>' +
          '<td style="text-align:center">' + f.qtd + '</td>' +
          '<td style="text-align:right;font-weight:700">' + _brl(f.total) + '</td></tr>';
      }).join('');
    resLinhas += '<tr style="background:var(--s1);font-weight:800"><td>Total</td><td></td>' +
      '<td style="text-align:right">' + _brl(fatTot) + '</td></tr>';

    var realizados = _dadosFilt.filter(function (d) { return d.status === 'Realizado'; });
    var detLinhas = realizados.map(function (d) {
      return '<tr>' +
        '<td>' + _fmtData(d.data) + '</td>' +
        '<td>' + esc(d.paciente_nome) + '</td>' +
        '<td>' + esc(d.profissional_nome) + '</td>' +
        '<td>' + esc(d.procedimento_nome) + '</td>' +
        '<td>' + esc(d.convenio_nome || 'Particular') + '</td>' +
        '<td>' + (FORMAS[d.forma_pagamento] || d.forma_pagamento || '—') + '</td>' +
        '<td style="text-align:right;font-weight:700">' + _brl(d.valor) + '</td></tr>';
    }).join('') || '<tr><td colspan="7" class="relVazio">Nenhum lançamento no período.</td></tr>';

    panel.innerHTML =
      '<div class="relResumo">' +
        '<div class="relResumoTit">Resumo por Forma de Pagamento</div>' +
        '<table class="relTable" style="min-width:300px">' +
          '<thead><tr><th>Forma</th><th style="text-align:center">Qtd</th><th style="text-align:right">Total</th></tr></thead>' +
          '<tbody>' + resLinhas + '</tbody>' +
        '</table>' +
      '</div>' +
      '<div class="relTableWrap" style="margin-top:14px">' +
        '<table class="relTable">' +
          '<thead><tr><th>Data</th><th>Paciente</th><th>Profissional</th><th>Procedimento</th>' +
          '<th>Convênio</th><th>Forma Pgto</th><th style="text-align:right">Valor</th></tr></thead>' +
          '<tbody>' + detLinhas + '</tbody>' +
        '</table>' +
      '</div>';
  }

  /* ── Tab Atendimentos ── */
  function _renderAtendimentos() {
    var panel = sid('relPanelAtendimentos');
    if (!panel) return;

    var linhas = _dadosFilt.map(function (d) {
      var cor = STATUS_CORES[d.status] || 'var(--s5)';
      return '<tr>' +
        '<td>' + _fmtData(d.data) + '</td>' +
        '<td>' + (d.hora ? d.hora.substring(0, 5) : '—') + '</td>' +
        '<td>' + esc(d.paciente_nome) + '</td>' +
        '<td>' + esc(d.profissional_nome) + '</td>' +
        '<td>' + esc(d.procedimento_nome) + '</td>' +
        '<td>' + esc(d.convenio_nome || 'Particular') + '</td>' +
        '<td><span style="color:' + cor + ';font-weight:700">' + esc(d.status) + '</span></td>' +
        '<td style="text-align:right">' + (d.status === 'Realizado' ? _brl(d.valor) : '—') + '</td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="8" class="relVazio">Nenhum agendamento no período.</td></tr>';

    panel.innerHTML =
      '<div class="relTableWrap"><table class="relTable">' +
        '<thead><tr><th>Data</th><th>Hora</th><th>Paciente</th><th>Profissional</th>' +
        '<th>Procedimento</th><th>Convênio</th><th>Status</th><th style="text-align:right">Valor</th></tr></thead>' +
        '<tbody>' + linhas + '</tbody></table></div>';
  }

  /* ── Tab Produção por Profissional ── */
  function _renderProducao() {
    var panel = sid('relPanelProducao');
    if (!panel) return;

    var profMap = {};
    _dadosFilt.forEach(function (d) {
      var key = String(d.profissional_id || '_sem');
      if (!profMap[key]) profMap[key] = { nome: d.profissional_nome, atend: 0, falt: 0, agend: 0, fat: 0, pacIds: new Set() };
      profMap[key].agend++;
      if (d.paciente_id) profMap[key].pacIds.add(d.paciente_id);
      if (d.status === 'Realizado') { profMap[key].atend++; profMap[key].fat += d.valor; }
      else if (d.status === 'Faltou') profMap[key].falt++;
    });

    var linhas = Object.values(profMap)
      .sort(function (a, b) { return b.fat - a.fat; })
      .map(function (p) {
        var taxa   = (p.atend + p.falt) > 0 ? Math.round(p.atend / (p.atend + p.falt) * 100) : 0;
        var tCor   = taxa >= 80 ? 'var(--g6)' : taxa >= 60 ? 'var(--a5)' : 'var(--r6)';
        return '<tr>' +
          '<td><strong>' + esc(p.nome) + '</strong></td>' +
          '<td style="text-align:center">' + p.agend + '</td>' +
          '<td style="text-align:center;color:var(--g6);font-weight:700">' + p.atend + '</td>' +
          '<td style="text-align:center;color:var(--r6);font-weight:700">' + p.falt  + '</td>' +
          '<td style="text-align:center">' + p.pacIds.size + '</td>' +
          '<td style="text-align:center;color:' + tCor + ';font-weight:700">' + taxa + '%</td>' +
          '<td style="text-align:right;font-weight:700">' + _brl(p.fat) + '</td></tr>';
      }).join('') || '<tr><td colspan="7" class="relVazio">Nenhum dado no período.</td></tr>';

    panel.innerHTML =
      '<div class="relTableWrap"><table class="relTable">' +
        '<thead><tr><th>Profissional</th>' +
        '<th style="text-align:center">Agendados</th><th style="text-align:center">Atendidos</th>' +
        '<th style="text-align:center">Faltantes</th><th style="text-align:center">Pac. Únicos</th>' +
        '<th style="text-align:center">Comparecimento</th><th style="text-align:right">Faturamento</th></tr></thead>' +
        '<tbody>' + linhas + '</tbody></table></div>';
  }

  /* ════════════════════════════════════════════════════════════
     DRE — carga e render
  ════════════════════════════════════════════════════════════ */
  async function _carregarDadosDRE(ini, fim) {
    _dadosDRE = { custos: [], repasses: [] };
    try {
      var rc = await _sb.from('custos_operacionais')
        .select('id,data_lancamento,categoria,descricao,valor')
        .eq('unidade_id', CU)
        .gte('data_lancamento', ini).lte('data_lancamento', fim);
      if (!rc.error) _dadosDRE.custos = rc.data || [];
    } catch (_e) {}
    try {
      var rr = await _sb.from('repasses_profissionais')
        .select('id,profissional_id,periodo_ini,periodo_fim,valor_faturado,percentual_repasse,valor_repasse,status')
        .eq('unidade_id', CU)
        .gte('periodo_ini', ini).lte('periodo_fim', fim);
      if (!rr.error && rr.data && rr.data.length) {
        _dadosDRE.repasses = rr.data;
        var pfIds = Object.keys(rr.data.reduce(function (m, r) {
          if (r.profissional_id) m[r.profissional_id] = 1; return m;
        }, {}));
        if (pfIds.length) {
          var rp = await _sb.from('perfis_usuarios').select('id,nome').in('id', pfIds);
          var pm = {}; (rp.data || []).forEach(function (p) { pm[p.id] = p.nome; });
          _dadosDRE.repasses.forEach(function (r) { r._profNome = pm[r.profissional_id] || '—'; });
        }
      }
    } catch (_e) {}
  }

  function _renderDRE() {
    var panel = sid('relPanelDre');
    if (!panel) return;

    var fat = 0;
    _dadosFilt.forEach(function (d) { if (d.status === 'Realizado') fat += d.valor; });

    var totalCustos   = _dadosDRE.custos.reduce(function (s, c) { return s + (parseFloat(c.valor) || 0); }, 0);
    var totalRepasses = _dadosDRE.repasses.reduce(function (s, r) { return s + (parseFloat(r.valor_repasse) || 0); }, 0);
    var lucro         = fat - totalCustos - totalRepasses;
    var lucroColor    = lucro >= 0 ? 'var(--g6)' : 'var(--r6)';
    var margemColor   = lucro >= 0 ? 'var(--g6)' : 'var(--r6)';
    var margem        = fat > 0 ? Math.round(lucro / fat * 100) : 0;

    var semDados = _dadosDRE.custos.length === 0 && _dadosDRE.repasses.length === 0;
    var aviso = semDados
      ? '<div class="relAviso">⚠️ As tabelas <code>custos_operacionais</code> e <code>repasses_profissionais</code> ainda não existem ou estão vazias no período selecionado. Execute <strong>setup-dre-lab.sql</strong> no Supabase SQL Editor e cadastre os dados.</div>'
      : '';

    var catMap = {};
    _dadosDRE.custos.forEach(function (c) {
      var cat = c.categoria || 'outros';
      catMap[cat] = (catMap[cat] || 0) + (parseFloat(c.valor) || 0);
    });
    var catLinhas = Object.keys(catMap)
      .sort(function (a, b) { return catMap[b] - catMap[a]; })
      .map(function (k) {
        return '<tr><td>' + esc(k) + '</td>' +
          '<td style="text-align:right;font-weight:600">' + _brl(catMap[k]) + '</td></tr>';
      }).join('');
    if (catLinhas) {
      catLinhas += '<tr style="background:var(--s1);font-weight:800"><td>Total</td>' +
        '<td style="text-align:right">' + _brl(totalCustos) + '</td></tr>';
    }

    var repLinhas = _dadosDRE.repasses.map(function (r) {
      var st = r.status === 'pago'
        ? '<span style="color:var(--g6);font-weight:700">Pago</span>'
        : '<span style="color:var(--a5);font-weight:700">Pendente</span>';
      return '<tr>' +
        '<td>' + esc(r._profNome || '—') + '</td>' +
        '<td style="text-align:right">'    + _brl(r.valor_faturado)     + '</td>' +
        '<td style="text-align:center">'   + (r.percentual_repasse || 0) + '%</td>' +
        '<td style="text-align:right;font-weight:700">' + _brl(r.valor_repasse) + '</td>' +
        '<td style="text-align:center">'   + st + '</td></tr>';
    }).join('') || '<tr><td colspan="5" class="relVazio">Nenhum repasse cadastrado no período.</td></tr>';

    panel.innerHTML = aviso +
      '<div class="relDRE">' +
        '<div class="relDREBloco">' +
          '<div class="relDREIco">💰</div>' +
          '<div class="relDRELabel">Faturamento Bruto</div>' +
          '<div class="relDREValor" style="color:var(--g6)">' + _brl(fat) + '</div>' +
        '</div>' +
        '<div class="relDRESep">−</div>' +
        '<div class="relDREBloco">' +
          '<div class="relDREIco">📦</div>' +
          '<div class="relDRELabel">Custos Operacionais</div>' +
          '<div class="relDREValor" style="color:var(--r6)">' + _brl(totalCustos) + '</div>' +
        '</div>' +
        '<div class="relDRESep">−</div>' +
        '<div class="relDREBloco">' +
          '<div class="relDREIco">👩‍⚕️</div>' +
          '<div class="relDRELabel">Repasses</div>' +
          '<div class="relDREValor" style="color:var(--r6)">' + _brl(totalRepasses) + '</div>' +
        '</div>' +
        '<div class="relDRESep">=</div>' +
        '<div class="relDREBloco relDREDestaque">' +
          '<div class="relDREIco">📈</div>' +
          '<div class="relDRELabel">Lucro Líquido</div>' +
          '<div class="relDREValor" style="color:' + lucroColor + ';font-size:1.5rem">' + _brl(lucro) + '</div>' +
          '<div style="font-size:.78rem;color:' + margemColor + ';font-weight:700;margin-top:4px">Margem: ' + margem + '%</div>' +
        '</div>' +
      '</div>' +
      (catLinhas
        ? '<div class="relResumo" style="margin-top:16px">' +
            '<div class="relResumoTit">Custos por Categoria</div>' +
            '<table class="relTable" style="min-width:280px">' +
            '<thead><tr><th>Categoria</th><th style="text-align:right">Valor</th></tr></thead>' +
            '<tbody>' + catLinhas + '</tbody></table>' +
          '</div>'
        : '') +
      '<div class="relTableWrap" style="margin-top:16px">' +
        '<div class="relResumoTit" style="margin-bottom:8px">Repasses por Profissional</div>' +
        '<table class="relTable">' +
        '<thead><tr><th>Profissional</th>' +
        '<th style="text-align:right">Faturado</th>' +
        '<th style="text-align:center">%</th>' +
        '<th style="text-align:right">Repasse</th>' +
        '<th style="text-align:center">Status</th></tr></thead>' +
        '<tbody>' + repLinhas + '</tbody></table>' +
      '</div>';
  }

  /* ════════════════════════════════════════════════════════════
     LABORATÓRIO — carga e render
  ════════════════════════════════════════════════════════════ */
  async function _carregarDadosLab(ini, fim) {
    _dadosLab = { recepcoes: [] };
    try {
      var rl = await _sb.from('recepcao_lab')
        .select('id,paciente_id,profissional_id,laboratorio,tipo_trabalho,data_entrada,data_prevista,data_retorno,status,valor')
        .eq('unidade_id', CU)
        .gte('data_entrada', ini).lte('data_entrada', fim)
        .order('data_entrada', { ascending: false }).limit(500);
      if (!rl.error && rl.data && rl.data.length) {
        _dadosLab.recepcoes = rl.data;
        var pacSet = {}, pfSet = {};
        _dadosLab.recepcoes.forEach(function (r) {
          if (r.paciente_id)     pacSet[r.paciente_id]     = 1;
          if (r.profissional_id) pfSet[r.profissional_id]  = 1;
        });
        var ps = [];
        var pacIds2 = Object.keys(pacSet);
        var pfIds2  = Object.keys(pfSet);
        if (pacIds2.length) ps.push(_sb.from('pacientes').select('id,nome_completo').in('id', pacIds2).then(function (rp) {
          var m = {}; (rp.data || []).forEach(function (p) { m[p.id] = p.nome_completo; });
          _dadosLab.recepcoes.forEach(function (r) { r._pacNome = m[r.paciente_id] || '—'; });
        }));
        if (pfIds2.length) ps.push(_sb.from('perfis_usuarios').select('id,nome').in('id', pfIds2).then(function (rp) {
          var m = {}; (rp.data || []).forEach(function (p) { m[p.id] = p.nome; });
          _dadosLab.recepcoes.forEach(function (r) { r._profNome = m[r.profissional_id] || '—'; });
        }));
        if (ps.length) await Promise.all(ps);
      }
    } catch (_e) {}
  }

  function _renderLaboratorio() {
    var panel = sid('relPanelLaboratorio');
    if (!panel) return;

    var recs = _dadosLab.recepcoes;
    var semDados = recs.length === 0;
    var aviso = semDados
      ? '<div class="relAviso">⚠️ A tabela <code>recepcao_lab</code> ainda não foi criada ou não há registros no período selecionado. Execute <strong>setup-dre-lab.sql</strong> no Supabase SQL Editor para habilitar este módulo.</div>'
      : '';

    var total    = recs.length;
    var emProd   = recs.filter(function (r) { return r.status === 'em_producao';    }).length;
    var aguard   = recs.filter(function (r) { return r.status === 'aguardando_laudo'; }).length;
    var entregue = recs.filter(function (r) { return r.status === 'entregue';       }).length;
    var refeito  = recs.filter(function (r) { return r.status === 'refeito';        }).length;

    var slaList = recs.filter(function (r) { return r.data_entrada && r.data_retorno; })
      .map(function (r) { return Math.round((new Date(r.data_retorno) - new Date(r.data_entrada)) / 86400000); });
    var slaMedia = slaList.length
      ? Math.round(slaList.reduce(function (s, v) { return s + v; }, 0) / slaList.length)
      : null;

    var TIPOS_LAB = { em_producao: '🔧 Em Produção', aguardando_laudo: '⏳ Aguardando', entregue: '✅ Entregue', refeito: '🔄 Refeito' };
    var labLinhas = recs.map(function (r) {
      return '<tr>' +
        '<td>' + _fmtData(r.data_entrada) + '</td>' +
        '<td>' + esc(r._pacNome  || '—') + '</td>' +
        '<td>' + esc(r._profNome || '—') + '</td>' +
        '<td>' + esc(r.laboratorio   || '—') + '</td>' +
        '<td>' + esc(r.tipo_trabalho || '—') + '</td>' +
        '<td>' + _fmtData(r.data_prevista) + '</td>' +
        '<td>' + (TIPOS_LAB[r.status] || r.status || '—') + '</td>' +
        '<td style="text-align:right">' + (r.valor ? _brl(r.valor) : '—') + '</td></tr>';
    }).join('') || '<tr><td colspan="8" class="relVazio">Nenhum trabalho laboratorial no período.</td></tr>';

    panel.innerHTML = aviso +
      '<div class="relLabFunil">' +
        _kpiCard('📥', 'Recebidos',       total,    '') +
        _kpiCard('🔧', 'Em Produção',     emProd,   '') +
        _kpiCard('⏳', 'Aguardando',      aguard,   '') +
        _kpiCard('✅', 'Entregues',       entregue, 'relKpiG') +
        _kpiCard('🔄', 'Refeitos',        refeito,  refeito > 0 ? 'relKpiR' : '') +
        (slaMedia !== null ? _kpiCard('⏱', 'SLA Médio', slaMedia + 'd', '') : '') +
      '</div>' +
      '<div class="relTableWrap" style="margin-top:16px">' +
        '<table class="relTable">' +
        '<thead><tr>' +
        '<th>Entrada</th><th>Paciente</th><th>Profissional</th><th>Laboratório</th>' +
        '<th>Tipo</th><th>Previsão</th><th>Status</th><th style="text-align:right">Valor</th>' +
        '</tr></thead>' +
        '<tbody>' + labLinhas + '</tbody></table>' +
      '</div>';
  }

  /* ════════════════════════════════════════════════════════════
     PDF — paisagem A4 com logo
  ════════════════════════════════════════════════════════════ */
  function exportarPDF() {
    var ini = ((sid('relFiltIni') || {}).value || '');
    var fim = ((sid('relFiltFim') || {}).value || '');
    var u   = (typeof UNITS !== 'undefined' ? UNITS : []).find(function (x) { return x.id === CU; });
    var unidNome = u ? u.name : 'Clínica';
    var gerado   = new Date().toLocaleString('pt-BR');

    var fat = 0, atend = 0, falt = 0, agend = 0;
    var pacIds = new Set();
    _dadosFilt.forEach(function (d) {
      agend++;
      if (d.paciente_id) pacIds.add(d.paciente_id);
      if (d.status === 'Realizado') { atend++; fat += d.valor; }
      else if (d.status === 'Faltou') falt++;
    });
    var taxa   = (atend + falt) > 0 ? Math.round(atend / (atend + falt) * 100) : 0;
    var ticket = atend > 0 ? fat / atend : 0;

    var linhasPrint = _dadosFilt.map(function (d) {
      return '<tr>' +
        '<td>' + _fmtData(d.data) + '</td>' +
        '<td>' + esc(d.paciente_nome) + '</td>' +
        '<td>' + esc(d.profissional_nome) + '</td>' +
        '<td>' + esc(d.procedimento_nome) + '</td>' +
        '<td>' + esc(d.convenio_nome || 'Particular') + '</td>' +
        '<td>' + (FORMAS[d.forma_pagamento] || d.forma_pagamento || '—') + '</td>' +
        '<td>' + esc(d.status) + '</td>' +
        '<td style="text-align:right">' + (d.status === 'Realizado' ? _brl(d.valor) : '—') + '</td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="8">Nenhum registro no período.</td></tr>';

    var area = sid('relPrintArea');
    if (area) {
      area.innerHTML =
        '<div class="relPrintHdr">' +
          '<div class="relPrintLogo">🏥 ' + esc(unidNome) + '</div>' +
          '<div class="relPrintMeta">' +
            '<div class="relPrintTit">Relatório Gerencial</div>' +
            '<div class="relPrintSub">Período: ' + _fmtData(ini) + ' a ' + _fmtData(fim) + '</div>' +
            '<div class="relPrintGen">Gerado em: ' + gerado + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="relPrintKpis">' +
          _kpiPrint('Faturamento Bruto', _brl(fat))      +
          _kpiPrint('Ticket Médio',      _brl(ticket))   +
          _kpiPrint('Pac. Únicos',       pacIds.size)    +
          _kpiPrint('Agendamentos',      agend)          +
          _kpiPrint('Atendidos',         atend)          +
          _kpiPrint('Faltantes',         falt)           +
          _kpiPrint('Comparecimento',    taxa + '%')     +
        '</div>' +
        '<table class="relPrintTable">' +
          '<thead><tr><th>Data</th><th>Paciente</th><th>Profissional</th><th>Procedimento</th>' +
          '<th>Convênio</th><th>Forma Pgto</th><th>Status</th><th>Valor</th></tr></thead>' +
          '<tbody>' + linhasPrint + '</tbody>' +
        '</table>';
    }

    /* Injeta @page landscape dinamicamente para não conflitar com outros prints */
    var ps = document.createElement('style');
    ps.id = 'relPageStyle';
    ps.textContent = '@page { size: A4 landscape; margin: 12mm 10mm; }';
    document.head.appendChild(ps);
    document.body.classList.add('rel-imprimindo');

    window.onafterprint = function () {
      document.body.classList.remove('rel-imprimindo');
      var s = document.getElementById('relPageStyle');
      if (s) s.remove();
      window.onafterprint = null;
    };

    window.print();
  }

  function _kpiPrint(lbl, val) {
    return '<div class="relPrintKpi"><span class="relPkVal">' + val + '</span><span class="relPkLbl">' + lbl + '</span></div>';
  }

  /* ── Helpers ── */
  function _brl(v) {
    return 'R$ ' + (parseFloat(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function _fmtData(s) {
    if (!s) return '—';
    var p = String(s).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : s;
  }

  return { init: init, gerar: gerar, mudarTab: mudarTab, exportarPDF: exportarPDF };
})();
