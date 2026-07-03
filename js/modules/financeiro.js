/* ═══════════════════════════════════════════════════════════════════════
   PAINEL DE CONTROLE CLÍNICO — js/modules/financeiro.js
   Módulo financeiro: serviços, lançamentos, KPIs, gráficos
   Depende de: supabase.js, main.js (sid, esc, toast, brl, fmt, pad, CU, lsGet, lsSet...)
═══════════════════════════════════════════════════════════════════════ */

function addService(){
  const nome=sid('g_nome').value.trim();
  const val=parseFloat(sid('g_val').value)||0;
  const perc=parseFloat(sid('g_perc').value)||0;
  if(!nome){toast('Informe o nome do serviço.','err');return;}
  if(val<=0){toast('O valor deve ser maior que zero.','err');return;}
  const arr=ldG();
  arr.push({id:Date.now(),nome,valor:val,perc});
  if(svG(arr)){
    sid('g_nome').value=''; sid('g_val').value=''; sid('g_perc').value='';
    renderGlobal(); renderLanc();
    toast('✅ Serviço adicionado!','');
  }
}
function delService(id){
  if(!confirm('Remover este serviço?'))return;
  if(svG(ldG().filter(s=>s.id!==id))){renderGlobal();renderLanc();toast('Serviço removido.','');}
}
function renderGlobal(){
  const arr=ldG();
  const tbody=sid('globalBody');
  tbody.innerHTML='';
  if(!arr.length){tbody.innerHTML='<tr class="eRow"><td colspan="5">Nenhum serviço cadastrado.</td></tr>';return;}
  arr.forEach(s=>{
    const cli=s.valor*(1-s.perc/100);
    const tr=document.createElement('tr');
    tr.innerHTML=`<td><strong>${esc(s.nome)}</strong></td><td>R$ ${brl(s.valor)}</td><td>${s.perc.toFixed(1)}%</td><td style="color:var(--g7);font-weight:700">R$ ${brl(cli)}</td><td><button class="bDel" onclick="delService(${s.id})">🗑</button></td>`;
    tbody.appendChild(tr);
  });
}
['g_nome','g_val','g_perc'].forEach(id=>sid(id).addEventListener('keydown',e=>{if(e.key==='Enter')addService();}));

/* ══════════════════════════════════════
   LANÇAMENTOS MENSAIS
══════════════════════════════════════ */
function renderLanc(){
  const services=ldG();
  const month=getMonth();
  const qtds=month?getLancM(month):{};
  const list=sid('lancList');
  list.innerHTML='';
  if(!services.length){
    list.innerHTML='<div class="lancEmpty">← Cadastre procedimentos na coluna ao lado para começar a lançar.</div>';
    syncFooter({fat:0,rep:0,cli:0}); syncMod3Auto({fat:0,rep:0}); return;
  }
  services.forEach(s=>{
    const qty=qtds[String(s.id)]||0;
    const row=document.createElement('div');
    row.className='lancRow';
    row.innerHTML=`<div class="lancInfo"><div class="lancName">${esc(s.nome)}</div><div class="lancPrice">R$ ${brl(s.valor)}/atend. · ${s.perc.toFixed(1)}% ao prof. · R$ ${brl(s.valor*(1-s.perc/100))} p/ clínica</div></div><div class="lancQtyWrap"><label>Qtd.:</label><input class="qtyInp" type="number" min="0" step="1" data-id="${s.id}" value="${qty||''}" placeholder="0" /><span class="lancUnit">atend.</span></div>`;
    list.appendChild(row);
  });
  list.querySelectorAll('.qtyInp').forEach(inp=>{inp.addEventListener('input',onQtyInput);inp.addEventListener('change',onQtyInput);});
  onQtyInput();
}
function onQtyInput(){
  const t=computeFromUI();
  syncFooter(t); syncMod3Auto(t);
  const d=getInputs(); updateCards(calc(d),d);
}
function computeFromUI(){
  const sMap={}; ldG().forEach(s=>sMap[s.id]=s);
  let fat=0,rep=0;
  document.querySelectorAll('.qtyInp').forEach(inp=>{
    const s=sMap[parseInt(inp.dataset.id)];
    const qty=parseFloat(inp.value)||0;
    if(s&&qty>0){fat+=qty*s.valor;rep+=qty*s.valor*(s.perc/100);}
  });
  return{fat,rep,cli:fat-rep};
}
function computeFromLanc(lancObj){
  const sMap={}; ldG().forEach(s=>sMap[s.id]=s);
  let fat=0,rep=0;
  Object.entries(lancObj).forEach(([id,qty])=>{
    const s=sMap[parseInt(id)];
    if(s&&qty>0){fat+=qty*s.valor;rep+=qty*s.valor*(s.perc/100);}
  });
  return{fat,rep,cli:fat-rep};
}
function readQtyInputs(){
  const res={};
  document.querySelectorAll('.qtyInp').forEach(inp=>{const qty=parseFloat(inp.value)||0;if(qty>0)res[inp.dataset.id]=qty;});
  return res;
}
function syncFooter(t){sid('lf_fat').textContent='R$ '+brl(t.fat);sid('lf_rep').textContent='R$ '+brl(t.rep);sid('lf_cli').textContent='R$ '+brl(t.cli);}
function syncMod3Auto(t){const eF=sid('i_fat'),eR=sid('i_rep');eF.value=t.fat>0?t.fat.toFixed(2):'';eR.value=t.rep>0?t.rep.toFixed(2):'';}

/* ══════════════════════════════════════
   MÊS
══════════════════════════════════════ */
function onMonthChange(){
  const m=getMonth();
  const bigLbl=sid('mLabelBig');
  if(bigLbl) bigLbl.textContent=m?fmt(m):'Selecione o mês';
  /* Sincroniza label e input do painel lateral esquerdo */
  var _fl=sid('finMesLabel'); if(_fl) _fl.textContent=m?fmt(m):'—';
  var _ll=sid('finMesLancLabel'); if(_ll) _ll.textContent=m?fmt(m):'—';
  var _ps=sid('mPickerSide'); if(_ps&&m) _ps.value=m;
  const st=sid('mStatus');
  if(!m){st.className='';return;}

  /* Auto-salvar mês anterior se tiver dados não salvos */
  if(_prevMonth && _prevMonth!==m){
    const _lanc=readQtyInputs();
    const _di=getInputs();
    const _kd={agend:_di.agend,faltas:_di.faltas,exC:_di.exC,exR:_di.exR,
               cus:_di.cus,pac:_di.pac,sal:_di.sal,hd:_di.hd,du:_di.du,tm:_di.tm};
    if(Object.values(_lanc).some(v=>v>0)||Object.values(_kd).some(v=>v>0)){
      setLancM(_prevMonth,_lanc);
      const _dd=ldD();_dd[_prevMonth]=_kd;svD(_dd);
    }
  }
  _prevMonth=m;

  const data=ldD();
  renderLanc();
  if(data[m]){fillKPIInputs(data[m]);st.textContent='✅ Mês com dados';st.className='saved';}
  else{clearKPIInputs();st.textContent='Novo mês';st.className='unsaved';resetCardValues();}
  /* recalcula footer e cards com lancamentos + inputs do novo mês */
  const _t=computeFromUI();syncFooter(_t);syncMod3Auto(_t);
  const d=getInputs();updateCards(calc(d),d);
  loadMetaAbs();
  renderComparativo();
}
function fillKPIInputs(d){
  const si=(id,v)=>{const e=sid(id);if(e)e.value=(v!=null&&v!=='')?v:'';};
  si('i_agend',d.agend);si('i_faltas',d.faltas);si('i_exC',d.exC);si('i_exR',d.exR);
  si('i_cus',d.cus);si('i_pac',d.pac);si('i_sal',d.sal);si('i_hd',d.hd);si('i_du',d.du);si('i_tm',d.tm);
}
function clearKPIInputs(){
  ['i_agend','i_faltas','i_exC','i_exR','i_cus','i_pac','i_sal','i_hd','i_du','i_tm']
    .forEach(id=>{const e=sid(id);if(e)e.value='';});
}

/* ══════════════════════════════════════
   SALVAR MÊS
══════════════════════════════════════ */
function saveMonth(){
  const month=getMonth();
  if(!month){toast('Selecione um mês.','err');return;}
  const lanc=readQtyInputs();
  const d=getInputs();
  const kpiData={agend:d.agend,faltas:d.faltas,exC:d.exC,exR:d.exR,cus:d.cus,pac:d.pac,sal:d.sal,hd:d.hd,du:d.du,tm:d.tm};
  if(!Object.values(lanc).some(v=>v>0)&&!Object.values(kpiData).some(v=>v>0)){toast('Preencha ao menos um campo.','err');return;}
  setLancM(month,lanc);
  const data=ldD();data[month]=kpiData;
  if(svD(data)){toast(`✅ Dados de ${fmt(month)} salvos!`,'');sid('mStatus').textContent='✅ Mês com dados';sid('mStatus').className='saved';renderAll();const _d2=getInputs();updateCards(calc(_d2),_d2);}
}

/* ══════════════════════════════════════
   SALVAMENTO AUTOMÁTICO (a cada 30s)
   Não interrompe o usuário: sem toast, sem re-render de gráficos.
══════════════════════════════════════ */
function autoSaveMonth(){
  const month=getMonth();
  if(!month) return;
  const lanc=readQtyInputs();
  const d=getInputs();
  const kpiData={agend:d.agend,faltas:d.faltas,exC:d.exC,exR:d.exR,cus:d.cus,pac:d.pac,sal:d.sal,hd:d.hd,du:d.du,tm:d.tm};
  if(!Object.values(lanc).some(v=>v>0)&&!Object.values(kpiData).some(v=>v>0)) return;
  setLancM(month,lanc);
  const data=ldD();data[month]=kpiData;
  if(svD(data)){
    const st=sid('mStatus');
    if(st){st.textContent='✅ Mês com dados';st.className='saved';}
    const tag=sid('mAutoSaveTag');
    if(tag){
      const original=tag.textContent;
      tag.textContent='💾 Salvo automaticamente às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      clearTimeout(autoSaveMonth._tagTimer);
      autoSaveMonth._tagTimer=setTimeout(()=>{tag.textContent='⏱️ Salvamento automático a cada 30s';},4000);
    }
  }
}
setInterval(autoSaveMonth,30000);

/* ══════════════════════════════════════
   INPUTS & CÁLCULOS
══════════════════════════════════════ */
function getInputs(){
  const v=id=>parseFloat(sid(id)?.value)||0;
  return{agend:v('i_agend'),faltas:v('i_faltas'),exC:v('i_exC'),exR:v('i_exR'),fat:v('i_fat'),rep:v('i_rep'),cus:v('i_cus'),pac:v('i_pac'),sal:v('i_sal'),hd:v('i_hd'),du:v('i_du'),tm:v('i_tm')};
}
function calc(d){
  const absent=d.agend>0?(d.faltas/d.agend)*100:null;
  const repr=d.exR>0?(d.exC/d.exR)*100:null;
  const recLiq=d.fat>0?d.fat-d.rep:null;
  const lucro=recLiq!=null?recLiq-d.cus:null;
  const ticket=(d.fat>0&&d.pac>0)?d.fat/d.pac:null;
  let cap=null,vag=null,ocio=null;
  if(d.sal>0&&d.hd>0&&d.du>0&&d.tm>0){cap=Math.floor((d.sal*d.hd*d.du*60)/d.tm);vag=Math.max(0,cap-d.agend);ocio=cap>0?(vag/cap)*100:null;}
  return{absent,repr,recLiq,lucro,ticket,cap,vag,ocio};
}

/* ══════════════════════════════════════
   CARDS
══════════════════════════════════════ */
function updateCards(k,d){
  sV('r_abs',k.absent,1);if(k.absent!=null)sid('r_abs').style.color='var(--r6)';
  var _meta=getMetaAbs();
  bdg('b_abs',k.absent,v=>v<=_meta?['bG1','✅ Excelente (≤'+_meta+'%)']:v<=_meta*2?['bW1','⚠️ Atenção']:['bR1','🔴 Crítico (>'+(_meta*2)+'%)']);
  sV('r_repr',k.repr,1);if(k.repr!=null)sid('r_repr').style.color='var(--g6)';
  bdg('b_repr',k.repr,v=>v>=20?['bG1','✅ Alta']:v>=10?['bW1','⚠️ Média']:['bR1','🔴 Baixa (<10%)']);
  const rF=sid('r_fat'),rL=sid('r_recLiq'),rLq=sid('r_lucro');
  rF.textContent=d.fat>0?brl(d.fat):'—';rF.style.color=d.fat>0?'var(--g6)':'';
  if(k.recLiq!=null){rL.textContent=brl(k.recLiq);rL.style.color=k.recLiq>=0?'var(--g7)':'var(--r6)';}else{rL.textContent='—';rL.style.color='';}
  if(k.lucro!=null){rLq.textContent=brl(k.lucro);rLq.style.color=k.lucro>=0?'var(--g6)':'var(--r6)';}else{rLq.textContent='—';rLq.style.color='';}
  const mg=d.fat>0&&k.lucro!=null?(k.lucro/d.fat)*100:null;
  bdg('b_fat',mg,v=>v>=20?['bG1','✅ Margem saudável (≥20%)']:v>=5?['bW1','⚠️ Margem apertada']:['bR1','🔴 Margem crítica (<5%)']);
  const rT=sid('r_tick');rT.textContent=k.ticket!=null?brl(k.ticket):'—';rT.style.color=k.ticket!=null?'var(--g6)':'';
  bdg('b_tick',k.ticket,v=>v>=300?['bG1','✅ Ticket alto']:v>=150?['bW1','⚠️ Ticket médio']:['bR1','🔴 Ticket baixo (<R$150)']);
  const rC=sid('r_cap'),rV=sid('r_vag'),rO=sid('r_ocio');
  if(k.cap!=null){rC.textContent=k.cap;rC.style.color='var(--g6)';rV.textContent=k.vag;rV.style.color='var(--r6)';rO.textContent=k.ocio!=null?k.ocio.toFixed(1):'—';rO.style.color=k.ocio<=20?'var(--g6)':k.ocio<=40?'var(--amb)':'var(--r6)';}
  else{[rC,rV,rO].forEach(e=>{e.textContent='—';e.style.color='';})}
  bdg('b_ocio',k.ocio,v=>v<=20?['bG1','✅ Bem ocupada']:v<=40?['bW1','⚠️ Ociosidade moderada']:['bR1','🔴 Alta ociosidade (>40%)']);
}
function resetCardValues(){
  ['r_abs','r_repr','r_fat','r_recLiq','r_lucro','r_tick','r_cap','r_vag','r_ocio'].forEach(id=>{const e=sid(id);if(e){e.textContent='—';e.style.color='';}});
  ['b_abs','b_repr','b_fat','b_tick','b_ocio'].forEach(id=>{const e=sid(id);if(e){e.className='bdg bN1';e.textContent='Aguardando dados';}});
}
function sV(id,val,dec){const e=sid(id);if(e)e.textContent=val!=null?val.toFixed(dec):'—';}
function bdg(id,val,fn){const el=sid(id);if(!el)return;if(val==null){el.className='bdg bN1';el.textContent='Aguardando dados';return;}const[cls,lbl]=fn(val);el.className=`bdg ${cls}`;el.textContent=lbl;}

/* ══════════════════════════════════════
   RENDER ALL (gráficos + histórico)
══════════════════════════════════════ */
const charts={};
function renderAll(){
  const data=ldD();
  const keys=Object.keys(data).sort();
  if(!keys.length){resetEmpty();stamp();return;}
  const labels=keys.map(fmt);
  const enriched=keys.map(m=>{
    const t=computeFromLanc(getLancM(m));
    const fat=t.fat>0?t.fat:(data[m]._fat||0);
    return{...data[m],fat,rep:t.rep};
  });
  const kArr=enriched.map(d=>calc(d));
  const sel=getMonth();
  const showIdx=data[sel]?keys.indexOf(sel):keys.length-1;
  updateCards(kArr[showIdx],enriched[showIdx]);
  const curT=computeFromLanc(getLancM(keys[showIdx]));
  syncFooter(curT);syncMod3Auto(curT);
  dLine('ch_abs','nd_abs',labels,kArr.map(k=>k.absent),'Absenteísmo (%)','#dc2626',false);
  dLine('ch_repr','nd_repr',labels,kArr.map(k=>k.repr),'Representatividade (%)','#16a34a',false);
  dBar3('ch_fat','nd_fat',labels,enriched.map(d=>d.fat),kArr.map(k=>k.recLiq),kArr.map(k=>k.lucro));
  dLine('ch_tick','nd_tick',labels,kArr.map(k=>k.ticket),'Ticket Médio (R$)','#15803d',true);
  dLine('ch_ocio','nd_ocio',labels,kArr.map(k=>k.ocio),'Ociosidade (%)','#dc2626',false);
  buildHist(data,keys,enriched,kArr);
  renderComparativo();
  stamp();
}
function dLine(cid,ndid,lbs,vals,label,hex,isMoney){
  const cv=sid(cid),nd=sid(ndid);
  const has=vals.some(v=>v!=null&&v!==0);
  nd.style.display=has?'none':'flex';cv.style.display=has?'block':'none';
  if(!has)return;
  if(charts[cid])charts[cid].destroy();
  const ctx=cv.getContext('2d');
  const g=ctx.createLinearGradient(0,0,0,130);
  g.addColorStop(0,hex+'55');g.addColorStop(1,hex+'08');
  charts[cid]=new Chart(cv,{type:'line',data:{labels:lbs,datasets:[{label,data:vals,borderColor:hex,backgroundColor:g,borderWidth:2.5,pointBackgroundColor:'#fff',pointBorderColor:hex,pointBorderWidth:2,pointRadius:4,pointHoverRadius:6,fill:true,tension:.38,spanGaps:true}]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:400},plugins:{legend:{display:false},tooltip:{backgroundColor:'#0f172a',titleColor:'#fff',bodyColor:'#e2e8f0',padding:8,cornerRadius:6,callbacks:{label:c=>{const v=c.raw;if(v==null)return 'Sem dados';return isMoney?` R$ ${v.toLocaleString('pt-BR',{minimumFractionDigits:2})}`:` ${v.toLocaleString('pt-BR',{maximumFractionDigits:1})}`;} }}},scales:{x:{grid:{display:false},ticks:{font:{size:10},color:'#64748b'}},y:{grid:{color:'#f1f5f9'},ticks:{font:{size:10},color:'#64748b',callback:v=>isMoney?`R$${(v/1000).toFixed(0)}k`:v}}}}});
}
function dBar3(cid,ndid,lbs,fatA,recA,lucA){
  const cv=sid(cid),nd=sid(ndid);
  const has=fatA.some(v=>v!=null&&v>0);
  nd.style.display=has?'none':'flex';cv.style.display=has?'block':'none';
  if(!has)return;
  if(charts[cid])charts[cid].destroy();
  charts[cid]=new Chart(cv,{type:'bar',data:{labels:lbs,datasets:[{label:'Fat. Bruto',data:fatA,backgroundColor:'#16a34a88',borderColor:'#16a34a',borderWidth:1.5,borderRadius:4},{label:'Rec. Líquida',data:recA,backgroundColor:'#15803d66',borderColor:'#15803d',borderWidth:1.5,borderRadius:4},{label:'Lucro',data:lucA,backgroundColor:'#14532d88',borderColor:'#14532d',borderWidth:1.5,borderRadius:4}]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:400},plugins:{legend:{display:true,position:'bottom',labels:{font:{size:10},padding:8,boxWidth:10}},tooltip:{backgroundColor:'#0f172a',titleColor:'#fff',bodyColor:'#e2e8f0',padding:8,cornerRadius:6,callbacks:{label:c=>{const v=c.raw;return v!=null?` ${c.dataset.label}: R$ ${v.toLocaleString('pt-BR',{minimumFractionDigits:2})}`:' Sem dados';}}}},scales:{x:{grid:{display:false},ticks:{font:{size:10},color:'#64748b'}},y:{grid:{color:'#f1f5f9'},ticks:{font:{size:10},color:'#64748b',callback:v=>`R$${(v/1000).toFixed(0)}k`}}}}});
}
function buildHist(data,keys,enriched,kArr){
  const tbody=sid('histBody');tbody.innerHTML='';
  if(!keys.length){tbody.innerHTML='<tr class="hERow"><td colspan="10">Nenhum dado ainda.</td></tr>';return;}
  [...keys].reverse().forEach((m,ri)=>{
    const i=keys.length-1-ri;const k=kArr[i];const d=enriched[i];
    const isAuto=!!(data[m]&&data[m]._auto);
    const mesTd=isAuto?`<td><strong>${fmt(m)}</strong> <span title="Importado do sistema" style="font-size:.68rem;color:var(--s4)">🔄</span></td>`:`<td><strong>${fmt(m)}</strong></td>`;
    const tr=document.createElement('tr');
    if(isAuto) tr.style.opacity='.85';
    tr.innerHTML=mesTd+`<td>${k.absent!=null?k.absent.toFixed(1)+'%':'—'}</td><td>${k.repr!=null?k.repr.toFixed(1)+'%':'—'}</td><td>${d.fat>0?'R$'+brl(d.fat):'—'}</td><td style="color:${k.recLiq!=null&&k.recLiq>=0?'var(--g6)':'var(--r6)'}">${k.recLiq!=null?'R$'+brl(k.recLiq):'—'}</td><td style="color:${k.lucro!=null&&k.lucro>=0?'var(--g7)':'var(--r6)'}">${k.lucro!=null?'R$'+brl(k.lucro):'—'}</td><td>${k.ticket!=null?'R$'+brl(k.ticket):'—'}</td><td>${k.cap!=null?k.cap+' atend.':'—'}</td><td style="color:var(--r6)">${k.ocio!=null?k.ocio.toFixed(1)+'%':'—'}</td><td><button class="bDel" onclick="delMonth('${m}')">🗑</button></td>`;
    tbody.appendChild(tr);
  });
}

/* ══════════════════════════════════════
   IMPORTAR HISTÓRICO DO SISTEMA (Supabase)
══════════════════════════════════════ */
async function importarHistorico(){
  if(!_sb){toast('Supabase não disponível.','err');return;}
  const btn=sid('btnImportHist');
  if(btn){btn.disabled=true;btn.textContent='⏳ Carregando...';}
  try{
    const d24=new Date();
    d24.setMonth(d24.getMonth()-23);d24.setDate(1);
    const ini=d24.getFullYear()+'-'+pad(d24.getMonth()+1)+'-01';
    const[rAg,rRec]=await Promise.all([
      _sb.from('agendamentos').select('data_agendamento,paciente_id,status,valor_cobrado')
        .eq('unidade_id',CU).neq('status','Cancelado').gte('data_agendamento',ini),
      _sb.from('recebimentos').select('valor,data_recebimento')
        .eq('unidade_id',CU).eq('status','RECEBIDO').gte('data_recebimento',ini)
    ]);
    const byMonth={};
    (rAg.data||[]).forEach(ag=>{
      const m=ag.data_agendamento.slice(0,7);
      if(!byMonth[m]) byMonth[m]={agend:0,faltas:0,pac:new Set(),fat:0};
      byMonth[m].agend++;
      if(ag.status==='Falta') byMonth[m].faltas++;
      if(ag.paciente_id) byMonth[m].pac.add(ag.paciente_id);
    });
    (rRec.data||[]).forEach(r=>{
      const m=(r.data_recebimento||'').slice(0,7);
      if(!m) return;
      if(!byMonth[m]) byMonth[m]={agend:0,faltas:0,pac:new Set(),fat:0};
      byMonth[m].fat+=(parseFloat(r.valor)||0);
    });
    const data=ldD();
    let novos=0,atualizados=0;
    Object.entries(byMonth).forEach(([m,md])=>{
      if(!data[m]){
        data[m]={agend:md.agend,faltas:md.faltas,exC:0,exR:0,cus:0,pac:md.pac.size,sal:0,hd:0,du:0,tm:0,_fat:md.fat,_auto:true};
        novos++;
      } else if(data[m]._auto){
        data[m].agend=md.agend;data[m].faltas=md.faltas;data[m].pac=md.pac.size;data[m]._fat=md.fat;
        atualizados++;
      }
    });
    if(novos>0||atualizados>0){
      svD(data);
      toast('✅ '+(novos+atualizados)+' mês(es) sincronizado(s) do sistema.','');
    } else if(!Object.keys(byMonth).length){
      toast('Nenhum agendamento encontrado nos últimos 24 meses.','');
    } else {
      toast('Histórico já está atualizado.','');
    }
    renderAll();
  } catch(e){
    console.error('[importarHistorico]',e);
    toast('Erro ao importar dados do sistema.','err');
  } finally {
    if(btn){btn.disabled=false;btn.textContent='📊 Sincronizar';}
  }
}

/* ══════════════════════════════════════
   EXCLUIR MÊS / LIMPAR HISTÓRICO
══════════════════════════════════════ */
function delMonth(m){
  if(!confirm(`Remover dados de ${fmt(m)}?`))return;
  const data=ldD();delete data[m];
  const lancs=ldL();delete lancs[m];svL(lancs);
  if(svD(data)){
    toast(`Dados de ${fmt(m)} removidos.`,'');
    if(getMonth()===m){clearKPIInputs();resetCardValues();sid('mStatus').textContent='Novo mês';sid('mStatus').className='unsaved';}
    if(!Object.keys(data).length)resetEmpty();else renderAll();
  }
}
function openModal(){sid('ovl').classList.add('open');}
function closeModal(){sid('ovl').classList.remove('open');}
function clearHistory(){
  lsSet(KD(),{});lsSet(KL(),{});
  closeModal();clearKPIInputs();resetEmpty();stamp();
  sid('mStatus').textContent='Novo mês';sid('mStatus').className='unsaved';
  renderLanc();
  toast('Histórico mensal limpo. Cadastro e Agenda mantidos.','');
}
sid('ovl').addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal();});

function resetEmpty(){
  resetCardValues();syncFooter({fat:0,rep:0,cli:0});
  Object.values(charts).forEach(c=>c.destroy());Object.keys(charts).forEach(k=>delete charts[k]);
  ['ch_abs','ch_repr','ch_fat','ch_tick','ch_ocio'].forEach(id=>{const e=sid(id);if(e)e.style.display='none';});
  ['nd_abs','nd_repr','nd_fat','nd_tick','nd_ocio'].forEach(id=>{const e=sid(id);if(e)e.style.display='flex';});
  sid('histBody').innerHTML='<tr class="hERow"><td colspan="10">Nenhum dado registrado. Preencha os campos e clique em <strong>Salvar Mês</strong>.</td></tr>';
  renderComparativo();
}

document.querySelectorAll('.cInps input[type="number"]:not([readonly])').forEach(inp=>{
  inp.addEventListener('input',()=>{const d=getInputs();updateCards(calc(d),d);});
});

