// Keys2AutoSales -> Facebook Marketplace Social Listing Assistant handoff
(function(){
  const CREATE_URL='https://www.facebook.com/marketplace/create/vehicle';

  function encodePayload(obj){
    const json=JSON.stringify(obj);
    return btoa(unescape(encodeURIComponent(json))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }

  function vehiclePayload(v){
    return {
      id:v.id,
      year:Number(v.year||0)||'',
      make:v.make||'',
      model:v.model||'',
      mileage:Number(v.mileage||0)||'',
      price:Number(v.price||0)||'',
      stock:v.stock||'',
      vin:v.vin||'',
      color:v.color||'',
      bookingLink:state.settings?.bookingLink||'',
      applicationLink:state.settings?.applicationLink||''
    };
  }

  window.autoFillMarketplace=function(id){
    const v=(state.inventory||[]).find(x=>x.id===id);
    if(!v) return alert('Vehicle not found.');
    if(!Number(v.price||0)) return alert('Add a dealer price before sending this vehicle to Marketplace.');
    const payload=vehiclePayload(v);
    localStorage.setItem('k2_marketplace_last_payload',JSON.stringify(payload));
    window.open(`${CREATE_URL}#k2=${encodePayload(payload)}`,'_blank','noopener');
  };

  function injectButtons(){
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

  const oldRenderInventory=window.renderInventory;
  if(typeof oldRenderInventory==='function'){
    window.renderInventory=function(){oldRenderInventory();setTimeout(injectButtons,0);};
  }

  // Marketplace mockup rows are rebuilt separately; capture clicks on the primary POST action.
  document.addEventListener('click',e=>{
    const btn=e.target.closest('.mk-action.primary.POST');
    if(!btn) return;
    const row=btn.closest('tr,.mk-mobile-card');
    if(!row) return;
    const stock=(row.querySelector('.stock-copy strong')?.textContent || row.querySelector('.vehicle-copy span')?.textContent.replace(/^Stock\s+/,'') || '').trim();
    const v=(state.inventory||[]).find(x=>String(x.stock)===stock);
    if(!v) return;
    e.preventDefault();e.stopImmediatePropagation();
    window.autoFillMarketplace(v.id);
  },true);

  // Small connection/help card on the Marketplace screen.
  function addAssistantCard(){
    const host=document.getElementById('marketing');
    if(!host || host.querySelector('.k2-assistant-card')) return;
    const card=document.createElement('div');
    card.className='panel compact k2-assistant-card';
    card.innerHTML='<div class="panel-head"><div><h3>Social Listing Assistant</h3><p class="muted">Chrome extension autofills Marketplace vehicle listings from Keys2AutoSales.</p></div><span class="badge LIVE">Extension Workflow Ready</span></div>';
    host.prepend(card);
  }

  const oldRenderMarketing=window.renderMarketing;
  if(typeof oldRenderMarketing==='function'){
    window.renderMarketing=function(){oldRenderMarketing();setTimeout(addAssistantCard,0);};
  }

  setTimeout(()=>{injectButtons();addAssistantCard();},500);
})();