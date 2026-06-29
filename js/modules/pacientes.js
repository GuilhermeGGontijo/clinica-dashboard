/* ═══════════════════════════════════════════════════════════════════════
   PAINEL DE CONTROLE CLÍNICO — js/modules/pacientes.js
   Módulo de cadastro e gestão de pacientes
   Depende de: supabase.js (_sb, UNITS), main.js (sid, esc, toast, CU, USER_ROLE)
═══════════════════════════════════════════════════════════════════════ */

var _patSearch = '';
var _patPage = 0;

async function renderPacientes(){
  var wrap = sid('patWrap');
  if(!wrap) return;
  var pl = sid('patUnitLabel');
  if(pl) pl.textContent = (UNITS.find(function(u){return u.id===CU;})||UNITS[0]).name;
  wrap.innerHTML = '<div class="patEmpty">⏳ Carregando...</div>';
  try {
    var q = _sb.from('pacientes')
      .select('id,nome_completo,cpf,celular,data_nascimento,sexo_biologico,unidade_id')
      .eq('ativo',true)
      .order('nome_completo');
    if(USER_ROLE==='recepcionista'||USER_ROLE==='profissional_saude') q=q.eq('unidade_id',CU);
    if(_patSearch){
      if(/^\d/.test(_patSearch)) q=q.ilike('cpf','%'+_patSearch.replace(/\D/g,'')+'%');
      else q=q.ilike('nome_completo','%'+_patSearch+'%');
    }
    var {data,error} = await q.range(_patPage*20,_patPage*20+19);
    if(error) throw error;
    _renderPatList(data||[]);
  } catch(e){
    wrap.innerHTML='<div class="patEmpty" style="color:var(--r6)">⚠️ Erro: '+esc(e.message)+'</div>';
  }
}

function _renderPatList(list){
  var wrap = sid('patWrap');
  if(!list.length){
    wrap.innerHTML='<div class="patEmpty">Nenhum paciente'+(_patSearch?' encontrado para "'+esc(_patSearch)+'"':' cadastrado nesta unidade')+'.<br><small>Clique em <strong>➕ Novo Paciente</strong> para começar.</small></div>';
    return;
  }
  wrap.innerHTML = list.map(function(p){
    var idade = _calcIdade(p.data_nascimento);
    var un = (UNITS.find(function(u){return u.id===p.unidade_id;})||{name:p.unidade_id}).name;
    return '<div class="patCard">'+
      '<div class="patCardMain">'+
        '<div class="patCardAvatar">'+(p.sexo_biologico==='F'?'👩':'👨')+'</div>'+
        '<div class="patCardInfo">'+
          '<div class="patCardName">'+esc(p.nome_completo)+'</div>'+
          '<div class="patCardMeta">CPF: '+_fmtCPF(p.cpf)+' &middot; '+idade+' anos &middot; '+(p.sexo_biologico==='F'?'Feminino':'Masculino')+'</div>'+
          '<div class="patCardMeta">📱 '+_fmtFone(p.celular)+' &middot; 🏢 '+esc(un)+'</div>'+
        '</div>'+
      '</div>'+
      '<div class="patCardActions">'+
        '<button class="btn bG bSm" data-pid="'+p.id+'" onclick="editPaciente(this.dataset.pid)">✏️ Editar</button>'+ 
        (USER_ROLE==='administrador'?'<button class="btn bSm" style="background:var(--r1);color:var(--r7)" data-pid="'+p.id+'" data-pnome="'+esc(p.nome_completo)+'" onclick="desativarPaciente(this.dataset.pid,this.dataset.pnome)" title="Desativar">🗑</button>':'')+
      '</div>'+
    '</div>';
  }).join('');
}

var _editingPatId = null;

function abrirFormPaciente(id){
  _editingPatId = id||null;
  _limpaFormPaciente();
  var sel = sid('patFormUnidade');
  if(sel) sel.innerHTML = UNITS.map(function(u){return '<option value="'+u.id+'">'+esc(u.name)+'</option>';}).join('');
  if(id){
    sid('patModalTitle').textContent='✏️ Editar Paciente';
    _sb.from('pacientes').select('*').eq('id',id).single().then(function(r){
      if(r.data) _preencheFormPaciente(r.data);
    });
  } else {
    sid('patModalTitle').textContent='➕ Novo Paciente';
    if(sel) sel.value=CU;
  }
  sid('patFormErr').textContent='';
  sid('patModal').classList.add('open');
}

function editPaciente(id){ abrirFormPaciente(id); }

function fecharFormPaciente(){
  sid('patModal').classList.remove('open');
  _editingPatId=null;
}

function _preencheFormPaciente(d){
  var fi=function(id,v){var e=sid(id);if(e&&v!=null)e.value=v;};
  fi('patNome',d.nome_completo);fi('patNascimento',d.data_nascimento);
  fi('patCPF',_fmtCPF(d.cpf));fi('patCelular',_fmtFone(d.celular));
  fi('patSexo',d.sexo_biologico);fi('patGenero',d.genero);fi('patNomeMae',d.nome_mae);
  fi('patEmail',d.email);fi('patCEP',d.cep?d.cep.replace(/(\d{5})(\d{3})/,'$1-$2'):'');
  fi('patLogradouro',d.logradouro);fi('patNumero',d.numero);fi('patComplemento',d.complemento);
  fi('patBairro',d.bairro);fi('patCidade',d.cidade);fi('patUF',d.uf);
  fi('patFormUnidade',d.unidade_id);
}

function _limpaFormPaciente(){
  ['patNome','patNascimento','patCPF','patCelular','patSexo','patGenero','patNomeMae',
   'patEmail','patCEP','patLogradouro','patNumero','patComplemento','patBairro','patCidade','patUF']
  .forEach(function(id){var e=sid(id);if(e)e.value='';});
}

async function savePaciente(){
  var btn=sid('patSaveBtn');
  var errEl=sid('patFormErr');
  errEl.textContent='';
  var cpfRaw=(sid('patCPF').value||'').replace(/\D/g,'');
  var celRaw=(sid('patCelular').value||'').replace(/\D/g,'');
  var payload={
    nome_completo:(sid('patNome').value||'').trim(),
    data_nascimento:sid('patNascimento').value||null,
    cpf:cpfRaw, celular:celRaw,
    sexo_biologico:sid('patSexo').value,
    genero:(sid('patGenero').value||'').trim()||null,
    nome_mae:(sid('patNomeMae').value||'').trim()||null,
    email:(sid('patEmail').value||'').trim()||null,
    cep:(sid('patCEP').value||'').replace(/\D/g,'')||null,
    logradouro:(sid('patLogradouro').value||'').trim()||null,
    numero:(sid('patNumero').value||'').trim()||null,
    complemento:(sid('patComplemento').value||'').trim()||null,
    bairro:(sid('patBairro').value||'').trim()||null,
    cidade:(sid('patCidade').value||'').trim()||null,
    uf:(sid('patUF').value||'')||null,
    unidade_id:sid('patFormUnidade').value||CU,
  };
  if(!payload.nome_completo){errEl.textContent='Nome completo é obrigatório.';return;}
  if(!payload.data_nascimento){errEl.textContent='Data de nascimento é obrigatória.';return;}
  if(cpfRaw.length!==11){errEl.textContent='CPF inválido — informe os 11 dígitos.';return;}
  if(celRaw.length<10){errEl.textContent='Celular inválido.';return;}
  if(!payload.sexo_biologico){errEl.textContent='Sexo biológico é obrigatório.';return;}
  btn.textContent='Salvando...'; btn.disabled=true;
  try {
    var r;
    if(_editingPatId){
      payload.atualizado_em=new Date().toISOString();
      r=await _sb.from('pacientes').update(payload).eq('id',_editingPatId);
    } else {
      var sess=await _sb.auth.getUser();
      payload.cadastrado_por=sess&&sess.data&&sess.data.user?sess.data.user.id:null;
      r=await _sb.from('pacientes').insert(payload);
    }
    if(r.error) throw r.error;
    toast(_editingPatId?'✅ Paciente atualizado!':'✅ Paciente cadastrado com sucesso!','');
    fecharFormPaciente();
    renderPacientes();
  } catch(e){
    var msg=e.message||'';
    errEl.textContent='Erro: '+(msg.includes('duplicate')||msg.includes('unique')?'Este CPF já está cadastrado.':msg);
  } finally {
    btn.textContent='💾 Salvar Paciente'; btn.disabled=false;
  }
}

async function desativarPaciente(id,nome){
  if(!confirm('Desativar o cadastro de "'+nome+'"?\nO paciente ficará oculto mas não será excluído.')) return;
  var {error}=await _sb.from('pacientes').update({ativo:false,atualizado_em:new Date().toISOString()}).eq('id',id);
  if(error){toast('Erro: '+error.message,'err');return;}
  toast('Paciente desativado.','');
  renderPacientes();
}

async function buscarCEP(v){
  var c=(v||'').replace(/\D/g,'');
  if(c.length!==8) return;
  try{
    var r=await fetch('https://viacep.com.br/ws/'+c+'/json/');
    var d=await r.json();
    if(d.erro){toast('CEP não encontrado.','err');return;}
    var fi=function(id,val){var e=sid(id);if(e)e.value=val||'';};
    fi('patLogradouro',d.logradouro);fi('patBairro',d.bairro);fi('patCidade',d.localidade);fi('patUF',d.uf);
    sid('patNumero')&&sid('patNumero').focus();
  }catch(e){console.warn('ViaCEP erro:',e);}
}

/* Helpers de formatação — prefixo _ para não colidir com existentes */
function _fmtCPF(s){var c=(s||'').replace(/\D/g,'');if(c.length>11)c=c.slice(0,11);if(c.length===11)return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4');return c.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2');}
function _fmtFone(s){var c=(s||'').replace(/\D/g,'');if(c.length===11)return c.replace(/(\d{2})(\d{5})(\d{4})/,'($1) $2-$3');return c.replace(/(\d{2})(\d{4})(\d{4})/,'($1) $2-$3');}
function _fmtFoneI(s){var c=(s||'').replace(/\D/g,'');if(c.length>11)c=c.slice(0,11);if(c.length<=10)return c.replace(/(\d{2})(\d{4})(\d{0,4})/,'($1) $2-$3').replace(/-$/,'');return c.replace(/(\d{2})(\d{5})(\d{0,4})/,'($1) $2-$3').replace(/-$/,'');}
function _fmtCEP(s){var c=(s||'').replace(/\D/g,'').slice(0,8);return c.replace(/(\d{5})(\d{0,3})/,'$1-$2').replace(/-$/,'');}
function _calcIdade(d){if(!d)return'?';var h=new Date(),n=new Date(d),a=h.getFullYear()-n.getFullYear();var m=h.getMonth()-n.getMonth();if(m<0||(m===0&&h.getDate()<n.getDate()))a--;return a;}
