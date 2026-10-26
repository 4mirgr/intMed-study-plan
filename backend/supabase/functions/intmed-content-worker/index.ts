// Review-draft worker. It never writes canonical site content and never marks medical review complete.
const SITE='https://drgerami-md.ir';
const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
const safeText=(value,limit)=>String(value||'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,limit);
const b64=(bytes)=>{let out='';for(let i=0;i<bytes.length;i+=0x8000)out+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(out);};

Deno.serve(async req=>{
  const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
  if(req.method!=='POST')return reply(405,{message:'Method not allowed'});
  const base=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),anon=Deno.env.get('SUPABASE_ANON_KEY');
  if(!base||!service||!anon)return reply(503,{message:'Server configuration missing'});
  const authorization=req.headers.get('authorization')||'',internal=authorization==='Bearer '+service;
  if(!internal){
    const auth=await fetch(base+'/auth/v1/user',{headers:{apikey:anon,Authorization:authorization}});if(!auth.ok)return reply(401,{message:'Unauthorized'});
    const user=await auth.json(),profile=await fetch(base+'/rest/v1/profiles?id=eq.'+encodeURIComponent(user.id)+'&select=role,approved,rejected&limit=1',{headers:{apikey:service,Authorization:'Bearer '+service}}),rows=profile.ok?await profile.json():[];
    if(rows.length!==1||rows[0].role!=='admin'||!rows[0].approved||rows[0].rejected)return reply(403,{message:'Admin required'});
  }
  let body;try{body=await req.json();}catch{return reply(400,{message:'Invalid JSON'});}
  const requested=String(body.ingestId||'');if(requested&&!/^[0-9a-f-]{36}$/i.test(requested))return reply(400,{message:'Invalid ingest id'});
  const processingEnabled=Deno.env.get('INTMED_CONTENT_PROCESSING_ENABLED')==='true';
  if(!processingEnabled)return reply(200,{processed:0,reason:'manual_mode'});
  const sh={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
  async function db(path,method='GET',value,extra={}){const r=await fetch(base+'/rest/v1/'+path,{method,headers:{...sh,...extra},...(value===undefined?{}:{body:JSON.stringify(value)})});if(!r.ok)throw Error('database');return r.status===204?null:JSON.parse(await r.text()||'null');}
  async function notify(text){try{const token=Deno.env.get('TELEGRAM_BOT_TOKEN');if(!token)return;const settings=await db('intmed_notification_settings?key=eq.telegram&select=chat_id'),chat=settings[0]?.chat_id;if(!chat)return;await fetch('https://api.telegram.org/bot'+token+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chat,text,link_preview_options:{is_disabled:true}})});}catch{}}
  async function save(ingestId,value){await db('intmed_content_drafts?on_conflict=ingest_id','POST',{ingest_id:ingestId,...value,updated_at:new Date().toISOString()},{Prefer:'resolution=merge-duplicates,return=minimal'});}
  const leaseOwner=crypto.randomUUID();let processed=0,waiting=0,failed=0,claimedAny=false,claimedCount=0;
  async function release(){try{await db('rpc/release_intmed_content_lease','POST',{lease_owner:leaseOwner});}catch{}}
  function continueQueue(){
    if(requested||waiting||claimedCount<3)return;
    const task=fetch(base+'/functions/v1/intmed-content-worker',{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:'{}'}).catch(()=>null);
    const runtime=globalThis.EdgeRuntime;if(runtime&&typeof runtime.waitUntil==='function')runtime.waitUntil(task);
  }
  try{
    const taxonomyResponse=await fetch(SITE+'/content/taxonomy.json',{headers:{Accept:'application/json'}});if(!taxonomyResponse.ok)throw Error('taxonomy');
    const taxonomy=await taxonomyResponse.json(),topics=[];for(const category of taxonomy.categories||[])for(const topic of category.topics||[])topics.push({id:topic.id,label:topic.label,category:category.label});
    const allowed=new Set(topics.map(topic=>topic.id)),apiKey=Deno.env.get('OPENAI_API_KEY'),model=Deno.env.get('INTMED_CONTENT_MODEL')||'gpt-5-mini',limit=requested?1:3;
    for(let index=0;index<limit;index++){
      const itemId=await db('rpc/claim_intmed_content_ingest','POST',{requested:requested||null,lease_owner:leaseOwner});
      if(!itemId)break;claimedAny=true;claimedCount++;
      const items=await db('intmed_content_ingest?id=eq.'+encodeURIComponent(itemId)+'&status=eq.processing&select=id,kind,mime_type,original_filename,storage_path,content_text,caption,suggested_topic_id,sha256,byte_size&limit=1'),item=items[0];
      if(!item){await release();break;}
      const hintRows=await db('intmed_bot_topic_hints?ingest_id=eq.'+item.id+'&select=hint_text&limit=1'),persianHint=safeText(hintRows[0]?.hint_text,300);
      if(!apiKey){await save(item.id,{status:'waiting_provider',error_code:'provider_not_configured',provider:'openai',model});await db('intmed_content_ingest?id=eq.'+item.id,'PATCH',{status:'pending_review',error_code:'provider_not_configured',updated_at:new Date().toISOString()},{Prefer:'return=minimal'});waiting++;await release();break;}
      await save(item.id,{status:'processing',error_code:null,provider:'openai',model});
      try{
        const topicList=topics.map(t=>t.id+' | '+t.category+' | '+t.label).join('\n'),instructions='شما دستیار پیش‌نویس محتوای پزشکی IntMed هستید. فقط تحلیل مقدماتی و قابل بازبینی تولید کنید؛ هیچ ادعایی را reviewed یا منتشرشده اعلام نکنید. نزدیک‌ترین topicId را فقط از فهرست مجاز انتخاب کنید یا null بدهید. راهنمای فارسی مدیر را یک سرنخ اولویت‌دار برای تطبیق در نظر بگیرید، نه حقیقت علمی و نه مجوز انتشار. سؤال‌ها باید draft باشند و هشدارهای علمی/منبعی را صریح بنویسید.\nفهرست مباحث مجاز:\n'+topicList+'\nراهنمای فارسی مدیر: '+persianHint+'\nتوضیح فایل: '+safeText(item.caption,1500)+'\nپیشنهاد ساختاری: '+safeText(item.suggested_topic_id,80);
        const content=[{type:'input_text',text:instructions}];
        let extracted=null;
        if(item.kind==='text'){extracted=String(item.content_text||'').slice(0,50000);content.push({type:'input_text',text:'محتوای ورودی:\n'+extracted});}
        else{
          if(!item.storage_path||Number(item.byte_size||0)>10485760)throw Error('worker_size');
          const file=await fetch(base+'/storage/v1/object/intmed-content-inbox/'+item.storage_path,{headers:{apikey:service,Authorization:'Bearer '+service}});if(!file.ok)throw Error('storage');
          const bytes=new Uint8Array(await file.arrayBuffer());if(!bytes.length||bytes.length>10485760)throw Error('worker_size');
          const data='data:'+item.mime_type+';base64,'+b64(bytes);
          if(item.kind==='image')content.push({type:'input_image',image_url:data,detail:'high'});else content.push({type:'input_file',filename:safeText(item.original_filename,120)||'source.pdf',file_data:data});
        }
        const schema={type:'object',additionalProperties:false,required:['suggestedTopicId','confidence','title','sourceSummary','medicalWarnings','lessonOutline','mcqDrafts','kfDrafts','imageCandidates'],properties:{suggestedTopicId:{type:['string','null']},confidence:{type:'number',minimum:0,maximum:1},title:{type:'string'},sourceSummary:{type:'string'},medicalWarnings:{type:'array',items:{type:'string'}},lessonOutline:{type:'array',items:{type:'string'}},mcqDrafts:{type:'array',items:{type:'object',additionalProperties:false,required:['stem','options','correctIndex','explanation'],properties:{stem:{type:'string'},options:{type:'array',minItems:4,maxItems:4,items:{type:'string'}},correctIndex:{type:'integer',minimum:0,maximum:3},explanation:{type:'string'}}}},kfDrafts:{type:'array',items:{type:'object',additionalProperties:false,required:['prompt','expectedAnswer'],properties:{prompt:{type:'string'},expectedAnswer:{type:'string'}}}},imageCandidates:{type:'array',items:{type:'object',additionalProperties:false,required:['description','rightsConcern'],properties:{description:{type:'string'},rightsConcern:{type:'string'}}}}}};
        const ai=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({model,input:[{role:'user',content}],text:{format:{type:'json_schema',name:'intmed_content_draft',strict:true,schema}},max_output_tokens:7000})});
        const responseText=await ai.text();if(!ai.ok){let detail={};try{detail=JSON.parse(responseText);}catch{}const providerCode=safeText(detail?.error?.code||detail?.error?.type,80),code=ai.status===429&&providerCode==='insufficient_quota'?'provider_quota':ai.status===429?'provider_rate_limited':ai.status>=500?'provider_unavailable':'provider_'+ai.status,error=Object.assign(Error(code),{waitingProvider:ai.status===429||ai.status>=500});throw error;}
        const response=JSON.parse(responseText),raw=String(response.output_text||response.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text||''),draft=JSON.parse(raw);
        const topicId=allowed.has(draft.suggestedTopicId)?draft.suggestedTopicId:null,title=safeText(draft.title,240),summary=safeText(draft.sourceSummary,4000);
        await save(item.id,{status:'draft_ready',topic_id:topicId,topic_confidence:Number(draft.confidence)||0,title,source_summary:summary,extracted_text:extracted,draft_json:draft,error_code:null,provider:'openai',model});
        await db('intmed_content_ingest?id=eq.'+item.id,'PATCH',{status:'pending_review',error_code:null,updated_at:new Date().toISOString()},{Prefer:'return=minimal'});
        await notify('🧠 پیش‌نویس محتوای جدید آمادهٔ بازبینی است.\nشناسه: '+item.id.slice(0,8)+'\nعنوان: '+title+(topicId?'\nمبحث پیشنهادی: '+topicId:'\nمبحث نیازمند انتخاب مدیر است.')+'\nاین خروجی هنوز منتشر یا تأیید علمی نشده است.');processed++;await release();
      }catch(error){const code=safeText(error instanceof Error?error.message:'worker_failed',80)||'worker_failed',providerWait=!!(error&&typeof error==='object'&&Reflect.get(error,'waitingProvider')===true);if(providerWait){await save(item.id,{status:'waiting_provider',error_code:code});await db('intmed_content_ingest?id=eq.'+item.id,'PATCH',{status:'pending_review',error_code:code,updated_at:new Date().toISOString()},{Prefer:'return=minimal'});await notify('⏳ پردازش هوشمند موقتاً از سمت سرویس تحلیل متوقف شد. ورودی محفوظ است؛ بعداً دکمه «پردازش دوباره» را بزنید.\nکد: '+code);waiting++;await release();break;}await save(item.id,{status:'error',error_code:code});await db('intmed_content_ingest?id=eq.'+item.id,'PATCH',{status:'error',error_code:code,updated_at:new Date().toISOString()},{Prefer:'return=minimal'});failed++;await release();}
    }
    continueQueue();
    return claimedAny?reply(200,{processed,waitingProvider:waiting,failed}):reply(200,{processed:0,reason:'empty_or_busy'});
  }catch{await release();return reply(503,{message:'Worker unavailable'});}
});
