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
      '</div>' +

      '<div id="relPanelFinanceiro"   class="relPanel"></div>' +
      '<div id="relPanelAtendimentos" class="relPanel" style="display:none"></div>' +
      '<div id="relPanelProducao"     class="relPanel" style="display:none"></div>' +
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

    await _carregarDados(ini, fim);
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
    ['financeiro', 'atendimentos', 'producao'].forEach(function (t) {
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
