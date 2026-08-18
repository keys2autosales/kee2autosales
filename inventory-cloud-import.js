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

  function rowToVehicle(row,existing){
    const stock=val(row,['Stock #','Stock','Stock Number','Stock No','Stock No.','StockNumber']);
    const vin=val(row,['VIN','Vin','Vehicle Identification Number']);
    const model=val(row,['Model / Trim','Model/Trim','Model'])||'';
    const trim=val(row,['Trim','Series'])||'';
    const modelTrim=trim && !String(model).toLowerCase().includes(String(trim).toLowerCase()) ? `${model} ${trim}`.trim() : model;
    const rawStatus=val(row,['Status','Inventory Status','Vehicle Status','Lot Status']);

    return {
      ...(existing||{}),
      stock:String(stock||'').trim(),
      vin:String(vin||'').trim(),
      year:num(val(row,['Year','Model Year'])),
      make:String(val(row,['Make','Manufacturer'])||'').trim(),
      model:String(modelTrim||'').trim(),
      color:String(val(row,['Color','Exterior Color','Ext Color'])||existing?.color||'').trim(),
      mileage:num(val(row,['Mileage','Miles','Odometer','Odometer Miles'])),
      price:num(val(row,['Price','Retail Price','Internet Price','Sale Price','List Price','Selling Price'])),
      photos:num(val(row,['Pics','Photos','Photo Count','Images','Image Count'])) || Number(existing?.photos||0),
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
      const touched=[];

      for(const row of rows){
        const stock=String(val(row,['Stock #','Stock','Stock Number','Stock No','Stock No.','StockNumber'])||'').trim();
        const vin=String(val(row,['VIN','Vin','Vehicle Identification Number'])||'').trim();
        if(!stock&&!vin){skipped++;continue;}

        const existing=state.inventory.find(v=>(stock&&String(v.stock)===stock)||(vin&&String(v.vin).toUpperCase()===vin.toUpperCase()));
        const vehicle=rowToVehicle(row,existing);
        try{
          let saved;
          if(existing){ saved=await updateCloudVehicle(vehicle); updated++; }
          else { saved=await createCloudVehicle(vehicle); created++; }
          touched.push(saved);
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
