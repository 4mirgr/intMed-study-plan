import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
let handler,saved=[];const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-secret',SUPABASE_ANON_KEY:'anon'};
const fetchMock=async(url,options={})=>{
 if(url==='https://drgerami-md.ir/content/taxonomy.json')return Response.json({categories:[{label:'هماتولوژی',topics:[{id:'heme-iron-anemia',label:'آنمی فقر آهن'}]}]});
 if(url.includes('/rest/v1/intmed_content_ingest?'))return Response.json([{id:'11111111-1111-4111-8111-111111111111',kind:'text',mime_type:'text/plain',content_text:'نمونه متن پزشکی',caption:'',suggested_topic_id:'heme-iron-anemia',byte_size:30}]);
 if(url.includes('/rest/v1/intmed_content_drafts?ingest_id='))return Response.json([]);
 if(url.includes('/rest/v1/intmed_content_drafts?on_conflict=')){saved.push(JSON.parse(options.body));return new Response(null,{status:204});}
 throw Error('Unexpected '+url);
};
const context=vm.createContext({Deno:{serve:fn=>handler=fn,env:{get:key=>env[key]}},fetch:fetchMock,Response,Request,JSON,Object,String,Set,Date,RegExp,Number,Array,TextEncoder,Uint8Array,crypto,btoa,Error,globalThis:null});context.globalThis=context;
vm.runInContext(fs.readFileSync('backend/supabase/functions/intmed-content-worker/index.ts','utf8'),context);
const response=await handler(new Request('https://project.supabase.co/functions/v1/intmed-content-worker',{method:'POST',headers:{authorization:'Bearer service-secret','content-type':'application/json'},body:'{}'}));
assert.equal(response.status,200);assert.deepEqual(await response.json(),{processed:0,waitingProvider:1,failed:0});assert.equal(saved.length,1);assert.equal(saved[0].status,'waiting_provider');assert.equal(saved[0].error_code,'provider_not_configured');
const sql=fs.readFileSync('backend/supabase/telegram_ingest.sql','utf8'),bot=fs.readFileSync('backend/supabase/functions/intmed-telegram-bot/index.ts','utf8'),config=fs.readFileSync('backend/supabase/config.toml','utf8');
assert.match(sql,/intmed_content_drafts/);assert.match(sql,/enable row level security/);assert.match(bot,/intmed-content-worker/);assert.match(config,/\[functions\.intmed-content-worker\][\s\S]*verify_jwt = true/);assert.ok(!fs.readFileSync('backend/supabase/functions/intmed-content-worker/index.ts','utf8').includes('auto-publish'));
console.log('Content worker passed: service-only queue, provider-safe waiting state, canonical taxonomy lookup, structured review draft and no repository publication.');
