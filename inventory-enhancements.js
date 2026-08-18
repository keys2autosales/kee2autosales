// Keys2AutoSales inventory + Marketplace usability enhancements
(function(){
  function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
  function cleanModel(s){
    return String(s||'').replace(/\s*-\s*\d{1,3}(?:,\d{3})*\s*-\s*$/,'').trim();
  }
  function dealerPrice(v){
    const n=Number(v?.price||0);
    return n>0?money(n):'Price Needed';
  }
  function vehicleName(v){
    return [v?.year,v?.make,cleanModel(v?.model)].filter(Boolean).join(' ');
  }

  window.cleanVehicleModel=cleanModel;
  window.displayDealerPrice=dealerPrice;
  window.vehicleDisplayName=vehicleName;

  // Missing dealer pricing is a required inventory update before advertising.
  const baseMarketplaceAction=window.marketplaceAction;
  if(typeof baseMarketplaceAction==='function'){
    window.marketplaceAction=function(v){
      if(!Number(v?.price||0) && !['Sold','Wholesale','Removed'].includes(v?.status)) return 'UPDATE';
      return baseMarketplaceAction(v);
    };
  }

  window.renderInventory=function(){
    const host=document.getElementById('inventoryList');
    if(!host)return;
    const q=document.getElementById('inventorySearch')?.value?.toLowerCase()||'';
    const f=document.getElementById('inventoryFilter')?.value||'all';
    const rows=(state.inventory||[]).filter(v=>{
      const text=`${v.stock} ${v.vin} ${v.year} ${v.make} ${cleanModel(v.model)}`.toLowerCase();
      if(q&&!text.includes(q))return false;
      const action=typeof marketplaceAction==='function'?marketplaceAction(v):'POST';
      if(f==='action')return action!=='LIVE';
      if(f!=='all'&&v.status!==f)return false;
      return true;
    });
    host.innerHTML=rows.length?rows.map(v=>{
      const action=typeof marketplaceAction==='function'?marketplaceAction(v):'POST';
      return `<div class="vehicle-card">
        <div class="card-top"><div><div class="card-title">${esc(vehicleName(v))}</div><div class="meta">Stock ${esc(v.stock||'—')} • ${esc(v.vin||'No VIN')}</div></div><span class="badge ${esc(v.status)}">${esc(v.status)}</span></div>
        <div class="card-grid">
          <div class="mini"><span>Dealer Price</span><strong>${dealerPrice(v)}</strong></div>
          <div class="mini"><span>Mileage</span><strong>${Number(v.mileage||0).toLocaleString()}</strong></div>
          <div class="mini"><span>Marketplace</span><strong>${v.fbPosted?'Posted':'Not Posted'}</strong></div>
          <div class="mini"><span>Action</span><strong>${action}${!Number(v.price||0)?' • PRICE NEEDED':''}</strong></div>
        </div>
        <div class="actions"><span class="badge ${action}">${action}</span><button class="btn small" onclick="editVehicle('${esc(v.id)}')">Edit</button><button class="btn small" onclick="copyAd('${esc(v.id)}','fb')">Copy Ad</button><button class="btn small" onclick="openMarketplace('${esc(v.id)}')">Open FB</button></div>
      </div>`;
    }).join(''):'<p class="muted">No cloud inventory yet. Add a vehicle or import your inventory export.</p>';
  };

  // Facebook ad copy uses the saved Keys2AutoSales sales workflow and never advertises a $0 price.
  window.copyAd=function(id,channel){
    const v=(state.inventory||[]).find(x=>x.id===id);if(!v)return;
    if(channel==='fb'&&!Number(v.price||0)){
      alert('This vehicle needs a dealer price before the Marketplace ad is ready.');
      return;
    }
    const name=vehicleName(v);
    const price=Number(v.price||0)>0?money(v.price):'Call for price';
    const mileage=Number(v.mileage||0).toLocaleString();
    const fb=`🚙 ${name} – Available Now 🚙\n\n💰 Price: ${price}\n📍 Mesa, AZ\n\nVehicle Details:\n• ${mileage} miles\n• Stock #: ${v.stock||'—'}\n• VIN: ${v.vin||'—'}${v.color?`\n• Exterior: ${v.color}`:''}\n\nFinancing & Options:\n✅ First-Time Buyer Program\n✅ Social Security / Retirement Income\n✅ All Credit Types Welcome\n✅ Buy Here Pay Here & In-House Financing Options\n✅ Trade-Ins Accepted\n\n📅 Schedule a test drive:\n${state.settings.bookingLink}\n\n📝 Credit application:\n${state.settings.applicationLink}\n\nMessage me for availability or to set up a test drive.`;
    const cl=`${name} - ${price} - Financing Available\n\nMileage: ${mileage}\nStock #: ${v.stock||'—'}\nVIN: ${v.vin||'—'}\nLocation: ${state.settings.dealerAddress}\n\nFinancing available • Trade-ins accepted • First-time buyer options available\n\nSchedule: ${state.settings.bookingLink}\nApply: ${state.settings.applicationLink}`;
    navigator.clipboard.writeText(channel==='fb'?fb:cl).then(()=>alert(`${channel==='fb'?'Facebook Marketplace':'Craigslist'} ad copied.`)).catch(()=>alert('Could not copy the ad.'));
  };

  // Re-render after cloud inventory finishes loading and whenever this enhancement loads.
  setTimeout(()=>{try{window.renderInventory();}catch(e){console.error(e);}},150);
})();