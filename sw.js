const CACHE_NAME = 'rqc-cache-v1';
const FICHIERS = ['./index.html','./manifest.json','./pwa_icons/icon-192.png','./pwa_icons/icon-512.png'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(FICHIERS))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ns => Promise.all(ns.map(n => n!==CACHE_NAME ? caches.delete(n) : null)))); self.clients.claim(); });
self.addEventListener('fetch', e => {
    const u = e.request.url;
    if (u.includes('supabase.co')||u.includes('nominatim')||u.includes('openfoodfacts')||u.includes('goatcounter')) { e.respondWith(fetch(e.request)); return; }
    e.respondWith(caches.match(e.request).then(r => {
        if (r) { fetch(e.request).then(nr => { if(nr&&nr.status===200) caches.open(CACHE_NAME).then(c=>c.put(e.request,nr)); }).catch(()=>{}); return r; }
        return fetch(e.request).then(nr => { if(nr&&nr.status===200){const cl=nr.clone();caches.open(CACHE_NAME).then(c=>c.put(e.request,cl));} return nr; }).catch(()=>{
            if(e.request.destination==='document') return new Response('<html><body style="text-align:center;padding:50px;font-family:Arial"><h1>rQC</h1><p>Hors connexion</p></body></html>',{headers:{'Content-Type':'text/html;charset=utf-8'}});
        });
    }));
});
