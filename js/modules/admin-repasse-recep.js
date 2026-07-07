/* ═══════════════════════════════════════════════════════════════════════
   REPASSES DE RECEPCIONISTAS — js/modules/admin-repasse-recep.js
   Cadastro de repasses mensais para recepcionistas.
   Alimenta automaticamente o DRE no relatório de Relatórios.
   Depende de: supabase.js (_sb), main.js (sid, esc, toast, CU)
═══════════════════════════════════════════════════════════════════════ */
var AdminRepasseRecepMod = (function () {
  'use strict';

  var _repasses      = [];
  var _recepcionistas = [];
  var _salvando      = false;

  function _hoje() { return new Date().toISOString().split('T')[0]; }
  function _mesAtual() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
  }
  function _brl(v) {
    return 'R$ ' + (parseFloat(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function _fmtMes(s) {
    if (!s) return '—';
    var p = String(s).split('-');
    return p.length >= 2 ? p[1] + '/' + p[0] : s;
  }

  /* ══════════════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════════════ */
  async function init() {
    var wrap = sid('secAdminRepasseRecep');
    if (!wrap || !_sb) return;
    wrap.innerHTML = '<div class="dreLoading">⏳ Carregando…</div>';
    await _carregarRecepcionistas();
    await _carregar();
    _render();
  }

  async function _carregarRecepcionistas() {
    var r = await _sb.from('perfis_usuarios')
      .select('id,nome,cargo')
      .order('nome');
    _recepcionistas = (r.data || []).filter(function (p) {
      var c = (p.cargo || '').toLowerCase();
      return c.includes('recep') || c.includes('secretar') || c.includes('atendente');
    });
    if (!_recepcionistas.length) {
      _recepcionistas = r.data || [];
    }
  }

  async function _carregar() {
    var r = await _sb.from('repasses_recepcionistas')
      .select('id,recepcionista_id,competencia,valor,status,observacoes')
      .eq('unidade_id', CU)
      .order('competencia', { ascending: false })
      .limit(200);

    if (r.error) {
      _repasses = null;
      return;
    }

    _repasses = r.data || [];
    var pm = {};
    _recepcionistas.forEach(function (p) { pm[p.id] = p.nome; });
    _repasses.forEach(function (x) { x._nome = pm[x.recepcionista_id] || '—'; });
  }

  /* ══════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════ */
  function _render() {
    var wrap = sid('secAdminRepasseRecep');
    if (!wrap) return;

    if (_repasses === null) {
      wrap.innerHTML =
        '<div class="secModHdr"><div>' +
          '<div class="secModTitle">🧾 Repasses de Recepcionistas</div>' +
        '</div></div>' +
        '<div class="relAviso" style="margin-top:16px">' +
          '⚠️ A tabela <code>repasses_recepcionistas</code> ainda não existe. ' +
          'Execute o arquivo <strong>setup-repasse-recep.sql</strong> no Supabase SQL Editor para habilitar este módulo.' +
          '<br><br><button class="btn bG bSm" onclick="AdminRepasseRecepMod.init()">🔄 Tentar novamente</button>' +
        '</div>';
      return;
    }

    var total = _repasses.reduce(function (s, x) { return s + (parseFloat(x.valor) || 0); }, 0);
    var pendentes = _repasses.filter(function (x) { return x.status === 'pendente'; })
      .reduce(function (s, x) { return s + (parseFloat(x.valor) || 0); }, 0);

    var linhas = _repasses.map(function (x) {
      var st = x.status === 'pago'
        ? '<span style="color:var(--g6);font-weight:700">✅ Pago</span>'
        : '<span style="color:var(--a5);font-weight:700">⏳ Pendente</span>';
      var btnPagar = x.status === 'pendente'
        ? '<button class="btn bSm bG" onclick="AdminRepasseRecepMod.pagar(\'' + x.id + '\')">Marcar Pago</button> '
        : '';
      return '<tr>' +
        '<td><strong>' + esc(x._nome) + '</strong></td>' +
        '<td>' + _fmtMes(x.competencia) + '</td>' +
        '<td style="text-align:right;font-weight:700">' + _brl(x.valor) + '</td>' +
        '<td>' + esc(x.observacoes || '—') + '</td>' +
        '<td>' + st + '</td>' +
        '<td style="white-space:nowrap">' + btnPagar +
          '<button class="btn bSm bDng" onclick="AdminRepasseRecepMod.excluir(\'' + x.id + '\')">🗑</button>' +
        '</td></tr>';
    }).join('') || '<tr><td colspan="6" class="relVazio">Nenhum repasse cadastrado. Clique em "+ Novo Repasse" para começar.</td></tr>';

    wrap.innerHTML =
      '<div class="secModHdr">' +
        '<div>' +
          '<div class="secModTitle">🧾 Repasses de Recepcionistas</div>' +
          '<div class="secModSub">Lançamentos mensais de repasse para a equipe de recepção</div>' +
        '</div>' +
        '<button class="btn bG" onclick="AdminRepasseRecepMod.abrirForm()">+ Novo Repasse</button>' +
      '</div>' +

      '<div class="relKpis" style="margin-bottom:16px">' +
        '<div class="audKpiCard relKpiR"><div class="audKpiVal">' + _brl(pendentes) + '</div><div class="audKpiLbl">A Pagar</div></div>' +
        '<div class="audKpiCard"><div class="audKpiVal">' + _brl(total) + '</div><div class="audKpiLbl">Total Histórico</div></div>' +
        '<div class="audKpiCard"><div class="audKpiVal">' + _repasses.length + '</div><div class="audKpiLbl">Lançamentos</div></div>' +
      '</div>' +

      '<div class="relTableWrap"><table class="relTable">' +
        '<thead><tr>' +
          '<th>Recepcionista</th>' +
          '<th>Competência</th>' +
          '<th style="text-align:right">Valor</th>' +
          '<th>Observação</th>' +
          '<th>Status</th>' +
          '<th></th>' +
        '</tr></thead>' +
        '<tbody>' + linhas + '</tbody>' +
      '</table></div>' +

      '<div id="rrForm" class="dreForm" style="display:none">' +
        '<div class="dreFormTit">🧾 Novo Repasse de Recepcionista</div>' +
        '<div class="dreFormGrid">' +
          '<div class="patFG"><label class="afLabel">Recepcionista *</label>' +
            '<select id="rrRecep" class="afInp">' +
              '<option value="">— Selecione —</option>' +
              _recepcionistas.map(function (p) {
                return '<option value="' + p.id + '">' + esc(p.nome) + '</option>';
              }).join('') +
            '</select></div>' +
          '<div class="patFG"><label class="afLabel">Competência (mês) *</label>' +
            '<input type="month" id="rrCompetencia" class="afInp" value="' + _mesAtual().substring(0, 7) + '"/></div>' +
          '<div class="patFG"><label class="afLabel">Valor (R$) *</label>' +
            '<input type="number" id="rrValor" class="afInp" placeholder="0,00" min="0" step="0.01"/></div>' +
          '<div class="patFG"><label class="afLabel">Observação</label>' +
            '<input type="text" id="rrObs" class="afInp" placeholder="Ex: Bônus, hora extra…"/></div>' +
        '</div>' +
        '<div class="dreFormBtns">' +
          '<button class="btn bGh bSm" onclick="AdminRepasseRecepMod.fecharForm()">Cancelar</button>' +
          '<button class="btn bG bSm" id="rrBtnSalvar" onclick="AdminRepasseRecepMod.salvar()">💾 Salvar</button>' +
        '</div>' +
      '</div>';
  }

  /* ══════════════════════════════════════════════════════════════════
     AÇÕES
  ══════════════════════════════════════════════════════════════════ */
  function abrirForm() {
    var f = sid('rrForm');
    if (f) { f.style.display = ''; f.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  }

  function fecharForm() {
    var f = sid('rrForm');
    if (f) f.style.display = 'none';
  }

  async function salvar() {
    if (_salvando) return;
    var recepId    = (sid('rrRecep')      || {}).value || '';
    var competMes  = (sid('rrCompetencia')|| {}).value || '';
    var valor      = parseFloat((sid('rrValor') || {}).value || '0');
    var obs        = (sid('rrObs')        || {}).value || '';

    if (!recepId || !competMes || valor <= 0) {
      toast('Preencha recepcionista, competência e valor.', 'error'); return;
    }

    var competencia = competMes + '-01';

    _salvando = true;
    var btn = sid('rrBtnSalvar');
    if (btn) btn.disabled = true;

    var r = await _sb.from('repasses_recepcionistas').insert({
      unidade_id: CU, recepcionista_id: recepId,
      competencia: competencia, valor: valor,
      observacoes: obs || null, status: 'pendente'
    });

    _salvando = false;
    if (btn) btn.disabled = false;

    if (r.error) { toast('Erro: ' + r.error.message, 'error'); return; }
    toast('Repasse cadastrado!', 'success');
    await _carregar();
    _render();
  }

  async function pagar(id) {
    if (!confirm('Marcar este repasse como PAGO?')) return;
    var r = await _sb.from('repasses_recepcionistas').update({ status: 'pago' }).eq('id', id);
    if (r.error) { toast('Erro: ' + r.error.message, 'error'); return; }
    toast('Repasse marcado como pago.', 'success');
    await _carregar();
    _render();
  }

  async function excluir(id) {
    if (!confirm('Excluir este repasse?')) return;
    var r = await _sb.from('repasses_recepcionistas').delete().eq('id', id);
    if (r.error) { toast('Erro: ' + r.error.message, 'error'); return; }
    toast('Excluído.', 'success');
    await _carregar();
    _render();
  }

  return { init: init, abrirForm: abrirForm, fecharForm: fecharForm, salvar: salvar, pagar: pagar, excluir: excluir };
})();
