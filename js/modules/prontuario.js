/* ═══════════════════════════════════════════════════════════════════════
   PAINEL DE CONTROLE CLÍNICO — js/modules/prontuario.js
   ProntuarioMod: EMR completo (22 funções públicas)
   Depende de: supabase.js (_sb), main.js (sid, esc, toast, CU, USER_ROLE, USER_PROFILE)
═══════════════════════════════════════════════════════════════════════ */

const ProntuarioMod = (function () {
  'use strict';

  /* ── Estado interno ── */
  var _pac       = null;  // paciente atual {id, nome_completo, cpf, telefone, data_nascimento}
  var _atd       = null;  // atendimento aberto
  var _lista     = [];    // histórico de atendimentos
  var _modelos   = [];    // templates de prontuário
  var _meds      = [];    // medicamentos da receita atual
  var _aba       = 'evolucao';
  var _buscarTmr = null;

  /* ══════════════════════════════════════════════════════════════════════════
     INIT
     ══════════════════════════════════════════════════════════════════════════ */
  async function init() {
    if (!_sb) return;
    // Esconde o select GLOBAL para quem não é admin
    _ajustarPermissaoModelo();
    // Se outro módulo pré-selecionou um paciente
    if (window._prnPacienteId) {
      var pid = window._prnPacienteId;
      window._prnPacienteId = null;
      await carregarPaciente(pid);
    } else {
      // Garante estado limpo ao re-abrir o módulo
      _mostrarBusca();
    }
  }

  function _ajustarPermissaoModelo() {
    var sel = sid('prnModeloTipoAcesso');
    if (!sel) return;
    if (USER_ROLE !== 'administrador') {
      // Remove opção GLOBAL para não-admins (RLS já bloqueia no backend)
      for (var i = sel.options.length - 1; i >= 0; i--) {
        if (sel.options[i].value === 'GLOBAL') sel.remove(i);
      }
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     BUSCA DE PACIENTE
     ══════════════════════════════════════════════════════════════════════════ */
  function buscarPaciente(q) {
    var drop = sid('prnPacDrop');
    if (!drop) return;
    if (!q || q.trim().length < 2) { drop.style.display = 'none'; return; }
    clearTimeout(_buscarTmr);
    _buscarTmr = setTimeout(async function () {
      var r = await _sb.from('pacientes')
        .select('id,nome_completo,cpf,data_nascimento')
        .or('nome_completo.ilike.%' + q.trim() + '%,cpf.ilike.%' + q.trim() + '%')
        .limit(8);
      if (!drop) return;
      var dados = r.data || [];
      if (!dados.length) {
        drop.innerHTML = '<div class="prnPacItem" style="color:var(--s4);cursor:default">Nenhum resultado encontrado</div>';
        drop.style.display = 'block';
        return;
      }
      drop.innerHTML = dados.map(function (p) {
        return '<div class="prnPacItem" data-pid="' + p.id + '" onclick="ProntuarioMod.selPacienteDrop(this)">'
          + '<strong>' + esc(p.nome_completo) + '</strong>'
          + '<small>' + (p.cpf || 'CPF não informado') + '</small>'
          + '</div>';
      }).join('');
      drop.style.display = 'block';
    }, 280);
  }

  function selPacienteDrop(el) {
    var pid = el.getAttribute('data-pid');
    var drop = sid('prnPacDrop');
    var inp  = sid('prnBuscaInput');
    if (drop) drop.style.display = 'none';
    if (inp)  inp.value = el.querySelector('strong').textContent;
    carregarPaciente(pid);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     CARREGAR PACIENTE
     ══════════════════════════════════════════════════════════════════════════ */
  async function carregarPaciente(pacienteId) {
    var r = await _sb.from('pacientes')
      .select('id,nome_completo,cpf,telefone,data_nascimento')
      .eq('id', pacienteId)
      .single();
    if (r.error || !r.data) { toast('Paciente não encontrado', 'error'); return; }
    _pac = r.data;
    _renderizarHeaderPac();
    _mostrarPrincipal();
    await Promise.all([_carregarLista(), _carregarModelos()]);
    _renderizarTimeline();
  }

  function _renderizarHeaderPac() {
    if (!_pac) return;
    var nome  = sid('prnPacNome');
    var cpf   = sid('prnPacCPF');
    var tel   = sid('prnPacTel');
    var idade = sid('prnPacIdade');
    if (nome)  nome.textContent  = _pac.nome_completo || '—';
    if (cpf)   cpf.textContent   = 'CPF: ' + (_pac.cpf || '—');
    if (tel)   tel.textContent   = 'Tel: ' + (_pac.telefone || '—');
    if (idade) idade.textContent = _pac.data_nascimento
      ? 'Idade: ' + calcularIdadeExata(_pac.data_nascimento)
      : '—';
  }

  /* ══════════════════════════════════════════════════════════════════════════
     CÁLCULO DE IDADE EXATA
     ══════════════════════════════════════════════════════════════════════════ */
  function calcularIdadeExata(dataNasc) {
    // dataNasc esperado: 'YYYY-MM-DD'
    var nasc  = new Date(dataNasc + 'T00:00:00');
    var hoje  = new Date();
    var anos  = hoje.getFullYear() - nasc.getFullYear();
    var meses = hoje.getMonth()    - nasc.getMonth();
    var dias  = hoje.getDate()     - nasc.getDate();

    if (dias < 0) {
      meses--;
      var ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth(), 0).getDate();
      dias += ultimoDia;
    }
    if (meses < 0) { anos--; meses += 12; }

    var partes = [];
    if (anos  > 0) partes.push(anos  + (anos  === 1 ? ' ano'  : ' anos'));
    if (meses > 0) partes.push(meses + (meses === 1 ? ' mês'  : ' meses'));
    if (dias  > 0 || partes.length === 0)
                   partes.push(dias  + (dias  === 1 ? ' dia'  : ' dias'));
    return partes.join(', ');
  }

  /* ══════════════════════════════════════════════════════════════════════════
     LISTA DE ATENDIMENTOS (TIMELINE)
     ══════════════════════════════════════════════════════════════════════════ */
  async function _carregarLista() {
    if (!_pac) return;
    var r = await _sb.from('atendimentos_clinicos')
      .select('id,data_atendimento,profissional_id,profissional:profissional_id(nome,especialidade)')
      .eq('paciente_id', _pac.id)
      .order('data_atendimento', { ascending: false });
    _lista = r.data || [];
  }

  function _renderizarTimeline() {
    var tl = sid('prnTimeline');
    if (!tl) return;

    var btnNovo = '<button class="prnTlBtnNovo" onclick="ProntuarioMod.novoAtendimento()">+ Novo Atendimento</button>';

    if (!_lista.length) {
      tl.innerHTML = '<div class="prnTlHeader">Atendimentos</div>'
        + btnNovo
        + '<div class="prnTlVazio">Nenhum atendimento registrado</div>';
      return;
    }

    var html = '<div class="prnTlHeader">Atendimentos</div>' + btnNovo;
    _lista.forEach(function (a) {
      var d    = new Date(a.data_atendimento);
      var data = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      var hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      var prof = (a.profissional && a.profissional.nome) ? a.profissional.nome : '—';
      var ativo = _atd && _atd.id === a.id ? ' ativo' : '';
      html += '<div class="prnTlItem' + ativo + '" data-atdid="' + a.id + '" onclick="ProntuarioMod.tlClick(this)">'
        + '<div class="prnTlData">' + data + '</div>'
        + '<div class="prnTlHora">' + hora + '</div>'
        + '<div class="prnTlProf">' + esc(prof) + '</div>'
        + '</div>';
    });
    tl.innerHTML = html;
  }

  function tlClick(el) {
    abrirAtendimento(el.getAttribute('data-atdid'));
  }

  /* ══════════════════════════════════════════════════════════════════════════
     NOVO ATENDIMENTO
     ══════════════════════════════════════════════════════════════════════════ */
  async function novoAtendimento() {
    if (!_pac) { toast('Selecione um paciente primeiro', 'warn'); return; }
    if (!USER_PROFILE || !USER_PROFILE.id) { toast('Sessão inválida, recarregue a página', 'error'); return; }
    if (USER_ROLE !== 'profissional_saude' && USER_ROLE !== 'administrador') {
      toast('Sem permissão para criar atendimentos', 'warn'); return;
    }

    var r = await _sb.from('atendimentos_clinicos').insert({
      paciente_id:      _pac.id,
      profissional_id:  USER_PROFILE.id,
      unidade_id:       CU,
      data_atendimento: new Date().toISOString()
    }).select().single();

    if (r.error) { toast('Erro ao criar atendimento: ' + r.error.message, 'error'); return; }

    await _carregarLista();
    await abrirAtendimento(r.data.id);
    _renderizarTimeline();
    toast('Novo atendimento criado', 'success');
  }

  /* ══════════════════════════════════════════════════════════════════════════
     ABRIR ATENDIMENTO EXISTENTE
     ══════════════════════════════════════════════════════════════════════════ */
  async function abrirAtendimento(atdId) {
    var r = await _sb.from('atendimentos_clinicos')
      .select('*,profissional:profissional_id(nome,especialidade,conselho,uf_conselho,numero_conselho)')
      .eq('id', atdId)
      .single();
    if (r.error || !r.data) { toast('Atendimento não encontrado', 'error'); return; }
    _atd = r.data;

    // Limpa estado das abas
    _meds = [];
    var campos = ['prnEvolucaoTxt','prnExamesTxt','prnAtestadoObs','prnAtestadoDias','prnAtestadoCid'];
    campos.forEach(function(id) { var el = sid(id); if (el) el.value = ''; });
    var tipoSel = sid('prnAtestadoTipo'); if (tipoSel) tipoSel.value = 'MEDICO';

    // Data/hora do atendimento
    var datEl = sid('prnAtdData');
    if (datEl) {
      var d = new Date(_atd.data_atendimento);
      datEl.textContent = d.toLocaleDateString('pt-BR', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
      }) + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    // Mostra painel de atendimento
    var empty = sid('prnEmpty');
    var atdEl = sid('prnAtendimento');
    if (empty) empty.style.display = 'none';
    if (atdEl) atdEl.style.display = 'flex';

    // Carrega dados
    await Promise.all([_carregarEvolucao(), _carregarDocumentos()]);

    _renderizarTimeline();
    mudarAba('evolucao');
  }

  /* ══════════════════════════════════════════════════════════════════════════
     ABA — EVOLUÇÃO
     ══════════════════════════════════════════════════════════════════════════ */
  async function _carregarEvolucao() {
    if (!_atd) return;
    var r = await _sb.from('evolucoes').select('texto_evolucao').eq('atendimento_id', _atd.id).maybeSingle();
    var el = sid('prnEvolucaoTxt');
    if (el && r.data) el.value = r.data.texto_evolucao || '';
  }

  async function salvarEvolucao() {
    if (!_atd) { toast('Abra um atendimento primeiro', 'warn'); return; }
    var el = sid('prnEvolucaoTxt');
    if (!el) return;
    var txt = el.value;

    var check = await _sb.from('evolucoes').select('id').eq('atendimento_id', _atd.id).maybeSingle();
    var r;
    if (check.data) {
      r = await _sb.from('evolucoes')
        .update({ texto_evolucao: txt, atualizado_em: new Date().toISOString() })
        .eq('id', check.data.id);
    } else {
      r = await _sb.from('evolucoes').insert({ atendimento_id: _atd.id, texto_evolucao: txt });
    }
    if (r.error) { toast('Erro ao salvar evolução', 'error'); return; }
    toast('Evolução salva com sucesso', 'success');
  }

  /* ══════════════════════════════════════════════════════════════════════════
     MODELOS DE PRONTUÁRIO
     ══════════════════════════════════════════════════════════════════════════ */
  async function _carregarModelos() {
    if (!USER_PROFILE) return;
    var r = await _sb.from('modelos_prontuario')
      .select('id,titulo,conteudo,tipo_acesso,profissional_id')
      .or('tipo_acesso.eq.GLOBAL,profissional_id.eq.' + USER_PROFILE.id)
      .order('tipo_acesso')
      .order('titulo');
    _modelos = r.data || [];
    _renderizarModeloSelect();
  }

  function _renderizarModeloSelect() {
    var sel = sid('prnModeloSel');
    if (!sel || !USER_PROFILE) return;

    var meus    = _modelos.filter(function (m) { return m.profissional_id === USER_PROFILE.id && m.tipo_acesso === 'PRIVADO'; });
    var globais = _modelos.filter(function (m) { return m.tipo_acesso === 'GLOBAL'; });

    var html = '<option value="">— Inserir modelo —</option>';
    if (meus.length) {
      html += '<optgroup label="Meus Modelos">';
      meus.forEach(function (m) { html += '<option value="' + m.id + '">' + esc(m.titulo) + '</option>'; });
      html += '</optgroup>';
    }
    if (globais.length) {
      html += '<optgroup label="Modelos da Clínica">';
      globais.forEach(function (m) { html += '<option value="' + m.id + '">' + esc(m.titulo) + '</option>'; });
      html += '</optgroup>';
    }
    if (!meus.length && !globais.length) {
      html += '<option value="" disabled>Nenhum modelo disponível</option>';
    }
    sel.innerHTML = html;
  }

  function injetarModelo() {
    var sel = sid('prnModeloSel');
    if (!sel || !sel.value) return;
    var modelo = _modelos.find(function (m) { return m.id === sel.value; });
    if (!modelo) return;
    var txt = sid('prnEvolucaoTxt');
    if (!txt) { sel.value = ''; return; }

    var inicio = txt.selectionStart || txt.value.length;
    var fim    = txt.selectionEnd   || txt.value.length;
    var antes  = txt.value.substring(0, inicio);
    var depois = txt.value.substring(fim);
    // Separa com quebra de linha se houver conteúdo
    var sep = (antes && !antes.endsWith('\n')) ? '\n' : '';
    txt.value = antes + sep + modelo.conteudo + depois;
    txt.focus();
    sel.value = '';
    toast('Modelo inserido', 'info');
  }

  function abrirSalvarModelo() {
    var txt = sid('prnEvolucaoTxt');
    if (!txt || !txt.value.trim()) { toast('Digite o texto da evolução antes de salvar como modelo', 'warn'); return; }
    var el = sid('prnModeloTitulo'); if (el) el.value = '';
    var modal = sid('modalSalvarModelo');
    if (modal) { modal.style.display = 'flex'; setTimeout(function() { var t = sid('prnModeloTitulo'); if(t) t.focus(); }, 50); }
  }

  function fecharSalvarModelo() {
    var modal = sid('modalSalvarModelo');
    if (modal) modal.style.display = 'none';
  }

  async function confirmarSalvarModelo() {
    var titulo = (sid('prnModeloTitulo') || {}).value || '';
    if (!titulo.trim()) { toast('Digite um título para o modelo', 'warn'); return; }

    var acesso = (sid('prnModeloTipoAcesso') || {}).value || 'PRIVADO';
    if (acesso === 'GLOBAL' && USER_ROLE !== 'administrador') {
      toast('Apenas administradores podem criar modelos compartilhados', 'warn'); return;
    }

    var txt = (sid('prnEvolucaoTxt') || {}).value || '';
    var payload = {
      titulo:      titulo.trim(),
      conteudo:    txt,
      tipo_acesso: acesso
    };
    if (acesso === 'PRIVADO') payload.profissional_id = USER_PROFILE.id;

    var r = await _sb.from('modelos_prontuario').insert(payload);
    if (r.error) { toast('Erro ao salvar modelo: ' + r.error.message, 'error'); return; }

    fecharSalvarModelo();
    await _carregarModelos();
    toast('Modelo "' + titulo.trim() + '" salvo com sucesso', 'success');
  }

  /* ══════════════════════════════════════════════════════════════════════════
     ABA — EXAMES
     ══════════════════════════════════════════════════════════════════════════ */
  async function salvarExames() {
    var el = sid('prnExamesTxt');
    if (!el) return;
    if (await _salvarDocumento('EXAME', { texto: el.value })) {
      toast('Solicitação de exames salva', 'success');
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     ABA — RECEITUÁRIO
     ══════════════════════════════════════════════════════════════════════════ */
  function adicionarMedicamento() {
    _meds.push({ apresentacao: '', quantidade: '', posologia: '', dias: '' });
    _renderizarMeds();
  }

  function removerMedicamento(idx) {
    _meds.splice(idx, 1);
    _renderizarMeds();
  }

  function medInput(el) {
    var idx   = parseInt(el.getAttribute('data-idx'));
    var campo = el.getAttribute('data-campo');
    if (!isNaN(idx) && _meds[idx] !== undefined) _meds[idx][campo] = el.value;
  }

  function _renderizarMeds() {
    var wrap = sid('prnMedicamentosWrap');
    if (!wrap) return;
    if (!_meds.length) {
      wrap.innerHTML = '<div class="prnMedVazio">Nenhum medicamento adicionado</div>';
      return;
    }
    wrap.innerHTML = _meds.map(function (m, i) {
      return '<div class="prnMedItem">'
        + '<div class="prnMedNum">' + (i + 1) + '</div>'
        + '<div class="prnMedFields">'
        +   '<input class="afInp" placeholder="Apresentação (ex: Dipirona 500mg)" '
        +          'data-idx="' + i + '" data-campo="apresentacao" '
        +          'value="' + esc(m.apresentacao) + '" oninput="ProntuarioMod.medInput(this)"/>'
        +   '<div class="prnMedGrid3">'
        +     '<input class="afInp" placeholder="Quantidade" '
        +            'data-idx="' + i + '" data-campo="quantidade" '
        +            'value="' + esc(m.quantidade) + '" oninput="ProntuarioMod.medInput(this)"/>'
        +     '<input class="afInp" placeholder="Posologia (ex: 1 cp a cada 8h)" '
        +            'data-idx="' + i + '" data-campo="posologia" '
        +            'value="' + esc(m.posologia) + '" oninput="ProntuarioMod.medInput(this)"/>'
        +     '<input class="afInp" type="number" min="1" placeholder="Dias" '
        +            'data-idx="' + i + '" data-campo="dias" '
        +            'value="' + esc(m.dias) + '" oninput="ProntuarioMod.medInput(this)"/>'
        +   '</div>'
        + '</div>'
        + '<button class="prnMedRemove" onclick="ProntuarioMod.removerMedicamento(' + i + ')" title="Remover">✕</button>'
        + '</div>';
    }).join('');
  }

  async function salvarReceituario() {
    if (await _salvarDocumento('RECEITUARIO', { medicamentos: _meds })) {
      toast('Receituário salvo', 'success');
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     ABA — ATESTADO
     ══════════════════════════════════════════════════════════════════════════ */
  async function salvarAtestado() {
    var conteudo = {
      tipo:        ((sid('prnAtestadoTipo') || {}).value) || 'MEDICO',
      dias:        ((sid('prnAtestadoDias') || {}).value) || '',
      cid:         ((sid('prnAtestadoCid')  || {}).value) || '',
      observacoes: ((sid('prnAtestadoObs')  || {}).value) || ''
    };
    if (await _salvarDocumento('ATESTADO', conteudo)) {
      toast('Atestado salvo', 'success');
    }
  }

  /* ── Helper: upsert de documento ── */
  async function _salvarDocumento(tipo, conteudo) {
    if (!_atd) { toast('Abra um atendimento primeiro', 'warn'); return false; }
    var check = await _sb.from('documentos_atendimento')
      .select('id').eq('atendimento_id', _atd.id).eq('tipo', tipo).maybeSingle();
    var r;
    if (check.data) {
      r = await _sb.from('documentos_atendimento').update({ conteudo: conteudo }).eq('id', check.data.id);
    } else {
      r = await _sb.from('documentos_atendimento').insert({ atendimento_id: _atd.id, tipo: tipo, conteudo: conteudo });
    }
    if (r.error) { toast('Erro ao salvar: ' + r.error.message, 'error'); console.error(r.error); return false; }
    return true;
  }

  /* ── Carrega todos os documentos do atendimento ── */
  async function _carregarDocumentos() {
    if (!_atd) return;
    var r = await _sb.from('documentos_atendimento').select('*').eq('atendimento_id', _atd.id);
    var docs = r.data || [];
    docs.forEach(function (doc) {
      if (doc.tipo === 'EXAME') {
        var el = sid('prnExamesTxt');
        if (el) el.value = (doc.conteudo && doc.conteudo.texto) ? doc.conteudo.texto : '';
      } else if (doc.tipo === 'RECEITUARIO') {
        _meds = (doc.conteudo && doc.conteudo.medicamentos) ? doc.conteudo.medicamentos : [];
        _renderizarMeds();
      } else if (doc.tipo === 'ATESTADO') {
        var c = doc.conteudo || {};
        var tipo = sid('prnAtestadoTipo'); if (tipo) tipo.value = c.tipo || 'MEDICO';
        var dias = sid('prnAtestadoDias'); if (dias) dias.value = c.dias || '';
        var cid  = sid('prnAtestadoCid');  if (cid)  cid.value  = c.cid  || '';
        var obs  = sid('prnAtestadoObs');  if (obs)  obs.value  = c.observacoes || '';
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════════════════
     TROCA DE ABA
     ══════════════════════════════════════════════════════════════════════════ */
  function mudarAba(aba) {
    _aba = aba;
    document.querySelectorAll('.prnTab').forEach(function (btn) {
      btn.classList.toggle('ativa', btn.getAttribute('data-aba') === aba);
    });
    document.querySelectorAll('.prnAbaContent').forEach(function (div) {
      var estaAtivo = div.getAttribute('data-aba') === aba;
      div.style.display = estaAtivo ? 'block' : 'none';
      div.classList.toggle('ativa', estaAtivo);
    });
  }

  /* ══════════════════════════════════════════════════════════════════════════
     IMPRESSÃO / GERAÇÃO DE PDF
     ══════════════════════════════════════════════════════════════════════════ */
  function imprimir() {
    if (!_pac) { toast('Selecione um paciente primeiro', 'warn'); return; }
    if (!_atd) { toast('Selecione ou crie um atendimento para imprimir', 'warn'); return; }
    _montarDocImpressao();
    document.body.classList.add('prn-imprimindo');
    window.print();
    document.body.classList.remove('prn-imprimindo');
  }

  function _montarDocImpressao() {
    var doc = sid('prnDocImpressao');
    if (!doc) return;

    var prof    = (_atd && _atd.profissional) ? _atd.profissional : {};
    var d       = new Date((_atd && _atd.data_atendimento) ? _atd.data_atendimento : new Date());
    var dataFmt = d.toLocaleDateString('pt-BR',  { day: '2-digit', month: 'long', year: 'numeric' });
    var horaFmt = d.toLocaleTimeString('pt-BR',  { hour: '2-digit', minute: '2-digit' });

    var evolucao  = ((sid('prnEvolucaoTxt') || {}).value  || '').trim();
    var exames    = ((sid('prnExamesTxt')   || {}).value  || '').trim();
    var atTipo    = ((sid('prnAtestadoTipo')|| {}).value  || '');
    var atDias    = ((sid('prnAtestadoDias')|| {}).value  || '');
    var atCid     = ((sid('prnAtestadoCid') || {}).value  || '');
    var atObs     = ((sid('prnAtestadoObs') || {}).value  || '').trim();

    var nomeProfissional = prof.nome            || '';
    var conselho         = prof.conselho        || 'CRM';
    var uf               = prof.uf_conselho     || '';
    var numCons          = prof.numero_conselho || '';

    var html = '';

    /* ── Cabeçalho ── */
    html += '<div class="prnImpHdr">'
      + '<div class="prnImpLogoWrap">'
      +   '<div class="prnImpLogoNome">Clínica da Família</div>'
      +   '<div class="prnImpLogoSub">Prontuário Eletrônico</div>'
      + '</div>'
      + '<div class="prnImpHdrRight">'
      +   '<div class="prnImpHdrData">' + dataFmt + '</div>'
      +   '<div>às ' + horaFmt + '</div>'
      + '</div>'
      + '</div>';

    /* ── Dados do paciente ── */
    var idadeStr = (_pac && _pac.data_nascimento) ? calcularIdadeExata(_pac.data_nascimento) : '—';
    html += '<div class="prnImpPacFaixa">'
      + '<span class="prnImpPacLabel">Paciente:</span> ' + esc((_pac && _pac.nome_completo) || '—')
      + '&nbsp;&nbsp;&nbsp;'
      + '<span class="prnImpPacLabel">CPF:</span> ' + esc((_pac && _pac.cpf) || '—')
      + '&nbsp;&nbsp;&nbsp;'
      + '<span class="prnImpPacLabel">Idade:</span> ' + idadeStr;
    if (_pac && _pac.telefone) {
      html += '&nbsp;&nbsp;&nbsp;<span class="prnImpPacLabel">Tel:</span> ' + esc(_pac.telefone);
    }
    html += '</div>';

    /* ── Evolução ── */
    if (evolucao) {
      html += '<div class="prnImpSecao">'
        + '<div class="prnImpSecaoTitulo">Evolução Clínica</div>'
        + '<div class="prnImpTexto">' + evolucao.replace(/\n/g, '<br>') + '</div>'
        + '</div>'
        + '<hr class="prnImpDivisor">';
    }

    /* ── Exames ── */
    if (exames) {
      html += '<div class="prnImpSecao">'
        + '<div class="prnImpSecaoTitulo">Solicitação de Exames / Procedimentos</div>'
        + '<div class="prnImpTexto">' + exames.replace(/\n/g, '<br>') + '</div>'
        + '</div>'
        + '<hr class="prnImpDivisor">';
    }

    /* ── Receituário ── */
    if (_meds && _meds.length) {
      html += '<div class="prnImpSecao">'
        + '<div class="prnImpSecaoTitulo">Receituário Médico</div>';
      _meds.forEach(function (m, i) {
        html += '<div class="prnImpMed">'
          + '<div class="prnImpMedNome">' + (i + 1) + '. ' + esc(m.apresentacao || '—') + (m.quantidade ? ' — ' + esc(m.quantidade) : '') + '</div>'
          + (m.posologia ? '<div class="prnImpMedPos">' + esc(m.posologia) + (m.dias ? ', por ' + esc(m.dias) + ' dia(s)' : '') + '</div>' : '')
          + '</div>';
      });
      html += '</div><hr class="prnImpDivisor">';
    }

    /* ── Atestado ── */
    if (atTipo) {
      var labelTipo = {
        MEDICO:         'Atestado Médico',
        ACOMPANHAMENTO: 'Atestado de Acompanhamento',
        COMPARECIMENTO: 'Declaração de Comparecimento'
      };
      html += '<div class="prnImpSecao">'
        + '<div class="prnImpSecaoTitulo">' + (labelTipo[atTipo] || 'Atestado') + '</div>'
        + '<div class="prnImpTexto">';

      html += 'Atesto que o(a) paciente <strong>' + esc((_pac && _pac.nome_completo) || '—') + '</strong>';
      if (atTipo === 'MEDICO') {
        html += ' necessita de afastamento de suas atividades por '
          + '<strong>' + (atDias || '___') + ' dia(s)</strong>';
      } else if (atTipo === 'ACOMPANHAMENTO') {
        html += ' necessita de acompanhante por <strong>' + (atDias || '___') + ' dia(s)</strong>';
      } else if (atTipo === 'COMPARECIMENTO') {
        html += ' compareceu a esta unidade de saúde na data acima';
      }
      if (atCid)  html += ' (CID-10: <strong>' + esc(atCid) + '</strong>)';
      html += '.';
      if (atObs)  html += ' ' + esc(atObs);
      html += '</div></div>';
    }

    /* ── Rodapé legal ── */
    html += '<div class="prnImpRodape">'
      + '<div class="prnImpAssinaturaLinha"></div>'
      + '<div class="prnImpProfNome">' + esc(nomeProfissional) + '</div>'
      + '<div class="prnImpProfConselho">' + conselho + (uf ? '-' + uf : '') + (numCons ? ' nº ' + numCons : '') + '</div>'
      + '<div class="prnImpLocalData">Data: ' + dataFmt + '</div>'
      + '</div>';

    doc.innerHTML = html;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     CONTROLE DE VISIBILIDADE
     ══════════════════════════════════════════════════════════════════════════ */
  function _mostrarBusca() {
    var busca   = sid('prnBuscaArea');
    var main    = sid('prnMain');
    var inp     = sid('prnBuscaInput');
    var drop    = sid('prnPacDrop');
    if (busca)  busca.style.display = 'flex';
    if (main)   main.style.display  = 'none';
    if (inp)    inp.value  = '';
    if (drop)   drop.style.display = 'none';
  }

  function _mostrarPrincipal() {
    var busca = sid('prnBuscaArea');
    var main  = sid('prnMain');
    if (busca) busca.style.display = 'none';
    if (main)  { main.style.display = 'flex'; main.style.flexDirection = 'column'; }
  }

  function fecharPaciente() {
    _pac  = null;
    _atd  = null;
    _lista  = [];
    _modelos = [];
    _meds   = [];
    var empty = sid('prnEmpty');
    var atdEl = sid('prnAtendimento');
    if (empty) empty.style.display = 'flex';
    if (atdEl) atdEl.style.display = 'none';
    _mostrarBusca();
  }

  /* ══════════════════════════════════════════════════════════════════════════
     API PÚBLICA
     ══════════════════════════════════════════════════════════════════════════ */
  return {
    init,
    buscarPaciente,
    selPacienteDrop,
    carregarPaciente,
    tlClick,
    novoAtendimento,
    abrirAtendimento,
    fecharPaciente,
    mudarAba,
    salvarEvolucao,
    injetarModelo,
    abrirSalvarModelo,
    fecharSalvarModelo,
    confirmarSalvarModelo,
    salvarExames,
    adicionarMedicamento,
    removerMedicamento,
    medInput,
    salvarReceituario,
    salvarAtestado,
    imprimir,
    calcularIdadeExata
  };
})();

/* ══════════════════════════════════════════════════════════════════════════════
   FIM ProntuarioMod
   ══════════════════════════════════════════════════════════════════════════════ */


