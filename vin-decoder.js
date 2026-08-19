// Keys2AutoSales VIN decoder UI
// Enriches blank vehicle fields only. Does not interact with Facebook VIN decoding.
(function(){
  function byName(name){return document.querySelector(`#modalForm [name="${name}"]`);}
  function setIfBlank(name,value){
    const el=byName(name); if(!el||value===undefined||value===null||value==='') return false;
    if(String(el.value||'').trim()!=='') return false;
    el.value=String(value);
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  }

  function setSelectIfBlank(name,value){
    const el=byName(name); if(!el||!value||String(el.value||'').trim()!=='') return false;
    const target=String(value).toLowerCase();
    const option=[...el.options].find(o=>String(o.value||o.textContent).toLowerCase()===target);
    if(!option) return false;
    el.value=option.value;
    el.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  }

  async function decode(){
    const vinInput=byName('vin');
    if(!vinInput) return;
    const vin=String(vinInput.value||'').toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g,'');
    if(vin.length!==17){alert('Enter a valid 17-character VIN first.');return;}

    const btn=document.querySelector('.k2-decode-vin-btn');
    const original=btn?.textContent||'Decode VIN';
    if(btn){btn.disabled=true;btn.textContent='Decoding…';}
    try{
      const res=await fetch(`/api/vin-decode?vin=${encodeURIComponent(vin)}`);
      const data=await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(data.error||`VIN decode failed (${res.status})`);

      const changed=[];
      if(setIfBlank('year',data.year)) changed.push('Year');
      if(setIfBlank('make',data.make)) changed.push('Make');
      if(setIfBlank('model',data.model||data.baseModel)) changed.push('Model / Trim');
      if(setSelectIfBlank('bodyStyle',data.bodyStyle)) changed.push('Body Style');
      if(setSelectIfBlank('fuelType',data.fuelType)) changed.push('Fuel Type');
      if(setSelectIfBlank('transmission',data.transmission)) changed.push('Transmission');

      const note=document.querySelector('.k2-vin-decode-note');
      if(note){
        const extras=[data.engine,data.driveType].filter(Boolean).join(' • ');
        note.textContent=changed.length
          ? `Decoded: ${changed.join(', ')}${extras?` • ${extras}`:''}`
          : `VIN decoded. Existing fields were preserved${extras?` • ${extras}`:''}.`;
      }
    }catch(err){
      console.error(err);
      alert(`VIN decode failed: ${err.message}`);
    }finally{
      if(btn){btn.disabled=false;btn.textContent=original;}
    }
  }

  function enhanceModal(){
    const form=document.getElementById('modalForm');
    const vin=byName('vin');
    if(!form||!vin||form.querySelector('.k2-decode-vin-wrap')) return;

    const wrap=document.createElement('div');
    wrap.className='k2-decode-vin-wrap';
    wrap.style.cssText='grid-column:1/-1;display:flex;align-items:center;gap:10px;margin-top:-4px;margin-bottom:4px;';
    const btn=document.createElement('button');
    btn.type='button';btn.className='btn light small k2-decode-vin-btn';btn.textContent='🔎 Decode VIN';
    btn.addEventListener('click',decode);
    const note=document.createElement('small');
    note.className='muted k2-vin-decode-note';
    note.textContent='Fills blank Year, Make, Model, Body Style, Fuel Type, and Transmission only.';
    wrap.append(btn,note);

    const vinLabel=vin.closest('label')||vin.parentElement;
    vinLabel?.insertAdjacentElement('afterend',wrap);
  }

  const observer=new MutationObserver(()=>requestAnimationFrame(enhanceModal));
  observer.observe(document.documentElement,{subtree:true,childList:true});
  window.addEventListener('load',enhanceModal);
  setTimeout(enhanceModal,500);
})();
