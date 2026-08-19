const SUPABASE_URL=process.env.SUPABASE_URL;
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const SYNC_TOKEN=process.env.IDMS_SYNC_TOKEN;
const CONFIGURED_USER_ID=process.env.KEYS2AUTOSALES_USER_ID;
function headers(){return {apikey:SERVICE_KEY,Authorization:`Bearer ${SERVICE_KEY}`,'Content-Type':'application/json'};}
async function sb(path,options={}){const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{...headers(),...(options.headers||{})}});const text=await r.text();let data=null;try{data=text?JSON.parse(text):null;}catch{data={message:text};}if(!r.ok)throw new Error(data?.message||data?.hint||`Supabase error ${r.status}`);return data;}
async function resolveUserId(){if(CONFIGURED_USER_ID)return String(CONFIGURED_USER_ID).trim();const r=await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=2`,{headers:{apikey:SERVICE_KEY,Authorization:`Bearer ${SERVICE_KEY}`}});const data=await r.json().catch(()=>({}));const users=Array.isArray(data?.users)?data.users:[];if(users.length===1&&users[0]?.id)return users[0].id;throw new Error('Could not uniquely resolve Keys2AutoSales user.');}
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const num=v=>{const n=Number(String(v??'').replace(/[$,\s]/g,''));return Number.isFinite(n)?n:0;};
function vehicleSignature(v){return norm(`${v.year||''} ${v.make||''} ${v.model_trim||''}`);}
function matchListing(listing,vehicles){
  const hay=norm(`${listing.title||''} ${listing.raw_text||''}`);
  const price=num(listing.price);
  const candidates=vehicles.filter(v=>{
    const sig=vehicleSignature(v); if(!sig) return false;
    const parts=sig.split(' ').filter(Boolean);
    return parts.length>=3 && parts.every(p=>hay.includes(p));
  });
  if(candidates.length===1) return {vehicle:candidates[0],status:'matched',reason:'unique year/make/model match'};
  if(candidates.length>1&&price>0){const exact=candidates.filter(v=>num(v.dealer_price)===price||num(v.fb_price)===price);if(exact.length===1)return {vehicle:exact[0],status:'matched',reason:'year/make/model + exact price match'};return {vehicle:null,status:'ambiguous',reason:`${candidates.length} inventory vehicles match listing identity`};}
  return {vehicle:null,status:'unmatched',reason:candidates.length?`${candidates.length} possible matches`:'no unique inventory identity match'};
}
export default async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'});}
  try{
    if(!SUPABASE_URL||!SERVICE_KEY)return res.status(503).json({error:'Missing Supabase server environment variables.'});
    if(!SYNC_TOKEN)return res.status(503).json({error:'IDMS_SYNC_TOKEN is not configured.'});
    if(String(req.headers.authorization||'')!==`Bearer ${SYNC_TOKEN}`)return res.status(401).json({error:'Invalid sync token'});
    const listings=Array.isArray(req.body?.listings)?req.body.listings:[];
    if(!listings.length)return res.status(400).json({error:'No Facebook Marketplace listings received.'});
    const userId=await resolveUserId(); const now=new Date().toISOString();
    const vehicles=await sb('vehicles?select=id,stock_number,vin,year,make,model_trim,dealer_price,fb_price,fb_posted,fb_listing_url,fb_status,inventory_status');
    let matched=0,ambiguous=0,unmatched=0;
    const results=[];
    for(const listing of listings){
      const m=matchListing(listing,vehicles);
      if(m.status==='matched') matched++; else if(m.status==='ambiguous') ambiguous++; else unmatched++;
      const capture={user_id:userId,captured_at:now,listing_id:String(listing.listing_id||''),listing_url:String(listing.listing_url||''),title:String(listing.title||''),price:num(listing.price)||null,status:String(listing.status||'active'),raw_text:String(listing.raw_text||'').slice(0,1200),matched_vehicle_id:m.vehicle?.id||null,match_status:m.status,match_reason:m.reason};
      await sb('marketplace_listing_captures?on_conflict=user_id,listing_url',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(capture)});
      if(m.vehicle){
        const active=!['sold','draft'].includes(String(listing.status||'').toLowerCase());
        await sb(`vehicles?id=eq.${encodeURIComponent(m.vehicle.id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({fb_posted:active,fb_listing_url:listing.listing_url||m.vehicle.fb_listing_url||null,fb_price:num(listing.price)||m.vehicle.fb_price||null,fb_status:active?'LIVE':'VERIFY',fb_last_verified_at:now,updated_at:now})});
      }
      results.push({listing_id:listing.listing_id||'',title:listing.title||'',status:m.status,reason:m.reason,vehicle_id:m.vehicle?.id||null});
    }
    return res.status(200).json({ok:true,total:listings.length,matched,ambiguous,unmatched,results});
  }catch(err){console.error('Marketplace reconcile failed',err);return res.status(500).json({error:err.message||'Marketplace reconcile failed'});}
}