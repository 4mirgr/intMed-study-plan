import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const manifest=JSON.parse(fs.readFileSync('docs/manifest.webmanifest','utf8')),index=fs.readFileSync('docs/index.html','utf8'),sw=fs.readFileSync('docs/sw.js','utf8');
assert.equal(manifest.lang,'fa');assert.equal(manifest.dir,'rtl');assert.equal(manifest.display,'standalone');assert.ok(manifest.start_url.startsWith('./'));
for(const icon of manifest.icons){const path='docs/'+icon.src;assert.ok(fs.existsSync(path),path);const bytes=fs.readFileSync(path);assert.equal(bytes.toString('hex',1,4),'504e47');const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20),expected=Number(icon.sizes.split('x')[0]);assert.equal(width,expected);assert.equal(height,expected);}
assert.match(index,/rel="manifest" href="manifest\.webmanifest"/);assert.match(index,/js\/intmed-pwa\.js/);assert.ok(fs.existsSync('docs/offline.html'));
assert.match(sw,/request\.method!==['"]GET['"]/);assert.match(sw,/url\.origin!==self\.location\.origin/);for(const marker of ['/auth/','/rest/','/functions/','/storage/','/messages/','/profile/','/entitlement/','intmed-content-inbox'])assert.ok(sw.includes(marker),marker);
assert.match(sw,/function networkFirst/);assert.match(sw,/content\/topics/);assert.ok(!sw.includes('ignoreSearch:true'),'versioned topic URLs must keep distinct cache keys');
const precache=sw.match(/const PRECACHE=\[([^;]+)\]/s)?.[1]||'';assert.ok(!/supabase|api\.drgerami|config\.js|message|profile|entitlement/i.test(precache));
console.log('PWA contract passed: Persian install manifest, valid icons, explicit offline page, public-only same-origin caching and private/API exclusions.');

// Network-first means finite waiting, including a response whose headers arrive
// while its JSON stream never finishes. Only a cached public response may win.
for(const stalledBody of [false,true]){
 const handlers={},cached=new Response('{"categories":[{"id":"cached"}]}',{headers:{'Content-Type':'application/json'}});let signal,cacheReads=0;
 const response=stalledBody?new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{"categories":'));}})):null;
 if(response)Object.defineProperty(response,'type',{value:'basic'});
 vm.runInNewContext(sw,{self:{location:{origin:'https://example.test'},addEventListener:(name,fn)=>handlers[name]=fn},URL,Response,AbortController,
  setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,25)),clearTimeout,
  caches:{open:async()=>({match:async()=>{cacheReads++;return cached.clone();}})},fetch:async(_request,options)=>{signal=options.signal;return response||new Promise(()=>{});}});
 let result;handlers.fetch({request:{url:'https://example.test/content/taxonomy.json',method:'GET',mode:'cors'},respondWith:value=>{result=value;}});
 const recovered=await Promise.race([result,new Promise(resolve=>setTimeout(()=>resolve(null),250))]);
 assert.ok(recovered,stalledBody?'stalled response body must fall back to cache':'stalled headers must fall back to cache');
 assert.match(await recovered.text(),/cached/);assert.equal(signal?.aborted,true,'the stale public request is cancelled');assert.equal(cacheReads,1);
 result=undefined;handlers.fetch({request:{url:'https://example.test/rest/v1/study_state',method:'GET',mode:'cors'},respondWith:value=>{result=value;}});
 assert.equal(result,undefined,'private requests must bypass the service worker entirely');assert.equal(cacheReads,1);
}
console.log('PWA stalled-network recovery passed: public cache fallback covers headers/body deadlines and excludes private requests.');

{
 const handlers={},fresh=new Response('{"topicId":"fresh"}');Object.defineProperty(fresh,'type',{value:'basic'});
 vm.runInNewContext(sw,{self:{location:{origin:'https://example.test'},addEventListener:(name,fn)=>handlers[name]=fn},URL,Response,AbortController,setTimeout,clearTimeout,
  caches:{open:async()=>({put:async()=>{throw new Error('QuotaExceededError');}}),match:async()=>new Response('{"topicId":"stale"}')},fetch:async()=>fresh});
 let result;handlers.fetch({request:{url:'https://example.test/content/topics/test.json?v=123',method:'GET',mode:'cors'},respondWith:value=>{result=value;}});
 assert.equal(await (await result).text(),'{"topicId":"fresh"}','cache quota must not discard a successfully downloaded public response');
}

// CacheStorage.match searches caches in creation order. The install-time shell
// must not hide a newer manifest/taxonomy saved in the public runtime cache.
{
 const handlers={},stores=new Map();let current='installed',online=true;
 const basic=value=>{const response=new Response(value);Object.defineProperty(response,'type',{value:'basic'});return response;};
 const key=request=>new URL(typeof request==='string'?request:request.url,'https://example.test/').pathname;
 const caches={
  open:async name=>{if(!stores.has(name))stores.set(name,new Map());const cache=stores.get(name);return {
   addAll:async paths=>{for(const path of paths)cache.set(key(path),basic(current));},
   put:async(request,response)=>{cache.set(key(request),response);},
   match:async request=>cache.get(key(request))?.clone()
  };},
  match:async request=>{for(const cache of stores.values())if(cache.has(key(request)))return cache.get(key(request)).clone();}
 };
 vm.runInNewContext(sw,{self:{location:{origin:'https://example.test'},addEventListener:(name,fn)=>handlers[name]=fn},URL,Response,AbortController,setTimeout,clearTimeout,caches,fetch:async()=>{if(!online)throw Error('offline');return basic(current);}});
 let installing;handlers.install({waitUntil:value=>{installing=value;}});await installing;
 async function read(path){let result;handlers.fetch({request:{url:'https://example.test'+path,method:'GET',mode:'cors'},respondWith:value=>{result=value;}});return (await result).text();}
 const actual={};
 for(const path of ['/content/manifest.json','/content/taxonomy.json']){
  online=true;current='updated';assert.equal(await read(path),'updated');online=false;actual[path]=await read(path);
 }
 online=true;
 for(const path of ['/content/search.json','/content/library.json','/mounted/content/manifest.json','/mounted/content/taxonomy.json']){
  current='old';await read(path);await new Promise(resolve=>setTimeout(resolve,0));current='new';actual[path]=await read(path);
 }
 assert.deepEqual(actual,{
  '/content/manifest.json':'updated','/content/taxonomy.json':'updated',
  '/content/search.json':'new','/content/library.json':'new',
  '/mounted/content/manifest.json':'new','/mounted/content/taxonomy.json':'new'
 },'live indexes must prefer current online responses and the newest cached offline manifest');
}
console.log('PWA index freshness passed: actual generated/mounted paths use network-first and newer runtime cache wins offline.');

// A completed CDN/server failure is still a transient network failure for
// public lessons. Never replace it with a different version or hide a 404.
{
 const origin='https://example.test',oldHash='a'.repeat(64),newHash='b'.repeat(64);
 const topic=origin+'/content/topics/heme-pbs.json?v='+oldHash;
 const stored=new Map([[topic,new Response('{"topicId":"cached-exact-version"}')]]);
 let status=503;
 const handlers={},basic=(body,status)=>{const response=new Response(body,{status});Object.defineProperty(response,'type',{value:'basic'});return response;};
 const match=async request=>stored.get(request.url)?.clone();
 vm.runInNewContext(sw,{self:{location:{origin},addEventListener:(name,fn)=>handlers[name]=fn},URL,Response,AbortController,setTimeout,clearTimeout,
  caches:{open:async()=>({match,put:async()=>{throw Error('An error response must not be cached');}}),match},
  fetch:async()=>basic('{"error":"upstream unavailable"}',status)});
 async function read(url){let result;handlers.fetch({request:{url,method:'GET',mode:'cors'},respondWith:value=>{result=value;}});return result;}
 for(const code of [503,522]){
  status=code;const response=await read(topic);
  assert.equal(response.status,200,'a transient server error must recover the exact cached public lesson');
  assert.equal((await response.json()).topicId,'cached-exact-version');
 }
 status=503;
 const uncached=await read(origin+'/content/topics/heme-pbs.json?v='+newHash);
 assert.equal(uncached.status,503,'a new manifest hash must never receive another cached version');
 assert.equal((await uncached.json()).error,'upstream unavailable');
 status=404;assert.equal((await read(topic)).status,404,'a missing/withdrawn topic must not be hidden by stale cache');
}
console.log('PWA server-error recovery passed: 5xx uses exact cached public content, fresh hashes and definitive 404 remain visible.');
