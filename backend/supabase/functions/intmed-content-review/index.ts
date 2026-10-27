// Admin review API for locally generated content drafts. Approval means ready for Git review;
// this function deliberately has no code path that writes the public canonical content tree.
const allowedOrigins=new Set(['https://drgerami-md.ir','https://www.drgerami-md.ir','http://localhost:8765','http://127.0.0.1:8765']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const topic=/^[a-z0-9][a-z0-9-]{1,79}$/;
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const clean=(value:unknown,limit:number)=>String(value??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,limit);
const SITE='https://drgerami-md.ir';

Deno.serve(async req=>{
  const origin=req.headers.get('origin')||'';
  const cors={'Access-Control-Allow-Origin':allowedOrigins.has(origin)?origin:'https://drgerami-md.ir','Access-Control-Allow-Headers':'apikey, content-type, authorization','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Cache-Control':'no-store'};
  const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json; charset=utf-8'}});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method!=='POST')return reply(405,{message:'Method not allowed'});
  if(origin&&!allowedOrigins.has(origin))return reply(403,{message:'Origin not allowed'});
  if(Number(req.headers.get('content-length')||0)>80_000)return reply(413,{message:'درخواست بیش از حد بزرگ است.'});
  const base=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),anon=Deno.env.get('SUPABASE_ANON_KEY');
  if(!base||!service||!anon)return reply(503,{message:'سرویس بازبینی پیکربندی نشده است.'});
  const authorization=req.headers.get('authorization')||'';
  if(!authorization.startsWith('Bearer ')||authorization==='Bearer '+service)return reply(401,{message:'ورود مدیر لازم است.'});
  const current=await fetch(base+'/auth/v1/user',{headers:{apikey:anon,Authorization:authorization}});
  if(!current.ok)return reply(401,{message:'نشست مدیر منقضی شده است.'});
  const user=await current.json();
  if(!uuid.test(String(user.id||'')))return reply(401,{message:'نشست معتبر نیست.'});
  const server={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
  async function db(path:string,method='GET',value?:unknown,headers:Record<string,string>={}){
    const response=await fetch(base+'/rest/v1/'+path,{method,headers:{...server,...headers},...(value===undefined?{}:{body:JSON.stringify(value)})});
    const text=await response.text();let parsed=null;try{parsed=text?JSON.parse(text):null;}catch{parsed=null;}
    if(!response.ok)throw new Error('database_'+response.status+':'+clean((parsed as Record<string,unknown>)?.message,120));
    return parsed;
  }
  const profiles=await db('profiles?id=eq.'+encodeURIComponent(user.id)+'&select=role,approved,rejected&limit=1') as Array<Record<string,unknown>>;
  if(profiles.length!==1||profiles[0].role!=='admin'||profiles[0].approved!==true||profiles[0].rejected===true)return reply(403,{message:'دسترسی مدیر لازم است.'});
  let input:Record<string,unknown>;try{input=await req.json();}catch{return reply(400,{message:'درخواست نامعتبر است.'});}
  if(!object(input))return reply(400,{message:'درخواست نامعتبر است.'});
  const action=clean(input.action||'list',30),draftId=clean(input.draftId,40);
  const statuses=new Set(['draft_ready','approved','rejected','waiting_provider','processing','error']);
  async function knownTopic(id:string){
    if(!id)return true;const response=await fetch(SITE+'/content/taxonomy.json',{headers:{Accept:'application/json'}});if(!response.ok)throw new Error('taxonomy_unavailable');
    const data=await response.json();return (data.categories||[]).some((category:Record<string,unknown>)=>(Array.isArray(category.topics)?category.topics:[]).some((entry:Record<string,unknown>)=>entry.id===id));
  }
  try{
    if(action==='list'){
      const requested=clean(input.status||'open',30);
      const filter=requested==='all'?'':requested==='open'?'&status=in.(draft_ready,waiting_provider,processing,error)':'&status=eq.'+encodeURIComponent(statuses.has(requested)?requested:'draft_ready');
      const rows=await db('intmed_content_drafts?select=id,ingest_id,status,topic_id,topic_confidence,title,source_summary,provider,model,error_code,attempts,reviewed_at,reviewer_note,review_revision,created_at,updated_at,intmed_content_ingest(kind,original_filename,mime_type,byte_size,caption,is_forwarded,source_type,source_name)&order=updated_at.desc&limit=100'+filter);
      const all=await db('intmed_content_drafts?select=status');
      const counts:Record<string,number>={};for(const row of all as Array<Record<string,unknown>>){const key=String(row.status||'unknown');counts[key]=(counts[key]||0)+1;}
      return reply(200,{items:rows,counts});
    }
    if(!uuid.test(draftId))return reply(400,{message:'شناسهٔ پیش‌نویس نامعتبر است.'});
    const rows=await db('intmed_content_drafts?id=eq.'+draftId+'&select=*,intmed_content_ingest(*),intmed_content_review_events(action,status_before,status_after,note,created_at)&intmed_content_review_events.order=created_at.desc&limit=1') as Array<Record<string,unknown>>;
    const draft=rows[0];if(!draft)return reply(404,{message:'پیش‌نویس پیدا نشد.'});
    if(action==='detail'){
      const ingest=object(draft.intmed_content_ingest)?draft.intmed_content_ingest:{};
      let sourceUrl:string|null=null;const path=clean(ingest.storage_path,600);
      if(path){
        const signed=await fetch(base+'/storage/v1/object/sign/intmed-content-inbox/'+path.split('/').map(encodeURIComponent).join('/'),{method:'POST',headers:server,body:JSON.stringify({expiresIn:900})});
        if(signed.ok){const value=await signed.json(),relative=String(value.signedURL||value.signedUrl||'');sourceUrl=relative.startsWith('http')?relative:base+'/storage/v1'+(relative.startsWith('/')?'':'/')+relative;}
      }
      return reply(200,{draft,sourceUrl});
    }
    if(!['save','approve','reject','reopen'].includes(action))return reply(400,{message:'عملیات ناشناخته است.'});
    const before=String(draft.status||''),revision=Number(input.revision);
    if(!Number.isInteger(revision)||revision!==Number(draft.review_revision||0))return reply(409,{message:'این پیش‌نویس در جای دیگری تغییر کرده؛ فهرست را تازه کنید.'});
    const note=clean(input.note,4000),now=new Date().toISOString();
    const patch:Record<string,unknown>={reviewed_by:user.id,reviewed_at:now,review_revision:revision+1,updated_at:now};
    if(action==='save'||action==='approve'){
      const title=clean(input.title,240),topicId=clean(input.topicId,80),summary=clean(input.sourceSummary,4000);
      if(!title)return reply(400,{message:'عنوان پیش‌نویس الزامی است.'});
      if(topicId&&!topic.test(topicId))return reply(400,{message:'شناسهٔ مبحث معتبر نیست.'});
      if(topicId&&!await knownTopic(topicId))return reply(400,{message:'مبحث انتخاب‌شده در ساختار فعلی سایت وجود ندارد.'});
      patch.title=title;patch.topic_id=topicId||null;patch.source_summary=summary;patch.reviewer_note=note||null;
      if(action==='save')patch.status='draft_ready';
      if(action==='approve'){
        if(!topicId)return reply(400,{message:'پیش از تأیید، مبحث مقصد را انتخاب کنید.'});
        if(input.confirmMedicalReview!==true)return reply(400,{message:'تأیید بازبینی علمی الزامی است.'});
        patch.status='approved';
      }
    }else if(action==='reject'){
      if(note.length<5)return reply(400,{message:'دلیل رد را بنویسید.'});patch.status='rejected';patch.reviewer_note=note;
    }else{patch.status='draft_ready';patch.reviewer_note=note||null;}
    let saved;try{saved=await db('rpc/apply_intmed_content_review','POST',{target_draft:draftId,reviewer:user.id,expected_revision:revision,review_action:action,new_status:patch.status||before,new_title:patch.title||draft.title,new_topic:patch.topic_id===null?'':patch.topic_id||draft.topic_id||'',new_summary:patch.source_summary===undefined?draft.source_summary||'':patch.source_summary,new_note:patch.reviewer_note===undefined?draft.reviewer_note||'':patch.reviewer_note});}catch(error){if(/stale review revision/i.test(String(error)))return reply(409,{message:'نسخهٔ پیش‌نویس تغییر کرده؛ دوباره بارگذاری کنید.'});throw error;}
    return reply(200,{ok:true,draft:saved,message:action==='approve'?'برای ادغام نهایی تأیید شد؛ هنوز عمومی نشده است.':action==='reject'?'پیش‌نویس رد شد.':'تغییرات بازبینی ذخیره شد.'});
  }catch(error){return reply(503,{message:'سرویس بازبینی پاسخ نداد.',code:clean(error instanceof Error?error.message:'review_error',160)});}
});
