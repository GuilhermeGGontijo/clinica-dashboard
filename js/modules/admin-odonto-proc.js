/* ═══════════════════════════════════════════════════════════════════════
   PAINEL DE CONTROLE CLÍNICO — js/modules/admin-odonto-proc.js
   OdontoProcMod: CRUD de Procedimentos Odontológicos
   Depende de: supabase.js (_sb), main.js (sid, esc, toast, CU)
═══════════════════════════════════════════════════════════════════════ */

const OdontoProcMod = (function () {
  'use strict';

  var _dados  = [];
  var _editId = null;

  /* ══════════════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════════════ */
  async function init() {
    if (!_sb) return;
    await _carregar();
    _render();
  }

  /* ══════════════════════════════════════════════════════════════════
     CARREGAR
  ══════════════════════════════════════════════════════════════════ */
  async function _carregar() {
    var wrap = sid('odontoprocListWrap');
    if (wrap) wrap.innerHTML = '<div class="loadingState">Carregando...</div>';
    var r = await _sb.from('odonto_procedimentos')
      .select('id,nome_intervencao,valor_base,especialidade,ativo')
      .order('especialidade')
      .order('nome_intervencao');
    _dados = r.data || [];
  }

  /* ══════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════ */
  function _render() {
    var wrap = sid('odontoprocListWrap');
    if (!wrap) return;

    if (!_dados.length) {
      wrap.innerHTML = '<div class="recebVazio" style="padding:40px 0">Nenhum procedimento cadastrado. Clique em <strong>+ Novo Procedimento</strong> para adicionar.</div>';
      return;
    }

    /* Agrupar por especialidade */
    var grupos = {};
    _dados.forEach(function (p) {
      var esp = p.especialidade || 'Outros';
      if (!grupos[esp]) grupos[esp] = [];
      grupos[esp].push(p);
    });

    var html = '';
    Object.keys(grupos).sort().forEach(function (esp) {
      html += '<div class="opGrupo">';
      html += '<div class="opGrupoLabel">🦷 ' + esc(esp) + '</div>';
      html += '<div class="opGrupoTabela"><table class="recebTable" style="margin:0">';
      html += '<thead><tr><th>Procedimento</th><th>Valor Base</th><th>Status</th><th>Ações</th></tr></thead><tbody>';
      grupos[esp].forEach(function (p) {
        var val = parseFloat(p.valor_base) || 0;
        var ativo = p.ativo !== false;
        html += '<tr style="opacity:' + (ativo ? '1' : '.5') + '">'
          + '<td><strong>' + esc(p.nome_intervencao || '—') + '</strong></td>'
          + '<td class="recebValor">R$ ' + val.toFixed(2).replace('.', ',') + '</td>'
          + '<td><span class="' + (ativo ? 'recebStPago' : 'recebStPend') + '">'
          + (ativo ? '✅ Ativo' : '⏸ Inativo') + '</span></td>'
          + '<td style="white-space:nowrap">'
          + '<button class="btn bSm" style="margin-right:6px" onclick="OdontoProcMod.editar(' + p.id + ')">✏️ Editar</button>'
          + '<button class="btn bSm bDel" onclick="OdontoProcMod.excluir(' + p.id + ')">🗑</button>'
          + '</td></tr>';
      });
      html += '</tbody></table></div></div>';
    });

    wrap.innerHTML = html;
  }

  /* ══════════════════════════════════════════════════════════════════
     MODAL NOVO
  ══════════════════════════════════════════════════════════════════ */
  function abrirNovo() {
    _editId = null;
    var tit = sid('odontoprocModalTitulo');
    if (tit) tit.textContent = '+ Novo Procedimento';
    var nome  = sid('opNome');  if (nome)  nome.value  = '';
    var valor = sid('opValor'); if (valor) valor.value = '';
    var esp   = sid('opEsp');   if (esp)   esp.value   = 'Clínico Geral';
    var ativo = sid('opAtivo'); if (ativo) ativo.checked = true;
    var m = sid('modalOdontoproc'); if (m) m.style.display = 'flex';
    if (nome) nome.focus();
  }

  function editar(id) {
    var p = _dados.find(function (x) { return x.id === id; });
    if (!p) return;
    _editId = id;
    var tit = sid('odontoprocModalTitulo');
    if (tit) tit.textContent = '✏️ Editar Procedimento';
    var nome  = sid('opNome');  if (nome)  nome.value  = p.nome_intervencao || '';
    var valor = sid('opValor'); if (valor) valor.value = parseFloat(p.valor_base) || '';
    var esp   = sid('opEsp');   if (esp)   esp.value   = p.especialidade || 'Outros';
    var ativo = sid('opAtivo'); if (ativo) ativo.checked = p.ativo !== false;
    var m = sid('modalOdontoproc'); if (m) m.style.display = 'flex';
  }

  function fecharModal() {
    var m = sid('modalOdontoproc'); if (m) m.style.display = 'none';
    _editId = null;
  }

  /* ══════════════════════════════════════════════════════════════════
     SALVAR
  ══════════════════════════════════════════════════════════════════ */
  async function salvar() {
    var nome  = ((sid('opNome')  || {}).value || '').trim();
    var valor = parseFloat((sid('opValor') || {}).value);
    var esp   = ((sid('opEsp')   || {}).value || '').trim();
    var ativo = (sid('opAtivo')  || {}).checked !== false;

    if (!nome)                    { toast('Informe o nome do procedimento', 'warn'); return; }
    if (isNaN(valor) || valor < 0) { toast('Informe um valor válido', 'warn'); return; }

    var btn = sid('opBtnSalvar');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    try {
      var payload = {
        nome_intervencao: nome,
        valor_base:       valor,
        especialidade:    esp || 'Outros',
        ativo:            ativo
      };

      var r;
      if (_editId) {
        r = await _sb.from('odonto_procedimentos').update(payload).eq('id', _editId);
      } else {
        r = await _sb.from('odonto_procedimentos').insert(payload);
      }
      if (r.error) throw r.error;

      toast('✅ Procedimento salvo!', 'success');
      fecharModal();
      await _carregar();
      _render();
    } catch (err) {
      toast('Erro ao salvar: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '✅ Salvar'; }
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     EXCLUIR
  ══════════════════════════════════════════════════════════════════ */
  async function excluir(id) {
    var p = _dados.find(function (x) { return x.id === id; });
    var nome = p ? p.nome_intervencao : 'este procedimento';
    if (!confirm('Excluir "' + nome + '"? Esta ação não pode ser desfeita.')) return;
    var r = await _sb.from('odonto_procedimentos').delete().eq('id', id);
    if (r.error) { toast('Erro ao excluir: ' + r.error.message, 'error'); return; }
    toast('Procedimento excluído', 'success');
    await _carregar();
    _render();
  }

  return { init, abrirNovo, editar, fecharModal, salvar, excluir };
})();
