// Keys2AutoSales cloud inventory import
// Intercepts the legacy local-only CSV importer and writes IDMS inventory to Supabase.

(function(){
  const input=document.getElementById('csvImport');
  if(!input) return;

  function val(row,names){
    if(typeof pick==='function') return pick(row,names);
    for(const name of names){
      const key=Object.keys(row).find(k=>k.trim().toLowerCase()===name.toLowerCase());
      if(key && row[key]!==undefined) return row[key];
    }
    return '';
  }

  function num(value){
    const n=Number(String(value??'').replace(/[$,\s]/g,''));
    return Number.isFinite(n)?n:0;
  }

  function normalizeStatus(raw){
    const s=String(raw||'').trim().toLowerCase();
    if(!s) return 'Available';
    if(s.includes('sold')) return 'Sold';
    if(s.includes('wholesale')) return 'Wholesale';
    if(s.includes('service')) return 'Service';
    if(s.includes('hold')) return 'Hold';
    if(s.includes('pending')) return 'Pending';
    if(s.includes('remove')) return 'Removed';
    return 'Available';
  }

  function stockValue(row){
    return val(row,['stock_number','Stock #','Stock','Stock Number','Stock No','Stock No.','StockNumber']);
  }

  function vinValue(row){
    return val(row,['vin','VIN','Vin','Vehicle Identification Number']);
  }

  function rowToVehicle(row,existing){
    const stock=stockValue(row);
    const vin=vinValue(row);
    const model=val(row,['model_trim','Model / Trim','Model/Trim','Model'])||'';
    const trim=val(row,['trim','Trim','Series'])||'';
    const modelTrim=trim && !String(model).toLowerCase().includes(String(trim).toLowerCase()) ? `${model} ${trim}`.trim() : model;
    const rawStatus=val(row,['status','Status','Inventory Status','Vehicle Status','Lot Status']);

    return {
      ...(existing||{}),
      stock:String(stock||'').trim(),
      vin:String(vin||'').trim().toUpperCase(),
      year:num(val(row,['year','Year','Model Year'])),
      make:String(val(row,['make','Make','Manufacturer'])||'').trim(),
      model:String(modelTrim||'').trim(),
      color:String(val(row,['exterior_color','color','Color','Exterior Color','Ext Color'])||existing?.color||'').trim(),
      mileage:num(val(row,['mileage','Mileage','Miles','Odometer','Odometer Miles'])),
      price:num(val(row,['dealer_price','price','Price','Retail Price','Internet Price','Sale Price','List Price','Selling Price'])),
      photos:num(val(row,['photo_count','pics','Pics','Photos','Photo Count','Images','Image Count'])) || Number(existing?.photos||0),
      status:normalizeStatus(rawStatus||existing?.status),
      fbPosted:Boolean(existing?.fbPosted),
      fbListingUrl:existing?.fbListingUrl||'',
      fbPrice:Number(existing?.fbPrice||0),
      fbPostedDate:existing?.fbPostedDate||'',
      fbLastRenewed:existing?.fbLastRenewed||'',
      fbLastVerified:existing?.fbLastVerified||'',
      fbStatus:existing?.fbStatus||'NOT POSTED',
      fbNotes:existing?.fbNotes||''
    };
  }

  input.addEventListener('change',async function cloudImport(event){
    // Prevent app.js's original local-only importer from also running.
    event.stopImmediatePropagation();
    const file=event.target.files?.[0];
    if(!file) return;

    const originalLabel=file.name;
    try{
      const text=await file.text();
      const rows=typeof parseCSV==='function'?parseCSV(text):[];
      if(!rows.length){
        alert('No inventory rows were found in that CSV.');
        return;
      }

      let created=0,updated=0,skipped=0,failed=0;

      for(const row of rows){
        const stock=String(stockValue(row)||'').trim();
        const vin=String(vinValue(row)||'').trim().toUpperCase();
        if(!stock&&!vin){skipped++;continue;}

        // VIN is the preferred match key. Stock number is the fallback.
        // This lets a corrected import repair previously mis-mapped stock numbers
        // without creating duplicate vehicle records.
        const existing=state.inventory.find(v=>(vin&&String(v.vin||'').toUpperCase()===vin)||(stock&&String(v.stock||'')===stock));
        const vehicle=rowToVehicle(row,existing);
        try{
          if(existing){ await updateCloudVehicle(vehicle); updated++; }
          else { await createCloudVehicle(vehicle); created++; }
        }catch(err){
          failed++;
          console.error('Vehicle import failed',stock||vin,err);
        }
      }

      // Reload from Supabase so desktop and phone immediately share the same source of truth.
      await loadCloudVehicles();
      const message=[
        `Cloud inventory sync complete: ${originalLabel}`,
        `Added: ${created}`,
        `Updated: ${updated}`,
        skipped?`Skipped: ${skipped}`:'',
        failed?`Failed: ${failed}`:''
      ].filter(Boolean).join('\n');
      alert(message);
    }catch(err){
      console.error('Cloud CSV import failed:',err);
      alert(`Inventory import failed: ${err.message||'Unknown error'}`);
    }finally{
      event.target.value='';
    }
  },true);
})();
