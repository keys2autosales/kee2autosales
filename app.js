
const STORAGE_KEY='carSalesCommandCenter_v1';

const sampleData={
  settings:{
    commissionRate:.10,halfDealMultiplier:.50,renewalDays:7,
    dealerAddress:'1950 S Mesa Dr, Mesa, AZ 85210',
    bookingLink:'https://api.leadconnectorhq.com/widget/booking/zGCHd8lq4gxwxJzcKtcP',
    applicationLink:'https://www.brownandbrownauto.com/loan-application'
  },
  inventory:[
    {id:'v1',stock:'001718',year:2016,make:'Honda',model:'Pilot EX',vin:'5FNYF5H35GB001718',mileage:163296,price:13995,color:'Gray',status:'Available',photos:19,fbPosted:true,fbPrice:13995,fbPostedDate:'2026-08-03',fbLastRenewed:'',clPosted:false,clPrice:'',clPostedDate:'',clLastRenewed:''},
    {id:'v2',stock:'004721',year:2020,make:'Lexus',model:'ES 300h',vin:'58AE21B13LU004721',mileage:47020,price:32995,color:'White',status:'Available',photos:12,fbPosted:true,fbPrice:33995,fbPostedDate:'2026-08-01',fbLastRenewed:'2026-08-08',clPosted:true,clPrice:32995,clPostedDate:'2026-08-02',clLastRenewed:''},
    {id:'v3',stock:'009913',year:2019,make:'Toyota',model:'Tacoma',vin:'3TMCZ5AN0KM009913',mileage:87450,price:27995,color:'Black',status:'Sold',photos:20,fbPosted:true,fbPrice:27995,fbPostedDate:'2026-07-29',fbLastRenewed:'2026-08-05',clPosted:true,clPrice:27995,clPostedDate:'2026-07-29',clLastRenewed:'2026-08-05'}
  ],
  leads:[
    {id:'l1',name:'Marcus Johnson',phone:'480-555-0132',source:'Facebook Marketplace',vehicle:'2016 Honda Pilot EX',stock:'001718',stage:'New Lead',application:'Not Sent',appointment:'',nextFollowUp:'2026-08-14T10:15'},
    {id:'l2',name:'Ashley R.',phone:'602-555-0188',source:'Craigslist',vehicle:'2020 Lexus ES 300h',stock:'004721',stage:'Application Pending',application:'Pending',appointment:'2026-08-14T13:00',nextFollowUp:'2026-08-14T10:30'},
    {id:'l3',name:'Daniel T.',phone:'623-555-0199',source:'Referral',vehicle:'2019 Toyota Tacoma',stock:'009913',stage:'Sold',application:'Approved',appointment:'2026-08-12T15:00',nextFollowUp:''}
  ],
  tasks:[
    {id:'t1',priority:'High',type:'Lead',title:'Call Marcus — new Marketplace lead',due:'2026-08-14T10:15',done:false},
    {id:'t2',priority:'High',type:'Application',title:'Follow up Ashley application',due:'2026-08-14T10:30',done:false}
  ],
  deals:[
    {id:'d1',date:'2026-08-12',customer:'Daniel T.',stock:'009913',vehicle:'2019 Toyota Tacoma',source:'Referral',dealType:'Full',gross:4200,soldPrice:27995}
  ]
};

let state=load();
let marketingFilter='all';

function load(){
  try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)) || structuredClone(sampleData); }
  catch(e){ return structuredClone(sampleData); }
}
function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); renderAll(); }


// --- Supabase cloud sync: Leads (Phase 1) ---
// Leads are stored through a Vercel serverless API so database secrets never live in browser code.
const CLOUD_LEADS_API='/api/leads';

function leadFromCloud(row){
  return {
    id: row.id,
    name: row.name || '',
    phone: row.phone || '',
    email: row.email || '',
    source: row.source || '',
    vehicle: row.vehicle_name || '',
    stock: row.stock_number || '',
    stage: row.stage || 'New Lead',
    application: row.application_status || 'Not Sent',
    cashOrFinance: row.cash_or_finance || '',
    hasTrade: Boolean(row.has_trade),
    notes: row.notes || '',
    appointment: row.appointment_at
      ? String(row.appointment_at).slice(0,16)
      : '',
    lastContact: row.last_contact_at
      ? String(row.last_contact_at).slice(0,16)
      : '',
    nextFollowUp: row.next_follow_up_at
      ? String(row.next_follow_up_at).slice(0,16)
      : ''
  };
}

function leadToCloud(lead){
  return {
    name: lead.name || '',
    phone: lead.phone || '',
    email: lead.email || null,
    source: lead.source || '',
    vehicle_name: lead.vehicle || '',
    stock_number: lead.stock || '',
    stage: lead.stage || 'New Lead',
    application_status: lead.application || 'Not Sent',
    cash_or_finance: lead.cashOrFinance || null,
    has_trade: Boolean(lead.hasTrade),
    notes: lead.notes || null,
    appointment_at: lead.appointment || null,
    last_contact_at: lead.lastContact || null,
    next_follow_up_at: lead.nextFollowUp || null
  };
}
async function cloudRequest(url,options={}){
  const res=await fetch(url,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  const body=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(body.error||`Cloud request failed (${res.status})`);
  return body;
}
async function loadCloudLeads(){
  try{
    const rows=await cloudRequest(CLOUD_LEADS_API);
    state.leads=rows.map(leadFromCloud);
    localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
    renderAll();
  }catch(err){
    console.error('Supabase lead sync unavailable:',err);
    // Keep local leads visible if cloud setup is incomplete or temporarily unavailable.
  }
}
async function createCloudLead(lead){
  const row=await cloudRequest(CLOUD_LEADS_API,{method:'POST',body:JSON.stringify(leadToCloud(lead))});
  return leadFromCloud(row);
}
async function updateCloudLead(lead){
  const row=await cloudRequest(`${CLOUD_LEADS_API}?id=${encodeURIComponent(lead.id)}`,{method:'PATCH',body:JSON.stringify(leadToCloud(lead))});
  return leadFromCloud(row);
}

function money(n){ return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(n||0));}
function dateOnly(d){ if(!d) return ''; return new Date(d+'T12:00:00').toLocaleDateString(); }
function daysSince(date){
  if(!date) return 0;
  const diff=Date.now()-new Date(date+'T12:00:00').getTime();
  return Math.max(0,Math.floor(diff/86400000));
}
function actionFor(v,channel){
  if(!v.stock) return '';
  if(v.status==='Sold') return 'REMOVE';
  const posted = channel==='fb'?v.fbPosted:v.clPosted;
  const listedPrice = channel==='fb'?Number(v.fbPrice||0):Number(v.clPrice||0);
  const postedDate = channel==='fb'?v.fbPostedDate:v.clPostedDate;
  const renewed = channel==='fb'?v.fbLastRenewed:v.clLastRenewed;
  if(!posted) return 'POST';
  if(listedPrice && listedPrice!==Number(v.price)) return 'UPDATE';
  const age=daysSince(renewed||postedDate);
  if(age>=Number(state.settings.renewalDays||7)) return 'RENEW';
  return 'OK';
}
function inventoryAction(v){
  if(Number(v.photos||0)===0 && v.status!=='Sold') return 'UPDATE';
  const a=[actionFor(v,'fb'),actionFor(v,'cl')];
  if(a.includes('REMOVE')) return 'REMOVE';
  if(a.includes('POST')) return 'POST';
  if(a.includes('UPDATE')) return 'UPDATE';
  if(a.includes('RENEW')) return 'RENEW';
  return 'OK';
}
function commission(deal){
  const mult=deal.dealType==='Half'?state.settings.halfDealMultiplier:1;
  return Number(deal.gross||0)*Number(state.settings.commissionRate||0)*Number(mult||1);
}
function currentMonthDeals(){
  const now=new Date();
  return state.deals.filter(d=>{const x=new Date(d.date+'T12:00:00'); return x.getMonth()===now.getMonth()&&x.getFullYear()===now.getFullYear();});
}

function navTo(id){
  document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.nav===id));
  window.scrollTo({top:0,behavior:'smooth'});
}
document.addEventListener('click',e=>{
  const nav=e.target.closest('[data-nav]');
  if(nav) navTo(nav.dataset.nav);
});

function renderDashboard(){
  document.getElementById('todayLabel').textContent=new Date().toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'});
  const available=state.inventory.filter(v=>v.status==='Available').length;
  const invAction=state.inventory.filter(v=>inventoryAction(v)!=='OK').length;
  const newLeads=state.leads.filter(l=>l.stage==='New Lead').length;
  const pendingApps=state.leads.filter(l=>l.application==='Pending').length;
  const appts=state.leads.filter(l=>l.appointment && new Date(l.appointment).toDateString()===new Date().toDateString()).length;
  const monthDeals=currentMonthDeals();
  const gross=monthDeals.reduce((a,d)=>a+Number(d.gross||0),0);
  const comm=monthDeals.reduce((a,d)=>a+commission(d),0);
  const kpis=[
    ['Available',available],['Ads Need Action',invAction],['New Leads',newLeads],['Appointments Today',appts],
    ['Applications Pending',pendingApps],['Sold MTD',monthDeals.length],['Gross MTD',money(gross)],['Commission MTD',money(comm)]
  ];
  document.getElementById('kpiGrid').innerHTML=kpis.map(([l,v])=>`<div class="kpi"><div class="label">${l}</div><div class="value">${v}</div></div>`).join('');

  const autoTasks=[];
  state.inventory.forEach(v=>{
    const a=inventoryAction(v);
    if(a!=='OK') autoTasks.push({priority:a==='REMOVE'?'High':a==='POST'?'High':'Medium',title:`${a}: ${v.year} ${v.make} ${v.model}`,type:'Inventory'});
  });
  state.leads.filter(l=>l.stage==='New Lead').forEach(l=>autoTasks.push({priority:'High',title:`Call ${l.name} — ${l.vehicle}`,type:'Lead'}));
  state.leads.filter(l=>l.application==='Pending').forEach(l=>autoTasks.push({priority:'High',title:`Application follow-up — ${l.name}`,type:'Application'}));
  const merged=[...state.tasks.filter(t=>!t.done),...autoTasks].slice(0,8);
  document.getElementById('priorityQueue').innerHTML=merged.length?merged.map(t=>`
    <div class="queue-row"><span class="badge ${t.priority==='High'?'REMOVE':'RENEW'}">${t.priority}</span><div class="grow"><strong>${t.title}</strong><span class="muted">${t.type||''}</span></div></div>`).join(''):`<p class="muted">Nothing urgent right now.</p>`;

  const sources=[...new Set(state.leads.map(l=>l.source))];
  const rows=sources.map(s=>{
    const leads=state.leads.filter(l=>l.source===s);
    const appts=leads.filter(l=>l.appointment).length;
    const sales=leads.filter(l=>l.stage==='Sold').length;
    const close=leads.length?Math.round((sales/leads.length)*100):0;
    return `<tr><td>${s}</td><td>${leads.length}</td><td>${appts}</td><td>${sales}</td><td>${close}%</td></tr>`;
  }).join('');
  document.getElementById('sourcePerformance').innerHTML=`<table class="source-table"><thead><tr><th>Source</th><th>Leads</th><th>Appts</th><th>Sales</th><th>Close</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderInventory(){
  const q=document.getElementById('inventorySearch')?.value?.toLowerCase()||'';
  const f=document.getElementById('inventoryFilter')?.value||'all';
  let rows=state.inventory.filter(v=>{
    const text=`${v.stock} ${v.vin} ${v.year} ${v.make} ${v.model}`.toLowerCase();
    if(q && !text.includes(q)) return false;
    if(f==='action') return inventoryAction(v)!=='OK';
    if(f!=='all' && v.status!==f) return false;
    return true;
  });
  document.getElementById('inventoryList').innerHTML=rows.length?rows.map(v=>{
    const fb=actionFor(v,'fb'), cl=actionFor(v,'cl'), overall=inventoryAction(v);
    return `<div class="vehicle-card">
      <div class="card-top">
        <div><div class="card-title">${v.year} ${v.make} ${v.model}</div><div class="meta">Stock ${v.stock} • ${v.vin||'No VIN'}</div></div>
        <span class="badge ${v.status}">${v.status}</span>
      </div>
      <div class="card-grid">
        <div class="mini"><span>Price</span><strong>${money(v.price)}</strong></div>
        <div class="mini"><span>Mileage</span><strong>${Number(v.mileage||0).toLocaleString()}</strong></div>
        <div class="mini"><span>Facebook</span><strong>${fb}</strong></div>
        <div class="mini"><span>Craigslist</span><strong>${cl}</strong></div>
      </div>
      <div class="actions"><span class="badge ${overall}">${overall}</span><button class="btn small" onclick="editVehicle('${v.id}')">Edit</button><button class="btn small" onclick="copyAd('${v.id}','fb')">FB Ad</button><button class="btn small" onclick="copyAd('${v.id}','cl')">CL Ad</button></div>
    </div>`;
  }).join(''):`<p class="muted">No vehicles match this filter.</p>`;
}

function renderMarketing(){
  let rows=state.inventory.map(v=>({v,overall:inventoryAction(v),fb:actionFor(v,'fb'),cl:actionFor(v,'cl')}))
    .filter(x=>marketingFilter==='all'||x.overall===marketingFilter||x.fb===marketingFilter||x.cl===marketingFilter);
  document.getElementById('marketingList').innerHTML=rows.map(x=>`<div class="vehicle-card">
    <div class="card-top"><div><div class="card-title">${x.v.year} ${x.v.make} ${x.v.model}</div><div class="meta">Stock ${x.v.stock} • Dealer ${money(x.v.price)}</div></div><span class="badge ${x.overall}">${x.overall}</span></div>
    <div class="card-grid"><div class="mini"><span>Facebook Action</span><strong>${x.fb}</strong></div><div class="mini"><span>Craigslist Action</span><strong>${x.cl}</strong></div></div>
    <div class="actions"><button class="btn small" onclick="markPosted('${x.v.id}','fb')">FB Posted/Renewed</button><button class="btn small" onclick="markPosted('${x.v.id}','cl')">CL Posted/Renewed</button><button class="btn small" onclick="copyAd('${x.v.id}','fb')">Copy FB Ad</button><button class="btn small" onclick="copyAd('${x.v.id}','cl')">Copy CL Ad</button></div>
  </div>`).join('');
}

const leadStages=['New Lead','Contacted','Qualified','Application Sent','Application Pending','Application Received','Appointment Set','Showed','Working Deal','No Show','Nurture','Sold','Lost'];
function renderLeads(){
  document.getElementById('leadPipeline').innerHTML=leadStages.filter(stage=>state.leads.some(l=>l.stage===stage)).map(stage=>{
    const ls=state.leads.filter(l=>l.stage===stage);
    return `<div class="stage"><div class="stage-head"><span>${stage}</span><span>${ls.length}</span></div>${ls.map(l=>`
      <div class="lead-card"><div class="card-title">${l.name}</div><div class="meta">${l.vehicle} • ${l.source}</div>
      <div class="actions"><a class="btn small" href="tel:${l.phone}">Call</a><a class="btn small" href="sms:${l.phone}">Text</a><button class="btn small" onclick="editLead('${l.id}')">Update</button></div></div>`).join('')}</div>`;
  }).join('');
}

function renderTasks(){
  const rows=[...state.tasks].sort((a,b)=>(a.done-b.done)||((a.priority==='High'?-1:1)));
  document.getElementById('taskList').innerHTML=rows.map(t=>`<div class="task-card">
    <div class="card-top"><div><div class="card-title">${t.title}</div><div class="meta">${t.type} ${t.due?'• '+new Date(t.due).toLocaleString():''}</div></div><span class="badge ${t.done?'OK':t.priority==='High'?'REMOVE':'RENEW'}">${t.done?'DONE':t.priority}</span></div>
    <div class="actions"><button class="btn small" onclick="toggleTask('${t.id}')">${t.done?'Reopen':'Complete'}</button></div>
  </div>`).join('');
}

function renderDeals(){
  const month=currentMonthDeals(), gross=month.reduce((a,d)=>a+Number(d.gross||0),0), comm=month.reduce((a,d)=>a+commission(d),0);
  document.getElementById('dealSummary').innerHTML=[
    ['Sold MTD',month.length],['Gross MTD',money(gross)],['Commission MTD',money(comm)],['Avg Gross',money(month.length?gross/month.length:0)]
  ].map(([l,v])=>`<div class="kpi"><div class="label">${l}</div><div class="value">${v}</div></div>`).join('');
  document.getElementById('dealList').innerHTML=state.deals.slice().reverse().map(d=>`<div class="deal-card">
    <div class="card-top"><div><div class="card-title">${d.customer} — ${d.vehicle}</div><div class="meta">${dateOnly(d.date)} • ${d.source} • ${d.dealType}</div></div><span class="badge SOLD">${money(commission(d))}</span></div>
    <div class="card-grid"><div class="mini"><span>Gross</span><strong>${money(d.gross)}</strong></div><div class="mini"><span>Sold Price</span><strong>${money(d.soldPrice)}</strong></div></div>
  </div>`).join('');
}

function renderSettings(){
  for(const [id,key] of [['commissionRate','commissionRate'],['halfDealMultiplier','halfDealMultiplier'],['renewalDays','renewalDays'],['dealerAddress','dealerAddress'],['bookingLink','bookingLink'],['applicationLink','applicationLink']]){
    document.getElementById(id).value=state.settings[key];
  }
  const replies=[
    ['..avail','Yes, it is! Are you looking to finance, pay cash, or trade something in?'],
    ['..finance','Absolutely! We have financing options available. What’s the best number to reach you at? I can help you with the next step.'],
    ['..app',`Here is the credit application: ${state.settings.applicationLink}`],
    ['..book',`Perfect. Pick the time that works best for you and I’ll have everything ready: ${state.settings.bookingLink}`],
    ['..sold','That one is no longer available, but I may have something similar. What kind of vehicle are you looking for and roughly what budget are you trying to stay around?']
  ];
  document.getElementById('quickReplyList').innerHTML=replies.map(([s,m])=>`<div class="quick-reply"><code>${s}</code><p>${m}</p><button class="btn small" onclick="navigator.clipboard.writeText(${JSON.stringify(m)})">Copy</button></div>`).join('');
}

function renderAll(){renderDashboard();renderInventory();renderMarketing();renderLeads();renderTasks();renderDeals();renderSettings();}
document.getElementById('inventorySearch').addEventListener('input',renderInventory);
document.getElementById('inventoryFilter').addEventListener('change',renderInventory);
document.querySelectorAll('[data-marketing-filter]').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('[data-marketing-filter]').forEach(x=>x.classList.remove('active'));b.classList.add('active');marketingFilter=b.dataset.marketingFilter;renderMarketing();
}));

const modal=document.getElementById('modal'), modalBody=document.getElementById('modalBody'), modalTitle=document.getElementById('modalTitle'), modalForm=document.getElementById('modalForm');
let modalSubmit=null;
function openModal(title,fields,onSubmit){
  modalTitle.textContent=title;
  modalBody.innerHTML=fields.map(f=>`<label class="${f.full?'full':''}">${f.label}<${f.type==='select'?'select':'input'} class="input" name="${f.name}" ${f.type==='number'?'type="number"':''} ${f.required?'required':''}>${f.type==='select'?f.options.map(o=>`<option value="${o}" ${String(f.value)===String(o)?'selected':''}>${o}</option>`).join(''):''}</${f.type==='select'?'select':'input'}></label>`).join('');
  fields.filter(f=>f.type!=='select').forEach(f=>{const el=modalBody.querySelector(`[name="${f.name}"]`); el.value=f.value??''; if(f.type==='date')el.type='date'; if(f.type==='datetime-local')el.type='datetime-local';});
  modalSubmit=onSubmit; modal.showModal();
}
modalForm.addEventListener('submit',e=>{e.preventDefault();const data=Object.fromEntries(new FormData(modalForm));modalSubmit?.(data);modal.close();});
document.getElementById('closeModalBtn').onclick=()=>modal.close();document.getElementById('cancelModalBtn').onclick=()=>modal.close();

function vehicleFields(v={}){
 return [
  {label:'Stock #',name:'stock',value:v.stock,required:true},{label:'Year',name:'year',value:v.year,type:'number'},
  {label:'Make',name:'make',value:v.make},{label:'Model / Trim',name:'model',value:v.model},
  {label:'VIN',name:'vin',value:v.vin,full:true},{label:'Mileage',name:'mileage',value:v.mileage,type:'number'},
  {label:'Dealer Price',name:'price',value:v.price,type:'number'},{label:'Photo Count',name:'photos',value:v.photos,type:'number'},
  {label:'Status',name:'status',value:v.status||'Available',type:'select',options:['Available','Pending','Sold','Wholesale','Hold','Service','Removed']},
  {label:'FB Posted?',name:'fbPosted',value:v.fbPosted?'Yes':'No',type:'select',options:['No','Yes']},
  {label:'FB Price',name:'fbPrice',value:v.fbPrice,type:'number'},{label:'FB Posted Date',name:'fbPostedDate',value:v.fbPostedDate,type:'date'},
  {label:'FB Last Renewed',name:'fbLastRenewed',value:v.fbLastRenewed,type:'date'},
  {label:'CL Posted?',name:'clPosted',value:v.clPosted?'Yes':'No',type:'select',options:['No','Yes']},
  {label:'CL Price',name:'clPrice',value:v.clPrice,type:'number'},{label:'CL Posted Date',name:'clPostedDate',value:v.clPostedDate,type:'date'},
  {label:'CL Last Renewed',name:'clLastRenewed',value:v.clLastRenewed,type:'date'}
 ];
}
document.getElementById('addVehicleBtn').onclick=()=>openModal('Add Vehicle',vehicleFields(),d=>{
  state.inventory.push({id:crypto.randomUUID(),...d,year:Number(d.year),mileage:Number(d.mileage),price:Number(d.price),photos:Number(d.photos),fbPrice:Number(d.fbPrice||0),clPrice:Number(d.clPrice||0),fbPosted:d.fbPosted==='Yes',clPosted:d.clPosted==='Yes'});save();
});
window.editVehicle=id=>{const v=state.inventory.find(x=>x.id===id);openModal('Edit Vehicle',vehicleFields(v),d=>{Object.assign(v,d,{year:Number(d.year),mileage:Number(d.mileage),price:Number(d.price),photos:Number(d.photos),fbPrice:Number(d.fbPrice||0),clPrice:Number(d.clPrice||0),fbPosted:d.fbPosted==='Yes',clPosted:d.clPosted==='Yes'});save();});};

document.getElementById('addLeadBtn').onclick=()=>openModal('Add Lead',[
 {label:'Name',name:'name',required:true},{label:'Phone',name:'phone',required:true},{label:'Source',name:'source',type:'select',options:['Facebook Marketplace','Craigslist','Referral','Walk-In','Phone','Website','Other']},
 {label:'Vehicle',name:'vehicle'},{label:'Stock #',name:'stock'},{label:'Stage',name:'stage',type:'select',options:leadStages},
 {label:'Application',name:'application',type:'select',options:['Not Sent','Sent','Pending','Received','Approved','Declined','N/A']},{label:'Appointment',name:'appointment',type:'datetime-local'}
],async d=>{
  const temp={id:crypto.randomUUID(),...d};
  try{
    const saved=await createCloudLead(temp);
    state.leads.push(saved); save();
  }catch(err){
    console.error(err); alert('Lead was not saved to the cloud. Check Vercel environment variables and the Supabase migration.');
  }
});
window.editLead=id=>{const l=state.leads.find(x=>x.id===id);openModal('Update Lead',[
 {label:'Name',name:'name',value:l.name},{label:'Phone',name:'phone',value:l.phone},{label:'Stage',name:'stage',value:l.stage,type:'select',options:leadStages},
 {label:'Application',name:'application',value:l.application,type:'select',options:['Not Sent','Sent','Pending','Received','Approved','Declined','N/A']},{label:'Appointment',name:'appointment',value:l.appointment,type:'datetime-local'}
],async d=>{
  const candidate={...l,...d};
  try{
    const saved=await updateCloudLead(candidate); Object.assign(l,saved); save();
  }catch(err){console.error(err); alert('Lead update was not saved to the cloud.');}
});};

document.getElementById('addTaskBtn').onclick=()=>openModal('Add Task',[
 {label:'Title',name:'title',required:true,full:true},{label:'Priority',name:'priority',type:'select',options:['High','Medium','Low']},{label:'Type',name:'type',type:'select',options:['Inventory','Facebook','Craigslist','Lead','Application','Appointment','Deal','Follow-Up']},{label:'Due',name:'due',type:'datetime-local'}
],d=>{state.tasks.push({id:crypto.randomUUID(),...d,done:false});save();});
window.toggleTask=id=>{const t=state.tasks.find(x=>x.id===id);t.done=!t.done;save();};

document.getElementById('addDealBtn').onclick=()=>openModal('Add Sold Deal',[
 {label:'Deal Date',name:'date',type:'date',required:true},{label:'Customer',name:'customer',required:true},{label:'Stock #',name:'stock'},{label:'Vehicle',name:'vehicle',required:true},
 {label:'Lead Source',name:'source',type:'select',options:['Facebook Marketplace','Craigslist','Referral','Walk-In','Phone','Website','Other']},{label:'Deal Type',name:'dealType',type:'select',options:['Full','Half']},
 {label:'Gross Profit',name:'gross',type:'number',required:true},{label:'Sold Price',name:'soldPrice',type:'number'}
],d=>{state.deals.push({id:crypto.randomUUID(),...d,gross:Number(d.gross),soldPrice:Number(d.soldPrice)});save();});

window.markPosted=(id,channel)=>{
 const v=state.inventory.find(x=>x.id===id),today=new Date().toISOString().slice(0,10);
 if(channel==='fb'){v.fbPosted=true;v.fbPrice=v.price;if(!v.fbPostedDate)v.fbPostedDate=today;v.fbLastRenewed=today;}
 else{v.clPosted=true;v.clPrice=v.price;if(!v.clPostedDate)v.clPostedDate=today;v.clLastRenewed=today;}
 save();
};
window.copyAd=(id,channel)=>{
 const v=state.inventory.find(x=>x.id===id);
 const common=`${v.year} ${v.make} ${v.model}\nPrice: ${money(v.price)}\nMileage: ${Number(v.mileage||0).toLocaleString()}\nVIN: ${v.vin||''}\nLocation: ${state.settings.dealerAddress}`;
 const fb=`🚙 ${v.year} ${v.make} ${v.model}\n\n${common}\n\nFinancing options available • Trade-ins welcome • First-time buyers welcome\n\nSchedule a test drive:\n${state.settings.bookingLink}\n\nCredit application:\n${state.settings.applicationLink}`;
 const cl=`${v.year} ${v.make} ${v.model} - Financing Available - Trades Welcome\n\n${common}\n\nFinancing available. Trade-ins accepted. Ask about first-time buyer options.\n\nSchedule: ${state.settings.bookingLink}\nApply: ${state.settings.applicationLink}`;
 navigator.clipboard.writeText(channel==='fb'?fb:cl);
 alert(`${channel==='fb'?'Facebook':'Craigslist'} ad copied.`);
};

document.getElementById('saveSettingsBtn').onclick=()=>{
 state.settings.commissionRate=Number(document.getElementById('commissionRate').value);
 state.settings.halfDealMultiplier=Number(document.getElementById('halfDealMultiplier').value);
 state.settings.renewalDays=Number(document.getElementById('renewalDays').value);
 state.settings.dealerAddress=document.getElementById('dealerAddress').value;
 state.settings.bookingLink=document.getElementById('bookingLink').value;
 state.settings.applicationLink=document.getElementById('applicationLink').value;
 save(); alert('Settings saved.');
};
document.getElementById('resetDataBtn').onclick=()=>{if(confirm('Reset all local prototype data?')){state=structuredClone(sampleData);save();}};
document.getElementById('quickAddBtn').onclick=()=>navTo('leads');

function parseCSV(text){
 const lines=text.trim().split(/\r?\n/); if(lines.length<2)return [];
 const headers=lines[0].split(',').map(h=>h.trim().replace(/^"|"$/g,''));
 return lines.slice(1).map(line=>{
   const values=[];let cur='',q=false;
   for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){q=!q;}else if(ch===','&&!q){values.push(cur);cur='';}else cur+=ch;}values.push(cur);
   const obj={};headers.forEach((h,i)=>obj[h]=(values[i]||'').trim().replace(/^"|"$/g,''));return obj;
 });
}
function pick(obj,names){for(const n of names){const k=Object.keys(obj).find(x=>x.toLowerCase()===n.toLowerCase());if(k&&obj[k]!==undefined)return obj[k];}return '';}
document.getElementById('csvImport').addEventListener('change',async e=>{
 const file=e.target.files[0]; if(!file)return; const rows=parseCSV(await file.text()); let count=0;
 rows.forEach(r=>{
   const stock=pick(r,['Stock #','Stock','Stock Number']);const vin=pick(r,['VIN']);if(!stock&&!vin)return;
   let v=state.inventory.find(x=>(stock&&x.stock===stock)||(vin&&x.vin===vin));
   const data={stock,vin,year:Number(pick(r,['Year'])||0),make:pick(r,['Make']),model:pick(r,['Model / Trim','Model','Trim']),color:pick(r,['Color']),status:pick(r,['Status'])||'Available',price:Number(String(pick(r,['Price'])).replace(/[$,]/g,''))||0,mileage:Number(String(pick(r,['Mileage','Miles'])).replace(/,/g,''))||0,photos:Number(pick(r,['Pics','Photos'])||0)};
   if(v) Object.assign(v,data); else state.inventory.push({id:crypto.randomUUID(),...data,fbPosted:false,clPosted:false,fbPrice:0,clPrice:0,fbPostedDate:'',clPostedDate:'',fbLastRenewed:'',clLastRenewed:''});
   count++;
 });
 save(); alert(`Imported/updated ${count} vehicle rows.`);
 e.target.value='';
});

if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));}
renderAll();
loadCloudLeads();
