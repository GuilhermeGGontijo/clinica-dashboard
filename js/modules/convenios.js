/* ═══════════════════════════════════════════════════════════════════════
   PAINEL DE CONTROLE CLÍNICO — js/modules/convenios.js
   ConveniosMod: CRUD de convênios (Admin)
   Depende de: supabase.js (_sb), main.js (sid, esc, toast, USER_ROLE)
═══════════════════════════════════════════════════════════════════════ */

const ConveniosMod = (function () {
  'use strict';

  var _lista  = [];
  var _editId = null;

  var TIPOS = {
    SAUDE:      'Saúde',
    ODONTO:     'Odontologia',
    VIDA:       'Vida',
    PARTICULAR: 'Particular',
    DPVAT:      'DPVAT',
    OUTRO:      'Outro'
  };

  /* ── Init ── */
  async function init() {
    if (!_sb) return;
    await _carregar();
    _render();
  }

  /* ── Carregar ── */
  async function _carregar() {
    var r = await _sb.from('convenios').select('*').order('nome');
    _lista = r.data || [];
  }

  /* ── Render lista ── */
  function _render() {
    var wrap = sid('convListWrap');
    if (!wrap) return;
    if (!_lista.length) {
      wrap.innerHTML = '<div class="convVazio">Nenhum convênio cadastrado. Clique em <strong>➕ Novo Convênio</strong> para começar.</div>';
      return;
    }
    wrap.innerHTML = _lista.map(function (c) {
      var tipoLabel = TIPOS[c.tipo] || c.tipo;
      var ativoCls  = c.ativo ? 'convBadgeAtivo' : 'convBadgeInativo';
      var ativoLbl  = c.ativo ? 'Ativo' : 'Inativo';
      return '<div class="convCard' + (!c.ativo ? ' convCardInativo' : '') + '">'
        + '<div class="convCardMain">'
        +   '<div class="convCardNome">' + esc(c.nome) + '</div>'
        +   '<div class="convCardMeta">'
        +     '<span class="convTipoBadge">' + tipoLabel + '</span>'
        +     (c.codigo_ans ? '<span class="convCodigo">ANS ' + esc(c.codigo_ans) + '</span>' : '')
        +     '<span class="' + ativoCls + '">' + ativoLbl + '</span>'
        +   '</div>'
        + '</div>'
        + '<div class="convCardBtns">'
        +   '<button class="btn bSm convBtnEdit" onclick="ConveniosMod.editar(' + c.id + ')">✏️ Editar</button>'
        +   (c.ativo
        ?    '<button class="btn bSm convBtnInativa" onclick="ConveniosMod.toggleAtivo(' + c.id + ',false)">⏸ Inativar</button>'
        :    '<button class="btn bSm convBtnAtiva"   onclick="ConveniosMod.toggleAtivo(' + c.id + ',true)">▶ Ativar</button>')
        + '</div>'
        + '</div>';
    }).join('');
  }

  /* ── Abrir modal novo ── */
  function abrirNovo() {
    _editId = null;
    var t = sid('convModalTitulo'); if (t) t.textContent = '➕ Novo Convênio';
    _limparForm();
    var m = sid('modalConvenio'); if (m) m.style.display = 'flex';
    setTimeout(function () { var el = sid('convNome'); if (el) el.focus(); }, 50);
  }

  /* ── Abrir modal editar ── */
  function editar(id) {
    var c = _lista.find(function (x) { return x.id === id; });
    if (!c) return;
    _editId = id;
    var t  = sid('convModalTitulo'); if (t)  t.textContent = '✏️ Editar Convênio';
    var n  = sid('convNome');        if (n)  n.value       = c.nome        || '';
    var k  = sid('convCodigo');      if (k)  k.value       = c.codigo_ans  || '';
    var tp = sid('convTipo');        if (tp) tp.value      = c.tipo        || 'SAUDE';
    var a  = sid('convAtivo');       if (a)  a.checked     = !!c.ativo;
    var m  = sid('modalConvenio');   if (m)  m.style.display = 'flex';
  }

  /* ── Fechar modal ── */
  function fecharModal() {
    var m = sid('modalConvenio'); if (m) m.style.display = 'none';
    _limparForm();
  }

  function _limparForm() {
    var n  = sid('convNome');   if (n)  n.value    = '';
    var k  = sid('convCodigo'); if (k)  k.value    = '';
    var tp = sid('convTipo');   if (tp) tp.value   = 'SAUDE';
    var a  = sid('convAtivo');  if (a)  a.checked  = true;
    _editId = null;
  }

  /* ── Salvar ── */
  async function salvar() {
    var nome   = ((sid('convNome')   || {}).value || '').trim();
    var codigo = ((sid('convCodigo') || {}).value || '').trim();
    var tipo   = ((sid('convTipo')   || {}).value || 'SAUDE');
    var ativo  = !!(sid('convAtivo') || {}).checked;

    if (!nome) { toast('Informe o nome do convênio', 'warn'); return; }

    var payload = { nome: nome, codigo_ans: codigo || null, tipo: tipo, ativo: ativo };
    var r = _editId
      ? await _sb.from('convenios').update(payload).eq('id', _editId)
      : await _sb.from('convenios').insert(payload);

    if (r.error) { toast('Erro: ' + r.error.message, 'error'); return; }
    toast(_editId ? 'Convênio atualizado!' : 'Convênio cadastrado com sucesso!', 'success');
    fecharModal();
    await _carregar();
    _render();
  }

  /* ── Toggle ativo/inativo ── */
  async function toggleAtivo(id, novoAtivo) {
    var r = await _sb.from('convenios').update({ ativo: novoAtivo }).eq('id', id);
    if (r.error) { toast('Erro ao atualizar status', 'error'); return; }
    toast(novoAtivo ? 'Convênio ativado' : 'Convênio inativado', 'success');
    await _carregar();
    _render();
  }

  /* ── API pública ── */
  function getLista() {
    return _lista.filter(function (c) { return c.ativo; });
  }

  return { init, abrirNovo, editar, fecharModal, salvar, toggleAtivo, getLista };
})();
