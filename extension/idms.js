(() => {
  const clean = v => (v || '').replace(/\s+/g, ' ').trim();
  const norm = v => clean(v).toLowerCase().replace(/[^a-z0-9]/g, '');
  const VIN_RE = /\b[A-HJ-NPR-Z0-9]{17}\b/i;
  const YEAR_RE = /\b(19|20)\d{2}\b/;

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

  function looksLikeVehicleRow(el){
    if(!visible(el)) return false;
    const txt=clean(el.innerText);
    if(!YEAR_RE.test(txt)) return false;
    const cells=rowCells(el);
    if(cells.length<6) return false;
    const yearIndex=cells.findIndex(x=>/^(19|20)\d{2}$/.test(x));
    if(yearIndex<1) return false;
    const stock=clean(cells[yearIndex-1]);
    const make=clean(cells[yearIndex+1]);
    const model=clean(cells[yearIndex+2]);
    return !!stock && !!make && !!model && stock.length<40;
  }

  function candidateRows(){
    const selectors=['tbody tr','[role="row"]','.ui-grid-row','.k-master-row','.k-table-row','.grid-row','.slick-row','.dx-data-row'];
    const seen=new Set(), out=[];
    for(const sel of selectors){
      for(const el of document.querySelectorAll(sel)){
        if(seen.has(el)||!looksLikeVehicleRow(el)) continue;
        seen.add(el); out.push(el);
      }
    }
    if(out.length) return out;

    // Last-resort: walk upward from VIN/year-like cells to a compact vehicle-row container.
    for(const el of document.querySelectorAll('td,div,span,a')){
      if(!visible(el)) continue;
      const txt=clean(el.innerText);
      if((!VIN_RE.test(txt) && !/^(19|20)\d{2}$/.test(txt)) || txt.length>100) continue;
      let p=el;
      for(let i=0;i<7 && p;i++,p=p.parentElement){
        if(looksLikeVehicleRow(p)){
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
    const c=cells;
    const vinIndex=c.findIndex(x=>VIN_RE.test(x));
    const vin=vinIndex>=0?(c[vinIndex].match(VIN_RE)?.[0]||''):'';
    const yearIndex=c.findIndex(x=>/^(19|20)\d{2}$/.test(x));
    if(yearIndex<1) return null;

    // Preferred DealerSocket layout: Stock, Year, Make, Model/Trim, Color, VIN, Location, Days, Status, Acquired Date, Price, Mileage, Pics.
    const start=yearIndex-1;
    const d=c.slice(start);
    if(d.length>=5){
      const knownVinIndex=d.findIndex(x=>VIN_RE.test(x));
      const statusIndex=d.findIndex(x=>/^(available|sold|pending|hold|service|wholesale)$/i.test(x));
      const priceIndex=d.findIndex(x=>/^\$[\d,]+(?:\.\d{2})?$/.test(x));
      const mileageIndex=priceIndex>=0 ? d.slice(priceIndex+1).findIndex(x=>/^\d{1,7}$/.test(x.replace(/,/g,''))) : -1;
      const actualMileageIndex=mileageIndex>=0?priceIndex+1+mileageIndex:-1;
      return {
        stock_number:d[0]||'',
        year:d[1]||'',
        make:d[2]||'',
        model:d[3]||'',
        exterior_color:d[4]||'',
        vin:(knownVinIndex>=0?(d[knownVinIndex].match(VIN_RE)?.[0]||''):vin).replace(/[^A-HJ-NPR-Z0-9]/gi,''),
        location:knownVinIndex>=0?(d[knownVinIndex+1]||''):(d[6]||''),
        days_at_location:knownVinIndex>=0?(d[knownVinIndex+2]||''):(d[7]||''),
        status:statusIndex>=0?d[statusIndex]:'',
        acquired_date:statusIndex>=0?(d[statusIndex+1]||''):'',
        price:priceIndex>=0?d[priceIndex]:'',
        mileage:actualMileageIndex>=0?d[actualMileageIndex]:'',
        photo_count:actualMileageIndex>=0?(d[actualMileageIndex+1]||''):''
      };
    }
    return null;
  }

  function capture(){
    const rows=candidateRows();
    if(!rows.length) return {ok:false,error:'No DealerSocket inventory rows found. Make sure Available inventory is fully loaded and visible.'};
    const headers=headersFromPage();
    const vehicles=[];
    const diagnostics={detected_rows:rows.length,unparsed_rows:0,missing_key_rows:0,duplicate_rows:0,missing_vin:0};

    for(const row of rows){
      const cells=rowCells(row);
      const parsed=parseDealerSocketCells(cells);
      if(!parsed){diagnostics.unparsed_rows++;continue;}
      parsed.interior_color='';
      parsed.raw_cells=cells;
      if(!parsed.vin) diagnostics.missing_vin++;
      if(!parsed.vin && !parsed.stock_number){diagnostics.missing_key_rows++;continue;}
      vehicles.push(parsed);
    }

    const unique=[]; const seen=new Set();
    for(const v of vehicles){
      const key=(v.vin||`stock:${String(v.stock_number).toLowerCase()}`).trim();
      if(!key){diagnostics.missing_key_rows++;continue;}
      if(seen.has(key)){diagnostics.duplicate_rows++;continue;}
      seen.add(key);unique.push(v);
    }
    if(!unique.length) return {ok:false,error:`DealerSocket rows were detected (${rows.length}), but vehicle fields could not be parsed.`,diagnostics};

    const resultCountText=[...document.querySelectorAll('body *')].map(x=>clean(x.textContent)).find(x=>/^\d+ RESULTS FOUND$/i.test(x));
    const expectedCount=resultCountText?Number(resultCountText.match(/\d+/)?.[0]||0):0;
    diagnostics.expected_count=expectedCount;
    diagnostics.captured_count=unique.length;
    diagnostics.count_matches=!expectedCount||expectedCount===unique.length;

    const payload={source:'DealerSocket IDMS',url:location.href,captured_at:new Date().toISOString(),headers,vehicles:unique,diagnostics};
    chrome.storage.local.set({idmsInventory:payload,idmsCaptureAt:payload.captured_at});
    return {ok:true,count:unique.length,diagnostics,payload};
  }

  chrome.runtime.onMessage.addListener((msg,_sender,sendResponse)=>{
    if(msg?.type==='K2A_CAPTURE_IDMS'){sendResponse(capture());return true;}
  });
})();