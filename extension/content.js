(() => {
  const PREFIX = '#k2=';
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function decodePayload(){
    if(!location.hash.startsWith(PREFIX)) return null;
    try{
      const raw = location.hash.slice(PREFIX.length);
      const padded = raw.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4 - raw.length % 4) % 4);
      const json = decodeURIComponent(escape(atob(padded)));
      return JSON.parse(json);
    }catch(err){
      console.warn('Keys2AutoSales: could not decode Marketplace payload', err);
      return null;
    }
  }

  const normalize = s => String(s||'').toLowerCase().replace(/\s+/g,' ').trim();

  function inputLike(el){
    return !!el && (el.matches('input, textarea, [contenteditable="true"]') || el.getAttribute('role') === 'textbox');
  }

  function setNativeValue(el,value){
    if(!el || value === undefined || value === null || value === '') return false;
    el.focus();
    if(el.matches('input, textarea')){
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto,'value')?.set;
      setter ? setter.call(el,String(value)) : (el.value=String(value));
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
      el.dispatchEvent(new Event('blur',{bubbles:true}));
    }else{
      el.textContent=String(value);
      el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:String(value)}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
    }
    return true;
  }

  function directField(names){
    for(const name of names){
      const safe = String(name).replace(/"/g,'\\"');
      const selectors=[
        `input[placeholder="${safe}" i]`,
        `textarea[placeholder="${safe}" i]`,
        `input[aria-label="${safe}" i]`,
        `textarea[aria-label="${safe}" i]`,
        `[role="textbox"][aria-label="${safe}" i]`
      ];
      for(const sel of selectors){
        try{ const el=document.querySelector(sel); if(inputLike(el)) return el; }catch(_e){}
      }
    }
    return null;
  }

  function findField(labels){
    const direct=directField(labels);
    if(direct) return direct;
    const wanted = labels.map(normalize);
    const nodes = [...document.querySelectorAll('label, span, div')];
    for(const node of nodes){
      const txt = normalize(node.textContent);
      if(!txt || txt.length > 100 || !wanted.some(w => txt === w || txt.startsWith(w))) continue;
      if(node.tagName === 'LABEL'){
        const forId=node.getAttribute('for');
        if(forId){const byId=document.getElementById(forId);if(inputLike(byId))return byId;}
        const inside=node.querySelector('input,textarea,[contenteditable="true"],[role="textbox"]');
        if(inputLike(inside)) return inside;
      }
      let scope=node.closest('div');
      for(let i=0;i<5 && scope;i++,scope=scope.parentElement){
        const field=scope.querySelector('input,textarea,[contenteditable="true"],[role="textbox"]');
        if(inputLike(field)) return field;
      }
    }
    return null;
  }

  function findSelectTrigger(labels){
    const wanted=labels.map(normalize);
    const all=[...document.querySelectorAll('[role="combobox"],[aria-haspopup="listbox"],[aria-haspopup="menu"]')];
    for(const trigger of all){
      const aria=normalize(trigger.getAttribute('aria-label'));
      if(wanted.some(w=>aria===w || aria.includes(w))) return trigger;
      const text=normalize(trigger.textContent);
      if(wanted.some(w=>text===w || text.startsWith(w))) return trigger;
    }
    const nodes=[...document.querySelectorAll('label,span,div')];
    for(const node of nodes){
      const txt=normalize(node.textContent);
      if(!txt || txt.length>100 || !wanted.some(w=>txt===w || txt.startsWith(w))) continue;
      let scope=node.closest('div');
      for(let i=0;i<5 && scope;i++,scope=scope.parentElement){
        const trigger=scope.querySelector('[role="combobox"], [aria-haspopup="listbox"], [aria-haspopup="menu"]');
        if(trigger) return trigger;
      }
    }
    return null;
  }

  async function chooseOption(labels,value){
    if(!value) return false;
    const trigger=findSelectTrigger(labels);
    if(!trigger) return false;
    trigger.click();
    await sleep(700);
    const opts=[...document.querySelectorAll('[role="option"], [role="menuitem"], [role="menuitemradio"], li')];
    const val=normalize(value);
    const target=opts.find(o=>normalize(o.textContent)===val) || opts.find(o=>normalize(o.textContent).includes(val));
    if(target){ target.click(); await sleep(500); return true; }
    document.body.click();
    return false;
  }

  async function waitForField(labels,timeout=8000){
    const start=Date.now();
    while(Date.now()-start < timeout){
      const f=findField(labels);
      if(f) return f;
      await sleep(250);
    }
    return null;
  }

  function description(p){
    return [
      `🚙 ${p.year||''} ${p.make||''} ${p.model||''}`.trim(),
      '',
      p.price ? `Price: $${Number(p.price).toLocaleString()}` : '',
      p.mileage ? `Mileage: ${Number(p.mileage).toLocaleString()}` : '',
      p.stock ? `Stock #: ${p.stock}` : '',
      p.vin ? `VIN: ${p.vin}` : '',
      p.color ? `Color: ${p.color}` : '',
      '',
      'Financing options available • Trade-ins welcome • First-time buyers welcome',
      '',
      p.bookingLink ? `Schedule a test drive: ${p.bookingLink}` : '',
      p.applicationLink ? `Credit application: ${p.applicationLink}` : ''
    ].filter((x,i,a)=>x!=='' || (i>0 && a[i-1]!=='' && i<a.length-1)).join('\n').trim();
  }

  function showNote(text,ok=true){
    document.querySelector('.k2-fill-note')?.remove();
    const note=document.createElement('div');
    note.className='k2-fill-note';
    note.textContent=text;
    Object.assign(note.style,{position:'fixed',right:'18px',bottom:'18px',zIndex:2147483647,background:ok?'#0f172a':'#991b1b',color:'#fff',padding:'12px 16px',borderRadius:'10px',font:'600 13px system-ui',boxShadow:'0 12px 30px rgba(0,0,0,.25)',maxWidth:'360px'});
    document.body.appendChild(note);
    setTimeout(()=>note.remove(),8000);
  }

  async function autofill(p){
    const results={};
    showNote('Keys2AutoSales: loading vehicle into Marketplace…');

    // Facebook's current vehicle form begins with VIN and Vehicle type.
    const vinField = await waitForField(['VIN'],6000);
    results.vin = setNativeValue(vinField,p.vin);
    if(results.vin) await sleep(1800); // allow Facebook VIN lookup/autofill to react

    // Vehicle type unlocks the remaining form on current Marketplace layouts.
    results.vehicleType = await chooseOption(['Vehicle type'],p.vehicleType || 'Car/Truck');
    if(!results.vehicleType){
      // Some accounts label the option simply "Car".
      results.vehicleType = await chooseOption(['Vehicle type'],'Car');
    }
    await sleep(1600);

    // Fill fields Facebook did not populate from VIN. Text fields first, then selects.
    const fieldPairs=[
      ['year',['Year'],p.year],
      ['make',['Make'],p.make],
      ['model',['Model'],p.model],
      ['mileage',['Mileage','Odometer'],p.mileage],
      ['price',['Price'],p.price],
      ['description',['Description'],p.description || description(p)]
    ];
    for(const [key,labels,value] of fieldPairs){
      const field=findField(labels);
      results[key]=setNativeValue(field,value);
    }

    if(!results.year) results.year=await chooseOption(['Year'],String(p.year||''));
    if(!results.make) results.make=await chooseOption(['Make'],p.make);
    if(!results.model) results.model=await chooseOption(['Model'],p.model);

    chrome.storage.local.set({lastPayload:p,lastFillAt:new Date().toISOString(),lastResults:results});
    window.postMessage({source:'keys2autosales-extension',type:'K2_AUTOFILL_COMPLETE',results},'*');

    const count=Object.values(results).filter(Boolean).length;
    showNote(count>1
      ? `Keys2AutoSales filled ${count} Marketplace fields. Review the listing and add photos before publishing.`
      : 'Keys2AutoSales found the Marketplace page but could not match the form fields. Reload the extension and try again.',
      count>1);
  }

  const payload=decodePayload();
  if(payload){
    chrome.storage.local.set({lastPayload:payload});
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      const ready=findField(['VIN']) || document.querySelector('[role="combobox"]');
      if(ready || tries>30){clearInterval(timer);autofill(payload);}
    },400);
  }
})();