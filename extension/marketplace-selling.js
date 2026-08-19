(() => {
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
  const moneyFrom=text=>{const m=String(text||'').match(/\$\s?([\d,]+(?:\.\d{1,2})?)/);return m?Number(m[1].replace(/,/g,'')):0;};
  const idFromHref=href=>{const m=String(href||'').match(/\/marketplace\/item\/(\d+)/);return m?m[1]:'';};

  function cardFor(anchor){
    let node=anchor;
    for(let i=0;i<10&&node;i++,node=node.parentElement){
      const text=clean(node.innerText||'');
      const links=node.querySelectorAll?.('a[href*="/marketplace/item/"]')?.length||0;
      if(text.length>=8&&text.length<=1200&&links<=5) return node;
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
    const title=lines.find(x=>!/\$\s?[\d,]+/.test(x)&&!/^(active|sold|pending|draft|listed|renew|delete|edit|boost|share|mark as sold)$/i.test(x)&&x.length>4)||'';
    let status='active';
    if(/\bsold\b/i.test(rawText)) status='sold';
    else if(/\bpending\b/i.test(rawText)) status='pending';
    else if(/\bdraft\b/i.test(rawText)) status='draft';
    return {listing_id:listingId,listing_url:new URL(href,location.origin).href.split('?')[0],title,price,status,raw_text:rawText.slice(0,1600)};
  }

  function collectVisible(byId){
    let added=0;
    for(const a of document.querySelectorAll('a[href*="/marketplace/item/"]')){
      const row=listingFromAnchor(a); if(!row) continue;
      const prior=byId.get(row.listing_id);
      if(!prior){byId.set(row.listing_id,row);added++;}
      else if(row.raw_text.length>prior.raw_text.length) byId.set(row.listing_id,row);
    }
    return added;
  }

  function scrollCandidates(){
    const seen=new Set();
    const out=[];
    const add=el=>{if(el&&!seen.has(el)){seen.add(el);out.push(el);}};
    add(document.scrollingElement);
    add(document.documentElement);
    add(document.body);
    for(const el of document.querySelectorAll('div[role="main"],main,div')){
      const cs=getComputedStyle(el);
      if(!/(auto|scroll)/.test(cs.overflowY)) continue;
      if(el.scrollHeight>el.clientHeight+300 && el.clientHeight>300) add(el);
    }
    return out.sort((a,b)=>(b.scrollHeight-b.clientHeight)-(a.scrollHeight-a.clientHeight)).slice(0,6);
  }

  async function capture(){
    if(!location.pathname.startsWith('/marketplace/you/selling')) throw new Error('Open Facebook Marketplace → Your listings → Selling first.');

    const byId=new Map();
    collectVisible(byId);
    let stable=0;
    let previousCount=byId.size;
    let previousHeight=0;

    for(let pass=0;pass<45 && stable<6;pass++){
      const scrollers=scrollCandidates();
      let maxHeight=0;
      for(const el of scrollers){
        maxHeight=Math.max(maxHeight,el.scrollHeight||0);
        const step=Math.max(500,Math.floor((el.clientHeight||window.innerHeight)*0.78));
        if(el===document.body||el===document.documentElement||el===document.scrollingElement){
          window.scrollBy({top:step,behavior:'auto'});
        }else{
          el.scrollTop=Math.min(el.scrollHeight,el.scrollTop+step);
        }
      }
      await sleep(700);
      collectVisible(byId);

      const grew=byId.size>previousCount || maxHeight>previousHeight+100;
      stable=grew?0:stable+1;
      previousCount=byId.size;
      previousHeight=Math.max(previousHeight,maxHeight);
    }

    collectVisible(byId);
    try{window.scrollTo({top:0,behavior:'auto'});}catch{}
    for(const el of scrollCandidates()){
      if(el!==document.body&&el!==document.documentElement&&el!==document.scrollingElement){try{el.scrollTop=0;}catch{}}
    }

    const listings=[...byId.values()];
    const payload={captured_at:new Date().toISOString(),page_url:location.href,listings,diagnostics:{captured:listings.length,method:'progressive_virtualized_scroll'}};
    await chrome.storage.local.set({facebookSellingCapture:payload,facebookSellingCaptureAt:payload.captured_at});
    return {ok:true,count:listings.length,listings,diagnostics:payload.diagnostics};
  }

  chrome.runtime.onMessage.addListener((msg,_sender,sendResponse)=>{
    if(msg?.type!=='K2A_CAPTURE_FACEBOOK_SELLING') return;
    capture().then(sendResponse).catch(err=>sendResponse({ok:false,error:err.message||String(err)}));
    return true;
  });
})();