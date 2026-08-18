// Marketplace mockup UI layer — keeps existing cloud actions and data intact.
(function(){
  let filter='all';
  const actionMeta={
    REMOVE:{priority:'HIGH',priorityClass:'high',label:'REMOVE',note:'Sold / unavailable'},
    POST:{priority:'HIGH',priorityClass:'high',label:'NOT POSTED',note:'Needs Post'},
    UPDATE:{priority:'MEDIUM',priorityClass:'medium',label:'UPDATE',note:'Price Mismatch'},
    RENEW:{priority:'MEDIUM',priorityClass:'medium',label:'RENEW',note:'Due for Renewal'},
    LIVE:{priority:'LOW',priorityClass:'low',label:'LIVE',note:'Active'},
    VERIFY:{priority:'LOW',priorityClass:'low',label:'VERIFY',note:'Check Status'}
  };
  function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
  function fmtDate(d){if(!d)return '—';const x=new Date(d+'T12:00:00');return isNaN(x)?d:x.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});}
  function daysLive(v){if(!v.fbPostedDate)return '—';return Math.max(0,daysSince(v.fbPostedDate));}
  function counts(items){const c={POST:0,RENEW:0,UPDATE:0,REMOVE:0,VERIFY:0,LIVE:0};items.forEach(x=>c[x.action]=(c[x.action]||0)+1);return c;}
  function actionButtons(v,action){
    const id=esc(v.id);
    const open=`<button class="mk-action" onclick="openMarketplace('${id}')">${v.fbListingUrl?'Open Listing ↗':'Open Marketplace ↗'}</button>`;
    if(action==='REMOVE') return `${open}<button class="mk-action primary REMOVE" onclick="markMarketplaceRemoved('${id}')">Mark Removed</button>`;
    if(action==='POST') return `<button class="mk-action" onclick="copyAd('${id}','fb')">Copy Ad ⧉</button><button class="mk-action primary POST" onclick="openMarketplace('${id}')">Post to Marketplace</button>`;
    if(action==='UPDATE') return `<button class="mk-action" onclick="copyAd('${id}','fb')">Copy Updated Ad ↗</button><button class="mk-action primary UPDATE" onclick="markMarketplaceUpdated('${id}')">Mark Updated</button>`;
    if(action==='RENEW') return `${open}<button class="mk-action primary RENEW" onclick="markMarketplaceRenewed('${id}')">Mark Renewed</button>`;
    if(action==='LIVE') return `${open}<button class="mk-action primary LIVE" onclick="markMarketplaceVerified('${id}')">Verify Live</button>`;
    return `<button class="mk-action" onclick="openMarketplace('${id}')">Search Marketplace</button><button class="mk-action primary VERIFY" onclick="markMarketplaceVerified('${id}')">Mark Verified</button>`;
  }
  window.markMarketplaceUpdated=async id=>{
    const v=state.inventory.find(x=>x.id===id);if(!v)return;
    const today=new Date().toISOString().slice(0,10);
    if(typeof patchMarketplace==='function') return patchMarketplace(id,{fbPosted:true,fbPrice:Number(v.price||0),fbLastVerified:today,fbStatus:'LIVE'});
  };
  function row(v,action){
    const m=actionMeta[action];const delta=(v.fbPrice&&Number(v.fbPrice)!==Number(v.price))?Number(v.fbPrice)-Number(v.price):0;
    return `<tr>
      <td><span class="priority-pill ${m.priorityClass}">${m.priority}</span><span class="priority-action ${action}">${action==='POST'?'NOT POSTED':action}</span></td>
      <td><div class="vehicle-inline"><div class="vehicle-thumb">🚙</div><div class="vehicle-copy"><strong>${esc(v.year)} ${esc(v.make)} ${esc(v.model)}</strong><span>${esc(v.color||'—')} • ${Number(v.mileage||0).toLocaleString()} mi</span></div></div></td>
      <td><div class="stock-copy"><strong>${esc(v.stock||'—')}</strong><span>${esc(v.vin||'—')}</span></div></td>
      <td>${money(v.price)}</td>
      <td class="${delta?'price-diff':''}">${v.fbPrice?money(v.fbPrice):'—'}${delta?`<small>${delta>0?'+':''}${money(delta)}</small>`:''}</td>
      <td><span class="status-pill ${action}">${m.label}</span><span class="status-note">${m.note}</span></td>
      <td>${daysLive(v)}</td>
      <td>${fmtDate(v.fbLastRenewed)}</td>
      <td><div class="mk-action-stack">${actionButtons(v,action)}</div></td>
    </tr>`;
  }
  function mobileCard(v,action){
    const m=actionMeta[action];
    return `<div class="mk-mobile-card"><div class="mk-mobile-head"><div class="mk-mobile-vehicle"><div class="vehicle-thumb">🚙</div><div class="vehicle-copy"><strong>${esc(v.year)} ${esc(v.make)} ${esc(v.model)}</strong><span>Stock ${esc(v.stock||'—')}</span></div></div><span class="status-pill ${action}">${m.label}</span></div><div class="mk-mobile-grid"><div class="mk-mobile-mini"><span>Dealer Price</span><strong>${money(v.price)}</strong></div><div class="mk-mobile-mini"><span>Marketplace</span><strong>${v.fbPrice?money(v.fbPrice):'—'}</strong></div><div class="mk-mobile-mini"><span>Days Live</span><strong>${daysLive(v)}</strong></div><div class="mk-mobile-mini"><span>Last Renewed</span><strong>${fmtDate(v.fbLastRenewed)}</strong></div></div><div class="mk-mobile-actions">${actionButtons(v,action)}</div></div>`;
  }
  function buildShell(){
    const side=document.querySelector('.desktop-sidebar');
    if(side&&!side.dataset.mocked){
      side.dataset.mocked='1';
      side.innerHTML=`<div class="brand-block"><div class="brand-mark">K2</div><div><strong>Keys<span style="color:#22c55e">2</span>AutoSales</strong><small>Car Sales Command Center</small></div></div>
      <div class="side-group"><button class="side-nav active" data-nav="dashboard"><span class="nav-icon">⌂</span><span>Home</span></button></div>
      <div class="side-group"><span class="side-label">SALES</span><button class="side-nav" data-nav="leads"><span class="nav-icon">♧</span><span>Leads</span></button><button class="side-nav" data-nav="inventory"><span class="nav-icon">▱</span><span>Inventory</span></button><button class="side-nav" data-nav="deals"><span class="nav-icon">◇</span><span>Deals</span></button><button class="side-nav" data-nav="tasks"><span class="nav-icon">☑</span><span>Tasks</span></button><button class="side-nav" data-nav="tasks"><span class="nav-icon">□</span><span>Calendar</span></button></div>
      <div class="side-group"><span class="side-label">MARKETING</span><button class="side-nav" data-nav="marketing"><span class="nav-icon">▣</span><span>Marketplace<small class="subnav">Work Queue</small></span></button><button class="side-nav" data-nav="marketing"><span class="nav-icon">▧</span><span>Ads Library</span></button></div>
      <div class="side-group"><span class="side-label">BUSINESS</span><button class="side-nav" data-nav="deals"><span class="nav-icon">▥</span><span>Reports</span></button><button class="side-nav" data-nav="settings"><span class="nav-icon">▤</span><span>Expenses</span></button><button class="side-nav" data-nav="settings"><span class="nav-icon">⚙</span><span>Settings</span></button></div>
      <div class="sidebar-goal"><span>Today's Goal</span><strong>4/8 <small style="display:inline;color:#fff">Completed</small></strong><div class="goal-progress"><i></i></div></div>`;
    }
    const top=document.querySelector('.topbar');
    if(top&&!top.dataset.mocked){
      top.dataset.mocked='1';
      top.innerHTML=`<div class="topbar-left"><span class="menu-glyph">☰</span><span class="page-title">Home</span></div><div class="topbar-right"><button class="lead-cta" id="mockLeadBtn">＋ Lead</button><button class="top-icon">□</button><button class="top-icon">♧</button><div class="profile-chip"><div class="profile-avatar">KS</div><div class="profile-copy"><strong>Keandre Scott</strong><small>Car Sales Pro</small></div><span>⌄</span></div></div>`;
      document.getElementById('mockLeadBtn').onclick=()=>document.getElementById('addLeadBtn')?.click();
    }
  }
  function pageTitle(id){return ({dashboard:'Home',inventory:'Inventory',marketing:'Marketplace',leads:'Leads',deals:'Deals',tasks:'Tasks',settings:'Settings'})[id]||'Car Sales Command Center';}
  document.addEventListener('click',e=>{const nav=e.target.closest('[data-nav]');if(nav){setTimeout(()=>{const t=document.querySelector('.page-title');if(t)t.textContent=pageTitle(nav.dataset.nav);},0);}});
  window.renderMarketing=function(){
    buildShell();
    const host=document.getElementById('marketing');if(!host)return;
    const items=(state.inventory||[]).map(v=>({v,action:marketplaceAction(v)}));const c=counts(items);
    const total=items.length,posted=items.filter(x=>x.v.fbPosted).length,attention=c.POST+c.RENEW+c.UPDATE+c.VERIFY;
    const filtered=items.filter(x=>filter==='all'||x.action===filter).sort((a,b)=>({REMOVE:1,POST:2,UPDATE:3,RENEW:4,VERIFY:5,LIVE:6}[a.action]-({REMOVE:1,POST:2,UPDATE:3,RENEW:4,VERIFY:5,LIVE:6}[b.action])));
    const today=new Date().toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric'});
    const tab=(key,label,count)=>`<button class="mk-tab ${filter===key?'active':''}" data-mk-filter="${key}">${label} (${count})</button>`;
    host.innerHTML=`<div class="mk-overview-layout"><div class="mk-summary-grid">
      <div class="mk-summary-card blue"><div class="ey">Marketplace Overview</div><div class="big">${total}</div><div class="desc">Total Inventory</div><div class="icon">🚙</div><div class="foot"><strong style="color:#16a34a">${posted}</strong> Posted &nbsp;&nbsp; <strong>${Math.max(0,total-posted)}</strong> Not Posted</div></div>
      <div class="mk-summary-card green"><div class="ey">Live & Active</div><div class="big">${c.LIVE}</div><div class="desc">Live Listings</div><div class="icon">●</div><div class="foot"><strong style="color:#16a34a">${total?Math.round(c.LIVE/total*100):0}%</strong> of inventory</div></div>
      <div class="mk-summary-card orange"><div class="ey">Need Attention</div><div class="big">${attention}</div><div class="desc">Require Action</div><div class="icon">!</div><div class="foot"><strong>${total?Math.round(attention/total*100):0}%</strong> of inventory</div></div>
      <div class="mk-summary-card red"><div class="ey">Remove</div><div class="big">${c.REMOVE}</div><div class="desc">Need to Remove</div><div class="icon">▣</div><div class="foot"><strong>${total?Math.round(c.REMOVE/total*100):0}%</strong> of inventory</div></div>
    </div><div class="mk-side-cards"><div class="mk-date-card">□ <strong>${today}</strong></div><div class="mk-views-card"><div class="ey">TOTAL VIEWS (30D)</div><strong>—</strong><small>Connect Meta analytics to populate</small></div></div></div>
    <div class="mk-toolbar"><div class="mk-tabs">${tab('all','All',total)}${tab('POST','Not Posted',c.POST)}${tab('LIVE','Live',c.LIVE)}${tab('RENEW','Renew',c.RENEW)}${tab('UPDATE','Update',c.UPDATE)}${tab('REMOVE','Remove',c.REMOVE)}${tab('VERIFY','Verify',c.VERIFY)}</div><div class="mk-toolbar-right"><select class="mk-select"><option>All Locations</option></select><select class="mk-select"><option>Sort: Priority</option></select></div></div>
    <div class="mk-table-wrap"><table class="mk-table"><thead><tr><th class="c-priority">Priority</th><th class="c-vehicle">Vehicle</th><th class="c-stock">Stock / VIN</th><th class="c-price">Dealer Price</th><th class="c-market">Marketplace Price</th><th class="c-status">Status</th><th class="c-days">Days Live</th><th class="c-renew">Last Renewed</th><th class="c-action">Action</th></tr></thead><tbody>${filtered.length?filtered.map(x=>row(x.v,x.action)).join(''):`<tr><td colspan="9">No vehicles in this filter.</td></tr>`}</tbody></table></div>
    <div class="mk-mobile-list">${filtered.map(x=>mobileCard(x.v,x.action)).join('')||'<p class="muted">No vehicles in this filter.</p>'}</div>
    <div class="mk-bottom-grid"><div class="mk-bottom-card"><h4>Daily Action Plan</h4><div class="action-plan"><span><i>1</i>Remove sold / unavailable vehicles <b style="color:#ef4444">(${c.REMOVE})</b></span><span><i>4</i>Renew stale listings <b style="color:#d97706">(${c.RENEW})</b></span><span><i>2</i>Post missing inventory <b style="color:#2563eb">(${c.POST})</b></span><span><i>5</i>Verify questionable listings <b style="color:#7c3aed">(${c.VERIFY})</b></span><span><i>3</i>Update price / photos <b style="color:#d97706">(${c.UPDATE})</b></span></div></div><div class="mk-bottom-card tip-card"><div class="bulb">💡</div><div><h4 style="color:#111827">Tip</h4><p>Renew listings every ${state.settings?.renewalDays||7} days to stay near the top of search results.</p></div></div><div class="mk-bottom-card"><h4>Marketplace Tips</h4><div class="tips-list"><div>Use high quality photos (10+ recommended)</div><div>Include mileage, features & condition</div><div>Respond to leads quickly</div><div>Renew listings every ${state.settings?.renewalDays||7} days</div></div></div></div>`;
    host.querySelectorAll('[data-mk-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.mkFilter;window.renderMarketing();});
  };
  buildShell();
  setTimeout(()=>{const active=document.querySelector('.screen.active')?.id||'dashboard';const t=document.querySelector('.page-title');if(t)t.textContent=pageTitle(active);if(document.getElementById('marketing'))window.renderMarketing();},50);
})();
