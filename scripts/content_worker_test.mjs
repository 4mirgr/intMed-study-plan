import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
let handler,saved=[],claimed=false,released=0;const ingestId='11111111-1111-4111-8111-111111111111',env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-secret',SUPABASE_ANON_KEY:'anon',INTMED_CONTENT_PROCESSING_ENABLED:'false'};
const fetchMock=async(url,options={})=>{
 if(url==='https://drgerami-md.ir/content/taxonomy.json')return Response.json({categories:[{label:'هماتولوژی',topics:[{id:'heme-iron-anemia',label:'آنمی فقر آهن'}]}]});
 if(url.includes('/rest/v1/rpc/claim_intmed_content_ingest')){if(claimed)return Response.json(null);claimed=true;return Response.json(ingestId);}
 if(url.includes('/rest/v1/rpc/release_intmed_content_lease')){released++;return new Response(null,{status:204});}
 if(url.includes('/rest/v1/intmed_content_ingest?')){if(options.method==='PATCH')return new Response(null,{status:204});return Response.json([{id:ingestId,kind:'text',mime_type:'text/plain',content_text:'نمونه متن پزشکی',caption:'',suggested_topic_id:'heme-iron-anemia',byte_size:30}]);}
 if(url.includes('/rest/v1/intmed_bot_topic_hints?'))return Response.json([]);
 if(url.includes('/rest/v1/intmed_content_drafts?on_conflict=')){saved.push(JSON.parse(options.body));return new Response(null,{status:204});}
 throw Error('Unexpected '+url);
};
const context=vm.createContext({Deno:{serve:fn=>handler=fn,env:{get:key=>env[key]}},fetch:fetchMock,Response,Request,JSON,Object,String,Set,Date,RegExp,Number,Array,TextEncoder,Uint8Array,crypto,btoa,Error,globalThis:null});context.globalThis=context;
vm.runInContext(fs.readFileSync('backend/supabase/functions/intmed-content-worker/index.ts','utf8'),context);
const manualResponse=await handler(new Request('https://project.supabase.co/functions/v1/intmed-content-worker',{method:'POST',headers:{authorization:'Bearer service-secret','content-type':'application/json'},body:'{}'}));
assert.equal(manualResponse.status,200);assert.deepEqual(await manualResponse.json(),{processed:0,reason:'manual_mode'});assert.equal(saved.length,0);assert.equal(released,0);
env.INTMED_CONTENT_PROCESSING_ENABLED='true';
const response=await handler(new Request('https://project.supabase.co/functions/v1/intmed-content-worker',{method:'POST',headers:{authorization:'Bearer service-secret','content-type':'application/json'},body:'{}'}));
assert.equal(response.status,200);assert.deepEqual(await response.json(),{processed:0,waitingProvider:1,failed:0});assert.equal(saved.length,1);assert.equal(saved[0].status,'waiting_provider');assert.equal(saved[0].error_code,'provider_not_configured');
assert.equal(released,1,'Worker lease was not released');
const sql=fs.readFileSync('backend/supabase/telegram_ingest.sql','utf8'),bot=fs.readFileSync('backend/supabase/functions/intmed-telegram-bot/index.ts','utf8'),config=fs.readFileSync('backend/supabase/config.toml','utf8');
assert.match(sql,/intmed_content_drafts/);assert.match(sql,/enable row level security/);assert.match(bot,/intmed-content-worker/);assert.match(config,/\[functions\.intmed-content-worker\][\s\S]*verify_jwt = true/);assert.ok(!fs.readFileSync('backend/supabase/functions/intmed-content-worker/index.ts','utf8').includes('auto-publish'));
assert.match(sql,/claim_intmed_content_ingest/);assert.match(sql,/skip locked/i);const worker=fs.readFileSync('backend/supabase/functions/intmed-content-worker/index.ts','utf8');assert.match(worker,/provider_rate_limited/);assert.match(worker,/status:'accepted'/);
assert.match(worker,/GEMINI_API_KEY/);assert.match(worker,/generativelanguage\.googleapis\.com/);assert.match(worker,/responseJsonSchema/);assert.match(worker,/flashcardDrafts/);assert.match(worker,/20971520/);
assert.match(worker,/documentExtraction/);assert.match(worker,/item\.kind==='pdf'\?12288/);assert.match(worker,/extracted=pages\.map/);assert.match(worker,/draft\.lessonDrafts=\[\]/);
assert.match(bot,/INTMED_CONTENT_PROCESSING_ENABLED/);console.log('Content worker passed: explicit maintenance mode, automatic production queue, provider-safe waiting state, canonical taxonomy lookup, structured review draft and no repository publication.');

// Exercise the deployed worker handler, not a standalone cache helper: duplicate
// PDFs must be reused before either an AI call or a native-extraction dispatch.
const duplicateId='22222222-2222-4222-8222-222222222222';
const parsedExtraction={pageCount:2,pages:[{page:1,text:'متن منبع',unreadable:false,method:'native'},{page:2,text:'',unreadable:false,method:'blank_page'}],quality:{actualPageCountVerified:true,countBasis:'pdf_parser',canReuseText:true,blankPages:[2]},figures:[{page:1,width:900,height:600}]};
async function duplicateRun({kind='pdf',sourceStatus='draft_ready',extraction=parsedExtraction,caption='',hint='',suggested='heme-iron-anemia'}={}){
 let runHandler,wasClaimed=false;const writes=[],calls=[];
 const candidate={status:sourceStatus,title:'عنوان قبلی',topic_id:'heme-iron-anemia',topic_confidence:.8,source_summary:'خلاصه',extracted_text:'متن منبع',reviewer_note:'خطای شناخته‌شده باید بررسی شود',draft_json:{documentExtraction:extraction,sourceEvidence:[{page:1,sourceId:duplicateId}],reviewFindings:[{severity:'blocking',status:'open',finding:'دوز باید بررسی شود'}],generation:{phase:'generated',generated:['lesson'],clinicalReview:'approved'}}};
 const requestFetch=async(url,options={})=>{
  calls.push({url,options});
  if(url.endsWith('/content/taxonomy.json'))return Response.json({categories:[{topics:[{id:'heme-iron-anemia',label:'آنمی'}]}]});
  if(url.includes('/rpc/claim_intmed_content_ingest')){if(wasClaimed)return Response.json(null);wasClaimed=true;return Response.json(ingestId);}
  if(url.includes('/rpc/release_intmed_content_lease'))return new Response(null,{status:204});
  if(url.includes('/intmed_content_ingest?sha256='))return Response.json([{id:duplicateId,caption:'',suggested_topic_id:'heme-iron-anemia'}]);
  if(url.includes('/intmed_content_ingest?'))return options.method==='PATCH'?new Response(null,{status:204}):Response.json([{id:ingestId,kind,sha256:'exact-sha',caption,suggested_topic_id:suggested,content_text:'متن',mime_type:kind==='pdf'?'application/pdf':'text/plain'}]);
  if(url.includes('/intmed_bot_topic_hints?'))return Response.json(url.includes(ingestId)&&hint?[{hint_text:hint}]:[]);
  if(url.includes('/intmed_content_drafts?on_conflict=')){writes.push(JSON.parse(options.body));return new Response(null,{status:204});}
  if(url.includes('/intmed_content_drafts?ingest_id=eq.'+duplicateId)){assert.match(url,/status=eq.draft_ready/);return Response.json([candidate]);}
  if(url.includes('/intmed_content_drafts?ingest_id=eq.'+ingestId))return Response.json([]);
  if(url.endsWith('/functions/v1/intmed-content-jobs'))return Response.json({status:'queued'},{status:202});
  throw Error('Unexpected cache-test URL '+url);
 };
 const runContext=vm.createContext({Deno:{serve:fn=>runHandler=fn,env:{get:key=>({SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service',SUPABASE_ANON_KEY:'anon'})[key]}},fetch:requestFetch,Response,Request,crypto,btoa,console});
 vm.runInContext(worker,runContext);
 const result=await runHandler(new Request('https://project.supabase.co/functions/v1/intmed-content-worker',{method:'POST',headers:{authorization:'Bearer service','content-type':'application/json'},body:JSON.stringify({ingestId})}));
 assert.equal(result.status,200);return {writes,calls,result:await result.json(),candidate};
}
const cachedPdf=await duplicateRun(),cachedDraft=cachedPdf.writes.find(value=>value.provider==='cache');
assert.ok(cachedDraft);assert.equal(cachedPdf.result.processed,1);
assert.ok(!cachedPdf.calls.some(call=>/generativelanguage|openai\.com|\/functions\/v1\/intmed-content-jobs/.test(call.url)));
assert.deepEqual(cachedDraft.draft_json.documentExtraction,parsedExtraction,'parser verification, blank pages and figures must not be downgraded to model reports');
assert.deepEqual(cachedDraft.draft_json.sourceEvidence,cachedPdf.candidate.draft_json.sourceEvidence);
assert.deepEqual(cachedDraft.draft_json.reviewFindings,cachedPdf.candidate.draft_json.reviewFindings);
assert.equal(cachedDraft.reviewer_note,cachedPdf.candidate.reviewer_note);
assert.equal(cachedDraft.status,'draft_ready');assert.equal(cachedDraft.reviewed_by,null);assert.equal(cachedDraft.reviewed_at,null);assert.equal(cachedDraft.draft_json.generation.clinicalReview,'pending_teacher');
assert.match(cachedPdf.calls.find(call=>call.url.includes('/intmed_content_ingest?sha256=')).url,/sha256=eq.exact-sha/);
for(const options of [
 {extraction:{...parsedExtraction,quality:{canReuseText:true,actualPageCountVerified:false,countBasis:'model_reported'}}},
 {extraction:{...parsedExtraction,pages:[parsedExtraction.pages[0],parsedExtraction.pages[0]]}},
 {sourceStatus:'approved'},{sourceStatus:'published'},{sourceStatus:'rejected'},
 {caption:'مبحث مقصد دیگری'},{hint:'نفرولوژی'},{suggested:'another-topic'},
]){
 const run=await duplicateRun(options);
 assert.ok(!run.writes.some(value=>value.provider==='cache'),'unsafe or differently routed source must not be cloned: '+JSON.stringify(options));
 assert.ok(run.calls.some(call=>call.url.endsWith('/functions/v1/intmed-content-jobs')),'PDF without reusable cache still requires independent extraction');
}
assert.ok((await duplicateRun({kind:'text'})).writes.some(value=>value.provider==='cache'),'text caching must remain available');
const imageExtraction={pageCount:1,pages:[{page:1,text:'شرح تصویر',unreadable:false}],warnings:[],quality:{canReuseText:true}};
assert.ok((await duplicateRun({kind:'image',extraction:imageExtraction})).writes.some(value=>value.provider==='cache'),'consistent image caching must remain available');
console.log('Duplicate cache passed: parser-verified PDF reuse before dispatch, unchanged verification/provenance/findings, fresh approval, unsafe-state and routing-hint isolation, text/image compatibility.');
