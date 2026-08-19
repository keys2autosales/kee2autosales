(() => {
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
  const moneyFrom=text=>{const m=String(text||'').match(/\$\s?([\d,]+(?:\.\d{1,2})?)/);return m?Number(m[1].replace(/,/g,'')):0;};
  const idFromHref=href=>{const m=String(href||'').match(/\/marketplace\/item\/(\d+)/);return m?m[1]:'';};

  function cardFor(anchor){
    let node=anchor;
    for(let i=0;i<8&&node;i++,node=node.parentElement){
      const text=clean(node.innerText||'');
      const links=node.querySelectorAll?.('a[href*="/marketplace/item/"]')?.length||0;
      if(text.length>=8&&text.length<=700&&links<=4) return node;
    }
    return anchor.parentElement||anchor;
  }

  function listingFromAnchor(anchor){
    const href=anchor.href||anchor.getAttribute('href')||'';
    const listingId=idFromHref(href);
    if(!listingId) return null;
    const card=cardFor(anchor);
    const rawText=clean(card?.innerText||anchor.innerText||'');
    if(!rawText) return null;
    const lines=String(card?.innerText||anchor.innerText||'').split(/\n+/).map(clean).filter(Boolean);
    const price=moneyFrom(rawText);
    const title=lines.find(x=>!/\$\s?[\d,]+/.test(x)&&!/^(active|sold|pending|draft|listed|renew|delete|edit|boost|share)$/i.test(x)&&x.length>4)||'';
    let status='active';
    if(/\bsold\b/i.test(rawText)) status='sold';
    else if(/\bpending\b/i.test(rawText)) status='pending';
    else if(/\bdraft\b/i.test(rawText)) status='draft';
    return {listing_id:listingId,listing_url:new URL(href,location.origin).href.split('?')[0],title,price,status,raw_text:rawText.slice(0,1200)};
  }

  async function scrollUntilStable(){
    let stable=0,last=-1;
    for(let i=0;i<18&&stable<3;i++){
      const count=document.querySelectorAll('a[href*="/marketplace/item/"]').length;
      stable=count===last?stable+1:0; last=count;
      window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'});
      await sleep(900);
    }
    window.scrollTo({top:0,behavior:'smooth'});
    await sleep(350);
  }

  async function capture(){
    if(!location.pathname.startsWith('/marketplace/you/selling')) throw new Error('Open Facebook Marketplace → Your listings → Selling first.');
    await scrollUntilStable();
    const byId=new Map();
    for(const a of document.querySelectorAll('a[href*="/marketplace/item/"]')){
      const row=listingFromAnchor(a); if(!row) continue;
      const prior=byId.get(row.listing_id);
      if(!prior || row.raw_text.length>prior.raw_text.length) byId.set(row.listing_id,row);
    }
    const listings=[...byId.values()];
    const payload={captured_at:new Date().toISOString(),page_url:location.href,listings};
    await chrome.storage.local.set({facebookSellingCapture:payload,facebookSellingCaptureAt:payload.captured_at});
    return {ok:true,count:listings.length,listings};
  }

  chrome.runtime.onMessage.addListener((msg,_sender,sendResponse)=>{
    if(msg?.type!=='K2A_CAPTURE_FACEBOOK_SELLING') return;
    capture().then(sendResponse).catch(err=>sendResponse({ok:false,error:err.message||String(err)}));
    return true;
  });
})();