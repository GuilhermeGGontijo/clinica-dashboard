/* ═══════════════════════════════════════════════════════════════════════
   PAINEL DE CONTROLE CLÍNICO — js/modules/estoque.js
   EstoqueMod: Gestão de Estoque — Produtos, Movimentações, Pedidos, Vínculos
   Depende de: supabase.js (_sb), main.js (sid, esc, toast, CU)
═══════════════════════════════════════════════════════════════════════ */

const EstoqueMod = (function () {
  'use strict';

  /* ─── Estado ─── */
  var _aba        = 'categorias';
  var _produtos   = [];
  var _categorias = [];
  var _movs       = [];
  var _pedidos    = [];
  var _vinculos   = [];
  var _procs      = [];
  var _salvando   = false;
  var _editId     = null;
  var _pedItens   = [];          // itens do pedido em construção
  var _pedEditId  = null;        // pedido selecionado para aprovar/receber
  var _movProdId  = null;        // produto selecionado para movimentação
  var _movTipo    = 'ENTRADA';
  var _vincsProc  = [];          // vinculos do procedimento aberto
  var _vincProcId = null;

  /* ─── Helpers ─── */
  function _hoje () { return new Date().toISOString().split('T')[0]; }

  function _fmtQ (v) {
    var n = parseFloat(v) || 0;
    return n % 1 === 0 ? String(n) : n.toFixed(3).replace(/\.?0+$/, '');
  }

  function _fmtData (d) {
    if (!d) return '—';
    var p = d.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function _fmtMoeda (v) {
    return 'R$ ' + (parseFloat(v) || 0).toFixed(2).replace('.', ',');
  }

  function _diasParaVencer (d) {
    if (!d) return 9999;
    return Math.ceil((new Date(d) - new Date(_hoje())) / 86400000);
  }

  async function _uid () {
    var su = await _sb.auth.getUser();
    return su.data && su.data.user ? su.data.user.id : null;
  }

  /* ══════════════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════════════ */
  async function init () {
    if (!_sb) return;
    await _carregarCategorias();
    trocarAba('categorias');
  }

  function trocarAba (aba) {
    _aba = aba;
    document.querySelectorAll('.estAba').forEach(function (el) {
      el.classList.toggle('estAbaAtiva', el.dataset.aba === aba);
    });
    document.querySelectorAll('.estSection').forEach(function (el) {
      el.style.display = el.dataset.aba === aba ? '' : 'none';
    });
    if (aba === 'categorias')    _renderCategorias();
    if (aba === 'produtos')      _carregarProdutos();
    if (aba === 'movimentacoes') _carregarMovimentacoes();
    if (aba === 'pedidos')       _carregarPedidos();
    if (aba === 'vinculos')      _carregarVinculos();
  }

  /* ══════════════════════════════════════════════════════════════════
     CATEGORIAS
  ══════════════════════════════════════════════════════════════════ */
  async function _carregarCategorias () {
    var r = await _sb.from('estoque_categorias').select('id,nome,descricao,ativo').order('nome');
    _categorias = r.data || [];
  }

  function _opsCategorias () {
    return '<option value="">— Categoria —</option>'
      + _categorias.filter(function (c) { return c.ativo; }).map(function (c) {
          return '<option value="' + c.id + '">' + esc(c.nome) + '</option>';
        }).join('');
  }

  function _renderCategorias () {
    var wrap = sid('estCatListWrap');
    if (!wrap) return;

    var ativas   = _categorias.filter(function (c) { return c.ativo; });
    var inativas = _categorias.filter(function (c) { return !c.ativo; });

    if (!_categorias.length) {
      wrap.innerHTML = '<div class="estVazio">🗂️ Nenhuma categoria cadastrada. Clique em "+ Nova Categoria" para começar.</div>';
      return;
    }

    function _linhas (lista) {
      return lista.map(function (c) {
        return '<tr>'
          + '<td><strong>' + esc(c.nome) + '</strong>'
          + (c.descricao ? '<br><small style="color:var(--s4)">' + esc(c.descricao) + '</small>' : '') + '</td>'
          + '<td>' + (c.ativo
              ? '<span class="estBadge estBadgeGreen">Ativa</span>'
              : '<span class="estBadge estBadgeGray">Inativa</span>') + '</td>'
          + '<td class="estAcoesCell">'
          + '<button class="btn bSm" onclick="EstoqueMod.abrirModalCategoria(\'' + c.id + '\')">✏️ Editar</button> '
          + (c.ativo
              ? '<button class="btn bSm bDng" onclick="EstoqueMod.desativarCategoria(\'' + c.id + '\')">Desativar</button>'
              : '<button class="btn bSm estBtnAprova" onclick="EstoqueMod.reativarCategoria(\'' + c.id + '\')">Reativar</button>')
          + '</td></tr>';
      }).join('');
    }

    var html = '<div class="estTableWrap"><table class="estTable">'
      + '<thead><tr><th>Categoria</th><th>Status</th><th>Ações</th></tr></thead>'
      + '<tbody>' + _linhas(ativas);

    if (inativas.length) {
      html += '<tr><td colspan="3" style="padding:6px 12px;background:var(--s1);font-size:.73rem;color:var(--s5);font-weight:700;text-transform:uppercase;letter-spacing:.06em">Inativas</td></tr>';
      html += _linhas(inativas);
    }

    html += '</tbody></table></div>';
    wrap.innerHTML = html;
  }

  function abrirModalCategoria (id) {
    _editId = id || null;
    var m = sid('modalEstCategoria');
    if (!m) return;

    if (id) {
      var cat = _categorias.find(function (c) { return c.id === id; });
      if (cat) {
        _vl('estCatNome', cat.nome || '');
        _vl('estCatDesc', cat.descricao || '');
      }
    } else {
      _vl('estCatNome', '');
      _vl('estCatDesc', '');
    }

    var titulo = sid('estCatModalTitulo');
    if (titulo) titulo.textContent = id ? '✏️ Editar Categoria' : '🗂️ Nova Categoria';
    m.style.display = 'flex';
  }

  function fecharModalCategoria () {
    var m = sid('modalEstCategoria');
    if (m) m.style.display = 'none';
    _editId = null;
  }

  async function salvarCategoria () {
    if (_salvando) return;
    var nome = (_gv('estCatNome') || '').trim();
    if (!nome) { toast('Informe o nome da categoria', 'warn'); return; }

    _salvando = true;
    var btn = sid('estBtnSalvarCat');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    try {
      var payload = { nome: nome, descricao: (_gv('estCatDesc') || '').trim() || null };
      var r;
      if (_editId) {
        r = await _sb.from('estoque_categorias').update(payload).eq('id', _editId);
      } else {
        r = await _sb.from('estoque_categorias').insert({ ...payload, ativo: true });
      }
      if (r.error) throw r.error;

      toast(_editId ? '✅ Categoria atualizada!' : '✅ Categoria criada!', 'success');
      fecharModalCategoria();
      await _carregarCategorias();
      _renderCategorias();
    } catch (err) {
      toast('Erro: ' + err.message, 'error');
    } finally {
      _salvando = false;
      if (btn) { btn.disabled = false; btn.textContent = '💾 Salvar'; }
    }
  }

  async function desativarCategoria (id) {
    if (!confirm('Desativar esta categoria? Os produtos vinculados não serão afetados.')) return;
    var r = await _sb.from('estoque_categorias').update({ ativo: false }).eq('id', id);
    if (r.error) { toast('Erro: ' + r.error.message, 'error'); return; }
    toast('Categoria desativada', 'info');
    await _carregarCategorias();
    _renderCategorias();
  }

  async function reativarCategoria (id) {
    var r = await _sb.from('estoque_categorias').update({ ativo: true }).eq('id', id);
    if (r.error) { toast('Erro: ' + r.error.message, 'error'); return; }
    toast('Categoria reativada', 'success');
    await _carregarCategorias();
    _renderCategorias();
  }

  /* ══════════════════════════════════════════════════════════════════
     PRODUTOS
  ══════════════════════════════════════════════════════════════════ */
  async function _carregarProdutos () {
    var wrap = sid('estProdListWrap');
    if (wrap) wrap.innerHTML = '<div class="loadingState">Carregando produtos...</div>';

    var r = await _sb.from('estoque_produtos')
      .select('*,estoque_categorias(nome),estoque_saldo(quantidade)')
      .eq('unidade_id', CU)
      .eq('ativo', true)
      .order('nome');

    _produtos = (r.data || []).map(function (p) {
      var saldoArr = Array.isArray(p.estoque_saldo) ? p.estoque_saldo : [];
      p._saldo = saldoArr.reduce(function (acc, s) { return acc + parseFloat(s.quantidade || 0); }, 0);
      return p;
    });

    _renderProdutos();
  }

  function _renderProdutos () {
    var wrap = sid('estProdListWrap');
    if (!wrap) return;

    if (!_produtos.length) {
      wrap.innerHTML = '<div class="estVazio">📦 Nenhum produto cadastrado. Clique em "+ Novo Produto" para começar.</div>';
      return;
    }

    var html = '<div class="estTableWrap"><table class="estTable">'
      + '<thead><tr><th>Produto</th><th>Categoria</th><th>Saldo Atual</th>'
      + '<th>Mínimo</th><th>Validade</th><th>Custo Unit.</th><th>Status</th><th>Ações</th></tr></thead><tbody>';

    _produtos.forEach(function (p) {
      var saldo     = p._saldo;
      var minimo    = parseFloat(p.estoque_minimo || 0);
      var baixo     = saldo <= minimo;
      var diasVenc  = _diasParaVencer(p.data_validade);
      var vencendo  = diasVenc <= 30 && diasVenc >= 0;
      var vencido   = diasVenc < 0;
      var um        = esc(p.unidade_medida || '');
      var catNome   = p.estoque_categorias ? esc(p.estoque_categorias.nome) : '—';

      var statusBadge = baixo
        ? '<span class="estBadge estBadgeRed">⚠️ Baixo</span>'
        : '<span class="estBadge estBadgeGreen">✅ Ok</span>';

      var validadeTd = p.data_validade
        ? _fmtData(p.data_validade) + (vencido ? ' <span class="estBadge estBadgeRed">Vencido</span>' : vencendo ? ' <span class="estBadge estBadgeYellow">⚠️</span>' : '')
        : '<span style="color:var(--s4)">—</span>';

      html += '<tr class="' + (baixo || vencido ? 'estRowAlerta' : '') + '">'
        + '<td><strong>' + esc(p.nome) + '</strong>'
        + (p.descricao ? '<br><small style="color:var(--s4)">' + esc(p.descricao) + '</small>' : '') + '</td>'
        + '<td>' + catNome + '</td>'
        + '<td><strong>' + _fmtQ(saldo) + '</strong> ' + um + '</td>'
        + '<td>' + _fmtQ(minimo) + ' ' + um + '</td>'
        + '<td>' + validadeTd + '</td>'
        + '<td>' + _fmtMoeda(p.custo_unitario) + '</td>'
        + '<td>' + statusBadge + '</td>'
        + '<td class="estAcoesCell">'
        + '<button class="btn bSm" onclick="EstoqueMod.abrirModalProduto(\'' + p.id + '\')" title="Editar">✏️</button>'
        + '<button class="btn bSm estBtnEnt" onclick="EstoqueMod.abrirModalMov(\'ENTRADA\',\'' + p.id + '\')" title="Entrada">📥</button>'
        + '<button class="btn bSm estBtnSai" onclick="EstoqueMod.abrirModalMov(\'SAIDA\',\'' + p.id + '\')" title="Saída">📤</button>'
        + '</td></tr>';
    });

    html += '</tbody></table></div>';
    wrap.innerHTML = html;
  }

  function abrirModalProduto (id) {
    _editId = id || null;
    var m = sid('modalEstProduto');
    if (!m) return;

    var sel = sid('estProdCateg');
    if (sel) sel.innerHTML = _opsCategorias();

    if (id) {
      var p = _produtos.find(function (x) { return x.id === id; });
      if (p) {
        _vl('estProdNome',     p.nome || '');
        _vl('estProdDesc',     p.descricao || '');
        _vl('estProdUM',       p.unidade_medida || 'unidade');
        _vl('estProdUPE',      p.unidades_por_embalagem || 1);
        _vl('estProdMin',      p.estoque_minimo || 0);
        _vl('estProdCusto',    p.custo_unitario || 0);
        _vl('estProdValidade', p.data_validade || '');
        if (sel && p.categoria_id) sel.value = p.categoria_id;
      }
    } else {
      _vl('estProdNome',''); _vl('estProdDesc',''); _vl('estProdUM','unidade');
      _vl('estProdUPE',1); _vl('estProdMin',0); _vl('estProdCusto',0); _vl('estProdValidade','');
    }

    var titulo = sid('estProdModalTitulo');
    if (titulo) titulo.textContent = id ? '✏️ Editar Produto' : '📦 Novo Produto';
    m.style.display = 'flex';
  }

  function fecharModalProduto () {
    var m = sid('modalEstProduto');
    if (m) m.style.display = 'none';
    _editId = null;
  }

  async function salvarProduto () {
    if (_salvando) return;
    var nome = (_gv('estProdNome') || '').trim();
    if (!nome) { toast('Informe o nome do produto', 'warn'); return; }

    _salvando = true;
    var btn = sid('estBtnSalvarProd');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    try {
      var payload = {
        unidade_id:             CU,
        categoria_id:           _gv('estProdCateg') || null,
        nome:                   nome,
        descricao:              (_gv('estProdDesc') || '').trim() || null,
        unidade_medida:         _gv('estProdUM') || 'unidade',
        unidades_por_embalagem: parseFloat(_gv('estProdUPE')) || 1,
        estoque_minimo:         parseFloat(_gv('estProdMin')) || 0,
        custo_unitario:         parseFloat(_gv('estProdCusto')) || 0,
        data_validade:          _gv('estProdValidade') || null,
        atualizado_em:          new Date().toISOString()
      };

      var r;
      if (_editId) {
        r = await _sb.from('estoque_produtos').update(payload).eq('id', _editId);
        if (r.error) throw r.error;
      } else {
        r = await _sb.from('estoque_produtos').insert(payload).select('id').single();
        if (r.error) throw r.error;
        // Create zero saldo record
        await _sb.from('estoque_saldo').insert({ produto_id: r.data.id, unidade_id: CU, quantidade: 0 });
      }

      toast(_editId ? '✅ Produto atualizado!' : '✅ Produto cadastrado!', 'success');
      fecharModalProduto();
      await _carregarProdutos();
    } catch (err) {
      toast('Erro: ' + err.message, 'error');
    } finally {
      _salvando = false;
      if (btn) { btn.disabled = false; btn.textContent = '💾 Salvar'; }
    }
  }

  async function excluirProduto (id) {
    if (!confirm('Desativar este produto? O histórico será mantido.')) return;
    var r = await _sb.from('estoque_produtos').update({ ativo: false }).eq('id', id);
    if (r.error) { toast('Erro ao desativar: ' + r.error.message, 'error'); return; }
    toast('Produto desativado', 'info');
    await _carregarProdutos();
  }

  /* ══════════════════════════════════════════════════════════════════
     MOVIMENTAÇÕES
  ══════════════════════════════════════════════════════════════════ */
  async function _carregarMovimentacoes () {
    var wrap = sid('estMovListWrap');
    if (wrap) wrap.innerHTML = '<div class="loadingState">Carregando movimentações...</div>';

    var r = await _sb.from('estoque_movimentacoes')
      .select('*,estoque_produtos(nome,unidade_medida),perfis_usuarios(nome)')
      .eq('unidade_id', CU)
      .order('criado_em', { ascending: false })
      .limit(200);

    _movs = r.data || [];
    _renderMovimentacoes();
  }

  function _renderMovimentacoes () {
    var wrap = sid('estMovListWrap');
    if (!wrap) return;

    if (!_movs.length) {
      wrap.innerHTML = '<div class="estVazio">📋 Nenhuma movimentação registrada.</div>';
      return;
    }

    var tipoLabel = { ENTRADA:'📥 Entrada', SAIDA:'📤 Saída', AJUSTE:'🔧 Ajuste', TRANSFERENCIA:'🔄 Transferência' };
    var tipoClass = { ENTRADA:'estTipoEnt', SAIDA:'estTipoSai', AJUSTE:'estTipoAj', TRANSFERENCIA:'estTipoTr' };

    var html = '<div class="estTableWrap"><table class="estTable">'
      + '<thead><tr><th>Data/Hora</th><th>Produto</th><th>Tipo</th>'
      + '<th>Quantidade</th><th>Custo Unit.</th><th>Referência</th><th>Responsável</th><th>Observações</th></tr></thead><tbody>';

    _movs.forEach(function (m) {
      var dt = m.criado_em ? m.criado_em.replace('T',' ').substring(0,16) : '—';
      var nome = m.estoque_produtos ? esc(m.estoque_produtos.nome) : '—';
      var um   = m.estoque_produtos ? esc(m.estoque_produtos.unidade_medida || '') : '';
      var resp = m.perfis_usuarios  ? esc(m.perfis_usuarios.nome) : '—';
      var tipo = tipoLabel[m.tipo] || m.tipo;
      var cls  = tipoClass[m.tipo] || '';
      var sinal = (m.tipo === 'ENTRADA') ? '+' : (m.tipo === 'SAIDA' ? '-' : '');

      html += '<tr>'
        + '<td style="white-space:nowrap">' + dt + '</td>'
        + '<td>' + nome + '</td>'
        + '<td><span class="estMovTipo ' + cls + '">' + tipo + '</span></td>'
        + '<td><strong>' + sinal + _fmtQ(m.quantidade) + '</strong> ' + um + '</td>'
        + '<td>' + (m.custo_unitario ? _fmtMoeda(m.custo_unitario) : '—') + '</td>'
        + '<td style="font-size:.78rem;color:var(--s5)">' + esc(m.referencia_tipo || '—') + '</td>'
        + '<td>' + resp + '</td>'
        + '<td style="font-size:.8rem">' + esc(m.observacoes || '') + '</td>'
        + '</tr>';
    });

    html += '</tbody></table></div>';
    wrap.innerHTML = html;
  }

  function abrirModalMov (tipo, produtoId) {
    _movTipo   = tipo || 'ENTRADA';
    _movProdId = produtoId || null;

    var m = sid('modalEstMov');
    if (!m) return;

    var titulo = sid('estMovTituloModal');
    if (titulo) titulo.textContent = tipo === 'ENTRADA' ? '📥 Registrar Entrada' : '📤 Registrar Saída';

    // populate product select
    var sel = sid('estMovProduto');
    if (sel) {
      sel.innerHTML = '<option value="">— Selecione o produto —</option>'
        + _produtos.map(function (p) {
            var saldo = _fmtQ(p._saldo) + ' ' + (p.unidade_medida || '');
            return '<option value="' + p.id + '">' + esc(p.nome) + ' [saldo: ' + saldo + ']</option>';
          }).join('');
      if (produtoId) sel.value = produtoId;
    }

    _vl('estMovQtd', '');
    _vl('estMovCusto', '');
    _vl('estMovObs', '');
    m.style.display = 'flex';
  }

  function fecharModalMov () {
    var m = sid('modalEstMov');
    if (m) m.style.display = 'none';
    _movProdId = null;
  }

  async function salvarMov () {
    if (_salvando) return;
    var prodId = _gv('estMovProduto');
    var qtd    = parseFloat(_gv('estMovQtd'));
    if (!prodId)   { toast('Selecione o produto', 'warn'); return; }
    if (!qtd || qtd <= 0) { toast('Quantidade deve ser maior que zero', 'warn'); return; }

    _salvando = true;
    var btn = sid('estBtnSalvarMov');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    try {
      var userId = await _uid();
      var custo  = parseFloat(_gv('estMovCusto')) || null;

      var r = await _sb.from('estoque_movimentacoes').insert({
        produto_id:      prodId,
        unidade_id:      CU,
        tipo:            _movTipo,
        quantidade:      qtd,
        custo_unitario:  custo,
        referencia_tipo: 'MANUAL',
        observacoes:     _gv('estMovObs') || null,
        criado_por:      userId
      });
      if (r.error) throw r.error;

      // Atualiza saldo
      var delta = _movTipo === 'SAIDA' ? -qtd : qtd;
      await _atualizarSaldo(prodId, CU, delta);

      toast('✅ Movimentação registrada!', 'success');
      fecharModalMov();
      await _carregarProdutos();
      if (_aba === 'movimentacoes') await _carregarMovimentacoes();
    } catch (err) {
      toast('Erro: ' + err.message, 'error');
    } finally {
      _salvando = false;
      if (btn) { btn.disabled = false; btn.textContent = '✅ Confirmar'; }
    }
  }

  async function _atualizarSaldo (produtoId, unidadeId, delta) {
    var r = await _sb.from('estoque_saldo')
      .select('id,quantidade')
      .eq('produto_id', produtoId)
      .eq('unidade_id', unidadeId)
      .maybeSingle();
    if (r.error) throw r.error;

    var novaQtd = parseFloat(r.data ? r.data.quantidade : 0) + delta;
    if (novaQtd < 0) novaQtd = 0;

    if (r.data) {
      var u = await _sb.from('estoque_saldo').update({ quantidade: novaQtd }).eq('id', r.data.id);
      if (u.error) throw u.error;
    } else {
      var i = await _sb.from('estoque_saldo').insert({ produto_id: produtoId, unidade_id: unidadeId, quantidade: novaQtd });
      if (i.error) throw i.error;
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     PEDIDOS DE COMPRA
  ══════════════════════════════════════════════════════════════════ */
  async function _carregarPedidos () {
    var wrap = sid('estPedListWrap');
    if (wrap) wrap.innerHTML = '<div class="loadingState">Carregando pedidos...</div>';

    var r = await _sb.from('estoque_pedidos')
      .select('*,perfis_usuarios!estoque_pedidos_solicitante_id_fkey(nome),estoque_pedidos_itens(id,produto_id,quantidade_solicitada,quantidade_recebida,custo_unitario,estoque_produtos(nome,unidade_medida))')
      .eq('unidade_id', CU)
      .order('criado_em', { ascending: false })
      .limit(100);

    _pedidos = r.data || [];
    _renderPedidos();
  }

  function _renderPedidos () {
    var wrap = sid('estPedListWrap');
    if (!wrap) return;

    if (!_pedidos.length) {
      wrap.innerHTML = '<div class="estVazio">📋 Nenhum pedido de compra registrado. Clique em "+ Novo Pedido".</div>';
      return;
    }

    var statusLabel = {
      PENDENTE:  '<span class="estBadge estBadgeYellow">⏳ Pendente</span>',
      APROVADO:  '<span class="estBadge estBadgeBlue">✅ Aprovado</span>',
      REJEITADO: '<span class="estBadge estBadgeRed">❌ Rejeitado</span>',
      RECEBIDO:  '<span class="estBadge estBadgeGreen">📦 Recebido</span>',
      CANCELADO: '<span class="estBadge estBadgeGray">🚫 Cancelado</span>'
    };

    var html = '<div class="estTableWrap"><table class="estTable">'
      + '<thead><tr><th>Data</th><th>Solicitante</th><th>Itens</th><th>Status</th><th>Ações</th></tr></thead><tbody>';

    _pedidos.forEach(function (p) {
      var dt   = p.criado_em ? p.criado_em.split('T')[0].split('-').reverse().join('/') : '—';
      var sol  = p.perfis_usuarios ? esc(p.perfis_usuarios.nome) : '—';
      var itens = Array.isArray(p.estoque_pedidos_itens) ? p.estoque_pedidos_itens : [];
      var nItens = itens.length + ' item' + (itens.length !== 1 ? 's' : '');
      var status = statusLabel[p.status] || p.status;

      var acoes = '';
      if (p.status === 'PENDENTE') {
        acoes += '<button class="btn bSm estBtnAprova" onclick="EstoqueMod.abrirModalAprovar(\'' + p.id + '\',\'APROVADO\')">✅ Aprovar</button> '
               + '<button class="btn bSm estBtnRejeita" onclick="EstoqueMod.abrirModalAprovar(\'' + p.id + '\',\'REJEITADO\')">❌ Rejeitar</button>';
      } else if (p.status === 'APROVADO') {
        acoes += '<button class="btn bSm estBtnRecebe" onclick="EstoqueMod.abrirModalReceber(\'' + p.id + '\')">📦 Registrar Recebimento</button>';
      }
      acoes += ' <button class="btn bSm" onclick="EstoqueMod.verDetalhesPedido(\'' + p.id + '\')">🔍 Ver</button>';

      html += '<tr>'
        + '<td style="white-space:nowrap">' + dt + '</td>'
        + '<td>' + sol + '</td>'
        + '<td>' + nItens + '</td>'
        + '<td>' + status + '</td>'
        + '<td class="estAcoesCell">' + acoes + '</td>'
        + '</tr>';
    });

    html += '</tbody></table></div>';
    wrap.innerHTML = html;
  }

  function abrirModalPedido () {
    _pedItens = [];
    var m = sid('modalEstPedido');
    if (!m) return;
    _vl('estPedObs', '');
    _renderItensPedido();
    m.style.display = 'flex';
  }

  function fecharModalPedido () {
    var m = sid('modalEstPedido');
    if (m) m.style.display = 'none';
    _pedItens = [];
  }

  function addItemPedido () {
    var prodId = _gv('estPedItemProd');
    var qtd    = parseFloat(_gv('estPedItemQtd'));
    var custo  = parseFloat(_gv('estPedItemCusto')) || null;
    if (!prodId) { toast('Selecione o produto', 'warn'); return; }
    if (!qtd || qtd <= 0) { toast('Quantidade inválida', 'warn'); return; }

    var prod = _produtos.find(function (p) { return p.id === prodId; });
    _pedItens.push({ produtoId: prodId, nome: prod ? prod.nome : '', um: prod ? (prod.unidade_medida || '') : '', qtd: qtd, custo: custo });

    _vl('estPedItemProd', ''); _vl('estPedItemQtd', ''); _vl('estPedItemCusto', '');
    _renderItensPedido();
  }

  function removerItemPedido (idx) {
    _pedItens.splice(idx, 1);
    _renderItensPedido();
  }

  function _renderItensPedido () {
    var wrap = sid('estPedItensWrap');
    if (!wrap) return;

    if (!_pedItens.length) {
      wrap.innerHTML = '<div class="estVazioSm">Nenhum item adicionado</div>';
      return;
    }

    var html = '<table class="estTable estTableSm"><thead><tr><th>Produto</th><th>Qtd.</th><th>Custo Est.</th><th></th></tr></thead><tbody>';
    _pedItens.forEach(function (it, idx) {
      html += '<tr>'
        + '<td>' + esc(it.nome) + '</td>'
        + '<td>' + _fmtQ(it.qtd) + ' ' + esc(it.um) + '</td>'
        + '<td>' + (it.custo ? _fmtMoeda(it.custo) : '—') + '</td>'
        + '<td><button class="btn bSm bDng" onclick="EstoqueMod.removerItemPedido(' + idx + ')">✕</button></td>'
        + '</tr>';
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
  }

  function _opsProdutos () {
    return '<option value="">— Selecione o produto —</option>'
      + _produtos.map(function (p) {
          return '<option value="' + p.id + '">' + esc(p.nome) + ' (' + esc(p.unidade_medida || '') + ')</option>';
        }).join('');
  }

  async function salvarPedido () {
    if (_salvando) return;
    if (!_pedItens.length) { toast('Adicione ao menos um item ao pedido', 'warn'); return; }

    _salvando = true;
    var btn = sid('estBtnSalvarPed');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    try {
      var userId = await _uid();
      var rPed   = await _sb.from('estoque_pedidos').insert({
        unidade_id:     CU,
        solicitante_id: userId,
        status:         'PENDENTE',
        observacoes:    _gv('estPedObs') || null
      }).select('id').single();
      if (rPed.error) throw rPed.error;

      var itensPayload = _pedItens.map(function (it) {
        return {
          pedido_id:             rPed.data.id,
          produto_id:            it.produtoId,
          quantidade_solicitada: it.qtd,
          custo_unitario:        it.custo
        };
      });
      var rItens = await _sb.from('estoque_pedidos_itens').insert(itensPayload);
      if (rItens.error) throw rItens.error;

      toast('✅ Pedido de compra criado com sucesso!', 'success');
      fecharModalPedido();
      await _carregarPedidos();
    } catch (err) {
      toast('Erro: ' + err.message, 'error');
    } finally {
      _salvando = false;
      if (btn) { btn.disabled = false; btn.textContent = '📤 Enviar Pedido'; }
    }
  }

  function abrirModalAprovar (id, acao) {
    _pedEditId = id;
    var m = sid('modalEstAprovar');
    if (!m) return;
    var titulo = sid('estAprovarTitulo');
    if (titulo) titulo.textContent = acao === 'APROVADO' ? '✅ Aprovar Pedido' : '❌ Rejeitar Pedido';
    var btn = sid('estBtnConfAprovar');
    if (btn) {
      btn.textContent = acao === 'APROVADO' ? '✅ Confirmar Aprovação' : '❌ Confirmar Rejeição';
      btn.className   = 'btn ' + (acao === 'APROVADO' ? 'bG' : 'bDng');
      btn.dataset.acao = acao;
    }
    _vl('estAprovarObs', '');
    m.style.display = 'flex';
  }

  function fecharModalAprovar () {
    var m = sid('modalEstAprovar');
    if (m) m.style.display = 'none';
    _pedEditId = null;
  }

  async function confirmarAprovacao () {
    if (_salvando || !_pedEditId) return;
    var acao = (sid('estBtnConfAprovar') || {}).dataset.acao || 'APROVADO';
    _salvando = true;
    var btn = sid('estBtnConfAprovar');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    try {
      var userId = await _uid();
      var r = await _sb.from('estoque_pedidos').update({
        status:      acao,
        aprovado_por: userId,
        aprovado_em: new Date().toISOString()
      }).eq('id', _pedEditId);
      if (r.error) throw r.error;

      if (acao === 'APROVADO') {
        // Cria conta a pagar automaticamente
        var ped = _pedidos.find(function (p) { return p.id === _pedEditId; });
        var itens = (ped && Array.isArray(ped.estoque_pedidos_itens)) ? ped.estoque_pedidos_itens : [];
        var valorTotal = itens.reduce(function (acc, it) {
          return acc + (parseFloat(it.custo_unitario || 0) * parseFloat(it.quantidade_solicitada || 0));
        }, 0);

        if (valorTotal > 0) {
          await _sb.from('financeiro_contas_pagar').insert({
            unidade_id:  CU,
            descricao:   'Pedido de compra #' + _pedEditId.substring(0, 8),
            valor:       valorTotal,
            status:      'PENDENTE',
            pedido_id:   _pedEditId,
            criado_por:  userId,
            aprovado_por: userId
          });
        }

        toast('✅ Pedido aprovado! Conta a pagar criada.', 'success');
      } else {
        toast('Pedido rejeitado.', 'info');
      }

      fecharModalAprovar();
      await _carregarPedidos();
    } catch (err) {
      toast('Erro: ' + err.message, 'error');
    } finally {
      _salvando = false;
      if (btn) { btn.disabled = false; }
    }
  }

  function abrirModalReceber (id) {
    _pedEditId = id;
    var m = sid('modalEstReceber');
    if (!m) return;

    var ped   = _pedidos.find(function (p) { return p.id === id; });
    var itens = (ped && Array.isArray(ped.estoque_pedidos_itens)) ? ped.estoque_pedidos_itens : [];
    var wrap  = sid('estReceberItensWrap');

    if (wrap) {
      var html = '<table class="estTable estTableSm"><thead><tr><th>Produto</th><th>Solicitado</th><th>Recebido</th><th>Custo Real (unit.)</th></tr></thead><tbody>';
      itens.forEach(function (it, idx) {
        var nome = it.estoque_produtos ? esc(it.estoque_produtos.nome) : '—';
        var um   = it.estoque_produtos ? esc(it.estoque_produtos.unidade_medida || '') : '';
        html += '<tr>'
          + '<td>' + nome + '</td>'
          + '<td>' + _fmtQ(it.quantidade_solicitada) + ' ' + um + '</td>'
          + '<td><input type="number" class="afInp" id="recIt_qtd_' + idx + '" value="' + _fmtQ(it.quantidade_solicitada) + '" min="0" step="0.001" style="width:90px"></td>'
          + '<td><input type="number" class="afInp" id="recIt_custo_' + idx + '" value="' + (it.custo_unitario || '') + '" min="0" step="0.01" placeholder="0,00" style="width:90px"></td>'
          + '</tr>';
      });
      html += '</tbody></table>';
      wrap.innerHTML = html;
    }

    _vl('estReceberObs', '');
    m.style.display = 'flex';
  }

  function fecharModalReceber () {
    var m = sid('modalEstReceber');
    if (m) m.style.display = 'none';
    _pedEditId = null;
  }

  async function confirmarRecebimento () {
    if (_salvando || !_pedEditId) return;
    _salvando = true;
    var btn = sid('estBtnConfReceber');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    try {
      var userId = await _uid();
      var ped    = _pedidos.find(function (p) { return p.id === _pedEditId; });
      var itens  = (ped && Array.isArray(ped.estoque_pedidos_itens)) ? ped.estoque_pedidos_itens : [];

      for (var idx = 0; idx < itens.length; idx++) {
        var it   = itens[idx];
        var qtd  = parseFloat((sid('recIt_qtd_'   + idx) || {}).value) || 0;
        var cust = parseFloat((sid('recIt_custo_' + idx) || {}).value) || null;

        if (qtd <= 0) continue;

        // Registrar movimentação ENTRADA
        var rMov = await _sb.from('estoque_movimentacoes').insert({
          produto_id:      it.produto_id,
          unidade_id:      CU,
          tipo:            'ENTRADA',
          quantidade:      qtd,
          custo_unitario:  cust,
          referencia_tipo: 'PEDIDO',
          referencia_id:   _pedEditId,
          observacoes:     _gv('estReceberObs') || null,
          criado_por:      userId
        });
        if (rMov.error) throw rMov.error;

        // Atualiza saldo
        await _atualizarSaldo(it.produto_id, CU, qtd);

        // Atualiza item do pedido
        await _sb.from('estoque_pedidos_itens').update({
          quantidade_recebida: qtd,
          custo_unitario:      cust
        }).eq('id', it.id);
      }

      // Atualiza status do pedido
      await _sb.from('estoque_pedidos').update({ status: 'RECEBIDO' }).eq('id', _pedEditId);

      // Atualiza conta a pagar se existir
      var totalReal = itens.reduce(function (acc, it, i) {
        var q = parseFloat((sid('recIt_qtd_' + i) || {}).value) || 0;
        var c = parseFloat((sid('recIt_custo_' + i) || {}).value) || 0;
        return acc + q * c;
      }, 0);
      if (totalReal > 0) {
        await _sb.from('financeiro_contas_pagar').update({ valor: totalReal }).eq('pedido_id', _pedEditId).eq('status', 'PENDENTE');
      }

      toast('✅ Recebimento registrado! Estoque atualizado.', 'success');
      fecharModalReceber();
      await _carregarPedidos();
      await _carregarProdutos();
    } catch (err) {
      toast('Erro: ' + err.message, 'error');
    } finally {
      _salvando = false;
      if (btn) { btn.disabled = false; btn.textContent = '📦 Confirmar Recebimento'; }
    }
  }

  function verDetalhesPedido (id) {
    var ped   = _pedidos.find(function (p) { return p.id === id; });
    if (!ped) return;
    var itens = Array.isArray(ped.estoque_pedidos_itens) ? ped.estoque_pedidos_itens : [];
    var linhas = itens.map(function (it) {
      var nome = it.estoque_produtos ? it.estoque_produtos.nome : '—';
      var um   = it.estoque_produtos ? (it.estoque_produtos.unidade_medida || '') : '';
      return '• ' + nome + ': ' + _fmtQ(it.quantidade_solicitada) + ' ' + um
        + (it.custo_unitario ? ' @ ' + _fmtMoeda(it.custo_unitario) : '');
    }).join('\n');
    alert('Pedido ' + id.substring(0,8) + '\nStatus: ' + ped.status + '\nObs: ' + (ped.observacoes || '—') + '\n\nItens:\n' + linhas);
  }

  /* ══════════════════════════════════════════════════════════════════
     VÍNCULOS PROCEDIMENTO → MATERIAIS
  ══════════════════════════════════════════════════════════════════ */
  async function _carregarVinculos () {
    var wrap = sid('estVincListWrap');
    if (wrap) wrap.innerHTML = '<div class="loadingState">Carregando...</div>';

    // Carrega procedimentos odontológicos
    var rProcs = await _sb.from('odonto_procedimentos')
      .select('id,nome,codigo')
      .order('nome');
    _procs = rProcs.data || [];

    // Carrega vínculos
    var rVinc = await _sb.from('procedimento_materiais')
      .select('*,estoque_produtos(id,nome,unidade_medida),odonto_procedimentos(id,nome,codigo)');
    _vinculos = rVinc.data || [];

    _renderVinculos();
  }

  function _renderVinculos () {
    var wrap = sid('estVincListWrap');
    if (!wrap) return;

    if (!_procs.length) {
      wrap.innerHTML = '<div class="estVazio">Nenhum procedimento odontológico cadastrado. Cadastre em Administrativo → Proc. Odontológicos.</div>';
      return;
    }

    var vincsByProc = {};
    _vinculos.forEach(function (v) {
      var procId = v.procedimento_id;
      if (!vincsByProc[procId]) vincsByProc[procId] = [];
      vincsByProc[procId].push(v);
    });

    var html = '';
    _procs.forEach(function (proc) {
      var vincs = vincsByProc[proc.id] || [];
      html += '<div class="estVincProcCard">'
        + '<div class="estVincProcHdr">'
        + '<span class="estVincProcNome">'
        + (proc.codigo ? '<span class="estVincCodigo">' + esc(proc.codigo) + '</span> ' : '')
        + esc(proc.nome) + '</span>'
        + '<button class="btn bSm bG" onclick="EstoqueMod.abrirModalVinculo(\'' + proc.id + '\')">+ Vincular Material</button>'
        + '</div>';

      if (vincs.length) {
        html += '<div class="estVincItens">';
        vincs.forEach(function (v) {
          var mat = v.estoque_produtos;
          html += '<div class="estVincItem">'
            + '<span>' + (mat ? esc(mat.nome) : '—') + '</span>'
            + '<span class="estVincQtd">' + _fmtQ(v.quantidade) + ' ' + (mat ? esc(mat.unidade_medida || '') : '') + ' / uso</span>'
            + '<button class="btn bSm bDng" onclick="EstoqueMod.excluirVinculo(\'' + v.id + '\')" title="Remover vínculo">✕</button>'
            + '</div>';
        });
        html += '</div>';
      } else {
        html += '<div class="estVincVazio">Nenhum material vinculado a este procedimento</div>';
      }
      html += '</div>';
    });

    wrap.innerHTML = html;
  }

  function abrirModalVinculo (procId) {
    _vincProcId = procId;
    var proc = _procs.find(function (p) { return p.id === procId; });
    var m = sid('modalEstVinculo');
    if (!m) return;

    var titulo = sid('estVincTitulo');
    if (titulo) titulo.textContent = proc ? '🔗 Vincular Material — ' + proc.nome : '🔗 Vincular Material';

    var sel = sid('estVincProduto');
    if (sel) sel.innerHTML = _opsProdutos();
    _vl('estVincQtd', 1);
    m.style.display = 'flex';
  }

  function fecharModalVinculo () {
    var m = sid('modalEstVinculo');
    if (m) m.style.display = 'none';
    _vincProcId = null;
  }

  async function salvarVinculo () {
    if (_salvando || !_vincProcId) return;
    var prodId = _gv('estVincProduto');
    var qtd    = parseFloat(_gv('estVincQtd'));
    if (!prodId) { toast('Selecione o material', 'warn'); return; }
    if (!qtd || qtd <= 0) { toast('Quantidade deve ser maior que zero', 'warn'); return; }

    _salvando = true;
    try {
      var r = await _sb.from('procedimento_materiais').upsert({
        procedimento_id: _vincProcId,
        produto_id:      prodId,
        quantidade:      qtd
      }, { onConflict: 'procedimento_id,produto_id' });
      if (r.error) throw r.error;

      toast('✅ Material vinculado ao procedimento!', 'success');
      fecharModalVinculo();
      await _carregarVinculos();
    } catch (err) {
      toast('Erro: ' + err.message, 'error');
    } finally {
      _salvando = false;
    }
  }

  async function excluirVinculo (id) {
    if (!confirm('Remover este vínculo?')) return;
    var r = await _sb.from('procedimento_materiais').delete().eq('id', id);
    if (r.error) { toast('Erro: ' + r.error.message, 'error'); return; }
    toast('Vínculo removido', 'info');
    await _carregarVinculos();
  }

  /* ══════════════════════════════════════════════════════════════════
     ALERTAS (para Dashboard)
  ══════════════════════════════════════════════════════════════════ */
  async function checkAlertas () {
    try {
      var r = await _sb.from('estoque_produtos')
        .select('id,nome,estoque_minimo,data_validade,estoque_saldo(quantidade)')
        .eq('unidade_id', CU)
        .eq('ativo', true);

      var alertas = [];
      (r.data || []).forEach(function (p) {
        var saldoArr = Array.isArray(p.estoque_saldo) ? p.estoque_saldo : [];
        var saldo = saldoArr.reduce(function (acc, s) { return acc + parseFloat(s.quantidade || 0); }, 0);
        if (saldo <= parseFloat(p.estoque_minimo || 0)) {
          alertas.push({ tipo: 'baixo', produto: p.nome, saldo: saldo });
        }
        var dias = _diasParaVencer(p.data_validade);
        if (dias >= 0 && dias <= 30) {
          alertas.push({ tipo: 'vencimento', produto: p.nome, dias: dias });
        }
      });

      var rPed = await _sb.from('estoque_pedidos').select('id').eq('unidade_id', CU).eq('status', 'PENDENTE');
      var pedPend = (rPed.data || []).length;

      return { alertas: alertas, pedidosPendentes: pedPend };
    } catch (e) { return { alertas: [], pedidosPendentes: 0 }; }
  }

  /* ─── Pequenos utilitários de DOM ─── */
  function _gv (id) { var el = sid(id); return el ? el.value : ''; }
  function _vl (id, val) { var el = sid(id); if (el) el.value = val; }

  /* ─── API pública ─── */
  return {
    init:                init,
    trocarAba:           trocarAba,
    // categorias
    abrirModalCategoria: abrirModalCategoria,
    fecharModalCategoria:fecharModalCategoria,
    salvarCategoria:     salvarCategoria,
    desativarCategoria:  desativarCategoria,
    reativarCategoria:   reativarCategoria,
    // produtos
    abrirModalProduto:   abrirModalProduto,
    fecharModalProduto:  fecharModalProduto,
    salvarProduto:       salvarProduto,
    excluirProduto:      excluirProduto,
    // movimentações
    abrirModalMov:       abrirModalMov,
    fecharModalMov:      fecharModalMov,
    salvarMov:           salvarMov,
    // pedidos
    abrirModalPedido:    abrirModalPedido,
    fecharModalPedido:   fecharModalPedido,
    addItemPedido:       addItemPedido,
    removerItemPedido:   removerItemPedido,
    salvarPedido:        salvarPedido,
    abrirModalAprovar:   abrirModalAprovar,
    fecharModalAprovar:  fecharModalAprovar,
    confirmarAprovacao:  confirmarAprovacao,
    abrirModalReceber:   abrirModalReceber,
    fecharModalReceber:  fecharModalReceber,
    confirmarRecebimento:confirmarRecebimento,
    verDetalhesPedido:   verDetalhesPedido,
    // vínculos
    abrirModalVinculo:   abrirModalVinculo,
    fecharModalVinculo:  fecharModalVinculo,
    salvarVinculo:       salvarVinculo,
    excluirVinculo:      excluirVinculo,
    // alertas
    checkAlertas:        checkAlertas
  };
})();
