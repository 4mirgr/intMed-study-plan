// Deploy with Verify JWT OFF: callers have not logged in. Never returns account emails.
const origins=new Set(['https://drgerami-md.ir','https://www.drgerami-md.ir','http://localhost:8765','http://127.0.0.1:8765']);
Deno.serve(async(req)=>{
 const origin=req.headers.get('origin')||'';
 const headers={'Access-Control-Allow-Origin':origins.has(origin)?origin:'https://drgerami-md.ir','Access-Control-Allow-Headers':'apikey,content-type,authorization','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin','Content-Type':'application/json','Cache-Control':'no-store'};
 const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply(405,{message:'Method not allowed'});
 if(origin&&!origins.has(origin))return reply(403,{message:'Origin not allowed'});
 try{
  const raw=await req.text();if(raw.length>6000)return reply(413,{message:'Request too large'});
  const data=JSON.parse(raw),action=data.action;
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),anon=Deno.env.get('SUPABASE_ANON_KEY');
  if(!url||!key||!anon)return reply(503,{message:'Recovery is not configured'});
  const server={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
  const identity=String(data.identity||data.email||'').trim().toLowerCase();
  if(!['recover','ticket'].includes(action)||identity.length>254)return reply(400,{message:'Invalid request'});
  const ip=(req.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim();
  for(const bucket of ['recovery-client:'+ip,'recovery-account:'+identity]){
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(bucket))),v=>v.toString(16).padStart(2,'0')).join('');
   const limited=await fetch(url+'/rest/v1/rpc/intmed_allow_login',{method:'POST',headers:server,body:JSON.stringify({bucket_key:hash})});
   if(!limited.ok)return reply(503,{message:'Service unavailable'});
   if(await limited.json()!==true)return reply(429,{message:'Please try again later'});
  }
  if(action==='ticket'){
   const full_name=String(data.fullName||'').trim(),message=String(data.message||'').trim();
   if(full_name.length<3||full_name.length>150||message.length<10||message.length>3000||!/^\S+@\S+\.\S+$/.test(identity))return reply(400,{message:'نام، ایمیل معتبر و پیام ۱۰ تا ۳۰۰۰ نویسه‌ای وارد کنید.'});
   const saved=await fetch(url+'/rest/v1/intmed_recovery_tickets',{method:'POST',headers:server,body:JSON.stringify({full_name,email:identity,message})});
   return saved.ok?reply(200,{ok:true}):reply(503,{message:'ثبت پیام انجام نشد.'});
  }
  if(!/^[a-z0-9_.-]{3,64}$/.test(identity))return reply(400,{message:'نام کاربری معتبر وارد کنید.'});
  const escaped=identity.replace(/[\\%_]/g,'\\$&');
  const lookup=await fetch(url+'/rest/v1/profiles?select=id&username=ilike.'+encodeURIComponent(escaped)+'&limit=2',{headers:server});
  if(!lookup.ok)return reply(503,{message:'Service unavailable'});
  const rows=await lookup.json();
  if(rows.length===1){
   const account=await fetch(url+'/auth/v1/admin/users/'+encodeURIComponent(rows[0].id),{headers:server});
   if(!account.ok)return reply(503,{message:'Service unavailable'});
   const user=await account.json();
   if(user.email&&user.email_confirmed_at){
    const recover=await fetch(url+'/auth/v1/recover?redirect_to='+encodeURIComponent('https://drgerami-md.ir/'),{method:'POST',headers:{apikey:anon,'Content-Type':'application/json'},body:JSON.stringify({email:user.email})});
    if(!recover.ok&&recover.status!==429)return reply(503,{message:'Service unavailable'});
   }
  }
  return reply(200,{ok:true});
 }catch{return reply(503,{message:'سرویس موقتاً در دسترس نیست.'});}
});
