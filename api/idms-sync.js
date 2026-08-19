const SUPABASE_URL=process.env.SUPABASE_URL;
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const SYNC_TOKEN=process.env.IDMS_SYNC_TOKEN;
const CONFIGURED_USER_ID=process.env.KEYS2AUTOSALES_USER_ID;

function headers(){return {apikey:SERVICE_KEY,Authorization:`Bearer ${SERVICE_KEY}`,'Content-Type':'application/json'};}
async function sb(path,options={}){
  if(!SUPABASE_URL||!SERVICE_KEY) throw new Error('Missing Supabase server environment variables.');
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{...headers(),...(options.headers||{})}});
  const text=await r.text(); let data=null; try{data=text?JSON.parse(text):null;}catch{data={message:text};}
  if(!r.ok) throw new Error(data?.message||data?.hint||`Supabase error ${r.status}`);
  return data;
}
async function resolveUserId(){
  if(CONFIGURED_USER_ID) return String(CONFIGURED_USER_ID).trim();
  if(!SUPABASE_URL||!SERVICE_KEY) throw new Error('Missing Supabase server environment variables.');
  const r=await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=2`,{headers:{apikey:SERVICE_KEY,Authorization:`Bearer ${SERVICE_KEY}`}});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data?.message||`Could not resolve Keys2AutoSales user (${r.status})`);
  const users=Array.isArray(data?.users)?data.users:[];
  if(users.length===1&&users[0]?.id) return users[0].id;
  if(users.length===0) throw new Error('No Supabase auth user exists for Keys2AutoSales.');
  throw new Error('Multiple Supabase users found. Set KEYS2AUTOSALES_USER_ID in Vercel before IDMS sync.');
}
const clean=v=>String(v??'').trim();
const num=v=>{const n=Number(String(v??'').replace(/[$,\s]/g,''));return Number.isFinite(n)?n:0;};
const date=v=>{const s=clean(v);if(!s)return null;const d=new Date(s);return Number.isNaN(d.getTime())?null:d.toISOString().slice(0,10);};
const keyOf=v=>{const vin=clean(v.vin).toUpperCase();if(vin)return vin;const stock=clean(v.stock_number).toLowerCase();return stock?`stock:${stock}`:'';};
function normalize(v){return {stock_number:clean(v.stock_number),vin:clean(v.vin).toUpperCase(),year:num(v.year)||null,make:clean(v.make),model_trim:clean(v.model),color:clean(v.exterior_color),mileage:num(v.mileage)||0,dealer_price:num(v.price)||0,photo_count:num(v.photo_count)||0,inventory_status:clean(v.status)||'Available',acquired_date:date(v.acquired_date)};}
function changedFields(oldRow,newRow){
  const fields=['stock_number','vin','year','make','model_trim','color','mileage','dealer_price','photo_count','inventory_status','acquired_date'];
  const out={}; for(const f of fields){const a=oldRow?.[f]??null,b=newRow?.[f]??null;if(String(a??'')!==String(b??''))out[f]={from:a,to:b};} return out;
}
async function insertMany(table,rows){if(!rows.length)return [];return sb(table,{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(rows)});}

export default async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'});}
  try{
    if(!SYNC_TOKEN) return res.status(503).json({error:'IDMS_SYNC_TOKEN is not configured in Vercel yet.'});
    const auth=String(req.headers.authorization||'');
    if(auth!==`Bearer ${SYNC_TOKEN}`) return res.status(401).json({error:'Invalid IDMS sync token'});
    const body=req.body||{}; const raw=Array.isArray(body.vehicles)?body.vehicles:[]; const diagnostics=body.diagnostics||{};
    const expected=Number(diagnostics.expected_count||raw.length||0);
    if(!raw.length) return res.status(400).json({error:'No IDMS vehicles received'});
    if(expected && raw.length!==expected) return res.status(409).json({error:`Partial IDMS capture rejected (${raw.length}/${expected}). Capture must match DealerSocket before cloud sync.`});

    const userId=await resolveUserId();
    const now=new Date().toISOString();
    const current=await sb('vehicles?select=*');
    const currentByKey=new Map();
    for(const v of current){if(v.vin)currentByKey.set(String(v.vin).toUpperCase(),v);if(v.stock_number)currentByKey.set(`stock:${String(v.stock_number).toLowerCase()}`,v);}

    const snapRows=await sb('inventory_snapshots',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({user_id:userId,source:'DealerSocket IDMS Extension',imported_at:now,row_count:raw.length,notes:`Verified capture ${raw.length}/${expected||raw.length}`})});
    const snapshot=snapRows[0];

    const incomingKeys=new Set(); const snapshotItems=[]; const changes=[]; let added=0,updated=0,unchanged=0,returned=0;
    for(const rawVehicle of raw){
      const n=normalize(rawVehicle); const key=keyOf(n); if(!key)continue; incomingKeys.add(key);
      let old=currentByKey.get(clean(n.vin).toUpperCase())||currentByKey.get(`stock:${clean(n.stock_number).toLowerCase()}`)||null;
      const payload={...n,user_id:userId,idms_last_seen_at:now,updated_at:now};
      let saved=old;
      if(old){
        const diff=changedFields(old,payload);
        const wasInactive=String(old.inventory_status||'').toLowerCase()!=='available';
        const rows=await sb(`vehicles?id=eq.${encodeURIComponent(old.id)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)}); saved=rows[0]||old;
        if(wasInactive){returned++;changes.push({user_id:userId,snapshot_id:snapshot.id,vehicle_id:saved.id,change_type:'returned',stock_number:n.stock_number,vin:n.vin,vehicle_name:`${n.year||''} ${n.make} ${n.model_trim}`.trim(),changed_fields:diff});}
        else if(Object.keys(diff).length){updated++;changes.push({user_id:userId,snapshot_id:snapshot.id,vehicle_id:saved.id,change_type:'updated',stock_number:n.stock_number,vin:n.vin,vehicle_name:`${n.year||''} ${n.make} ${n.model_trim}`.trim(),changed_fields:diff});}
        else unchanged++;
      }else{
        const rows=await sb('vehicles',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({...payload,created_at:now})}); saved=rows[0]; added++;
        changes.push({user_id:userId,snapshot_id:snapshot.id,vehicle_id:saved?.id||null,change_type:'new',stock_number:n.stock_number,vin:n.vin,vehicle_name:`${n.year||''} ${n.make} ${n.model_trim}`.trim(),changed_fields:{}});
      }
      snapshotItems.push({user_id:userId,snapshot_id:snapshot.id,stock_number:n.stock_number,vin:n.vin,year:n.year,make:n.make,model_trim:n.model_trim,color:n.color,mileage:n.mileage,dealer_price:n.dealer_price,photo_count:n.photo_count,inventory_status:n.inventory_status,acquired_date:n.acquired_date,raw_data:rawVehicle});
    }

    let removed=0;
    for(const old of current){
      if(String(old.inventory_status||'').toLowerCase()!=='available') continue;
      const k1=old.vin?String(old.vin).toUpperCase():''; const k2=old.stock_number?`stock:${String(old.stock_number).toLowerCase()}`:'';
      if((k1&&incomingKeys.has(k1))||(k2&&incomingKeys.has(k2))) continue;
      removed++;
      await sb(`vehicles?id=eq.${encodeURIComponent(old.id)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({user_id:userId,inventory_status:'Removed',updated_at:now})});
      changes.push({user_id:userId,snapshot_id:snapshot.id,vehicle_id:old.id,change_type:'removed',stock_number:old.stock_number,vin:old.vin,vehicle_name:`${old.year||''} ${old.make||''} ${old.model_trim||''}`.trim(),changed_fields:{inventory_status:{from:old.inventory_status,to:'Removed'}}});
    }

    await insertMany('inventory_snapshot_items',snapshotItems);
    await insertMany('inventory_changes',changes);
    return res.status(200).json({ok:true,snapshot_id:snapshot.id,total:raw.length,new:added,updated,returned,removed,unchanged,changes:changes.length});
  }catch(err){console.error('IDMS sync failed',err);return res.status(500).json({error:err.message||'IDMS sync failed'});}
}