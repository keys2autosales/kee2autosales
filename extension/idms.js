(() => {
  const clean = v => (v || '').replace(/\s+/g, ' ').trim();
  const norm = v => clean(v).toLowerCase().replace(/[^a-z0-9]/g, '');

  function findInventoryTable() {
    const tables = [...document.querySelectorAll('table')];
    return tables.find(t => {
      const txt = norm(t.innerText);
      return txt.includes('vin') && (txt.includes('stock') || txt.includes('mileage') || txt.includes('price'));
    }) || null;
  }

  function capture() {
    const table = findInventoryTable();
    if (!table) return { ok:false, error:'Inventory table not found. Open the IDMS Inventory lookup page and wait for the vehicles to load.' };
    const rows = [...table.querySelectorAll('tr')];
    if (rows.length < 2) return { ok:false, error:'No inventory rows found.' };
    const headerCells = [...rows[0].querySelectorAll('th,td')].map(c => clean(c.innerText));
    const headers = headerCells.map(norm);
    const aliases = {
      stock:['stock','stocknumber','stockno'], vin:['vin'], year:['year'], make:['make'], model:['model','vehicle'], trim:['trim'],
      mileage:['mileage','miles','odometer'], price:['price','askingprice','retailprice','saleprice'], exterior_color:['exteriorcolor','extcolor','color'],
      interior_color:['interiorcolor','intcolor'], status:['status'], acquired_date:['acquireddate','dateacquired','acquisitiondate'],
      days_at_location:['daysatlocation','daysinstock','age'], location:['location','lot'], photo_count:['photos','photocount']
    };
    const index = {};
    for (const [key, names] of Object.entries(aliases)) index[key] = headers.findIndex(h => names.some(n => h === n || h.includes(n)));
    const value = (cells,key) => index[key] >= 0 ? clean(cells[index[key]]?.innerText) : '';
    const vehicles = rows.slice(1).map(row => {
      const cells=[...row.querySelectorAll('td')];
      if(!cells.length) return null;
      const raw={}; headerCells.forEach((h,i)=>raw[h || `column_${i+1}`]=clean(cells[i]?.innerText));
      return {
        stock_number:value(cells,'stock'), vin:value(cells,'vin').toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g,''), year:value(cells,'year'),
        make:value(cells,'make'), model:value(cells,'model'), trim:value(cells,'trim'), mileage:value(cells,'mileage'), price:value(cells,'price'),
        exterior_color:value(cells,'exterior_color'), interior_color:value(cells,'interior_color'), status:value(cells,'status'),
        acquired_date:value(cells,'acquired_date'), days_at_location:value(cells,'days_at_location'), location:value(cells,'location'), photo_count:value(cells,'photo_count'), raw
      };
    }).filter(v => v && (v.vin || v.stock_number || v.model));
    const payload={source:'DealerSocket IDMS',url:location.href,captured_at:new Date().toISOString(),headers:headerCells,vehicles};
    chrome.storage.local.set({idmsInventory:payload,idmsCaptureAt:payload.captured_at});
    return {ok:true,count:vehicles.length,payload};
  }

  chrome.runtime.onMessage.addListener((msg,_sender,sendResponse)=>{
    if(msg?.type==='K2A_CAPTURE_IDMS'){ sendResponse(capture()); return true; }
  });
})();