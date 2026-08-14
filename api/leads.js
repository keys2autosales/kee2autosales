const SUPABASE_URL=process.env.SUPABASE_URL;
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;

function headers(){
  return {apikey:SERVICE_KEY,Authorization:`Bearer ${SERVICE_KEY}`,'Content-Type':'application/json'};
}
async function supabase(path,options={}){
  if(!SUPABASE_URL||!SERVICE_KEY) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in Vercel.');
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{...headers(),...(options.headers||{})}});
  const text=await r.text();
  const data=text?JSON.parse(text):null;
  if(!r.ok) throw new Error(data?.message||data?.hint||`Supabase error ${r.status}`);
  return data;
}
export default async function handler(req,res){
  try{
    if(req.method==='GET'){
      const rows=await supabase('leads?select=*&order=created_at.asc');
      return res.status(200).json(rows);
    }
    if(req.method==='POST'){
      const rows=await supabase('leads',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(req.body||{})});
      return res.status(201).json(rows[0]);
    }
    if(req.method==='PATCH'){
      const id=String(req.query.id||'');
      if(!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({error:'Invalid lead id'});
      const rows=await supabase(`leads?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(req.body||{})});
      if(!rows?.length) return res.status(404).json({error:'Lead not found'});
      return res.status(200).json(rows[0]);
    }
    res.setHeader('Allow','GET, POST, PATCH');
    return res.status(405).json({error:'Method not allowed'});
  }catch(err){
    console.error(err);
    return res.status(500).json({error:err.message||'Server error'});
  }
}
