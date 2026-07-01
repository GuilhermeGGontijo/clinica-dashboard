/* ═══════════════════════════════════════════════════════════════════════
   PAINEL DE CONTROLE CLÍNICO — js/modules/relatorios.js
   RelatoriosMod: relatórios individuais e detalhados (linha a linha + resumo)
   calculados a partir de dados reais (agendamentos, procedimentos) da
   unidade atual.
   Depende de: supabase.js (_sb, CU), main.js (sid, esc, brl, toast)
═══════════════════════════════════════════════════════════════════════ */

const RelatoriosMod = (function () {
  'use strict';

  var TIPO_LABEL = { consulta: 'Consulta', procedimento: 'Procedimento', exame: 'Exame' };

  var _ultimo = {}; /* { chave: { titulo, periodo, colunas, linhas, resumo } } — para exportação */

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
  function _fmtData (s) {
    if (!s) return '—';
    var partes = String(s).split('-');
    return partes[2] + '/' + partes[1] + '/' + partes[0];
  }

  function init () {
    [['relAbsIni', 'relAbsFim'], ['relAtdIni', 'relAtdFim']].forEach(function (par) {
      var ini = sid(par[0]), fim = sid(par[1]);
      if (ini && !ini.value) ini.value = _mesAtualIni();
      if (fim && !fim.value) fim.value = _mesAtualFim();
    });
    carregarAbsenteismo();
    carregarAtendimentos();
  }

  function _periodo (idIni, idFim) {
    var ini = (sid(idIni) || {}).value || _mesAtualIni();
    var fim = (sid(idFim) || {}).value || _mesAtualFim();
    return { ini: ini, fim: fim };
  }

  function _fmtPeriodo (p) {
    return _fmtData(p.ini) + ' a ' + _fmtData(p.fim);
  }

  function _renderResumo (containerId, itens) {
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
     FALTAS E ABSENTEÍSMO
  ══════════════════════════════════════ */
  async function carregarAbsenteismo () {
    var p = _periodo('relAbsIni', 'relAbsFim');
    var tbody = sid('relAbsTabela') ? sid('relAbsTabela').querySelector('tbody') : null;
    if (tbody) tbody.innerHTML = '<tr><td colspan="3" class="relResVazio">Calculando...</td></tr>';

    var rTotal = await _sb.from('agendamentos').select('id', { count: 'exact', head: true })
      .eq('unidade_id', CU).gte('data_agendamento', p.ini).lte('data_agendamento', p.fim);

    var rFaltas = await _sb.from('agendamentos')
      .select('data_agendamento, pacientes(nome_completo), profissional:perfis_usuarios!agendamentos_profissional_id_fkey(nome)')
      .eq('unidade_id', CU).eq('status', 'Falta')
      .gte('data_agendamento', p.ini).lte('data_agendamento', p.fim)
      .order('data_agendamento');

    var total = rTotal.count || 0;
    var linhas = rFaltas.data || [];
    var taxa = total > 0 ? (linhas.length / total) * 100 : null;

    if (tbody) {
      tbody.innerHTML = !linhas.length
        ? '<tr><td colspan="3" class="relResVazio">Nenhuma falta registrada no período.</td></tr>'
        : linhas.map(function (l) {
            return '<tr>'
              + '<td>' + _fmtData(l.data_agendamento) + '</td>'
              + '<td>' + esc(l.profissional ? l.profissional.nome : '—') + '</td>'
              + '<td>' + esc(l.pacientes ? l.pacientes.nome_completo : '—') + '</td>'
              + '</tr>';
          }).join('');
    }

    var resumo = [
      { label: 'Total de Agendamentos', val: String(total) },
      { label: 'Faltas', val: String(linhas.length), cor: linhas.length > 0 ? 'var(--r6)' : '' },
      { label: 'Taxa de Absenteísmo', val: taxa != null ? taxa.toFixed(1) + '%' : '—', cor: taxa != null ? (taxa <= 10 ? 'var(--g6)' : taxa <= 20 ? 'var(--amb)' : 'var(--r6)') : '' }
    ];
    _renderResumo('relAbsResumo', resumo);

    _ultimo.abs = {
      titulo: 'Faltas e Absenteísmo', periodo: p,
      colunas: ['Data', 'Profissional', 'Paciente'],
      linhas: linhas.map(function (l) { return [_fmtData(l.data_agendamento), l.profissional ? l.profissional.nome : '—', l.pacientes ? l.pacientes.nome_completo : '—']; }),
      resumo: resumo
    };
  }

  /* ══════════════════════════════════════
     ATENDIMENTOS REALIZADOS (CONSULTAS, PROCEDIMENTOS, EXAMES)
  ══════════════════════════════════════ */
  async function carregarAtendimentos () {
    var p = _periodo('relAtdIni', 'relAtdFim');
    var tbody = sid('relAtdTabela') ? sid('relAtdTabela').querySelector('tbody') : null;
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="relResVazio">Calculando...</td></tr>';

    var r = await _sb.from('agendamentos')
      .select('data_agendamento, valor_cobrado, paciente_id, ' +
              'pacientes(nome_completo), ' +
              'profissional:perfis_usuarios!agendamentos_profissional_id_fkey(nome), ' +
              'procedimento:procedimentos!agendamentos_procedimento_id_fkey(nome,tipo,valor_repasse,tipo_repasse)')
      .eq('unidade_id', CU).eq('status', 'Finalizado')
      .gte('data_agendamento', p.ini).lte('data_agendamento', p.fim)
      .order('data_agendamento');

    var linhas = r.data || [];
    var faturamento = 0, repasseTotal = 0;
    var contagemTipo = { consulta: 0, procedimento: 0, exame: 0 };
    var pacientesUnicos = new Set();

    var linhasFmt = linhas.map(function (l) {
      var valor = parseFloat(l.valor_cobrado) || 0;
      var proc = l.procedimento;
      var repasse = 0;
      if (proc && valor > 0) {
        var vr = parseFloat(proc.valor_repasse) || 0;
        repasse = proc.tipo_repasse === 'percentual' ? (valor * vr / 100) : vr;
      }
      faturamento += valor;
      repasseTotal += repasse;
      if (l.paciente_id) pacientesUnicos.add(l.paciente_id);
      var tipo = proc && proc.tipo && contagemTipo.hasOwnProperty(proc.tipo) ? proc.tipo : null;
      if (tipo) contagemTipo[tipo]++;
      return {
        data: _fmtData(l.data_agendamento),
        profissional: l.profissional ? l.profissional.nome : '—',
        paciente: l.pacientes ? l.pacientes.nome_completo : '—',
        tipo: tipo ? TIPO_LABEL[tipo] : '—',
        procedimento: proc ? proc.nome : '—',
        valor: valor,
        repasse: repasse
      };
    });

    if (tbody) {
      tbody.innerHTML = !linhasFmt.length
        ? '<tr><td colspan="7" class="relResVazio">Nenhum atendimento finalizado no período.</td></tr>'
        : linhasFmt.map(function (l) {
            return '<tr>'
              + '<td>' + l.data + '</td>'
              + '<td>' + esc(l.profissional) + '</td>'
              + '<td>' + esc(l.paciente) + '</td>'
              + '<td>' + esc(l.tipo) + '</td>'
              + '<td>' + esc(l.procedimento) + '</td>'
              + '<td>R$ ' + brl(l.valor) + '</td>'
              + '<td>R$ ' + brl(l.repasse) + '</td>'
              + '</tr>';
          }).join('');
    }

    var liquida = faturamento - repasseTotal;
    var resumo = [
      { label: 'Total de Atendimentos', val: String(linhasFmt.length) },
      { label: 'Pacientes Únicos', val: String(pacientesUnicos.size) },
      { label: 'Consultas', val: String(contagemTipo.consulta) },
      { label: 'Procedimentos', val: String(contagemTipo.procedimento) },
      { label: 'Exames', val: String(contagemTipo.exame) },
      { label: 'Faturamento Bruto', val: 'R$ ' + brl(faturamento), cor: 'var(--g6)' },
      { label: 'Total Repassado', val: 'R$ ' + brl(repasseTotal) },
      { label: 'Receita Líquida', val: 'R$ ' + brl(liquida), cor: liquida >= 0 ? 'var(--g7)' : 'var(--r6)' }
    ];
    _renderResumo('relAtdResumo', resumo);

    _ultimo.atd = {
      titulo: 'Atendimentos Realizados', periodo: p,
      colunas: ['Data', 'Profissional', 'Paciente', 'Tipo', 'Procedimento', 'Valor Cobrado', 'Repassado'],
      linhas: linhasFmt.map(function (l) { return [l.data, l.profissional, l.paciente, l.tipo, l.procedimento, 'R$ ' + brl(l.valor), 'R$ ' + brl(l.repasse)]; }),
      resumo: resumo
    };
  }

  /* ══════════════════════════════════════
     EXPORTAR / IMPRIMIR
  ══════════════════════════════════════ */
  function exportar (chave, tituloFallback) {
    var dados = _ultimo[chave];
    if (!dados) { toast('Atualize o relatório antes de exportar.', 'warn'); return; }
    var doc = sid('relDocImpressao');
    if (!doc) return;

    var u = (typeof UNITS !== 'undefined' ? UNITS : []).find(function (x) { return x.id === CU; });
    var html = '<div class="relImpTitulo">' + esc(dados.titulo || tituloFallback) + '</div>'
      + '<div class="relImpPeriodo">' + esc(u ? u.name : CU) + ' · Período: ' + _fmtPeriodo(dados.periodo) + '</div>'
      + '<table class="relImpTabela"><thead><tr>'
      + dados.colunas.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('')
      + '</tr></thead><tbody>'
      + (dados.linhas.length
          ? dados.linhas.map(function (linha) {
              return '<tr>' + linha.map(function (v) { return '<td>' + esc(String(v)) + '</td>'; }).join('') + '</tr>';
            }).join('')
          : '<tr><td colspan="' + dados.colunas.length + '">Nenhum registro no período.</td></tr>')
      + '</tbody></table>'
      + '<div class="relImpGrid">'
      + dados.resumo.map(function (it) {
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

  return { init, carregarAbsenteismo, carregarAtendimentos, exportar };
})();
