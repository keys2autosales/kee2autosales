chrome.storage.local.get(['lastPayload','lastFillAt','idmsInventory','idmsCaptureAt'],({lastPayload,lastFillAt,idmsInventory,idmsCaptureAt})=>{
  const v=document.getElementById('vehicle');
  const t=document.getElementById('time');
  const s=document.getElementById('idmsStatus');
  if(lastPayload){v.textContent=`${lastPayload.year||''} ${lastPayload.make||''} ${lastPayload.model||''}`.trim() || 'Vehicle ready';}
  if(lastFillAt){t.textContent=`Last autofill: ${new Date(lastFillAt).toLocaleString()}`;}
  if(idmsInventory){s.textContent=`Last capture: ${idmsInventory.vehicles?.length||0} vehicles${idmsCaptureAt?' • '+new Date(idmsCaptureAt).toLocaleString():''}`;s.className='small ok';}
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
    status.className='small ok'; status.textContent=`Captured ${res.count} vehicle${res.count===1?'':'s'} from IDMS. Stored safely in the extension for Keys2AutoSales sync.`;
  }catch(e){status.className='small err';status.textContent=e.message||String(e);}
  finally{btn.disabled=false;}
});