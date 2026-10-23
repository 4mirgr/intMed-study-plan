const SITE='https://drgerami-md.ir';
const allowed=[SITE,'https://www.drgerami-md.ir','http://127.0.0.1:8765','http://localhost:8765'];
const encoder=new TextEncoder();
const b64=(value:string)=>btoa(unescape(encodeURIComponent(value)));
const html=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const compact=(date:Date)=>date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
const escapeIcs=(value:string)=>value.replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Origin':allowed.includes(origin)?origin:SITE,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
 const reply=(status:number,value:unknown)=>new Response(JSON.stringify(value),{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST'||(origin&&!allowed.includes(origin)))return reply(403,{message:'Forbidden'});
 const base=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),anon=Deno.env.get('SUPABASE_ANON_KEY'),key=Deno.env.get('RESEND_API_KEY'),sender=Deno.env.get('NEWSLETTER_FROM');
 if(!base||!service||!anon||!key||!sender)return reply(503,{message:'سرویس ایمیل تقویم هنوز کامل تنظیم نشده است.'});
 const bearer=req.headers.get('authorization');if(!bearer)return reply(401,{message:'Unauthorized'});
 const authResponse=await fetch(base+'/auth/v1/user',{headers:{apikey:anon,Authorization:bearer}});if(!authResponse.ok)return reply(401,{message:'Unauthorized'});
 const user=await authResponse.json();
 if(!user.email||!user.email_confirmed_at)return reply(400,{message:'ایمیل حساب باید تأیید شده باشد.'});
 const serviceHeaders={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
 const profiles=await fetch(base+'/rest/v1/profiles?id=eq.'+encodeURIComponent(user.id)+'&select=approved,rejected',{headers:serviceHeaders}).then(r=>r.ok?r.json():[]);
 if(profiles.length!==1||!profiles[0].approved||profiles[0].rejected)return reply(403,{message:'حساب فعال نیست.'});
 let body;try{body=await req.json();}catch{return reply(400,{message:'درخواست معتبر نیست.'});}
 const planId=typeof body.planId==='string'?body.planId:'',topicId=typeof body.topicId==='string'?body.topicId:'',title=typeof body.title==='string'?body.title.trim():'',dueDate=typeof body.dueDate==='string'?body.dueDate:'',startTime=typeof body.startTime==='string'?body.startTime:'',minutes=Number(body.minutes);
 if(!/^plan:[a-f0-9-]{20,64}$/i.test(planId)||!topicId||topicId.length>160||!title||title.length>160||!/^(20\d{2})-(0[1-9]|1[0-2])-([012]\d|3[01])$/.test(dueDate)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)||!Number.isInteger(minutes)||minutes<5||minutes>720)return reply(400,{message:'اطلاعات برنامه معتبر نیست.'});
 const start=new Date(dueDate+'T'+startTime+':00+03:30');if(!Number.isFinite(start.getTime()))return reply(400,{message:'زمان برنامه معتبر نیست.'});const end=new Date(start.getTime()+minutes*60000);
 const raw=[planId,topicId,title,dueDate,startTime,minutes].join('|'),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(raw)))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const claim=await fetch(base+'/rest/v1/intmed_calendar_deliveries?on_conflict=user_id,plan_id,event_hash',{method:'POST',headers:{...serviceHeaders,Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify({user_id:user.id,plan_id:planId,event_hash:digest,status:'processing'})});
 if(!claim.ok)return reply(503,{message:'ثبت یادآوری انجام نشد.'});const claimed=await claim.json();if(!claimed.length)return reply(200,{sent:false,duplicate:true});
 const dates=compact(start)+'/'+compact(end),params=new URLSearchParams({action:'TEMPLATE',text:title,dates,details:'برنامهٔ شخصی مطالعه در IntMed',ctz:'Asia/Tehran'}),google='https://calendar.google.com/calendar/render?'+params.toString();
 const ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//IntMed//Study Plan//FA','CALSCALE:GREGORIAN','BEGIN:VEVENT','UID:'+escapeIcs(planId+'@intmed'),'DTSTAMP:'+compact(new Date()),'DTSTART:'+compact(start),'DTEND:'+compact(end),'SUMMARY:'+escapeIcs(title),'DESCRIPTION:'+escapeIcs('برنامهٔ شخصی مطالعه در IntMed'),'END:VEVENT','END:VCALENDAR',''].join('\r\n');
 const persianDate=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{timeZone:'Asia/Tehran',year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(start);
 const subject='یادآوری برنامهٔ مطالعه: '+title,emailHtml='<div dir="rtl" style="font-family:Tahoma,sans-serif;line-height:1.9"><h2>'+html(title)+'</h2><p>برنامهٔ مطالعهٔ شما برای '+html(persianDate)+' ساعت '+html(startTime)+' به مدت '+minutes+' دقیقه ثبت شد.</p><p><a href="'+html(google)+'" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#0f99a6;color:#fff;text-decoration:none">افزودن به Google Calendar</a></p><p>فایل پیوست را نیز می‌توانید در تقویم دستگاه، Apple Calendar یا Outlook باز کنید.</p></div>';
 let status='uncertain',providerId=null;
 try{const sent=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':'intmed-calendar-'+digest},body:JSON.stringify({from:sender,to:[user.email],subject,html:emailHtml,attachments:[{filename:'intmed-study.ics',content:b64(ics)}]})});const value=await sent.json();if(!sent.ok){status='error';throw Error('provider');}status='sent';providerId=value.id||null;}catch{status=status==='uncertain'?'uncertain':'error';}
 await fetch(base+'/rest/v1/intmed_calendar_deliveries?user_id=eq.'+user.id+'&plan_id=eq.'+encodeURIComponent(planId)+'&event_hash=eq.'+digest,{method:'PATCH',headers:{...serviceHeaders,Prefer:'return=minimal'},body:JSON.stringify({status,provider_id:providerId,updated_at:new Date().toISOString()})});
 return status==='sent'?reply(200,{sent:true}):reply(503,{message:'برنامه ذخیره شد، اما ارسال ایمیل ناموفق بود.'});
});

