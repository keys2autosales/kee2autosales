// Keys2AutoSales -> Facebook Marketplace Social Listing Assistant handoff
(function(){
  const CREATE_URL='https://www.facebook.com/marketplace/create/vehicle';
  const VIN_RE=/^[A-HJ-NPR-Z0-9]{17}$/;

  function encodePayload(obj){
    const json=JSON.stringify(obj);
    return btoa(unescape(encodeURIComponent(json))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }

  function cleanVin(value){
    return String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  }

  function cleanModel(value){
    const raw=String(value||'').trim();
    return typeof window.cleanVehicleModel==='function' ? window.cleanVehicleModel(raw) : raw;
  }

  function firstValue(...values){
    return values.find(v=>v!==undefined&&v!==null&&String(v).trim()!=='')||'';
  }

  async function rawCloudVehicle(id){
    try{
      const res=await fetch('/api/vehicles');
      if(!res.ok) return null;
      const rows=await res.json();
      return Array.isArray(rows)?rows.find(r=>String(r.id)===String(id))||null:null;
    }catch(err){
      console.warn('Keys2AutoSales: optional cloud vehicle details unavailable',err);
      return null;
    }
  }

  function vehiclePayload(v,row={}){
    const vin=cleanVin(v.vin||row.vin);
    return {
      schema:'k2-marketplace-v3',
      id:String(v.id||row.id||''),
      vin,
      stock:String(v.stock||row.stock_number||'').trim(),
      year:Number(v.year||row.year||0)||'',
      make:String(v.make||row.make||'').trim(),
      model:cleanModel(v.model||row.model_trim),
      mileage:Number(v.mileage||row.mileage||0)||'',
      price:Number(v.price||row.dealer_price||0)||'',
      color:String(firstValue(v.color,row.color,row.exterior_color)).trim(),
      interiorColor:String(firstValue(v.interiorColor,v.interior_color,row.interior_color)).trim(),
      bodyStyle:String(firstValue(v.bodyStyle,v.body_style,row.body_style)).trim(),
      vehicleCondition:String(firstValue(v.vehicleCondition,v.vehicle_condition,row.vehicle_condition)).trim(),
      fuelType:String(firstValue(v.fuelType,v.fuel_type,row.fuel_type)).trim(),
      transmission:String(firstValue(v.transmission,row.transmission)).trim(),
      photoUrls:Array.isArray(v.photoUrls)?v.photoUrls:(Array.isArray(row.photo_urls)?row.photo_urls:[]),
      vehicleType:'Car/Truck',
      bookingLink:state.settings?.bookingLink||'',
      applicationLink:state.settings?.applicationLink||''
    };
  }

  window.autoFillMarketplace=async function(id){
    const v=(state.inventory||[]).find(x=>String(x.id)===String(id));
    if(!v) return alert('Vehicle not found.');
    if(!Number(v.price||0)) return alert('Add a dealer price before sending this vehicle to Marketplace.');

    const row=await rawCloudVehicle(id);
    const payload=vehiclePayload(v,row||{});

    if(!VIN_RE.test(payload.vin)){
      return alert(`This vehicle does not have a valid 17-character VIN. Current VIN: ${payload.vin||'missing'}`);
    }
    if(!payload.year||!payload.make||!payload.model){
      return alert('Year, make, and model are required before sending this vehicle to Marketplace.');
    }
    localStorage.setItem('k2_marketplace_last_payload',JSON.stringify(payload));
    window.open(`${CREATE_URL}#k2=${encodePayload(payload)}`,'_blank','noopener');
  };

  function injectInventoryButtons(){
    document.querySelectorAll('.vehicle-card').forEach(card=>{
      if(card.querySelector('.k2-autofill-btn')) return;
      const actionRow=card.querySelector('.actions');
      if(!actionRow) return;
      const edit=actionRow.querySelector('[onclick*="editVehicle"]');
      const source=(edit?.getAttribute('onclick')||'').match(/editVehicle\('([^']+)'\)/);
      if(!source) return;
      const b=document.createElement('button');
      b.className='btn small k2-autofill-btn';
      b.textContent='⚡ Auto-Fill FB';
      b.onclick=()=>window.autoFillMarketplace(source[1]);
      actionRow.appendChild(b);
    });
  }

  function addAssistantCard(){
    const host=document.getElementById('marketing');
    if(!host || host.querySelector('.k2-assistant-card')) return;
    const card=document.createElement('div');
    card.className='panel compact k2-assistant-card';
    card.innerHTML='<div class="panel-head"><div><h3>Social Listing Assistant</h3><p class="muted">Chrome extension autofills Facebook Marketplace vehicle listings from Keys2AutoSales.</p></div><span class="badge LIVE">Extension Workflow Ready</span></div>';
    host.prepend(card);
  }

  function enhance(){injectInventoryButtons();addAssistantCard();}

  document.addEventListener('click',e=>{
    const btn=e.target.closest('.mk-action.primary.POST');
    if(!btn) return;
    const row=btn.closest('tr,.mk-mobile-card');
    if(!row) return;
    const stock=(row.querySelector('.stock-copy strong')?.textContent || row.querySelector('.vehicle-copy span')?.textContent.replace(/^Stock\s+/,'') || '').trim();
    const v=(state.inventory||[]).find(x=>String(x.stock)===stock);
    if(!v) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    window.autoFillMarketplace(v.id);
  },true);

  const observer=new MutationObserver(()=>requestAnimationFrame(enhance));
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('load',enhance);
  setTimeout(enhance,300);
})();