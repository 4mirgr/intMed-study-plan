// Narrow admin-authenticated bridge for a localhost LM Studio runner. It never publishes content.
const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
const SITE='https://drgerami-md.ir';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const runner=/^[A-Za-z0-9._-]{1,80}$/;
const topic=/^[a-z0-9][a-z0-9-]{1,79}$/;
const text=(value,limit)=>String(value||'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,limit);
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);

Deno.serve(async req=>{
  const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
  if(req.method!=='POST')return reply(405,{message:'Method not allowed'});
  const length=Number(req.headers.get('content-length')||0);if(length>900000)return reply(413,{message:'Payload too large'});
  const base=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),publishable=Deno.env.get('SUPABASE_ANON_KEY');
  if(!base||!service||!publishable)return reply(503,{message:'Server configuration missing'});
  const authorization=req.headers.get('authorization')||'';
  if(!authorization.startsWith('Bearer ')||authorization==='Bearer '+service)return reply(401,{message:'User session required'});
  const auth=await fetch(base+'/auth/v1/user',{headers:{apikey:publishable,Authorization:authorization}});if(!auth.ok)return reply(401,{message:'Session expired'});
  const user=await auth.json();if(!uuid.test(String(user.id||'')))return reply(401,{message:'Invalid session'});
  const server={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
  async function db(path,method='GET',value,extra={}){const response=await fetch(base+'/rest/v1/'+path,{method,headers:{...server,...extra},...(value===undefined?{}:{body:JSON.stringify(value)})});if(!response.ok)throw Error('database_'+response.status);return response.status===204?null:JSON.parse(await response.text()||'null');}
  async function notify(message){try{const token=Deno.env.get('TELEGRAM_BOT_TOKEN');if(!token)return;const settings=await db('intmed_notification_settings?key=eq.telegram&select=chat_id&limit=1'),chat=settings[0]?.chat_id;if(!chat)return;await fetch('https://api.telegram.org/bot'+token+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chat,text:message,reply_markup:{inline_keyboard:[[{text:'📥 وضعیت صف',callback_data:'menu:status'}]]},link_preview_options:{is_disabled:true}})});}catch{}}
  async function taxonomy(){const response=await fetch(SITE+'/content/taxonomy.json',{headers:{Accept:'application/json'}});if(!response.ok)throw Error('taxonomy');const data=await response.json(),items=[];for(const category of data.categories||[])for(const entry of category.topics||[])if(topic.test(String(entry.id||'')))items.push({id:entry.id,label:text(entry.label,160),category:text(category.label,120)});if(!items.length)throw Error('taxonomy');return items;}
  const profiles=await db('profiles?id=eq.'+encodeURIComponent(user.id)+'&select=role,approved,rejected&limit=1');
  if(profiles.length!==1||profiles[0].role!=='admin'||!profiles[0].approved||profiles[0].rejected)return reply(403,{message:'Admin required'});
  let body;try{body=await req.json();}catch{return reply(400,{message:'Invalid JSON'});}if(!object(body))return reply(400,{message:'Invalid JSON'});
  const action=String(body.action||'status');
  const ingestId=String(body.ingestId||''),leaseId=String(body.leaseToken||'');
  if(['heartbeat','submit','fail'].includes(action)&&(!uuid.test(ingestId)||!uuid.test(leaseId)))return reply(400,{message:'Invalid lease'});
  try{
    if(action==='status'){
      const rows=await db('intmed_content_local_jobs?claimed_by=eq.'+user.id+'&state=eq.active&select=ingest_id,runner_id,lease_until,last_heartbeat_at,model&order=updated_at.desc&limit=1');
      return reply(200,{ok:true,active:rows[0]||null});
    }
    if(action==='claim'){
      const runnerId=text(body.runnerId,80);if(!runner.test(runnerId))return reply(400,{message:'Invalid runner id'});
      const lease=crypto.randomUUID(),claimed=await db('rpc/claim_intmed_local_content','POST',{claimant:user.id,new_lease:lease,local_runner_id:runnerId});
      if(!claimed)return reply(200,{ok:true,job:null,reason:'empty_or_busy'});
      const rows=await db('intmed_content_ingest?id=eq.'+claimed+'&status=eq.processing&select=id,kind,mime_type,original_filename,storage_path,content_text,caption,suggested_topic_id,sha256,byte_size,is_forwarded,source_type,source_name&limit=1'),item=rows[0];
      if(!item){await db('rpc/fail_intmed_local_content','POST',{target_ingest:claimed,lease_owner:lease,claimant:user.id,failure_code:'local_missing_item',model_name:null});return reply(409,{message:'Claimed item unavailable'});}
      const hints=await db('intmed_bot_topic_hints?ingest_id=eq.'+claimed+'&select=hint_text&limit=1');
      let downloadUrl=null;
      if(item.kind!=='text'){
        const path=String(item.storage_path||'');if(!path){await db('rpc/fail_intmed_local_content','POST',{target_ingest:claimed,lease_owner:lease,claimant:user.id,failure_code:'local_missing_source',model_name:null});return reply(409,{message:'Source unavailable'});}
        const signed=await fetch(base+'/storage/v1/object/sign/intmed-content-inbox/'+path.split('/').map(encodeURIComponent).join('/'),{method:'POST',headers:server,body:JSON.stringify({expiresIn:900})});
        if(!signed.ok){await db('rpc/fail_intmed_local_content','POST',{target_ingest:claimed,lease_owner:lease,claimant:user.id,failure_code:'local_sign_failed',model_name:null});return reply(503,{message:'Could not sign source'});}
        const value=await signed.json(),relative=String(value.signedURL||value.signedUrl||'');downloadUrl=relative.startsWith('http')?relative:base+'/storage/v1'+(relative.startsWith('/')?'':'/')+relative;
      }
      return reply(200,{ok:true,leaseToken:lease,leaseSeconds:300,job:{id:item.id,kind:item.kind,mimeType:item.mime_type,filename:text(item.original_filename,180),byteSize:Number(item.byte_size)||0,sha256:item.sha256||null,caption:text(item.caption,1500),topicHint:text(hints[0]?.hint_text||item.suggested_topic_id,300),contentText:item.kind==='text'?String(item.content_text||''):null,downloadUrl,forwarded:!!item.is_forwarded,source:{type:item.source_type||null,name:text(item.source_name,300)}}});
    }
    if(action==='heartbeat'){
      const alive=await db('rpc/heartbeat_intmed_local_content','POST',{target_ingest:ingestId,lease_owner:leaseId,claimant:user.id});
      return alive?reply(200,{ok:true,leaseSeconds:300}):reply(409,{message:'Lease expired'});
    }
    if(action==='fail'){
      const code='local_'+text(body.errorCode||'runner_failed',70).replace(/[^a-z0-9_-]/gi,'_'),model=text(body.model,160);
      const failed=await db('rpc/fail_intmed_local_content','POST',{target_ingest:ingestId,lease_owner:leaseId,claimant:user.id,failure_code:code,model_name:model});
      return failed?reply(200,{ok:true}):reply(409,{message:'Lease expired'});
    }
    if(action==='submit'){
      const draft=body.draft,encoded=JSON.stringify(draft||{}),model=text(body.model,160),promptVersion=text(body.promptVersion||'intmed-local-v1',80),extracted=String(body.extractedText||'').slice(0,500000);
      if(encoded.length>520000||!object(draft)||!model)return reply(400,{message:'Invalid draft'});
      if(typeof draft.title!=='string'||!draft.title.trim()||draft.title.length>240||typeof draft.sourceSummary!=='string'||draft.sourceSummary.length>4000)return reply(400,{message:'Invalid draft metadata'});
      if(draft.suggestedTopicId!==null&&draft.suggestedTopicId!==undefined&&!topic.test(String(draft.suggestedTopicId)))return reply(400,{message:'Invalid topic'});
      if(draft.suggestedTopicId!==null&&draft.suggestedTopicId!==undefined&&!new Set((await taxonomy()).map(entry=>entry.id)).has(String(draft.suggestedTopicId)))return reply(400,{message:'Unknown topic'});
      if(typeof draft.confidence!=='number'||draft.confidence<0||draft.confidence>1)return reply(400,{message:'Invalid confidence'});
      for(const key of ['medicalWarnings','lessonOutline','mcqDrafts','kfDrafts','imageCandidates','sourceEvidence'])if(!Array.isArray(draft[key]))return reply(400,{message:'Missing '+key});
      if(draft.mcqDrafts.length>80||draft.kfDrafts.length>40||draft.imageCandidates.length>80||draft.sourceEvidence.length>300)return reply(400,{message:'Draft limits exceeded'});
      if(draft.mcqDrafts.some(q=>!object(q)||!Array.isArray(q.options)||q.options.length!==4||!Number.isInteger(q.correctIndex)||q.correctIndex<0||q.correctIndex>3))return reply(400,{message:'Invalid MCQ'});
      if(/"reviewStatus":"(?:reviewed|approved|published)"/i.test(encoded))return reply(400,{message:'Local output must remain draft'});
      draft.reviewStatus='draft';draft.generatedBy='lmstudio';
      const saved=await db('rpc/complete_intmed_local_content','POST',{target_ingest:ingestId,lease_owner:leaseId,claimant:user.id,result_draft:draft,extracted_source:extracted,model_name:model,prompt_name:promptVersion});
      if(saved)await notify('🧠 پیش‌نویس محلی آمادهٔ بازبینی است.\nعنوان: '+text(draft.title,180)+'\nمدل: '+model+'\nهیچ محتوایی خودکار منتشر نشده است.');
      return saved?reply(200,{ok:true,status:'draft_ready'}):reply(409,{message:'Lease expired'});
    }
    return reply(400,{message:'Unknown action'});
  }catch(error){return reply(503,{message:'Local runner bridge unavailable',code:text(error instanceof Error?error.message:'bridge_error',80)});}
});
