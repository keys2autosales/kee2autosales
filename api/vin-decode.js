// Keys2AutoSales server-side VIN decoder
// Uses NHTSA vPIC. Facebook VIN decoding is intentionally not used.

function cleanVin(value=''){
  return String(value).toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g,'').slice(0,17);
}

function normalizeBodyStyle(bodyClass=''){
  const s=String(bodyClass).toLowerCase();
  if(!s) return '';
  if(s.includes('sport utility')||s.includes('crossover')||s.includes('multipurpose passenger')) return 'SUV';
  if(s.includes('pickup')) return 'Truck';
  if(s.includes('van')||s.includes('minivan')) return 'Van/Minivan';
  if(s.includes('hatchback')) return 'Hatchback';
  if(s.includes('wagon')) return 'Wagon';
  if(s.includes('convertible')) return 'Convertible';
  if(s.includes('coupe')) return 'Coupe';
  if(s.includes('sedan')) return 'Sedan';
  return 'Other';
}

function normalizeFuel(primary='',secondary=''){
  const s=`${primary} ${secondary}`.toLowerCase();
  if(!s.trim()) return '';
  if(s.includes('plug-in')||s.includes('phev')) return 'Plug-in Hybrid';
  if(s.includes('electric')&&!s.includes('hybrid')) return 'Electric';
  if(s.includes('hybrid')) return 'Hybrid';
  if(s.includes('diesel')) return 'Diesel';
  if(s.includes('flex')||s.includes('ethanol')||s.includes('e85')) return 'Flex Fuel';
  if(s.includes('gasoline')||s.includes('gas')) return 'Gasoline';
  return 'Other';
}

function normalizeTransmission(style='',speeds=''){
  const s=`${style} ${speeds}`.toLowerCase();
  if(!s.trim()) return '';
  if(s.includes('manual')) return 'Manual';
  if(s.includes('automatic')||s.includes('cvt')||s.includes('continuously variable')||s.includes('electronically controlled')) return 'Automatic';
  return 'Other';
}

export default async function handler(req,res){
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({error:'Method not allowed'});
  }

  try{
    const vin=cleanVin(req.query.vin||'');
    if(vin.length!==17) return res.status(400).json({error:'VIN must be 17 characters'});

    const url=`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(vin)}?format=json`;
    const response=await fetch(url,{headers:{Accept:'application/json'}});
    if(!response.ok) throw new Error(`VIN service returned ${response.status}`);

    const payload=await response.json();
    const row=Array.isArray(payload?.Results)?payload.Results[0]:null;
    if(!row) return res.status(502).json({error:'VIN service returned no result'});

    const errorCode=String(row.ErrorCode||'0');
    const seriousError=errorCode && errorCode!=='0' && !errorCode.split(',').every(x=>['0','1','2','3','4','5','6','7','8','10','11','12','13','14'].includes(x.trim()));

    const model=[row.Model,row.Trim].filter(Boolean).join(' ').trim();
    const decoded={
      vin,
      year:Number(row.ModelYear||0)||null,
      make:row.Make||'',
      model,
      baseModel:row.Model||'',
      trim:row.Trim||'',
      bodyStyle:normalizeBodyStyle(row.BodyClass),
      fuelType:normalizeFuel(row.FuelTypePrimary,row.FuelTypeSecondary),
      transmission:normalizeTransmission(row.TransmissionStyle,row.TransmissionSpeeds),
      engine:[row.DisplacementL?`${row.DisplacementL}L`:'',row.EngineCylinders?`${row.EngineCylinders} cyl`:'',row.EngineModel||''].filter(Boolean).join(' • '),
      driveType:row.DriveType||'',
      doors:Number(row.Doors||0)||null,
      manufacturer:row.Manufacturer||'',
      bodyClass:row.BodyClass||'',
      errorCode,
      errorText:row.ErrorText||''
    };

    if(seriousError && !decoded.make && !decoded.baseModel){
      return res.status(422).json({error:row.ErrorText||'VIN could not be decoded',details:decoded});
    }

    return res.status(200).json(decoded);
  }catch(err){
    console.error('VIN decode failed:',err);
    return res.status(500).json({error:err.message||'VIN decode failed'});
  }
}
