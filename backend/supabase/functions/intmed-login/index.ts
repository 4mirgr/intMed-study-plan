// Supabase Edge Function. Server secrets stay in the Edge runtime, never in GitHub Pages.
const allowedOrigins = new Set(['https://drgerami-md.ir','https://www.drgerami-md.ir','http://localhost:8765','http://127.0.0.1:8765']);
Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  const cors = {'Access-Control-Allow-Origin':allowedOrigins.has(origin)?origin:'https://drgerami-md.ir','Access-Control-Allow-Headers':'apikey, content-type, authorization','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Cache-Control':'no-store'};
  const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method!=='POST')return reply(405,{message:'Method not allowed'});
  if(origin&&!allowedOrigins.has(origin))return reply(403,{message:'Origin not allowed'});
  if(Number(req.headers.get('content-length')||0)>8192)return reply(413,{message:'Request too large'});
  try{
    const raw=await req.text();if(raw.length>8192)return reply(413,{message:'Request too large'});
    const input=JSON.parse(raw),username=String(input.username||'').trim().toLowerCase(),password=input.password;
    const failure={message:'نام کاربری یا رمز عبور اشتباه است.'};
    if(!username||username.length>64||typeof password!=='string'||!password||password.length>4096)return reply(401,failure);
    const url=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),anon=Deno.env.get('SUPABASE_ANON_KEY');
    if(!url||!service||!anon)return reply(503,{message:'ورود با نام کاربری هنوز راه‌اندازی نشده است.'});
    const serverHeaders={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
    // One account budget across clients plus one client budget across usernames.
    const ip=(req.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim();
    for(const key of ['user:'+username,'client:'+ip]){
      const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));
      const hash=Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
      const limited=await fetch(url+'/rest/v1/rpc/intmed_allow_login',{method:'POST',headers:serverHeaders,body:JSON.stringify({bucket_key:hash})});
      if(!limited.ok)return reply(503,{message:'ورود موقتاً در دسترس نیست.'});
      if(await limited.json()!==true)return reply(429,{message:'تعداد تلاش‌ها زیاد است؛ ده دقیقه بعد دوباره امتحان کنید.'});
    }
    const escaped=username.replace(/[\\%_]/g,'\\$&');
    const lookup=await fetch(url+'/rest/v1/profiles?select=id&username=ilike.'+encodeURIComponent(escaped)+'&limit=2',{headers:serverHeaders});
    if(!lookup.ok)return reply(503,{message:'ورود موقتاً در دسترس نیست.'});
    const rows=await lookup.json();
    // Unknown and ambiguous identities use the same Auth path and generic failure.
    let email='intmed-invalid-login@invalid.example';
    if(rows.length===1){
      const account=await fetch(url+'/auth/v1/admin/users/'+encodeURIComponent(rows[0].id),{headers:serverHeaders});
      if(!account.ok)return reply(503,{message:'ورود موقتاً در دسترس نیست.'});
      email=(await account.json()).email||email;
    }
    const result=await fetch(url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:anon,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
    if(!result.ok)return reply(result.status===429?429:401,failure);
    const session=await result.json();
    if(rows.length!==1)return reply(401,failure);
    return reply(200,session);
  }catch{return reply(503,{message:'ورود موقتاً در دسترس نیست؛ دوباره تلاش کنید.'});}
});
