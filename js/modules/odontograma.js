/* ═══════════════════════════════════════════════════════════════════════
   PAINEL DE CONTROLE CLÍNICO — js/modules/odontograma.js
   OdontogramaMod: Odontograma Interativo com lançamento de orçamento
   Depende de: supabase.js (_sb), main.js (sid, esc, toast, CU, USER_PROFILE)
═══════════════════════════════════════════════════════════════════════ */

const OdontogramaMod = (function () {
  'use strict';

  /* ── Estado interno ── */
  var _pacienteId   = null;
  var _pacienteNome = '';
  var _itensOrcamento = [];   // { dente, faces[], procedimentoId, procedimentoNome, valor }
  var _procedimentos  = [];   // lista carregada do Supabase
  var _finalizando    = false;

  /* ── Numeração FDI completa ── */
  var PERM_SUP  = [18,17,16,15,14,13,12,11, 21,22,23,24,25,26,27,28];
  var PERM_INF  = [48,47,46,45,44,43,42,41, 31,32,33,34,35,36,37,38];
  var DEC_SUP   = [55,54,53,52,51, 61,62,63,64,65];
  var DEC_INF   = [85,84,83,82,81, 71,72,73,74,75];

  /* Faces: [chave, label, classe-CSS] */
  var FACES = [
    ['V', 'Vestibular', 'top'],
    ['L', 'Lingual',    'bottom'],
    ['D', 'Distal',     'right'],
    ['M', 'Mesial',     'left'],
    ['O', 'Oclusal',    'center']
  ];

  /* ══════════════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════════════ */
  async function init() {
    _resetEstado();
    /* Preload de paciente vindo do Prontuário */
    if (window._odoPreloadPaciente) {
      var pre = window._odoPreloadPaciente;
      window._odoPreloadPaciente = null;
      _pacienteId   = pre.id;
      _pacienteNome = pre.nome;
    }
    await _carregarProcedimentos();
    _renderArcadas();
    _renderListaProcedimentos();
    _renderItens();
    _atualizarTotal();
    _mostrarSelecaoPaciente();
  }

  function _resetEstado() {
    _pacienteId     = null;
    _pacienteNome   = '';
    _itensOrcamento = [];
    _finalizando    = false;
  }

  /* ══════════════════════════════════════════════════════════════════
     CARREGAMENTO DE PROCEDIMENTOS
  ══════════════════════════════════════════════════════════════════ */
  async function _carregarProcedimentos() {
    if (!_sb) return;
    var r = await _sb.from('odonto_procedimentos')
      .select('id,nome_intervencao,valor_base,especialidade')
      .eq('ativo', true)
      .order('especialidade')
      .order('nome_intervencao');
    _procedimentos = r.data || [];
  }

  function _renderListaProcedimentos() {
    var sel = sid('odontoProcSel');
    if (!sel) return;

    if (!_procedimentos.length) {
      sel.innerHTML = '<option value="">— Nenhum procedimento cadastrado —</option>';
      return;
    }

    /* Agrupar por especialidade */
    var grupos = {};
    _procedimentos.forEach(function (p) {
      var esp = p.especialidade || 'Geral';
      if (!grupos[esp]) grupos[esp] = [];
      grupos[esp].push(p);
    });

    var html = '<option value="">— Selecione um procedimento —</option>';
    Object.keys(grupos).sort().forEach(function (esp) {
      html += '<optgroup label="' + esc(esp) + '">';
      grupos[esp].forEach(function (p) {
        html += '<option value="' + esc(p.id) + '" data-valor="' + p.valor_base + '">'
              + esc(p.nome_intervencao) + ' — R$ ' + Number(p.valor_base).toFixed(2).replace('.', ',')
              + '</option>';
      });
      html += '</optgroup>';
    });
    sel.innerHTML = html;
  }

  /* ══════════════════════════════════════════════════════════════════
     RENDERIZAÇÃO DAS ARCADAS
  ══════════════════════════════════════════════════════════════════ */
  function _renderArcadas() {
    _preencherLinha('odontoPermanenteSup',  PERM_SUP, false);
    _preencherLinha('odontoDeciduaSup',     DEC_SUP,  true);
    _preencherLinha('odontoDeciduaInf',     DEC_INF,  true);
    _preencherLinha('odontoPermanenteInf',  PERM_INF, false);
  }

  function _preencherLinha(containerId, dentes, deciduo) {
    var container = sid(containerId);
    if (!container) return;
    container.innerHTML = '';
    dentes.forEach(function (num) {
      container.appendChild(_criarElementoDente(num, deciduo));
    });
  }

  function _criarElementoDente(numero, deciduo) {
    var wrapper = document.createElement('div');
    wrapper.className = 'odontoDente' + (deciduo ? ' deciduo' : '');
    wrapper.dataset.dente = numero;
    wrapper.title = 'Dente ' + numero;

    /* Número do dente */
    var label = document.createElement('div');
    label.className = 'odontoDenteNum';
    label.textContent = numero;
    wrapper.appendChild(label);

    /* Gráfico com as 5 faces */
    var grafico = document.createElement('div');
    grafico.className = 'odontoDenteGraf';

    FACES.forEach(function (face) {
      var chave = face[0];
      var titulo = face[1];
      var cls   = face[2];

      var el = document.createElement('div');
      el.className     = 'odFace ' + cls;
      el.dataset.dente = numero;
      el.dataset.face  = chave;
      el.title         = titulo + ' — Dente ' + numero;

      el.addEventListener('click', function () {
        _toggleFace(el);
      });

      grafico.appendChild(el);
    });

    wrapper.appendChild(grafico);
    return wrapper;
  }

  function _toggleFace(el) {
    if (el.classList.contains('finalizada')) return; /* dente já registrado */
    el.classList.toggle('selecionada');
  }

  /* ══════════════════════════════════════════════════════════════════
     LANÇAR FACES SELECIONADAS NO ORÇAMENTO
  ══════════════════════════════════════════════════════════════════ */
  function lancarSelecao() {
    if (!_pacienteId) { toast('Selecione um paciente primeiro', 'warn'); return; }

    var sel = sid('odontoProcSel');
    if (!sel || !sel.value) { toast('Selecione um procedimento', 'warn'); return; }

    var procId  = sel.value;
    var procOpt = sel.options[sel.selectedIndex];
    var procNome = procOpt ? procOpt.text.split(' — R$')[0] : '';
    var valor    = procOpt ? parseFloat(procOpt.dataset.valor) || 0 : 0;

    /* Coletar faces selecionadas agrupadas por dente */
    var facesSel = document.querySelectorAll('.odFace.selecionada');
    if (!facesSel.length) { toast('Clique nas faces do dente desejado', 'warn'); return; }

    var porDente = {};
    facesSel.forEach(function (el) {
      var d = el.dataset.dente;
      if (!porDente[d]) porDente[d] = [];
      porDente[d].push(el.dataset.face);
    });

    /* Criar um item por dente */
    Object.keys(porDente).forEach(function (dente) {
      _itensOrcamento.push({
        dente:           parseInt(dente),
        faces:           porDente[dente].join(','),
        procedimentoId:  procId,
        procedimentoNome: procNome,
        valor:           valor
      });
    });

    /* Limpar seleção */
    facesSel.forEach(function (el) { el.classList.remove('selecionada'); });

    _renderItens();
    _atualizarTotal();
    toast('✅ ' + Object.keys(porDente).length + ' dente(s) lançado(s) no orçamento', 'success');
  }

  /* ══════════════════════════════════════════════════════════════════
     RENDERIZAR TABELA DE ITENS
  ══════════════════════════════════════════════════════════════════ */
  function _renderItens() {
    var tbody = sid('odontoItensBody');
    if (!tbody) return;

    if (!_itensOrcamento.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="odontoVazio">Nenhum item lançado</td></tr>';
      return;
    }

    tbody.innerHTML = _itensOrcamento.map(function (item, idx) {
      return '<tr>'
        + '<td><strong>' + item.dente + '</strong></td>'
        + '<td>' + esc(item.faces) + '</td>'
        + '<td>' + esc(item.procedimentoNome) + '</td>'
        + '<td>R$ ' + Number(item.valor).toFixed(2).replace('.', ',') + '</td>'
        + '<td><button class="odontoRemBtn" onclick="OdontogramaMod.removerItem(' + idx + ')" title="Remover">✕</button></td>'
        + '</tr>';
    }).join('');
  }

  function removerItem(idx) {
    _itensOrcamento.splice(idx, 1);
    _renderItens();
    _atualizarTotal();
  }

  function _atualizarTotal() {
    var total = _itensOrcamento.reduce(function (acc, i) { return acc + (i.valor || 0); }, 0);
    var el = sid('odontoTotal');
    if (el) el.textContent = 'R$ ' + total.toFixed(2).replace('.', ',');
  }

  /* ══════════════════════════════════════════════════════════════════
     SELEÇÃO DE PACIENTE
  ══════════════════════════════════════════════════════════════════ */
  function _mostrarSelecaoPaciente() {
    var el = sid('odontoPacienteInfo');
    if (!el) return;
    if (_pacienteId) {
      el.innerHTML = '<span class="odontoPacNome">👤 ' + esc(_pacienteNome) + '</span>'
        + ' <button class="btn bSm" style="background:var(--s1);color:var(--s7);border:1px solid var(--s2)" '
        + 'onclick="OdontogramaMod.trocarPaciente()">Trocar</button>';
    } else {
      el.innerHTML = '<span style="color:var(--s4);font-size:.84rem">Nenhum paciente selecionado</span>';
    }
  }

  function trocarPaciente() {
    if (_itensOrcamento.length) {
      if (!confirm('Trocar de paciente irá limpar o orçamento atual. Continuar?')) return;
    }
    _itensOrcamento = [];
    _renderItens();
    _atualizarTotal();
    abrirBuscaPaciente();
  }

  function abrirBuscaPaciente() {
    var modal = sid('odontoModalPaciente');
    if (modal) {
      modal.classList.add('open');
      var inp = sid('odontoBuscaPacInp');
      if (inp) { inp.value = ''; setTimeout(function () { inp.focus(); }, 80); }
      _renderListaTodosOdo();
    }
  }

  function fecharBuscaPaciente() {
    var modal = sid('odontoModalPaciente');
    if (modal) modal.classList.remove('open');
  }

  var _buscaTmr = null;
  function buscarPaciente(q) {
    clearTimeout(_buscaTmr);
    var res = sid('odontoBuscaPacRes');
    if (!res) return;
    if (!q || q.length < 2) {
      res.innerHTML = '';
      _renderListaTodosOdo();
      return;
    }
    res.innerHTML = '<div style="color:var(--s4);font-size:.82rem;padding:8px">Buscando...</div>';
    _buscaTmr = setTimeout(async function () {
      var queryBase = _sb.from('pacientes')
        .select('id,nome_completo,cpf,data_nascimento,celular')
        .eq('ativo', true)
        .eq('unidade_id', CU);

      /* busca por CPF se começar com dígito, senão por nome */
      var qFmt = q.replace(/\D/g, '');
      var r = /^\d/.test(q) && qFmt.length
        ? await queryBase.ilike('cpf', '%' + qFmt + '%').limit(15)
        : await queryBase.ilike('nome_completo', '%' + q + '%').limit(15);

      var lista = r.data || [];
      if (r.error) {
        res.innerHTML = '<div style="color:var(--r6);font-size:.82rem;padding:8px">⚠️ Erro: ' + r.error.message + '</div>';
        return;
      }
      if (!lista.length) {
        res.innerHTML = '<div style="color:var(--s4);font-size:.82rem;padding:8px">Nenhum paciente encontrado para "' + esc(q) + '"</div>';
        return;
      }
      res.innerHTML = lista.map(function (p) {
        var idade = _calcIdadePac(p.data_nascimento);
        var cpfFmt = p.cpf ? p.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '';
        return '<div class="odontoPacItem" onclick="OdontogramaMod.selecionarPaciente(\'' + p.id + '\',\'' + esc(p.nome_completo) + '\')">'
          + '<div class="odontoPacItemNome">👤 <strong>' + esc(p.nome_completo) + '</strong></div>'
          + '<div class="odontoPacItemMeta">'
          + (cpfFmt ? 'CPF: ' + cpfFmt + ' · ' : '')
          + (idade ? idade + ' anos' : '')
          + (p.celular ? ' · 📱 ' + p.celular : '')
          + '</div>'
          + '</div>';
      }).join('');
    }, 300);
  }

  /* Lista todos os pacientes da unidade ao abrir o modal (sem digitar) */
  async function _renderListaTodosOdo() {
    var res = sid('odontoBuscaPacRes');
    if (!res) return;
    res.innerHTML = '<div style="color:var(--s4);font-size:.82rem;padding:8px">Carregando pacientes...</div>';
    var r = await _sb.from('pacientes')
      .select('id,nome_completo,cpf,data_nascimento,celular')
      .eq('ativo', true)
      .eq('unidade_id', CU)
      .order('nome_completo')
      .limit(50);
    var lista = r.data || [];
    if (!lista.length) {
      res.innerHTML = '<div style="color:var(--s4);font-size:.82rem;padding:8px">Nenhum paciente cadastrado nesta unidade.</div>';
      return;
    }
    res.innerHTML = lista.map(function (p) {
      var idade = _calcIdadePac(p.data_nascimento);
      var cpfFmt = p.cpf ? p.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '';
      return '<div class="odontoPacItem" onclick="OdontogramaMod.selecionarPaciente(\'' + p.id + '\',\'' + esc(p.nome_completo) + '\')">'
        + '<div class="odontoPacItemNome">👤 <strong>' + esc(p.nome_completo) + '</strong></div>'
        + '<div class="odontoPacItemMeta">'
        + (cpfFmt ? 'CPF: ' + cpfFmt + ' · ' : '')
        + (idade ? idade + ' anos' : '')
        + (p.celular ? ' · 📱 ' + p.celular : '')
        + '</div>'
        + '</div>';
    }).join('');
  }

  function _calcIdadePac(dataNasc) {
    if (!dataNasc) return '';
    var hoje = new Date();
    var nasc  = new Date(dataNasc + 'T00:00:00');
    var anos  = hoje.getFullYear() - nasc.getFullYear();
    var m = hoje.getMonth() - nasc.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) anos--;
    return anos;
  }

  function selecionarPaciente(id, nome) {
    _pacienteId   = id;
    _pacienteNome = nome;
    fecharBuscaPaciente();
    _mostrarSelecaoPaciente();
    toast('Paciente: ' + nome, 'success');
  }

  /* ══════════════════════════════════════════════════════════════════
     FINALIZAR ATENDIMENTO → SALVAR NO SUPABASE
  ══════════════════════════════════════════════════════════════════ */
  async function finalizarAtendimento() {
    if (!_pacienteId)          { toast('Selecione um paciente', 'warn'); return; }
    if (!_itensOrcamento.length) { toast('Nenhum item no orçamento', 'warn'); return; }
    if (_finalizando)          return;

    if (!confirm('Finalizar atendimento e enviar cobrança para o caixa?')) return;

    _finalizando = true;
    var btn = sid('odontoBtnFinalizar');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    try {
      var su     = await _sb.auth.getUser();
      var userId = su.data && su.data.user ? su.data.user.id : null;

      var valorTotal = _itensOrcamento.reduce(function (acc, i) { return acc + (i.valor || 0); }, 0);

      /* 1. INSERT em orcamentos */
      var rOrc = await _sb.from('orcamentos').insert({
        paciente_id:     _pacienteId,
        profissional_id: userId,
        unidade_id:      CU,
        status_geral:    'Finalizado',
        valor_total:     valorTotal
      }).select('id').single();

      if (rOrc.error) throw rOrc.error;
      var orcamentoId = rOrc.data.id;

      /* 2. INSERT em orcamento_itens (bulk) */
      var itensBulk = _itensOrcamento.map(function (item) {
        return {
          orcamento_id:    orcamentoId,
          dente_numero:    item.dente,
          faces:           item.faces,
          procedimento_id: item.procedimentoId,
          valor_cobrado:   item.valor,
          status_item:     'Aprovado',
          motivo_glosa:    null
        };
      });

      var rItens = await _sb.from('orcamento_itens').insert(itensBulk);
      if (rItens.error) throw rItens.error;

      /* 3. INSERT em recebimentos (status PENDENTE para a recepção cobrar) */
      var rReceb = await _sb.from('recebimentos').insert({
        unidade_id:      CU,
        valor:           valorTotal,
        status:          'PENDENTE',
        data_recebimento: new Date().toISOString().split('T')[0],
        observacoes:     'Odontograma — Orçamento #' + orcamentoId.slice(0, 8).toUpperCase()
                       + ' | Paciente: ' + _pacienteNome,
        criado_por:      userId
      });
      if (rReceb.error) throw rReceb.error;

      /* 4. Feedback visual: marcar dentes lançados como "finalizados" (azul) */
      _itensOrcamento.forEach(function (item) {
        var faces = document.querySelectorAll('.odFace[data-dente="' + item.dente + '"]');
        faces.forEach(function (f) {
          var facesDoItem = item.faces.split(',');
          if (facesDoItem.indexOf(f.dataset.face) !== -1) {
            f.classList.remove('selecionada');
            f.classList.add('finalizada');
          }
        });
      });

      toast('✅ Atendimento finalizado! Cobrança enviada para o caixa.', 'success');

      /* Limpar orçamento */
      _itensOrcamento = [];
      _renderItens();
      _atualizarTotal();

    } catch (err) {
      toast('Erro ao finalizar: ' + err.message, 'error');
      console.error('[OdontogramaMod] finalizarAtendimento:', err);
    } finally {
      _finalizando = false;
      if (btn) { btn.disabled = false; btn.textContent = '✅ Finalizar e Enviar para Caixa'; }
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     EXPORT
  ══════════════════════════════════════════════════════════════════ */
  return {
    init,
    lancarSelecao,
    removerItem,
    finalizarAtendimento,
    abrirBuscaPaciente,
    fecharBuscaPaciente,
    buscarPaciente,
    selecionarPaciente,
    trocarPaciente
  };
})();

/* ══════════════════════════════════════════════════════════════════════════════
   FIM OdontogramaMod
   ══════════════════════════════════════════════════════════════════════════════ */
