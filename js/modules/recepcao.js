/* ═══════════════════════════════════════════════════════════════════════
   PAINEL DE CONTROLE CLÍNICO — js/modules/recepcao.js
   RecepMod: Recepção do dia — 4 status selecionáveis por card
   Depende de: supabase.js (_sb), main.js (sid, esc, toast, CU)
═══════════════════════════════════════════════════════════════════════ */

const RecepMod = (function () {
  'use strict';

  var _itens = [];
  var _timer = null;
  var _pagModalAgId = null;

  var STATUS = {
    agendado:       { emoji: '⏳', label: 'Aguardando',     cls: 'stAguardando' },
    em_atendimento: { emoji: '🩺', label: 'Em Atendimento', cls: 'stAtendimento' },
    finalizado:     { emoji: '✅', label: 'Finalizado',      cls: 'stFinalizado'  },
    faltou:         { emoji: '❌', label: 'Faltou',          cls: 'stFaltou'      }
  };

  /* ── Init ── */
  async function init () {
    if (!_sb) return;
    var wrap = sid('rcpListWrap');
    if (wrap) wrap.innerHTML = '<div class="loadingState">Carregando atendimentos do dia...</div>';
    _setDataLabel();
    await _carregar();
    _render();
    _startTimer();
  }

  function _setDataLabel () {
    var el = sid('rcpDataLabel');
    if (!el) return;
    el.textContent = new Date().toLocaleDateString('pt-BR', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    });
    /* Capitaliza primeira letra */
    el.textContent = el.textContent.charAt(0).toUpperCase() + el.textContent.slice(1);
  }

  function _hoje () {
    var d = new Date();
    return d.getFullYear() + '-'
      + String(d.getMonth() + 1).padStart(2, '0') + '-'
      + String(d.getDate()).padStart(2, '0');
  }

  /* ── Carregar agendamentos de hoje ── */
  async function _carregar () {
    var hoje = _hoje();

    /* ── 1. Agendamentos com joins opcionais (sem recebimentos) ── */
    var rAg = await _sb.from('agendamentos')
      .select([
        'id', 'hora_inicio', 'hora_fim', 'status_recepcao', 'hora_chegada',
        'paciente_id', 'profissional_id', 'procedimento_id', 'sala_id',
        'valor_cobrado', 'status',
        'pacientes(nome_completo)',
        'profissional:perfis_usuarios!agendamentos_profissional_id_fkey(nome)',
        'procedimento:procedimentos!agendamentos_procedimento_id_fkey(nome,valor_padrao)',
        'sala:salas!agendamentos_sala_id_fkey(nome)'
      ].join(','))
      .gte('data_agendamento', hoje)
      .lte('data_agendamento', hoje)
      .eq('unidade_id', CU)
      .neq('status', 'Cancelado')
      .order('hora_inicio');

    if (rAg.error) {
      /* Fallback: sem joins, só campos base */
      console.warn('[RecepMod] join falhou, usando select simples:', rAg.error.message);
      rAg = await _sb.from('agendamentos')
        .select('id,hora_inicio,hora_fim,status_recepcao,hora_chegada,paciente_id,profissional_id,procedimento_id,sala_id,valor_cobrado,status')
        .gte('data_agendamento', hoje)
        .lte('data_agendamento', hoje)
        .eq('unidade_id', CU)
        .neq('status', 'Cancelado')
        .order('hora_inicio');
    }

    if (rAg.error) {
      console.error('[RecepMod]', rAg.error.message);
      var wrap = sid('rcpListWrap');
      if (wrap) wrap.innerHTML = '<div class="rcpVazio">⚠️ Erro ao carregar: ' + rAg.error.message + '</div>';
      _itens = [];
      return;
    }

    _itens = rAg.data || [];
    if (!_itens.length) return;

    var agIds = _itens.map(function (a) { return a.id; });

    /* ── 2. Recebimentos por query separada (evita problema de FK join) ── */
    var rReceb = await _sb.from('recebimentos')
      .select('agendamento_id,id,status,forma_pagamento,valor')
      .in('agendamento_id', agIds);

    var recebMap = {};
    if (!rReceb.error && rReceb.data) {
      rReceb.data.forEach(function (rb) {
        if (!recebMap[rb.agendamento_id]) recebMap[rb.agendamento_id] = [];
        recebMap[rb.agendamento_id].push(rb);
      });
    }
    _itens.forEach(function (ag) {
      ag.recebimentos = recebMap[ag.id] || [];
    });

    /* ── 3. Nomes de pacientes por query separada (fallback se join retornou null) ── */
    var semNome = _itens.filter(function (ag) {
      return ag.paciente_id && !(ag.pacientes && ag.pacientes.nome_completo);
    });
    if (semNome.length) {
      var patIds = semNome.map(function (ag) { return ag.paciente_id; });
      var rPac = await _sb.from('pacientes').select('id,nome_completo').in('id', patIds);
      if (!rPac.error && rPac.data) {
        var pacMap = {};
        rPac.data.forEach(function (p) { pacMap[p.id] = p.nome_completo; });
        _itens.forEach(function (ag) {
          if (ag.paciente_id && !(ag.pacientes && ag.pacientes.nome_completo)) {
            ag.pacientes = { nome_completo: pacMap[ag.paciente_id] || null };
          }
        });
      }
    }

    /* ── 4. Procedimentos por query separada (fallback se join retornou null) ── */
    var semProc = _itens.filter(function (ag) {
      return ag.procedimento_id && !(ag.procedimento && ag.procedimento.nome);
    });
    if (semProc.length) {
      var prIds = semProc.map(function (ag) { return ag.procedimento_id; })
        .filter(function (v, i, a) { return a.indexOf(v) === i; });
      var rProc = await _sb.from('procedimentos').select('id,nome,valor_padrao').in('id', prIds);
      if (!rProc.error && rProc.data) {
        var procMap = {};
        rProc.data.forEach(function (p) { procMap[p.id] = p; });
        _itens.forEach(function (ag) {
          if (ag.procedimento_id && !(ag.procedimento && ag.procedimento.nome)) {
            ag.procedimento = procMap[ag.procedimento_id] || null;
          }
        });
      }
    }
  }

  /* ── Checar se agendamento tem pagamento confirmado ── */
  function _pagamentoConfirmado (ag) {
    return !!(ag.recebimentos && ag.recebimentos.length &&
      ag.recebimentos.some(function (r) { return r.status === 'RECEBIDO'; }));
  }

  function _valorPadrao (ag) {
    return parseFloat(ag.valor_cobrado) ||
           parseFloat((ag.procedimento && ag.procedimento.valor_padrao) || 0) || 0;
  }

  /* ── Render principal ── */
  function _render () {
    _atualizarStats();
    var wrap = sid('rcpListWrap');
    if (!wrap) return;

    if (!_itens.length) {
      wrap.innerHTML = '<div class="rcpVazio">📋 Nenhum agendamento para hoje nesta unidade.</div>';
      return;
    }

    /* Ordem de exibição por prioridade */
    var ordem = ['em_atendimento', 'agendado', 'finalizado', 'faltou'];
    var grupos = [
      { key: 'em_atendimento', titulo: '🩺 Em Atendimento'             },
      { key: 'agendado',       titulo: '⏳ Aguardando'                  },
      { key: 'finalizado',     titulo: '✅ Finalizados'                 },
      { key: 'faltou',         titulo: '❌ Faltaram'                    }
    ];

    var html = '';
    grupos.forEach(function (g) {
      var lista = _itens.filter(function (a) {
        return (a.status_recepcao || 'agendado') === g.key;
      });
      if (!lista.length) return;
      html += '<div class="rcpGrupo">';
      html += '<div class="rcpGrupoTitulo">' + g.titulo
        + ' <span class="rcpGrupoCnt">(' + lista.length + ')</span></div>';
      lista.forEach(function (ag) { html += _renderCard(ag); });
      html += '</div>';
    });

    wrap.innerHTML = html || '<div class="rcpVazio">📋 Nenhum agendamento para hoje nesta unidade.</div>';
  }

  /* ── Contadores KPI ── */
  function _atualizarStats () {
    var c = { agendado: 0, em_atendimento: 0, finalizado: 0, faltou: 0 };
    _itens.forEach(function (a) {
      var s = a.status_recepcao || 'agendado';
      if (c[s] !== undefined) c[s]++;
    });
    var el;
    el = sid('rcpCntAgendado'); if (el) el.textContent = c.agendado;
    el = sid('rcpCntAtend');    if (el) el.textContent = c.em_atendimento;
    el = sid('rcpCntFinal');    if (el) el.textContent = c.finalizado;
    el = sid('rcpCntFaltou');   if (el) el.textContent = c.faltou;
  }

  /* ── Renderizar card ── */
  function _renderCard (ag) {
    var st     = ag.status_recepcao || 'agendado';
    var stInfo = STATUS[st] || STATUS.agendado;
    var _pac     = ag.pacientes || ag.paciente;
    var pacNome  = (_pac        && _pac.nome_completo)            || '—';
    var profNome = (ag.profissional && ag.profissional.nome)      || '—';
    var procNome = (ag.procedimento && ag.procedimento.nome)      || '—';
    var salaNome = (ag.sala         && ag.sala.nome)              || '';
    var hora     = (ag.hora_inicio  || '').substring(0, 5);
    var pacId    = ag.paciente_id || (_pac && _pac.id);
    var pago     = _pagamentoConfirmado(ag);

    /* Timer de espera */
    var timerHtml = '';
    if (st === 'em_atendimento' && ag.hora_chegada) {
      timerHtml = '<div class="rcpTimer" id="rcpTimer_' + ag.id
        + '" data-chegada="' + ag.hora_chegada + '">⏱ '
        + _fmtTempo(_calcMins(ag.hora_chegada)) + ' em atendimento</div>';
    }

    /* 4 botões de status */
    var statusBtns = Object.keys(STATUS).map(function (key) {
      var s   = STATUS[key];
      var ativo = st === key;
      return '<button class="rcpStBtn rcpStBtn_' + key + (ativo ? ' rcpStBtnAtivo' : '') + '"'
        + ' onclick="RecepMod.setStatus(\'' + ag.id + '\',\'' + key + '\')">'
        + s.emoji + ' ' + s.label
        + '</button>';
    }).join('');

    /* Botão prontuário */
    var btnPrn = pacId
      ? '<button class="btn rcpBtnPrn" onclick="RecepMod.abrirProntuario(\'' + pacId + '\')">📋 Prontuário</button>'
      : '';

    /* Botão odontograma */
    var btnOdo = pacId
      ? '<button class="btn rcpBtnOdo" onclick="RecepMod.abrirOdontograma(\'' + pacId + '\',\'' + esc(pacNome) + '\')">🦷 Odontograma</button>'
      : '';

    /* Badge + botão de pagamento */
    var pagBadge = pago
      ? '<span class="rcpPagBadge rcpPagBadgePago">✅ Pago</span>'
      : '<span class="rcpPagBadge rcpPagBadgePend">⏳ Aguardando Pagamento</span>';

    var btnPag = '';
    if (!pago && st !== 'faltou') {
      btnPag = '<button class="btn rcpBtnPag" onclick="RecepMod.abrirPagamento(\'' + ag.id + '\')">'
        + '💰 Confirmar Pagamento'
        + '</button>';
    }

    return '<div class="rcpCard rcpCard_' + st + '" data-id="' + ag.id + '">'
      + '<div class="rcpCardLeft">'
      +   '<div class="rcpCardHora">' + hora + '</div>'
      +   '<div class="rcpCardEmoji">' + stInfo.emoji + '</div>'
      + '</div>'
      + '<div class="rcpCardBody">'
      +   '<div class="rcpCardNome">' + esc(pacNome) + '</div>'
      +   '<div class="rcpCardMeta">' + esc(procNome) + ' · ' + esc(profNome)
      +     (salaNome ? ' · <span class="rcpCardSala">🏠 ' + esc(salaNome) + '</span>' : '')
      + '</div>'
      +   timerHtml
      +   '<div class="rcpStatusBtns">' + statusBtns + '</div>'
      +   '<div class="rcpPagRow">' + pagBadge + btnPag + '</div>'
      + '</div>'
      + '<div class="rcpCardAcoes">' + btnPrn + btnOdo + '</div>'
      + '</div>';
  }

  /* ── Definir status diretamente (qualquer um dos 4) ── */
  async function setStatus (id, novoStatus) {
    if (!STATUS[novoStatus]) return;

    var payload = { status_recepcao: novoStatus };
    if (novoStatus === 'em_atendimento') payload.hora_chegada = new Date().toISOString();

    var r = await _sb.from('agendamentos').update(payload).eq('id', id);
    if (r.error) { toast('Erro: ' + r.error.message, 'error'); return; }

    /* Atualiza local e re-renderiza */
    var ag = _itens.find(function (a) { return a.id === id; });
    if (ag) {
      ag.status_recepcao = novoStatus;
      if (payload.hora_chegada) ag.hora_chegada = payload.hora_chegada;
    }
    _render();
    toast(STATUS[novoStatus].emoji + ' ' + STATUS[novoStatus].label, 'success');
  }

  /* ── Abrir prontuário ── */
  function abrirProntuario (pacienteId) {
    window._prnPacienteId = pacienteId;
    switchSidebar('prontuario');
  }

  /* ── Abrir odontograma com paciente pré-selecionado ── */
  function abrirOdontograma (pacienteId, pacNome) {
    window._odoPreloadPaciente = { id: pacienteId, nome: pacNome };
    switchSidebar('odontograma');
  }

  /* ── Refresh ── */
  async function atualizar () {
    await _carregar();
    _render();
    toast('Lista atualizada', 'info');
  }

  /* ── Timer de espera ── */
  function _startTimer () {
    if (_timer) clearInterval(_timer);
    _timer = setInterval(function () {
      _itens.forEach(function (ag) {
        if ((ag.status_recepcao || '') === 'em_atendimento' && ag.hora_chegada) {
          var el = sid('rcpTimer_' + ag.id);
          if (el) el.textContent = '⏱ ' + _fmtTempo(_calcMins(ag.hora_chegada)) + ' em atendimento';
        }
      });
    }, 30000);
  }

  function destruir () {
    if (_timer) { clearInterval(_timer); _timer = null; }
  }

  function _calcMins (ts) {
    return Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 60000));
  }

  function _fmtTempo (mins) {
    if (mins < 1) return 'menos de 1 min';
    if (mins < 60) return mins + ' min';
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    return h + 'h' + String(m).padStart(2, '0') + 'min';
  }

  /* Manter compatibilidade com código antigo que chama avancarStatus */
  function avancarStatus (id, novoStatus) { setStatus(id, novoStatus); }

  /* ══════════════════════════════════════════════════════════════════
     MODAL CONFIRMAR PAGAMENTO
  ══════════════════════════════════════════════════════════════════ */
  function abrirPagamento (agId) {
    var ag = _itens.find(function (a) { return a.id === agId; });
    if (!ag) return;
    _pagModalAgId = agId;

    var valor = _valorPadrao(ag);
    var elValor = sid('rcpPagValor');
    var elForma = sid('rcpPagForma');
    var elInfo  = sid('rcpPagInfo');

    if (elValor) elValor.value = valor > 0 ? valor.toFixed(2) : '';
    if (elForma) elForma.value = 'DINHEIRO';
    if (elInfo) {
      var _pac2    = ag.pacientes || ag.paciente;
      var pacNome  = (_pac2 && _pac2.nome_completo) || '—';
      var procNome = (ag.procedimento && ag.procedimento.nome) || '—';
      elInfo.textContent = pacNome + ' — ' + procNome;
    }

    var m = sid('rcpModalPag'); if (m) m.style.display = 'flex';
  }

  function fecharPagamento () {
    var m = sid('rcpModalPag'); if (m) m.style.display = 'none';
    _pagModalAgId = null;
  }

  async function confirmarPagamento () {
    if (!_pagModalAgId) return;

    var forma = ((sid('rcpPagForma') || {}).value || '').trim();
    var valor = parseFloat((sid('rcpPagValor') || {}).value);
    if (!forma)                     { toast('Selecione a forma de pagamento', 'warn'); return; }
    if (isNaN(valor) || valor <= 0) { toast('Informe um valor válido', 'warn'); return; }

    var btn = sid('rcpPagBtnConfirmar');
    if (btn) { btn.disabled = true; btn.textContent = 'Registrando...'; }

    try {
      var su = await _sb.auth.getUser();
      var userId = su.data && su.data.user ? su.data.user.id : null;

      var payload = {
        agendamento_id:   _pagModalAgId,
        unidade_id:       CU,
        forma_pagamento:  forma,
        valor:            valor,
        data_recebimento: _hoje(),
        status:           'RECEBIDO',
        criado_por:       userId
      };

      var r = await _sb.from('recebimentos').insert(payload).select('id,status,forma_pagamento,valor').single();
      if (r.error) throw r.error;

      /* Atualiza estado local imediatamente — não depende do reload do join */
      var ag = _itens.find(function (a) { return a.id === _pagModalAgId; });
      if (ag) {
        if (!ag.recebimentos) ag.recebimentos = [];
        ag.recebimentos.push(r.data);
      }

      toast('✅ Pagamento confirmado!', 'success');
      fecharPagamento();
      _render();
    } catch (err) {
      toast('Erro ao confirmar: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '✅ Confirmar Pagamento'; }
    }
  }

  /* ── Verificação de pendência para bloqueio na Agenda ── */
  async function verificarPendenciaPaciente (pacienteId) {
    var r = await _sb.from('agendamentos')
      .select('id, data_agendamento, recebimentos(id,status)')
      .eq('paciente_id', pacienteId)
      .eq('unidade_id', CU)
      .neq('status', 'Cancelado')
      .lt('data_agendamento', _hoje())
      .order('data_agendamento', { ascending: false })
      .limit(30);

    if (r.error || !r.data) return false;
    return r.data.some(function (ag) {
      return !ag.recebimentos || !ag.recebimentos.length;
    });
  }

  return { init, setStatus, avancarStatus, abrirProntuario, abrirOdontograma, atualizar, destruir,
           abrirPagamento, fecharPagamento, confirmarPagamento, verificarPendenciaPaciente };
})();
