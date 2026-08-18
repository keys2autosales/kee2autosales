(() => {
  const PREFIX='#k2=';
  const VIN_RE=/^[A-HJ-NPR-Z0-9]{17}$/;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const norm=s=>String(s||'').toLowerCase().replace(/\s+/g,' ').trim();

  function decodePayload(){
    if(!location.hash.startsWith(PREFIX)) return null;
    try{
      const raw=location.hash.slice(PREFIX.length);
      const padded=raw.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-raw.length%4)%4);
      return JSON.parse(decodeURIComponent(escape(atob(padded))));
    }catch(err){console.warn('Keys2AutoSales: payload decode failed',err);return null;}
  }

  function validPayload(p){
    const vin=String(p?.vin||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
    return p && VIN_RE.test(vin) && p.year && p.make && p.model && Number(p.price)>0;
  }

  function setValue(el,value){
    if(!el || value===undefined || value===null || value==='') return false;
    el.focus();
    const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
    setter?setter.call(el,String(value)):(el.value=String(value));
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
    el.blur();
    return true;
  }

  function exactInput(names){
    for(const name of names){
      const wanted=norm(name);
      for(const el of document.querySelectorAll('input,textarea')){
        const aria=norm(el.getAttribute('aria-label'));
        const ph=norm(el.getAttribute('placeholder'));
        if(aria===wanted || ph===wanted) return el;
      }
      for(const label of document.querySelectorAll('label')){
        if(norm(label.textContent)!==wanted) continue;
        const id=label.getAttribute('for');
        if(id){const el=document.getElementById(id);if(el?.matches('input,textarea')) return el;}
        const el=label.querySelector('input,textarea');
        if(el) return el;
      }
    }
    return null;
  }

  function selectTrigger(label){
    const wanted=norm(label);
    const triggers=[...document.querySelectorAll('[role="combobox"],[aria-haspopup="listbox"]')];
    for(const t of triggers){
      const aria=norm(t.getAttribute('aria-label'));
      if(aria===wanted || aria.startsWith(wanted+' ')) return t;
    }
    for(const t of triggers){
      let p=t;
      for(let i=0;i<3&&p;i++,p=p.parentElement){
        const text=norm(p.textContent);
        if(text && text.length<120 && (text===wanted || text.startsWith(wanted+' '))) return t;
      }
    }
    return null;
  }

  async function choose(label,value){
    if(!value) return false;
    const trigger=selectTrigger(label);
    if(!trigger) return false;
    trigger.click();
    await sleep(650);
    const opts=[...document.querySelectorAll('[role="option"],[role="menuitem"],[role="menuitemradio"]')];
    const v=norm(value);
    const target=opts.find(o=>norm(o.textContent)===v)||opts.find(o=>norm(o.textContent).startsWith(v));
    if(!target){document.body.click();return false;}
    target.click();
    await sleep(450);
    return true;
  }

  async function waitFor(fn,timeout=8000){
    const start=Date.now();
    while(Date.now()-start<timeout){const result=fn();if(result)return result;await sleep(250);}return null;
  }

  function description(p){
    return [
      `🚙 ${p.year} ${p.make} ${p.model}`,
      '',`Price: $${Number(p.price).toLocaleString()}`,
      `Mileage: ${Number(p.mileage||0).toLocaleString()}`,
      `Stock #: ${p.stock||'—'}`,
      `VIN: ${p.vin}`,
      p.color?`Color: ${p.color}`:'',
      '', 'Financing options available • Trade-ins welcome • First-time buyers welcome',
      '', p.bookingLink?`Schedule a test drive: ${p.bookingLink}`:'',
      p.applicationLink?`Credit application: ${p.applicationLink}`:''
    ].filter(Boolean).join('\n');
  }

  function note(text,ok=true){
    document.querySelector('.k2-fill-note')?.remove();
    const n=document.createElement('div');n.className='k2-fill-note';n.textContent=text;
    Object.assign(n.style,{position:'fixed',right:'18px',bottom:'18px',zIndex:2147483647,background:ok?'#0f172a':'#991b1b',color:'#fff',padding:'12px 16px',borderRadius:'10px',font:'600 13px system-ui',boxShadow:'0 12px 30px rgba(0,0,0,.25)',maxWidth:'380px'});
    document.body.appendChild(n);setTimeout(()=>n.remove(),9000);
  }

  async function autofill(p){
    if(!validPayload(p)) return note('Keys2AutoSales stopped: the vehicle payload is incomplete or has an invalid VIN.',false);
    p.vin=String(p.vin).toUpperCase().replace(/[^A-Z0-9]/g,'');
    note(`Keys2AutoSales: loading ${p.year} ${p.make} ${p.model}…`);
    const results={};

    const vinInput=await waitFor(()=>exactInput(['VIN']),7000);
    results.vin=setValue(vinInput,p.vin);
    if(!results.vin) return note('Keys2AutoSales could not find Facebook’s VIN field.',false);
    await sleep(1800);

    results.vehicleType=await choose('Vehicle type',p.vehicleType||'Car/Truck');
    await sleep(1400);

    // Facebook renders Year/Make/Model as dropdowns. Never treat them as generic text inputs.
    results.year=await choose('Year',String(p.year));
    await sleep(350);
    results.make=await choose('Make',p.make);
    await sleep(350);
    results.model=await choose('Model',p.model);

    // Only exact labeled text inputs may receive free-form values.
    results.mileage=setValue(exactInput(['Mileage','Odometer']),p.mileage);
    results.price=setValue(exactInput(['Price']),p.price);
    results.description=setValue(exactInput(['Description']),p.description||description(p));

    chrome.storage.local.set({lastPayload:p,lastFillAt:new Date().toISOString(),lastResults:results});
    const count=Object.values(results).filter(Boolean).length;
    note(`Keys2AutoSales filled ${count} fields. Review every value, add photos, then publish manually.`,count>=2);
  }

  const payload=decodePayload();
  if(payload){
    chrome.storage.local.set({lastPayload:payload});
    waitFor(()=>exactInput(['VIN']),10000).then(()=>autofill(payload));
  }
})();