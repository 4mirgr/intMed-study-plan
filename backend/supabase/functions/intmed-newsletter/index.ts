// Verify JWT OFF only because signed unsubscribe links are public.
// Every status/preview/send request validates its Auth JWT and active admin profile here.
const SITE='https://drgerami-md.ir';
const allowed=[SITE,'https://www.drgerami-md.ir','http://127.0.0.1:8765','http://localhost:8765'];
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const encoder=new TextEncoder();
const encode=(value)=>btoa(String.fromCharCode(...value)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const decode=(value)=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'',url=new URL(req.url);
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Origin':allowed.includes(origin)?origin:SITE,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,GET,OPTIONS'};
 const reply=(status,value)=>new Response(JSON.stringify(value),{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 const base=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),anon=Deno.env.get('SUPABASE_ANON_KEY'),key=Deno.env.get('RESEND_API_KEY'),sender=Deno.env.get('NEWSLETTER_FROM'),secret=Deno.env.get('NEWSLETTER_SIGNING_SECRET');
 if(!base||!service||!anon)return reply(503,{message:'پیکربندی سرور کامل نیست.'});
 const sh={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
 async function db(path,method='GET',body,extra={}){const r=await fetch(base+'/rest/v1/'+path,{method,headers:{...sh,...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});if(!r.ok)throw Error('database');return r.status===204?null:JSON.parse(await r.text()||'null');}
 async function signingKey(){if(!secret||secret.length<32)throw Error('signing');return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
 async function tokenFor(id,email){const payload=encode(encoder.encode(JSON.stringify({id,email,exp:Math.floor(Date.now()/1000)+180*86400})));return payload+'.'+encode(new Uint8Array(await crypto.subtle.sign('HMAC',await signingKey(),encoder.encode(payload))));}
 async function verifyToken(token){try{if(token.length>2048)return null;const [payload,signature,...rest]=token.split('.');if(rest.length||!signature)return null;if(!await crypto.subtle.verify('HMAC',await signingKey(),decode(signature),encoder.encode(payload)))return null;const data=JSON.parse(new TextDecoder().decode(decode(payload)));return uuid.test(data.id)&&typeof data.email==='string'&&data.exp>Date.now()/1000?data:null;}catch{return null;}}
 try{
  if(req.method!=='POST'||(origin&&!allowed.includes(origin)))return reply(403,{message:'Forbidden'});
  const body=await req.json();
  // The public confirmation page lives on SITE. GET never changes consent.
  if(body.action==='unsubscribe'){
   const signed=await verifyToken(typeof body.token==='string'?body.token:'');if(!signed)return reply(400,{message:'لینک معتبر نیست یا منقضی شده است.'});
   for(let attempt=0;attempt<4;attempt++){
    const rows=await db('study_state?user_id=eq.'+signed.id+'&select=state,updated_at');if(!rows.length)return reply(200,{message:'عضویت غیرفعال است.'});const row=rows[0],state=row.state||{},sub=(state.itemState||{})['newsletter:subscription'];
    if(!sub||sub.email!==signed.email||!sub.subscribed)return reply(200,{message:'عضویت غیرفعال است.'});
    const patched={...state,itemState:{...(state.itemState||{}),'newsletter:subscription':{...sub,subscribed:false,updatedAt:new Date().toISOString()}}};
    const saved=await db('study_state?user_id=eq.'+signed.id+'&updated_at=eq.'+encodeURIComponent(row.updated_at),'PATCH',{state:patched,updated_at:new Date(Math.max(Date.now(),Date.parse(row.updated_at)+1)).toISOString()},{Prefer:'return=representation'});if(saved.length)return reply(200,{message:'دریافت خبرنامه لغو شد. یادداشت‌ها و هایلایت‌های شما حفظ شده‌اند.'});
   }return reply(409,{message:'ذخیره انجام نشد؛ لطفاً دوباره تلاش کنید.'});
  }
  const bearer=req.headers.get('authorization');if(!bearer)return reply(401,{message:'Unauthorized'});
  const auth=await fetch(base+'/auth/v1/user',{headers:{apikey:anon,Authorization:bearer}});if(!auth.ok)return reply(401,{message:'Unauthorized'});const user=await auth.json();
  const admins=await db('profiles?id=eq.'+encodeURIComponent(user.id)+'&select=role,approved,rejected');if(admins.length!==1||admins[0].role!=='admin'||!admins[0].approved||admins[0].rejected)return reply(403,{message:'Forbidden'});
  if(body.action==='status'){let installed=true;try{await db('intmed_newsletter_deliveries?select=campaign_id&limit=1');}catch{installed=false;}return reply(200,{configured:!!key&&!!sender&&!!secret&&secret.length>=32&&installed,provider:!!key,sender:!!sender,signing:!!secret&&secret.length>=32,installed});}
  if(!['preview','send','test'].includes(body.action))return reply(400,{message:'Unknown action'});
  const subject=typeof body.subject==='string'?body.subject.trim():'',text=typeof body.text==='string'?body.text.trim():'';
  if(!subject||subject.length>160||/[\r\n]/.test(subject)||!text||text.length>12000)return reply(400,{message:'عنوان و متن معتبر وارد کنید.'});
  const digest=encode(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(subject+'\n'+text))));
  async function recipients(){let offset=0,rows=[];while(true){const part=await db('profiles?approved=eq.true&rejected=eq.false&select=id,email&order=id&limit=500&offset='+offset);rows.push(...part);if(part.length<500)break;offset+=500;}const result=[];for(let i=0;i<rows.length;i+=100){const group=rows.slice(i,i+100),states=await db('study_state?user_id=in.('+group.map(p=>p.id).join(',')+')&select=user_id,state');for(const row of states){const p=group.find(p=>p.id===row.user_id),sub=row.state?.itemState?.['newsletter:subscription'];if(sub?.subscribed===true&&sub.email===p.email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email))result.push(p);}}return result;}
  const members=await recipients();
  if(body.action==='preview')return reply(200,{recipients:members.length,subject,text});
  if(!key||!sender||!secret||secret.length<32)return reply(503,{message:'ابتدا سرویس ارسال و کلید امضای لغو عضویت را تنظیم کنید.'});
  async function confirmed(member){const r=await fetch(base+'/auth/v1/admin/users/'+member.id,{headers:sh});if(!r.ok)return false;const auth=await r.json();return !!auth.email_confirmed_at&&String(auth.email||'').toLowerCase()===String(member.email||'').toLowerCase();}
  async function send(member,idempotency){const link=SITE+'/newsletter.html#token='+encodeURIComponent(await tokenFor(member.id,member.email));return fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':idempotency},body:JSON.stringify({from:sender,to:[member.email],subject:body.action==='test'?'[آزمایشی] '+subject:subject,text:text+'\n\nIntMed — '+SITE+'\nلغو عضویت: '+link})});}
  if(body.action==='test'){const own=await db('profiles?id=eq.'+user.id+'&select=id,email');if(!own[0]?.email||!await confirmed(own[0]))return reply(400,{message:'ایمیل تأییدشدهٔ مدیر لازم است.'});const r=await send(own[0],'intmed-test-'+crypto.randomUUID());if(!r.ok)return reply(503,{message:'ارسال آزمایشی موفق نشد؛ دامنه و فرستنده را بررسی کنید.'});return reply(200,{sent:1});}
  if(!uuid.test(body.campaignId||''))return reply(400,{message:'Invalid campaign'});
  let logs=[],logOffset=0;while(true){const part=await db('intmed_newsletter_deliveries?campaign_id=eq.'+body.campaignId+'&select=user_id,status,body_hash&limit=500&offset='+logOffset);logs.push(...part);if(part.length<500)break;logOffset+=500;}if(logs.some(log=>log.body_hash!==digest))return reply(409,{message:'متن این نوبت ارسال تغییر کرده است؛ یک خبرنامهٔ جدید بسازید.'});
  const known=new Set(logs.map(log=>log.user_id)),pending=members.filter(p=>!known.has(p.id)),batch=pending.slice(0,20);let sent=0,failed=0;
  for(const member of batch){
   // Re-read consent/profile immediately before each individual send.
   const fresh=await db('study_state?user_id=eq.'+member.id+'&select=state'),profile=await db('profiles?id=eq.'+member.id+'&select=email,approved,rejected'),sub=fresh[0]?.state?.itemState?.['newsletter:subscription'];
   if(!profile[0]?.approved||profile[0].rejected||profile[0].email!==member.email||!sub?.subscribed||sub.email!==member.email||!await confirmed(member))continue;
   const claimed=await db('intmed_newsletter_deliveries?on_conflict=campaign_id,user_id','POST',{campaign_id:body.campaignId,user_id:member.id,subject,body_hash:digest,status:'processing'},{Prefer:'resolution=ignore-duplicates,return=representation'});if(!claimed.length)continue;
   let status='uncertain',providerId=null;try{const r=await send(member,'intmed-'+body.campaignId+'-'+member.id);const value=await r.json();if(r.ok){status='sent';providerId=value.id;sent++;}else{status='error';failed++;}}catch{failed++;}
   await new Promise(resolve=>setTimeout(resolve,600));
   await db('intmed_newsletter_deliveries?campaign_id=eq.'+body.campaignId+'&user_id=eq.'+member.id,'PATCH',{status,provider_id:providerId,updated_at:new Date().toISOString()},{Prefer:'return=minimal'});
  }
  return reply(200,{sent,failed,remaining:Math.max(0,pending.length-batch.length),message:'ارسال نامطمئن یا ناموفق خودکار تکرار نمی‌شود؛ وضعیت را در سرویس ایمیل بررسی کنید.'});
 }catch{return reply(503,{message:'خبرنامه آماده نیست یا عملیات انجام نشد؛ تنظیمات سرور را بررسی کنید.'});}
});
