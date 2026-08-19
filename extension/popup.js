chrome.storage.local.get(['lastPayload','lastFillAt','idmsInventory','idmsCaptureAt','idmsSyncToken','facebookSellingCapture','facebookSellingCaptureAt','lastMarketplacePreview'],({lastPayload,lastFillAt,idmsInventory,idmsCaptureAt,idmsSyncToken,facebookSellingCapture,facebookSellingCaptureAt,lastMarketplacePreview})=>{
  const v=document.getElementById('vehicle');
  const t=document.getElementById('time');
  const s=document.getElementById('idmsStatus');
  const fs=document.getElementById('facebookStatus');
  const token=document.getElementById('syncToken');
  const apply=document.getElementById('reconcileFacebook');
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
  if(facebookSellingCapture){
    const d=facebookSellingCapture.diagnostics||{};
    fs.textContent=`Last Facebook capture: ${facebookSellingCapture.listings?.length||0} listings${d.with_real_url!=null?` • ${d.with_real_url} real URLs • ${d.without_real_url||0} internal`:''}${facebookSellingCaptureAt?' • '+new Date(facebookSellingCaptureAt).toLocaleString():''}`;
    fs.className='small ok';
  }
  if(lastMarketplacePreview&&apply){
    apply.disabled=!(lastMarketplacePreview.matched>0);
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

const captureFacebookBtn=document.getElementById('captureFacebook');
captureFacebookBtn?.addEventListener('click',async()=>{
  const status=document.getElementById('facebookStatus');
  const apply=document.getElementById('reconcileFacebook');
  if(apply) apply.disabled=true;
  await chrome.storage.local.remove(['lastMarketplacePreview','lastMarketplacePreviewAt']);
  captureFacebookBtn.disabled=true; status.className='small'; status.textContent='Scanning Facebook Selling listings…';
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab?.url?.startsWith('https://www.facebook.com/marketplace/you/selling')) throw new Error('Open Facebook Marketplace → Your listings → Selling first.');
    const res=await chrome.tabs.sendMessage(tab.id,{type:'K2A_CAPTURE_FACEBOOK_SELLING'});
    if(!res?.ok) throw new Error(res?.error||'Could not read Facebook Marketplace listings.');
    const d=res.diagnostics||{};
    status.className='small ok';
    status.textContent=`Captured ${res.count} unique Facebook listings • ${d.with_real_url||0} real URLs • ${d.without_real_url||0} internal matches • ${d.passes||0} scan passes. Preview before applying.`;
  }catch(e){status.className='small err';status.textContent=e.message||String(e);}
  finally{captureFacebookBtn.disabled=false;}
});

async function runReconcile({dryRun}){
  const token=String(document.getElementById('syncToken')?.value||'').trim();
  if(!token) throw new Error('Enter the sync token first.');
  await chrome.storage.local.set({idmsSyncToken:token});
  const {facebookSellingCapture}=await chrome.storage.local.get('facebookSellingCapture');
  if(!facebookSellingCapture?.listings?.length) throw new Error('No Facebook Selling capture is stored yet. Capture Facebook listings first.');
  const r=await fetch('https://kee2autosales-nt8d.vercel.app/api/marketplace-reconcile',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify({listings:facebookSellingCapture.listings,captured_at:facebookSellingCapture.captured_at,dry_run:dryRun})});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error||`Marketplace reconciliation failed (${r.status})`);
  return data;
}

const previewBtn=document.getElementById('previewFacebook');
previewBtn?.addEventListener('click',async()=>{
  const status=document.getElementById('facebookStatus');
  const apply=document.getElementById('reconcileFacebook');
  previewBtn.disabled=true; if(apply) apply.disabled=true;
  status.className='small'; status.textContent='Previewing Marketplace matches — no database changes…';
  try{
    const data=await runReconcile({dryRun:true});
    const high=data.confidence?.high??data.matched??0;
    const review=data.confidence?.review??data.ambiguous??0;
    const low=data.confidence?.low??data.unmatched??0;
    const safe=high>0;
    status.className=`small ${safe?'ok':'err'}`;
    status.textContent=`PREVIEW ONLY • ${data.total} listings • High ${high} • Review ${review} • Low ${low} • Real URLs ${data.with_real_url}. ${safe?'Apply will write HIGH-confidence matches only.':'No high-confidence matches yet; no changes were made.'}`;
    await chrome.storage.local.set({lastMarketplacePreview:data,lastMarketplacePreviewAt:new Date().toISOString()});
    if(apply) apply.disabled=!safe;
  }catch(e){status.className='small err';status.textContent=e.message||String(e);}
  finally{previewBtn.disabled=false;}
});

const reconcileBtn=document.getElementById('reconcileFacebook');
reconcileBtn?.addEventListener('click',async()=>{
  const status=document.getElementById('facebookStatus');
  reconcileBtn.disabled=true; status.className='small'; status.textContent='Applying high-confidence Marketplace matches…';
  try{
    const {lastMarketplacePreview}=await chrome.storage.local.get('lastMarketplacePreview');
    if(!lastMarketplacePreview||lastMarketplacePreview.matched<=0) throw new Error('Run Preview Matches and confirm at least one high-confidence match first.');
    const data=await runReconcile({dryRun:false});
    status.className='small ok'; status.textContent=`Applied ${data.matched} HIGH-confidence matches • Review ${data.ambiguous} untouched • Low ${data.unmatched} untouched.`;
    await chrome.storage.local.set({lastMarketplaceReconcile:data,lastMarketplaceReconcileAt:new Date().toISOString()});
  }catch(e){status.className='small err';status.textContent=e.message||String(e);}
});