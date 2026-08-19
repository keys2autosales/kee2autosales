// Keys2AutoSales batch VIN enrichment
// Safely fills only blank VIN-decodable fields. Facebook VIN decoding is never used.
(function(){
  const SAFE_FIELDS=['year','make','model','bodyStyle','fuelType','transmission'];

  function inventory(){
    try{return Array.isArray(state?.inventory)?state.inventory:[];}catch(_){return [];}
  }

  function cleanVin(value=''){
    return String(value).toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g,'').slice(0,17);
  }

  function missingSafeField(v={}){
    return SAFE_FIELDS.some(key=>{
      const value=v[key];
      if(key==='year') return !Number(value);
      return value===undefined||value===null||String(value).trim()==='';
    });
  }

  function mergeDecoded(v,data){
    const next=Object.assign({},v);
    const changed=[];
    const put=(key,label,value)=>{
      if(value===undefined||value===null||value==='') return;
      const existing=next[key];
      const blank=key==='year'?!Number(existing):(existing===undefined||existing===null||String(existing).trim()==='');
      if(!blank) return;
      next[key]=value;
      changed.push(label);
    };
    put('year','Year',data.year);
    put('make','Make',data.make);
    put('model','Model / Trim',data.model||data.baseModel);
    put('bodyStyle','Body Style',data.bodyStyle);
    put('fuelType','Fuel Type',data.fuelType);
    put('transmission','Transmission',data.transmission);
    return {next,changed};
  }

  async function decodeVin(vin){
    const res=await fetch(`/api/vin-decode?vin=${encodeURIComponent(vin)}`);
    const data=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.error||`VIN decode failed (${res.status})`);
    return data;
  }

  async function enrichOne(v){
    const vin=cleanVin(v.vin||'');
    if(vin.length!==17) return {status:'skipped',reason:'invalid VIN'};
    const data=await decodeVin(vin);
    const {next,changed}=mergeDecoded(v,data);
    if(!changed.length) return {status:'unchanged',data};
    if(typeof updateCloudVehicle!=='function') throw new Error('Cloud vehicle updater is unavailable');
    const saved=await updateCloudVehicle(next);
    Object.assign(v,saved||next);
    return {status:'updated',changed,data};
  }

  function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

  async function enrichMissingInventory(){
    const vehicles=inventory().filter(v=>cleanVin(v.vin||'').length===17&&missingSafeField(v));
    if(!vehicles.length){
      alert('No VIN-decodable missing fields were found in the current inventory.');
      return;
    }

    const ok=confirm(`Decode ${vehicles.length} vehicle VIN${vehicles.length===1?'':'s'} and fill only blank Year, Make, Model, Body Style, Fuel Type, and Transmission fields?\n\nExisting values will be preserved.`);
    if(!ok) return;

    const btn=document.querySelector('.k2-batch-vin-btn');
    const status=document.querySelector('.k2-batch-vin-status');
    const original=btn?.textContent||'Enrich Missing Inventory';
    if(btn){btn.disabled=true;btn.textContent='Enriching…';}

    let updated=0,unchanged=0,failed=0,skipped=0;
    const failures=[];

    for(let i=0;i<vehicles.length;i++){
      const v=vehicles[i];
      if(status) status.textContent=`VIN enrichment ${i+1}/${vehicles.length}: ${v.year||''} ${v.make||''} ${v.model||''}`.trim();
      try{
        const result=await enrichOne(v);
        if(result.status==='updated') updated++;
        else if(result.status==='unchanged') unchanged++;
        else skipped++;
      }catch(err){
        failed++;
        failures.push(`${v.stock||v.vin||'Vehicle'}: ${err.message}`);
        console.error('VIN batch enrichment failed:',v,err);
      }
      await delay(250);
    }

    try{if(typeof save==='function') save();}catch(_){ }
    if(status) status.textContent=`VIN enrichment complete: ${updated} updated, ${unchanged} unchanged, ${failed} failed.`;
    if(btn){btn.disabled=false;btn.textContent=original;}

    let message=`VIN enrichment complete.\n\nUpdated: ${updated}\nNo new VIN fields available: ${unchanged}\nSkipped: ${skipped}\nFailed: ${failed}`;
    if(failures.length) message+=`\n\nFirst failures:\n${failures.slice(0,5).join('\n')}`;
    message+='\n\nInterior Color, Condition, pricing, mileage, colors, and photos are not guessed from VIN data.';
    alert(message);
  }

  function install(){
    const inventoryScreen=document.getElementById('inventory');
    if(!inventoryScreen||inventoryScreen.querySelector('.k2-batch-vin-btn')) return;
    const importPanel=[...inventoryScreen.querySelectorAll('.panel.compact')].find(p=>p.textContent.includes('IDMS Import'));
    const actions=importPanel?.querySelector('.panel-head');
    if(!actions) return;

    const wrap=document.createElement('div');
    wrap.style.cssText='display:flex;align-items:center;gap:10px;flex-wrap:wrap;';
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='btn light k2-batch-vin-btn';
    btn.textContent='🔎 Enrich Missing Inventory';
    btn.addEventListener('click',enrichMissingInventory);
    const status=document.createElement('small');
    status.className='muted k2-batch-vin-status';
    status.textContent='Uses VIN data to fill safe blank vehicle specs only.';
    wrap.append(btn,status);
    actions.appendChild(wrap);
  }

  window.enrichMissingInventory=enrichMissingInventory;
  const observer=new MutationObserver(()=>requestAnimationFrame(install));
  observer.observe(document.documentElement,{subtree:true,childList:true});
  window.addEventListener('load',install);
  setTimeout(install,500);
})();
