/* ═══════════════════════════════════════════════════════════════════════
   PAINEL DE CONTROLE CLÍNICO — js/modules/anamnese-odonto.js
   AnamneseMod: Anamnese Odontológica — Histórico + Formulário
   Depende de: supabase.js (_sb), main.js (sid, esc, toast, USER_PROFILE)

   SQL necessário no Supabase:
   CREATE TABLE anamnese_odonto (
     id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
     paciente_id      UUID REFERENCES pacientes(id) ON DELETE CASCADE,
     profissional_id  UUID REFERENCES perfis_usuarios(id),
     data_avaliacao   TIMESTAMPTZ DEFAULT now(),
     respostas        JSONB NOT NULL,
     observacoes      TEXT
   );
   ALTER TABLE anamnese_odonto ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "unit_access" ON anamnese_odonto USING (true);
═══════════════════════════════════════════════════════════════════════ */

const AnamneseMod = (function () {
  'use strict';

  var _pacienteId   = null;
  var _pacienteNome = '';
  var _historico    = [];
  var _readOnly     = false;
  var _salvando     = false;

  var PERGUNTAS = [
    { id: 'motivo_consulta', label: 'Qual o motivo da consulta?',                                           tipo: 'texto'         },
    { id: 'doenca_saude',    label: 'Sofre de alguma doença, ou algum problema de saúde? Se SIM, qual(is)?', tipo: 'sim_nao_texto' },
    { id: 'medicacao',       label: 'Está fazendo uso de alguma medicação? Se SIM, qual(is)?',               tipo: 'sim_nao_texto' },
    { id: 'alergia',         label: 'Já teve ou tem alguma alergia? Se SIM, qual(is)?',                      tipo: 'sim_nao_texto' },
    { id: 'anestesia',       label: 'Teve problemas com anestesia? Se SIM, qual(is)?',                       tipo: 'sim_nao_texto' },
    { id: 'cardiaco',        label: 'Sofre de problemas cardíacos? Se SIM, qual(is)?',                       tipo: 'sim_nao_texto' },
    { id: 'diabetes',        label: 'Tem diabetes? Se SIM, qual(is)?',                                       tipo: 'sim_nao_texto' },
    { id: 'habito',          label: 'Possui algum hábito? Se SIM, qual(is)?',                                tipo: 'sim_nao_texto' },
    { id: 'outras_info',     label: 'Outras informações:',                                                    tipo: 'textarea'      }
  ];

  /* ══════════════════════════════════════════════════════════════════
     ABRIR / FECHAR
  ══════════════════════════════════════════════════════════════════ */
  async function abrir(pacienteId, pacienteNome) {
    if (!pacienteId) {
      toast('Selecione um paciente antes de abrir a Anamnese.', 'warn');
      return;
    }
    _pacienteId   = pacienteId;
    _pacienteNome = pacienteNome || '';
    _readOnly     = false;

    var m = sid('modalAnamnese');
    if (!m) return;

    var nomEl = sid('anamPacNome');
    if (nomEl) nomEl.textContent = _pacienteNome;

    _renderForm(null);
    _atualizarBotaoSalvar();
    m.style.display = 'flex';

    await _carregarHistorico();
  }

  function fechar() {
    var m = sid('modalAnamnese');
    if (m) m.style.display = 'none';
    _pacienteId = null;
    _pacienteNome = '';
    _historico = [];
    _readOnly = false;
  }

  /* ══════════════════════════════════════════════════════════════════
     HISTÓRICO
  ══════════════════════════════════════════════════════════════════ */
  async function _carregarHistorico() {
    var sel = sid('anamSelectHistorico');
    if (sel) sel.innerHTML = '<option value="">Carregando...</option>';

    if (!_sb || !_pacienteId) { _renderSelectHistorico(); return; }

    var r = await _sb.from('anamnese_odonto')
      .select('id,data_avaliacao')
      .eq('paciente_id', _pacienteId)
      .order('data_avaliacao', { ascending: false });

    _historico = (r.data || []);
    _renderSelectHistorico();
  }

  function _renderSelectHistorico() {
    var sel = sid('anamSelectHistorico');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Nova Anamnese —</option>';
    _historico.forEach(function (h) {
      var d = new Date(h.data_avaliacao);
      var label = d.toLocaleDateString('pt-BR') + ' às '
        + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      sel.innerHTML += '<option value="' + h.id + '">' + label + '</option>';
    });
  }

  async function selecionarHistorico(id) {
    if (!id) {
      _readOnly = false;
      _renderForm(null);
      _atualizarBotaoSalvar();
      return;
    }
    if (!_sb) return;

    var r = await _sb.from('anamnese_odonto')
      .select('*').eq('id', id).single();

    if (r.error || !r.data) { toast('Erro ao carregar anamnese.', 'error'); return; }

    _readOnly = true;
    _renderForm(r.data.respostas);
    _atualizarBotaoSalvar();
    _bloquearForm();
  }

  /* ══════════════════════════════════════════════════════════════════
     RENDER FORM
  ══════════════════════════════════════════════════════════════════ */
  function _renderForm(respostas) {
    var body = sid('anamFormBody');
    if (!body) return;

    var html = '';

    PERGUNTAS.forEach(function (p) {
      var val = respostas ? (respostas[p.id] !== undefined ? respostas[p.id] : {}) : {};

      html += '<div class="anamPergunta">';
      html += '<div class="anamPergLabel">' + esc(p.label) + '</div>';

      if (p.tipo === 'texto') {
        var v = typeof val === 'string' ? val : '';
        html += '<input type="text" class="afInp anamInput" id="anam_' + p.id + '"'
          + ' value="' + esc(v) + '" placeholder="Descreva aqui..."/>';

      } else if (p.tipo === 'sim_nao_texto') {
        var radioSim = (val && val.resposta === 'SIM');
        var radioNao = (val && val.resposta === 'NAO');
        var txtVal   = (val && val.detalhe) ? val.detalhe : '';
        var showTxt  = radioSim ? '' : 'display:none';

        html += '<div class="anamRadioRow">';
        html += '<label class="anamRadioLabel">'
          + '<input type="radio" name="anam_' + p.id + '" value="SIM"'
          + ' onchange="AnamneseMod.toggleTexto(\'' + p.id + '\',true)"'
          + (radioSim ? ' checked' : '') + '>'
          + ' <span>SIM</span></label>';
        html += '<label class="anamRadioLabel">'
          + '<input type="radio" name="anam_' + p.id + '" value="NAO"'
          + ' onchange="AnamneseMod.toggleTexto(\'' + p.id + '\',false)"'
          + (radioNao ? ' checked' : '') + '>'
          + ' <span>NÃO</span></label>';
        html += '</div>';
        html += '<input type="text" class="afInp anamInput anamCondicional" id="anam_' + p.id + '_det"'
          + ' style="' + showTxt + '" value="' + esc(txtVal) + '" placeholder="Especifique..."/>';

      } else if (p.tipo === 'textarea') {
        var tv = typeof val === 'string' ? val : '';
        html += '<textarea class="afInp anamInput anamTextarea" id="anam_' + p.id + '"'
          + ' rows="3" placeholder="Descreva aqui...">' + esc(tv) + '</textarea>';
      }

      html += '</div>';
    });

    body.innerHTML = html;
  }

  function _bloquearForm() {
    var body = sid('anamFormBody');
    if (!body) return;
    body.querySelectorAll('input,textarea,select').forEach(function (el) {
      el.disabled = true;
    });
  }

  function _atualizarBotaoSalvar() {
    var btn = sid('anamBtnSalvar');
    if (!btn) return;
    btn.style.display = _readOnly ? 'none' : '';
  }

  /* ══════════════════════════════════════════════════════════════════
     INTERAÇÃO — TOGGLE TEXTO CONDICIONAL
  ══════════════════════════════════════════════════════════════════ */
  function toggleTexto(pergId, show) {
    var el = sid('anam_' + pergId + '_det');
    if (!el) return;
    el.style.display = show ? '' : 'none';
    if (!show) el.value = '';
    if (show) el.focus();
  }

  /* ══════════════════════════════════════════════════════════════════
     SALVAR
  ══════════════════════════════════════════════════════════════════ */
  async function salvar() {
    if (_salvando || _readOnly) return;
    if (!_pacienteId) { toast('Nenhum paciente selecionado.', 'warn'); return; }

    _salvando = true;
    var btn = sid('anamBtnSalvar');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    var respostas = {};
    PERGUNTAS.forEach(function (p) {
      if (p.tipo === 'texto') {
        var el = sid('anam_' + p.id);
        respostas[p.id] = el ? el.value.trim() : '';

      } else if (p.tipo === 'sim_nao_texto') {
        var radios = document.querySelectorAll('input[name="anam_' + p.id + '"]');
        var resposta = '';
        radios.forEach(function (r) { if (r.checked) resposta = r.value; });
        var det = sid('anam_' + p.id + '_det');
        respostas[p.id] = { resposta: resposta, detalhe: (det ? det.value.trim() : '') };

      } else if (p.tipo === 'textarea') {
        var ta = sid('anam_' + p.id);
        respostas[p.id] = ta ? ta.value.trim() : '';
      }
    });

    var profId = (USER_PROFILE && USER_PROFILE.id) ? USER_PROFILE.id : null;

    var r = await _sb.from('anamnese_odonto').insert({
      paciente_id:     _pacienteId,
      profissional_id: profId,
      respostas:       respostas
    });

    _salvando = false;
    if (btn) { btn.disabled = false; btn.textContent = '💾 Salvar'; }

    if (r.error) { toast('Erro ao salvar: ' + r.error.message, 'error'); return; }

    toast('Anamnese salva com sucesso!', 'success');

    await _carregarHistorico();

    var novo = _historico[0];
    if (novo) {
      var sel = sid('anamSelectHistorico');
      if (sel) sel.value = novo.id;
      await selecionarHistorico(novo.id);
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     IMPRIMIR
  ══════════════════════════════════════════════════════════════════ */
  function imprimir() {
    var win = window.open('', '_blank', 'width=700,height=900');
    if (!win) { toast('Habilite popups para imprimir.', 'warn'); return; }

    var linhas = '';
    PERGUNTAS.forEach(function (p) {
      var el = sid('anam_' + p.id);
      var det = sid('anam_' + p.id + '_det');
      var radios = document.querySelectorAll('input[name="anam_' + p.id + '"]');
      var resposta = '';
      radios.forEach(function (r) { if (r.checked) resposta = r.value === 'SIM' ? 'SIM' : 'NÃO'; });
      var detalhe = det ? det.value : '';
      var valor = el ? el.value : (resposta || '');

      linhas += '<tr>'
        + '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#334155">' + p.label + '</td>'
        + '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#0f172a">'
        + (resposta ? '<strong>' + resposta + '</strong>' + (detalhe ? ' — ' + detalhe : '') : valor || '—')
        + '</td></tr>';
    });

    var data = new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    win.document.write('<!DOCTYPE html><html><head><title>Anamnese Odontológica</title>'
      + '<meta charset="UTF-8">'
      + '<style>body{font-family:Arial,sans-serif;padding:30px;color:#0f172a}'
      + 'h2{color:#15803d;margin-bottom:4px}p{font-size:13px;color:#64748b;margin-bottom:20px}'
      + 'table{width:100%;border-collapse:collapse}th{background:#f1f5f9;padding:8px 10px;text-align:left;font-size:12px}'
      + '.assin{margin-top:60px;display:flex;gap:80px}'
      + '.assinLinha{border-top:1px solid #334155;padding-top:6px;font-size:12px;color:#64748b;min-width:200px}'
      + '</style></head><body>'
      + '<h2>Anamnese Odontológica</h2>'
      + '<p>Paciente: <strong>' + _pacienteNome + '</strong> &nbsp;|&nbsp; Data: ' + data + '</p>'
      + '<table><thead><tr><th>Pergunta</th><th>Resposta</th></tr></thead><tbody>' + linhas + '</tbody></table>'
      + '<div class="assin"><div class="assinLinha">Assinatura do Paciente</div>'
      + '<div class="assinLinha">Assinatura do Profissional</div></div>'
      + '</body></html>');

    win.document.close();
    setTimeout(function () { win.print(); }, 400);
  }

  return {
    abrir,
    fechar,
    selecionarHistorico,
    toggleTexto,
    salvar,
    imprimir
  };
})();
