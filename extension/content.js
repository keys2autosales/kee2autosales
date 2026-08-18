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

  function nativeSet(el,value){
    const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
    setter?setter.call(el,String(value)):(el.value=String(value));
  }

  function fire(el){
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
  }

  function setValue(el,value,{clearFirst=false}={}){
    if(!el || value===undefined || value===null || value==='') return false;
    el.focus();
    if(clearFirst){nativeSet(el,'');fire(el);}
    nativeSet(el,String(value));
    fire(el);
    return true;
  }

  function clearValue(el){
    if(!el) return false;
    el.focus();nativeSet(el,'');fire(el);el.blur();return true;
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

  function fieldInput(label){
    const wanted=norm(label);
    const candidates=[...document.querySelectorAll('input')];
    for(const el of candidates){
      const aria=norm(el.getAttribute('aria-label'));
      const ph=norm(el.getAttribute('placeholder'));
      if(aria===wanted || ph===wanted) return el;
    }
    for(const el of candidates){
      let p=el;
      for(let i=0;i<4&&p;i++,p=p.parentElement){
        const text=norm(p.textContent);
        if(text && text.length<140 && (text===wanted || text.startsWith(wanted+' '))) return el;
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
      for(let i=0;i<5&&p;i++,p=p.parentElement){
        const text=norm(p.textContent);
        if(text && text.length<160 && (text===wanted || text.startsWith(wanted+' '))) return t;
      }
    }
    return null;
  }

  function selectedText(label){
    const input=fieldInput(label);
    const inputValue=String(input?.value||'').trim();
    if(inputValue) return inputValue;
    const t=selectTrigger(label);
    if(!t) return '';
    const aria=String(t.getAttribute('aria-valuetext')||t.getAttribute('aria-label')||'').trim();
    const text=String(t.textContent||'').trim();
    return `${aria} ${text}`.trim();
  }

  async function waitFor(fn,timeout=9000){
    const start=Date.now();
    while(Date.now()-start<timeout){const result=fn();if(result)return result;await sleep(250);}return null;
  }

  function visibleOptions(){
    return [...document.querySelectorAll('[role="option"],[role="menuitem"],[role="menuitemradio"]')]
      .filter(o=>o.offsetParent!==null);
  }

  function findOption(value){
    const wanted=norm(value);
    const opts=visibleOptions();
    return opts.find(o=>norm(o.textContent)===wanted)
      ||opts.find(o=>norm(o.textContent).startsWith(wanted+' '))
      ||opts.find(o=>norm(o.textContent).includes(wanted));
  }

  async function chooseExact(label,value){
    if(value===undefined || value===null || value==='') return false;
    const trigger=await waitFor(()=>selectTrigger(label),6000);
    if(!trigger) return false;
    trigger.scrollIntoView({block:'center'});
    trigger.click();
    await sleep(700);
    const target=findOption(value);
    if(!target){document.body.click();return false;}
    target.click();
    await sleep(800);
    return norm(selectedText(label)).includes(norm(value));
  }

  async function chooseModel(value){
    if(!value) return false;
    const wanted=norm(value);

    // Facebook sometimes renders Model as a searchable input instead of a normal dropdown.
    const input=await waitFor(()=>fieldInput('Model'),3500);
    if(input){
      input.scrollIntoView({block:'center'});
      setValue(input,value,{clearFirst:true});
      await sleep(900);
      let target=findOption(value);
      if(target){
        target.click();
        await sleep(850);
      }else{
        input.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'Enter',code:'Enter'}));
        input.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,key:'Enter',code:'Enter'}));
        await sleep(850);
      }
      if(norm(String(input.value||''))===wanted || norm(selectedText('Model')).includes(wanted)) return true;
    }

    // Fallback for accounts where Model is a normal Facebook select.
    return chooseExact('Model',value);
  }

  function description(p){
    return [
      `🚙 ${p.year} ${p.make} ${p.model}`,
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
    Object.assign(n.style,{position:'fixed',right:'18px',bottom:'18px',zIndex:2147483647,background:ok?'#0f172a':'#991b1b',color:'#fff',padding:'12px 16px',borderRadius:'10px',font:'600 13px system-ui',boxShadow:'0 12px 30px rgba(0,0,0,.25)',maxWidth:'500px'});
    document.body.appendChild(n);setTimeout(()=>n.remove(),12000);
  }

  async function autofill(p){
    if(!validPayload(p)) return note('Keys2AutoSales stopped: vehicle is missing VIN, year, make, model, or price.',false);
    p.vin=String(p.vin).toUpperCase().replace(/[^A-Z0-9]/g,'');
    const results={};

    note(`Keys2AutoSales v0.1.5: loading ${p.year} ${p.make} ${p.model}…`);

    // Keep Facebook's optional VIN decoder out of the workflow because it produced incorrect identities in testing.
    const vinInput=await waitFor(()=>exactInput(['VIN']),7000);
    if(vinInput && vinInput.value){clearValue(vinInput);await sleep(900);}
    results.vinSkipped=true;

    results.vehicleType=await chooseExact('Vehicle type',p.vehicleType||'Car/Truck');
    await sleep(650);
    results.year=await chooseExact('Year',String(p.year));
    await sleep(650);
    results.make=await chooseExact('Make',p.make);
    await sleep(850);
    results.model=await chooseModel(p.model);
    await sleep(850);

    const checks={
      year:norm(selectedText('Year')).includes(norm(String(p.year))),
      make:norm(selectedText('Make')).includes(norm(p.make)),
      model:norm(selectedText('Model')).includes(norm(p.model)),
      vinBlank:!String(exactInput(['VIN'])?.value||'').trim()
    };

    if(!checks.year || !checks.make || !checks.model || !checks.vinBlank){
      chrome.storage.local.set({lastPayload:p,lastFillAt:new Date().toISOString(),lastResults:results,lastIdentityChecks:checks});
      return note(`STOP: identity check failed. VIN blank ${checks.vinBlank?'✓':'✗'} Year ${checks.year?'✓':'✗'} Make ${checks.make?'✓':'✗'} Model ${checks.model?'✓':'✗'}. Do not publish.`,false);
    }

    results.mileage=setValue(exactInput(['Mileage','Odometer']),p.mileage,{clearFirst:true});
    results.price=setValue(exactInput(['Price']),p.price,{clearFirst:true});
    if(p.color) results.color=await chooseExact('Exterior color',p.color);
    results.description=setValue(exactInput(['Description']),p.description||description(p),{clearFirst:true});

    chrome.storage.local.set({lastPayload:p,lastFillAt:new Date().toISOString(),lastResults:results,lastIdentityChecks:checks});
    note(`Keys2AutoSales verified ${p.year} ${p.make} ${p.model}. Review photos/details, then publish manually.`,true);
  }

  const payload=decodePayload();
  if(payload){
    chrome.storage.local.set({lastPayload:payload});
    waitFor(()=>selectTrigger('Vehicle type')||exactInput(['VIN']),10000).then(()=>autofill(payload));
  }
})();