// Desktop/mobile shell helpers
(function(){
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
    syncActive(active);
  });
})();
