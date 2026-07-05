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
  var _intAtual       = null;   // { id, nome_intervencao, valor_base, tipo_visual }
  var _itens          = [];     // carrinho de orçamento
  var _especialidades = [];     // [{id, nome, procs:[...]}]
  var _finalizando    = false;
  var _histOrcamentos = [];     // cache do histórico carregado
  var _histVizIdx     = 0;      // índice atual na visualização histórica
  var _estadoPaciente = {};     // { denteNum: [{tipo_visual, faces, cor}] }
  var _statusSel      = 'a_realizar'; // status da próxima intervenção

  /* ── Cores por status ── */
  var _COR_STATUS = {
    a_realizar: '#ef4444',
    executado:  '#22c55e',
    existente:  '#3b82f6'
  };

  /* ── Posição central de cada face no SVG viewBox 0 0 100 100 ── */
  var _FACE_POS = {
    'V': { cx: 50, cy: 10 },
    'L': { cx: 50, cy: 90 },
    'M': { cx: 10, cy: 50 },
    'D': { cx: 90, cy: 50 },
    'O': { cx: 50, cy: 50 },
    'I': { cx: 50, cy: 50 }
  };

  /* Mapeamento de label → código de face (para registros antigos com labels) */
  var _LABEL_TO_CODE = {
    'Vestibular': 'V', 'Lingual/Palatina': 'L',
    'Mesial': 'M', 'Distal': 'D', 'Oclusal': 'O', 'Incisal': 'I'
  };

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

  /* Dentes anteriores (incisivos + caninos permanentes e decíduos) que têm face Incisal */
  var DENTES_INCISAL = [11,12,13,21,22,23,31,32,33,41,42,43,
                         51,52,53,61,62,63,71,72,73,81,82,83];

  var FACES_OCLUSAL = [
    { c:'V', l:'Vestibular'       },
    { c:'L', l:'Lingual/Palatina' },
    { c:'M', l:'Mesial'           },
    { c:'D', l:'Distal'           },
    { c:'O', l:'Oclusal'          }
  ];

  var FACES_INCISAL = [
    { c:'V', l:'Vestibular'       },
    { c:'L', l:'Lingual/Palatina' },
    { c:'M', l:'Mesial'           },
    { c:'D', l:'Distal'           },
    { c:'I', l:'Incisal'          }
  ];

  function _facesParaDente(num) {
    return DENTES_INCISAL.indexOf(num) >= 0 ? FACES_INCISAL : FACES_OCLUSAL;
  }

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
    _carregarEstadoPaciente();
  }

  /* ── Carregar especialidades + intervenções em paralelo ── */
  async function _carregarEspecialidades() {
    if (!_sb) return;
    var rE = await _sb.from('especialidades_odonto')
      .select('id,nome').eq('ativo', true).order('nome');
    var rI = await _sb.from('odonto_procedimentos')
      .select('id,nome_intervencao,valor_base,especialidade_id,tipo_visual')
      .eq('ativo', true).order('nome_intervencao');
    // Fallback: coluna tipo_visual ainda não existe (migração pendente)
    if (rI.error) {
      rI = await _sb.from('odonto_procedimentos')
        .select('id,nome_intervencao,valor_base,especialidade_id')
        .eq('ativo', true).order('nome_intervencao');
    }

    if (rE.error) { console.error('[Odontograma] especialidades:', rE.error); }
    if (rI.error) { console.error('[Odontograma] procedimentos:', rI.error); }

    var esps = rE.error ? [] : (rE.data || []);
    var invs = rI.error ? [] : (rI.data || []);

    _especialidades = esps.map(function (e) {
      return {
        id: e.id, nome: e.nome,
        procs: invs.filter(function (i) { return i.especialidade_id === e.id; })
      };
    });

    // Notificar se falhou completamente (ex.: Supabase fora do ar)
    if (!esps.length && (rE.error || rI.error)) {
      toast('Erro ao carregar especialidades. Recarregue a página.', 'error');
    }
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
      var buscaPanelHide = sid('odoBuscaPanel');
      if (buscaPanelHide) buscaPanelHide.style.display = 'none';
      return;
    }

    if (infoEl) infoEl.innerHTML = '<span class="odoDenteSelLabel">🦷 Dente #' + _denteSel + ' selecionado</span>';

    /* Busca rápida */
    var buscaPanel = sid('odoBuscaPanel');
    if (buscaPanel) buscaPanel.style.display = 'block';

    /* Especialidades */
    if (espPanel) espPanel.style.display = 'block';
    var espLista = sid('odoEspLista');
    if (espLista) {
      if (!_especialidades.length) {
        espLista.innerHTML = '<span class="odoHint">Nenhuma especialidade carregada. </span>'
          + '<button class="btn bSm" style="font-size:.72rem;padding:3px 10px;margin-top:4px"'
          + ' onclick="OdontogramaMod.recarregarEspecialidades()">🔄 Tentar novamente</button>';
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

  async function recarregarEspecialidades() {
    await _carregarEspecialidades();
    _atualizarPainelLateral();
  }

  /* ══════════════════════════════════════════════════════════════════
     BUSCA RÁPIDA DE PROCEDIMENTOS
  ══════════════════════════════════════════════════════════════════ */
  function buscarProcedimento(query) {
    var clear = sid('odoBuscaClear');
    var drop  = sid('odoBuscaDrop');
    if (!drop) return;

    if (clear) clear.style.display = query ? '' : 'none';

    if (!query || query.trim().length < 1) {
      drop.style.display = 'none';
      return;
    }

    var q = query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    var resultados = [];
    _especialidades.forEach(function (esp) {
      esp.procs.forEach(function (proc) {
        var nome = proc.nome_intervencao.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        if (nome.includes(q)) {
          resultados.push({ proc: proc, esp: esp });
        }
      });
    });

    if (!resultados.length) {
      drop.innerHTML = '<div class="odoBuscaVazio">Nenhum procedimento encontrado para "' + esc(query) + '"</div>';
    } else {
      drop.innerHTML = resultados.map(function (r) {
        var val   = 'R$ ' + Number(r.proc.valor_base).toFixed(2).replace('.', ',');
        var nomeHL = _highlight(r.proc.nome_intervencao, query);
        return '<div class="odoBuscaItem" onmousedown="OdontogramaMod.selecionarProcBusca(\'' + r.proc.id + '\',\'' + r.esp.id + '\')">'
          + '<div class="odoBuscaItemNome">' + nomeHL + '</div>'
          + '<div class="odoBuscaItemMeta">'
          + '<span class="odoBuscaItemEsp">' + esc(r.esp.nome) + '</span>'
          + '<span class="odoBuscaItemVal">' + val + '</span>'
          + '</div></div>';
      }).join('');
    }

    drop.style.display = 'block';
  }

  function _highlight(texto, query) {
    var idx = texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
                   .indexOf(query.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
    if (idx < 0) return esc(texto);
    return esc(texto.substring(0, idx))
      + '<mark class="odoBuscaDestaque">' + esc(texto.substring(idx, idx + query.length)) + '</mark>'
      + esc(texto.substring(idx + query.length));
  }

  function selecionarProcBusca(invId, espId) {
    limparBusca();
    _espSel = espId;
    _atualizarPainelLateral();
    abrirModalIntervencao(invId);
  }

  function fecharDropBusca() {
    var drop = sid('odoBuscaDrop');
    if (drop) drop.style.display = 'none';
  }

  function limparBusca() {
    var input = sid('odoBuscaInput');
    var drop  = sid('odoBuscaDrop');
    var clear = sid('odoBuscaClear');
    if (input) input.value = '';
    if (drop)  drop.style.display  = 'none';
    if (clear) clear.style.display = 'none';
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

    /* Renderiza checkboxes de faces conforme o tipo de dente */
    var faces = _facesParaDente(_denteSel);
    var wrap  = sid('odoFacesCheckboxes');
    if (wrap) {
      wrap.innerHTML = faces.map(function (f) {
        return '<label class="odoFaceChk">'
          + '<input type="checkbox" class="odoFaceChkInput" value="' + f.c
          + '" data-label="' + esc(f.l) + '" onchange="OdontogramaMod.onFaceChkChange()">'
          + '<span>' + esc(f.l) + '</span>'
          + '</label>';
      }).join('');
    }
    var txt = sid('odoFacesSelText');
    if (txt) txt.textContent = 'Nenhuma face selecionada';

    /* Reset status para "A Realizar" ao abrir */
    setStatusViz('a_realizar');

    var m = sid('odontoModalIntervencao'); if (m) m.style.display = 'flex';
  }

  function fecharModalIntervencao() {
    var m = sid('odontoModalIntervencao'); if (m) m.style.display = 'none';
    _intAtual = null;
  }

  function onFaceChkChange() {
    var checked = Array.from(document.querySelectorAll('.odoFaceChkInput:checked'))
      .map(function (el) { return el.dataset.label; });
    var txt = sid('odoFacesSelText');
    if (txt) txt.textContent = checked.length ? checked.join(' · ') : 'Nenhuma face selecionada';
  }

  function gravarIntervencao() {
    if (!_intAtual) return;
    var inputs = Array.from(document.querySelectorAll('.odoFaceChkInput:checked'));
    if (!inputs.length) { toast('Selecione pelo menos uma face', 'warn'); return; }

    var faces    = _facesParaDente(_denteSel);
    var facesSel = inputs.map(function (el) {
      return faces.find(function (f) { return f.c === el.value; }) || { c: el.value, l: el.dataset.label };
    });

    var facesStr   = facesSel.map(function (f) { return f.c; }).join(',');
    var tipoVisual = _intAtual.tipo_visual || 'nenhum';

    _itens.push({
      dente:            _denteSel,
      faces:            facesStr,
      facesLabels:      facesSel.map(function (f) { return f.l; }).join(', '),
      procedimentoId:   _intAtual.id,
      procedimentoNome: _intAtual.nome_intervencao,
      valor:            Number(_intAtual.valor_base),
      tipoVisual:       tipoVisual,
      statusVisual:     _statusSel
    });

    /* Aplica símbolo SVG imediatamente no dente */
    var cor = _COR_STATUS[_statusSel] || _COR_STATUS.a_realizar;
    if (!_estadoPaciente[_denteSel]) _estadoPaciente[_denteSel] = [];
    // tipo_visual='nenhum' usa marcador genérico 'tratado' (ponto cinza)
    _estadoPaciente[_denteSel].push({ tipo_visual: tipoVisual || 'tratado', faces: facesStr, cor: cor });
    _aplicarEstadoNoOdontograma();

    /* Colorir indicadores de face no grid (legado) */
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

    _histOrcamentos = orcamentos; // salva para visualização

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
        html += '<div class="odoHistItemHdr">'
          + '<span class="odoHistArrow" id="arr_' + itemId + '" onclick="OdontogramaMod.toggleHistItem(\'' + itemId + '\')">▶</span>'
          + '<span class="odoHistItemData" onclick="OdontogramaMod.toggleHistItem(\'' + itemId + '\')" style="cursor:pointer;flex:1">' + data
          + '<br><span class="odoHistItemSub"><span class="odoHistStatus">' + esc(status) + '</span></span></span>'
          + '<span class="odoHistItemVal">' + total + '</span>'
          + '<button class="odoHistVizBtn" onclick="OdontogramaMod.verHistViz(' + i + ')" title="Visualizar odontograma histórico">👁</button>'
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
    var _statDot = { a_realizar: '🔴', executado: '🟢', existente: '🔵' };
    tbody.innerHTML = _itens.map(function (item, idx) {
      return '<tr>'
        + '<td><strong>' + item.dente + '</strong></td>'
        + '<td style="font-size:.72rem">' + esc(item.facesLabels) + '</td>'
        + '<td>' + esc(item.procedimentoNome) + '</td>'
        + '<td style="font-size:.72rem;white-space:nowrap">'
        + (_statDot[item.statusVisual] || '🔴') + ' ' + (item.statusVisual === 'executado' ? 'Exec.' : item.statusVisual === 'existente' ? 'Exist.' : 'A real.')
        + '</td>'
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
    _estadoPaciente = {};
    fecharBuscaPaciente();
    _mostrarSelecaoPaciente();
    toast('Paciente: ' + nome, 'success');
    _carregarHistoricoPaciente();
    _carregarEstadoPaciente();
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
          faces:           item.faces,        // códigos (V,M,D...)
          procedimento_id: item.procedimentoId,
          valor_cobrado:   item.valor,
          status_item:     'Aprovado',
          status_visual:   item.statusVisual || 'a_realizar'
        };
      });
      var rItens = await _sb.from('orcamento_itens').insert(bulk);
      if (rItens.error) throw rItens.error;

      /* 3. Lançar recebimento pendente identificado pelo orçamento */
      var _hoje = new Date().toISOString().split('T')[0];
      var _descProc = _itens.map(function (it) {
        return 'D.' + it.dente + ' — ' + it.procedimentoNome;
      }).join(', ');

      var rReceb = await _sb.from('recebimentos').insert({
        unidade_id:       CU,
        valor:            total,
        status:           'PENDENTE',
        data_recebimento: _hoje,
        observacoes:      'ODONTO:' + rOrc.data.id + ' | ' + _descProc,
        criado_por:       uid
      }).select('id').single();
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

  /* ══════════════════════════════════════════════════════════════════
     VISUALIZAÇÃO HISTÓRICA — ODONTOGRAMA SOMENTE LEITURA
  ══════════════════════════════════════════════════════════════════ */
  function _htmlMiniDente(num, deciduo, procs) {
    var marcado = procs && procs.length > 0;
    var tooltipParts = marcado
      ? procs.map(function (p) { return p.proc + (p.faces ? ' (' + p.faces + ')' : ''); })
      : ['Dente ' + num];
    var tooltip = tooltipParts.join(' | ');
    var cls = 'odoHVDente' + (marcado ? ' odoHVDenteMarcado' : '') + (deciduo ? ' odoHVDeciduo' : '');
    var imgSrc = deciduo ? 'assets/tooth-placeholder.png' : ('assets/images/toothImageFront' + num + '.png');
    return '<div class="' + cls + '" title="' + esc(tooltip) + '">'
      + '<div class="odoHVNum">' + num + '</div>'
      + '<img src="' + imgSrc + '" class="odoHVImg" alt="" onerror="this.style.display=\'none\'">'
      + (marcado ? '<div class="odoHVMarca">' + procs.length + '</div>' : '')
      + '</div>';
  }

  function _buildHistVizBody(orc) {
    var itens = orc.orcamento_itens || [];
    var denteMap = {};
    itens.forEach(function (it) {
      var d = it.dente_numero;
      if (!denteMap[d]) denteMap[d] = [];
      denteMap[d].push({
        proc: (it.odonto_procedimentos && it.odonto_procedimentos.nome_intervencao)
          ? it.odonto_procedimentos.nome_intervencao : '—',
        faces: it.faces || '',
        valor: Number(it.valor_cobrado || 0)
      });
    });

    var html = '<div class="odoHVArcadas">';

    html += '<div class="odoHVArcadaLabel">ARCADA SUPERIOR — PERMANENTE</div>';
    html += '<div class="odoHVLinha">'
      + PERM_SUP.map(function (n) { return _htmlMiniDente(n, false, denteMap[n]); }).join('') + '</div>';

    html += '<div class="odoHVArcadaLabel odoHVLabelGap">ARCADA SUPERIOR — DECÍDUA</div>';
    html += '<div class="odoHVLinha odoHVLinhaDecidua">'
      + DEC_SUP.map(function (n) { return _htmlMiniDente(n, true, denteMap[n]); }).join('') + '</div>';

    html += '<div class="odoHVSep"></div>';

    html += '<div class="odoHVLinha odoHVLinhaDecidua">'
      + DEC_INF.map(function (n) { return _htmlMiniDente(n, true, denteMap[n]); }).join('') + '</div>';
    html += '<div class="odoHVArcadaLabel">ARCADA INFERIOR — DECÍDUA</div>';

    html += '<div class="odoHVLinha">'
      + PERM_INF.map(function (n) { return _htmlMiniDente(n, false, denteMap[n]); }).join('') + '</div>';
    html += '<div class="odoHVArcadaLabel">ARCADA INFERIOR — PERMANENTE</div>';

    html += '</div>'; // odoHVArcadas

    html += '<div class="odoHVLegenda">'
      + '<span class="odoHVLegNormal"><span class="odoHVLegBox"></span> Sem procedimento</span>'
      + '<span class="odoHVLegMarcado"><span class="odoHVLegBox odoHVLegBoxMarcado"></span> Com procedimento</span>'
      + '</div>';

    if (itens.length) {
      html += '<div class="odoHVSecTitulo">📋 Procedimentos deste atendimento</div>';
      html += '<div class="odoHVTableWrap"><table class="odoHVTable">'
        + '<thead><tr><th>Dente</th><th>Procedimento</th><th>Faces</th><th>Valor</th></tr></thead>'
        + '<tbody>';
      itens.forEach(function (it) {
        var proc = (it.odonto_procedimentos && it.odonto_procedimentos.nome_intervencao)
          ? it.odonto_procedimentos.nome_intervencao : '—';
        html += '<tr>'
          + '<td><span class="odoHVDentePill">D.' + esc(String(it.dente_numero)) + '</span></td>'
          + '<td>' + esc(proc) + '</td>'
          + '<td class="odoHVFacesTd">' + esc(it.faces || '—') + '</td>'
          + '<td><strong>R$ ' + Number(it.valor_cobrado || 0).toFixed(2).replace('.', ',') + '</strong></td>'
          + '</tr>';
      });
      html += '</tbody></table></div>';
    } else {
      html += '<div class="odoHVVazio">Nenhum procedimento registrado neste atendimento.</div>';
    }

    return html;
  }

  function verHistViz(idx) {
    if (!_histOrcamentos.length) return;
    _histVizIdx = Math.max(0, Math.min(idx, _histOrcamentos.length - 1));
    var orc = _histOrcamentos[_histVizIdx];
    var m = sid('modalOdoHistViz');
    if (!m) return;

    var total  = 'R$ ' + Number(orc.valor_total || 0).toFixed(2).replace('.', ',');
    var status = orc.status_geral || 'Finalizado';
    var data   = _fmtData(orc.data_criacao);

    var meta = sid('odoHVMeta');
    if (meta) meta.innerHTML = data + ' &nbsp;·&nbsp; <strong>' + esc(status) + '</strong> &nbsp;·&nbsp; <span class="odoHVTotal">' + total + '</span>';

    var nav = sid('odoHVNav');
    if (nav) {
      var total_orc = _histOrcamentos.length;
      nav.innerHTML = '<button class="odoHVNavBtn" onclick="OdontogramaMod.histVizNavegar(-1)" '
        + (_histVizIdx <= 0 ? 'disabled' : '') + '>◀ Anterior</button>'
        + '<span class="odoHVNavPos">' + (_histVizIdx + 1) + ' de ' + total_orc + '</span>'
        + '<button class="odoHVNavBtn" onclick="OdontogramaMod.histVizNavegar(1)" '
        + (_histVizIdx >= total_orc - 1 ? 'disabled' : '') + '>Próximo ▶</button>';
    }

    var corpo = sid('odoHVCorpo');
    if (corpo) corpo.innerHTML = _buildHistVizBody(orc);

    m.style.display = 'flex';
  }

  function fecharHistViz() {
    var m = sid('modalOdoHistViz');
    if (m) m.style.display = 'none';
  }

  function histVizNavegar(delta) {
    verHistViz(_histVizIdx + delta);
  }

  /* ══════════════════════════════════════════════════════════════════
     STATUS PILLS
  ══════════════════════════════════════════════════════════════════ */
  function setStatusViz(status) {
    _statusSel = status;
    ['a_realizar', 'executado', 'existente'].forEach(function (s) {
      var btn = sid('odoStatBtn_' + s);
      if (btn) btn.classList.toggle('odoStatusPillAtivo', s === status);
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     ESTADO VISUAL ACUMULADO — carregar histórico do paciente
  ══════════════════════════════════════════════════════════════════ */
  async function _carregarEstadoPaciente() {
    _estadoPaciente = {};
    if (!_pacienteId || !_sb) { _aplicarEstadoNoOdontograma(); return; }

    var r = await _sb.from('orcamentos')
      .select('id,orcamento_itens(dente_numero,faces,status_visual,odonto_procedimentos(tipo_visual))')
      .eq('paciente_id', _pacienteId);
    // Fallback: colunas ainda não existem (migração pendente)
    if (r.error) {
      r = await _sb.from('orcamentos')
        .select('id,orcamento_itens(dente_numero,faces)')
        .eq('paciente_id', _pacienteId);
    }

    if (r.error || !r.data) { _aplicarEstadoNoOdontograma(); return; }

    r.data.forEach(function (orc) {
      (orc.orcamento_itens || []).forEach(function (item) {
        var d  = item.dente_numero;
        var tv = (item.odonto_procedimentos && item.odonto_procedimentos.tipo_visual) || 'nenhum';
        var sv = item.status_visual || 'a_realizar';
        // 'nenhum' usa marcador genérico 'tratado' — aparece no dente mesmo sem símbolo específico
        if (!_estadoPaciente[d]) _estadoPaciente[d] = [];
        _estadoPaciente[d].push({
          tipo_visual: tv === 'nenhum' ? 'tratado' : tv,
          faces: _normalizarFaces(item.faces),
          cor: _COR_STATUS[sv] || _COR_STATUS.a_realizar
        });
      });
    });

    _aplicarEstadoNoOdontograma();
  }

  /* Converte labels antigos ("Vestibular, Mesial") para códigos ("V,M") */
  function _normalizarFaces(faces) {
    if (!faces) return '';
    return faces.split(',').map(function (f) {
      var t = f.trim();
      return _LABEL_TO_CODE[t] || t;
    }).join(',');
  }

  /* ══════════════════════════════════════════════════════════════════
     RENDERIZAÇÃO SVG NOS DENTES
  ══════════════════════════════════════════════════════════════════ */
  function _gerarSVG(tipo, faces, cor) {
    var s = '';
    if (tipo === 'tratado') {
      // Marcador genérico: pequeno ponto cinza no centro — indica procedimento sem símbolo específico
      s += '<circle cx="50" cy="50" r="7" fill="#9ca3af" opacity="0.8"/>';
    } else if (tipo === 'ausente') {
      s += '<line x1="10" y1="10" x2="90" y2="90" stroke="' + cor + '" stroke-width="10" stroke-linecap="round"/>';
      s += '<line x1="90" y1="10" x2="10" y2="90" stroke="' + cor + '" stroke-width="10" stroke-linecap="round"/>';
    } else if (tipo === 'extracao') {
      s += '<line x1="10" y1="10" x2="90" y2="90" stroke="' + cor + '" stroke-width="8" stroke-linecap="round"/>';
    } else if (tipo === 'canal') {
      s += '<line x1="50" y1="5" x2="50" y2="95" stroke="' + cor + '" stroke-width="6" stroke-linecap="round"/>';
    } else if (tipo === 'coroa') {
      s += '<rect x="6" y="6" width="88" height="58" rx="4" fill="none" stroke="' + cor + '" stroke-width="5"/>';
    } else {
      var faceList = faces ? faces.split(',').map(function (f) { return f.trim(); }) : ['O'];
      faceList.forEach(function (fc) {
        var pos = _FACE_POS[fc] || _FACE_POS['O'];
        if (tipo === 'carie') {
          s += '<circle cx="' + pos.cx + '" cy="' + pos.cy + '" r="11" fill="' + cor + '"/>';
        } else if (tipo === 'restauracao') {
          s += '<rect x="' + (pos.cx - 10) + '" y="' + (pos.cy - 10) + '" width="20" height="20" rx="2" fill="' + cor + '"/>';
        } else if (tipo === 'provisorio') {
          s += '<circle cx="' + pos.cx + '" cy="' + pos.cy + '" r="11" fill="none" stroke="' + cor + '" stroke-width="4"/>';
        }
      });
    }
    return s;
  }

  function _aplicarEstadoNoOdontograma() {
    /* Remove SVGs anteriores */
    document.querySelectorAll('.odontoDenteSVG').forEach(function (el) { el.remove(); });

    Object.keys(_estadoPaciente).forEach(function (denteNum) {
      var simbolos = _estadoPaciente[denteNum];
      if (!simbolos || !simbolos.length) return;

      var graf = document.querySelector('.odontoDente[data-dente="' + denteNum + '"] .odontoDenteGraf');
      if (!graf) return;

      /* Ordem de renderização: face-específicos → contorno → linhas → ausente por último */
      var prioridade = { carie: 0, restauracao: 0, provisorio: 0, coroa: 1, canal: 2, extracao: 2, ausente: 3 };
      var ordenados  = simbolos.slice().sort(function (a, b) {
        return (prioridade[a.tipo_visual] || 0) - (prioridade[b.tipo_visual] || 0);
      });

      var svgContent = ordenados.map(function (s) {
        return _gerarSVG(s.tipo_visual, s.faces, s.cor);
      }).join('');

      if (!svgContent) return;

      var svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svgEl.setAttribute('class', 'odontoDenteSVG');
      svgEl.setAttribute('viewBox', '0 0 100 100');
      svgEl.setAttribute('preserveAspectRatio', 'none');
      svgEl.innerHTML = svgContent;
      graf.appendChild(svgEl);
    });
  }

  return {
    init,
    selecionarDente, selecionarEspecialidade, recarregarEspecialidades,
    abrirModalIntervencao, fecharModalIntervencao, gravarIntervencao, onFaceChkChange,
    setStatusViz,
    removerItem, finalizarAtendimento,
    abrirBuscaPaciente, fecharBuscaPaciente, buscarPaciente, selecionarPaciente,
    trocarPaciente, lancarSelecao, abrirAnamnese, toggleHistItem,
    buscarProcedimento, selecionarProcBusca, fecharDropBusca, limparBusca,
    verHistViz, fecharHistViz, histVizNavegar
  };
})();
