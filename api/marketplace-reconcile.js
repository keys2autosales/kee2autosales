const SUPABASE_URL=process.env.SUPABASE_URL;
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const SYNC_TOKEN=process.env.IDMS_SYNC_TOKEN;
const CONFIGURED_USER_ID=process.env.KEYS2AUTOSALES_USER_ID;
function headers(){return {apikey:SERVICE_KEY,Authorization:`Bearer ${SERVICE_KEY}`,'Content-Type':'application/json'};}
async function sb(path,options={}){const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{...headers(),...(options.headers||{})}});const text=await r.text();let data=null;try{data=text?JSON.parse(text):null;}catch{data={message:text};}if(!r.ok)throw new Error(data?.message||data?.hint||`Supabase error ${r.status}`);return data;}
async function resolveUserId(){if(CONFIGURED_USER_ID)return String(CONFIGURED_USER_ID).trim();const r=await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=2`,{headers:{apikey:SERVICE_KEY,Authorization:`Bearer ${SERVICE_KEY}`}});const data=await r.json().catch(()=>({}));const users=Array.isArray(data?.users)?data.users:[];if(users.length===1&&users[0]?.id)return users[0].id;throw new Error('Could not uniquely resolve Keys2AutoSales user.');}
const norm=s=>String(s||'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const num=v=>{const n=Number(String(v??'').replace(/[$,\s]/g,''));return Number.isFinite(n)?n:0;};
const realFacebookUrl=url=>/^https:\/\/(?:www\.)?facebook\.com\/marketplace\//i.test(String(url||''))?String(url):'';
const STOP=new Set(['awd','fwd','rwd','4wd','2wd','automatic','manual','auto','sedan','coupe','wagon','hatchback','hybrid','plug','in','gas','gasoline','flex','fuel','electric']);
const MAKE_ALIASES={chevy:'chevrolet',vw:'volkswagen',merc:'mercedes',benz:'mercedes'};
function canonToken(t){t=String(t||'').toLowerCase();return MAKE_ALIASES[t]||t;}
function tokens(s){return norm(s).split(' ').map(canonToken).filter(Boolean);}
function compact(s){return norm(s).replace(/\s+/g,'');}
function coreModel(modelTrim){const raw=String(modelTrim||'').trim();const primary=raw.split(/[\/|]/)[0]||raw;return norm(primary);}
function trimText(modelTrim){const raw=String(modelTrim||'').trim();return norm(raw.split(/[\/|]/).slice(1).join(' '));}
function parseListingIdentity(listing){
  const text=norm(`${listing.title||''} ${listing.raw_text||''}`);
  const title=norm(listing.title||'');
  const yearMatch=(title||text).match(/\b(19\d{2}|20\d{2})\b/);
  const year=yearMatch?Number(yearMatch[1]):0;
  const allTokens=tokens(text);
  const yearIndex=allTokens.findIndex(x=>x===String(year));
  const make=yearIndex>=0&&allTokens[yearIndex+1]?canonToken(allTokens[yearIndex+1]):'';
  return {text,title,year,make,price:num(listing.price),tokens:new Set(allTokens),compact:compact(text)};
}
function modelScore(identity,v){
  const model=coreModel(v.model_trim);if(!model)return {score:0,reason:'no model'};
  const modelTokens=tokens(model).filter(t=>!STOP.has(t));
  const modelCompact=compact(model);
  const inText=modelTokens.filter(t=>identity.tokens.has(t)).length;
  const ratio=modelTokens.length?inText/modelTokens.length:0;
  if(modelCompact&&identity.compact.includes(modelCompact))return {score:35,reason:`core model ${model}`};
  if(modelTokens.length===1&&identity.tokens.has(modelTokens[0]))return {score:35,reason:`core model ${model}`};
  if(ratio===1&&modelTokens.length)return {score:35,reason:`core model ${model}`};
  if(ratio>=0.67&&inText>=1)return {score:25,reason:`partial model ${model}`};
  return {score:0,reason:`model ${model} not found`};
}
function priceScore(identity,v){
  const lp=identity.price,vp=num(v.fb_price)||num(v.dealer_price);if(!lp||!vp)return {score:0,diff:null};
  const diff=Math.abs(lp-vp),pct=diff/Math.max(vp,1);
  if(diff===0)return {score:15,diff};
  if(diff<=500||pct<=0.03)return {score:12,diff};
  if(diff<=1000||pct<=0.06)return {score:8,diff};
  if(diff<=2000||pct<=0.12)return {score:3,diff};
  return {score:-8,diff};
}
function scoreVehicle(identity,v){
  let score=0;const why=[];const vy=Number(v.year)||0;
  if(identity.year&&vy===identity.year){score+=30;why.push('year');}else if(identity.year&&vy&&vy!==identity.year)return {score:-100,why:['year mismatch']};
  const vm=canonToken(norm(v.make));
  if(identity.make&&vm===identity.make){score+=25;why.push('make');}else if(identity.make&&vm&&vm!==identity.make)return {score:-100,why:['make mismatch']};
  const ms=modelScore(identity,v);score+=ms.score;if(ms.score>0)why.push(ms.reason);else return {score:-50,why:[ms.reason]};
  const trim=trimText(v.model_trim);if(trim){const trimTokens=tokens(trim).filter(t=>!STOP.has(t));if(trimTokens.some(t=>identity.tokens.has(t))){score+=5;why.push('trim');}}
  const ps=priceScore(identity,v);score+=ps.score;if(ps.score>0)why.push(ps.diff===0?'exact price':'close price');else if(ps.score<0)why.push('price differs');
  const inv=norm(v.inventory_status);if(/available|active|in stock/.test(inv)){score+=3;why.push('available');}else if(/sold|removed|unavailable/.test(inv)){score-=20;why.push('not available');}
  return {score:Math.max(0,Math.min(100,score)),why,price_diff:ps.diff};
}
function matchListing(listing,vehicles){
  const identity=parseListingIdentity(listing);
  if(!identity.year||!identity.make)return {vehicle:null,status:'unmatched',confidence:0,reason:'listing identity missing year or make',alternatives:[]};
  const ranked=vehicles.map(v=>({vehicle:v,...scoreVehicle(identity,v)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||((a.price_diff??Infinity)-(b.price_diff??Infinity)));
  const best=ranked[0],second=ranked[1];
  if(!best)return {vehicle:null,status:'unmatched',confidence:0,reason:'no year/make/model inventory match',alternatives:[]};
  const gap=best.score-(second?.score||0);
  const baseReason=`${best.score}% confidence: ${best.why.join(' + ')}`;
  const alternatives=ranked.slice(0,3).map(x=>({vehicle_id:x.vehicle.id,stock_number:x.vehicle.stock_number,year:x.vehicle.year,make:x.vehicle.make,model_trim:x.vehicle.model_trim,score:x.score}));
  if(best.score>=85&&(gap>=8||!second))return {vehicle:best.vehicle,status:'matched',confidence:best.score,reason:baseReason,alternatives};
  if(best.score>=70)return {vehicle:null,status:'ambiguous',confidence:best.score,reason:`review required — ${baseReason}${second?`; next best ${second.score}%`:''}`,alternatives};
  return {vehicle:null,status:'unmatched',confidence:best.score,reason:`low confidence — ${baseReason}`,alternatives};
}
function protectDuplicateVehicleClaims(evaluated){
  const groups=new Map();
  for(const row of evaluated){
    if(row.match.status!=='matched'||!row.match.vehicle?.id)continue;
    const id=row.match.vehicle.id;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(row);
  }
  let collisionGroups=0,collisionListings=0;
  for(const rows of groups.values()){
    if(rows.length<2)continue;
    collisionGroups++;collisionListings+=rows.length;
    rows.sort((a,b)=>(b.match.confidence||0)-(a.match.confidence||0));
    for(const row of rows){
      row.match={...row.match,vehicle:null,status:'ambiguous',reason:`duplicate Marketplace collision — ${rows.length} listings point to the same inventory vehicle; manual review required`};
    }
  }
  return {collisionGroups,collisionListings};
}
export default async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'});}
  try{
    if(!SUPABASE_URL||!SERVICE_KEY)return res.status(503).json({error:'Missing Supabase server environment variables.'});
    if(!SYNC_TOKEN)return res.status(503).json({error:'IDMS_SYNC_TOKEN is not configured.'});
    if(String(req.headers.authorization||'')!==`Bearer ${SYNC_TOKEN}`)return res.status(401).json({error:'Invalid sync token'});
    const listings=Array.isArray(req.body?.listings)?req.body.listings:[];const dryRun=Boolean(req.body?.dry_run);
    if(!listings.length)return res.status(400).json({error:'No Facebook Marketplace listings received.'});
    const userId=await resolveUserId(),now=new Date().toISOString();
    const vehicles=await sb('vehicles?select=id,stock_number,vin,year,make,model_trim,dealer_price,fb_price,mileage,fb_posted,fb_listing_url,fb_status,inventory_status');
    const evaluated=listings.map(listing=>({listing,match:matchListing(listing,vehicles)}));
    const collisions=protectDuplicateVehicleClaims(evaluated);
    let matched=0,ambiguous=0,unmatched=0,withRealUrl=0;const results=[];
    for(const row of evaluated){
      const listing=row.listing,m=row.match;
      if(m.status==='matched')matched++;else if(m.status==='ambiguous')ambiguous++;else unmatched++;
      const captureUrl=String(listing.listing_url||listing.actual_listing_url||`k2fb://capture/${listing.listing_id||Date.now()}`);
      const actualUrl=realFacebookUrl(listing.actual_listing_url||listing.listing_url);if(actualUrl)withRealUrl++;
      const capture={user_id:userId,captured_at:now,listing_id:String(listing.listing_id||''),listing_url:captureUrl,title:String(listing.title||''),price:num(listing.price)||null,status:String(listing.status||'active'),raw_text:String(listing.raw_text||'').slice(0,1200),matched_vehicle_id:m.vehicle?.id||null,match_status:m.status,match_reason:m.reason};
      if(!dryRun){
        await sb('marketplace_listing_captures?on_conflict=user_id,listing_url',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(capture)});
        if(m.status==='matched'&&m.vehicle){
          const active=!['sold','draft'].includes(String(listing.status||'').toLowerCase());
          const patch={fb_posted:active,fb_price:num(listing.price)||m.vehicle.fb_price||null,fb_status:active?'LIVE':'VERIFY',fb_last_verified_at:now,updated_at:now};
          if(actualUrl)patch.fb_listing_url=actualUrl;
          await sb(`vehicles?id=eq.${encodeURIComponent(m.vehicle.id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(patch)});
        }
      }
      results.push({listing_id:listing.listing_id||'',title:listing.title||'',price:num(listing.price)||0,status:m.status,confidence:m.confidence||0,reason:m.reason,vehicle_id:m.vehicle?.id||null,stock_number:m.vehicle?.stock_number||null,vin:m.vehicle?.vin||null,has_real_url:Boolean(actualUrl),alternatives:m.alternatives||[]});
    }
    const confidence={high:results.filter(x=>x.status==='matched'&&x.confidence>=85).length,review:results.filter(x=>x.status==='ambiguous').length,low:results.filter(x=>x.status==='unmatched').length};
    return res.status(200).json({ok:true,dry_run:dryRun,total:listings.length,matched,ambiguous,unmatched,with_real_url:withRealUrl,without_real_url:listings.length-withRealUrl,confidence,duplicate_collision_groups:collisions.collisionGroups,duplicate_collision_listings:collisions.collisionListings,results});
  }catch(err){console.error('Marketplace reconcile failed',err);return res.status(500).json({error:err.message||'Marketplace reconcile failed'});}
}