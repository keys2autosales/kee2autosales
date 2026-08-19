// Keys2AutoSales Marketplace vehicle-detail enrichment
// Loaded after marketplace-cloud.js so existing stable inventory workflow remains intact.
(function(){
  const originalFromCloud=window.vehicleFromCloud;
  const originalToCloud=window.vehicleToCloud;

  if(typeof originalFromCloud==='function'){
    window.vehicleFromCloud=function(row){
      const v=originalFromCloud(row);
      return Object.assign(v,{
        interiorColor:row.interior_color||'',
        bodyStyle:row.body_style||'',
        vehicleCondition:row.vehicle_condition||'',
        fuelType:row.fuel_type||'',
        transmission:row.transmission||'',
        photoUrls:Array.isArray(row.photo_urls)?row.photo_urls:[]
      });
    };
  }

  if(typeof originalToCloud==='function'){
    window.vehicleToCloud=function(v){
      return Object.assign(originalToCloud(v),{
        interior_color:v.interiorColor||null,
        body_style:v.bodyStyle||null,
        vehicle_condition:v.vehicleCondition||null,
        fuel_type:v.fuelType||null,
        transmission:v.transmission||null,
        photo_urls:Array.isArray(v.photoUrls)?v.photoUrls:[]
      });
    };
  }

  function detailsFields(v={}){
    return [
      {label:'Stock #',name:'stock',value:v.stock,required:true},{label:'Year',name:'year',value:v.year,type:'number'},
      {label:'Make',name:'make',value:v.make},{label:'Model / Trim',name:'model',value:v.model},
      {label:'VIN',name:'vin',value:v.vin,full:true},{label:'Mileage',name:'mileage',value:v.mileage,type:'number'},
      {label:'Dealer Price',name:'price',value:v.price,type:'number'},{label:'Photo Count',name:'photos',value:v.photos,type:'number'},
      {label:'Exterior Color',name:'color',value:v.color},{label:'Interior Color',name:'interiorColor',value:v.interiorColor},
      {label:'Body Style',name:'bodyStyle',value:v.bodyStyle,type:'select',options:['','Sedan','SUV','Truck','Coupe','Hatchback','Wagon','Convertible','Van/Minivan','Other']},
      {label:'Condition',name:'vehicleCondition',value:v.vehicleCondition||'Used - Good',type:'select',options:['Used - Like New','Used - Good','Used - Fair']},
      {label:'Fuel Type',name:'fuelType',value:v.fuelType,type:'select',options:['','Gasoline','Diesel','Hybrid','Electric','Plug-in Hybrid','Flex Fuel','Other']},
      {label:'Transmission',name:'transmission',value:v.transmission,type:'select',options:['','Automatic','Manual','Other']},
      {label:'Status',name:'status',value:v.status||'Available',type:'select',options:['Available','Pending','Sold','Wholesale','Hold','Service','Removed']},
      {label:'Marketplace Posted?',name:'fbPosted',value:v.fbPosted?'Yes':'No',type:'select',options:['No','Yes']},
      {label:'Marketplace Price',name:'fbPrice',value:v.fbPrice,type:'number'},
      {label:'Marketplace URL',name:'fbListingUrl',value:v.fbListingUrl,full:true},
      {label:'FB Posted Date',name:'fbPostedDate',value:v.fbPostedDate,type:'date'},
      {label:'FB Last Renewed',name:'fbLastRenewed',value:v.fbLastRenewed,type:'date'}
    ];
  }

  function normalize(d,v={}){
    return Object.assign({},v,d,{
      year:Number(d.year||0),mileage:Number(d.mileage||0),price:Number(d.price||0),photos:Number(d.photos||0),
      fbPrice:Number(d.fbPrice||0),fbPosted:d.fbPosted==='Yes',photoUrls:Array.isArray(v.photoUrls)?v.photoUrls:[]
    });
  }

  const add=document.getElementById('addVehicleBtn');
  if(add) add.onclick=()=>openModal('Add Vehicle',detailsFields(),async d=>{
    try{const saved=await createCloudVehicle(normalize(d,{fbStatus:'NOT POSTED'}));state.inventory.push(saved);save();}
    catch(err){console.error(err);alert('Vehicle was not saved to the cloud.');}
  });

  window.editVehicle=id=>{
    const v=(state.inventory||[]).find(x=>x.id===id);if(!v)return;
    openModal('Edit Vehicle',detailsFields(v),async d=>{
      try{const saved=await updateCloudVehicle(normalize(d,v));Object.assign(v,saved);save();}
      catch(err){console.error(err);alert('Vehicle update was not saved to the cloud.');}
    });
  };

  if(!document.querySelector('script[data-k2-vin-decoder]')){
    const s=document.createElement('script');
    s.src='/vin-decoder.js';
    s.dataset.k2VinDecoder='1';
    document.head.appendChild(s);
  }
})();