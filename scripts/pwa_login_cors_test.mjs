import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('backend/supabase/functions/intmed-login/index.ts','utf8');
let handler,downstream=0;const logs=[];
vm.runInNewContext(source,{Deno:{serve:fn=>handler=fn,env:{get:()=>undefined}},URL,Set,Response,TextEncoder,Uint8Array,console:{warn:line=>logs.push(line)},fetch:()=>{downstream++;throw Error('Empty credential probe must not touch Auth or database');}});
const gateway=(await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('backend/cloudflare/intmed-api-proxy.js','utf8')).toString('base64'))).default;
const known=['https://drgerami-md.ir','https://www.drgerami-md.ir','https://4mirgr.github.io','https://gerami-website.pages.dev'];
for(const origin of known){
 const headers={origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'apikey,content-type'};
 const preflight=await handler(new Request('https://project.test/functions/v1/intmed-login',{method:'OPTIONS',headers}));
 assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin,'login preflight must echo the exact owned installation origin');
 const proxy=await gateway.fetch(new Request('https://api.drgerami-md.ir/functions/v1/intmed-login',{method:'OPTIONS',headers}));
 assert.equal(proxy.status,204);assert.equal(proxy.headers.get('Access-Control-Allow-Origin'),origin,'gateway must agree with login CORS');
 const empty=await handler(new Request('https://project.test/functions/v1/intmed-login',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:'{}'}));
 assert.equal(empty.status,401,'an owned PWA reaches credential validation, not origin denial');
 assert.equal(empty.headers.get('Access-Control-Allow-Origin'),origin);
 assert.equal(empty.headers.get('Cache-Control'),'no-store');
}
for(const origin of ['https://evil.example','https://4mirgr.github.io.evil.example','https://preview.gerami-website.pages.dev','null']){
 const before=logs.length;
 const response=await handler(new Request('https://project.test/functions/v1/intmed-login',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:'{"username":"private-user","password":"never-log-this"}'}));
 assert.equal(response.status,403);assert.notEqual(response.headers.get('Access-Control-Allow-Origin'),origin);
 assert.equal((await gateway.fetch(new Request('https://api.drgerami-md.ir/functions/v1/intmed-login',{method:'OPTIONS',headers:{origin}}))).status,403);
 assert.ok(logs.length>before,'origin rejection has a safe support event');
 assert.ok(!logs.at(-1).includes('private-user')&&!logs.at(-1).includes('never-log-this'));
}
assert.equal(downstream,0);
// Existing privileged functions still validate the canonical site origin.
// The gateway may translate only the two verified owned aliases, preserving
// the caller's JWT and browser-facing CORS response.
const originalFetch=globalThis.fetch;
try{
 let forwarded;
 globalThis.fetch=async(url,options)=>{
  forwarded={url:String(url),headers:options.headers};
  return Response.json({ok:true},{status:options.headers.get('origin')==='https://drgerami-md.ir'?200:403});
 };
 for(const origin of ['https://4mirgr.github.io','https://gerami-website.pages.dev']){
  const response=await gateway.fetch(new Request('https://api.drgerami-md.ir/functions/v1/intmed-content-review',{method:'POST',headers:{origin,apikey:'synthetic-public',Authorization:'Bearer synthetic-user'},body:'{}'}));
  assert.equal(response.status,200,'a trusted alias works with existing origin-gated functions');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.equal(forwarded.headers.get('Authorization'),'Bearer synthetic-user');
  assert.equal(forwarded.headers.get('apikey'),'synthetic-public');
 }
}finally{globalThis.fetch=originalFetch;}
console.log('PWA login CORS passed: four exact owned origins, readable empty-credential rejection, malicious/opaque origins blocked, no Auth/DB calls or credentials in support logs.');
