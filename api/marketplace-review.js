const SUPABASE_URL=process.env.SUPABASE_URL;
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const SYNC_TOKEN=process.env.IDMS_SYNC_TOKEN;
const CONFIGURED_USER_ID=process.env.KEYS2AUTOSALES_USER_ID;
function headers(){return {apikey:SERVICE_KEY,Authorization:`Bearer ${SERVICE_KEY}`,'Content-Type':'application/json'};}
async function sb(path,options={}){const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{...headers(),...(options.headers||{})}});const text=await r.text();let data=null;try{data=text?JSON.parse(text):null;}catch{data={message:text};}if(!r.ok)throw new Error(data?.message||data?.hint||`Supabase error ${r.status}`);return data;}
async function resolveUserId(){if(CONFIGURED_USER_ID)return String(CONFIGURED_USER_ID).trim();const r=await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=2`,{headers:{apikey:SERVICE_KEY,Authorization:`Bearer ${SERVICE_KEY}`}});const data=await r.json().catch(()=>({}));const users=Array.isArray(data?.users)?data.users:[];if(users.length===1&&users[0]?.id)return users[0].id;throw new Error('Could not uniquely resolve Keys2AutoSales user.');}
const num=v=>{const n=Number(String(v??'').replace(/[$,\s]/g,''));return Number.isFinite(n)?n:0;};
const realFacebookUrl=url=>/^https:\/\/(?:www\.)?facebook\.com\/marketplace\//i.test(String(url||''))?String(url):'';
export default async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'});}
  try{
    if(!SUPABASE_URL||!SERVICE_KEY)return res.status(503).json({error:'Missing Supabase server environment variables.'});
    if(!SYNC_TOKEN)return res.status(503).json({error:'IDMS_SYNC_TOKEN is not configured.'});
    if(String(req.headers.authorization||'')!==`Bearer ${SYNC_TOKEN}`)return res.status(401).json({error:'Invalid sync token'});
    const vehicleId=String(req.body?.vehicle_id||'').trim(),listing=req.body?.listing||{};
    if(!vehicleId)return res.status(400).json({error:'vehicle_id is required'});
    if(!listing?.title)return res.status(400).json({error:'listing is required'});
    const vehicles=await sb(`vehicles?id=eq.${encodeURIComponent(vehicleId)}&select=id,stock_number,vin,fb_price,fb_listing_url`);
    const vehicle=Array.isArray(vehicles)?vehicles[0]:null;
    if(!vehicle)return res.status(404).json({error:'Vehicle not found'});
    const userId=await resolveUserId(),now=new Date().toISOString(),actualUrl=realFacebookUrl(listing.actual_listing_url||listing.listing_url);
    const patch={fb_posted:true,fb_price:num(listing.price)||vehicle.fb_price||null,fb_status:'LIVE',fb_last_verified_at:now,updated_at:now};
    if(actualUrl)patch.fb_listing_url=actualUrl;
    await sb(`vehicles?id=eq.${encodeURIComponent(vehicleId)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(patch)});
    const captureUrl=String(listing.listing_url||listing.actual_listing_url||`k2fb://capture/${listing.listing_id||Date.now()}`);
    const capture={user_id:userId,captured_at:now,listing_id:String(listing.listing_id||''),listing_url:captureUrl,title:String(listing.title||''),price:num(listing.price)||null,status:String(listing.status||'active'),raw_text:String(listing.raw_text||'').slice(0,1200),matched_vehicle_id:vehicleId,match_status:'matched',match_reason:'manual review approved'};
    await sb('marketplace_listing_captures?on_conflict=user_id,listing_url',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(capture)});
    return res.status(200).json({ok:true,vehicle_id:vehicleId,stock_number:vehicle.stock_number,vin:vehicle.vin,title:listing.title,has_real_url:Boolean(actualUrl)});
  }catch(err){console.error('Marketplace manual review failed',err);return res.status(500).json({error:err.message||'Marketplace manual review failed'});}
}
