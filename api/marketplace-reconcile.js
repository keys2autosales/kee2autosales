const SUPABASE_URL=process.env.SUPABASE_URL;
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const SYNC_TOKEN=process.env.IDMS_SYNC_TOKEN;
const CONFIGURED_USER_ID=process.env.KEYS2AUTOSALES_USER_ID;
function headers(){return {apikey:SERVICE_KEY,Authorization:`Bearer ${SERVICE_KEY}`,'Content-Type':'application/json'};}
async function sb(path,options={}){const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{...headers(),...(options.headers||{})}});const text=await r.text();let data=null;try{data=text?JSON.parse(text):null;}catch{data={message:text};}if(!r.ok)throw new Error(data?.message||data?.hint||`Supabase error ${r.status}`);return data;}
async function resolveUserId(){if(CONFIGURED_USER_ID)return String(CONFIGURED_USER_ID).trim();const r=await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=2`,{headers:{apikey:SERVICE_KEY,Authorization:`Bearer ${SERVICE_KEY}`}});const data=await r.json().catch(()=>({}));const users=Array.isArray(data?.users)?data.users:[];if(users.length===1&&users[0]?.id)return users[0].id;throw new Error('Could not uniquely resolve Keys2AutoSales user.');}
const norm=s=>String(s||'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const compact=s=>norm(s).replace(/\s+/g,'');
const num=v=>{const n=Number(String(v??'').replace(/[$,\s]/g,''));return Number.isFinite(n)?n:0;};
const realFacebookUrl=url=>/^https:\/\/(?:www\.)?facebook\.com\/marketplace\//i.test(String(url||''))?String(url):'';
const NOISE=new Set(['awd','fwd','rwd','4wd','2wd','4x4','automatic','manual','auto','sedan','coupe','wagon','hatchback','hybrid','plug','in','gas','gasoline','flex','fuel','electric','crew','cab','extended','regular','door','doors']);
const TRIM=new Set(['base','limited','touring','sport','sports','premium','luxury','platinum','denali','lariat','king','ranch','raptor','tremor','work','truck','xl','xlt','stx','fx4','lt','ltz','ls','rst','high','country','wt','sle','slt','at4','sv','sl','sr','sr5','pro','off','road','trd','le','se','xle','xse','lx','ex','exl','ex-l','sx','s','sel','calligraphy','latitude','altitude','overland','rubicon','sahara','willys','trailhawk','summit','limited','premier','preferred','essence','avenir','reserve','signature','select','grand','touring']);
const TOKEN_ALIASES={chevy:'chevrolet',vw:'volkswagen',merc:'mercedes',benz:'mercedes'};
function canonToken(t){t=String(t||'').toLowerCase();return TOKEN_ALIASES[t]||t;}
function tokens(s){return norm(s).split(' ').map(canonToken).filter(Boolean);}
function rawModelPart(modelTrim){const raw=String(modelTrim||'').trim();return String(raw.split(/[\/|]/)[0]||raw).trim();}
function modelTokenSets(modelTrim){
  const raw=rawModelPart(modelTrim),all=tokens(raw).filter(t=>!NOISE.has(t));
  let core=all.filter(t=>!TRIM.has(t));
  if(!core.length)core=all;
  // Protect compound model names where one token can look like trim vocabulary.
  if(all.length>=2&&core.length===1){const prefix2=all.slice(0,2);if(!prefix2.some(t=>NOISE.has(t)))core=prefix2;}
  return {raw:norm(raw),all,core,compactCore:core.join('')};
}
function trimText(modelTrim){const raw=String(modelTrim||'').trim();const explicit=raw.split(/[\/|]/).slice(1).join(' ');if(explicit)return norm(explicit);const sets=modelTokenSets(raw);return sets.all.filter(t=>TRIM.has(t)).join(' ');}
function parseListingIdentity(listing){const raw=`${listing.title||''} ${listing.raw_text||''}`;const text=norm(raw),title=norm(listing.title||'');const y=(title||text).match(/\b(19\d{2}|20\d{2})\b/);return {text,title,compact:compact(text),titleCompact:compact(title),year:y?Number(y[1]):0,price:num(listing.price),mileage:num(listing.mileage),tokens:new Set(tokens(text)),titleTokens:new Set(tokens(title))};}
function makeScore(identity,v){const raw=norm(v.make);if(!raw)return {score:0,reason:'no make'};const ts=tokens(raw),c=compact(raw);if(c&&identity.titleCompact.includes(c))return {score:22,reason:`title make ${v.make}`};if(ts.length&&ts.every(t=>identity.titleTokens.has(t)))return {score:22,reason:`title make ${v.make}`};if(c&&identity.compact.includes(c))return {score:18,reason:`make ${v.make}`};if(ts.length&&ts.every(t=>identity.tokens.has(t)))return {score:18,reason:`make ${v.make}`};if(ts.length===2&&identity.titleTokens.has(ts[0]))return {score:10,reason:`partial make ${v.make}`};return {score:0,reason:`make ${v.make} not found`};}
function modelScore(identity,v){
  const sets=modelTokenSets(v.model_trim);if(!sets.core.length)return {score:0,reason:'no model'};
  const titleHits=sets.core.filter(t=>identity.titleTokens.has(t)).length,titleRatio=titleHits/sets.core.length;
  const textHits=sets.core.filter(t=>identity.tokens.has(t)).length,textRatio=textHits/sets.core.length;
  if(sets.compactCore&&identity.titleCompact.includes(sets.compactCore))return {score:37,reason:`title core model ${sets.core.join(' ')}`};
  if(titleRatio===1)return {score:37,reason:`title core model ${sets.core.join(' ')}`};
  if(titleRatio>=.67&&titleHits>=1)return {score:30,reason:`title partial model ${sets.core.join(' ')}`};
  if(sets.compactCore&&identity.compact.includes(sets.compactCore))return {score:32,reason:`core model ${sets.core.join(' ')}`};
  if(textRatio===1)return {score:32,reason:`core model ${sets.core.join(' ')}`};
  if(textRatio>=.67&&textHits>=1)return {score:24,reason:`partial model ${sets.core.join(' ')}`};
  return {score:0,reason:`model ${sets.core.join(' ')} not found`};
}
function trimScore(identity,v){const trim=trimText(v.model_trim);if(!trim)return {score:0,reason:''};const tt=tokens(trim).filter(t=>!NOISE.has(t));if(!tt.length)return {score:0,reason:''};const titleHits=tt.filter(t=>identity.titleTokens.has(t)).length;if(titleHits)return {score:Math.min(6,2+titleHits*2),reason:'title trim'};const textHits=tt.filter(t=>identity.tokens.has(t)).length;if(textHits)return {score:Math.min(4,textHits*2),reason:'trim'};return {score:0,reason:''};}
function priceScore(identity,v){const lp=identity.price,vp=num(v.fb_price)||num(v.dealer_price);if(!lp||!vp)return {score:0,diff:null};const diff=Math.abs(lp-vp),pct=diff/Math.max(vp,1);if(diff===0)return {score:12,diff};if(diff<=500||pct<=.03)return {score:10,diff};if(diff<=1000||pct<=.06)return {score:7,diff};if(diff<=2000||pct<=.12)return {score:3,diff};return {score:-7,diff};}
function mileageScore(identity,v){const lm=num(identity.mileage),vm=num(v.mileage);if(!lm||!vm)return {score:0,diff:null};const diff=Math.abs(lm-vm),pct=diff/Math.max(vm,1);if(diff<=100)return {score:15,diff};if(diff<=500||pct<=.01)return {score:13,diff};if(diff<=1500||pct<=.025)return {score:10,diff};if(diff<=3500||pct<=.05)return {score:6,diff};if(diff<=7500||pct<=.10)return {score:2,diff};return {score:-10,diff};}
function scoreVehicle(identity,v){
  let score=0;const why=[];const vy=Number(v.year)||0;
  if(identity.year&&vy===identity.year){score+=28;why.push('year');}else if(identity.year&&vy&&vy!==identity.year)return {score:-100,why:['year mismatch']};
  const mk=makeScore(identity,v);if(!mk.score)return {score:-80,why:[mk.reason]};score+=mk.score;why.push(mk.reason);
  const ms=modelScore(identity,v);if(!ms.score)return {score:-60,why:[ms.reason]};score+=ms.score;why.push(ms.reason);
  const tr=trimScore(identity,v);score+=tr.score;if(tr.score)why.push(tr.reason);
  const ps=priceScore(identity,v);score+=ps.score;if(ps.score>0)why.push(ps.diff===0?'exact price':'close price');else if(ps.score<0)why.push('price differs');
  const ml=mileageScore(identity,v);score+=ml.score;if(ml.score>0)why.push(ml.diff<=100?'near-exact mileage':'close mileage');else if(ml.score<0)why.push('mileage differs');
  const inv=norm(v.inventory_status);if(/available|active|in stock/.test(inv)){score+=3;why.push('available');}else if(/sold|removed|unavailable/.test(inv)){score-=20;why.push('not available');}
  return {score:Math.max(0,Math.min(100,score)),why,price_diff:ps.diff,mileage_diff:ml.diff};
}
function matchListing(listing,vehicles){
  const identity=parseListingIdentity(listing);if(!identity.year)return {vehicle:null,status:'unmatched',confidence:0,reason:'listing identity missing year',alternatives:[]};
  const ranked=vehicles.map(v=>({vehicle:v,...scoreVehicle(identity,v)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||((a.mileage_diff??Infinity)-(b.mileage_diff??Infinity))||((a.price_diff??Infinity)-(b.price_diff??Infinity)));
  const best=ranked[0],second=ranked[1];if(!best)return {vehicle:null,status:'unmatched',confidence:0,reason:'no year/make/model inventory match',alternatives:[]};
  const gap=best.score-(second?.score||0),reason=`${best.score}% confidence: ${best.why.join(' + ')}`;
  const alternatives=ranked.slice(0,3).map(x=>({vehicle_id:x.vehicle.id,stock_number:x.vehicle.stock_number,year:x.vehicle.year,make:x.vehicle.make,model_trim:x.vehicle.model_trim,mileage:x.vehicle.mileage,dealer_price:x.vehicle.dealer_price,score:x.score,mileage_diff:x.mileage_diff,price_diff:x.price_diff}));
  if(best.score>=85&&(gap>=7||!second))return {vehicle:best.vehicle,status:'matched',confidence:best.score,reason,alternatives};
  if(best.score>=70)return {vehicle:null,status:'ambiguous',confidence:best.score,reason:`review required — ${reason}${second?`; next best ${second.score}%`:''}`,alternatives};
  return {vehicle:null,status:'unmatched',confidence:best.score,reason:`low confidence — ${reason}`,alternatives};
}
function collisionEvidence(row){const a=row.match.alternatives?.[0]||{};return {confidence:row.match.confidence||0,mileage_diff:a.mileage_diff??Infinity,price_diff:a.price_diff??Infinity};}
function protectDuplicateVehicleClaims(evaluated){
  const groups=new Map();for(const row of evaluated){if(row.match.status!=='matched'||!row.match.vehicle?.id)continue;const id=row.match.vehicle.id;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(row);}
  let collisionGroups=0,collisionListings=0,resolvedWinners=0;
  for(const rows of groups.values()){
    if(rows.length<2)continue;collisionGroups++;collisionListings+=rows.length;
    rows.sort((a,b)=>{const A=collisionEvidence(a),B=collisionEvidence(b);return B.confidence-A.confidence||A.mileage_diff-B.mileage_diff||A.price_diff-B.price_diff;});
    const winner=rows[0],runner=rows[1],W=collisionEvidence(winner),R=collisionEvidence(runner);
    const decisiveConfidence=W.confidence-R.confidence>=8;
    const decisiveMileage=Number.isFinite(W.mileage_diff)&&Number.isFinite(R.mileage_diff)&&W.mileage_diff+1000<R.mileage_diff&&W.mileage_diff<=1500;
    const decisivePrice=Number.isFinite(W.price_diff)&&Number.isFinite(R.price_diff)&&W.price_diff+750<R.price_diff&&W.price_diff<=500;
    const keepWinner=W.confidence>=90&&(decisiveConfidence||decisiveMileage||decisivePrice);
    if(keepWinner){
      resolvedWinners++;
      winner.match={...winner.match,reason:`${winner.match.reason} + resolved duplicate claim by stronger evidence`};
      for(const row of rows.slice(1))row.match={...row.match,vehicle:null,status:'ambiguous',reason:`duplicate Marketplace collision — stronger listing retained for this inventory vehicle; manual review required`,collision_with:winner.listing?.listing_id||''};
    }else{
      for(const row of rows)row.match={...row.match,vehicle:null,status:'ambiguous',reason:`duplicate Marketplace collision — ${rows.length} listings point to the same inventory vehicle; manual review required`};
    }
  }
  return {collisionGroups,collisionListings,resolvedWinners};
}
export default async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'});}
  try{
    if(!SUPABASE_URL||!SERVICE_KEY)return res.status(503).json({error:'Missing Supabase server environment variables.'});
    if(!SYNC_TOKEN)return res.status(503).json({error:'IDMS_SYNC_TOKEN is not configured.'});
    if(String(req.headers.authorization||'')!==`Bearer ${SYNC_TOKEN}`)return res.status(401).json({error:'Invalid sync token'});
    const listings=Array.isArray(req.body?.listings)?req.body.listings:[],dryRun=Boolean(req.body?.dry_run);if(!listings.length)return res.status(400).json({error:'No Facebook Marketplace listings received.'});
    const userId=await resolveUserId(),now=new Date().toISOString();
    const vehicles=await sb('vehicles?select=id,stock_number,vin,year,make,model_trim,dealer_price,fb_price,mileage,fb_posted,fb_listing_url,fb_status,inventory_status');
    const evaluated=listings.map(listing=>({listing,match:matchListing(listing,vehicles)})),collisions=protectDuplicateVehicleClaims(evaluated);
    let matched=0,ambiguous=0,unmatched=0,withRealUrl=0;const results=[];
    for(const row of evaluated){
      const listing=row.listing,m=row.match;if(m.status==='matched')matched++;else if(m.status==='ambiguous')ambiguous++;else unmatched++;
      const captureUrl=String(listing.listing_url||listing.actual_listing_url||`k2fb://capture/${listing.listing_id||Date.now()}`),actualUrl=realFacebookUrl(listing.actual_listing_url||listing.listing_url);if(actualUrl)withRealUrl++;
      const capture={user_id:userId,captured_at:now,listing_id:String(listing.listing_id||''),listing_url:captureUrl,title:String(listing.title||''),price:num(listing.price)||null,status:String(listing.status||'active'),raw_text:String(listing.raw_text||'').slice(0,1200),matched_vehicle_id:m.vehicle?.id||null,match_status:m.status,match_reason:m.reason};
      if(!dryRun){
        await sb('marketplace_listing_captures?on_conflict=user_id,listing_url',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(capture)});
        if(m.status==='matched'&&m.vehicle){const active=!['sold','draft'].includes(String(listing.status||'').toLowerCase());const patch={fb_posted:active,fb_price:num(listing.price)||m.vehicle.fb_price||null,fb_status:active?'LIVE':'VERIFY',fb_last_verified_at:now,updated_at:now};if(actualUrl)patch.fb_listing_url=actualUrl;await sb(`vehicles?id=eq.${encodeURIComponent(m.vehicle.id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(patch)});}
      }
      results.push({listing_id:listing.listing_id||'',title:listing.title||'',price:num(listing.price)||0,mileage:num(listing.mileage)||0,status:m.status,confidence:m.confidence||0,reason:m.reason,vehicle_id:m.vehicle?.id||null,stock_number:m.vehicle?.stock_number||null,vin:m.vehicle?.vin||null,has_real_url:Boolean(actualUrl),alternatives:m.alternatives||[]});
    }
    const confidence={high:results.filter(x=>x.status==='matched'&&x.confidence>=85).length,review:results.filter(x=>x.status==='ambiguous').length,low:results.filter(x=>x.status==='unmatched').length};
    return res.status(200).json({ok:true,dry_run:dryRun,total:listings.length,matched,ambiguous,unmatched,with_real_url:withRealUrl,without_real_url:listings.length-withRealUrl,with_mileage:results.filter(x=>x.mileage>0).length,confidence,duplicate_collision_groups:collisions.collisionGroups,duplicate_collision_listings:collisions.collisionListings,duplicate_collision_winners:collisions.resolvedWinners,results});
  }catch(err){console.error('Marketplace reconcile failed',err);return res.status(500).json({error:err.message||'Marketplace reconcile failed'});}
}
