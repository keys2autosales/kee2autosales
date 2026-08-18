// Keys2AutoSales Marketplace Cloud Workflow
// Cloud-backed vehicle inventory + Facebook Marketplace work queue.

const CLOUD_VEHICLES_API='/api/vehicles';
const MARKETPLACE_SELLING_URL='https://www.facebook.com/marketplace/you/selling';

function vehicleFromCloud(row){
  return {
    id:row.id,
    stock:row.stock_number||'',
    vin:row.vin||'',
    year:Number(row.year||0),
    make:row.make||'',
    model:row.model_trim||'',
    color:row.color||'',
    mileage:Number(row.mileage||0),
    price:Number(row.dealer_price||0),
    photos:Number(row.photo_count||0),
    status:row.inventory_status||'Available',
    acquiredDate:row.acquired_date||'',
    fbPosted:Boolean(row.fb_posted),
    fbListingUrl:row.fb_listing_url||'',
    fbPrice:Number(row.fb_price||0),
    fbPostedDate:row.fb_posted_at?String(row.fb_posted_at).slice(0,10):'',
    fbLastRenewed:row.fb_last_renewed_at?String(row.fb_last_renewed_at).slice(0,10):'',
    fbLastVerified:row.fb_last_verified_at?String(row.fb_last_verified_at).slice(0,10):'',
    fbStatus:row.fb_status||'NOT POSTED',
    fbNotes:row.fb_notes||'',
    clPosted:false,clPrice:0,clPostedDate:'',clLastRenewed:''
  };
}

function vehicleToCloud(v){
  const toTs=d=>d?new Date(`${d}T12:00:00`).toISOString():null;
  return {
    stock_number:v.stock||null,
    vin:v.vin||null,
    year:Number(v.year||0)||null,
    make:v.make||null,
    model_trim:v.model||null,
    color:v.color||null,
    mileage:Number(v.mileage||0)||0,
    dealer_price:Number(v.price||0)||0,
    photo_count:Number(v.photos||0)||0,
    inventory_status:v.status||'Available',
    acquired_date:v.acquiredDate||null,
    fb_posted:Boolean(v.fbPosted),
    fb_listing_url:v.fbListingUrl||null,
    fb_price:Number(v.fbPrice||0)||null,
    fb_posted_at:toTs(v.fbPostedDate),
    fb_last_renewed_at:toTs(v.fbLastRenewed),
    fb_last_verified_at:toTs(v.fbLastVerified),
    fb_status:v.fbStatus||'NOT POSTED',
    fb_notes:v.fbNotes||null,
    idms_last_seen_at:new Date().toISOString()
  };
}

async function loadCloudVehicles(){
  try{
    const rows=await cloudRequest(CLOUD_VEHICLES_API);
    state.inventory=rows.map(vehicleFromCloud);
    localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
    renderAll();
  }catch(err){
    console.error('Supabase vehicle sync unavailable:',err);
  }
}

async function createCloudVehicle(v){
  const row=await cloudRequest(CLOUD_VEHICLES_API,{method:'POST',body:JSON.stringify(vehicleToCloud(v))});
  return vehicleFromCloud(row);
}

async function updateCloudVehicle(v){
  const row=await cloudRequest(`${CLOUD_VEHICLES_API}?id=${encodeURIComponent(v.id)}`,{method:'PATCH',body:JSON.stringify(vehicleToCloud(v))});
  return vehicleFromCloud(row);
}

function marketplaceAction(v){
  if(['Sold','Wholesale','Removed'].includes(v.status)) return 'REMOVE';
  if(v.fbStatus==='VERIFY') return 'VERIFY';
  if(!v.fbPosted) return 'POST';
  if(v.fbPrice && Number(v.fbPrice)!==Number(v.price)) return 'UPDATE';
  const last=v.fbLastRenewed||v.fbPostedDate;
  if(last && daysSince(last)>=Number(state.settings.renewalDays||7)) return 'RENEW';
  return 'LIVE';
}

// Keep dashboard/inventory action logic focused on Marketplace while Craigslist cloud sync is built next.
window.actionFor=(v,channel)=>channel==='fb'?marketplaceAction(v):'OK';
window.inventoryAction=v=>{
  if(Number(v.photos||0)===0 && v.status!=='Sold') return 'UPDATE';
  return marketplaceAction(v);
};

function ensureMarketplaceUI(){
  const marketing=document.getElementById('marketing');
  if(!marketing) return;
  const head=marketing.querySelector('.screen-head');
  if(head && !document.getElementById('marketplaceSummary')){
    const summary=document.createElement('div');
    summary.id='marketplaceSummary';
    summary.className='marketplace-summary';
    head.insertAdjacentElement('afterend',summary);
  }
  const segmented=marketing.querySelector('.segmented');
  if(segmented && !segmented.querySelector('[data-marketing-filter="VERIFY"]')){
    const verify=document.createElement('button');
    verify.className='seg';verify.dataset.marketingFilter='VERIFY';verify.textContent='Verify';
    segmented.appendChild(verify);
    verify.addEventListener('click',()=>{
      segmented.querySelectorAll('.seg').forEach(x=>x.classList.remove('active'));
      verify.classList.add('active');renderMarketing();
    });
  }
  if(!document.getElementById('marketplaceCloudStyles')){
    const style=document.createElement('style');
    style.id='marketplaceCloudStyles';
    style.textContent=`
      .marketplace-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0 0 14px}
      .marketplace-stat{background:#fff;border:1px solid var(--line);border-radius:14px;padding:10px;box-shadow:var(--shadow)}
      .marketplace-stat span{display:block;font-size:10px;color:var(--muted)}
      .marketplace-stat strong{font-size:20px}
      .badge.LIVE{background:var(--green-bg);color:var(--green)}
      .badge.VERIFY{background:#ede9fe;color:#6d28d9}
      .marketplace-url{font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:5px}
      .marketplace-card{border-left:4px solid #111827}
      .marketplace-card.action-REMOVE{border-left-color:#b91c1c}
      .marketplace-card.action-POST{border-left-color:#1d4ed8}
      .marketplace-card.action-UPDATE{border-left-color:#9a3412}
      .marketplace-card.action-RENEW{border-left-color:#92400e}
      .marketplace-card.action-VERIFY{border-left-color:#6d28d9}
      .marketplace-card.action-LIVE{border-left-color:#15803d}
      @media(max-width:520px){.marketplace-summary{grid-template-columns:repeat(2,1fr)}}
    `;
    document.head.appendChild(style);
  }
}

window.renderInventory=function(){
  const q=document.getElementById('inventorySearch')?.value?.toLowerCase()||'';
  const f=document.getElementById('inventoryFilter')?.value||'all';
  const rows=state.inventory.filter(v=>{
    const text=`${v.stock} ${v.vin} ${v.year} ${v.make} ${v.model}`.toLowerCase();
    if(q&&!text.includes(q)) return false;
    if(f==='action') return marketplaceAction(v)!=='LIVE';
    if(f!=='all'&&v.status!==f) return false;
    return true;
  });
  document.getElementById('inventoryList').innerHTML=rows.length?rows.map(v=>{
    const action=marketplaceAction(v);
    return `<div class="vehicle-card">
      <div class="card-top"><div><div class="card-title">${v.year} ${v.make} ${v.model}</div><div class="meta">Stock ${v.stock} • ${v.vin||'No VIN'}</div></div><span class="badge ${v.status}">${v.status}</span></div>
      <div class="card-grid">
        <div class="mini"><span>Dealer Price</span><strong>${money(v.price)}</strong></div>
        <div class="mini"><span>Mileage</span><strong>${Number(v.mileage||0).toLocaleString()}</strong></div>
        <div class="mini"><span>Marketplace</span><strong>${v.fbPosted?'Posted':'Not Posted'}</strong></div>
        <div class="mini"><span>Action</span><strong>${action}</strong></div>
      </div>
      <div class="actions"><span class="badge ${action}">${action}</span><button class="btn small" onclick="editVehicle('${v.id}')">Edit</button><button class="btn small" onclick="copyAd('${v.id}','fb')">Copy Ad</button><button class="btn small" onclick="openMarketplace('${v.id}')">Open FB</button></div>
    </div>`;
  }).join(''):'<p class="muted">No cloud inventory yet. Add a vehicle or import your IDMS export.</p>';
};

window.renderMarketing=function(){
  ensureMarketplaceUI();
  const active=document.querySelector('#marketing .seg.active')?.dataset.marketingFilter||'all';
  const items=state.inventory.map(v=>({v,action:marketplaceAction(v)}));
  const counts={POST:0,RENEW:0,UPDATE:0,REMOVE:0,VERIFY:0,LIVE:0};
  items.forEach(x=>counts[x.action]=(counts[x.action]||0)+1);
  const summary=document.getElementById('marketplaceSummary');
  if(summary) summary.innerHTML=[['Needs Post',counts.POST],['Renew',counts.RENEW],['Update',counts.UPDATE],['Remove',counts.REMOVE],['Verify',counts.VERIFY],['Live',counts.LIVE]].map(([l,n])=>`<div class="marketplace-stat"><span>${l}</span><strong>${n}</strong></div>`).join('');
  const priority={REMOVE:1,POST:2,UPDATE:3,RENEW:4,VERIFY:5,LIVE:6};
  const rows=items.filter(x=>active==='all'||x.action===active).sort((a,b)=>priority[a.action]-priority[b.action]);
  document.getElementById('marketingList').innerHTML=rows.length?rows.map(({v,action})=>`<div class="vehicle-card marketplace-card action-${action}">
    <div class="card-top"><div><div class="card-title">${v.year} ${v.make} ${v.model}</div><div class="meta">Stock ${v.stock} • Dealer ${money(v.price)}</div>${v.fbListingUrl?`<div class="marketplace-url">${v.fbListingUrl}</div>`:''}</div><span class="badge ${action}">${action}</span></div>
    <div class="card-grid"><div class="mini"><span>Marketplace Price</span><strong>${v.fbPrice?money(v.fbPrice):'—'}</strong></div><div class="mini"><span>Last Renewed</span><strong>${v.fbLastRenewed||'—'}</strong></div><div class="mini"><span>Last Verified</span><strong>${v.fbLastVerified||'—'}</strong></div><div class="mini"><span>Photos</span><strong>${v.photos||0}</strong></div></div>
    <div class="actions">
      <button class="btn small" onclick="copyAd('${v.id}','fb')">Copy Ad</button>
      <button class="btn small" onclick="openMarketplace('${v.id}')">Open Marketplace</button>
      <button class="btn small" onclick="editMarketplace('${v.id}')">Listing Details</button>
      ${action==='POST'?`<button class="btn small" onclick="markMarketplacePosted('${v.id}')">Mark Posted</button>`:''}
      ${action==='RENEW'?`<button class="btn small" onclick="markMarketplaceRenewed('${v.id}')">Mark Renewed</button>`:''}
      ${action==='VERIFY'||action==='LIVE'?`<button class="btn small" onclick="markMarketplaceVerified('${v.id}')">Verify Live</button>`:''}
      ${action==='REMOVE'?`<button class="btn small danger" onclick="markMarketplaceRemoved('${v.id}')">Mark Removed</button>`:''}
    </div>
  </div>`).join(''):'<p class="muted">No vehicles match this Marketplace filter.</p>';
};

function cloudVehicleFields(v={}){
  return [
    {label:'Stock #',name:'stock',value:v.stock,required:true},{label:'Year',name:'year',value:v.year,type:'number'},
    {label:'Make',name:'make',value:v.make},{label:'Model / Trim',name:'model',value:v.model},
    {label:'VIN',name:'vin',value:v.vin,full:true},{label:'Mileage',name:'mileage',value:v.mileage,type:'number'},
    {label:'Dealer Price',name:'price',value:v.price,type:'number'},{label:'Photo Count',name:'photos',value:v.photos,type:'number'},
    {label:'Status',name:'status',value:v.status||'Available',type:'select',options:['Available','Pending','Sold','Wholesale','Hold','Service','Removed']},
    {label:'Marketplace Posted?',name:'fbPosted',value:v.fbPosted?'Yes':'No',type:'select',options:['No','Yes']},
    {label:'Marketplace Price',name:'fbPrice',value:v.fbPrice,type:'number'},
    {label:'Marketplace URL',name:'fbListingUrl',value:v.fbListingUrl,full:true},
    {label:'FB Posted Date',name:'fbPostedDate',value:v.fbPostedDate,type:'date'},
    {label:'FB Last Renewed',name:'fbLastRenewed',value:v.fbLastRenewed,type:'date'}
  ];
}

function normalizeVehicleForm(d,v={}){
  return {...v,...d,year:Number(d.year||0),mileage:Number(d.mileage||0),price:Number(d.price||0),photos:Number(d.photos||0),fbPrice:Number(d.fbPrice||0),fbPosted:d.fbPosted==='Yes'};
}

document.getElementById('addVehicleBtn').onclick=()=>openModal('Add Vehicle',cloudVehicleFields(),async d=>{
  try{const saved=await createCloudVehicle(normalizeVehicleForm(d,{fbStatus:'NOT POSTED'}));state.inventory.push(saved);save();}
  catch(err){console.error(err);alert('Vehicle was not saved to the cloud.');}
});

window.editVehicle=id=>{const v=state.inventory.find(x=>x.id===id);if(!v)return;openModal('Edit Vehicle',cloudVehicleFields(v),async d=>{
  try{const saved=await updateCloudVehicle(normalizeVehicleForm(d,v));Object.assign(v,saved);save();}
  catch(err){console.error(err);alert('Vehicle update was not saved to the cloud.');}
});};

window.openMarketplace=id=>{
  const v=state.inventory.find(x=>x.id===id);
  window.open(v?.fbListingUrl||MARKETPLACE_SELLING_URL,'_blank','noopener');
};

window.editMarketplace=id=>{const v=state.inventory.find(x=>x.id===id);if(!v)return;openModal('Marketplace Listing',[
  {label:'Marketplace URL',name:'fbListingUrl',value:v.fbListingUrl,full:true},
  {label:'Marketplace Price',name:'fbPrice',value:v.fbPrice,type:'number'},
  {label:'Status',name:'fbStatus',value:v.fbStatus||'NOT POSTED',type:'select',options:['NOT POSTED','LIVE','VERIFY']},
  {label:'Notes',name:'fbNotes',value:v.fbNotes,full:true}
],async d=>{
  try{Object.assign(v,d,{fbPrice:Number(d.fbPrice||0),fbPosted:d.fbStatus!=='NOT POSTED'});const saved=await updateCloudVehicle(v);Object.assign(v,saved);save();}
  catch(err){console.error(err);alert('Marketplace details were not saved.');}
});};

async function patchMarketplace(id,changes){
  const v=state.inventory.find(x=>x.id===id);if(!v)return;
  Object.assign(v,changes);
  try{const saved=await updateCloudVehicle(v);Object.assign(v,saved);save();}
  catch(err){console.error(err);alert('Marketplace status was not saved.');}
}

window.markMarketplacePosted=id=>{const today=new Date().toISOString().slice(0,10);patchMarketplace(id,{fbPosted:true,fbPrice:state.inventory.find(x=>x.id===id)?.price||0,fbPostedDate:today,fbLastRenewed:today,fbLastVerified:today,fbStatus:'LIVE'});};
window.markMarketplaceRenewed=id=>{const today=new Date().toISOString().slice(0,10);patchMarketplace(id,{fbPosted:true,fbPrice:state.inventory.find(x=>x.id===id)?.price||0,fbLastRenewed:today,fbLastVerified:today,fbStatus:'LIVE'});};
window.markMarketplaceVerified=id=>{const today=new Date().toISOString().slice(0,10);patchMarketplace(id,{fbLastVerified:today,fbStatus:'LIVE'});};
window.markMarketplaceRemoved=id=>patchMarketplace(id,{fbPosted:false,fbStatus:'NOT POSTED',fbListingUrl:'',fbPrice:0});

// Override the old generic handler for Facebook so cloud status remains authoritative.
const oldMarkPosted=window.markPosted;
window.markPosted=(id,channel)=>channel==='fb'?window.markMarketplaceRenewed(id):oldMarkPosted?.(id,channel);

ensureMarketplaceUI();
renderAll();
loadCloudVehicles();
