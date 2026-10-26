import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
let handler,admin=true,claimed=true,completed=false,failed=false,heartbeat=false;
const user='11111111-1111-4111-8111-111111111111',ingest='22222222-2222-4222-8222-222222222222',env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-secret',SUPABASE_ANON_KEY:'public-key'};
const fetchMock=async(url,options={})=>{
 if(url==='https://drgerami-md.ir/content/taxonomy.json')return Response.json({categories:[{label:'عفونی',topics:[{id:'id-cns-meningoencephalitis',label:'مننژیت و انسفالیت'}]}]});
 if(url.endsWith('/auth/v1/user'))return options.headers.Authorization==='Bearer good-token'?Response.json({id:user}):new Response('{}',{status:401});
 if(url.includes('/rest/v1/profiles?'))return Response.json([{role:admin?'admin':'user',approved:true,rejected:false}]);
 if(url.includes('/rpc/claim_intmed_local_content'))return Response.json(claimed?ingest:null);
 if(url.includes('/rest/v1/intmed_content_ingest?'))return Response.json([{id:ingest,kind:'text',mime_type:'text/plain',original_filename:null,storage_path:null,content_text:'متن نمونه',caption:'شرح',suggested_topic_id:null,sha256:null,byte_size:18,is_forwarded:false}]);
 if(url.includes('/rest/v1/intmed_bot_topic_hints?'))return Response.json([{hint_text:'انسفالیت'}]);
 if(url.includes('/rpc/heartbeat_intmed_local_content')){heartbeat=true;return Response.json(true);}
 if(url.includes('/rpc/complete_intmed_local_content')){const body=JSON.parse(options.body);completed=body.result_draft.reviewStatus==='draft'&&body.result_draft.generatedBy==='lmstudio';return Response.json(true);}
 if(url.includes('/rpc/fail_intmed_local_content')){failed=true;return Response.json(true);}
 if(url.includes('/rest/v1/intmed_content_local_jobs?'))return Response.json([]);
 throw Error('Unexpected '+url);
};
const context=vm.createContext({Deno:{serve:fn=>handler=fn,env:{get:key=>env[key]}},fetch:fetchMock,Response,Request,JSON,Object,String,Date,RegExp,Number,Array,encodeURIComponent,crypto,Error});
vm.runInContext(fs.readFileSync('backend/supabase/functions/intmed-local-runner/index.ts','utf8'),context);
const call=(body,token='good-token')=>handler(new Request('https://project.supabase.co/functions/v1/intmed-local-runner',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)}));
let response=await call({action:'claim',runnerId:'macbook.local'});assert.equal(response.status,200);let result=await response.json();assert.equal(result.job.id,ingest);assert.equal(result.job.contentText,'متن نمونه');assert.equal(result.job.topicHint,'انسفالیت');assert.ok(result.leaseToken);
response=await call({action:'heartbeat',ingestId:ingest,leaseToken:'33333333-3333-4333-8333-333333333333'});assert.equal(response.status,200);assert.equal(heartbeat,true);
const draft={suggestedTopicId:'id-cns-meningoencephalitis',confidence:.8,title:'انسفالیت',sourceSummary:'خلاصه',medicalWarnings:[],lessonOutline:['درس'],mcqDrafts:[{stem:'سؤال',options:['۱','۲','۳','۴'],correctIndex:0,explanation:'شرح'}],kfDrafts:[],imageCandidates:[],sourceEvidence:[]};
response=await call({action:'submit',ingestId:ingest,leaseToken:'33333333-3333-4333-8333-333333333333',model:'qwen3',draft});assert.equal(response.status,200);assert.equal(completed,true);
response=await call({action:'fail',ingestId:ingest,leaseToken:'33333333-3333-4333-8333-333333333333',errorCode:'timeout',model:'qwen3'});assert.equal(response.status,200);assert.equal(failed,true);
response=await call({action:'submit',ingestId:ingest,leaseToken:'33333333-3333-4333-8333-333333333333',model:'qwen3',draft:{...draft,reviewStatus:'reviewed'}});assert.equal(response.status,400);
response=await call({action:'status'},'bad-token');assert.equal(response.status,401);admin=false;response=await call({action:'status'});assert.equal(response.status,403);
const sql=fs.readFileSync('backend/supabase/local_content_runner.sql','utf8'),config=fs.readFileSync('backend/supabase/config.toml','utf8');
assert.match(sql,/intmed_content_local_jobs/);assert.match(sql,/enable row level security/);assert.match(sql,/revoke all on public\.intmed_content_local_jobs from public,anon,authenticated/);assert.match(sql,/claim_intmed_local_content/);assert.match(sql,/heartbeat_intmed_local_content/);assert.match(sql,/local_lease_expired/);assert.match(sql,/interval '15 minutes'/);assert.match(config,/\[functions\.intmed-local-runner\][\s\S]*verify_jwt = false/);
assert.doesNotMatch(fs.readFileSync('backend/supabase/functions/intmed-local-runner/index.ts','utf8'),/OPENAI_API_KEY|auto-publish/);
console.log('Local content runner bridge passed: admin JWT, atomic lease/heartbeat, signed-source boundary, draft validation, failure release and no client service key.');
