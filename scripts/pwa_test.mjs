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
  caches:{match:async()=>{cacheReads++;return cached.clone();}},fetch:async(_request,options)=>{signal=options.signal;return response||new Promise(()=>{});}});
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
