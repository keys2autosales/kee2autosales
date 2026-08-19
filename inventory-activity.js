// Keys2AutoSales Phase 2 — Inventory Activity Command Center
(function(){
  const API='/api/inventory-activity';
  let activity=null;
  let activeFilter='all';

  const fmtDate=v=>v?new Date(v).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'—';
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(n||0));

  function ensureStyles(){
    if(document.getElementById('inventoryActivityStyles')) return;
    const style=document.createElement('style');
    style.id='inventoryActivityStyles';
    style.textContent=`
      .idms-command{margin:16px 0;border:1px solid var(--line);background:#fff;border-radius:18px;padding:16px;box-shadow:var(--shadow)}
      .idms-command-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:14px}
      .idms-command-head h3{margin:0;font-size:18px}.idms-command-head p{margin:4px 0 0}
      .idms-sync-time{font-size:11px;color:var(--muted);text-align:right;white-space:nowrap}
      .idms-kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:14px}
      .idms-kpi{background:#f8fafc;border:1px solid var(--line);border-radius:12px;padding:10px}
      .idms-kpi span{display:block;font-size:10px;color:var(--muted);margin-bottom:3px}.idms-kpi strong{font-size:19px}
      .idms-kpi.new strong{color:#15803d}.idms-kpi.removed strong{color:#b91c1c}.idms-kpi.updated strong{color:#9a3412}.idms-kpi.price strong{color:#1d4ed8}
      .idms-filters{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px}.idms-filter{border:1px solid var(--line);background:#fff;border-radius:999px;padding:7px 11px;font-weight:700;font-size:12px;cursor:pointer}
      .idms-filter.active{background:#111827;color:#fff;border-color:#111827}
      .idms-change-list{display:grid;gap:8px}.idms-change{border:1px solid var(--line);border-radius:12px;padding:10px 12px;display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
      .idms-change-main strong{display:block}.idms-change-main small{display:block;color:var(--muted);margin-top:3px}.idms-change-fields{font-size:11px;color:var(--muted);text-align:right}
      .idms-change-type{display:inline-block;font-size:10px;font-weight:800;border-radius:999px;padding:4px 7px;margin-right:6px;text-transform:uppercase}
      .idms-change-type.new{background:#dcfce7;color:#166534}.idms-change-type.updated{background:#ffedd5;color:#9a3412}.idms-change-type.removed{background:#fee2e2;color:#991b1b}.idms-change-type.returned{background:#dbeafe;color:#1d4ed8}
      .idms-empty{padding:14px;color:var(--muted);text-align:center;background:#f8fafc;border-radius:12px}
      @media(max-width:900px){.idms-kpis{grid-template-columns:repeat(3,1fr)}}
      @media(max-width:520px){.idms-command-head{display:block}.idms-sync-time{text-align:left;margin-top:6px}.idms-kpis{grid-template-columns:repeat(2,1fr)}.idms-change{display:block}.idms-change-fields{text-align:left;margin-top:6px}}
    `;
    document.head.appendChild(style);
  }

  function fieldSummary(c){
    const f=c.changed_fields||{};
    const parts=[];
    if(f.dealer_price) parts.push(`Price ${money(f.dealer_price.from)} → ${money(f.dealer_price.to)}`);
    if(f.mileage) parts.push(`Mileage ${Number(f.mileage.from||0).toLocaleString()} → ${Number(f.mileage.to||0).toLocaleString()}`);
    if(f.photo_count) parts.push(`Photos ${f.photo_count.from||0} → ${f.photo_count.to||0}`);
    if(f.color) parts.push(`Color ${f.color.from||'—'} → ${f.color.to||'—'}`);
    if(f.inventory_status) parts.push(`${f.inventory_status.from||'—'} → ${f.inventory_status.to||'—'}`);
    if(!parts.length){
      const keys=Object.keys(f);
      if(keys.length) parts.push(keys.map(k=>k.replaceAll('_',' ')).join(', '));
    }
    return parts.join(' • ');
  }

  function renderChanges(){
    const host=document.getElementById('idmsChangeList');
    if(!host||!activity) return;
    let rows=activity.changes||[];
    if(activeFilter==='price') rows=rows.filter(c=>c.changed_fields&&c.changed_fields.dealer_price);
    else if(activeFilter!=='all') rows=rows.filter(c=>c.change_type===activeFilter);
    rows=rows.slice(0,40);
    host.innerHTML=rows.length?rows.map(c=>`
      <div class="idms-change">
        <div class="idms-change-main">
          <strong><span class="idms-change-type ${esc(c.change_type)}">${esc(c.change_type)}</span>${esc(c.vehicle_name||'Vehicle')}</strong>
          <small>Stock ${esc(c.stock_number||'—')} • ${esc(c.vin||'No VIN')}</small>
        </div>
        <div class="idms-change-fields">${esc(fieldSummary(c)||'Inventory activity detected')}</div>
      </div>`).join(''):`<div class="idms-empty">No changes in this category for the latest sync.</div>`;
  }

  function renderPanel(){
    ensureStyles();
    const inventory=document.getElementById('inventory');
    if(!inventory) return;
    let panel=document.getElementById('idmsCommandCenter');
    if(!panel){
      panel=document.createElement('div'); panel.id='idmsCommandCenter'; panel.className='idms-command';
      const importPanel=inventory.querySelector('.panel.compact');
      if(importPanel) importPanel.insertAdjacentElement('afterend',panel); else inventory.prepend(panel);
    }
    if(!activity||!activity.snapshot){
      panel.innerHTML='<div class="idms-empty">No verified IDMS cloud snapshot yet.</div>';
      return;
    }
    const s=activity.summary||{};
    panel.innerHTML=`
      <div class="idms-command-head">
        <div><h3>Inventory Command Center</h3><p class="muted">Latest verified DealerSocket sync and inventory changes.</p></div>
        <div class="idms-sync-time">Last IDMS sync<br><strong>${esc(fmtDate(activity.snapshot.imported_at))}</strong></div>
      </div>
      <div class="idms-kpis">
        <div class="idms-kpi"><span>Available Snapshot</span><strong>${Number(s.total||0)}</strong></div>
        <div class="idms-kpi new"><span>New</span><strong>${Number(s.new||0)}</strong></div>
        <div class="idms-kpi updated"><span>Updated</span><strong>${Number(s.updated||0)}</strong></div>
        <div class="idms-kpi removed"><span>Sold / Removed</span><strong>${Number(s.removed||0)}</strong></div>
        <div class="idms-kpi price"><span>Price Changes</span><strong>${Number(s.price_changes||0)}</strong></div>
        <div class="idms-kpi"><span>Unchanged</span><strong>${Number(s.unchanged||0)}</strong></div>
      </div>
      <div class="idms-filters">
        <button class="idms-filter active" data-idms-filter="all">All Changes</button>
        <button class="idms-filter" data-idms-filter="new">New</button>
        <button class="idms-filter" data-idms-filter="updated">Updated</button>
        <button class="idms-filter" data-idms-filter="price">Price Changes</button>
        <button class="idms-filter" data-idms-filter="removed">Sold/Removed</button>
        <button class="idms-filter" data-idms-filter="returned">Returned</button>
      </div>
      <div id="idmsChangeList" class="idms-change-list"></div>`;
    panel.querySelectorAll('[data-idms-filter]').forEach(btn=>btn.addEventListener('click',()=>{
      activeFilter=btn.dataset.idmsFilter;
      panel.querySelectorAll('[data-idms-filter]').forEach(x=>x.classList.toggle('active',x===btn));
      renderChanges();
    }));
    renderChanges();
  }

  function injectDashboardKpis(){
    if(!activity?.snapshot) return;
    const grid=document.getElementById('kpiGrid'); if(!grid) return;
    grid.querySelectorAll('[data-phase2-kpi]').forEach(x=>x.remove());
    const s=activity.summary||{};
    [['New Inventory',s.new],['Sold/Removed',s.removed],['Price Changes',s.price_changes],['IDMS Sync',activity.snapshot.row_count]].forEach(([label,value])=>{
      const d=document.createElement('div'); d.className='kpi'; d.dataset.phase2Kpi='1'; d.innerHTML=`<div class="label">${esc(label)}</div><div class="value">${Number(value||0)}</div>`; grid.appendChild(d);
    });
  }

  async function loadActivity(){
    try{
      const r=await fetch(API,{cache:'no-store'}); const body=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(body.error||`Inventory activity failed (${r.status})`);
      activity=body; renderPanel(); injectDashboardKpis();
    }catch(err){console.error('Inventory activity unavailable:',err);}
  }

  document.addEventListener('click',e=>{
    const nav=e.target.closest('[data-nav]');
    if(nav&&(nav.dataset.nav==='inventory'||nav.dataset.nav==='dashboard')) setTimeout(()=>{renderPanel();injectDashboardKpis();},30);
  });
  window.addEventListener('focus',()=>loadActivity());
  setTimeout(loadActivity,500);
})();
