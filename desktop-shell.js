// Desktop/mobile shell helpers
(function(){
  if(!document.querySelector('link[href="mockup-theme.css"]')){
    const link=document.createElement('link');
    link.rel='stylesheet';link.href='mockup-theme.css';document.head.appendChild(link);
  }
  function loadMockup(){
    if(document.querySelector('script[src="marketplace-mockup.js"]')) return;
    const s=document.createElement('script');s.src='marketplace-mockup.js';document.body.appendChild(s);
  }
  function syncActive(target){
    document.querySelectorAll('.side-nav').forEach(x=>x.classList.toggle('active',x.dataset.nav===target));
    document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.nav===target));
  }
  document.addEventListener('click',e=>{
    const nav=e.target.closest('[data-nav]');
    if(nav) syncActive(nav.dataset.nav);
  });
  window.addEventListener('load',()=>{
    const active=document.querySelector('.screen.active')?.id||'dashboard';
    syncActive(active);loadMockup();
  });
})();
