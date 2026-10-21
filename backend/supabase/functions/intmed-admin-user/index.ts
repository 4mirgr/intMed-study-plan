// Admin-only account editor. Passwords are deliberately not accepted here.
const allowedOrigins = new Set(['https://drgerami-md.ir','https://www.drgerami-md.ir','http://localhost:8765','http://127.0.0.1:8765']);
const degrees = new Set(['دانشجوی پزشکی','اینترن','رزیدنت','متخصص','فلوشیپ','فوق تخصص']);

Deno.serve(async (req) => {
  const origin=req.headers.get('origin')||'';
  const cors={'Access-Control-Allow-Origin':allowedOrigins.has(origin)?origin:'https://drgerami-md.ir','Access-Control-Allow-Headers':'apikey, content-type, authorization','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Cache-Control':'no-store'};
  const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method!=='POST')return reply(405,{message:'Method not allowed'});
  if(origin&&!allowedOrigins.has(origin))return reply(403,{message:'Origin not allowed'});
  if(Number(req.headers.get('content-length')||0)>16_384)return reply(413,{message:'Request too large'});
  try{
    const url=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),anon=Deno.env.get('SUPABASE_ANON_KEY');
    if(!url||!service||!anon)return reply(503,{message:'ویرایش مدیریتی هنوز راه‌اندازی نشده است.'});
    const authorization=req.headers.get('authorization')||'';
    if(!authorization.startsWith('Bearer '))return reply(401,{message:'ورود مدیر لازم است.'});
    const current=await fetch(url+'/auth/v1/user',{headers:{apikey:anon,Authorization:authorization}});
    if(!current.ok)return reply(401,{message:'نشست مدیر معتبر نیست.'});
    const currentUser=await current.json();
    const serverHeaders={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
    const managerResponse=await fetch(url+'/rest/v1/profiles?id=eq.'+encodeURIComponent(currentUser.id)+'&select=role,approved,rejected&limit=1',{headers:{...serverHeaders,Accept:'application/vnd.pgrst.object+json'}});
    if(!managerResponse.ok)return reply(403,{message:'دسترسی مدیر تأیید نشد.'});
    const manager=await managerResponse.json();
    if(manager.role!=='admin'||manager.approved!==true||manager.rejected===true)return reply(403,{message:'دسترسی مدیر لازم است.'});

    const raw=await req.text();if(raw.length>16_384)return reply(413,{message:'Request too large'});
    const input=JSON.parse(raw);
    if(Object.prototype.hasOwnProperty.call(input,'password'))return reply(400,{message:'رمز فقط باید توسط خود کاربر تنظیم شود.'});
    const targetId=String(input.userId||'');
    const username=String(input.username||'').trim().toLowerCase();
    const email=String(input.email||'').trim().toLowerCase();
    const profile=input.profile&&typeof input.profile==='object'?input.profile:{};
    if(!/^[0-9a-f-]{36}$/i.test(targetId))return reply(400,{message:'شناسه کاربر نامعتبر است.'});
    if(!/^[a-z0-9_.-]{3,64}$/.test(username))return reply(400,{message:'نام کاربری نامعتبر است.'});
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return reply(400,{message:'ایمیل نامعتبر است.'});
    if(!String(profile.fullName||'').trim())return reply(400,{message:'نام و نام خانوادگی الزامی است.'});
    if(profile.degree&&!degrees.has(String(profile.degree)))return reply(400,{message:'مدرک تحصیلی نامعتبر است.'});
    const existing=await fetch(url+'/auth/v1/admin/users/'+encodeURIComponent(targetId),{headers:serverHeaders});
    if(!existing.ok)return reply(404,{message:'حساب کاربر پیدا نشد.'});
    const authUser=await existing.json();
    const escapeFilter=(value)=>value.replace(/[\\%_]/g,'\\$&');
    const [sameUsername,sameEmail]=await Promise.all([
      fetch(url+'/rest/v1/profiles?username=ilike.'+encodeURIComponent(escapeFilter(username))+'&select=id&limit=2',{headers:serverHeaders}),
      fetch(url+'/rest/v1/profiles?email=ilike.'+encodeURIComponent(escapeFilter(email))+'&select=id&limit=2',{headers:serverHeaders}),
    ]);
    if(!sameUsername.ok||!sameEmail.ok)return reply(503,{message:'بررسی یکتایی اطلاعات انجام نشد.'});
    const conflicts=[...await sameUsername.json(),...await sameEmail.json()].some((row)=>row.id!==targetId);
    if(conflicts)return reply(409,{message:'این نام کاربری یا ایمیل قبلاً استفاده شده است.'});
    const metadata={...(authUser.user_metadata||{}),app:'intmed',username,fullName:String(profile.fullName||'').trim(),degree:String(profile.degree||''),specialty:String(profile.specialty||''),province:String(profile.province||''),idNumber:String(profile.idNumber||''),phone:String(profile.phone||'')};
    const authUpdate=await fetch(url+'/auth/v1/admin/users/'+encodeURIComponent(targetId),{method:'PUT',headers:serverHeaders,body:JSON.stringify({email,email_confirm:true,user_metadata:metadata})});
    if(!authUpdate.ok){const body=await authUpdate.json().catch(()=>({}));return reply(authUpdate.status,{message:body.message||'ایمیل یا نام کاربری تکراری است.'});}
    const profileBody={username,email,full_name:metadata.fullName,degree:metadata.degree||null,specialty:metadata.specialty||null,province:metadata.province||null,id_number:metadata.idNumber||null,phone:metadata.phone||null,updated_at:new Date().toISOString()};
    const saved=await fetch(url+'/rest/v1/profiles?id=eq.'+encodeURIComponent(targetId),{method:'PATCH',headers:{...serverHeaders,Prefer:'return=representation'},body:JSON.stringify(profileBody)});
    if(!saved.ok){const body=await saved.json().catch(()=>({}));return reply(saved.status,{message:body.message||'ذخیره اطلاعات کاربر انجام نشد.'});}
    return reply(200,{userId:targetId,username,email,profile:{fullName:profileBody.full_name,degree:profileBody.degree||'',specialty:profileBody.specialty||'',province:profileBody.province||'',idNumber:profileBody.id_number||'',phone:profileBody.phone||'',email}});
  }catch(error){return reply(500,{message:error instanceof Error&&error.message?error.message:'ویرایش حساب انجام نشد.'});}
});
