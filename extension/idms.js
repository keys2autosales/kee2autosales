(() => {
  const clean = v => (v || '').replace(/\s+/g, ' ').trim();
  const norm = v => clean(v).toLowerCase().replace(/[^a-z0-9]/g, '');
  const VIN_RE = /\b[A-HJ-NPR-Z0-9]{17}\b/i;

  function visible(el){
    if(!el) return false;
    const s=getComputedStyle(el), r=el.getBoundingClientRect();
    return s.display!=='none' && s.visibility!=='hidden' && r.width>0 && r.height>0;
  }

  function rowCells(row){
    let cells=[...row.querySelectorAll(':scope > td, :scope > [role="gridcell"], :scope > div, :scope > span')].filter(visible);
    if(cells.length<5) cells=[...row.querySelectorAll('td,[role="gridcell"],.cell,.grid-cell,.ui-grid-cell,.k-table-td')].filter(visible);
    return cells.map(c=>clean(c.innerText)).filter(Boolean);
  }

  function candidateRows(){
    const selectors=['tbody tr','[role="row"]','.ui-grid-row','.k-master-row','.k-table-row','.grid-row','.slick-row','.dx-data-row'];
    const seen=new Set(), out=[];
    for(const sel of selectors){
      for(const el of document.querySelectorAll(sel)){
        if(seen.has(el)||!visible(el)) continue;
        const txt=clean(el.innerText);
        if(VIN_RE.test(txt)){seen.add(el);out.push(el);}
      }
    }
    if(out.length) return out;

    // Last-resort: locate text nodes/elements containing a VIN and walk upward to a row-like container.
    for(const el of document.querySelectorAll('td,div,span,a')){
      if(!visible(el)) continue;
      const txt=clean(el.innerText);
      if(!VIN_RE.test(txt) || txt.length>80) continue;
      let p=el;
      for(let i=0;i<6 && p;i++,p=p.parentElement){
        const t=clean(p.innerText);
        if(VIN_RE.test(t) && /\b(19|20)\d{2}\b/.test(t) && t.length<800){
          if(!seen.has(p)){seen.add(p);out.push(p);} break;
        }
      }
    }
    return out;
  }

  function headersFromPage(){
    const headerSelectors=['thead th','[role="columnheader"]','.ui-grid-header-cell','.k-header','.grid-header-cell'];
    for(const sel of headerSelectors){
      const h=[...document.querySelectorAll(sel)].filter(visible).map(x=>clean(x.innerText)).filter(Boolean);
      if(h.some(x=>norm(x)==='vin') && h.length>=8) return h;
    }
    return ['Stock #','Year','Make','Model / Trim','Color','VIN','Location (DOL)','Days at Location','Status','Acquired Date','Price','Mileage','Pics'];
  }

  function parseDealerSocketCells(cells){
    // DealerSocket Available Inventory visible order observed in the IDMS grid.
    // Ignore trailing action/expense columns if present.
    const c=cells;
    const vinIndex=c.findIndex(x=>VIN_RE.test(x));
    const vin=vinIndex>=0?(c[vinIndex].match(VIN_RE)?.[0]||''):'';
    const yearIndex=c.findIndex(x=>/^(19|20)\d{2}$/.test(x));
    const statusIndex=c.findIndex(x=>/^(available|sold|pending|hold|service|wholesale)$/i.test(x));
    const priceIndex=c.findIndex(x=>/^\$?[\d,]+(?:\.\d{2})?$/.test(x) && /\$/.test(x));
    const mileageIndex=priceIndex>=0 ? c.slice(priceIndex+1).findIndex(x=>/^\d{1,7}$/.test(x.replace(/,/g,''))) : -1;
    const actualMileageIndex=mileageIndex>=0?priceIndex+1+mileageIndex:-1;

    // Prefer exact known DealerSocket positional layout when available.
    if(c.length>=12 && yearIndex>=0 && vinIndex>=0){
      const start=Math.max(0,yearIndex-1);
      const d=c.slice(start);
      return {
        stock_number:d[0]||'', year:d[1]||'', make:d[2]||'', model:d[3]||'', exterior_color:d[4]||'', vin:(d[5]||vin).replace(/[^A-HJ-NPR-Z0-9]/gi,''),
        location:d[6]||'', days_at_location:d[7]||'', status:d[8]||'', acquired_date:d[9]||'', price:d[10]||'', mileage:d[11]||'', photo_count:d[12]||''
      };
    }

    return {
      stock_number:yearIndex>0?c[yearIndex-1]:'', year:yearIndex>=0?c[yearIndex]:'', make:yearIndex>=0?c[yearIndex+1]:'', model:yearIndex>=0?c[yearIndex+2]:'',
      exterior_color:vinIndex>0?c[vinIndex-1]:'', vin, location:vinIndex>=0?c[vinIndex+1]:'', days_at_location:vinIndex>=0?c[vinIndex+2]:'',
      status:statusIndex>=0?c[statusIndex]:'', acquired_date:statusIndex>=0?c[statusIndex+1]:'', price:priceIndex>=0?c[priceIndex]:'', mileage:actualMileageIndex>=0?c[actualMileageIndex]:'',
      photo_count:actualMileageIndex>=0?c[actualMileageIndex+1]:''
    };
  }

  function capture(){
    const rows=candidateRows();
    if(!rows.length) return {ok:false,error:'No DealerSocket inventory rows found. Make sure Available inventory is fully loaded and visible.'};
    const headers=headersFromPage();
    const vehicles=[];
    for(const row of rows){
      const cells=rowCells(row);
      const parsed=parseDealerSocketCells(cells);
      if(!parsed.vin && !parsed.stock_number) continue;
      parsed.interior_color='';
      parsed.raw_cells=cells;
      vehicles.push(parsed);
    }
    const unique=[]; const seen=new Set();
    for(const v of vehicles){const key=v.vin||v.stock_number;if(!key||seen.has(key))continue;seen.add(key);unique.push(v);}
    if(!unique.length) return {ok:false,error:`DealerSocket rows were detected (${rows.length}), but vehicle fields could not be parsed.`};
    const payload={source:'DealerSocket IDMS',url:location.href,captured_at:new Date().toISOString(),headers,vehicles:unique};
    chrome.storage.local.set({idmsInventory:payload,idmsCaptureAt:payload.captured_at});
    return {ok:true,count:unique.length,payload};
  }

  chrome.runtime.onMessage.addListener((msg,_sender,sendResponse)=>{
    if(msg?.type==='K2A_CAPTURE_IDMS'){sendResponse(capture());return true;}
  });
})();