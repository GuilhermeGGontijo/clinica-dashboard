/* ═══════════════════════════════════════════════════════════════════════
   PAINEL DE CONTROLE CLÍNICO — js/modules/relatorios.js
   RelatoriosMod: relatórios individuais calculados a partir de dados reais
   (agendamentos, procedimentos) da unidade atual.
   Depende de: supabase.js (_sb, CU), main.js (sid, esc, brl, toast)
═══════════════════════════════════════════════════════════════════════ */

const RelatoriosMod = (function () {
  'use strict';

  var _ultimo = null; /* { chave, titulo, periodo, itens } — para exportação */

  /* ── Período padrão: mês atual ── */
  function _mesAtualIni () {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
  }
  function _mesAtualFim () {
    var d = new Date();
    var ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return ultimo.getFullYear() + '-' + String(ultimo.getMonth() + 1).padStart(2, '0') + '-' + String(ultimo.getDate()).padStart(2, '0');
  }

  function init () {
    [['relAbsIni', 'relAbsFim'], ['relTickIni', 'relTickFim'], ['relFatIni', 'relFatFim']].forEach(function (par) {
      var ini = sid(par[0]), fim = sid(par[1]);
      if (ini && !ini.value) ini.value = _mesAtualIni();
      if (fim && !fim.value) fim.value = _mesAtualFim();
    });
    carregarAbsenteismo();
    carregarTicketMedio();
    carregarFaturamento();
  }

  function _periodo (idIni, idFim) {
    var ini = (sid(idIni) || {}).value || _mesAtualIni();
    var fim = (sid(idFim) || {}).value || _mesAtualFim();
    return { ini: ini, fim: fim };
  }

  function _fmtPeriodo (p) {
    var f = function (s) { var partes = s.split('-'); return partes[2] + '/' + partes[1] + '/' + partes[0]; };
    return f(p.ini) + ' a ' + f(p.fim);
  }

  function _renderResultados (containerId, itens) {
    var wrap = sid(containerId);
    if (!wrap) return;
    wrap.innerHTML = itens.map(function (it) {
      return '<div class="relResItem">'
        + '<div class="relResLabel">' + esc(it.label) + '</div>'
        + '<div class="relResVal" style="' + (it.cor ? 'color:' + it.cor : '') + '">' + esc(it.val) + '</div>'
        + '</div>';
    }).join('');
  }

  /* ══════════════════════════════════════
     ABSENTEÍSMO
  ══════════════════════════════════════ */
  async function carregarAbsenteismo () {
    var p = _periodo('relAbsIni', 'relAbsFim');
    var wrap = sid('relAbsResultados');
    if (wrap) wrap.innerHTML = '<div class="relResVazio">Calculando...</div>';

    var rTotal = await _sb.from('agendamentos').select('id', { count: 'exact', head: true })
      .eq('unidade_id', CU).gte('data_agendamento', p.ini).lte('data_agendamento', p.fim);
    var rFaltas = await _sb.from('agendamentos').select('id', { count: 'exact', head: true })
      .eq('unidade_id', CU).eq('status', 'Falta').gte('data_agendamento', p.ini).lte('data_agendamento', p.fim);

    var total = rTotal.count || 0;
    var faltas = rFaltas.count || 0;
    var taxa = total > 0 ? (faltas / total) * 100 : null;

    var itens = [
      { label: 'Total de Agendamentos', val: String(total) },
      { label: 'Faltas', val: String(faltas), cor: faltas > 0 ? 'var(--r6)' : '' },
      { label: 'Taxa de Absenteísmo', val: taxa != null ? taxa.toFixed(1) + '%' : '—', cor: taxa != null ? (taxa <= 10 ? 'var(--g6)' : taxa <= 20 ? 'var(--amb)' : 'var(--r6)') : '' }
    ];
    _renderResultados('relAbsResultados', itens);
    _ultimo = _ultimo || {};
    _ultimo.abs = { titulo: 'Taxa de Absenteísmo', periodo: p, itens: itens };
  }

  /* ══════════════════════════════════════
     PACIENTES E TICKET MÉDIO
  ══════════════════════════════════════ */
  async function carregarTicketMedio () {
    var p = _periodo('relTickIni', 'relTickFim');
    var wrap = sid('relTickResultados');
    if (wrap) wrap.innerHTML = '<div class="relResVazio">Calculando...</div>';

    var r = await _sb.from('agendamentos').select('paciente_id, valor_cobrado')
      .eq('unidade_id', CU).eq('status', 'Finalizado')
      .gte('data_agendamento', p.ini).lte('data_agendamento', p.fim);

    var linhas = r.data || [];
    var pacientesUnicos = new Set(linhas.map(function (l) { return l.paciente_id; }).filter(Boolean)).size;
    var faturamento = linhas.reduce(function (s, l) { return s + (parseFloat(l.valor_cobrado) || 0); }, 0);
    var ticket = pacientesUnicos > 0 ? faturamento / pacientesUnicos : null;

    var itens = [
      { label: 'Atendimentos Finalizados', val: String(linhas.length) },
      { label: 'Pacientes Únicos', val: String(pacientesUnicos) },
      { label: 'Faturamento Bruto', val: 'R$ ' + brl(faturamento), cor: 'var(--g6)' },
      { label: 'Ticket Médio', val: ticket != null ? 'R$ ' + brl(ticket) : '—', cor: 'var(--g6)' }
    ];
    _renderResultados('relTickResultados', itens);
    _ultimo = _ultimo || {};
    _ultimo.tick = { titulo: 'Pacientes Atendidos e Ticket Médio', periodo: p, itens: itens };
  }

  /* ══════════════════════════════════════
     FATURAMENTO E REPASSES
  ══════════════════════════════════════ */
  async function carregarFaturamento () {
    var p = _periodo('relFatIni', 'relFatFim');
    var wrap = sid('relFatResultados');
    if (wrap) wrap.innerHTML = '<div class="relResVazio">Calculando...</div>';

    var r = await _sb.from('agendamentos')
      .select('valor_cobrado, procedimento:procedimentos!agendamentos_procedimento_id_fkey(valor_repasse,tipo_repasse)')
      .eq('unidade_id', CU).eq('status', 'Finalizado')
      .gte('data_agendamento', p.ini).lte('data_agendamento', p.fim);

    var linhas = r.data || [];
    var faturamento = 0, repasse = 0;
    linhas.forEach(function (l) {
      var valor = parseFloat(l.valor_cobrado) || 0;
      faturamento += valor;
      var proc = l.procedimento;
      if (proc && valor > 0) {
        var vr = parseFloat(proc.valor_repasse) || 0;
        repasse += proc.tipo_repasse === 'percentual' ? (valor * vr / 100) : vr;
      }
    });
    var liquida = faturamento - repasse;

    var itens = [
      { label: 'Faturamento Bruto', val: 'R$ ' + brl(faturamento), cor: 'var(--g6)' },
      { label: 'Repassado a Profissionais', val: 'R$ ' + brl(repasse) },
      { label: 'Receita Líquida da Clínica', val: 'R$ ' + brl(liquida), cor: liquida >= 0 ? 'var(--g7)' : 'var(--r6)' }
    ];
    _renderResultados('relFatResultados', itens);
    _ultimo = _ultimo || {};
    _ultimo.fat = { titulo: 'Faturamento e Repasses', periodo: p, itens: itens };
  }

  /* ══════════════════════════════════════
     EXPORTAR / IMPRIMIR
  ══════════════════════════════════════ */
  function exportar (chave, tituloFallback) {
    var dados = _ultimo && _ultimo[chave];
    if (!dados) { toast('Atualize o relatório antes de exportar.', 'warn'); return; }
    var doc = sid('relDocImpressao');
    if (!doc) return;

    var u = (typeof UNITS !== 'undefined' ? UNITS : []).find(function (x) { return x.id === CU; });
    var html = '<div class="relImpTitulo">' + esc(dados.titulo || tituloFallback) + '</div>'
      + '<div class="relImpPeriodo">' + esc(u ? u.name : CU) + ' · Período: ' + _fmtPeriodo(dados.periodo) + '</div>'
      + '<div class="relImpGrid">'
      + dados.itens.map(function (it) {
          return '<div class="relImpItem">'
            + '<div class="relImpLabel">' + esc(it.label) + '</div>'
            + '<div class="relImpVal">' + esc(it.val) + '</div>'
            + '</div>';
        }).join('')
      + '</div>'
      + '<div class="relImpRodape">Gerado em ' + new Date().toLocaleString('pt-BR') + '</div>';

    doc.innerHTML = html;
    document.body.classList.add('rel-imprimindo');
    window.print();
    document.body.classList.remove('rel-imprimindo');
  }

  return { init, carregarAbsenteismo, carregarTicketMedio, carregarFaturamento, exportar };
})();
