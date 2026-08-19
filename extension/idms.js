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
    const seen=new Set(), rows=[];
    for(const sel of selectors){
      for(const el of document.querySelectorAll(sel)){
        if(seen.has(el)||!visible(el)) continue;
        const cells=rowCells(el);
        const yearIndex=cells.findIndex(x=>/^(19|20)\d{2}$/.test(x));
        if(yearIndex<1) continue;
        const stock=clean(cells[yearIndex-1]);
        if(!stock || stock.length>40) continue;
        seen.add(el); rows.push(el);
      }
    }
    return rows;
  }

  function parseRow(cells){
    const yearIndex=cells.findIndex(x=>/^(19|20)\d{2}$/.test(x));
    if(yearIndex<1) return null;
    const start=yearIndex-1;
    const d=cells.slice(start);
    if(d.length<4) return null;

    const vinIndex=d.findIndex(x=>VIN_RE.test(x));
    const vin=vinIndex>=0?(d[vinIndex].match(VIN_RE)?.[0]||'').replace(/[^A-HJ-NPR-Z0-9]/gi,''):'';
    const statusIndex=d.findIndex(x=>/^(available|sold|pending|hold|service|wholesale)$/i.test(x));
    const priceIndex=d.findIndex(x=>/^\$[\d,]+(?:\.\d{2})?$/.test(x));
    const mileageRel=priceIndex>=0?d.slice(priceIndex+1).findIndex(x=>/^\d{1,7}$/.test(x.replace(/,/g,''))):-1;
    const mileageIndex=mileageRel>=0?priceIndex+1+mileageRel:-1;

    return {
      stock_number:d[0]||'', year:d[1]||'', make:d[2]||'', model:d[3]||'', exterior_color:d[4]||'', vin,
      location:vinIndex>=0?(d[vinIndex+1]||''):(d[6]||''),
      days_at_location:vinIndex>=0?(d[vinIndex+2]||''):(d[7]||''),
      status:statusIndex>=0?d[statusIndex]:'', acquired_date:statusIndex>=0?(d[statusIndex+1]||''):'',
      price:priceIndex>=0?d[priceIndex]:'', mileage:mileageIndex>=0?d[mileageIndex]:'', photo_count:mileageIndex>=0?(d[mileageIndex+1]||''):'',
      raw_cells:cells
    };
  }

  function expectedCount(){
    const body=clean(document.body.innerText);
    const m=body.match(/\b(\d+)\s+RESULTS FOUND\b/i);
    return m?Number(m[1]):0;
  }

  function capture(){
    const rows=candidateRows();
    if(!rows.length) return {ok:false,error:'No DealerSocket inventory rows found. Make sure Available inventory is fully loaded and visible.'};

    const diagnostics={expected_count:expectedCount(),detected_rows:rows.length,captured_count:0,missing_vin:0,duplicate_rows:0,unparsed_rows:0,skipped:[]};
    const parsed=[];
    for(const row of rows){
      const cells=rowCells(row);
      const v=parseRow(cells);
      if(!v){diagnostics.unparsed_rows++;diagnostics.skipped.push({reason:'unparsed',cells});continue;}
      if(!v.stock_number){diagnostics.skipped.push({reason:'missing stock number',cells});continue;}
      if(!v.vin) diagnostics.missing_vin++;
      v.interior_color='';
      parsed.push(v);
    }

    const unique=[]; const seen=new Set();
    for(const v of parsed){
      const key=(v.vin||`stock:${String(v.stock_number).toLowerCase()}`).trim();
      if(seen.has(key)){
        diagnostics.duplicate_rows++;
        diagnostics.skipped.push({reason:'duplicate',stock_number:v.stock_number,vin:v.vin,cells:v.raw_cells});
        continue;
      }
      seen.add(key); unique.push(v);
    }

    diagnostics.captured_count=unique.length;
    diagnostics.count_matches=!diagnostics.expected_count||diagnostics.expected_count===unique.length;

    const payload={source:'DealerSocket IDMS',url:location.href,captured_at:new Date().toISOString(),vehicles:unique,diagnostics};
    chrome.storage.local.set({idmsInventory:payload,idmsCaptureAt:payload.captured_at});
    return {ok:true,count:unique.length,diagnostics,payload};
  }

  chrome.runtime.onMessage.addListener((msg,_sender,sendResponse)=>{
    if(msg?.type==='K2A_CAPTURE_IDMS'){sendResponse(capture());return true;}
  });
})();