/* ═══════════════════════════════════════════════════════════════════════
   GESTÃO DRE — js/modules/admin-dre.js
   Abas: Custos Operacionais | Laboratório
   Repasses de profissionais são calculados automaticamente via procedimentos.
   Depende de: supabase.js (_sb), main.js (sid, esc, toast, CU)
═══════════════════════════════════════════════════════════════════════ */
var AdminDREMod = (function () {
  'use strict';

  var _aba           = 'custos';
  var _custos        = [];
  var _lab           = [];
  var _profissionais = [];
  var _pacientes     = [];
  var _salvando      = false;

  var CATS_CUSTO = ['aluguel','material','equipamento','pessoal','marketing','outros'];
  var STATUS_LAB = {
    em_producao:     '🔧 Em Produção',
    aguardando_laudo:'⏳ Aguardando Laudo',
    entregue:        '✅ Entregue',
    refeito:         '🔄 Refeito'
  };

  function _hoje() { return new Date().toISOString().split('T')[0]; }
  function _brl(v) {
    return 'R$ ' + (parseFloat(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function _fmtData(s) {
    if (!s) return '—';
    var p = String(s).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : s;
  }

  /* ══════════════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════════════ */
  async function init() {
    var wrap = sid('secAdminDRE');
    if (!wrap || !_sb) return;
    wrap.innerHTML = _htmlEstrutura();
    await _carregarAuxiliares();
    trocarAba('custos');
  }

  function _htmlEstrutura() {
    return (
      '<div class="secModHdr">' +
        '<div>' +
          '<div class="secModTitle">💹 Gestão DRE</div>' +
          '<div class="secModSub">Custos operacionais e laboratório</div>' +
        '</div>' +
      '</div>' +
      '<div class="relTabNav" style="margin-bottom:0">' +
        '<button class="relTab relTabAtivo" data-aba="custos" onclick="AdminDREMod.trocarAba(\'custos\')">📦 Custos</button>' +
        '<button class="relTab"             data-aba="lab"    onclick="AdminDREMod.trocarAba(\'lab\')"   >🔬 Laboratório</button>' +
      '</div>' +
      '<div id="dreSecCustos" class="dreSection"></div>' +
      '<div id="dreSecLab"    class="dreSection" style="display:none"></div>'
    );
  }

  /* ══════════════════════════════════════════════════════════════════
     TROCA DE ABA
  ══════════════════════════════════════════════════════════════════ */
  function trocarAba(aba) {
    _aba = aba;
    document.querySelectorAll('#secAdminDRE .relTab').forEach(function (el) {
      el.classList.toggle('relTabAtivo', el.dataset.aba === aba);
    });
    ['custos', 'lab'].forEach(function (a) {
      var sec = sid('dreSec' + a.charAt(0).toUpperCase() + a.slice(1));
      if (sec) sec.style.display = a === aba ? '' : 'none';
    });
    if (aba === 'custos') _carregarCustos();
    if (aba === 'lab')    _carregarLab();
  }

  /* ══════════════════════════════════════════════════════════════════
     AUXILIARES
  ══════════════════════════════════════════════════════════════════ */
  async function _carregarAuxiliares() {
    var rs = await Promise.all([
      _sb.from('perfis_usuarios').select('id,nome').order('nome'),
      _sb.from('pacientes').select('id,nome_completo').order('nome_completo').limit(500)
    ]);
    _profissionais = rs[0].data || [];
    _pacientes     = rs[1].data || [];
  }

  function _optsProf(val) {
    return '<option value="">— Profissional —</option>' +
      _profissionais.map(function (p) {
        return '<option value="' + p.id + '"' + (p.id === val ? ' selected' : '') + '>' + esc(p.nome) + '</option>';
      }).join('');
  }

  function _optsPac(val) {
    return '<option value="">— Paciente —</option>' +
      _pacientes.map(function (p) {
        return '<option value="' + p.id + '"' + (p.id === val ? ' selected' : '') + '>' + esc(p.nome_completo) + '</option>';
      }).join('');
  }

  /* ══════════════════════════════════════════════════════════════════
     ABA: CUSTOS OPERACIONAIS
  ══════════════════════════════════════════════════════════════════ */
  async function _carregarCustos() {
    var sec = sid('dreSecCustos');
    if (!sec) return;
    sec.innerHTML = '<div class="dreLoading">⏳ Carregando…</div>';

    var r = await _sb.from('custos_operacionais')
      .select('id,data_lancamento,categoria,descricao,valor')
      .eq('unidade_id', CU)
      .order('data_lancamento', { ascending: false })
      .limit(300);

    _custos = r.error ? [] : (r.data || []);
    _renderCustos();
  }

  function _renderCustos() {
    var sec = sid('dreSecCustos');
    if (!sec) return;

    var total = _custos.reduce(function (s, c) { return s + (parseFloat(c.valor) || 0); }, 0);

    var linhas = _custos.map(function (c) {
      return '<tr>' +
        '<td>' + _fmtData(c.data_lancamento) + '</td>' +
        '<td><span class="dreBadge">' + esc(c.categoria || '—') + '</span></td>' +
        '<td>' + esc(c.descricao || '—') + '</td>' +
        '<td style="text-align:right;font-weight:700">' + _brl(c.valor) + '</td>' +
        '<td style="text-align:center">' +
          '<button class="btn bSm bDng" onclick="AdminDREMod.excluirCusto(\'' + c.id + '\')">🗑</button>' +
        '</td></tr>';
    }).join('') || '<tr><td colspan="5" class="relVazio">Nenhum custo cadastrado.</td></tr>';

    sec.innerHTML =
      '<div class="dreToolbar">' +
        '<strong>' + _custos.length + ' registros</strong> &nbsp;|&nbsp; Total: <strong>' + _brl(total) + '</strong>' +
        '<button class="btn bG bSm" onclick="AdminDREMod.abrirFormCusto()">+ Novo Custo</button>' +
      '</div>' +
      '<div class="relTableWrap"><table class="relTable">' +
        '<thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th style="text-align:right">Valor</th><th></th></tr></thead>' +
        '<tbody>' + linhas + '</tbody>' +
      '</table></div>' +
      '<div id="dreFormCusto" class="dreForm" style="display:none">' +
        '<div class="dreFormTit">📦 Novo Custo Operacional</div>' +
        '<div class="dreFormGrid">' +
          '<div class="patFG"><label class="afLabel">Data *</label>' +
            '<input type="date" id="dreCustoData" class="afInp" value="' + _hoje() + '"/></div>' +
          '<div class="patFG"><label class="afLabel">Categoria *</label>' +
            '<select id="dreCustoCateg" class="afInp">' +
              CATS_CUSTO.map(function (c) { return '<option value="' + c + '">' + c + '</option>'; }).join('') +
            '</select></div>' +
          '<div class="patFG"><label class="afLabel">Valor (R$) *</label>' +
            '<input type="number" id="dreCustoValor" class="afInp" placeholder="0,00" min="0" step="0.01"/></div>' +
          '<div class="patFG" style="grid-column:1/-1"><label class="afLabel">Descrição</label>' +
            '<input type="text" id="dreCustoDesc" class="afInp" placeholder="Ex: Aluguel sala 1 — julho"/></div>' +
        '</div>' +
        '<div class="dreFormBtns">' +
          '<button class="btn bGh bSm" onclick="AdminDREMod.fecharFormCusto()">Cancelar</button>' +
          '<button class="btn bG bSm" id="dreBtnSalvarCusto" onclick="AdminDREMod.salvarCusto()">💾 Salvar</button>' +
        '</div>' +
      '</div>';
  }

  function abrirFormCusto() {
    var f = sid('dreFormCusto');
    if (f) { f.style.display = ''; f.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  }

  function fecharFormCusto() {
    var f = sid('dreFormCusto');
    if (f) f.style.display = 'none';
  }

  async function salvarCusto() {
    if (_salvando) return;
    var data  = (sid('dreCustoData')  || {}).value || '';
    var categ = (sid('dreCustoCateg') || {}).value || '';
    var valor = parseFloat((sid('dreCustoValor') || {}).value || '0');
    var desc  = (sid('dreCustoDesc')  || {}).value || '';

    if (!data || !categ || valor <= 0) { toast('Preencha data, categoria e valor.', 'error'); return; }

    _salvando = true;
    var btn = sid('dreBtnSalvarCusto');
    if (btn) btn.disabled = true;

    var r = await _sb.from('custos_operacionais').insert({
      unidade_id: CU, data_lancamento: data,
      categoria: categ, descricao: desc || null, valor: valor
    });

    _salvando = false;
    if (btn) btn.disabled = false;

    if (r.error) { toast('Erro ao salvar: ' + r.error.message, 'error'); return; }
    toast('Custo registrado!', 'success');
    _carregarCustos();
  }

  async function excluirCusto(id) {
    if (!confirm('Excluir este custo?')) return;
    var r = await _sb.from('custos_operacionais').delete().eq('id', id);
    if (r.error) { toast('Erro: ' + r.error.message, 'error'); return; }
    toast('Excluído.', 'success');
    _carregarCustos();
  }

  /* ══════════════════════════════════════════════════════════════════
     ABA: LABORATÓRIO
  ══════════════════════════════════════════════════════════════════ */
  async function _carregarLab() {
    var sec = sid('dreSecLab');
    if (!sec) return;
    sec.innerHTML = '<div class="dreLoading">⏳ Carregando…</div>';

    var r = await _sb.from('recepcao_lab')
      .select('id,paciente_id,profissional_id,laboratorio,tipo_trabalho,data_entrada,data_prevista,data_retorno,status,valor')
      .eq('unidade_id', CU)
      .order('data_entrada', { ascending: false })
      .limit(300);

    _lab = r.error ? [] : (r.data || []);

    if (_lab.length) {
      var pm = {}, pacM = {};
      _profissionais.forEach(function (p) { pm[p.id] = p.nome; });
      _pacientes.forEach(function (p) { pacM[p.id] = p.nome_completo; });
      _lab.forEach(function (x) {
        x._profNome = pm[x.profissional_id] || '—';
        x._pacNome  = pacM[x.paciente_id]   || '—';
      });
    }

    _renderLab();
  }

  function _renderLab() {
    var sec = sid('dreSecLab');
    if (!sec) return;

    var emProd   = _lab.filter(function (x) { return x.status === 'em_producao';     }).length;
    var aguard   = _lab.filter(function (x) { return x.status === 'aguardando_laudo'; }).length;
    var entregue = _lab.filter(function (x) { return x.status === 'entregue';         }).length;
    var refeito  = _lab.filter(function (x) { return x.status === 'refeito';          }).length;

    var linhas = _lab.map(function (x) {
      var stLabel = STATUS_LAB[x.status] || x.status || '—';
      var stBtns = '';
      if (x.status === 'em_producao')      stBtns = '<button class="btn bSm" onclick="AdminDREMod.atualizarStatusLab(\'' + x.id + '\',\'aguardando_laudo\')">→ Aguardando</button> ';
      if (x.status === 'aguardando_laudo') stBtns = '<button class="btn bSm bG" onclick="AdminDREMod.atualizarStatusLab(\'' + x.id + '\',\'entregue\')">→ Entregar</button> ';
      return '<tr>' +
        '<td>' + _fmtData(x.data_entrada) + '</td>' +
        '<td>' + esc(x._pacNome) + '</td>' +
        '<td>' + esc(x._profNome) + '</td>' +
        '<td>' + esc(x.laboratorio || '—') + '</td>' +
        '<td>' + esc(x.tipo_trabalho || '—') + '</td>' +
        '<td>' + _fmtData(x.data_prevista) + '</td>' +
        '<td>' + stLabel + '</td>' +
        '<td style="text-align:right">' + (x.valor ? _brl(x.valor) : '—') + '</td>' +
        '<td style="white-space:nowrap">' + stBtns +
          '<button class="btn bSm bDng" onclick="AdminDREMod.excluirLab(\'' + x.id + '\')">🗑</button>' +
        '</td></tr>';
    }).join('') || '<tr><td colspan="9" class="relVazio">Nenhum trabalho laboratorial cadastrado.</td></tr>';

    sec.innerHTML =
      '<div class="dreLabKpis">' +
        '<div class="audKpiCard"><div class="audKpiVal">' + _lab.length + '</div><div class="audKpiLbl">Total</div></div>' +
        '<div class="audKpiCard"><div class="audKpiVal">' + emProd + '</div><div class="audKpiLbl">Em Produção</div></div>' +
        '<div class="audKpiCard"><div class="audKpiVal">' + aguard + '</div><div class="audKpiLbl">Aguardando</div></div>' +
        '<div class="audKpiCard relKpiG"><div class="audKpiVal">' + entregue + '</div><div class="audKpiLbl">Entregues</div></div>' +
        (refeito > 0 ? '<div class="audKpiCard relKpiR"><div class="audKpiVal">' + refeito + '</div><div class="audKpiLbl">Refeitos</div></div>' : '') +
      '</div>' +
      '<div class="dreToolbar" style="margin-top:12px">' +
        '<span></span>' +
        '<button class="btn bG bSm" onclick="AdminDREMod.abrirFormLab()">+ Novo Trabalho</button>' +
      '</div>' +
      '<div class="relTableWrap"><table class="relTable">' +
        '<thead><tr>' +
          '<th>Entrada</th><th>Paciente</th><th>Profissional</th>' +
          '<th>Laboratório</th><th>Tipo</th><th>Previsão</th>' +
          '<th>Status</th><th style="text-align:right">Valor</th><th></th>' +
        '</tr></thead>' +
        '<tbody>' + linhas + '</tbody>' +
      '</table></div>' +
      '<div id="dreFormLab" class="dreForm" style="display:none">' +
        '<div class="dreFormTit">🔬 Novo Trabalho Laboratorial</div>' +
        '<div class="dreFormGrid">' +
          '<div class="patFG"><label class="afLabel">Paciente *</label>' +
            '<select id="dreLabPac" class="afInp">' + _optsPac('') + '</select></div>' +
          '<div class="patFG"><label class="afLabel">Profissional *</label>' +
            '<select id="dreLabProf" class="afInp">' + _optsProf('') + '</select></div>' +
          '<div class="patFG"><label class="afLabel">Laboratório</label>' +
            '<input type="text" id="dreLabNome" class="afInp" placeholder="Nome do laboratório"/></div>' +
          '<div class="patFG"><label class="afLabel">Tipo de Trabalho</label>' +
            '<input type="text" id="dreLabTipo" class="afInp" placeholder="Ex: Coroa, Prótese, Faceta…"/></div>' +
          '<div class="patFG"><label class="afLabel">Data Entrada *</label>' +
            '<input type="date" id="dreLabEntrada" class="afInp" value="' + _hoje() + '"/></div>' +
          '<div class="patFG"><label class="afLabel">Previsão Retorno</label>' +
            '<input type="date" id="dreLabPrevista" class="afInp"/></div>' +
          '<div class="patFG"><label class="afLabel">Valor (R$)</label>' +
            '<input type="number" id="dreLabValor" class="afInp" placeholder="0,00" min="0" step="0.01"/></div>' +
        '</div>' +
        '<div class="dreFormBtns">' +
          '<button class="btn bGh bSm" onclick="AdminDREMod.fecharFormLab()">Cancelar</button>' +
          '<button class="btn bG bSm" id="dreBtnSalvarLab" onclick="AdminDREMod.salvarLab()">💾 Salvar</button>' +
        '</div>' +
      '</div>';
  }

  function abrirFormLab() {
    var f = sid('dreFormLab');
    if (f) { f.style.display = ''; f.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  }

  function fecharFormLab() {
    var f = sid('dreFormLab');
    if (f) f.style.display = 'none';
  }

  async function salvarLab() {
    if (_salvando) return;
    var pacId    = (sid('dreLabPac')      || {}).value || '';
    var profId   = (sid('dreLabProf')     || {}).value || '';
    var labNome  = (sid('dreLabNome')     || {}).value || '';
    var tipo     = (sid('dreLabTipo')     || {}).value || '';
    var entrada  = (sid('dreLabEntrada')  || {}).value || '';
    var prevista = (sid('dreLabPrevista') || {}).value || '';
    var valor    = parseFloat((sid('dreLabValor') || {}).value || '0') || null;

    if (!pacId || !profId || !entrada) {
      toast('Preencha paciente, profissional e data de entrada.', 'error'); return;
    }

    _salvando = true;
    var btn = sid('dreBtnSalvarLab');
    if (btn) btn.disabled = true;

    var r = await _sb.from('recepcao_lab').insert({
      unidade_id: CU, paciente_id: pacId, profissional_id: profId,
      laboratorio: labNome || null, tipo_trabalho: tipo || null,
      data_entrada: entrada, data_prevista: prevista || null,
      valor: valor, status: 'em_producao'
    });

    _salvando = false;
    if (btn) btn.disabled = false;

    if (r.error) { toast('Erro: ' + r.error.message, 'error'); return; }
    toast('Trabalho cadastrado!', 'success');
    _carregarLab();
  }

  async function atualizarStatusLab(id, novoStatus) {
    var payload = { status: novoStatus };
    if (novoStatus === 'entregue') payload.data_retorno = _hoje();
    var r = await _sb.from('recepcao_lab').update(payload).eq('id', id);
    if (r.error) { toast('Erro: ' + r.error.message, 'error'); return; }
    toast('Status atualizado.', 'success');
    _carregarLab();
  }

  async function excluirLab(id) {
    if (!confirm('Excluir este trabalho?')) return;
    var r = await _sb.from('recepcao_lab').delete().eq('id', id);
    if (r.error) { toast('Erro: ' + r.error.message, 'error'); return; }
    toast('Excluído.', 'success');
    _carregarLab();
  }

  return {
    init: init, trocarAba: trocarAba,
    abrirFormCusto: abrirFormCusto, fecharFormCusto: fecharFormCusto, salvarCusto: salvarCusto, excluirCusto: excluirCusto,
    abrirFormLab: abrirFormLab, fecharFormLab: fecharFormLab, salvarLab: salvarLab, atualizarStatusLab: atualizarStatusLab, excluirLab: excluirLab
  };
})();
