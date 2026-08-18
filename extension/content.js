(() => {
  const PREFIX = '#k2=';

  function decodePayload(){
    if(!location.hash.startsWith(PREFIX)) return null;
    try{
      const raw = location.hash.slice(PREFIX.length);
      const json = decodeURIComponent(escape(atob(raw.replace(/-/g,'+').replace(/_/g,'/'))));
      return JSON.parse(json);
    }catch(err){
      console.warn('Keys2AutoSales: could not decode Marketplace payload', err);
      return null;
    }
  }

  function normalize(s){
    return String(s||'').toLowerCase().replace(/\s+/g,' ').trim();
  }

  function inputLike(el){
    return el && (el.matches('input, textarea, [contenteditable="true"]') || el.getAttribute('role') === 'textbox');
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
    }else{
      el.textContent=String(value);
      el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:String(value)}));
    }
    el.blur();
    return true;
  }

  function findField(labels){
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
      for(let i=0;i<4 && scope;i++,scope=scope.parentElement){
        const field=scope.querySelector('input,textarea,[contenteditable="true"],[role="textbox"]');
        if(inputLike(field)) return field;
      }
    }
    return null;
  }

  function findSelectTrigger(labels){
    const wanted=labels.map(normalize);
    const nodes=[...document.querySelectorAll('label,span,div')];
    for(const node of nodes){
      const txt=normalize(node.textContent);
      if(!txt || txt.length>100 || !wanted.some(w=>txt===w || txt.startsWith(w))) continue;
      let scope=node.closest('div');
      for(let i=0;i<4 && scope;i++,scope=scope.parentElement){
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
    await new Promise(r=>setTimeout(r,450));
    const opts=[...document.querySelectorAll('[role="option"], [role="menuitem"], li')];
    const target=opts.find(o=>normalize(o.textContent)===normalize(value)) || opts.find(o=>normalize(o.textContent).includes(normalize(value)));
    if(target){target.click();return true;}
    return false;
  }

  function description(p){
    const lines=[
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
    ];
    return lines.filter((x,i,a)=>x!=='' || (i>0 && a[i-1]!=='' && i<a.length-1)).join('\n').trim();
  }

  async function autofill(p){
    const results={};
    results.year=setNativeValue(findField(['Year']),p.year);
    results.make=setNativeValue(findField(['Make']),p.make);
    results.model=setNativeValue(findField(['Model']),p.model);
    results.mileage=setNativeValue(findField(['Mileage','Odometer']),p.mileage);
    results.price=setNativeValue(findField(['Price']),p.price);
    results.description=setNativeValue(findField(['Description']),p.description || description(p));

    // Some Marketplace fields are rendered as select/combobox controls instead of text inputs.
    if(!results.year) results.year=await chooseOption(['Year'],String(p.year||''));
    if(!results.make) results.make=await chooseOption(['Make'],p.make);
    if(!results.model) results.model=await chooseOption(['Model'],p.model);

    chrome.storage.local.set({lastPayload:p,lastFillAt:new Date().toISOString(),lastResults:results});
    window.postMessage({source:'keys2autosales-extension',type:'K2_AUTOFILL_COMPLETE',results},'*');

    const note=document.createElement('div');
    note.textContent='Keys2AutoSales autofill complete — review the listing and add photos before publishing.';
    Object.assign(note.style,{position:'fixed',right:'18px',bottom:'18px',zIndex:2147483647,background:'#0f172a',color:'#fff',padding:'12px 16px',borderRadius:'10px',font:'600 13px system-ui',boxShadow:'0 12px 30px rgba(0,0,0,.25)'});
    document.body.appendChild(note);
    setTimeout(()=>note.remove(),6000);
  }

  const payload=decodePayload();
  if(payload){
    chrome.storage.local.set({lastPayload:payload});
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      const ready=document.querySelector('input,textarea,[role="textbox"],[role="combobox"]');
      if(ready || tries>20){clearInterval(timer);autofill(payload);}
    },500);
  }
})();