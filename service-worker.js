
const CACHE='sales-command-v2';
const ASSETS=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('fetch',e=>{ if(new URL(e.request.url).pathname.startsWith('/api/')) return; e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))); });
