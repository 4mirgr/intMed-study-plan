/* IntMed public-shell service worker. Never cache authenticated or private responses. */
'use strict';
const VERSION='intmed-pwa-v1';
const SHELL=VERSION+'-shell',PUBLIC=VERSION+'-public';
const PRECACHE=['./offline.html','./manifest.webmanifest','./assets/logo.png','./assets/pwa-192.png','./assets/pwa-512.png','./assets/pwa-maskable-512.png','./content/manifest.json','./content/taxonomy.json'];
const PUBLIC_PATHS=['/assets/','/js/','/content/'];
const PRIVATE_MARKERS=['/auth/','/rest/','/functions/','/storage/','/messages/','/profile/','/entitlement/','intmed-content-inbox'];

self.addEventListener('install',event=>event.waitUntil(caches.open(SHELL).then(cache=>cache.addAll(PRECACHE))));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([
  caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('intmed-pwa-')&&!key.startsWith(VERSION)).map(key=>caches.delete(key)))),
  self.clients.claim()
])));
self.addEventListener('message',event=>{if(event.data&&event.data.type==='SKIP_WAITING')self.skipWaiting();});

function privateRequest(url){return PRIVATE_MARKERS.some(marker=>url.pathname.includes(marker));}
function publicAsset(url){return PUBLIC_PATHS.some(prefix=>url.pathname.includes(prefix))&&!privateRequest(url)&&url.pathname!='/config.js';}
async function navigation(request){
  try{return await fetch(request);}
  catch{return (await caches.match('./offline.html'))||Response.error();}
}
async function staleWhileRevalidate(request){
  const cached=await caches.match(request,{ignoreSearch:true});
  const fresh=fetch(request).then(response=>{
    if(response.ok&&response.type==='basic'&&!response.headers.has('set-cookie'))caches.open(PUBLIC).then(cache=>cache.put(request,response.clone()));
    return response;
  }).catch(()=>null);
  return cached||(await fresh)||Response.error();
}
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||privateRequest(url))return;
  if(request.mode==='navigate'){event.respondWith(navigation(request));return;}
  if(publicAsset(url))event.respondWith(staleWhileRevalidate(request));
});
