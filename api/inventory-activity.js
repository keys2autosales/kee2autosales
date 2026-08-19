const SUPABASE_URL=process.env.SUPABASE_URL;
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;

function headers(){return {apikey:SERVICE_KEY,Authorization:`Bearer ${SERVICE_KEY}`,'Content-Type':'application/json'};}
async function sb(path){
  if(!SUPABASE_URL||!SERVICE_KEY) throw new Error('Missing Supabase server environment variables.');
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{headers:headers()});
  const text=await r.text(); let data=null; try{data=text?JSON.parse(text):null;}catch{data={message:text};}
  if(!r.ok) throw new Error(data?.message||data?.hint||`Supabase error ${r.status}`);
  return data;
}

export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
  try{
    const snapshots=await sb('inventory_snapshots?select=id,source,imported_at,row_count,notes&order=imported_at.desc&limit=1');
    const snapshot=snapshots?.[0]||null;
    if(!snapshot) return res.status(200).json({snapshot:null,summary:{total:0,new:0,updated:0,returned:0,removed:0,unchanged:0,price_changes:0},changes:[]});

    const changes=await sb(`inventory_changes?select=id,change_type,stock_number,vin,vehicle_name,changed_fields,detected_at,resolved_at,resolution&snapshot_id=eq.${encodeURIComponent(snapshot.id)}&order=detected_at.desc`);
    const summary={total:Number(snapshot.row_count||0),new:0,updated:0,returned:0,removed:0,unchanged:0,price_changes:0};
    for(const c of changes||[]){
      if(c.change_type==='new') summary.new++;
      else if(c.change_type==='updated') summary.updated++;
      else if(c.change_type==='returned') summary.returned++;
      else if(c.change_type==='removed') summary.removed++;
      if(c.changed_fields&&Object.prototype.hasOwnProperty.call(c.changed_fields,'dealer_price')) summary.price_changes++;
    }
    summary.unchanged=Math.max(0,summary.total-summary.new-summary.updated-summary.returned);

    return res.status(200).json({snapshot,summary,changes:changes||[]});
  }catch(err){
    console.error('Inventory activity failed',err);
    return res.status(500).json({error:err.message||'Inventory activity failed'});
  }
}
