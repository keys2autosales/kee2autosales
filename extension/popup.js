chrome.storage.local.get(['lastPayload','lastFillAt','idmsInventory','idmsCaptureAt','idmsSyncToken'],({lastPayload,lastFillAt,idmsInventory,idmsCaptureAt,idmsSyncToken})=>{
  const v=document.getElementById('vehicle');
  const t=document.getElementById('time');
  const s=document.getElementById('idmsStatus');
  const token=document.getElementById('syncToken');
  if(token&&idmsSyncToken) token.value=idmsSyncToken;
  if(lastPayload){v.textContent=`${lastPayload.year||''} ${lastPayload.make||''} ${lastPayload.model||''}`.trim() || 'Vehicle ready';}
  if(lastFillAt){t.textContent=`Last autofill: ${new Date(lastFillAt).toLocaleString()}`;}
  if(idmsInventory){
    const d=idmsInventory.diagnostics||{};
    const expected=d.expected_count||0, captured=idmsInventory.vehicles?.length||0;
    const mismatch=expected&&expected!==captured;
    const extra=[d.missing_vin?`${d.missing_vin} missing VIN`:'',d.unparsed_rows?`${d.unparsed_rows} unparsed`:'',d.duplicate_rows?`${d.duplicate_rows} duplicate`:''].filter(Boolean).join(' • ');
    s.textContent=`Last capture: ${expected?`${captured}/${expected}`:captured} vehicles${extra?' • '+extra:''}${idmsCaptureAt?' • '+new Date(idmsCaptureAt).toLocaleString():''}`;
    s.className=`small ${mismatch?'err':'ok'}`;
  }
});

const captureBtn=document.getElementById('captureIdms');
captureBtn?.addEventListener('click',async()=>{
  const status=document.getElementById('idmsStatus');
  captureBtn.disabled=true; status.className='small'; status.textContent='Reading current IDMS page…';
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab?.url?.startsWith('https://idms.dealersocket.com/Inventory/')) throw new Error('Open the DealerSocket IDMS Inventory page first.');
    const res=await chrome.tabs.sendMessage(tab.id,{type:'K2A_CAPTURE_IDMS'});
    if(!res?.ok) throw new Error(res?.error||'Could not read IDMS inventory.');
    const d=res.diagnostics||{}, expected=d.expected_count||0, captured=res.count||0;
    const mismatch=expected&&captured!==expected;
    const extra=[d.missing_vin?`${d.missing_vin} missing VIN`:'',d.unparsed_rows?`${d.unparsed_rows} unparsed`:'',d.duplicate_rows?`${d.duplicate_rows} duplicate`:''].filter(Boolean).join(' • ');
    status.className=`small ${mismatch?'err':'ok'}`;
    status.textContent=`Captured ${expected?`${captured}/${expected}`:captured} vehicles${extra?' • '+extra:''}. ${mismatch?'Review diagnostics before cloud sync.':'Capture matches IDMS and is ready for Keys2AutoSales sync.'}`;
  }catch(e){status.className='small err';status.textContent=e.message||String(e);}
  finally{captureBtn.disabled=false;}
});

const pushBtn=document.getElementById('pushCloud');
pushBtn?.addEventListener('click',async()=>{
  const status=document.getElementById('cloudStatus');
  const token=String(document.getElementById('syncToken')?.value||'').trim();
  pushBtn.disabled=true; status.className='small'; status.textContent='Sending verified IDMS snapshot to Keys2AutoSales…';
  try{
    if(!token) throw new Error('Enter the IDMS sync token first.');
    await chrome.storage.local.set({idmsSyncToken:token});
    const {idmsInventory}=await chrome.storage.local.get('idmsInventory');
    if(!idmsInventory?.vehicles?.length) throw new Error('No IDMS capture is stored yet. Run Sync Current IDMS Page first.');
    const d=idmsInventory.diagnostics||{};
    if(d.expected_count&&idmsInventory.vehicles.length!==d.expected_count) throw new Error(`Cloud sync blocked: capture is ${idmsInventory.vehicles.length}/${d.expected_count}.`);
    const r=await fetch('https://kee2autosales-nt8d.vercel.app/api/idms-sync',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify({vehicles:idmsInventory.vehicles,diagnostics:d,captured_at:idmsInventory.captured_at})});
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data.error||`Cloud sync failed (${r.status})`);
    status.className='small ok';
    status.textContent=`Cloud synced ${data.total} vehicles • New ${data.new} • Updated ${data.updated} • Returned ${data.returned} • Sold/Removed ${data.removed} • Unchanged ${data.unchanged}`;
    await chrome.storage.local.set({lastCloudSync:data,lastCloudSyncAt:new Date().toISOString()});
  }catch(e){status.className='small err';status.textContent=e.message||String(e);}
  finally{pushBtn.disabled=false;}
});