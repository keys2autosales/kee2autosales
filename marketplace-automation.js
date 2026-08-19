// Keys2AutoSales Phase 2 — IDMS-driven Marketplace Automation Queue
(function(){
  const ACTIVITY_API='/api/inventory-activity';
  let latestActivity=null;
  let changeByVehicle=new Map();

  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const norm=s=>String(s??'').trim().toUpperCase();
  const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(n||0));

  function vehicleKeys(v){
    const keys=[];
    if(v?.vin) keys.push(`vin:${norm(v.vin)}`);
    if(v?.stock) keys.push(`stock:${norm(v.stock)}`);
    return keys;
  }
  function changeKeys(c){
    const keys=[];
    if(c?.vin) keys.push(`vin:${norm(c.vin)}`);
    if(c?.stock_number) keys.push(`stock:${norm(c.stock_number)}`);
    return keys;
  }
  function rebuildChangeMap(){
    changeByVehicle=new Map();
    for(const c of latestActivity?.changes||[]){
      for(const key of changeKeys(c)) if(!changeByVehicle.has(key)) changeByVehicle.set(key,c);
    }
  }
  function changeFor(v){
    for(const key of vehicleKeys(v)){const c=changeByVehicle.get(key);if(c)return c;}
    return null;
  }

  function baseMarketplaceAction(v){
    if(['Sold','Wholesale','Removed'].includes(v?.status)) return 'REMOVE';
    if(v?.fbStatus==='VERIFY') return 'VERIFY';
    if(!v?.fbPosted) return 'POST';
    if(v?.fbPrice && Number(v.fbPrice)!==Number(v.price)) return 'UPDATE PRICE';
    const last=v?.fbLastRenewed||v?.fbPostedDate;
    if(last && typeof daysSince==='function' && daysSince(last)>=Number(state?.settings?.renewalDays||7)) return 'RENEW';
    return 'LIVE';
  }

  function automationFor(v){
    const c=changeFor(v);
    const f=c?.changed_fields||{};
    if(c?.change_type==='removed'||['Sold','Wholesale','Removed'].includes(v?.status)) return {action:'REMOVE',reason:'No longer in current IDMS Available inventory',change:c};
    if(c?.change_type==='returned') return {action:v?.fbPosted?'VERIFY':'RELIST',reason:'Vehicle returned to available inventory',change:c};
    if(c?.change_type==='new') return {action:v?.fbPosted?'VERIFY':'POST',reason:'New inventory detected in IDMS',change:c};
    if(f.dealer_price) return {action:v?.fbPosted?'UPDATE PRICE':'POST',reason:`Dealer price changed ${money(f.dealer_price.from)} → ${money(f.dealer_price.to)}`,change:c};
    if(f.photo_count) return {action:v?.fbPosted?'REFRESH PHOTOS':'POST',reason:`Photo count changed ${Number(f.photo_count.from||0)} → ${Number(f.photo_count.to||0)}`,change:c};
    if(c?.change_type==='updated') return {action:v?.fbPosted?'VERIFY':'POST',reason:'Vehicle details changed in IDMS',change:c};
    const action=baseMarketplaceAction(v);
    const reasons={POST:'Not posted to Marketplace',RENEW:'Listing reached renewal age',VERIFY:'Listing needs verification','UPDATE PRICE':'Marketplace price differs from dealer price',LIVE:'Listing appears current'};
    return {action,reason:reasons[action]||'Marketplace action required',change:c};
  }

  function ensureStyles(){
    if(document.getElementById('marketplaceAutomationStyles'))return;
    const style=document.createElement('style');style.id='marketplaceAutomationStyles';style.textContent=`
      .marketplace-auto-banner{background:#0f172a;color:#fff;border-radius:16px;padding:14px 16px;margin:0 0 14px;display:flex;justify-content:space-between;gap:16px;align-items:center}
      .marketplace-auto-banner strong{display:block;font-size:14px}.marketplace-auto-banner span{font-size:11px;color:#cbd5e1}
      .marketplace-auto-counts{display:flex;gap:8px;flex-wrap:wrap}.marketplace-auto-count{background:#fff;color:#111827;border-radius:10px;padding:7px 10px;text-align:center;min-width:62px}.marketplace-auto-count small{display:block;font-size:9px;color:#64748b}.marketplace-auto-count b{font-size:16px}
      .automation-reason{font-size:11px;color:var(--muted);margin-top:5px;font-weight:600}
      .badge.UPDATE-PRICE,.badge.REFRESH-PHOTOS{background:#dbeafe;color:#1d4ed8}.badge.RELIST{background:#dcfce7;color:#166534}
      .marketplace-card.action-UPDATE-PRICE,.marketplace-card.action-REFRESH-PHOTOS{border-left-color:#1d4ed8}.marketplace-card.action-RELIST{border-left-color:#15803d}
      @media(max-width:700px){.marketplace-auto-banner{display:block}.marketplace-auto-counts{margin-top:10px}}
    `;document.head.appendChild(style);
  }

  function ensureFilter(segmented,action,label){
    if(segmented.querySelector(`[data-marketing-filter="${action}"]`))return;
    const b=document.createElement('button');b.className='seg';b.dataset.marketingFilter=action;b.textContent=label;segmented.appendChild(b);
    b.addEventListener('click',()=>{segmented.querySelectorAll('.seg').forEach(x=>x.classList.remove('active'));b.classList.add('active');window.renderMarketing();});
  }

  function actionClass(action){return String(action||'').replaceAll(' ','-');}
  function renderButtons(v,action){
    const common=`<button class="btn small" onclick="copyAd('${v.id}','fb')">Copy Ad</button><button class="btn small" onclick="openMarketplace('${v.id}')">Open Marketplace</button>`;
    if(action==='REMOVE') return `${common}<button class="btn small danger" onclick="markMarketplaceRemoved('${v.id}')">Mark Removed</button>`;
    if(action==='RENEW') return `${common}<button class="btn small" onclick="markMarketplaceRenewed('${v.id}')">Mark Renewed</button>`;
    if(action==='VERIFY') return `${common}<button class="btn small" onclick="markMarketplaceVerified('${v.id}')">Verify Live</button>`;
    if(action==='POST'||action==='RELIST') return `${common}<button class="btn small" onclick="markMarketplacePosted('${v.id}')">Mark Posted</button>`;
    if(action==='UPDATE PRICE'||action==='REFRESH PHOTOS') return `${common}<button class="btn small" onclick="editMarketplace('${v.id}')">Listing Details</button><button class="btn small" onclick="markMarketplaceVerified('${v.id}')">Verify Updated</button>`;
    return common;
  }

  window.renderMarketing=function(){
    ensureStyles();
    const marketing=document.getElementById('marketing');if(!marketing)return;
    const segmented=marketing.querySelector('.segmented');
    if(segmented){
      ensureFilter(segmented,'UPDATE PRICE','Price');ensureFilter(segmented,'REFRESH PHOTOS','Photos');ensureFilter(segmented,'RELIST','Relist');ensureFilter(segmented,'VERIFY','Verify');
    }
    const active=segmented?.querySelector('.seg.active')?.dataset.marketingFilter||'all';
    const items=(state?.inventory||[]).map(v=>({v,...automationFor(v)}));
    const counts={};items.forEach(x=>counts[x.action]=(counts[x.action]||0)+1);

    let banner=document.getElementById('marketplaceAutomationBanner');
    if(!banner){banner=document.createElement('div');banner.id='marketplaceAutomationBanner';banner.className='marketplace-auto-banner';const head=marketing.querySelector('.screen-head');head?.insertAdjacentElement('afterend',banner);}
    const sync=latestActivity?.snapshot?.imported_at?new Date(latestActivity.snapshot.imported_at).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'No IDMS sync';
    banner.innerHTML=`<div><strong>⚡ Marketplace Automation Queue</strong><span>Driven by latest verified IDMS changes • ${esc(sync)}</span></div><div class="marketplace-auto-counts">${[['POST','Post'],['UPDATE PRICE','Price'],['REFRESH PHOTOS','Photos'],['REMOVE','Remove'],['RENEW','Renew']].map(([a,l])=>`<div class="marketplace-auto-count"><small>${l}</small><b>${Number(counts[a]||0)}</b></div>`).join('')}</div>`;

    const priority={'REMOVE':1,'POST':2,'RELIST':2,'UPDATE PRICE':3,'REFRESH PHOTOS':4,'RENEW':5,'VERIFY':6,'LIVE':7};
    let rows=items.filter(x=>active==='all'||x.action===active).sort((a,b)=>(priority[a.action]||99)-(priority[b.action]||99));
    const host=document.getElementById('marketingList');if(!host)return;
    host.innerHTML=rows.length?rows.map(({v,action,reason})=>{
      const cls=actionClass(action);
      return `<div class="vehicle-card marketplace-card action-${cls}"><div class="card-top"><div><div class="card-title">${esc(v.year)} ${esc(v.make)} ${esc(v.model)}</div><div class="meta">Stock ${esc(v.stock||'—')} • Dealer ${money(v.price)}</div><div class="automation-reason">${esc(reason)}</div></div><span class="badge ${cls}">${esc(action)}</span></div><div class="card-grid"><div class="mini"><span>Marketplace Price</span><strong>${v.fbPrice?money(v.fbPrice):'—'}</strong></div><div class="mini"><span>Last Renewed</span><strong>${esc(v.fbLastRenewed||'—')}</strong></div><div class="mini"><span>Photos</span><strong>${Number(v.photos||0)}</strong></div><div class="mini"><span>IDMS Status</span><strong>${esc(v.status||'—')}</strong></div></div><div class="actions">${renderButtons(v,action)}</div></div>`;
    }).join(''):'<p class="muted">No vehicles match this Marketplace action.</p>';
  };

  // Feed the automation engine into dashboard action counts as well.
  window.actionFor=(v,channel)=>channel==='fb'?automationFor(v).action:'OK';
  window.inventoryAction=v=>automationFor(v).action;

  async function loadActivity(){
    try{const r=await fetch(ACTIVITY_API,{cache:'no-store'});const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.error||`Activity failed (${r.status})`);latestActivity=body;rebuildChangeMap();if(document.getElementById('marketing')?.classList.contains('active'))window.renderMarketing();}
    catch(err){console.error('Marketplace automation activity unavailable:',err);}
  }
  document.addEventListener('click',e=>{const nav=e.target.closest('[data-nav]');if(nav?.dataset.nav==='marketing')setTimeout(()=>{loadActivity().then?.(()=>{});window.renderMarketing();},50);});
  window.addEventListener('focus',loadActivity);
  setTimeout(loadActivity,700);
})();
