/* ═══════════════════════════════════════════════════════════════════════
   PAINEL DE CONTROLE CLÍNICO — js/modules/recepcao.js
   RecepMod: Recepção do dia — fila de pacientes e status de atendimento
   Depende de: supabase.js (_sb), main.js (sid, esc, toast, CU)
═══════════════════════════════════════════════════════════════════════ */

const RecepMod = (function () {
  'use strict';

  var _itens = [];
  var _timer = null;

  /* ─── Definição dos status ─── */
  var STATUS = {
    agendado:       { emoji: '⏳', label: 'Aguardando' },
    chegou:         { emoji: '🟡', label: 'Na Unidade'      },
    em_atendimento: { emoji: '🩺', label: 'Em Atendimento'  },
    finalizado:     { emoji: '✅', label: 'Finalizado'       }
  };

  var PROXIMO = {
    agendado:       { status: 'chegou',         btn: '🟡 Chegou na Unidade'       },
    chegou:         { status: 'em_atendimento', btn: '🩺 Chamar para Atendimento'  },
    em_atendimento: { status: 'finalizado',     btn: '✅ Finalizar Atendimento'    },
    finalizado:     null
  };

  /* ── Init ── */
  async function init () {
    if (!_sb) return;
    _setDataLabel();
    await _carregar();
    _render();
    _startTimer();
  }

  /* ── Label com data de hoje ── */
  function _setDataLabel () {
    var el = sid('rcpDataLabel');
    if (!el) return;
    el.textContent = new Date().toLocaleDateString('pt-BR', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    });
  }

  /* ── Hoje em formato YYYY-MM-DD ── */
  function _hoje () {
    var d = new Date();
    return d.getFullYear() + '-'
      + String(d.getMonth() + 1).padStart(2, '0') + '-'
      + String(d.getDate()).padStart(2, '0');
  }

  /* ── Carregar agendamentos de hoje desta unidade ── */
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

    /* Ordem de exibição: prioritários primeiro */
    var grupos = [
      { key: 'chegou',         titulo: '🟡 Na Unidade — Aguardando Atendimento' },
      { key: 'em_atendimento', titulo: '🩺 Em Atendimento'                       },
      { key: 'agendado',       titulo: '⏳ Agendados (ainda não chegaram)'        },
      { key: 'finalizado',     titulo: '✅ Finalizados'                           }
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

    wrap.innerHTML = html;
  }

  /* ── Atualizar contadores no topo ── */
  function _atualizarStats () {
    var c = { agendado: 0, chegou: 0, em_atendimento: 0, finalizado: 0 };
    _itens.forEach(function (a) {
      var s = a.status_recepcao || 'agendado';
      if (c[s] !== undefined) c[s]++;
    });
    var map = {
      rcpCntAgendado: c.agendado,
      rcpCntChegou:   c.chegou,
      rcpCntAtend:    c.em_atendimento,
      rcpCntFinal:    c.finalizado
    };
    Object.keys(map).forEach(function (id) {
      var el = sid(id); if (el) el.textContent = map[id];
    });
  }

  /* ── Renderizar card de um agendamento ── */
  function _renderCard (ag) {
    var st     = ag.status_recepcao || 'agendado';
    var stInfo = STATUS[st];
    var prox   = PROXIMO[st];
    var pacNome  = (ag.pacientes  && ag.pacientes.nome_completo) || '—';
    var profNome = (ag.profissional && ag.profissional.nome)     || '—';
    var procNome = (ag.procedimento && ag.procedimento.nome)     || '—';
    var hora  = (ag.hora_inicio || '').substring(0, 5);
    var pacId = ag.paciente_id || (ag.pacientes && ag.pacientes.id);

    /* Timer de espera (visível quando chegou ou em_atendimento) */
    var timerHtml = '';
    if ((st === 'chegou' || st === 'em_atendimento') && ag.hora_chegada) {
      timerHtml = '<div class="rcpTimer" id="rcpTimer_' + ag.id + '" data-chegada="'
        + ag.hora_chegada + '">⏱ ' + _fmtTempo(_calcMins(ag.hora_chegada)) + ' aguardando</div>';
    }

    /* Botão de avançar status */
    var btnProx = '';
    if (prox) {
      btnProx = '<button class="btn rcpBtnSt rcpBtnSt_' + prox.status + '" '
        + 'onclick="RecepMod.avancarStatus(\'' + ag.id + '\',\'' + prox.status + '\')">'
        + prox.btn + '</button>';
    }

    /* Botão prontuário */
    var btnPrn = pacId
      ? '<button class="btn rcpBtnPrn" onclick="RecepMod.abrirProntuario(\'' + pacId + '\')">📋 Prontuário</button>'
      : '';

    return '<div class="rcpCard rcpCardSt_' + st + '" data-id="' + ag.id + '">'
      + '<div class="rcpCardLeft">'
      +   '<div class="rcpCardHora">' + hora + '</div>'
      +   '<div class="rcpCardEmoji">' + stInfo.emoji + '</div>'
      + '</div>'
      + '<div class="rcpCardBody">'
      +   '<div class="rcpCardNome">' + esc(pacNome) + '</div>'
      +   '<div class="rcpCardMeta">' + esc(procNome) + ' · ' + esc(profNome) + '</div>'
      +   timerHtml
      + '</div>'
      + '<div class="rcpCardAcoes">'
      +   btnProx
      +   btnPrn
      + '</div>'
      + '</div>';
  }

  /* ── Avançar para próximo status ── */
  async function avancarStatus (id, novoStatus) {
    var payload = { status_recepcao: novoStatus };
    if (novoStatus === 'chegou') payload.hora_chegada = new Date().toISOString();

    var r = await _sb.from('agendamentos').update(payload).eq('id', id);
    if (r.error) { toast('Erro: ' + r.error.message, 'error'); return; }

    /* Atualiza estado local sem precisar recarregar do servidor */
    var ag = _itens.find(function (a) { return a.id === id; });
    if (ag) {
      ag.status_recepcao = novoStatus;
      if (novoStatus === 'chegou') ag.hora_chegada = payload.hora_chegada;
    }
    _render();
    toast(STATUS[novoStatus].emoji + ' ' + STATUS[novoStatus].label, 'success');
  }

  /* ── Abrir prontuário do paciente ── */
  function abrirProntuario (pacienteId) {
    window._prnPacienteId = pacienteId;
    switchSidebar('prontuario');
  }

  /* ── Atualizar lista (botão refresh) ── */
  async function atualizar () {
    await _carregar();
    _render();
    toast('Lista atualizada', 'info');
  }

  /* ── Timer de espera: atualiza a cada 30s ── */
  function _startTimer () {
    if (_timer) clearInterval(_timer);
    _timer = setInterval(function () {
      _itens.forEach(function (ag) {
        var st = ag.status_recepcao || 'agendado';
        if ((st === 'chegou' || st === 'em_atendimento') && ag.hora_chegada) {
          var el = sid('rcpTimer_' + ag.id);
          if (el) el.textContent = '⏱ ' + _fmtTempo(_calcMins(ag.hora_chegada)) + ' aguardando';
        }
      });
    }, 30000);
  }

  function destruir () {
    if (_timer) { clearInterval(_timer); _timer = null; }
  }

  /* ── Helpers ── */
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

  return { init, avancarStatus, abrirProntuario, atualizar, destruir };
})();
