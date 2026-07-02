/* ═══════════════════════════════════════════════════════════════════════
   PAINEL DE CONTROLE CLÍNICO — js/modules/salas.js
   SalasMod: CRUD de salas por unidade
   Depende de: supabase.js (_sb), main.js (sid, esc, toast, CU, USER_ROLE)
═══════════════════════════════════════════════════════════════════════ */

const SalasMod = (function () {
  'use strict';

  var _salas    = [];
  var _editId   = null;

  /* ── Init ── */
  async function init () {
    if (!_sb) return;
    var wrap = sid('salasListWrap');
    if (wrap) wrap.innerHTML = '<div class="loadingState">Carregando salas...</div>';
    await _carregar();
    _render();
  }

  /* ── Carregar salas da unidade atual ── */
  async function _carregar () {
    var r = await _sb.from('salas').select('*').eq('unidade_id', CU).order('nome');
    _salas = r.data || [];
  }

  /* ── Renderizar tabela ── */
  function _render () {
    var wrap = sid('salasListWrap');
    if (!wrap) return;

    var unit = (typeof UNITS !== 'undefined' ? UNITS : []).find(function(u){ return u.id === CU; });
    var unitLabel = sid('salasUnitLabel');
    if (unitLabel) unitLabel.textContent = unit ? unit.name : CU;

    if (!_salas.length) {
      wrap.innerHTML = '<div class="salasVazio">Nenhuma sala cadastrada para esta unidade. Clique em <strong>+ Nova Sala</strong> para começar.</div>';
      return;
    }

    var html = '<table class="salasTable">'
      + '<thead><tr><th style="width:36px"></th><th>Nome da Sala</th><th style="width:100px">Cor</th><th style="width:80px">Status</th><th style="width:110px">Ações</th></tr></thead>'
      + '<tbody>';

    _salas.forEach(function (s) {
      var statusBadge = s.ativa
        ? '<span class="salasBadge salasBadgeOk">Ativa</span>'
        : '<span class="salasBadge salasBadgeOff">Inativa</span>';

      html += '<tr class="salasRow' + (s.ativa ? '' : ' salasRowInativa') + '">'
        + '<td><div class="salasCor" style="background:' + esc(s.cor_hex || '#64748b') + '"></div></td>'
        + '<td class="salasNome">' + esc(s.nome) + '</td>'
        + '<td><code style="font-size:.72rem;color:var(--s5)">' + esc(s.cor_hex || '—') + '</code></td>'
        + '<td>' + statusBadge + '</td>'
        + '<td class="salasAcoes">'
        +   '<button class="btn bGh bSm" onclick="SalasMod.abrirEditar(\'' + s.id + '\')" title="Editar">✏️</button>'
        +   '<button class="btn bSm" style="background:' + (s.ativa ? 'var(--r1)' : 'var(--g1)') + ';color:' + (s.ativa ? 'var(--r6)' : 'var(--g6)') + ';border:1px solid ' + (s.ativa ? 'var(--r3)' : 'var(--g3)') + '" '
        +     'onclick="SalasMod.toggleAtiva(\'' + s.id + '\')" title="' + (s.ativa ? 'Desativar' : 'Reativar') + '">'
        +     (s.ativa ? '🔒 Desativar' : '✅ Ativar') + '</button>'
        + '</td>'
        + '</tr>';
    });

    html += '</tbody></table>';
    wrap.innerHTML = html;
  }

  /* ── Abrir modal nova sala ── */
  function abrirNova () {
    _editId = null;
    var titulo = sid('salasModalTitulo'); if (titulo) titulo.textContent = '🚪 Nova Sala';
    var nome = sid('salasNomeInp');       if (nome)   nome.value = '';
    var cor  = sid('salasCorInp');        if (cor)    cor.value  = '#3b82f6';
    _abrirModal();
  }

  /* ── Abrir modal editar sala ── */
  function abrirEditar (id) {
    var s = _salas.find(function (x) { return x.id === id; });
    if (!s) return;
    _editId = id;
    var titulo = sid('salasModalTitulo'); if (titulo) titulo.textContent = '✏️ Editar Sala';
    var nome = sid('salasNomeInp');       if (nome)   nome.value = s.nome;
    var cor  = sid('salasCorInp');        if (cor)    cor.value  = s.cor_hex || '#64748b';
    _abrirModal();
  }

  function _abrirModal () {
    var m = sid('modalSalas'); if (m) m.style.display = 'flex';
    setTimeout(function () { var n = sid('salasNomeInp'); if (n) n.focus(); }, 60);
  }

  function fecharModal () {
    var m = sid('modalSalas'); if (m) m.style.display = 'none';
    _editId = null;
  }

  /* ── Salvar (insert ou update) ── */
  async function salvar () {
    if (USER_ROLE !== 'administrador') { toast('Apenas administradores podem gerenciar salas', 'warn'); return; }

    var nome = ((sid('salasNomeInp') || {}).value || '').trim();
    var cor  = ((sid('salasCorInp')  || {}).value || '#64748b').trim();

    if (!nome) { toast('Digite o nome da sala', 'warn'); sid('salasNomeInp').focus(); return; }

    var btn = document.querySelector('[onclick="SalasMod.salvar()"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    try {
      var r;
      if (_editId) {
        r = await _sb.from('salas').update({ nome: nome, cor_hex: cor }).eq('id', _editId);
      } else {
        r = await _sb.from('salas').insert({ unidade_id: CU, nome: nome, cor_hex: cor });
      }
      if (r.error) throw r.error;
      fecharModal();
      await _carregar();
      _render();
      toast(_editId ? 'Sala atualizada!' : 'Sala "' + nome + '" cadastrada!', 'success');
    } catch (err) {
      toast('Erro: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '💾 Salvar Sala'; }
    }
  }

  /* ── Ativar / Desativar ── */
  async function toggleAtiva (id) {
    if (USER_ROLE !== 'administrador') { toast('Apenas administradores podem gerenciar salas', 'warn'); return; }
    var s = _salas.find(function (x) { return x.id === id; });
    if (!s) return;

    var acao = s.ativa ? 'desativar' : 'reativar';
    if (!confirm('Deseja ' + acao + ' a sala "' + s.nome + '"?')) return;

    var r = await _sb.from('salas').update({ ativa: !s.ativa }).eq('id', id);
    if (r.error) { toast('Erro: ' + r.error.message, 'error'); return; }

    await _carregar();
    _render();
    toast('Sala ' + (s.ativa ? 'desativada' : 'ativada') + '.', 'success');
  }

  return { init, abrirNova, abrirEditar, fecharModal, salvar, toggleAtiva };
})();
