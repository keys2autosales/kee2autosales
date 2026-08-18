chrome.storage.local.get(['lastPayload','lastFillAt'],({lastPayload,lastFillAt})=>{
  const v=document.getElementById('vehicle');
  const t=document.getElementById('time');
  if(lastPayload){v.textContent=`${lastPayload.year||''} ${lastPayload.make||''} ${lastPayload.model||''}`.trim() || 'Vehicle ready';}
  if(lastFillAt){t.textContent=`Last autofill: ${new Date(lastFillAt).toLocaleString()}`;}
});