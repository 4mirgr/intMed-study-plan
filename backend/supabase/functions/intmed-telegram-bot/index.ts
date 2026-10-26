// Telegram webhook: private, service-only inbox for source text, PDFs and images.
// Deploy with gateway Verify JWT OFF; Telegram's secret header is verified below.
Deno.serve(async req=>{
  const jsonHeaders={'Content-Type':'application/json','Cache-Control':'no-store'};
  const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:jsonHeaders});
  if(req.method!=='POST')return reply(405,{ok:false});
  const url=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const token=Deno.env.get('TELEGRAM_BOT_TOKEN'),secret=Deno.env.get('TELEGRAM_WEBHOOK_SECRET'),anon=Deno.env.get('SUPABASE_ANON_KEY');
  const processingEnabled=Deno.env.get('INTMED_CONTENT_PROCESSING_ENABLED')==='true';
  if(!url||!service||!token||!secret)return reply(503,{ok:false});
  function same(a,b){if(typeof a!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
  const raw=await req.text();if(raw.length>262144)return reply(413,{ok:false});
  const sh={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
  async function db(path,method='GET',body,extra={}){const r=await fetch(url+'/rest/v1/'+path,{method,headers:{...sh,...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});if(!r.ok)throw Error('db');return r.status===204?null:JSON.parse(await r.text()||'null');}
  async function telegram(method,body){const r=await fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),v=await r.json();if(!r.ok||!v.ok)throw Error('telegram');return v.result;}
  const menu={inline_keyboard:[[{text:'📥 وضعیت صف',callback_data:'menu:status'},{text:'🏷 تعیین مبحث',callback_data:'topic:set'}],[{text:processingEnabled?'🔄 پردازش دوباره':'🧾 پردازش دستی',callback_data:'queue:retry'},{text:'راهنما',callback_data:'menu:help'}]]};
  async function say(chat,text,reply_markup=menu){try{return await telegram('sendMessage',{chat_id:chat,text,reply_markup,link_preview_options:{is_disabled:true}});}catch{return null;}}
  function kickWorker(){
    if(!processingEnabled)return false;
    // The worker claims one project-wide lease; a burst of Telegram updates therefore remains
    // a serial queue instead of becoming concurrent provider requests.
    const task=fetch(url+'/functions/v1/intmed-content-worker',{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:'{}'}).catch(()=>null);
    const runtime=globalThis.EdgeRuntime;if(runtime&&typeof runtime.waitUntil==='function')runtime.waitUntil(task);
    return true;
  }
  async function configuredChat(){const rows=await db('intmed_notification_settings?key=eq.telegram&select=chat_id');return rows[0]?.chat_id?String(rows[0].chat_id):'';}
  async function session(chat){const rows=await db('intmed_bot_sessions?chat_id=eq.'+encodeURIComponent(chat)+'&select=mode,topic_hint');return rows[0]||{mode:'idle',topic_hint:null};}
  async function saveSession(chat,mode,hint=null){await db('intmed_bot_sessions?on_conflict=chat_id','POST',{chat_id:chat,mode,topic_hint:hint,updated_at:new Date().toISOString()},{Prefer:'resolution=merge-duplicates,return=minimal'});}
  async function attachHint(ingestId,chat){const value=await session(chat);if(!value.topic_hint)return null;await db('intmed_bot_topic_hints?on_conflict=ingest_id','POST',{ingest_id:ingestId,hint_text:value.topic_hint},{Prefer:'resolution=merge-duplicates,return=minimal'});await saveSession(chat,'idle',null);return value.topic_hint;}
  async function signedInUser(){const bearer=req.headers.get('authorization')||'';if(!anon||!/^Bearer\s+\S+$/i.test(bearer))return null;const response=await fetch(url+'/auth/v1/user',{headers:{apikey:anon,Authorization:bearer}});if(!response.ok)return null;return await response.json();}
  function faMinutes(seconds){const minutes=Math.max(0,Math.round(Number(seconds||0)/60));return new Intl.NumberFormat('fa-IR').format(minutes)+' دقیقه';}
  async function topicLabels(ids){const labels=new Map(ids.map(id=>[id,id]));try{const response=await fetch('https://drgerami-md.ir/content/taxonomy.json',{headers:{Accept:'application/json'}});if(!response.ok)return labels;const data=await response.json();for(const category of data?.categories||[])for(const topic of category?.topics||[])if(labels.has(topic.id))labels.set(topic.id,clean(topic.label,120)||topic.id);}catch{}return labels;}
  function studySummary(state){const entries=Object.entries(state?.itemState||{}),topics=new Map();let seconds=0;for(const [key,value] of entries){const match=/^activity:(.+):(\d{4}-\d{2}-\d{2})$/.exec(key);if(!match)continue;const amount=Math.max(0,Number(value?.seconds)||0);seconds+=amount;topics.set(match[1],(topics.get(match[1])||0)+amount);}const top=[...topics.entries()].sort((a,b)=>b[1]-a[1]).slice(0,3);return {seconds,topics:top};}
  async function deliverUserEvent(body){
    const user=await signedInUser();if(!user)return reply(401,{ok:false});
    const type=String(body?.event||'');if(!['login','activity','message'].includes(type))return reply(400,{ok:false});
    const profiles=await db('profiles?id=eq.'+encodeURIComponent(user.id)+'&select=id,username,full_name,approved,rejected');const profile=profiles[0];if(!profile||!profile.approved||profile.rejected)return reply(403,{ok:false});
    const now=new Date(),slot=type==='login'?Math.floor(now.getTime()/1800000):Math.floor(now.getTime()/900000);let summary=null,dedupe='';
    if(type==='message'){
      const rows=await db('intmed_messages?sender_id=eq.'+encodeURIComponent(user.id)+'&sender_role=eq.user&select=id,body,conversation_id,created_at&order=created_at.desc&limit=1');if(!rows[0])return reply(200,{ok:true,skipped:true});summary=rows[0];dedupe='message:'+rows[0].id;
    }else{
      const rows=await db('study_state?user_id=eq.'+encodeURIComponent(user.id)+'&select=state');summary=studySummary(rows[0]?.state||{});dedupe=type+':'+user.id+':'+(type==='activity'?Math.floor(summary.seconds/900):slot);if(type==='activity'&&summary.seconds<300)return reply(200,{ok:true,skipped:true});
    }
    const inserted=await db('intmed_telegram_alerts?on_conflict=dedupe_key','POST',{event_type:type,user_id:user.id,dedupe_key:dedupe,payload:{summary},status:'pending'},{Prefer:'resolution=ignore-duplicates,return=representation'});if(!inserted?.length)return reply(200,{ok:true,duplicate:true});
    const chat=await configuredChat();if(!chat)return reply(200,{ok:true,queued:true});const alert=inserted[0],claimed=await db('rpc/claim_intmed_telegram_alert','POST',{target_alert:alert.id});if(!claimed)return reply(200,{ok:true,duplicate:true});
    const name=clean(profile.full_name||profile.username,120)||'کاربر';let text='',buttons=menu;
    if(type==='login')text='🟢 ورود کاربر\nکاربر: '+name+'\nزمان: '+new Intl.DateTimeFormat('fa-IR-u-ca-persian',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Tehran'}).format(now);
    if(type==='activity'){const labels=await topicLabels(summary.topics.map(([id])=>id)),list=summary.topics.map(([id,value])=>'• '+labels.get(id)+' — '+faMinutes(value)).join('\n')||'هنوز مبحثی ثبت نشده است.';text='📚 گزارش فعالیت کاربر\nکاربر: '+name+'\nزمان فعال ثبت‌شده: '+faMinutes(summary.seconds)+'\nمباحث پرتکرار:\n'+list;}
    if(type==='message'){text='💬 یک پیام تازه در سایت دارید که نیازمند بررسی است.\nاز: '+name;buttons={inline_keyboard:[[{text:'مشاهده پیام‌ها',url:'https://drgerami-md.ir/#messages'},{text:'📥 وضعیت',callback_data:'menu:status'}]]};}
    try{if(!await say(chat,text,buttons))throw Error('delivery');await db('intmed_telegram_alerts?id=eq.'+alert.id,'PATCH',{status:'sent',updated_at:new Date().toISOString()},{Prefer:'return=minimal'});return reply(200,{ok:true,sent:true});}catch{await db('intmed_telegram_alerts?id=eq.'+alert.id,'PATCH',{status:'error',updated_at:new Date().toISOString()},{Prefer:'return=minimal'});return reply(503,{ok:false,queued:true});}
  }
  function safeName(value,kind){const fallback=kind==='pdf'?'source.pdf':'image.jpg',name=String(value||fallback).normalize('NFKC').replace(/[\\/\u0000-\u001f\u007f]/g,'-').replace(/[^\p{L}\p{N}._ -]/gu,'-').replace(/\s+/g,'-').slice(-120);return name&&name!=='.'&&name!=='..'?name:fallback;}
  function topicHint(text){const m=String(text||'').toLowerCase().match(/(?:\/topic\s+|#)([a-z0-9][a-z0-9-]{1,79})(?:\s|$)/);return m?m[1]:null;}
  function hex(bytes){return Array.from(new Uint8Array(bytes)).map(v=>v.toString(16).padStart(2,'0')).join('');}
  function clean(value,length){const text=String(value||'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();return text?text.slice(0,length):null;}
  function username(value){const text=String(value||'').replace(/^@/,'');return /^[A-Za-z0-9_]{1,64}$/.test(text)?text:null;}
  function isoDate(value){const number=Number(value);return Number.isSafeInteger(number)&&number>0?new Date(number*1000).toISOString():null;}
  function forwarded(message){
    const modern=message.forward_origin;
    if(modern&&typeof modern==='object'){
      if(modern.type==='user')return {source_type:'user',source_name:clean([modern.sender_user?.first_name,modern.sender_user?.last_name].filter(Boolean).join(' '),300),source_username:username(modern.sender_user?.username),source_message_id:null,source_date:isoDate(modern.date)};
      if(modern.type==='hidden_user')return {source_type:'hidden_user',source_name:clean(modern.sender_user_name,300),source_username:null,source_message_id:null,source_date:isoDate(modern.date)};
      if(modern.type==='chat'||modern.type==='channel'){const source=modern.type==='chat'?modern.sender_chat:modern.chat;return {source_type:modern.type,source_name:clean(source?.title||source?.username||modern.author_signature,300),source_username:username(source?.username),source_message_id:Number.isSafeInteger(Number(modern.message_id))?Number(modern.message_id):null,source_date:isoDate(modern.date)};}
    }
    if(message.forward_from_chat)return {source_type:message.forward_from_chat.type==='channel'?'channel':'chat',source_name:clean(message.forward_from_chat.title||message.forward_from_chat.username,300),source_username:username(message.forward_from_chat.username),source_message_id:Number.isSafeInteger(Number(message.forward_from_message_id))?Number(message.forward_from_message_id):null,source_date:isoDate(message.forward_date)};
    if(message.forward_from)return {source_type:'user',source_name:clean([message.forward_from.first_name,message.forward_from.last_name].filter(Boolean).join(' '),300),source_username:username(message.forward_from.username),source_message_id:null,source_date:isoDate(message.forward_date)};
    if(message.forward_sender_name)return {source_type:'hidden_user',source_name:clean(message.forward_sender_name,300),source_username:null,source_message_id:null,source_date:isoDate(message.forward_date)};
    return null;
  }
  function signature(bytes,mime){
    if(mime==='application/pdf')return bytes.length>=5&&String.fromCharCode(...bytes.slice(0,5))==='%PDF-';
    if(mime==='image/jpeg')return bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
    if(mime==='image/png')return bytes.length>=8&&[137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value);
    if(mime==='image/webp')return bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
    return false;
  }
  try{
    const update=JSON.parse(raw);
    const telegramHeader=req.headers.get('x-telegram-bot-api-secret-token');
    if(telegramHeader!==null&&!same(telegramHeader,secret))return reply(403,{ok:false});
    if(telegramHeader===null)return deliverUserEvent(update);
    const updateId=Number(update.update_id),callback=update.callback_query,message=update.message||callback?.message;
    if(!Number.isSafeInteger(updateId)||!message||message.chat?.type!=='private'||!Number.isSafeInteger(Number(message.message_id)))return reply(200,{ok:true,ignored:true});
    const chat=String(message.chat.id||''),allowed=await configuredChat();
    if(!allowed||chat!==allowed)return reply(200,{ok:true,ignored:true});
    const bodyText=String(message.text||message.caption||'').trim(),command=(String(message.text||'').trim().split(/\s+/)[0]||'').split('@')[0].toLowerCase(),callbackData=String(callback?.data||'');
    if(callback?.id)try{await telegram('answerCallbackQuery',{callback_query_id:callback.id});}catch{}
    if(command==='/topic'||callbackData==='topic:set'){
      const supplied=clean(command==='/topic'?String(message.text||'').replace(/^\/topic(?:@\w+)?\s*/i,''):null,300);
      if(supplied){await saveSession(chat,'idle',supplied);await say(chat,'✅ راهنمای مبحث «'+supplied+'» ذخیره شد. حالا متن، PDF یا تصویر را بفرستید؛ سامانه آن را با ساختار مباحث تطبیق می‌دهد.');}
      else{await saveSession(chat,'awaiting_topic_hint',null);await say(chat,'نام مبحث یا مسیر دلخواه را به فارسی بنویسید؛ مثلاً «عفونی، مننژیت و انسفالیت». این متن فقط راهنماست و پیش از انتشار با ساختار سایت تطبیق داده می‌شود.');}
      return reply(200,{ok:true,command:'topic'});
    }
    const pending=await session(chat);
    if(pending.mode==='awaiting_topic_hint'&&bodyText&&!bodyText.startsWith('/')){
      const hint=clean(bodyText,300);if(!hint){await say(chat,'عنوان مبحث معتبر نیست؛ یک عبارت کوتاه فارسی بنویسید.');return reply(200,{ok:true,rejected:true});}
      await saveSession(chat,'idle',hint);await say(chat,'✅ راهنمای مبحث «'+hint+'» ذخیره شد. اکنون فایل، تصویر یا متن اصلی را بفرستید.');return reply(200,{ok:true,topicHint:true});
    }
    if(command==='/start'||command==='/help'||callbackData==='menu:help'){
      if(command==='/start')try{await telegram('setWebhook',{url:url+'/functions/v1/intmed-telegram-bot',secret_token:secret,allowed_updates:['message','callback_query'],drop_pending_updates:false,max_connections:10});}catch{}
      await say(chat,'🤖 صندوق محتوای IntMed آماده است.\nمتن، PDF، تصویر یا پیام Forwardشده را همراه توضیح بفرستید. برای پیشنهاد مبحث بنویسید: /topic cardio-ecg\nورودی ابتدا قرنطینه و فقط پس از بازبینی وارد فرایند محتوا می‌شود.\n'+(processingEnabled?'پردازش هوشمند خودکار فعال است.':'پردازش هوشمند خودکار فعلاً خاموش است؛ همهٔ ورودی‌ها محفوظ می‌مانند و به‌صورت دستی بررسی می‌شوند.')+'\n/status وضعیت صف را نشان می‌دهد.');
      return reply(200,{ok:true,command});
    }
    if(command==='/status'||callbackData==='menu:status'){
      const rows=await db('intmed_content_ingest?status=in.(quarantined,pending_review,processing,error)&select=status');
      const alerts=await db('intmed_telegram_alerts?status=in.(pending,error,processing)&select=status');
      const providerWait=await db('intmed_content_drafts?status=eq.waiting_provider&select=error_code');
      const count=name=>rows.filter(r=>r.status===name).length;
      await say(chat,'📥 صف محتوا\nحالت پردازش: '+(processingEnabled?'خودکار':'دستی؛ دریافت فایل فعال است')+'\nدر صف تحلیل یا بازبینی: '+(count('quarantined')+count('pending_review'))+'\nمنتظر سرویس تحلیل: '+providerWait.length+'\nدر حال پردازش: '+count('processing')+'\nنیازمند بررسی خطای واقعی: '+count('error')+'\nاعلان ارسال‌نشده: '+alerts.length);
      return reply(200,{ok:true,command});
    }
    if(command==='/retry'||callbackData==='queue:retry'){
      if(!processingEnabled){await say(chat,'🧾 پردازش خودکار فعلاً خاموش است. ورودی‌های شما محفوظ‌اند و دریافت متن، PDF، تصویر و Forward همچنان فعال است. برای پردازش، فایل را از صندوق خصوصی در اختیار هماهنگ‌کننده قرار دهید.');return reply(200,{ok:true,command:'retry',queued:0,manual:true});}
      const drafts=await db('intmed_content_drafts?status=in.(error,waiting_provider)&error_code=in.(provider_429,provider_rate_limited,provider_quota,provider_unavailable,provider_not_configured)&select=ingest_id&limit=30');
      for(const draft of drafts){await db('intmed_content_drafts?ingest_id=eq.'+draft.ingest_id,'PATCH',{status:'waiting_provider',error_code:'provider_rate_limited',updated_at:new Date().toISOString()},{Prefer:'return=minimal'});await db('intmed_content_ingest?id=eq.'+draft.ingest_id,'PATCH',{status:'pending_review',error_code:'provider_rate_limited',updated_at:new Date().toISOString()},{Prefer:'return=minimal'});}
      if(drafts.length)kickWorker();
      await say(chat,drafts.length?'🔄 '+drafts.length+' ورودی متوقف‌شده بر اثر محدودیت موقت سرویس، دوباره وارد صف شد.':'موردی با خطای محدودیت موقت برای تلاش دوباره وجود ندارد.');
      return reply(200,{ok:true,command:'retry',queued:drafts.length});
    }
    const existing=await db('intmed_content_ingest?telegram_update_id=eq.'+updateId+'&select=id,status');
    if(existing.length)return reply(200,{ok:true,duplicate:true});
    const recent=await db('intmed_content_ingest?status=in.(quarantined,pending_review,processing)&select=id&limit=31');
    if(recent.length>=30){await say(chat,'⏳ اکنون ۳۰ ورودی فعال در صف است. برای حفظ پایداری پردازش، پس از کم‌شدن صف ادامه دهید؛ فایل‌های ثبت‌شده از بین نرفته‌اند.');return reply(200,{ok:true,rateLimited:true});}
    const origin=forwarded(message),originFields={is_forwarded:!!origin,source_type:origin?.source_type||null,source_name:origin?.source_name||null,source_username:origin?.source_username||null,source_message_id:origin?.source_message_id||null,source_date:origin?.source_date||null};
    const photos=Array.isArray(message.photo)?message.photo:[],photo=photos[photos.length-1],document=message.document;
    let file,kind,mime,filename,size;
    if(document){file=document;mime=String(document.mime_type||'');kind=mime==='application/pdf'?'pdf':'image';filename=safeName(document.file_name,kind);size=Number(document.file_size||0);}
    else if(photo){file=photo;kind='image';mime='image/jpeg';filename=safeName('telegram-'+message.message_id+'.jpg',kind);size=Number(photo.file_size||0);}
    else if(bodyText){
      const content=bodyText.slice(0,12000),bytes=new TextEncoder().encode(content);
      if(!bytes.length||bytes.length>65536){await say(chat,'⛔ متن برای صندوق محتوا بیش از حد طولانی است.');return reply(200,{ok:true,rejected:true});}
      const id=crypto.randomUUID(),hint=topicHint(content);
      await db('intmed_content_ingest','POST',{id,telegram_update_id:updateId,telegram_chat_id:chat,telegram_message_id:Number(message.message_id),telegram_file_id:null,telegram_file_unique_id:null,kind:'text',original_filename:null,mime_type:'text/plain',byte_size:bytes.length,storage_path:null,sha256:hex(await crypto.subtle.digest('SHA-256',bytes)),content_text:content,caption:null,suggested_topic_id:hint,status:'pending_review',...originFields},{Prefer:'return=minimal'});
      const freeHint=await attachHint(id,chat);
      kickWorker();
      await say(chat,'✅ متن'+(origin?' فورواردشده':'')+' در صف بازبینی ثبت شد.\nشناسه: '+id.slice(0,8)+(freeHint?'\nراهنمای فارسی: '+freeHint:hint?'\nمبحث پیشنهادی: '+hint:'')+'\nانتشار فقط پس از بازبینی انجام می‌شود.');
      return reply(200,{ok:true,queued:true,id,kind:'text'});
    }else{await say(chat,'فقط متن، PDF یا تصویر JPEG/PNG/WebP پذیرفته می‌شود.');return reply(200,{ok:true,ignored:true});}
    const allowedTypes=['application/pdf','image/jpeg','image/png','image/webp'];
    if(!allowedTypes.includes(mime)||!Number.isSafeInteger(size)||size<1||size>20971520){await say(chat,'⛔ نوع فایل مجاز نیست یا حجم آن از ۲۰ مگابایت بیشتر است.');return reply(200,{ok:true,rejected:true});}
    const id=crypto.randomUUID(),extension=mime==='application/pdf'?'.pdf':mime==='image/png'?'.png':mime==='image/webp'?'.webp':'.jpg';
    const path=new Date().toISOString().slice(0,10)+'/'+id+extension,caption=String(message.caption||'').slice(0,2000),hint=topicHint(bodyText);
    await db('intmed_content_ingest','POST',{id,telegram_update_id:updateId,telegram_chat_id:chat,telegram_message_id:Number(message.message_id),telegram_file_id:String(file.file_id),telegram_file_unique_id:file.file_unique_id?String(file.file_unique_id):null,kind,original_filename:filename,mime_type:mime,byte_size:size,storage_path:path,caption:caption||null,content_text:null,suggested_topic_id:hint,status:'quarantined',...originFields},{Prefer:'return=minimal'});
    try{
      const remote=await telegram('getFile',{file_id:file.file_id}),filePath=String(remote.file_path||'');
      if(!/^[A-Za-z0-9_./-]{1,240}$/.test(filePath)||filePath.includes('..'))throw Error('path');
      const downloaded=await fetch('https://api.telegram.org/file/bot'+token+'/'+filePath,{redirect:'error'});if(!downloaded.ok)throw Error('download');
      const length=Number(downloaded.headers.get('content-length')||size);if(length>20971520)throw Error('large');
      const bytes=new Uint8Array(await downloaded.arrayBuffer());if(!bytes.length||bytes.length>20971520||Math.abs(bytes.length-size)>1024)throw Error('size');
      if(!signature(bytes,mime))throw Error('signature');
      const digest=hex(await crypto.subtle.digest('SHA-256',bytes));
      const stored=await fetch(url+'/storage/v1/object/intmed-content-inbox/'+path,{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':mime,'x-upsert':'false'},body:bytes});if(!stored.ok)throw Error('storage');
      await db('intmed_content_ingest?id=eq.'+id,'PATCH',{sha256:digest,status:'pending_review',updated_at:new Date().toISOString()},{Prefer:'return=minimal'});
      const freeHint=await attachHint(id,chat);
      kickWorker();
      await say(chat,'✅ فایل'+(origin?' فورواردشده':'')+' دریافت و قرنطینه شد.\nشناسه: '+id.slice(0,8)+(freeHint?'\nراهنمای فارسی: '+freeHint:hint?'\nمبحث پیشنهادی: '+hint:'\nبرای تعیین مسیر فارسی، دکمه «تعیین مبحث» را پیش از ارسال فایل بزنید.')+'\nانتشار فقط پس از بازبینی انجام می‌شود.');
      return reply(200,{ok:true,queued:true,id,kind});
    }catch{
      await db('intmed_content_ingest?id=eq.'+id,'PATCH',{status:'error',error_code:'ingest_failed',updated_at:new Date().toISOString()},{Prefer:'return=minimal'});
      await say(chat,'⚠️ دریافت فایل کامل نشد. رکورد خطا برای بررسی ثبت شد؛ لطفاً فعلاً فایل را تکراری نفرستید.');return reply(200,{ok:true,queued:false});
    }
  }catch{return reply(200,{ok:false});}
});
