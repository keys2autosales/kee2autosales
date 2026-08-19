// Keys2AutoSales Marketplace readiness guard
(function(){
  const REQUIRED=[
    ['year','Year'],['make','Make'],['model','Model'],['mileage','Mileage'],['price','Price'],['color','Exterior Color'],
    ['interiorColor','Interior Color'],['bodyStyle','Body Style'],['vehicleCondition','Condition'],['fuelType','Fuel Type'],['transmission','Transmission']
  ];

  function value(v,key){
    if(key==='interiorColor') return v.interiorColor||v.interior_color||'';
    if(key==='bodyStyle') return v.bodyStyle||v.body_style||'';
    if(key==='vehicleCondition') return v.vehicleCondition||v.vehicle_condition||'';
    if(key==='fuelType') return v.fuelType||v.fuel_type||'';
    return v[key];
  }

  window.marketplaceReadiness=function(v){
    const missing=REQUIRED.filter(([key])=>{
      const x=value(v,key);
      if(key==='mileage'||key==='price') return !Number(x);
      return x===undefined||x===null||String(x).trim()==='';
    }).map(([,label])=>label);
    const photoUrls=Array.isArray(v.photoUrls)?v.photoUrls:(Array.isArray(v.photo_urls)?v.photo_urls:[]);
    return {ready:missing.length===0,missing,photosReady:photoUrls.length>0,photoCount:photoUrls.length};
  };

  function vehicleIdFromCard(card){
    const edit=card.querySelector('[onclick*="editVehicle"]');
    const m=(edit?.getAttribute('onclick')||'').match(/editVehicle\('([^']+)'\)/);
    return m?.[1]||'';
  }

  function readinessBadge(info){
    const span=document.createElement('span');
    span.className='k2-readiness-badge';
    span.textContent=info.ready?'Marketplace Ready':`Missing ${info.missing.length} Details`;
    span.title=info.ready?(info.photosReady?`Ready • ${info.photoCount} photo${info.photoCount===1?'':'s'}`:'Vehicle details ready • Photos still needed'):`Missing: ${info.missing.join(', ')}`;
    Object.assign(span.style,{
      display:'inline-flex',alignItems:'center',gap:'6px',padding:'5px 9px',borderRadius:'999px',fontSize:'11px',fontWeight:'700',
      background:info.ready?'#dcfce7':'#fef3c7',color:info.ready?'#166534':'#92400e',border:`1px solid ${info.ready?'#bbf7d0':'#fde68a'}`
    });
    return span;
  }

  function enhanceCards(){
    document.querySelectorAll('#inventoryList .vehicle-card').forEach(card=>{
      const id=vehicleIdFromCard(card); if(!id) return;
      const v=(window.state?.inventory||[]).find(x=>String(x.id)===String(id)); if(!v) return;
      const info=window.marketplaceReadiness(v);
      let badge=card.querySelector('.k2-readiness-badge');
      if(!badge){
        badge=readinessBadge(info);
        const top=card.querySelector('.card-top > div')||card.querySelector('.card-top')||card;
        top.appendChild(badge);
      }else{
        const fresh=readinessBadge(info);
        badge.replaceWith(fresh);
      }
      const btn=card.querySelector('.k2-autofill-btn');
      if(btn){
        btn.dataset.marketplaceReady=info.ready?'1':'0';
        btn.title=info.ready?'Open Facebook Auto-Fill':`Complete first: ${info.missing.join(', ')}`;
      }
    });
  }

  function renderSummary(){
    const host=document.getElementById('inventory'); if(!host) return;
    let panel=host.querySelector('.k2-readiness-summary');
    if(!panel){
      panel=document.createElement('div'); panel.className='panel compact k2-readiness-summary';
      const importPanel=host.querySelector('.panel.compact');
      importPanel?.after(panel);
    }
    const vehicles=window.state?.inventory||[];
    const infos=vehicles.map(v=>window.marketplaceReadiness(v));
    const ready=infos.filter(x=>x.ready).length;
    const incomplete=infos.length-ready;
    const withPhotos=infos.filter(x=>x.photosReady).length;
    panel.innerHTML=`<div class="panel-head"><div><h3>Marketplace Readiness</h3><p class="muted">Complete vehicle data before Auto-Fill sends anything to Facebook.</p></div></div><div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px"><div class="mini"><span>Ready</span><strong>${ready}</strong></div><div class="mini"><span>Missing Details</span><strong>${incomplete}</strong></div><div class="mini"><span>With Photos</span><strong>${withPhotos}</strong></div></div>`;
  }

  function wrapAutoFill(){
    if(window.__k2ReadinessWrapped||typeof window.autoFillMarketplace!=='function') return;
    window.__k2ReadinessWrapped=true;
    const original=window.autoFillMarketplace;
    window.autoFillMarketplace=async function(id){
      const v=(window.state?.inventory||[]).find(x=>String(x.id)===String(id));
      if(!v) return original(id);
      const info=window.marketplaceReadiness(v);
      if(!info.ready){
        alert(`Marketplace listing not ready yet.\n\nMissing: ${info.missing.join(', ')}\n\nOpen Edit Vehicle, complete these fields, save, then try Auto-Fill FB again.`);
        if(typeof window.editVehicle==='function') window.editVehicle(id);
        return;
      }
      if(!info.photosReady){
        const proceed=confirm('Vehicle details are complete, but no photo URLs are saved yet. Continue to Facebook without automatic photos?');
        if(!proceed) return;
      }
      return original(id);
    };
  }

  function enhance(){wrapAutoFill();enhanceCards();renderSummary();}
  const observer=new MutationObserver(()=>requestAnimationFrame(enhance));
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('load',enhance);
  setTimeout(enhance,500);
})();