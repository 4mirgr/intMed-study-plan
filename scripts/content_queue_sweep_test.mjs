import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const path='backend/supabase/functions/intmed-content-sweep/index.ts';
assert.ok(fs.existsSync(path),'Periodic queue recovery handler is missing');
const source=fs.readFileSync(path,'utf8'),capability='a'.repeat(64),runId='11111111-1111-4111-8111-111111111111';
async function invoke(input,{valid=true,workerStatus=200,workerBody={processed:3},workerFails=false,runtime=true}={}){
 let handler;const calls=[],tasks=[];
 const fetch=async(url,options={})=>{
  const body=options.body?JSON.parse(options.body):null;calls.push({url,options,body});
  if(url.endsWith('/rpc/claim_intmed_queue_sweep')){assert.deepEqual(body,{p_token:capability});return Response.json(valid?runId:null);}
  if(url.endsWith('/functions/v1/intmed-content-worker')){
   assert.deepEqual(body,{},'Sweep must never request an arbitrary source or publication');
   assert.equal(options.headers.Authorization,'Bearer service-only');
   if(workerFails)throw Error('private signed URL / secret must not escape');
   return Response.json(workerBody,{status:workerStatus});
  }
  if(url.endsWith('/rpc/complete_intmed_queue_sweep'))return Response.json(true);
  throw Error('Unexpected endpoint '+url);
 };
 const context={Deno:{serve:fn=>handler=fn,env:{get:key=>({SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-only'}[key])}},fetch,Response,Request,JSON,TextEncoder,AbortSignal,Date,Number,Math,Error};
 if(runtime)context.EdgeRuntime={waitUntil:task=>tasks.push(task)};
 vm.runInNewContext(source,context);
 const response=await handler(new Request('https://project.supabase.co/functions/v1/intmed-content-sweep',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)}));
 await Promise.all(tasks);
 return{response,body:await response.json(),calls};
}
for(const input of [{},{token:'bad'},{token:capability,ingestId:runId},{token:capability,action:'publish'}]){
 const result=await invoke(input);assert.ok([400,403].includes(result.response.status));assert.equal(result.calls.length,0);
}
const denied=await invoke({token:capability},{valid:false});assert.equal(denied.response.status,403);assert.equal(denied.calls.length,1);
const ok=await invoke({token:capability});assert.equal(ok.response.status,202);assert.ok(!JSON.stringify(ok.body).includes(capability));
const completion=ok.calls.find(call=>call.url.endsWith('/complete_intmed_queue_sweep'));
assert.equal(completion.body.p_run_id,runId);assert.equal(completion.body.p_result.processed,3);assert.equal(completion.body.p_error,null);
const waiting=await invoke({token:capability},{workerBody:{processed:0,waitingProvider:1}});
assert.equal(waiting.calls.at(-1).body.p_result.waitingProvider,1);
for(const options of [{workerStatus:503,workerBody:{message:'private error'}},{workerFails:true}]){
 const result=await invoke({token:capability},options),last=result.calls.at(-1).body;
 assert.match(last.p_error,/^(worker_http_503|worker_network_failed)$/);assert.ok(!JSON.stringify(last).includes('private'));
}
const noRuntime=await invoke({token:capability},{runtime:false});assert.equal(noRuntime.response.status,202);assert.equal(noRuntime.calls.length,3);
console.log('Queue sweep handler passed: bounded one-use capability, no arbitrary source/publication, private failures and recorded completion.');
