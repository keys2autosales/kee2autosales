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

  // Marketplace mockup rows are rebuilt dynamically. Capture POST clicks and replace the normal Facebook-open action with the autofill handoff.
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

  // Keep enhancements present after any inventory/Marketplace rerender.
  const observer=new MutationObserver(()=>requestAnimationFrame(enhance));
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('load',enhance);
  setTimeout(enhance,300);
})();