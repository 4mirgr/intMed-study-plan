// Admin review API for locally generated content drafts. Publishing only queues an explicitly
// approved draft; the owner-operated runner performs canonical integration, tests and git push.
const allowedOrigins=new Set(['https://drgerami-md.ir','https://www.drgerami-md.ir','http://localhost:8765','http://127.0.0.1:8765']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const topic=/^[a-z0-9][a-z0-9-]{1,79}$/;
const categoryId=/^[a-z0-9][a-z0-9-]{0,39}$/;
const visualKinds=new Set(['image','pbs','algorithm','table','tracing','radiology','pathology','clinical','chart']);
const targetKinds=new Set(['lesson',...visualKinds]);
const sourceClasses=new Set(['harrison-private','authored','open-license']);
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
  const statuses=new Set(['draft_ready','approved','publish_requested','publishing','published','publish_error','rejected','waiting_provider','processing','error']);
  let taxonomyCache:Record<string,unknown>|null=null;
  async function taxonomy(){if(taxonomyCache)return taxonomyCache;const response=await fetch(SITE+'/content/taxonomy.json',{headers:{Accept:'application/json'}});if(!response.ok)throw new Error('taxonomy_unavailable');taxonomyCache=await response.json();return taxonomyCache!;}
  async function findTopic(id:string){const data=await taxonomy(),categories=Array.isArray(data.categories)?data.categories:[];for(const category of categories){if(!object(category))continue;const found=(Array.isArray(category.topics)?category.topics:[]).find((entry:unknown)=>object(entry)&&entry.id===id);if(found&&object(found))return {id, label:clean(found.label,160),categoryId:clean(category.id,40),categoryLabel:clean(category.label,160)};}return null;}
  async function findCategory(id:string){const data=await taxonomy(),categories=Array.isArray(data.categories)?data.categories:[];const found=categories.find((entry:unknown)=>object(entry)&&entry.id===id);return found&&object(found)?{id,label:clean(found.label,160)}:null;}
  async function generatedTopicId(category:string,label:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(category+'\n'+label.normalize('NFKC')));return category+'-custom-'+Array.from(new Uint8Array(digest)).slice(0,6).map(value=>value.toString(16).padStart(2,'0')).join('');}
  try{
    if(action==='list'){
      const requested=clean(input.status||'open',30);
      const filter=requested==='all'?'':requested==='open'?'&status=in.(draft_ready,waiting_provider,processing,error,publish_error)':'&status=eq.'+encodeURIComponent(statuses.has(requested)?requested:'draft_ready');
      const rows=await db('intmed_content_drafts?select=id,ingest_id,status,topic_id,topic_confidence,title,source_summary,target_category_id,target_topic_label,target_topic_is_new,target_content_kind,target_source_class,target_rights_note,publish_requested_at,published_at,publish_error,provider,model,error_code,attempts,reviewed_at,reviewer_note,review_revision,created_at,updated_at,intmed_content_ingest(kind,original_filename,mime_type,byte_size,caption,is_forwarded,source_type,source_name)&order=updated_at.desc&limit=100'+filter);
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
    if(!['save','approve','publish','reject','reopen'].includes(action))return reply(400,{message:'عملیات ناشناخته است.'});
    const before=String(draft.status||''),revision=Number(input.revision);
    if(!Number.isInteger(revision)||revision!==Number(draft.review_revision||0))return reply(409,{message:'این پیش‌نویس در جای دیگری تغییر کرده؛ فهرست را تازه کنید.'});
    const note=clean(input.note,4000),now=new Date().toISOString();
    const patch:Record<string,unknown>={reviewed_by:user.id,reviewed_at:now,review_revision:revision+1,updated_at:now};
    if(action==='save'||action==='approve'||action==='publish'){
      const title=clean(input.title,240),summary=clean(input.sourceSummary,4000),createTopic=input.createTopic===true,targetKind=clean(input.targetKind||'lesson',30),sourceClass=clean(input.sourceClass,40),rightsNote=clean(input.rightsNote,600);
      let topicId=clean(input.topicId,80),targetCategory='',targetLabel='',targetIsNew=false;
      if(!title)return reply(400,{message:'عنوان پیش‌نویس الزامی است.'});
      if(summary.length<60)return reply(400,{message:'خلاصهٔ نکات طلایی باید یک پاراگراف مرتبط و دست‌کم ۶۰ نویسه باشد.'});
      if(!targetKinds.has(targetKind))return reply(400,{message:'نوع مقصد محتوا معتبر نیست.'});
      if(visualKinds.has(targetKind)&&(!sourceClasses.has(sourceClass)||rightsNote.length<5))return reply(400,{message:'حق استفاده و توضیح منبع/مجوز محتوای بصری را مشخص کنید.'});
      const embedded=object(draft.intmed_content_ingest)?draft.intmed_content_ingest:{};
      if(targetKind==='pbs'&&!/^image\//.test(String(embedded.mime_type||'')))return reply(400,{message:'PBS فقط برای فایل تصویری لام خون محیطی قابل انتخاب است.'});
      if(createTopic){targetCategory=clean(input.newTopicCategoryId,40);targetLabel=clean(input.newTopicLabel,160);if(!categoryId.test(targetCategory)||targetLabel.length<2)return reply(400,{message:'بخش و نام مبحث جدید معتبر نیست.'});if(!await findCategory(targetCategory))return reply(400,{message:'بخش انتخاب‌شده در taxonomy وجود ندارد.'});topicId=await generatedTopicId(targetCategory,targetLabel);targetIsNew=true;}else{if(!topicId||!topic.test(topicId))return reply(400,{message:'مبحث مقصد را از پیشنهادهای جست‌وجو انتخاب کنید.'});const existing=await findTopic(topicId);if(!existing)return reply(400,{message:'مبحث انتخاب‌شده در ساختار فعلی سایت وجود ندارد.'});targetCategory=existing.categoryId;targetLabel=existing.label;}
      patch.title=title;patch.topic_id=topicId;patch.source_summary=summary;patch.reviewer_note=note||null;patch.target_category_id=targetCategory;patch.target_topic_label=targetLabel;patch.target_topic_is_new=targetIsNew;patch.target_content_kind=targetKind;patch.target_source_class=visualKinds.has(targetKind)?sourceClass:null;patch.target_rights_note=visualKinds.has(targetKind)?rightsNote:null;
      if(action==='save')patch.status='draft_ready';
      if(action==='approve'){
        if(!topicId)return reply(400,{message:'پیش از تأیید، مبحث مقصد را انتخاب کنید.'});
        if(input.confirmMedicalReview!==true)return reply(400,{message:'تأیید بازبینی علمی الزامی است.'});
        patch.status='approved';
      }
      if(action==='publish'){
        if(!['approved','publish_error'].includes(before))return reply(409,{message:'ابتدا محتوا را برای ادغام تأیید کنید.'});
        if(input.confirmPublish!==true)return reply(400,{message:'تأیید صریح انتشار الزامی است.'});
        if(sourceClass==='harrison-private')return reply(400,{message:'تصویر خصوصی هاریسون را نمی‌توان در سایت عمومی منتشر کرد؛ ابتدا مسیر گالری خصوصی را انتخاب کنید.'});
        patch.status='publish_requested';
      }
    }else if(action==='reject'){
      if(note.length<5)return reply(400,{message:'دلیل رد را بنویسید.'});patch.status='rejected';patch.reviewer_note=note;
    }else{patch.status='draft_ready';patch.reviewer_note=note||null;}
    let saved;try{saved=await db('rpc/apply_intmed_content_review','POST',{target_draft:draftId,reviewer:user.id,expected_revision:revision,review_action:action,new_status:patch.status||before,new_title:patch.title||draft.title,new_topic:patch.topic_id===null?'':patch.topic_id||draft.topic_id||'',new_summary:patch.source_summary===undefined?draft.source_summary||'':patch.source_summary,new_note:patch.reviewer_note===undefined?draft.reviewer_note||'':patch.reviewer_note,new_category:patch.target_category_id===undefined?draft.target_category_id||'':patch.target_category_id,new_topic_label:patch.target_topic_label===undefined?draft.target_topic_label||'':patch.target_topic_label,new_topic_is_new:patch.target_topic_is_new===undefined?draft.target_topic_is_new===true:patch.target_topic_is_new,new_content_kind:patch.target_content_kind===undefined?draft.target_content_kind||'lesson':patch.target_content_kind,new_source_class:patch.target_source_class===undefined?draft.target_source_class||'':patch.target_source_class,new_rights_note:patch.target_rights_note===undefined?draft.target_rights_note||'':patch.target_rights_note});}catch(error){if(/stale review revision|draft not approved/i.test(String(error)))return reply(409,{message:'نسخه یا وضعیت پیش‌نویس تغییر کرده؛ دوباره بارگذاری کنید.'});throw error;}
    return reply(200,{ok:true,draft:saved,message:action==='publish'?'درخواست انتشار ثبت شد و Runner پس از ادغام و آزمون، نتیجه را منتشر می‌کند.':action==='approve'?'برای ادغام نهایی تأیید شد؛ هنوز عمومی نشده است.':action==='reject'?'پیش‌نویس رد شد.':'تغییرات بازبینی ذخیره شد.'});
  }catch(error){return reply(503,{message:'سرویس بازبینی پاسخ نداد.',code:clean(error instanceof Error?error.message:'review_error',160)});}
});
