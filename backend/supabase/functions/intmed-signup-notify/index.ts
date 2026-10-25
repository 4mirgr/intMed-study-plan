// Deploy with Verify JWT enabled. Bot token is an Edge secret, never browser code.
Deno.serve(async req=>{
  const origin=req.headers.get('origin')||'',allowed=['https://drgerami-md.ir','https://www.drgerami-md.ir','http://127.0.0.1:8765','http://localhost:8765'];
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Origin':allowed.includes(origin)?origin:allowed[0],'Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST'||(origin&&!allowed.includes(origin)))return reply(403,{message:'Forbidden'});
  const url=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),anon=Deno.env.get('SUPABASE_ANON_KEY'),token=Deno.env.get('TELEGRAM_BOT_TOKEN'),webhookSecret=Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
  if(!url||!service||!anon)return reply(503,{message:'Server configuration missing'});
  const sh={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
  async function db(path,method='GET',body,extra={}){const r=await fetch(url+'/rest/v1/'+path,{method,headers:{...sh,...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});if(!r.ok)throw Error('Database operation failed');return r.status===204?null:JSON.parse(await r.text()||'null');}
  async function telegram(method,body){if(!token)throw Error('Telegram token missing');const r=await fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const value=await r.json();if(!r.ok||!value.ok)throw Error('Telegram delivery failed');return value.result;}
  async function admin(){const bearer=req.headers.get('authorization');if(!bearer)return false;const r=await fetch(url+'/auth/v1/user',{headers:{apikey:anon,Authorization:bearer}});if(!r.ok)return false;const user=await r.json();const rows=await db('profiles?id=eq.'+encodeURIComponent(user.id)+'&select=role,approved,rejected');return rows.length===1&&rows[0].role==='admin'&&rows[0].approved&&!rows[0].rejected;}
  async function setting(){const rows=await db('intmed_notification_settings?key=eq.telegram&select=chat_id');return rows[0]&&rows[0].chat_id;}
  const inboxUrl=()=>url+'/functions/v1/intmed-telegram-bot';
  async function webhookInfo(){if(!token)return null;const value=await telegram('getWebhookInfo',{});return {active:value?.url===inboxUrl(),pending:Number(value?.pending_update_count||0)};}
  async function enableInbox(){if(!webhookSecret)throw Error('Telegram webhook secret missing');await telegram('setWebhook',{url:inboxUrl(),secret_token:webhookSecret,allowed_updates:['message'],drop_pending_updates:false,max_connections:10});}
  async function deliver(id){
    const profiles=await db('profiles?id=eq.'+encodeURIComponent(id)+'&select=id,username,approved,rejected');
    if(profiles.length!==1||profiles[0].rejected){await db('intmed_signup_alerts?user_id=eq.'+encodeURIComponent(id),'PATCH',{status:'dismissed',updated_at:new Date().toISOString()},{Prefer:'return=minimal'});return {skipped:true};}
    const auth=await fetch(url+'/auth/v1/admin/users/'+encodeURIComponent(id),{headers:sh});if(!auth.ok)throw Error('Identity check failed');
    if((await auth.json()).user_metadata?.app!=='intmed')return {skipped:true};
    const chat=await setting();if(!token||!chat)throw Error('Telegram is not connected');
    const claimed=await db('rpc/claim_intmed_signup_alert','POST',{target_user:id});if(!claimed)return {skipped:true};
    try{
      await telegram('sendMessage',{chat_id:chat,text:'🔔 درخواست عضویت جدید در IntMed\nنام کاربری: '+profiles[0].username+'\nبرای بررسی و تأیید وارد پنل مدیریت شوید:\nhttps://drgerami-md.ir',link_preview_options:{is_disabled:true}});
      await db('intmed_signup_alerts?user_id=eq.'+encodeURIComponent(id),'PATCH',{status:'sent',updated_at:new Date().toISOString()},{Prefer:'return=minimal'});return {sent:true};
    }catch{
      await db('intmed_signup_alerts?user_id=eq.'+encodeURIComponent(id),'PATCH',{status:'error',updated_at:new Date().toISOString()},{Prefer:'return=minimal'});throw Error('Delivery failed; retry is available');
    }
  }
  try{
    const raw=await req.text();if(raw.length>8192)return reply(413,{message:'Request too large'});const body=JSON.parse(raw);
    if(body.action){
      if(!await admin())return reply(403,{message:'Admin required'});
      if(body.action==='status'){const alerts=await db('intmed_signup_alerts?select=status'),hook=await webhookInfo();return reply(200,{tokenConfigured:!!token,inboxConfigured:!!token&&!!webhookSecret,webhookActive:!!hook?.active,webhookPending:hook?.pending||0,connected:!!await setting(),pending:alerts.filter(r=>r.status!=='sent'&&r.status!=='dismissed').length});}
      if(body.action==='discover'){
        const hook=await webhookInfo();
        // Telegram forbids getUpdates while a webhook is active. An authenticated admin may
        // pause the inbox without dropping updates, discover the pending /start chat, then the
        // connect action below restores the webhook automatically.
        if(hook?.active)await telegram('deleteWebhook',{drop_pending_updates:false});
        const updates=await telegram('getUpdates',{timeout:0,allowed_updates:['message']});const chats=new Map();updates.forEach(u=>{const c=u.message?.chat;if(c&&c.type==='private')chats.set(String(c.id),{id:String(c.id),name:[c.first_name,c.last_name].filter(Boolean).join(' ')||c.username||String(c.id)});});return reply(200,{chats:[...chats.values()]});
      }
      if(body.action==='connect'){
        const updates=await telegram('getUpdates',{timeout:0,allowed_updates:['message']});const chat=updates.map(u=>u.message?.chat).find(c=>c&&c.type==='private'&&String(c.id)===String(body.chatId));if(!chat)return reply(400,{message:'ابتدا در گفت‌وگوی بات Start را بزنید و چت خودتان را انتخاب کنید.'});
        await db('intmed_notification_settings?key=eq.telegram','PATCH',{chat_id:String(chat.id)},{Prefer:'return=minimal'});
        if(webhookSecret)await enableInbox();
        return reply(200,{connected:true,webhookActive:!!webhookSecret});
      }
      if(body.action==='test'){const chat=await setting();if(!chat)return reply(400,{message:'تلگرام هنوز متصل نیست.'});await telegram('sendMessage',{chat_id:chat,text:'✅ اعلان‌های IntMed به تلگرام شما متصل است.'});return reply(200,{sent:true});}
      if(body.action==='webhook'){
        if(!await setting())return reply(400,{message:'ابتدا گفت‌وگوی مدیر را متصل کنید.'});
        if(!webhookSecret)return reply(503,{message:'Secret دریافت امن فایل هنوز تنظیم نشده است.'});
        await enableInbox();
        return reply(200,{configured:true});
      }
      if(body.action==='retry'){const alerts=await db('intmed_signup_alerts?status=in.(pending,error,processing)&select=user_id&limit=10');let sent=0;for(const alert of alerts){try{if((await deliver(alert.user_id)).sent)sent++;}catch{}}return reply(200,{sent});}
      return reply(400,{message:'Unknown action'});
    }
    // A webhook is only a hint. Validate actual database/Auth records before delivery.
    if(body.type!=='INSERT'||body.table!=='profiles'||body.schema!=='public'||!/^[a-f0-9-]{36}$/i.test(body.record?.id||''))return reply(400,{message:'Invalid event'});
    return reply(200,await deliver(body.record.id));
  }catch{return reply(503,{message:'اتصال اعلان آماده نیست یا ارسال ناموفق بود؛ تنظیمات بات را بررسی کنید.'});}
});
