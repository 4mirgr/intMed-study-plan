/* IntMed public-shell service worker. Never cache authenticated or private responses. */
'use strict';
const VERSION='intmed-pwa-v4-live-content';
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
function liveContent(url){return /\/content\/(manifest|taxonomy|search|library)\.json$/.test(url.pathname)||url.pathname.includes('/content/topics/');}
async function cachedPublicResponse(request){
  // Shell is created first and contains the install-time indexes. Prefer a
  // newer runtime response before falling back to that initial offline copy.
  const cache=await caches.open(PUBLIC);
  return (await cache.match(request))||(await caches.match(request));
}
async function navigation(request){
  try{return await fetch(request);}
  catch{return (await caches.match('./offline.html'))||Response.error();}
}
async function staleWhileRevalidate(request){
  const cached=await caches.match(request);
  const fresh=fetch(request).then(response=>{
    if(response.ok&&response.type==='basic'&&!response.headers.has('set-cookie'))caches.open(PUBLIC).then(cache=>cache.put(request,response.clone()));
    return response;
  }).catch(()=>null);
  return cached||(await fresh)||Response.error();
}
async function networkFirst(request){
  const controller=new AbortController();let timer;
  try{
    const expired=new Promise((resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('public content timeout'));},6000);});
    // Bound the whole body, not only the arrival of its HTTP headers. A cached
    // public lesson/index must remain usable when a mobile route is half-open.
    const received=await Promise.race([fetch(request,{cache:'no-cache',signal:controller.signal}).then(async response=>({response,body:await response.arrayBuffer()})),expired]);
    const original=received.response;
    const response=new Response(received.body,{status:original.status,statusText:original.statusText,headers:original.headers});
    if(original.ok&&original.type==='basic'&&!original.headers.has('set-cookie')){
      try{const cache=await caches.open(PUBLIC);await cache.put(request,response.clone());}catch{}
    }
    // A completed CDN/server error should not hide a usable offline lesson.
    // Cache matching keeps the full URL, including the manifest version hash.
    // Preserve definitive 4xx responses and a 5xx when no successful copy exists.
    if(original.status>=500){
      const cached=await cachedPublicResponse(request);
      if(cached&&cached.ok)return cached;
    }
    return response;
  }catch{
    return (await cachedPublicResponse(request))||Response.error();
  }finally{clearTimeout(timer);}
}
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||privateRequest(url))return;
  if(request.mode==='navigate'){event.respondWith(navigation(request));return;}
  if(liveContent(url)){event.respondWith(networkFirst(request));return;}
  if(publicAsset(url))event.respondWith(staleWhileRevalidate(request));
});
