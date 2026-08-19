(() => {
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
  const rawLines=node=>String(node?.innerText||'').split(/\n+/).map(clean).filter(Boolean);
  const moneyFrom=text=>{const m=String(text||'').match(/\$\s?([\d,]+(?:\.\d{1,2})?)/);return m?Number(m[1].replace(/,/g,'')):0;};
  const vehicleTitleFromLines=lines=>lines.find(x=>/^(19|20)\d{2}\s+[A-Za-z0-9][A-Za-z0-9 .&'\-/]{2,80}$/.test(x)&&!/\$/.test(x))||'';
  const hash=s=>{let h=2166136261;for(const ch of String(s||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(36);};

  function marketplaceUrlFromNode(node){
    const anchors=[];
    if(node?.matches?.('a[href]'))anchors.push(node);
    anchors.push(...(node?.querySelectorAll?.('a[href]')||[]));
    for(const a of anchors){
      const href=String(a.href||a.getAttribute('href')||'');
      if(!href)continue;
      if(/\/marketplace\/item\/\d+/i.test(href))return new URL(href,location.origin).href.split('?')[0];
    }
    return '';
  }
  function marketplaceIdFromUrl(url){const m=String(url||'').match(/\/marketplace\/item\/(\d+)/i);return m?m[1]:'';}

  function looksLikeListingCard(node){
    if(!node||node.offsetParent===null)return false;
    const lines=rawLines(node),titles=lines.filter(x=>/^(19|20)\d{2}\s+[A-Za-z0-9]/.test(x)&&x.length<120);
    if(titles.length!==1)return false;
    const text=clean(node.innerText||''),price=moneyFrom(text);
    const actions=(text.match(/\bmark as sold\b/ig)||[]).length;
    const active=(text.match(/\bactive\b/ig)||[]).length;
    const listed=(text.match(/\blisted on\b/ig)||[]).length;
    return Boolean(price&&(actions===1||(active===1&&listed===1))&&text.length>=20&&text.length<=1000);
  }

  function nearestListingCard(seed){
    let node=seed;
    for(let i=0;i<12&&node;i++,node=node.parentElement){
      if(looksLikeListingCard(node))return node;
    }
    return null;
  }

  function candidateCards(){
    const cards=new Set();
    const addSeed=seed=>{const card=nearestListingCard(seed);if(card)cards.add(card);};
    for(const el of document.querySelectorAll('[role="button"],button')){
      const t=clean(el.innerText||el.getAttribute('aria-label')||'');
      if(/mark as sold|renew/i.test(t))addSeed(el);
    }
    for(const a of document.querySelectorAll('a[href*="/marketplace/item/"]'))addSeed(a);
    return [...cards];
  }

  function listingFromCard(card){
    const lines=rawLines(card),title=vehicleTitleFromLines(lines);
    if(!title)return null;
    const rawText=clean(card.innerText||''),price=moneyFrom(rawText);
    if(!price)return null;
    let status='active';
    if(/\bsold\b/i.test(rawText)&&!/mark as sold/i.test(rawText))status='sold';
    else if(/\bpending\b/i.test(rawText))status='pending';
    else if(/\bdraft\b/i.test(rawText))status='draft';
    const actualUrl=marketplaceUrlFromNode(card),actualId=marketplaceIdFromUrl(actualUrl);
    const listedDate=(rawText.match(/Listed on\s+([^·•]+)/i)?.[1]||'').trim();
    const stableText=rawText.replace(/\b\d+ clicks? on listing\b/ig,'').replace(/Renew \([^)]*\)/ig,'Renew');
    const captureKey=hash(`${title}|${price}|${listedDate||stableText}`);
    return {listing_id:actualId||`local-${captureKey}`,listing_url:actualUrl||`k2fb://capture/${captureKey}`,actual_listing_url:actualUrl||'',title,price,status,raw_text:rawText.slice(0,1400),capture_key:captureKey};
  }

  function collectVisible(byKey,diag){
    const cards=candidateCards();diag.card_candidates_seen+=cards.length;
    for(const card of cards){
      const row=listingFromCard(card);if(!row)continue;diag.parsed_cards++;
      const key=row.actual_listing_url||`${row.title.toLowerCase()}|${row.price}|${row.raw_text.match(/Listed on\s+([^·•]+)/i)?.[1]||row.capture_key}`;
      const prior=byKey.get(key);
      if(!prior)byKey.set(key,row);
      else if(!prior.actual_listing_url&&row.actual_listing_url)byKey.set(key,row);
    }
    diag.unique_so_far=byKey.size;
  }

  function scrollCandidates(){
    const seen=new Set(),out=[];const add=el=>{if(el&&!seen.has(el)){seen.add(el);out.push(el);}};
    add(document.scrollingElement);add(document.documentElement);add(document.body);
    for(const el of document.querySelectorAll('div[role="main"],main,div')){
      const cs=getComputedStyle(el);if(!/(auto|scroll)/.test(cs.overflowY))continue;
      if(el.scrollHeight>el.clientHeight+300&&el.clientHeight>300)add(el);
    }
    return out.sort((a,b)=>(b.scrollHeight-b.clientHeight)-(a.scrollHeight-a.clientHeight)).slice(0,5);
  }

  async function capture(){
    if(!location.pathname.startsWith('/marketplace/you/selling'))throw new Error('Open Facebook Marketplace → Your listings → Selling first.');
    const byKey=new Map(),diag={method:'strict_single_card_progressive_scroll',passes:0,card_candidates_seen:0,parsed_cards:0,unique_so_far:0,with_real_url:0,without_real_url:0};
    collectVisible(byKey,diag);let stable=0,previousCount=byKey.size,previousHeight=0;
    for(let pass=0;pass<55&&stable<7;pass++){
      diag.passes=pass+1;const scrollers=scrollCandidates();let maxHeight=0;
      for(const el of scrollers){
        maxHeight=Math.max(maxHeight,el.scrollHeight||0);const step=Math.max(520,Math.floor((el.clientHeight||window.innerHeight)*0.72));
        if(el===document.body||el===document.documentElement||el===document.scrollingElement)window.scrollBy({top:step,behavior:'auto'});else el.scrollTop=Math.min(el.scrollHeight,el.scrollTop+step);
      }
      await sleep(650);collectVisible(byKey,diag);
      const grew=byKey.size>previousCount||maxHeight>previousHeight+100;stable=grew?0:stable+1;previousCount=byKey.size;previousHeight=Math.max(previousHeight,maxHeight);
    }
    collectVisible(byKey,diag);const listings=[...byKey.values()];diag.unique_so_far=listings.length;diag.with_real_url=listings.filter(x=>x.actual_listing_url).length;diag.without_real_url=listings.length-diag.with_real_url;
    try{window.scrollTo({top:0,behavior:'auto'});}catch{}
    const payload={captured_at:new Date().toISOString(),page_url:location.href,listings,diagnostics:diag};
    await chrome.storage.local.set({facebookSellingCapture:payload,facebookSellingCaptureAt:payload.captured_at});
    return {ok:true,count:listings.length,listings,diagnostics:diag};
  }
  chrome.runtime.onMessage.addListener((msg,_sender,sendResponse)=>{if(msg?.type!=='K2A_CAPTURE_FACEBOOK_SELLING')return;capture().then(sendResponse).catch(err=>sendResponse({ok:false,error:err.message||String(err)}));return true;});
})();