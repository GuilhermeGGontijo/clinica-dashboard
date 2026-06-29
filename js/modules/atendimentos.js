/* ═══════════════════════════════════════════════════════════════════════
   PAINEL DE CONTROLE CLÍNICO — js/modules/atendimentos.js
   AtendMod: CRUD de Consultas, Procedimentos e Exames por unidade
   Depende de: supabase.js (_sb), main.js (sid, esc, toast, CU, USER_ROLE)
═══════════════════════════════════════════════════════════════════════ */

const AtendMod = (function () {
  'use strict';

  var _itens   = [];
  var _tipo    = 'consulta';
  var _editId  = null;

  var TIPOS = {
    consulta:     { label: 'Consulta',     ico: '🩺' },
    procedimento: { label: 'Procedimento', ico: '💉' },
    exame:        { label: 'Exame',        ico: '🔬' }
  };

  /* ── Init ── */
  async function init () {
    if (!_sb) return;
    var u = (typeof UNITS !== 'undefined' ? UNITS : []).find(function(x){ return x.id === CU; });
    var el = sid('atdUnitLabel'); if (el) el.textContent = u ? u.name : CU;
    await _carregar();
    _render();
  }

  /* ── Carregar da unidade atual filtrado por tipo ── */
  async function _carregar () {
    var r = await _sb.from('procedimentos')
      .select('*')
      .eq('unidade_id', CU)
      .eq('tipo', _tipo)
      .order('nome');
    _itens = r.data || [];
  }

  /* ── Renderizar lista ── */
  function _render () {
    var wrap = sid('atdListWrap');
    if (!wrap) return;

    /* ativa tab correta */
    Object.keys(TIPOS).forEach(function (t) {
      var btn = sid('atdTab_' + t);
      if (btn) btn.classList.toggle('atdTabAct', t === _tipo);
    });

    if (!_itens.length) {
      wrap.innerHTML = '<div class="atdVazio">Nenhum ' + TIPOS[_tipo].label.toLowerCase()
        + ' cadastrado. Clique em <strong>➕ Novo</strong> para começar.</div>';
      return;
    }

    var rows = _itens.map(function (item) {
      var valor    = item.valor_padrao  || 0;
      var repasse  = item.valor_repasse || 0;
      var isPct    = item.tipo_repasse === 'percentual';
      var repasseVal = isPct ? (valor * repasse / 100) : repasse;
      var clinica    = valor - repasseVal;

      var valorFmt   = _fmtBRL(valor);
      var repasseFmt = isPct ? _fmtPct(repasse) : _fmtBRL(repasse);
      var clinicaFmt = _fmtBRL(clinica);

      return '<tr>'
        + '<td class="atdNome">' + esc(item.nome) + '</td>'
        + '<td class="atdVal">' + valorFmt + '</td>'
        + '<td class="atdVal">' + repasseFmt
        +   '<span class="atdBadgeTipo">' + (isPct ? '%' : 'R$') + '</span>'
        + '</td>'
        + '<td class="atdVal atdClinica">' + clinicaFmt + '</td>'
        + '<td class="atdAcoes">'
        +   '<button class="btn bGh bSm" onclick="AtendMod.abrirEditar(\'' + item.id + '\')" title="Editar">✏️</button>'
        +   '<button class="btn bSm" style="background:var(--r1);color:var(--r6);border:1px solid var(--r3)" '
        +     'onclick="AtendMod.excluir(\'' + item.id + '\')" title="Excluir">🗑️</button>'
        + '</td>'
        + '</tr>';
    }).join('');

    wrap.innerHTML = '<table class="atdTable">'
      + '<thead><tr>'
      + '<th>Nome</th>'
      + '<th style="width:130px">Valor</th>'
      + '<th style="width:150px">Repasse Profissional</th>'
      + '<th style="width:140px">Para a Clínica</th>'
      + '<th style="width:100px">Ações</th>'
      + '</tr></thead>'
      + '<tbody>' + rows + '</tbody>'
      + '</table>';
  }

  /* ── Trocar aba ── */
  async function setTipo (t) {
    _tipo = t;
    var tInfo = TIPOS[t] || TIPOS.consulta;
    var titulo = sid('atdSecTitulo');
    if (titulo) titulo.textContent = tInfo.ico + ' ' + tInfo.label + 's Cadastradas';
    var newBtn = sid('atdBtnNovo');
    if (newBtn) newBtn.textContent = '➕ Nova ' + tInfo.label;
    await _carregar();
    _render();
  }

  /* ── Abrir modal novo ── */
  function abrirNovo () {
    _editId = null;
    _preencherModal(null);
    _abrirModal();
  }

  /* ── Abrir modal editar ── */
  function abrirEditar (id) {
    var item = _itens.find(function (x) { return x.id === id; });
    if (!item) return;
    _editId = id;
    _preencherModal(item);
    _abrirModal();
  }

  function _preencherModal (item) {
    var tInfo = TIPOS[_tipo] || TIPOS.consulta;
    var titulo = sid('atdModalTitulo');
    if (titulo) titulo.textContent = (item ? '✏️ Editar' : '➕ Novo') + ' — ' + tInfo.label;

    var nome = sid('atdNomeInp');
    if (nome) nome.value = item ? item.nome : '';

    var valor = sid('atdValorInp');
    if (valor) valor.value = item ? _fmtValorInp(item.valor_padrao || 0) : '';

    var tipoRep = item ? (item.tipo_repasse || 'fixo') : 'fixo';
    _setTipoRepasse(tipoRep, false);

    var repInp = sid('atdRepasseInp');
    if (repInp) repInp.value = item ? _fmtValorInp(item.valor_repasse || 0) : '';
  }

  /* ── Toggle tipo repasse (fixo / percentual) ── */
  function _setTipoRepasse (tipo, foco) {
    var btnFixo = sid('atdBtnFixo');
    var btnPct  = sid('atdBtnPct');
    var prefix  = sid('atdRepassePrefix');
    var suffix  = sid('atdRepasseSuffix');

    if (btnFixo) btnFixo.classList.toggle('atdToggleAct', tipo === 'fixo');
    if (btnPct)  btnPct.classList.toggle('atdToggleAct',  tipo === 'percentual');
    if (prefix)  prefix.textContent  = tipo === 'fixo' ? 'R$' : '';
    if (suffix)  suffix.textContent  = tipo === 'percentual' ? '%' : '';

    var inp = sid('atdRepasseInp');
    if (inp) {
      inp.placeholder = tipo === 'fixo' ? '0,00' : '0,00';
      inp.dataset.tipoRepasse = tipo;
      if (foco !== false) inp.focus();
    }
  }

  function toggleRepasse (tipo) {
    _setTipoRepasse(tipo, true);
  }

  function _abrirModal () {
    var m = sid('modalAtend');
    if (m) m.classList.add('open');
    setTimeout(function () { var n = sid('atdNomeInp'); if (n) n.focus(); }, 60);
  }

  function fecharModal () {
    var m = sid('modalAtend');
    if (m) m.classList.remove('open');
    _editId = null;
  }

  /* ── Formatar input de valor (para exibir no campo) ── */
  function _fmtValorInp (v) {
    if (!v && v !== 0) return '';
    return Number(v).toFixed(2).replace('.', ',');
  }

  /* ── Parsear valor digitado (virgula -> ponto) ── */
  function _parseValor (s) {
    if (!s) return 0;
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  }

  /* ── Formatar BRL ── */
  function _fmtBRL (v) {
    return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /* ── Formatar percentual ── */
  function _fmtPct (v) {
    return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /* ── Formatar campo valor enquanto digita ── */
  function fmtInput (el) {
    var raw = el.value.replace(/\D/g, '');
    if (!raw) { el.value = ''; return; }
    var num = parseInt(raw, 10) / 100;
    el.value = num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /* ── Salvar ── */
  async function salvar () {
    if (USER_ROLE !== 'administrador') {
      toast('Apenas administradores podem gerenciar atendimentos', 'warn');
      return;
    }

    var nome  = ((sid('atdNomeInp')   || {}).value || '').trim();
    var valor = _parseValor((sid('atdValorInp') || {}).value || '');
    var inp   = sid('atdRepasseInp');
    var tipoR = (inp ? inp.dataset.tipoRepasse : null) || 'fixo';
    var repasse = _parseValor((inp || {}).value || '');

    if (!nome) { toast('Digite o nome', 'warn'); sid('atdNomeInp').focus(); return; }

    var payload = {
      unidade_id:    CU,
      nome:          nome,
      tipo:          _tipo,
      cor_hex:       '#3b82f6',
      valor_padrao:  valor,
      valor_repasse: repasse,
      tipo_repasse:  tipoR
    };

    var r;
    if (_editId) {
      r = await _sb.from('procedimentos').update(payload).eq('id', _editId);
    } else {
      r = await _sb.from('procedimentos').insert(payload);
    }

    if (r.error) { toast('Erro: ' + r.error.message, 'error'); return; }

    fecharModal();
    await _carregar();
    _render();
    toast((_editId ? 'Atualizado!' : TIPOS[_tipo].label + ' cadastrado!'), 'success');
  }

  /* ── Excluir ── */
  async function excluir (id) {
    if (USER_ROLE !== 'administrador') { toast('Apenas administradores podem excluir', 'warn'); return; }
    var item = _itens.find(function (x) { return x.id === id; });
    if (!item) return;
    if (!confirm('Excluir "' + item.nome + '"?')) return;

    var r = await _sb.from('procedimentos').delete().eq('id', id);
    if (r.error) { toast('Erro: ' + r.error.message, 'error'); return; }

    await _carregar();
    _render();
    toast('Excluído.', 'success');
  }

  return { init, setTipo, abrirNovo, abrirEditar, fecharModal, salvar, excluir, toggleRepasse, fmtInput };
})();
