// Telegram webhook: private, service-only inbox for source text, PDFs and images.
// Deploy with gateway Verify JWT OFF; Telegram's secret header is verified below.
Deno.serve(async req=>{
  const jsonHeaders={'Content-Type':'application/json','Cache-Control':'no-store'};
  const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:jsonHeaders});
  if(req.method!=='POST')return reply(405,{ok:false});
  const url=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const token=Deno.env.get('TELEGRAM_BOT_TOKEN'),secret=Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
  if(!url||!service||!token||!secret)return reply(503,{ok:false});
  function same(a,b){if(typeof a!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
  if(!same(req.headers.get('x-telegram-bot-api-secret-token')||'',secret))return reply(403,{ok:false});
  const raw=await req.text();if(raw.length>262144)return reply(413,{ok:false});
  const sh={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
  async function db(path,method='GET',body,extra={}){const r=await fetch(url+'/rest/v1/'+path,{method,headers:{...sh,...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});if(!r.ok)throw Error('db');return r.status===204?null:JSON.parse(await r.text()||'null');}
  async function telegram(method,body){const r=await fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),v=await r.json();if(!r.ok||!v.ok)throw Error('telegram');return v.result;}
  async function say(chat,text){try{await telegram('sendMessage',{chat_id:chat,text,link_preview_options:{is_disabled:true}});}catch{}}
  function kickWorker(id){
    const task=fetch(url+'/functions/v1/intmed-content-worker',{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify({ingestId:id})}).catch(()=>null);
    const runtime=globalThis.EdgeRuntime;if(runtime&&typeof runtime.waitUntil==='function')runtime.waitUntil(task);
  }
  async function configuredChat(){const rows=await db('intmed_notification_settings?key=eq.telegram&select=chat_id');return rows[0]?.chat_id?String(rows[0].chat_id):'';}
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
    const update=JSON.parse(raw),updateId=Number(update.update_id),message=update.message;
    if(!Number.isSafeInteger(updateId)||!message||message.chat?.type!=='private'||!Number.isSafeInteger(Number(message.message_id)))return reply(200,{ok:true,ignored:true});
    const chat=String(message.chat.id||''),allowed=await configuredChat();
    if(!allowed||chat!==allowed)return reply(200,{ok:true,ignored:true});
    const bodyText=String(message.text||message.caption||'').trim(),command=(String(message.text||'').trim().split(/\s+/)[0]||'').split('@')[0].toLowerCase();
    if(command==='/start'||command==='/help'){
      await say(chat,'🤖 صندوق محتوای IntMed آماده است.\nمتن، PDF، تصویر یا پیام Forwardشده را همراه توضیح بفرستید. برای پیشنهاد مبحث بنویسید: /topic cardio-ecg\nورودی ابتدا قرنطینه و فقط پس از بازبینی وارد فرایند محتوا می‌شود.\n/status وضعیت صف را نشان می‌دهد.');
      return reply(200,{ok:true,command});
    }
    if(command==='/status'){
      const rows=await db('intmed_content_ingest?status=in.(quarantined,pending_review,processing,error)&select=status');
      const count=name=>rows.filter(r=>r.status===name).length;
      await say(chat,'📥 صف محتوا\nدر انتظار بازبینی: '+(count('quarantined')+count('pending_review'))+'\nدر حال پردازش: '+count('processing')+'\nنیازمند بررسی خطا: '+count('error'));
      return reply(200,{ok:true,command});
    }
    const existing=await db('intmed_content_ingest?telegram_update_id=eq.'+updateId+'&select=id,status');
    if(existing.length)return reply(200,{ok:true,duplicate:true});
    const recent=await db('intmed_content_ingest?created_at=gte.'+encodeURIComponent(new Date(Date.now()-600000).toISOString())+'&select=id&limit=13');
    if(recent.length>=12){await say(chat,'⏳ سقف دریافت موقتاً پر شده است؛ چند دقیقه دیگر دوباره امتحان کنید.');return reply(200,{ok:true,rateLimited:true});}
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
      kickWorker(id);
      await say(chat,'✅ متن'+(origin?' فورواردشده':'')+' در صف بازبینی ثبت شد.\nشناسه: '+id.slice(0,8)+(hint?'\nمبحث پیشنهادی: '+hint:'')+'\nانتشار فقط پس از بازبینی انجام می‌شود.');
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
      kickWorker(id);
      await say(chat,'✅ فایل'+(origin?' فورواردشده':'')+' دریافت و قرنطینه شد.\nشناسه: '+id.slice(0,8)+(hint?'\nمبحث پیشنهادی: '+hint:'\nبرای پیشنهاد مبحث، /topic و شناسه مبحث را در caption بنویسید.')+'\nانتشار فقط پس از بازبینی انجام می‌شود.');
      return reply(200,{ok:true,queued:true,id,kind});
    }catch{
      await db('intmed_content_ingest?id=eq.'+id,'PATCH',{status:'error',error_code:'ingest_failed',updated_at:new Date().toISOString()},{Prefer:'return=minimal'});
      await say(chat,'⚠️ دریافت فایل کامل نشد. رکورد خطا برای بررسی ثبت شد؛ لطفاً فعلاً فایل را تکراری نفرستید.');return reply(200,{ok:true,queued:false});
    }
  }catch{return reply(200,{ok:false});}
});
