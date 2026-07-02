/* ═══════════════════════════════════════════════════════════════════════
   PAINEL DE CONTROLE CLÍNICO — js/modules/unidades.js
   UnidadesMod: Cadastro de Unidades (CNPJ, Razão Social, Nome Fantasia,
   Endereço, Telefone, Logo) — alimenta o seletor de unidade no topo.
   Depende de: supabase.js (_sb, UNITS), main.js (sid, esc, toast, renderUnitTabs, updateUnitDisplay)
═══════════════════════════════════════════════════════════════════════ */

const UnidadesMod = (function () {
  'use strict';

  var _lista = {};      /* { u1: {id,cnpj,razao_social,nome_fantasia,endereco,telefone,logo_url}, ... } */
  var _editId = null;
  var _logoPendente = null; /* base64 escolhido no upload, ainda não salvo */
  var _carregada = false;

  var MAX_LOGO_KB = 800;

  /* ── Nome de exibição de uma unidade (usado pelo seletor no topo) ── */
  function getNome (id) {
    var u = _lista[id];
    if (u && (u.nome_fantasia || u.razao_social)) return u.nome_fantasia || u.razao_social;
    var estatico = UNITS.find(function (x) { return x.id === id; });
    return estatico ? estatico.name : id;
  }

  /* ── Carregar todas as unidades do Supabase ── */
  async function _carregar () {
    var r = await _sb.from('unidades').select('*');
    _lista = {};
    (r.data || []).forEach(function (u) { _lista[u.id] = u; });
    _carregada = true;
  }

  /* ── Init (chamado ao entrar no módulo e também no boot do app) ── */
  async function init () {
    await _carregar();
    if (typeof renderUnitTabs === 'function') renderUnitTabs();
    if (typeof updateUnitDisplay === 'function') updateUnitDisplay();
    _renderLista();
  }

  /* Carrega silenciosamente em segundo plano assim que o app abre,
     para o seletor do topo já nascer com os nomes reais. */
  async function initSilencioso () {
    await _carregar();
    if (typeof renderUnitTabs === 'function') renderUnitTabs();
    if (typeof updateUnitDisplay === 'function') updateUnitDisplay();
  }

  /* ── Lista de cards (uma por unidade estática) ── */
  function _renderLista () {
    var wrap = sid('unidadesListWrap');
    if (!wrap) return;
    wrap.innerHTML = UNITS.map(function (est) {
      var u = _lista[est.id] || { id: est.id };
      var completo = u.cnpj && u.razao_social && u.endereco && u.telefone;
      return '<div class="uniCard">'
        + '<div class="uniCardLogo">' + (u.logo_url ? '<img src="' + u.logo_url + '" alt="Logo"/>' : '🏥') + '</div>'
        + '<div class="uniCardInfo">'
        +   '<div class="uniCardNome">' + esc(u.nome_fantasia || est.name) + '</div>'
        +   '<div class="uniCardMeta">'
        +     (u.razao_social ? esc(u.razao_social) + ' · ' : '')
        +     (u.cnpj ? 'CNPJ ' + esc(u.cnpj) : '<span class="uniCardVazio">Dados cadastrais pendentes</span>')
        +   '</div>'
        + '</div>'
        + '<span class="uniCardBadge ' + (completo ? 'ok' : 'pend') + '">' + (completo ? '✅ Completo' : '⚠️ Incompleto') + '</span>'
        + '<button class="btn bS" onclick="UnidadesMod.abrirEditar(\'' + est.id + '\')">✏️ Editar</button>'
        + '</div>';
    }).join('');
  }

  /* ── Abrir modal de edição ── */
  function abrirEditar (id) {
    var u = _lista[id] || { id: id };
    var est = UNITS.find(function (x) { return x.id === id; });
    _editId = id;
    _logoPendente = null;

    sid('uniModalTitulo').textContent = '✏️ ' + (u.nome_fantasia || (est ? est.name : id));
    var set = function (elId, val) { var el = sid(elId); if (el) el.value = val || ''; };
    set('uniCnpj', u.cnpj);
    set('uniRazaoSocial', u.razao_social);
    set('uniNomeFantasia', u.nome_fantasia);
    set('uniEndereco', u.endereco);
    set('uniTelefone', u.telefone);

    var prev = sid('uniLogoPreview');
    if (prev) {
      if (u.logo_url) { prev.src = u.logo_url; prev.style.display = ''; }
      else { prev.removeAttribute('src'); prev.style.display = 'none'; }
    }
    var logoInp = sid('uniLogoFile'); if (logoInp) logoInp.value = '';

    sid('uniModal').style.display = 'flex';
  }

  function fecharModal () {
    var m = sid('uniModal');
    if (m) m.style.display = 'none';
    _editId = null;
    _logoPendente = null;
  }

  /* ── Seleção de logo: converte para base64 e mostra prévia ── */
  function onLogoFile (input) {
    var arquivo = input.files && input.files[0];
    if (!arquivo) return;
    if (!/^image\//.test(arquivo.type)) {
      toast('Selecione um arquivo de imagem.', 'error'); input.value = ''; return;
    }
    if (arquivo.size > MAX_LOGO_KB * 1024) {
      toast('Imagem muito grande (máx. ' + MAX_LOGO_KB + 'KB). Escolha um arquivo menor.', 'error');
      input.value = ''; return;
    }
    var reader = new FileReader();
    reader.onload = function (e) {
      _logoPendente = e.target.result;
      var prev = sid('uniLogoPreview');
      if (prev) { prev.src = _logoPendente; prev.style.display = ''; }
    };
    reader.readAsDataURL(arquivo);
  }

  /* ── Salvar ── */
  async function salvar () {
    if (!_editId) return;
    var cnpj = (sid('uniCnpj').value || '').trim();
    var razao = (sid('uniRazaoSocial').value || '').trim();
    var fantasia = (sid('uniNomeFantasia').value || '').trim();
    var endereco = (sid('uniEndereco').value || '').trim();
    var telefone = (sid('uniTelefone').value || '').trim();

    if (!fantasia) { toast('Informe o Nome Fantasia.', 'error'); return; }

    var payload = {
      cnpj: cnpj || null,
      razao_social: razao || null,
      nome_fantasia: fantasia,
      endereco: endereco || null,
      telefone: telefone || null,
      atualizado_em: new Date().toISOString()
    };
    if (_logoPendente) payload.logo_url = _logoPendente;

    var btn = sid('uniBtnSalvar');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    var r = await _sb.from('unidades').update(payload).eq('id', _editId).select().single();

    if (btn) { btn.disabled = false; btn.textContent = '💾 Salvar'; }
    if (r.error) { toast('Erro ao salvar: ' + r.error.message, 'error'); return; }

    _lista[_editId] = r.data;
    fecharModal();
    _renderLista();
    if (typeof renderUnitTabs === 'function') renderUnitTabs();
    if (typeof updateUnitDisplay === 'function') updateUnitDisplay();
    toast('✅ Unidade atualizada com sucesso!', 'success');
  }

  return { init, initSilencioso, getNome, abrirEditar, fecharModal, onLogoFile, salvar };
})();
