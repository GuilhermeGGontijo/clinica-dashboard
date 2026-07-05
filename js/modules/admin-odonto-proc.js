/* ═══════════════════════════════════════════════════════════════════════
   PAINEL DE CONTROLE CLÍNICO — js/modules/admin-odonto-proc.js
   OdontoProcMod: Especialidades Odontológicas + Intervenções (2 níveis)
   Depende de: supabase.js (_sb), main.js (sid, esc, toast, CU)
═══════════════════════════════════════════════════════════════════════ */

const OdontoProcMod = (function () {
  'use strict';

  var _especialidades = [];
  var _intervencoes   = [];
  var _editEspId      = null;
  var _editIntId      = null;
  var _materiais      = [];

  var _SQL_HINT = [
    '-- Execute no SQL Editor do Supabase:',
    '',
    'create table if not exists especialidades_odonto (',
    '  id         bigserial primary key,',
    '  nome       text not null,',
    '  ativo      boolean not null default true,',
    '  created_at timestamptz not null default now()',
    ');',
    '',
    'alter table odonto_procedimentos',
    '  add column if not exists especialidade_id bigint',
    '  references especialidades_odonto(id);',
  ].join('\n');

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

    /* 1 — Especialidades */
    var re = await _sb.from('especialidades_odonto')
      .select('id,nome,ativo')
      .order('nome');

    if (re.error) {
      _especialidades = [];
      _intervencoes   = [];
      if (wrap) {
        wrap.innerHTML =
          '<div style="padding:24px;background:var(--w);border:1px solid var(--s2);border-radius:10px">'
          + '<p style="color:var(--r6,#dc2626);font-weight:700;margin:0 0 8px">⚠️ Tabela <code>especialidades_odonto</code> não encontrada.</p>'
          + '<p style="font-size:.82rem;color:var(--s6);margin:0 0 12px">Execute o SQL abaixo no <strong>SQL Editor</strong> do Supabase e recarregue a página:</p>'
          + '<pre style="background:var(--s1);border:1px solid var(--s2);padding:14px;border-radius:8px;font-size:.72rem;overflow-x:auto;white-space:pre;color:var(--s8)">'
          + esc(_SQL_HINT)
          + '</pre>'
          + '<button class="btn bG bSm" style="margin-top:14px" onclick="OdontoProcMod.init()">🔄 Tentar novamente</button>'
          + '</div>';
      }
      return;
    }

    _especialidades = re.data || [];

    /* 2 — Intervenções (com especialidade_id) */
    var ri = await _sb.from('odonto_procedimentos')
      .select('id,nome_intervencao,valor_base,especialidade_id,ativo,materiais')
      .order('nome_intervencao');

    if (ri.error) {
      /* Coluna especialidade_id ainda não existe — carregar sem ela */
      var ri2 = await _sb.from('odonto_procedimentos')
        .select('id,nome_intervencao,valor_base,ativo,materiais')
        .order('nome_intervencao');
      _intervencoes = (ri2.data || []).map(function (r) {
        return Object.assign({ especialidade_id: null }, r);
      });
    } else {
      _intervencoes = ri.data || [];
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════ */
  function _render() {
    var wrap = sid('odontoprocListWrap');
    if (!wrap) return;

    if (!_especialidades.length) {
      wrap.innerHTML =
        '<div class="recebVazio" style="padding:40px 0">'
        + 'Nenhuma especialidade cadastrada. Clique em <strong>+ Nova Especialidade</strong> para começar.'
        + '</div>';
      return;
    }

    var html = '';
    _especialidades.forEach(function (esp) {
      var ativo      = esp.ativo !== false;
      var filhas     = _intervencoes.filter(function (i) { return i.especialidade_id === esp.id; });
      var statusCls  = ativo ? 'ativo' : 'inativo';
      var statusTxt  = ativo ? '● Ativa' : '○ Inativa';

      html += '<div class="opGrupo">';

      /* ── Cabeçalho da especialidade ── */
      html += '<div class="opGrupoHdr">'
        + '<div class="opGrupoHdrInfo">'
        + '<span class="opGrupoNome">🦷 ' + esc(esp.nome) + '</span>'
        + '<span class="opGrupoStatus ' + statusCls + '">' + statusTxt + '</span>'
        + '</div>'
        + '<div class="opGrupoAcoes">'
        + '<button class="btn bG bSm" onclick="OdontoProcMod.abrirNovaIntervencao(\'' + esp.id + '\')">+ Intervenção</button>'
        + '<button class="btn bSm" onclick="OdontoProcMod.editarEspecialidade(\'' + esp.id + '\')">✏️</button>'
        + '<button class="btn bSm bDel" onclick="OdontoProcMod.excluirEspecialidade(\'' + esp.id + '\')">🗑</button>'
        + '</div>'
        + '</div>';

      /* ── Tabela de intervenções ── */
      if (!filhas.length) {
        html += '<div class="opGrupoVazio">Nenhuma intervenção cadastrada. Clique em <strong>+ Intervenção</strong> para adicionar.</div>';
      } else {
        html += '<div class="opGrupoTabela"><table class="recebTable" style="margin:0">';
        html += '<thead><tr><th>Intervenção</th><th>Valor Base</th><th>Materiais</th><th>Status</th><th>Ações</th></tr></thead><tbody>';
        filhas.forEach(function (inv) {
          var val   = parseFloat(inv.valor_base) || 0;
          var iAtivo = inv.ativo !== false;
          var mats  = _parseMateriais(inv.materiais);
          var matsHtml = mats.length
            ? '<span title="' + mats.map(function (m) { return esc(m); }).join(', ') + '" style="cursor:help;color:var(--s6);font-size:.78rem">'
                + mats.length + ' material' + (mats.length > 1 ? 'is' : '') + '</span>'
            : '<span style="color:var(--s4);font-size:.78rem">—</span>';

          html += '<tr style="opacity:' + (iAtivo ? '1' : '.5') + '">'
            + '<td><strong>' + esc(inv.nome_intervencao || '—') + '</strong></td>'
            + '<td class="recebValor">R$ ' + val.toFixed(2).replace('.', ',') + '</td>'
            + '<td>' + matsHtml + '</td>'
            + '<td><span class="' + (iAtivo ? 'recebStPago' : 'recebStPend') + '">'
            + (iAtivo ? '✅ Ativa' : '⏸ Inativa') + '</span></td>'
            + '<td style="white-space:nowrap">'
            + '<button class="btn bSm" style="margin-right:6px" onclick="OdontoProcMod.editarIntervencao(\'' + inv.id + '\')">✏️ Editar</button>'
            + '<button class="btn bSm bDel" onclick="OdontoProcMod.excluirIntervencao(\'' + inv.id + '\')">🗑</button>'
            + '</td></tr>';
        });
        html += '</tbody></table></div>';
      }

      html += '</div>';
    });

    wrap.innerHTML = html;
  }

  function _parseMateriais(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    try { return JSON.parse(val); } catch (e) { return []; }
  }

  /* ══════════════════════════════════════════════════════════════════
     MATERIAIS UI
  ══════════════════════════════════════════════════════════════════ */
  function _renderMateriais() {
    var list = sid('opMateriaisList');
    if (!list) return;
    if (!_materiais.length) {
      list.innerHTML = '<span style="font-size:.78rem;color:var(--s5);font-style:italic">Nenhum material adicionado</span>';
      return;
    }
    list.innerHTML = _materiais.map(function (m, i) {
      return '<span style="display:inline-flex;align-items:center;gap:5px;background:var(--s2);border:1px solid var(--s3);border-radius:20px;padding:3px 10px;font-size:.78rem;color:var(--s8)">'
        + esc(m)
        + '<button onclick="OdontoProcMod.removerMaterial(' + i + ')" style="background:none;border:none;cursor:pointer;color:var(--s5);font-size:.85rem;padding:0;line-height:1;margin-left:2px" title="Remover">✕</button>'
        + '</span>';
    }).join('');
  }

  function adicionarMaterial() {
    var inp = sid('opMaterialInput');
    if (!inp) return;
    var nome = inp.value.trim();
    if (!nome) { inp.focus(); return; }
    if (_materiais.indexOf(nome) !== -1) { toast('Material já adicionado', 'warn'); inp.select(); return; }
    _materiais.push(nome);
    _renderMateriais();
    inp.value = '';
    inp.focus();
  }

  function removerMaterial(idx) {
    _materiais.splice(idx, 1);
    _renderMateriais();
  }

  /* ══════════════════════════════════════════════════════════════════
     MODAL — ESPECIALIDADE
  ══════════════════════════════════════════════════════════════════ */
  function abrirNovaEspecialidade() {
    _editEspId = null;
    var tit = sid('espModalTitulo'); if (tit) tit.textContent = '+ Nova Especialidade';
    var nome = sid('espNome');       if (nome) { nome.value = ''; }
    var ativo = sid('espAtivo');     if (ativo) ativo.checked = true;
    var m = sid('modalEspecialidade'); if (m) m.style.display = 'flex';
    if (nome) nome.focus();
  }

  function editarEspecialidade(id) {
    var esp = _especialidades.find(function (e) { return e.id === id; });
    if (!esp) return;
    _editEspId = id;
    var tit = sid('espModalTitulo'); if (tit) tit.textContent = '✏️ Editar Especialidade';
    var nome = sid('espNome');       if (nome) nome.value = esp.nome || '';
    var ativo = sid('espAtivo');     if (ativo) ativo.checked = esp.ativo !== false;
    var m = sid('modalEspecialidade'); if (m) m.style.display = 'flex';
  }

  function fecharModalEsp() {
    var m = sid('modalEspecialidade'); if (m) m.style.display = 'none';
    _editEspId = null;
  }

  async function salvarEspecialidade() {
    var nome  = ((sid('espNome')  || {}).value || '').trim();
    var ativo = (sid('espAtivo')  || {}).checked !== false;
    if (!nome) { toast('Informe o nome da especialidade', 'warn'); return; }

    var btn = sid('espBtnSalvar');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    try {
      var payload = { nome: nome, ativo: ativo };
      var r;
      if (_editEspId) {
        r = await _sb.from('especialidades_odonto').update(payload).eq('id', _editEspId);
      } else {
        r = await _sb.from('especialidades_odonto').insert(payload);
      }
      if (r.error) throw r.error;
      toast('✅ Especialidade salva!', 'success');
      fecharModalEsp();
      await _carregar();
      _render();
    } catch (err) {
      toast('Erro ao salvar: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '✅ Salvar'; }
    }
  }

  async function excluirEspecialidade(id) {
    var esp = _especialidades.find(function (e) { return e.id === id; });
    var nome = esp ? esp.nome : 'esta especialidade';
    var filhas = _intervencoes.filter(function (i) { return i.especialidade_id === id; });
    if (filhas.length) {
      toast('Remova as ' + filhas.length + ' intervenção(ões) desta especialidade antes de excluí-la', 'warn');
      return;
    }
    if (!confirm('Excluir especialidade "' + nome + '"?')) return;
    var r = await _sb.from('especialidades_odonto').delete().eq('id', id);
    if (r.error) { toast('Erro ao excluir: ' + r.error.message, 'error'); return; }
    toast('Especialidade excluída', 'success');
    await _carregar();
    _render();
  }

  /* ══════════════════════════════════════════════════════════════════
     MODAL — INTERVENÇÃO
  ══════════════════════════════════════════════════════════════════ */
  function abrirNovaIntervencao(espId) {
    _editIntId = null;
    _materiais = [];
    var esp = _especialidades.find(function (e) { return e.id === espId; });
    var tit = sid('odontoprocModalTitulo'); if (tit) tit.textContent = '+ Nova Intervenção';
    var lbl = sid('opEspLabel');           if (lbl) lbl.textContent = esp ? ('Especialidade: ' + esp.nome) : '';
    var hidEsp = sid('opEspId');           if (hidEsp) hidEsp.value = espId;
    var nome  = sid('opNome');             if (nome)  nome.value  = '';
    var valor = sid('opValor');            if (valor) valor.value = '';
    var ativo = sid('opAtivo');            if (ativo) ativo.checked = true;
    var inp   = sid('opMaterialInput');    if (inp)   inp.value   = '';
    _renderMateriais();
    var m = sid('modalOdontoproc'); if (m) m.style.display = 'flex';
    if (nome) nome.focus();
  }

  function editarIntervencao(id) {
    var inv = _intervencoes.find(function (x) { return x.id === id; });
    if (!inv) return;
    _editIntId = id;
    _materiais = _parseMateriais(inv.materiais).slice();
    var esp = _especialidades.find(function (e) { return e.id === inv.especialidade_id; });
    var tit = sid('odontoprocModalTitulo'); if (tit) tit.textContent = '✏️ Editar Intervenção';
    var lbl = sid('opEspLabel');           if (lbl) lbl.textContent = esp ? ('Especialidade: ' + esp.nome) : '';
    var hidEsp = sid('opEspId');           if (hidEsp) hidEsp.value = inv.especialidade_id || '';
    var nome  = sid('opNome');             if (nome)  nome.value  = inv.nome_intervencao || '';
    var valor = sid('opValor');            if (valor) valor.value = parseFloat(inv.valor_base) || '';
    var ativo = sid('opAtivo');            if (ativo) ativo.checked = inv.ativo !== false;
    var inp   = sid('opMaterialInput');    if (inp)   inp.value   = '';
    _renderMateriais();
    var m = sid('modalOdontoproc'); if (m) m.style.display = 'flex';
  }

  function fecharModal() {
    var m = sid('modalOdontoproc'); if (m) m.style.display = 'none';
    _editIntId = null;
    _materiais = [];
  }

  async function salvar() {
    var nome   = ((sid('opNome')  || {}).value || '').trim();
    var valor  = parseFloat((sid('opValor') || {}).value);
    var ativo  = (sid('opAtivo') || {}).checked !== false;
    var espId  = ((sid('opEspId') || {}).value || '').trim() || null;

    if (!nome)                     { toast('Informe o nome da intervenção', 'warn'); return; }
    if (isNaN(valor) || valor < 0) { toast('Informe um valor válido', 'warn');       return; }
    if (!espId)                    { toast('Especialidade não identificada', 'warn'); return; }

    var btn = sid('opBtnSalvar');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    try {
      var payload = {
        nome_intervencao: nome,
        valor_base:       valor,
        especialidade_id: espId,
        ativo:            ativo,
        materiais:        _materiais.length ? _materiais : null
      };

      var r;
      if (_editIntId) {
        r = await _sb.from('odonto_procedimentos').update(payload).eq('id', _editIntId);
      } else {
        r = await _sb.from('odonto_procedimentos').insert(payload);
      }

      /* Fallback: colunas ainda não existem */
      if (r.error && r.error.message) {
        var msg = r.error.message.toLowerCase();
        if (msg.includes('especialidade_id') || msg.includes('materiai')) {
          var p2 = { nome_intervencao: nome, valor_base: valor, ativo: ativo };
          r = _editIntId
            ? await _sb.from('odonto_procedimentos').update(p2).eq('id', _editIntId)
            : await _sb.from('odonto_procedimentos').insert(p2);
          if (!r.error) toast('⚠️ Salvo sem vínculo de especialidade — execute o SQL de migração no Supabase', 'warn');
        }
      }

      if (r.error) throw r.error;

      toast('✅ Intervenção salva!', 'success');
      fecharModal();
      await _carregar();
      _render();
    } catch (err) {
      toast('Erro ao salvar: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '✅ Salvar'; }
    }
  }

  async function excluirIntervencao(id) {
    var inv = _intervencoes.find(function (x) { return x.id === id; });
    var nome = inv ? inv.nome_intervencao : 'esta intervenção';
    if (!confirm('Excluir intervenção "' + nome + '"?')) return;
    var r = await _sb.from('odonto_procedimentos').delete().eq('id', id);
    if (r.error) { toast('Erro ao excluir: ' + r.error.message, 'error'); return; }
    toast('Intervenção excluída', 'success');
    await _carregar();
    _render();
  }

  /* ── aliases de compatibilidade ── */
  function abrirNovo()    { /* sem-op: botão agora é abrirNovaEspecialidade */ }
  function editar(id)     { editarIntervencao(id); }
  function excluir(id)    { excluirIntervencao(id); }

  return {
    init,
    abrirNovaEspecialidade, editarEspecialidade, fecharModalEsp, salvarEspecialidade, excluirEspecialidade,
    abrirNovaIntervencao,   editarIntervencao,   fecharModal,    salvar,              excluirIntervencao,
    adicionarMaterial, removerMaterial,
    abrirNovo, editar, excluir
  };
})();
