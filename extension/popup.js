chrome.storage.local.get(['lastPayload','lastFillAt','idmsInventory','idmsCaptureAt'],({lastPayload,lastFillAt,idmsInventory,idmsCaptureAt})=>{
  const v=document.getElementById('vehicle');
  const t=document.getElementById('time');
  const s=document.getElementById('idmsStatus');
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

const btn=document.getElementById('captureIdms');
btn?.addEventListener('click',async()=>{
  const status=document.getElementById('idmsStatus');
  btn.disabled=true; status.className='small'; status.textContent='Reading current IDMS page…';
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
  finally{btn.disabled=false;}
});