// Keys2AutoSales Marketplace vehicle-detail cloud persistence
// Loaded after marketplace-cloud.js so the enhanced cloud serializers become authoritative.
(function(){
  function toTs(d){ return d ? new Date(`${d}T12:00:00`).toISOString() : null; }

  function detailFromCloud(row){
    return {
      id:row.id,
      stock:row.stock_number||'',
      vin:row.vin||'',
      year:Number(row.year||0),
      make:row.make||'',
      model:row.model_trim||'',
      color:row.color||'',
      interiorColor:row.interior_color||'',
      bodyStyle:row.body_style||'',
      condition:row.vehicle_condition||'',
      fuelType:row.fuel_type||'',
      transmission:row.transmission||'',
      photoUrls:Array.isArray(row.photo_urls)?row.photo_urls:[],
      mileage:Number(row.mileage||0),
      price:Number(row.dealer_price||0),
      photos:Number(row.photo_count||0),
      status:row.inventory_status||'Available',
      acquiredDate:row.acquired_date||'',
      fbPosted:Boolean(row.fb_posted),
      fbListingUrl:row.fb_listing_url||'',
      fbPrice:Number(row.fb_price||0),
      fbPostedDate:row.fb_posted_at?String(row.fb_posted_at).slice(0,10):'',
      fbLastRenewed:row.fb_last_renewed_at?String(row.fb_last_renewed_at).slice(0,10):'',
      fbLastVerified:row.fb_last_verified_at?String(row.fb_last_verified_at).slice(0,10):'',
      fbStatus:row.fb_status||'NOT POSTED',
      fbNotes:row.fb_notes||'',
      clPosted:false,clPrice:0,clPostedDate:'',clLastRenewed:''
    };
  }

  function detailToCloud(v){
    return {
      stock_number:v.stock||null,
      vin:v.vin||null,
      year:Number(v.year||0)||null,
      make:v.make||null,
      model_trim:v.model||null,
      color:v.color||null,
      interior_color:v.interiorColor||v.interior_color||null,
      body_style:v.bodyStyle||v.body_style||null,
      vehicle_condition:v.condition||v.vehicleCondition||v.vehicle_condition||null,
      fuel_type:v.fuelType||v.fuel_type||null,
      transmission:v.transmission||null,
      photo_urls:Array.isArray(v.photoUrls)?v.photoUrls:(Array.isArray(v.photo_urls)?v.photo_urls:[]),
      mileage:Number(v.mileage||0)||0,
      dealer_price:Number(v.price||0)||0,
      photo_count:Number(v.photos||0)||0,
      inventory_status:v.status||'Available',
      acquired_date:v.acquiredDate||null,
      fb_posted:Boolean(v.fbPosted),
      fb_listing_url:v.fbListingUrl||null,
      fb_price:Number(v.fbPrice||0)||null,
      fb_posted_at:toTs(v.fbPostedDate),
      fb_last_renewed_at:toTs(v.fbLastRenewed),
      fb_last_verified_at:toTs(v.fbLastVerified),
      fb_status:v.fbStatus||'NOT POSTED',
      fb_notes:v.fbNotes||null,
      idms_last_seen_at:new Date().toISOString()
    };
  }

  // Replace cloud helpers used by the inventory forms/importer.
  window.createCloudVehicle=async function(v){
    const row=await cloudRequest('/api/vehicles',{method:'POST',body:JSON.stringify(detailToCloud(v))});
    return detailFromCloud(row);
  };

  window.updateCloudVehicle=async function(v){
    const row=await cloudRequest(`/api/vehicles?id=${encodeURIComponent(v.id)}`,{method:'PATCH',body:JSON.stringify(detailToCloud(v))});
    return detailFromCloud(row);
  };

  window.loadCloudVehicles=async function(){
    try{
      const rows=await cloudRequest('/api/vehicles');
      state.inventory=rows.map(detailFromCloud);
      localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
      renderAll();
    }catch(err){
      console.error('Supabase vehicle-detail sync unavailable:',err);
    }
  };
})();