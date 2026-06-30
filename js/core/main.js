/* ═══════════════════════════════════════════════════════════════════════
   PAINEL DE CONTROLE CLÍNICO — js/core/main.js
   Núcleo da aplicação: persistência, navegação, utilidades, inicialização
   Carregado POR ÚLTIMO — todos os módulos já estão disponíveis globalmente
═══════════════════════════════════════════════════════════════════════ */

async function supaSet(key, value) {
  try {
    const {data:{session}} = await _sb.auth.getSession();
    if (!session) return;
    const {error} = await _sb.from('clinica_dados').upsert(
      {chave: key, valor: value, atualizado_em: new Date().toISOString()},
      {onConflict: 'chave'}
    );
    if (error) console.warn('supaSet erro:', error.message);
  } catch(e) { console.warn('Supabase sync erro:', e); }
}

async function supaLoad() {
  try {
    const {data:{session}} = await _sb.auth.getSession();
    if (!session) return;
    const {data: rows, error} = await _sb.from('clinica_dados').select('chave,valor');
    if (error) { console.warn('supaLoad erro:', error.message); return; }
    if (Array.isArray(rows) && rows.length > 0) {
      rows.forEach(function(row) {
        if (row.chave && row.valor !== undefined) {
          try { localStorage.setItem(row.chave, JSON.stringify(row.valor)); } catch(e) {}
        }
      });
      console.log('Supabase: '+rows.length+' registros carregados.');
    }
  } catch(e) { console.warn('Supabase load erro:', e); }
}

function lsGet(key,def){
  if(!LS) return (_ram[key]!==undefined?_ram[key]:def);
  try{const v=localStorage.getItem(key);return v!==null?JSON.parse(v):def;}catch{return def;}
}
function lsSet(key,val){
  if(!LS){_ram[key]=val;flash();return true;}
  try{
    localStorage.setItem(key,JSON.stringify(val));
    if(SUPA_PREFIX.some(function(p){return key===p||key.startsWith(p);})){
      supaSet(key,val);
    }
    flash();return true;
  }catch(e){toast('Erro ao salvar: '+e.message,'err');return false;}
}

let CU = lsGet('cf_activeUnit','u1');
if(!UNITS.find(u=>u.id===CU)) CU='u1';

/* Chaves — funções (mudam com CU) */
function KG(){ return 'tabelaPrecos_'+CU; }
function KL(){ return 'cfv4_lanc_'+CU; }
function KD(){ return 'cfv4_data_'+CU; }
function KA(){ return 'agendaFixa_'+CU; }
function KC(){ return 'agendaCfg_'+CU; }   // configuração de horários

function ldG(){ return lsGet(KG(),[]); }
function ldL(){ return lsGet(KL(),{}); }
function ldD(){ return lsGet(KD(),{}); }
function ldA(){ return lsGet(KA(),{}); }
function ldC(){ return lsGet(KC(),{start:8,end:18}); }
function svG(a){ lsSet(KG(),a); FinDb.saveServicos(CU,a); return true; }
function svL(o){ lsSet(KL(),o); FinDb.saveLancamentos(CU,o); return true; }
function svD(o){ if(lsSet(KD(),o)){stamp(); FinDb.saveKpis(CU,o); return true;} return false; }
function svA(o){ lsSet(KA(),o); FinDb.saveAgendaFixa(CU,o); return true; }
function svC(o){ lsSet(KC(),o); FinDb.saveAgendaConfig(CU,o); return true; }

function getLancM(m){ const a=ldL();return a[m]||{}; }
function setLancM(m,d){ const a=ldL();a[m]=d;return svL(a); }

function stamp(){const d=new Date();sid('stampTxt').textContent=`Atualizado: ${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`;}
function flash(){const el=sid('saveInd');el.classList.add('on');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('on'),3000);}

/* ══════════════════════════════════════
   INIT
══════════════════════════════════════ */
let _agFilter='all';
let _prevMonth=null;

/* ══════════════════════════════════════
   ROLES E PERMISSÕES
══════════════════════════════════════ */
var USER_ROLE = null;
var USER_PROFILE = null;

/* ══════════════════════════════════════
   SIDEBAR NAVIGATION
══════════════════════════════════════ */
function switchSidebar(mod){
  // Atualiza classes do body
  var keep = document.body.className.split(' ')
    .filter(function(c){ return c && !c.startsWith('sb-') && c!=='mode-gestao' && c!=='mode-pacientes'; });
  keep.push('sb-active','sb-'+mod);
  // Compatibilidade com sistema antigo
  if(mod==='pacientes'){ keep.push('mode-pacientes'); } else { keep.push('mode-gestao'); }
  document.body.className = keep.join(' ');

  // Ativa item no sidebar
  document.querySelectorAll('.sbItem[data-mod],.sbSubItem[data-mod]').forEach(function(el){
    el.classList.toggle('active', el.dataset.mod === mod || el.dataset.mod === mod.split('-')[0]);
  });

  // Label da unidade no sidebar e home
  var u = UNITS.find(function(u2){return u2.id===CU;}) || UNITS[0];
  var sl=sid('sbUnitLabel'); if(sl) sl.textContent=u.name;
  var hl=sid('homeUnitLabel'); if(hl) hl.textContent=u.name;

  // Lógica específica por módulo
  if(mod==='pacientes'){
    _currentModule='pacientes';
    renderPacientes();
  } else {
    _currentModule='gestao';
    renderModuleTabs();
  }

  closeSidebarPanel();
  window.scrollTo(0,0);

  // Inicializar módulos conforme ativado
  if(mod==='agenda'){      setTimeout(function(){ AgendaMod.init();     },50); }
  if(mod==='prontuario'){ setTimeout(function(){ ProntuarioMod.init(); },50); }
  if(mod==='admin-salas'){ setTimeout(function(){ SalasMod.init(); },50); }
  if(mod==='admin-atendimentos'){ setTimeout(function(){
    var u=(typeof UNITS!=='undefined'?UNITS:[]).find(function(x){return x.id===CU;});
    var el=sid('atdUnitLabel'); if(el) el.textContent=u?u.name:CU;
    AtendMod.init();
  },50); }
  if(mod==='admin-recepcao'){ setTimeout(function(){ RecepMod.init(); },50); }
  if(mod==='admin-convenios'){ setTimeout(function(){ ConveniosMod.init(); },50); }
  if(mod==='recebimentos'){ setTimeout(function(){ RecebMod.init(); },50); }
}

function toggleSbGroup(el,grpId){
  var sub=sid(grpId);
  if(!sub) return;
  sub.classList.toggle('open');
  var chev=el.querySelector('.sbItemChev');
  if(chev) chev.style.transform=sub.classList.contains('open')?'':'rotate(-90deg)';
}

function showSidebar(){
  // Ativa o modo sidebar (oculta moduleNav, ativa sb-* classes)
  document.body.classList.add('sidebar-open');
  // Copia logo para sidebar se disponível
  if(LOGO_URL){
    var sl=sid('sbLogoEl');
    if(sl) sl.innerHTML='<img src="'+LOGO_URL+'" alt="Logo" style="height:36px;width:auto;border-radius:6px;display:block;"/>';
  }
}

var _sbOpenTimer=null;
function openSidebarPanel(){
  if(_sbOpenTimer) clearTimeout(_sbOpenTimer);
  _sbOpenTimer=setTimeout(function(){
    var sb=sid('sidebar'); if(sb) sb.classList.add('visible');
    var bd=sid('sbBackdrop'); if(bd) bd.classList.add('visible');
  },120);
}
function closeSidebarPanel(){
  if(_sbOpenTimer){ clearTimeout(_sbOpenTimer); _sbOpenTimer=null; }
  var sb=sid('sidebar'); if(sb) sb.classList.remove('visible');
  var bd=sid('sbBackdrop'); if(bd) bd.classList.remove('visible');
}

async function loadUserProfile(){
  try {
    var sess = await _sb.auth.getUser();
    var uid = sess && sess.data && sess.data.user ? sess.data.user.id : null;
    if(!uid){ USER_ROLE='administrador'; return; }
    var res = await _sb.from('perfis_usuarios').select('*').eq('id',uid).single();
    if(res.error || !res.data){
      USER_ROLE='administrador'; USER_PROFILE=null;
      return;
    }
    USER_ROLE = res.data.role;
    USER_PROFILE = res.data;
  } catch(e){
    USER_ROLE='administrador'; USER_PROFILE=null;
    console.warn('loadUserProfile erro:',e);
  }
}

function applyRoleVisibility(){
  document.body.classList.remove('role-administrador','role-faturamento','role-profissional_saude','role-recepcionista');
  if(USER_ROLE) document.body.classList.add('role-'+USER_ROLE);
  renderModuleTabs();
}

/* ══════════════════════════════════════
   NAVEGAÇÃO DE MÓDULOS
══════════════════════════════════════ */
var _currentModule = 'gestao';

function renderModuleTabs(){
  var nav = sid('moduleNav');
  if(!nav) return;
  var inner = nav.querySelector('.mnIn');
  if(!inner) return;
  var tabs = [
    {id:'gestao', label:'📊 Gestão', roles:['administrador','faturamento','profissional_saude','recepcionista']},
    {id:'pacientes', label:'👥 Pacientes', roles:['administrador','profissional_saude','recepcionista']},
  ];
  inner.innerHTML = tabs
    .filter(function(t){ return !USER_ROLE || t.roles.indexOf(USER_ROLE)>=0; })
    .map(function(t){
      return '<button class="mnTab'+(_currentModule===t.id?' active':'')+'" data-mod="'+t.id+'" onclick="switchModule(this.dataset.mod)">'+t.label+'</button>';
    }).join('');
}

function switchModule(mod){
  _currentModule = mod;
  document.body.classList.remove('mode-gestao','mode-pacientes');
  document.body.classList.add('mode-'+mod);
  renderModuleTabs();
  if(mod==='pacientes') renderPacientes();
  window.scrollTo(0,0);
}

(async function init(){
  /* ── MODO RECUPERAÇÃO DE SENHA ── */
  const _hParams = new URLSearchParams(window.location.hash.replace(/^#/,''));
  if(_hParams.get('type')==='recovery'){
    /* Supabase já processou o token via createClient — mostra form de nova senha */
    const ll = document.getElementById('loginOverlay');
    if(ll) ll.innerHTML = '<div id="loginBox">'
      + '<div id="loginLogo">'+(LOGO_URL?'<img src="'+LOGO_URL+'" alt="Logo" style="height:64px;width:auto;border-radius:8px;margin:0 auto;display:block;"/>':'🏥')+'</div>'
      + '<h2>Clínica da Família</h2>'
      + '<p>Defina sua nova senha</p>'
      + '<div class="lFieldWrap"><input class="lField" type="password" id="newPass1" placeholder="Nova senha (mín. 6 caracteres)" autocomplete="new-password"/><button class="eyeBtn" type="button" onclick="togglePass(\'newPass1\',this)" title="Mostrar/ocultar">👁</button></div>'
      + '<div class="lFieldWrap"><input class="lField" type="password" id="newPass2" placeholder="Confirme a nova senha" autocomplete="new-password"/><button class="eyeBtn" type="button" onclick="togglePass(\'newPass2\',this)" title="Mostrar/ocultar">👁</button></div>'
      + '<button id="loginBtn" onclick="doPasswordReset()">Salvar senha</button>'
      + '<div id="loginErr"></div>'
      + '</div>';
    return;
  }

  /* Verifica sessão — só renderiza se autenticado */
  const {data:{session}} = await _sb.auth.getSession();
  if (!session) {
    /* Não logado: apenas mostra o overlay de login, entra por doLogin() */
    /* Logo na tela de login */
    if(LOGO_URL){const ll=document.getElementById('loginLogo');if(ll){ll.style.fontSize='0';ll.innerHTML='<img src="'+LOGO_URL+'" alt="Logo" style="height:64px;width:auto;border-radius:8px;margin:0 auto;display:block;"/>';}}
    return;
  }
  document.getElementById('loginOverlay').style.display = 'none';
  /* Oculta imediatamente todo conteúdo de main enquanto carrega dados */
  document.body.classList.add('sb-active');
  /* 1. Carrega dados financeiros da tabela dedicada (financeiro_dados) */
  await FinDb.loadAll();
  /* 2. Carrega demais chaves do backup genérico (clinica_dados) */
  await supaLoad();
  /* 3. Migra dados do localStorage → financeiro_dados se a tabela estiver vazia */
  FinDb.migrarSeVazio();
  await loadUserProfile(); applyRoleVisibility();
  showSidebar(); switchSidebar('home');
  /* Logo — header e tela de login */
  if(LOGO_URL){
    const le=document.getElementById('bLogoEl');
    if(le)le.innerHTML='<img src="'+LOGO_URL+'" alt="Logo"/>';
    const ll=document.getElementById('loginLogo');
    if(ll){ll.style.fontSize='0';ll.innerHTML='<img src="'+LOGO_URL+'" alt="Logo" style="height:64px;width:auto;border-radius:8px;margin:0 auto;display:block;"/>';}
  }
  /* Popula abas de unidades */
  renderUnitTabs();
  updateUnitDisplay();

  /* Popula selects de horário da agenda */
  const startSel=sid('agStart');
  const endSel=sid('agEnd');
  for(let h=5;h<=14;h++){const o=document.createElement('option');o.value=String(h);o.textContent=pad(h)+':00';startSel.appendChild(o);}
  for(let h=10;h<=23;h++){const o=document.createElement('option');o.value=String(h);o.textContent=pad(h)+':00';endSel.appendChild(o);}
  const _c0=ldC();
  if(!parseInt(_c0.start)||!parseInt(_c0.end)||parseInt(_c0.start)>=parseInt(_c0.end)-1){svC({start:7,end:18});}
  loadAgConfig();
  populateFormHours();

  /* Mês atual */
  const n=new Date();
  sid('mPicker').value=`${n.getFullYear()}-${pad(n.getMonth()+1)}`;
  _prevMonth=sid('mPicker').value;

  renderGlobal();
  renderLanc();
  renderAgenda();
  renderAll();
  onMonthChange();
  loadMetaAbs();

  /* ── AUTO-SAVE a cada 30 segundos ── */
  setInterval(function(){
    _sb.auth.getSession().then(function(r){
      if(!r.data||!r.data.session) return;
      var saved=0;
      for(var i=0;i<localStorage.length;i++){
        var k=localStorage.key(i);
        if(!k) continue;
        if(SUPA_PREFIX.some(function(p){return k===p||k.startsWith(p);})){
          try{ supaSet(k,JSON.parse(localStorage.getItem(k))); saved++; }catch(e){}
        }
      }
      if(saved>0){
        var ind=document.getElementById('saveInd');
        if(ind){ind.textContent='💾 Auto-salvo';ind.classList.add('on');clearTimeout(ind._at);ind._at=setTimeout(function(){ind.classList.remove('on');ind.textContent='✅ Salvo';},3000);}
      }
    });
  }, 30000);

  /* Auto-calcular KPI cards quando inputs mudam */
  document.querySelectorAll('.cInps input:not([readonly])').forEach(function(inp){
    inp.addEventListener('input',function(){ const d=getInputs();updateCards(calc(d),d); });
  });
})();

/* ══════════════════════════════════════
   SELETOR DE UNIDADE
══════════════════════════════════════ */
function renderUnitTabs(){
  const container=sid('unitTabs');
  if(!container) return;
  container.innerHTML='';
  UNITS.forEach(u=>{
    const btn=document.createElement('button');
    btn.className='unitTab'+(u.id===CU?' active':'');
    btn.textContent=u.name;
    btn.onclick=()=>onUnitChange(u.id);
    container.appendChild(btn);
  });
}
function onUnitChange(nu){
  if(nu===CU) return;
  CU=nu;
  lsSet('cf_activeUnit',CU);
  renderUnitTabs();
  updateUnitDisplay();
  clearKPIInputs();
  resetCardValues();
  syncFooter({fat:0,rep:0,cli:0});
  syncMod3Auto({fat:0,rep:0});
  sid('mStatus').textContent=''; sid('mStatus').className='';
  _agFilter='all';
  ['afAll','afS1','afS2','afS3'].forEach((id,i)=>{const el=sid(id);if(el)el.classList.toggle('active',i===0);});
  loadAgConfig();
  populateFormHours();
  renderGlobal();
  renderLanc();
  renderAgenda();
  renderAll();
  onMonthChange();
  loadMetaAbs();
  toast('🏢 '+UNITS.find(u=>u.id===CU).name+' carregada','');
  renderComparativo();
}
function updateUnitDisplay(){
  const u=UNITS.find(u=>u.id===CU)||UNITS[0];
  sid('hUnitName').textContent=u.name;
  const _pl=sid('patUnitLabel'); if(_pl) _pl.textContent=u.name;
  const _sl=sid('sbUnitLabel'); if(_sl) _sl.textContent=u.name;
  const _hl=sid('homeUnitLabel'); if(_hl) _hl.textContent=u.name;
}

/* ══════════════════════════════════════
   CADASTRO GLOBAL
══════════════════════════════════════ */


/* ══════════════════════════════════════
   BACKUP — EXPORTAR / IMPORTAR
══════════════════════════════════════ */
function exportBackup(){
  if(!LS){toast('localStorage indisponível neste modo. Backup não suportado.','err');return;}
  const backup={};
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    try{backup[k]=JSON.parse(localStorage.getItem(k));}
    catch{backup[k]=localStorage.getItem(k);}
  }
  const json=JSON.stringify(backup,null,2);
  const blob=new Blob([json],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`backup_clinica_familia_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('📤 Backup exportado com sucesso!','');
}

function importBackup(ev){
  const file=ev.target.files[0];
  if(!file)return;
  const reader=new FileReader();
  reader.onload=function(e){
    if(!confirm(
      'ATENÇÃO: Importar um backup irá apagar e substituir TODOS os dados atuais do seu navegador.\n\n'+
      'Esse processo não pode ser desfeito.\n\nTem certeza que deseja continuar?'
    )){sid('importFile').value='';return;}
    try{
      const data=JSON.parse(e.target.result);
      localStorage.clear();
      Object.entries(data).forEach(([k,v])=>{
        localStorage.setItem(k,typeof v==='string'?v:JSON.stringify(v));
      });
      window.location.reload();
    }catch(err){
      toast('❌ Arquivo inválido: '+err.message,'err');
      sid('importFile').value='';
    }
  };
  reader.readAsText(file);
}

/* ══════════════════════════════════════
   UTILS
══════════════════════════════════════ */
function getMonth(){return sid('mPicker').value;}
function shiftMonth(delta){
  const mp=sid('mPicker');
  if(!mp.value){
    const n=new Date();
    mp.value=`${n.getFullYear()}-${pad(n.getMonth()+1)}`;
  }
  const [y,m]=mp.value.split('-').map(Number);
  const d=new Date(y,m-1+delta,1);
  mp.value=`${d.getFullYear()}-${pad(d.getMonth()+1)}`;
  onMonthChange();
}
function fmt(k){const[y,m]=k.split('-');return['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][+m-1]+'/'+y;}
function brl(v){return v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});}
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function pad(n){return String(n).padStart(2,'0');}
function sid(id){return document.getElementById(id);}
let _tt;
function toast(msg,type){const el=sid('toast');el.textContent=msg;el.className='on'+(type?' '+type:'');clearTimeout(_tt);_tt=setTimeout(()=>el.className='',3500);}

/* ══════════════════════════════════════
   META DE ABSENTEÍSMO
══════════════════════════════════════ */
function getMetaAbs(){ return parseFloat(lsGet('cfv4_meta_abs',10))||10; }
function saveMetaAbs(v){
  var val=parseFloat(v);
  if(!isNaN(val)&&val>=0){ lsSet('cfv4_meta_abs',val); FinDb.saveMeta(val); }
  var d=getInputs(); updateCards(calc(d),d);
}
function loadMetaAbs(){
  var el=sid('i_metaAbs');
  if(el){ var v=getMetaAbs(); el.value=(v!=null&&!isNaN(v))?v:''; }
}

/* ══════════════════════════════════════
   OCUPAÇÃO DAS SALAS (agenda)
══════════════════════════════════════ */
function calcRoomOccupancy(agendaData,agHours){
  var totalSlots=agHours.length*AG_DAYS.length*3;
  var occ=0;
  AG_DAYS.forEach(function(day){
    agHours.forEach(function(hr){
      var key=day+'-'+hr;
      var cd=agendaData[key]||{};
      [1,2,3].forEach(function(n){
        var rm=cd['s'+n]||{};
        if(rm.proc||rm.prof||rm.bloq) occ++;
      });
    });
  });
  return totalSlots>0?(occ/totalSlots)*100:null;
}

/* ══════════════════════════════════════
   COMPARATIVO ENTRE UNIDADES
══════════════════════════════════════ */
function renderComparativo(){
  var month=getMonth();
  var lbl=sid('compMesLabel');
  var loading=sid('compLoading');
  var grid=sid('compGrid');
  if(!loading||!grid) return;
  if(!month){
    loading.style.display='block';
    loading.textContent='Selecione um mês acima para ver o comparativo entre unidades.';
    grid.style.display='none';
    if(lbl) lbl.textContent='selecione um mês';
    return;
  }
  if(lbl) lbl.textContent=fmt(month);

  var unitsData=UNITS.map(function(u){
    var services=lsGet('tabelaPrecos_'+u.id,[]);
    var lancAll=lsGet('cfv4_lanc_'+u.id,{});
    var dataAll=lsGet('cfv4_data_'+u.id,{});
    var agendaData=lsGet('agendaFixa_'+u.id,{});
    var agCfg=lsGet('agendaCfg_'+u.id,{start:7,end:18});
    var lancM=lancAll[month]||{};
    var kpiM=dataAll[month]||{};
    var sMap={};
    services.forEach(function(s){ sMap[s.id]=s; });
    var fat=0,rep=0;
    Object.entries(lancM).forEach(function(e2){
      var s=sMap[parseInt(e2[0])];
      if(s&&e2[1]>0){ fat+=e2[1]*s.valor; rep+=e2[1]*s.valor*(s.perc/100); }
    });
    var d=Object.assign({},kpiM,{fat:fat,rep:rep});
    var k=calc(d);
    var st2=parseInt(agCfg.start)||7, en2=parseInt(agCfg.end)||18;
    var agH=[];
    for(var h2=st2;h2<en2;h2++) agH.push(pad(h2));
    var occPct=calcRoomOccupancy(agendaData,agH);
    var hasData=fat>0||d.agend>0||d.faltas>0||d.exC>0||d.cus>0||d.pac>0;
    return{u:u,d:d,k:k,occPct:occPct,hasData:hasData};
  });

  var anyData=unitsData.some(function(x){return x.hasData;});
  if(!anyData){
    loading.style.display='block';
    loading.textContent='Nenhuma unidade tem dados para '+fmt(month)+'. Insira dados e clique em Salvar Mês.';
    grid.style.display='none';
    return;
  }
  loading.style.display='none';
  grid.style.display='grid';
  grid.style.gridTemplateColumns='repeat('+UNITS.length+',1fr)';

  var maxFat=Math.max.apply(null,unitsData.map(function(x){return x.d.fat||0;}));
  var minAbs=Infinity;
  unitsData.forEach(function(x){if(x.k.absent!=null&&x.k.absent<minAbs) minAbs=x.k.absent;});
  var maxLucro=-Infinity;
  unitsData.forEach(function(x){if(x.k.lucro!=null&&x.k.lucro>maxLucro) maxLucro=x.k.lucro;});
  var meta=getMetaAbs();
  var absCount=unitsData.filter(function(x){return x.k.absent!=null;}).length;
  var lucroCount=unitsData.filter(function(x){return x.k.lucro!=null;}).length;

  var html='';
  unitsData.forEach(function(x){
    var isBestFat=x.d.fat>0&&x.d.fat===maxFat&&maxFat>0;
    var isBestAbs=x.k.absent!=null&&x.k.absent===minAbs&&absCount>1;
    var isBestLucro=x.k.lucro!=null&&x.k.lucro===maxLucro&&maxLucro>-Infinity&&lucroCount>1;
    html+='<div class="compUnit'+(isBestFat?' compBest':'')+'">';
    html+='<div class="compUnitName">'+(isBestFat?'🏆 ':'🏢 ')+esc(x.u.name)+'</div>';
    if(!x.hasData){
      html+='<div class="compNoData">Sem dados este mês</div>';
    } else {
      html+='<div class="compRow"><span class="compLabel">💰 Faturamento</span><span class="compVal'+(x.d.fat>0?' green':'')+'">'+( x.d.fat>0?'R$&nbsp;'+brl(x.d.fat):'—')+'</span></div>';
      var lc=x.k.lucro!=null?(x.k.lucro>=0?' green':' red'):'';
      html+='<div class="compRow"><span class="compLabel">📈 Lucro Líq.</span><span class="compVal'+lc+'">'+( x.k.lucro!=null?'R$&nbsp;'+brl(x.k.lucro):'—')+(isBestLucro?'<span class="compBadge bG1">🥇</span>':'')+'</span></div>';
      var ac=x.k.absent!=null?(x.k.absent<=meta?' green':x.k.absent<=meta*2?' amber':' red'):'';
      html+='<div class="compRow"><span class="compLabel">🚫 Absenteísmo</span><span class="compVal'+ac+'">'+( x.k.absent!=null?x.k.absent.toFixed(1)+'%':'—')+(isBestAbs?'<span class="compBadge bG1">✅</span>':'')+'</span></div>';
      html+='<div class="compRow"><span class="compLabel">🎟️ Ticket Médio</span><span class="compVal'+(x.k.ticket!=null?' green':'')+'">'+( x.k.ticket!=null?'R$&nbsp;'+brl(x.k.ticket):'—')+'</span></div>';
      var oc=x.occPct!=null?(x.occPct>=60?' green':x.occPct>=30?' amber':' red'):'';
      html+='<div class="compRow"><span class="compLabel">🚪 Ocup. Agenda</span><span class="compVal'+oc+'">'+( x.occPct!=null?x.occPct.toFixed(1)+'%':'—')+'</span></div>';
    }
    html+='</div>';
  });
  grid.innerHTML=html;
}

/* ══════════════════════════════════════
   RELATÓRIO PDF
══════════════════════════════════════ */
function gerarRelatorio(){
  var u=UNITS.find(function(u2){return u2.id===CU;})||UNITS[0];
  var month=getMonth();
  var phTitle=sid('phTitle');
  var phDate=sid('phDate');
  if(phTitle) phTitle.textContent='Relatório — '+u.name;
  if(phDate) phDate.textContent=(month?fmt(month)+' — ':'')+new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'});
  window.print();
}

/* ══════════════════════════════════════
   PAINEL DE CADASTRO RÁPIDO
══════════════════════════════════════ */
function populateFormHours(){
  const hours=getAgHours();
  const hs=sid('fHStart');
  const he=sid('fHEnd');
  if(!hs||!he) return;
  const prevS=hs.value;
  const prevE=he.value;
  hs.innerHTML=hours.map(h=>`<option value="${h}">${h}:00</option>`).join('');
  if(prevS&&hs.querySelector(`option[value="${prevS}"]`)) hs.value=prevS;
  syncFHEnd();
  if(prevE&&he.querySelector(`option[value="${prevE}"]`)) he.value=prevE;
}
function syncFHEnd(){
  const hs=sid('fHStart');
  const he=sid('fHEnd');
  if(!hs||!he) return;
  const sv=parseInt(hs.value)||7;
  const cfg=ldC();
  const endH=parseInt(cfg.end)||18;
  const prevE=he.value;
  he.innerHTML='';
  for(let h=sv+1;h<=endH;h++){
    const o=document.createElement('option');
    o.value=pad(h); o.textContent=pad(h)+':00';
    he.appendChild(o);
  }
  if(prevE&&he.querySelector(`option[value="${prevE}"]`)) he.value=prevE;
  else if(he.options.length>0) he.selectedIndex=Math.min(3,he.options.length-1);
}
function saveAgForm(){
  const prof=(sid('fProf').value||'').trim();
  const esp=(sid('fEsp').value||'').trim();
  const proc=(sid('fProc').value||'').trim();
  const day=sid('fDay').value;
  const hStart=parseInt(sid('fHStart').value);
  const hEnd=parseInt(sid('fHEnd').value);
  const sala=sid('fSala').value;
  if(!prof&&!proc){toast('Informe o nome do profissional ou o procedimento.','err');return;}
  if(!day){toast('Selecione o dia da semana.','err');return;}
  if(isNaN(hStart)||isNaN(hEnd)||hStart>=hEnd){toast('Verifique os horários de início e fim.','err');return;}
  const agData=ldA();
  for(let h=hStart;h<hEnd;h++){
    const key=`${day}-${pad(h)}`;
    if(!agData[key]) agData[key]={};
    agData[key][sala]={proc:proc||null,prof:prof||'',esp:esp||'',bloq:false};
  }
  const dayLabel={seg:'Segunda',ter:'Terça',qua:'Quarta',qui:'Quinta',sex:'Sexta'}[day]||day;
  const salaLabel={'s1':'Sala 1','s2':'Sala 2','s3':'Sala 3'}[sala]||sala;
  if(svA(agData)){
    renderAgenda();
    toast(`✅ ${prof||proc} — ${dayLabel} ${pad(hStart)}:00–${pad(hEnd)}:00 (${salaLabel})`,'');
  }
}
function clearAgForm(){
  ['fProf','fEsp','fProc'].forEach(id=>{const el=sid(id);if(el)el.value='';});
  toast('Campos limpos.','');
}


/* ══════════════════════════════════════════════════════════════
   MÓDULO AGENDA — AgendaMod
══════════════════════════════════════════════════════════════ */

