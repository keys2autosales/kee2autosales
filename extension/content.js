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
    return p && VIN_RE.test(vin) && Number(p.price)>0;
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
      `🚙 ${p.year||''} ${p.make||''} ${p.model||''}`.trim(),
      '',`Price: $${Number(p.price).toLocaleString()}`,
      p.mileage?`Mileage: ${Number(p.mileage).toLocaleString()}`:'',
      p.stock?`Stock #: ${p.stock}`:'',
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
    Object.assign(n.style,{position:'fixed',right:'18px',bottom:'18px',zIndex:2147483647,background:ok?'#0f172a':'#991b1b',color:'#fff',padding:'12px 16px',borderRadius:'10px',font:'600 13px system-ui',boxShadow:'0 12px 30px rgba(0,0,0,.25)',maxWidth:'420px'});
    document.body.appendChild(n);setTimeout(()=>n.remove(),10000);
  }

  function triggerText(label){
    const t=selectTrigger(label);
    return t?String(t.textContent||'').trim():'';
  }

  async function autofill(p){
    if(!validPayload(p)) return note('Keys2AutoSales stopped: this vehicle is missing a valid VIN or dealer price.',false);
    p.vin=String(p.vin).toUpperCase().replace(/[^A-Z0-9]/g,'');
    note(`Keys2AutoSales: sending VIN ${p.vin} to Facebook…`);
    const results={};

    const vinInput=await waitFor(()=>exactInput(['VIN']),7000);
    results.vin=setValue(vinInput,p.vin);
    if(!results.vin) return note('Keys2AutoSales could not find Facebook’s VIN field.',false);

    // VIN is the source of truth. Give Facebook time to decode the vehicle before touching anything else.
    await sleep(2600);

    // Only set Vehicle Type if Facebook has not already selected one.
    const vehicleTypeText=triggerText('Vehicle type');
    if(!vehicleTypeText || /^vehicle type$/i.test(vehicleTypeText)){
      results.vehicleType=await choose('Vehicle type',p.vehicleType||'Car/Truck');
      await sleep(1400);
    }else{
      results.vehicleType=true;
    }

    // IMPORTANT: Never overwrite Year / Make / Model. Facebook owns those fields after VIN decode.
    // We only fill fields that are not reliably decoded from VIN.
    results.mileage=setValue(exactInput(['Mileage','Odometer']),p.mileage);
    results.price=setValue(exactInput(['Price']),p.price);

    if(p.color){
      const colorText=triggerText('Exterior color');
      if(!colorText || /^exterior color$/i.test(colorText)) results.color=await choose('Exterior color',p.color);
    }

    results.description=setValue(exactInput(['Description']),p.description||description(p));

    const decoded={year:triggerText('Year'),make:triggerText('Make'),model:triggerText('Model')};
    chrome.storage.local.set({lastPayload:p,lastFillAt:new Date().toISOString(),lastResults:results,lastDecodedVehicle:decoded});

    const expected=`${p.year||''} ${p.make||''} ${p.model||''}`.trim();
    const actual=`${decoded.year||''} ${decoded.make||''} ${decoded.model||''}`.trim();
    if(actual && expected && !norm(actual).includes(norm(p.make))){
      note(`VIN was entered, but Facebook decoded a different vehicle (${actual}). Do not publish; verify the VIN/source record.`,false);
      return;
    }

    const count=Object.values(results).filter(Boolean).length;
    note(`Keys2AutoSales filled ${count} non-VIN fields. Facebook controls Year/Make/Model from the VIN. Review and publish manually.`,true);
  }

  const payload=decodePayload();
  if(payload){
    chrome.storage.local.set({lastPayload:payload});
    waitFor(()=>exactInput(['VIN']),10000).then(()=>autofill(payload));
  }
})();