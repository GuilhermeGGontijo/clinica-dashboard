/* ═══════════════════════════════════════════════════════════════════════
   PAINEL DE CONTROLE CLÍNICO — js/modules/recepcao.js
   RecepMod: Recepção do dia — 4 status selecionáveis por card
   Depende de: supabase.js (_sb), main.js (sid, esc, toast, CU)
═══════════════════════════════════════════════════════════════════════ */

const RecepMod = (function () {
  'use strict';

  var _itens = [];
  var _timer = null;

  var STATUS = {
    agendado:       { emoji: '⏳', label: 'Aguardando',     cls: 'stAguardando' },
    em_atendimento: { emoji: '🩺', label: 'Em Atendimento', cls: 'stAtendimento' },
    finalizado:     { emoji: '✅', label: 'Finalizado',      cls: 'stFinalizado'  },
    faltou:         { emoji: '❌', label: 'Faltou',          cls: 'stFaltou'      }
  };

  /* ── Init ── */
  async function init () {
    if (!_sb) return;
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
    var r = await _sb.from('agendamentos')
      .select([
        'id', 'hora_inicio', 'status_recepcao', 'hora_chegada', 'paciente_id',
        'pacientes(id,nome_completo)',
        'profissional:perfis_usuarios!agendamentos_profissional_id_fkey(nome)',
        'procedimento:procedimentos!agendamentos_procedimento_id_fkey(nome)'
      ].join(','))
      .eq('data_agendamento', _hoje())
      .eq('unidade_id', CU)
      .neq('status', 'Cancelado')
      .order('hora_inicio');

    if (r.error) {
      console.error('[RecepMod]', r.error.message);
      _itens = [];
    } else {
      _itens = r.data || [];
    }
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
    var pacNome  = (ag.pacientes    && ag.pacientes.nome_completo) || '—';
    var profNome = (ag.profissional && ag.profissional.nome)       || '—';
    var procNome = (ag.procedimento && ag.procedimento.nome)       || '—';
    var hora     = (ag.hora_inicio  || '').substring(0, 5);
    var pacId    = ag.paciente_id || (ag.pacientes && ag.pacientes.id);

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

    return '<div class="rcpCard rcpCard_' + st + '" data-id="' + ag.id + '">'
      + '<div class="rcpCardLeft">'
      +   '<div class="rcpCardHora">' + hora + '</div>'
      +   '<div class="rcpCardEmoji">' + stInfo.emoji + '</div>'
      + '</div>'
      + '<div class="rcpCardBody">'
      +   '<div class="rcpCardNome">' + esc(pacNome) + '</div>'
      +   '<div class="rcpCardMeta">' + esc(procNome) + ' · ' + esc(profNome) + '</div>'
      +   timerHtml
      +   '<div class="rcpStatusBtns">' + statusBtns + '</div>'
      + '</div>'
      + '<div class="rcpCardAcoes">' + btnPrn + '</div>'
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

  return { init, setStatus, avancarStatus, abrirProntuario, atualizar, destruir };
})();
