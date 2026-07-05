/* ═══════════════════════════════════════════════════════════════════════
   PAINEL DE CONTROLE CLÍNICO — js/modules/odontograma.js
   OdontogramaMod: Odontograma Interativo — Fluxo Hierárquico
   Depende de: supabase.js (_sb), main.js (sid, esc, toast, CU, USER_PROFILE)
═══════════════════════════════════════════════════════════════════════ */

const OdontogramaMod = (function () {
  'use strict';

  /* ── Estado interno ── */
  var _pacienteId     = null;
  var _pacienteNome   = '';
  var _denteSel       = null;   // número do dente selecionado
  var _espSel         = null;   // UUID da especialidade selecionada
  var _intAtual       = null;   // { id, nome_intervencao, valor_base }
  var _itens          = [];     // carrinho de orçamento
  var _especialidades = [];     // [{id, nome, procs:[{id, nome_intervencao, valor_base}]}]
  var _finalizando    = false;

  /* ── Numeração FDI ── */
  var PERM_SUP = [18,17,16,15,14,13,12,11, 21,22,23,24,25,26,27,28];
  var PERM_INF = [48,47,46,45,44,43,42,41, 31,32,33,34,35,36,37,38];
  var DEC_SUP  = [55,54,53,52,51, 61,62,63,64,65];
  var DEC_INF  = [85,84,83,82,81, 71,72,73,74,75];

  var FACES = [
    { c:'V', l:'Vestibular',       css:'top'    },
    { c:'L', l:'Lingual/Palatina', css:'bottom' },
    { c:'M', l:'Mesial',           css:'left'   },
    { c:'D', l:'Distal',           css:'right'  },
    { c:'O', l:'Oclusal',          css:'center' }
  ];

  /* ══════════════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════════════ */
  async function init() {
    _denteSel = null; _espSel = null; _intAtual = null;
    _itens = []; _finalizando = false;
    if (window._odoPreloadPaciente) {
      _pacienteId   = window._odoPreloadPaciente.id;
      _pacienteNome = window._odoPreloadPaciente.nome;
      window._odoPreloadPaciente = null;
    } else {
      _pacienteId = null; _pacienteNome = '';
    }
    await _carregarEspecialidades();
    _renderArcadas();
    _renderItens();
    _atualizarTotal();
    _mostrarSelecaoPaciente();
    _atualizarPainelLateral();
    _carregarHistoricoPaciente();
  }

  /* ── Carregar especialidades + intervenções em paralelo ── */
  async function _carregarEspecialidades() {
    if (!_sb) return;
    var rE = await _sb.from('especialidades_odonto')
      .select('id,nome').eq('ativo', true).order('nome');
    var rI = await _sb.from('odonto_procedimentos')
      .select('id,nome_intervencao,valor_base,especialidade_id')
      .eq('ativo', true).order('nome_intervencao');

    var esps = rE.error ? [] : (rE.data || []);
    var invs = rI.error ? [] : (rI.data || []);

    _especialidades = esps.map(function (e) {
      return {
        id: e.id, nome: e.nome,
        procs: invs.filter(function (i) { return i.especialidade_id === e.id; })
      };
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     RENDER ARCADAS
  ══════════════════════════════════════════════════════════════════ */
  function _renderArcadas() {
    _renderLinha('odontoPermanenteSup', PERM_SUP, false);
    _renderLinha('odontoDeciduaSup',    DEC_SUP,  true);
    _renderLinha('odontoDeciduaInf',    DEC_INF,  true);
    _renderLinha('odontoPermanenteInf', PERM_INF, false);
  }

  function _renderLinha(id, nums, deciduo) {
    var c = sid(id); if (!c) return;
    c.innerHTML = '';
    nums.forEach(function (n) { c.appendChild(_criarDente(n, deciduo)); });
  }

  function _criarDente(num, deciduo) {
    var w = document.createElement('div');
    w.className = 'odontoDente' + (deciduo ? ' deciduo' : '');
    w.dataset.dente = num;
    w.title = 'Dente ' + num;
    w.addEventListener('click', function () { selecionarDente(num); });

    /* Número FDI */
    var lbl = document.createElement('div');
    lbl.className = 'odontoDenteNum';
    lbl.textContent = num;
    w.appendChild(lbl);

    /* Imagem anatômica — PNG real para permanentes, placeholder para decíduos */
    var img = document.createElement('img');
    img.className = 'odontoDenteImg';
    img.src = deciduo
      ? 'assets/tooth-placeholder.png'
      : 'assets/images/toothImageFront' + num + '.png';
    img.alt = 'Dente ' + num;
    img.draggable = false;
    img.onerror = function () { this.style.display = 'none'; };
    w.appendChild(img);

    /* Cruzeta CSS (5 faces — indicador visual de estado) */
    var g = document.createElement('div');
    g.className = 'odontoDenteGraf';
    FACES.forEach(function (face) {
      var el = document.createElement('div');
      el.className     = 'odFace ' + face.css;
      el.dataset.dente = num;
      el.dataset.face  = face.c;
      g.appendChild(el);
    });
    w.appendChild(g);
    return w;
  }

  /* ══════════════════════════════════════════════════════════════════
     SELECIONAR DENTE
  ══════════════════════════════════════════════════════════════════ */
  function selecionarDente(num) {
    if (_denteSel) {
      var prev = document.querySelector('.odontoDente[data-dente="' + _denteSel + '"]');
      if (prev) prev.classList.remove('selecionado');
    }
    _denteSel = num;
    _espSel   = null;
    var el = document.querySelector('.odontoDente[data-dente="' + num + '"]');
    if (el) el.classList.add('selecionado');
    _atualizarPainelLateral();
  }

  /* ══════════════════════════════════════════════════════════════════
     PAINEL LATERAL (especialidades → intervenções)
  ══════════════════════════════════════════════════════════════════ */
  function _atualizarPainelLateral() {
    var infoEl   = sid('odoDenteInfo');
    var espPanel = sid('odoEspPanel');
    var intPanel = sid('odoIntPanel');

    if (!_denteSel) {
      if (infoEl) infoEl.innerHTML = '<span class="odoHint">👆 Clique em um dente para começar</span>';
      if (espPanel) espPanel.style.display = 'none';
      if (intPanel) intPanel.style.display = 'none';
      return;
    }

    if (infoEl) infoEl.innerHTML = '<span class="odoDenteSelLabel">🦷 Dente #' + _denteSel + ' selecionado</span>';

    /* Especialidades */
    if (espPanel) espPanel.style.display = 'block';
    var espLista = sid('odoEspLista');
    if (espLista) {
      if (!_especialidades.length) {
        espLista.innerHTML = '<span class="odoHint">Nenhuma especialidade cadastrada</span>';
      } else {
        espLista.innerHTML = _especialidades.map(function (esp) {
          var ativo = esp.id === _espSel ? ' odoChipAtivo' : '';
          return '<button class="odoChip' + ativo + '" onclick="OdontogramaMod.selecionarEspecialidade(\'' + esp.id + '\')">'
            + esc(esp.nome) + '</button>';
        }).join('');
      }
    }

    /* Intervenções */
    if (intPanel) intPanel.style.display = _espSel ? 'block' : 'none';
    if (_espSel) {
      var espAtual = _especialidades.find(function (e) { return e.id === _espSel; });
      var invs = espAtual ? espAtual.procs : [];
      var intLista = sid('odoIntLista');
      if (intLista) {
        if (!invs.length) {
          intLista.innerHTML = '<span class="odoHint">Nenhuma intervenção nesta especialidade</span>';
        } else {
          intLista.innerHTML = invs.map(function (inv) {
            return '<button class="odoChip odoChipInt" onclick="OdontogramaMod.abrirModalIntervencao(\'' + inv.id + '\')">'
              + '<span>' + esc(inv.nome_intervencao) + '</span>'
              + '<span class="odoChipVal">R$ ' + Number(inv.valor_base).toFixed(2).replace('.', ',') + '</span>'
              + '</button>';
          }).join('');
        }
      }
    }
  }

  function selecionarEspecialidade(espId) {
    _espSel = espId;
    _atualizarPainelLateral();
  }

  /* ══════════════════════════════════════════════════════════════════
     MODAL: INTERVENÇÃO + FACES
  ══════════════════════════════════════════════════════════════════ */
  function abrirModalIntervencao(invId) {
    if (!_pacienteId) { toast('Selecione um paciente primeiro', 'warn'); return; }
    if (!_denteSel)   { toast('Selecione um dente', 'warn'); return; }

    var espAtual = _especialidades.find(function (e) { return e.id === _espSel; });
    var inv = espAtual ? espAtual.procs.find(function (i) { return i.id === invId; }) : null;
    if (!inv) return;
    _intAtual = inv;

    var tit = sid('odoModalIntTitulo');
    if (tit) tit.textContent = inv.nome_intervencao + ' — Dente #' + _denteSel;
    var espLbl = sid('odoModalIntEsp');
    if (espLbl) espLbl.textContent = espAtual ? 'Especialidade: ' + espAtual.nome : '';

    var val = Number(inv.valor_base).toFixed(2);
    var vc = sid('odoModalValorClinica');  if (vc) vc.value = val;
    var vp = sid('odoModalValorPaciente'); if (vp) vp.value = val;

    /* Limpar seleção da cruzeta visual */
    document.querySelectorAll('.odFacePick').forEach(function (el) {
      el.classList.remove('selecionada');
    });
    var txt = sid('odoFacesSelText');
    if (txt) txt.textContent = 'Nenhuma face selecionada';

    var m = sid('odontoModalIntervencao'); if (m) m.style.display = 'flex';
  }

  function fecharModalIntervencao() {
    var m = sid('odontoModalIntervencao'); if (m) m.style.display = 'none';
    _intAtual = null;
  }

  function toggleFaceModal(el) {
    el.classList.toggle('selecionada');
    /* Atualizar texto descritivo */
    var sels = Array.from(document.querySelectorAll('.odFacePick.selecionada'))
      .map(function (e) {
        var face = FACES.find(function (f) { return f.c === e.dataset.face; });
        return face ? face.l : '';
      }).filter(Boolean);
    var txt = sid('odoFacesSelText');
    if (txt) txt.textContent = sels.length ? sels.join(' · ') : 'Nenhuma face selecionada';
  }

  function gravarIntervencao() {
    if (!_intAtual) return;
    var facesSel = FACES.filter(function (f) {
      var el = document.querySelector('.odFacePick[data-face="' + f.c + '"]');
      return el && el.classList.contains('selecionada');
    });
    if (!facesSel.length) { toast('Clique em pelo menos uma face na cruzeta', 'warn'); return; }

    _itens.push({
      dente:            _denteSel,
      faces:            facesSel.map(function (f) { return f.c; }).join(','),
      facesLabels:      facesSel.map(function (f) { return f.l; }).join(', '),
      procedimentoId:   _intAtual.id,
      procedimentoNome: _intAtual.nome_intervencao,
      valor:            Number(_intAtual.valor_base)
    });

    /* Colorir faces na cruzeta do dente */
    facesSel.forEach(function (face) {
      var el = document.querySelector('.odFace[data-dente="' + _denteSel + '"][data-face="' + face.c + '"]');
      if (el) { el.classList.remove('selecionada'); el.classList.add('finalizada'); }
    });

    fecharModalIntervencao();
    _renderItens();
    _atualizarTotal();
    toast('✅ Intervenção gravada!', 'success');
  }

  /* ══════════════════════════════════════════════════════════════════
     HISTÓRICO DO PACIENTE
  ══════════════════════════════════════════════════════════════════ */
  async function _carregarHistoricoPaciente() {
    var cont = sid('odoHistConteudo');
    if (!cont) return;
    if (!_pacienteId || !_sb) {
      cont.innerHTML = '<div class="odoHistVazio">Selecione um paciente para ver o histórico</div>';
      return;
    }
    cont.innerHTML = '<div class="odoHistVazio">Carregando...</div>';

    var rOrc = await _sb.from('orcamentos')
      .select('id,data_criacao,valor_total,status_geral,orcamento_itens(dente_numero,faces,valor_cobrado,odonto_procedimentos(nome_intervencao))')
      .eq('paciente_id', _pacienteId)
      .order('data_criacao', { ascending: false })
      .limit(20);

    var rAnam = await _sb.from('anamnese_odonto')
      .select('id,data_avaliacao,respostas')
      .eq('paciente_id', _pacienteId)
      .order('data_avaliacao', { ascending: false })
      .limit(10);

    _renderHistoricoPaciente(rOrc.data || [], rAnam.data || []);
  }

  function _fmtData(str) {
    if (!str) return '—';
    var d = new Date(str);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function _renderHistoricoPaciente(orcamentos, anamneses) {
    var cont = sid('odoHistConteudo');
    if (!cont) return;

    if (!orcamentos.length && !anamneses.length) {
      cont.innerHTML = '<div class="odoHistVazio">Nenhum histórico encontrado para este paciente</div>';
      return;
    }

    var html = '';

    /* ── Orçamentos ── */
    if (orcamentos.length) {
      html += '<div class="odoHistSecao">💰 Orçamentos</div>';
      orcamentos.forEach(function (orc, i) {
        var itemId = 'odoHistOrc_' + i;
        var itens  = orc.orcamento_itens || [];
        var total  = 'R$ ' + (Number(orc.valor_total || 0)).toFixed(2).replace('.', ',');
        var data   = _fmtData(orc.data_criacao);
        var status = orc.status_geral || 'Finalizado';

        html += '<div class="odoHistItem">';
        html += '<div class="odoHistItemHdr" onclick="OdontogramaMod.toggleHistItem(\'' + itemId + '\')">'
          + '<span class="odoHistArrow" id="arr_' + itemId + '">▶</span>'
          + '<span class="odoHistItemData">' + data
          + '<br><span class="odoHistItemSub"><span class="odoHistStatus">' + esc(status) + '</span></span></span>'
          + '<span class="odoHistItemVal">' + total + '</span>'
          + '</div>';

        html += '<div class="odoHistItemBody" id="' + itemId + '">';
        if (itens.length) {
          itens.forEach(function (it) {
            var proc = (it.odonto_procedimentos && it.odonto_procedimentos.nome_intervencao)
              ? it.odonto_procedimentos.nome_intervencao : '—';
            var val  = 'R$ ' + (Number(it.valor_cobrado || 0)).toFixed(2).replace('.', ',');
            html += '<div class="odoHistLinha">'
              + '<span class="odoHistDente">D.' + esc(String(it.dente_numero)) + '</span>'
              + '<span class="odoHistProc">' + esc(proc)
              + (it.faces ? '<br><span style="color:var(--s4);font-size:.65rem">' + esc(it.faces) + '</span>' : '')
              + '</span>'
              + '<span class="odoHistPreco">' + val + '</span>'
              + '</div>';
          });
        } else {
          html += '<div class="odoHistVazio" style="padding:8px 0;font-size:.72rem">Sem itens</div>';
        }
        html += '</div></div>';
      });
    }

    /* ── Anamneses ── */
    if (anamneses.length) {
      html += '<div class="odoHistSecao" style="margin-top:6px">📋 Anamneses</div>';
      anamneses.forEach(function (an, i) {
        var itemId = 'odoHistAnam_' + i;
        var data   = _fmtData(an.data_avaliacao);
        var resp   = an.respostas || {};

        html += '<div class="odoHistItem">';
        html += '<div class="odoHistItemHdr" onclick="OdontogramaMod.toggleHistItem(\'' + itemId + '\')">'
          + '<span class="odoHistArrow" id="arr_' + itemId + '">▶</span>'
          + '<span class="odoHistItemData">' + data + '</span>'
          + '</div>';

        html += '<div class="odoHistItemBody" id="' + itemId + '">';

        /* Motivo */
        if (resp.motivo_consulta) {
          html += '<div class="odoHistAnamResp"><span class="odoHistAnamLabel">Motivo: </span>' + esc(resp.motivo_consulta) + '</div>';
        }
        /* Perguntas sim/nao */
        var campos = [
          { k: 'doenca_saude',  l: 'Doenças' },
          { k: 'medicacao',     l: 'Medicação' },
          { k: 'alergia',       l: 'Alergia' },
          { k: 'anestesia',     l: 'Anestesia' },
          { k: 'cardiaco',      l: 'Cardíaco' },
          { k: 'diabetes',      l: 'Diabetes' },
          { k: 'habito',        l: 'Hábitos' }
        ];
        campos.forEach(function (c) {
          var v = resp[c.k];
          if (!v || !v.resposta) return;
          var txt = v.resposta === 'SIM'
            ? '<strong style="color:var(--r6)">SIM</strong>' + (v.detalhe ? ' — ' + esc(v.detalhe) : '')
            : '<span style="color:var(--g6)">NÃO</span>';
          html += '<div class="odoHistAnamResp"><span class="odoHistAnamLabel">' + c.l + ': </span>' + txt + '</div>';
        });
        if (resp.outras_info) {
          html += '<div class="odoHistAnamResp"><span class="odoHistAnamLabel">Obs: </span>' + esc(resp.outras_info) + '</div>';
        }
        html += '</div></div>';
      });
    }

    cont.innerHTML = html;
  }

  function toggleHistItem(id) {
    var body = sid(id);
    var arr  = sid('arr_' + id);
    if (!body) return;
    var open = body.classList.toggle('open');
    if (arr) arr.classList.toggle('open', open);
  }

  /* ══════════════════════════════════════════════════════════════════
     CARRINHO
  ══════════════════════════════════════════════════════════════════ */
  function _renderItens() {
    var tbody = sid('odontoItensBody'); if (!tbody) return;
    if (!_itens.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="odontoVazio">Nenhum item lançado</td></tr>';
      return;
    }
    tbody.innerHTML = _itens.map(function (item, idx) {
      return '<tr>'
        + '<td><strong>' + item.dente + '</strong></td>'
        + '<td style="font-size:.72rem">' + esc(item.facesLabels) + '</td>'
        + '<td>' + esc(item.procedimentoNome) + '</td>'
        + '<td>R$ ' + item.valor.toFixed(2).replace('.', ',') + '</td>'
        + '<td><button class="odontoRemBtn" onclick="OdontogramaMod.removerItem(' + idx + ')">✕</button></td>'
        + '</tr>';
    }).join('');
  }

  function removerItem(idx) {
    _itens.splice(idx, 1);
    _renderItens();
    _atualizarTotal();
  }

  function _atualizarTotal() {
    var total = _itens.reduce(function (acc, i) { return acc + i.valor; }, 0);
    var el = sid('odontoTotal');
    if (el) el.textContent = 'R$ ' + total.toFixed(2).replace('.', ',');
    var btn = sid('odontoBtnFinalizar');
    if (btn) btn.disabled = !_itens.length;
  }

  /* ══════════════════════════════════════════════════════════════════
     PACIENTE
  ══════════════════════════════════════════════════════════════════ */
  function _mostrarSelecaoPaciente() {
    var el = sid('odontoPacienteInfo'); if (!el) return;
    if (_pacienteId) {
      el.innerHTML = '<span class="odontoPacNome">👤 ' + esc(_pacienteNome) + '</span>'
        + ' <button class="btn bSm" style="background:var(--s1);color:var(--s7);border:1px solid var(--s2)"'
        + ' onclick="OdontogramaMod.trocarPaciente()">Trocar</button>';
    } else {
      el.innerHTML = '<span style="color:var(--s4);font-size:.84rem">Nenhum paciente selecionado</span>';
    }
  }

  function trocarPaciente() {
    if (_itens.length && !confirm('Trocar de paciente irá limpar o orçamento atual. Continuar?')) return;
    _itens = []; _renderItens(); _atualizarTotal();
    abrirBuscaPaciente();
  }

  function abrirBuscaPaciente() {
    var m = sid('odontoModalPaciente'); if (!m) return;
    m.classList.add('open');
    var inp = sid('odontoBuscaPacInp');
    if (inp) { inp.value = ''; setTimeout(function () { inp.focus(); }, 80); }
    _renderListaTodosOdo();
  }

  function fecharBuscaPaciente() {
    var m = sid('odontoModalPaciente'); if (m) m.classList.remove('open');
  }

  var _buscaTmr = null;
  function buscarPaciente(q) {
    clearTimeout(_buscaTmr);
    var res = sid('odontoBuscaPacRes'); if (!res) return;
    if (!q || q.length < 2) { res.innerHTML = ''; _renderListaTodosOdo(); return; }
    res.innerHTML = '<div style="color:var(--s4);font-size:.82rem;padding:8px">Buscando...</div>';
    _buscaTmr = setTimeout(async function () {
      var qFmt = q.replace(/\D/g, '');
      var base = _sb.from('pacientes').select('id,nome_completo,cpf,data_nascimento')
        .eq('ativo', true).eq('unidade_id', CU);
      var r = (/^\d/.test(q) && qFmt.length)
        ? await base.ilike('cpf', '%' + qFmt + '%').limit(15)
        : await base.ilike('nome_completo', '%' + q + '%').limit(15);
      _renderPacLista(r.data || [], res);
    }, 300);
  }

  async function _renderListaTodosOdo() {
    var res = sid('odontoBuscaPacRes'); if (!res) return;
    res.innerHTML = '<div style="color:var(--s4);font-size:.82rem;padding:8px">Carregando...</div>';
    var r = await _sb.from('pacientes').select('id,nome_completo,cpf,data_nascimento')
      .eq('ativo', true).eq('unidade_id', CU).order('nome_completo').limit(50);
    _renderPacLista(r.data || [], res);
  }

  function _renderPacLista(lista, container) {
    if (!lista.length) {
      container.innerHTML = '<div style="color:var(--s4);font-size:.82rem;padding:8px">Nenhum paciente encontrado</div>';
      return;
    }
    container.innerHTML = lista.map(function (p) {
      var cpf   = p.cpf ? p.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '';
      var idade = _calcIdade(p.data_nascimento);
      return '<div class="odontoPacItem" onclick="OdontogramaMod.selecionarPaciente(\'' + p.id + '\',\'' + esc(p.nome_completo) + '\')">'
        + '<div class="odontoPacItemNome">👤 <strong>' + esc(p.nome_completo) + '</strong></div>'
        + '<div class="odontoPacItemMeta">' + (cpf ? 'CPF: ' + cpf + ' · ' : '') + (idade ? idade + ' anos' : '') + '</div>'
        + '</div>';
    }).join('');
  }

  function _calcIdade(d) {
    if (!d) return '';
    var h = new Date(), n = new Date(d + 'T00:00:00');
    var a = h.getFullYear() - n.getFullYear();
    if (h.getMonth() - n.getMonth() < 0 || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) a--;
    return a;
  }

  function selecionarPaciente(id, nome) {
    _pacienteId = id; _pacienteNome = nome;
    fecharBuscaPaciente();
    _mostrarSelecaoPaciente();
    toast('Paciente: ' + nome, 'success');
    _carregarHistoricoPaciente();
  }

  /* ══════════════════════════════════════════════════════════════════
     FINALIZAR ATENDIMENTO
  ══════════════════════════════════════════════════════════════════ */
  async function finalizarAtendimento() {
    if (!_pacienteId)   { toast('Selecione um paciente', 'warn'); return; }
    if (!_itens.length) { toast('Nenhum item no orçamento', 'warn'); return; }
    if (_finalizando)   return;
    if (!confirm('Finalizar atendimento e enviar cobrança para o caixa?')) return;

    _finalizando = true;
    var btn = sid('odontoBtnFinalizar');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    try {
      var su  = await _sb.auth.getUser();
      var uid = su.data && su.data.user ? su.data.user.id : null;
      var total = _itens.reduce(function (acc, i) { return acc + i.valor; }, 0);

      /* 1. Inserir orçamento */
      var rOrc = await _sb.from('orcamentos').insert({
        paciente_id:    _pacienteId,
        profissional_id: uid,
        unidade_id:     CU,
        valor_total:    total,
        status_geral:   'Finalizado'
      }).select('id').single();
      if (rOrc.error) throw rOrc.error;

      /* 2. Inserir itens do orçamento */
      var bulk = _itens.map(function (item) {
        return {
          orcamento_id:    rOrc.data.id,
          dente_numero:    item.dente,
          faces:           item.facesLabels,
          procedimento_id: item.procedimentoId,
          valor_cobrado:   item.valor,
          status_item:     'Aprovado'
        };
      });
      var rItens = await _sb.from('orcamento_itens').insert(bulk);
      if (rItens.error) throw rItens.error;

      /* 3. Lançar recebimento pendente no caixa */
      var rReceb = await _sb.from('recebimentos').insert({
        unidade_id:       CU,
        valor:            total,
        status:           'PENDENTE',
        data_recebimento: new Date().toISOString().split('T')[0],
        observacoes:      'Odontograma — Orç. #' + String(rOrc.data.id).slice(0, 8).toUpperCase()
                        + ' | Paciente: ' + _pacienteNome,
        criado_por:       uid
      });
      if (rReceb.error) throw rReceb.error;

      toast('✅ Atendimento finalizado! Cobrança enviada para o caixa.', 'success');
      _itens = [];
      _renderItens();
      _atualizarTotal();
      _carregarHistoricoPaciente();

    } catch (err) {
      toast('Erro ao finalizar: ' + err.message, 'error');
    } finally {
      _finalizando = false;
      if (btn) { btn.disabled = false; btn.textContent = '✅ Finalizar e Enviar para Caixa'; }
    }
  }

  /* stub de compatibilidade */
  function lancarSelecao() {}

  function abrirAnamnese() {
    if (!_pacienteId) { toast('Selecione um paciente antes de abrir a Anamnese.', 'warn'); return; }
    if (typeof AnamneseMod !== 'undefined') AnamneseMod.abrir(_pacienteId, _pacienteNome);
  }

  return {
    init,
    selecionarDente, selecionarEspecialidade,
    abrirModalIntervencao, fecharModalIntervencao, gravarIntervencao, toggleFaceModal,
    removerItem, finalizarAtendimento,
    abrirBuscaPaciente, fecharBuscaPaciente, buscarPaciente, selecionarPaciente,
    trocarPaciente, lancarSelecao, abrirAnamnese, toggleHistItem
  };
})();
