// Only a short-lived, one-use database capability can wake the intake queue.
// No source content, permanent secret or publication action is accepted here.
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
const hex=/^[a-f0-9]{64}$/;
Deno.serve(async req=>{
  const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
  if(req.method!=='POST')return reply(405,{message:'Method not allowed'});
  if(Number(req.headers.get('content-length')||0)>2048)return reply(413,{message:'Payload too large'});
  let input;
  try{const text=await req.text();if(new TextEncoder().encode(text).length>2048)return reply(413,{message:'Payload too large'});input=JSON.parse(text);}catch{return reply(400,{message:'Invalid payload'});}
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1||typeof input.token!=='string'||!hex.test(input.token))return reply(403,{message:'Invalid sweep capability'});
  const base=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!base||!service)return reply(503,{message:'Sweep unavailable'});
  const server={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
  async function rpc(name,body){
    const response=await fetch(base+'/rest/v1/rpc/'+name,{method:'POST',headers:server,body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Error('sweep_database_failed');
    return response.json();
  }
  let runId;
  try{runId=await rpc('claim_intmed_queue_sweep',{p_token:input.token});}catch{return reply(503,{message:'Sweep unavailable'});}
  if(typeof runId!=='string'||!/^[a-f0-9-]{36}$/i.test(runId))return reply(403,{message:'Sweep capability expired or used'});
  const task=(async()=>{
    let result={},error=null;
    try{
      const response=await fetch(base+'/functions/v1/intmed-content-worker',{method:'POST',headers:server,body:'{}',signal:AbortSignal.timeout(110000)});
      if(!response.ok)error='worker_http_'+response.status;
      else{
        const value=await response.json(),count=value=>Number.isFinite(value)?Math.max(0,Math.min(3,Math.trunc(value))):0;
        result={processed:count(value.processed),waitingProvider:count(value.waitingProvider),failed:count(value.failed)};
        if(['manual_mode','empty_or_busy'].includes(value.reason))result.reason=value.reason;
      }
    }catch{error='worker_network_failed';}
    try{await rpc('complete_intmed_queue_sweep',{p_run_id:runId,p_result:result,p_error:error});}catch{
      // The database expiry/cooldown makes a terminated callback recoverable on the next tick.
      // Never log a capability, source body, provider response or service credential.
    }
  })();
  const runtime=globalThis.EdgeRuntime;
  if(runtime&&typeof runtime.waitUntil==='function')runtime.waitUntil(task);else await task;
  return reply(202,{ok:true,started:true});
});
