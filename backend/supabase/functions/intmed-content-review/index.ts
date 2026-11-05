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
const SITE='https://drgerami-md.ir/intmed';

// Only teaching fields are editable. Provenance, source evidence and pipeline metadata
// are copied from the stored original, never accepted from the browser.
function editArtifacts(input:unknown,previous:Record<string,unknown>){
  if(!object(input))throw Error('artifacts_invalid');
  const fields=['lessonDrafts','flashcardDrafts','mcqDrafts','kfDrafts'];
  if(Object.keys(input).some(key=>!fields.includes(key)))throw Error('artifacts_field');
  const text=(value:unknown,max=12000)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw Error('artifacts_text');return value.trim();};
  const strings=(value:unknown,min:number,max:number)=>{if(!Array.isArray(value)||value.length<min||value.length>max)throw Error('artifacts_array');return value.map(item=>text(item));};
  const result={...previous};
  for(const field of fields){
    if(!(field in input))continue;
    const changes=input[field],old=Array.isArray(previous[field])?previous[field] as unknown[]:[];
    if(!Array.isArray(changes)||changes.length>500)throw Error('artifacts_array');
    const seen=new Set<number>();
    result[field]=changes.map(change=>{
      if(!object(change)||!Number.isInteger(change.index)||Number(change.index)<0||Number(change.index)>=old.length||seen.has(Number(change.index))||!object(change.value))throw Error('artifacts_index');
      const index=Number(change.index);seen.add(index);
      const original=old[index];if(!object(original))throw Error('artifacts_original');
      const value=change.value;let editable:Record<string,unknown>;
      if(field==='lessonDrafts')editable={heading:text(value.heading,240),paragraphs:strings(value.paragraphs,1,100),keyPoints:strings(value.keyPoints,0,50)};
      else if(field==='flashcardDrafts')editable={front:text(value.front),back:text(value.back),tags:strings(value.tags,0,20)};
      else if(field==='mcqDrafts'){
        if(!Number.isInteger(value.correctIndex)||Number(value.correctIndex)<0||Number(value.correctIndex)>3)throw Error('artifacts_answer');
        const options=strings(value.options,4,4);
        if(new Set(options.map(option=>option.normalize('NFKC').replace(/\s+/g,' ').toLocaleLowerCase('fa'))).size!==4)throw Error('artifacts_duplicate_options');
        editable={stem:text(value.stem),options,correctIndex:value.correctIndex,explanation:text(value.explanation)};
        if(Array.isArray(original.optionExplanations))editable.optionExplanations=strings(value.optionExplanations,4,4);
      }else editable={prompt:text(value.prompt),expectedAnswer:text(value.expectedAnswer)};
      return {...original,...editable,reviewStatus:'draft'};
    });
  }
  return result;
}

Deno.serve(async req=>{
  const origin=req.headers.get('origin')||'';
  const cors={'Access-Control-Allow-Origin':allowedOrigins.has(origin)?origin:'https://drgerami-md.ir','Access-Control-Allow-Headers':'apikey, content-type, authorization','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Cache-Control':'no-store'};
  const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json; charset=utf-8'}});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method!=='POST')return reply(405,{message:'Method not allowed'});
  if(origin&&!allowedOrigins.has(origin))return reply(403,{message:'Origin not allowed'});
  if(Number(req.headers.get('content-length')||0)>1_000_000)return reply(413,{message:'درخواست بیش از حد بزرگ است.'});
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
  if(new TextEncoder().encode(JSON.stringify(input)).length>1_000_000)return reply(413,{message:'درخواست بیش از حد بزرگ است.'});
  const action=clean(input.action||'list',30),draftId=clean(input.draftId,40);
  const statuses=new Set(['draft_ready','approved','publish_requested','publishing','published','publish_error','rejected','waiting_provider','processing','error']);
  let taxonomyCache:Record<string,unknown>|null=null;
  async function taxonomy(){if(taxonomyCache)return taxonomyCache;const response=await fetch(SITE+'/content/taxonomy.json',{headers:{Accept:'application/json'}});if(!response.ok)throw new Error('taxonomy_unavailable');taxonomyCache=await response.json();return taxonomyCache!;}
  async function findTopic(id:string){const data=await taxonomy(),categories=Array.isArray(data.categories)?data.categories:[];for(const category of categories){if(!object(category))continue;const found=(Array.isArray(category.topics)?category.topics:[]).find((entry:unknown)=>object(entry)&&entry.id===id);if(found&&object(found))return {id, label:clean(found.label,160),categoryId:clean(category.id,40),categoryLabel:clean(category.label,160)};}return null;}
  async function findCategory(id:string){const data=await taxonomy(),categories=Array.isArray(data.categories)?data.categories:[];const found=categories.find((entry:unknown)=>object(entry)&&entry.id===id);return found&&object(found)?{id,label:clean(found.label,160)}:null;}
  async function generatedTopicId(category:string,label:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(category+'\n'+label.normalize('NFKC')));return category+'-custom-'+Array.from(new Uint8Array(digest)).slice(0,6).map(value=>value.toString(16).padStart(2,'0')).join('');}
  async function figureRows(ingestId:string){
    if(!uuid.test(ingestId))return [];
    return await db('intmed_content_figures?ingest_id=eq.'+ingestId+'&stored=eq.true&select=id,ingest_id,page,xref,width,height,sha256,storage_path,mime_type,byte_size&order=page.asc,xref.asc&limit=80') as Array<Record<string,unknown>>;
  }
  async function signPreview(path:string){
    const signed=await fetch(base+'/storage/v1/object/sign/intmed-content-inbox/'+path.split('/').map(encodeURIComponent).join('/'),{method:'POST',headers:server,body:JSON.stringify({expiresIn:900})});
    if(!signed.ok)return null;
    const value=await signed.json(),relative=String(value.signedURL||value.signedUrl||'');
    if(!relative)return null;
    if(relative.startsWith('http'))return relative.startsWith(base+'/')?relative:null;
    return base+'/storage/v1'+(relative.startsWith('/')?'':'/')+relative;
  }
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
      const jobs=await db('intmed_content_jobs?draft_id=eq.'+draftId+'&select=id,kind,status,outputs,progress,error,created_at,updated_at&order=created_at.desc&limit=1') as Array<Record<string,unknown>>;
      const ingestId=String(draft.ingest_id||ingest.id||''),isPdf=ingest.kind==='pdf'||ingest.mime_type==='application/pdf';
      const storedFigures=isPdf?await figureRows(ingestId):[];
      const json=object(draft.draft_json)?draft.draft_json:{},extraction=object(json.documentExtraction)?json.documentExtraction:{},inventory=Array.isArray(extraction.figures)?extraction.figures:[];
      const figures=await Promise.all(storedFigures.filter(figure=>uuid.test(String(figure.id||''))&&figure.ingest_id===ingestId&&/^[a-f0-9]{64}$/.test(String(figure.sha256||''))&&['image/png','image/jpeg'].includes(String(figure.mime_type))&&String(figure.storage_path)==='figures/'+ingestId+'/'+figure.sha256+(figure.mime_type==='image/png'?'.png':'.jpg')).map(async figure=>{
        const metadata=inventory.find(item=>object(item)&&item.storedFigureId===figure.id);
        return {id:figure.id,page:Number(figure.page),width:Number(figure.width),height:Number(figure.height),sha256:figure.sha256,mimeType:figure.mime_type,byteSize:Number(figure.byte_size),caption:object(metadata)?clean(metadata.caption||metadata.description,1000):'',previewUrl:await signPreview(String(figure.storage_path))};
      }));
      return reply(200,{draft,sourceUrl,figures,job:jobs[0]||null});
    }
    if(['extract_figures','materialize_figure','save_artifacts','resolve_finding','save','approve','publish','reject','reopen'].includes(action)){
      const active=await db('intmed_content_jobs?draft_id=eq.'+draftId+'&status=in.(queued,running)&select=id&limit=1') as Array<Record<string,unknown>>;
      if(active.length)return reply(409,{message:'پردازش این منبع هنوز ادامه دارد؛ پس از پایان آن محتوا را ویرایش یا منتشر کنید.'});
    }
    const draftJson=object(draft.draft_json)?draft.draft_json:{};
    if(action==='extract_figures'){
      const revision=Number(input.revision),source=object(draft.intmed_content_ingest)?draft.intmed_content_ingest:{};
      if(typeof input.revision!=='number'||!Number.isInteger(revision)||revision!==Number(draft.review_revision||0)||['publishing','publish_requested','rejected','processing'].includes(String(draft.status)))return reply(409,{message:'پیش‌نویس تغییر کرده یا در وضعیت مناسب استخراج تصاویر نیست؛ دوباره باز کنید.'});
      if((source.kind!=='pdf'&&source.mime_type!=='application/pdf')||!uuid.test(String(source.id||draft.ingest_id||'')))return reply(400,{message:'استخراج تصاویر فقط برای منبع PDF معتبر است.'});
      const queued=await fetch(base+'/functions/v1/intmed-content-jobs',{method:'POST',headers:server,body:JSON.stringify({action:'dispatch',kind:'extract',figuresOnly:true,draftId,ingestId:source.id||draft.ingest_id,revision})});
      const result=await queued.json().catch(()=>({}));
      return reply(queued.status,{...result,message:clean(result.message||(queued.ok?'استخراج تصاویر اصلی در صف ثبت شد؛ متن، پیش‌نویس و تأیید قبلی حفظ می‌شوند.':'شروع استخراج تصاویر انجام نشد.'),240)});
    }
    if(action==='materialize_figure'){
      const revision=Number(input.revision),figureId=clean(input.figureId,40),ingest=object(draft.intmed_content_ingest)?draft.intmed_content_ingest:{};
      if(typeof input.revision!=='number'||!Number.isInteger(revision)||revision!==Number(draft.review_revision||0))return reply(409,{message:'پیش‌نویس تغییر کرده؛ دوباره باز کنید.'});
      if(!uuid.test(figureId)||(ingest.kind!=='pdf'&&ingest.mime_type!=='application/pdf'))return reply(400,{message:'تصویر و منبع PDF معتبر را انتخاب کنید.'});
      const figures=await figureRows(String(draft.ingest_id||ingest.id||''));
      if(!figures.some(figure=>figure.id===figureId))return reply(404,{message:'تصویر در این منبع پیدا نشد.'});
      try{
        const child=await db('rpc/intmed_materialize_figure','POST',{p_figure_id:figureId,p_reviewer_id:user.id,p_expected_revision:revision});
        return reply(200,{ok:true,...child,message:'پیش‌نویس مستقل تصویر آماده شد؛ مقصد، توضیح فارسی و حق استفاده را بازبینی کنید.'});
      }catch(error){if(/stale|revision|active|busy|processing/i.test(String(error)))return reply(409,{message:'منبع تغییر کرده یا هنوز در حال پردازش است؛ دوباره باز کنید.'});throw error;}
    }
    const findings=Array.isArray(draftJson.reviewFindings)?draftJson.reviewFindings:[];
    if(['approve','publish'].includes(action)&&findings.some(item=>object(item)&&item.severity==='blocking'&&item.status!=='resolved'))return reply(409,{message:'موارد علمیِ نیازمند اصلاح هنوز باز هستند؛ ابتدا آن‌ها را بررسی و نتیجهٔ اصلاح را ثبت کنید.',code:'unresolved_scientific_findings'});
    if(action==='resolve_finding'){
      const revision=Number(input.revision),index=Number(input.findingIndex),resolution=clean(input.resolution,4000);
      if(!Number.isInteger(revision)||revision!==Number(draft.review_revision||0))return reply(409,{message:'پیش‌نویس تغییر کرده؛ دوباره باز کنید.'});
      if(!['draft_ready','approved','publish_error'].includes(String(draft.status)))return reply(409,{message:'برای ثبت بازبینی، ابتدا پیش‌نویس را بازگشایی کنید.'});
      if(!Number.isInteger(index)||index<0||index>=findings.length||!object(findings[index])||findings[index].status==='resolved'||resolution.length<12)return reply(400,{message:'مورد علمی و توضیح روشنِ اصلاح یا نتیجهٔ بررسی را وارد کنید.'});
      const now=new Date().toISOString(),updated=findings.map((item,position)=>position===index?{...item,status:'resolved',resolution:{note:resolution,reviewedBy:user.id,reviewedAt:now}}:item);
      const history=Array.isArray(draftJson.scientificReviewHistory)?draftJson.scientificReviewHistory:[];
      const saved=await db('intmed_content_drafts?id=eq.'+draftId+'&review_revision=eq.'+revision+'&status=in.(draft_ready,approved,publish_error)','PATCH',{
        draft_json:{...draftJson,reviewFindings:updated,scientificReviewHistory:[...history,{findingIndex:index,action:'resolved',note:resolution,reviewedBy:user.id,reviewedAt:now}].slice(-200)},
        status:'draft_ready',review_revision:revision+1,reviewed_by:null,reviewed_at:null,updated_at:now,
      },{Prefer:'return=representation'}) as Array<Record<string,unknown>>;
      if(!saved.length)return reply(409,{message:'پیش‌نویس هم‌زمان تغییر کرده؛ دوباره باز کنید.'});
      return reply(200,{ok:true,draft:saved[0],message:'نتیجهٔ بررسی این مورد ثبت شد؛ تأیید نهایی کل محتوا همچنان لازم است.'});
    }
    if(action==='save_artifacts'){
      const revision=Number(input.revision);
      if(!Number.isInteger(revision)||revision!==Number(draft.review_revision||0))return reply(409,{message:'نسخهٔ محتوا تغییر کرده؛ پیش‌نویس را دوباره باز کنید.'});
      if(!['draft_ready','approved','publish_error'].includes(String(draft.status)))return reply(409,{message:'ویرایش در این وضعیت ممکن نیست؛ ابتدا پیش‌نویس را بازگشایی کنید.'});
      let draftJson:Record<string,unknown>;
      try{draftJson=editArtifacts(input.artifacts,object(draft.draft_json)?draft.draft_json:{});}catch{return reply(400,{message:'محتوا معتبر نیست؛ عنوان، متن و چهار گزینه و پاسخ صحیح سؤال‌ها را بررسی کنید.'});}
      const previous=object(draft.draft_json)?draft.draft_json:{};
      const lessonText=(value:unknown)=>(Array.isArray(value)?value:[]).map(row=>object(row)?{heading:row.heading,paragraphs:row.paragraphs,keyPoints:row.keyPoints}:row);
      const lessonChanged=JSON.stringify(lessonText(draftJson.lessonDrafts))!==JSON.stringify(lessonText(previous.lessonDrafts));
      if(lessonChanged){
        draftJson.flashcardDrafts=[];draftJson.mcqDrafts=[];draftJson.kfDrafts=[];
        const generation=object(draftJson.generation)?draftJson.generation:{};
        draftJson.generation={...generation,generated:Array.isArray(draftJson.lessonDrafts)&&draftJson.lessonDrafts.length?['lesson']:[],assessmentsInvalidatedAt:new Date().toISOString()};
      }
      const saved=await db('intmed_content_drafts?id=eq.'+draftId+'&review_revision=eq.'+revision+'&status=in.(draft_ready,approved,publish_error)','PATCH',{
        draft_json:draftJson,status:'draft_ready',review_revision:revision+1,reviewed_by:null,reviewed_at:null,
        updated_at:new Date().toISOString(),publish_error:null,
      },{Prefer:'return=representation'}) as Array<Record<string,unknown>>;
      if(!saved.length)return reply(409,{message:'نسخهٔ محتوا تغییر کرده؛ پیش‌نویس را دوباره باز کنید.'});
      return reply(200,{ok:true,draft:saved[0],message:lessonChanged?'درسنامه اصلاح شد؛ آزمون و فلش‌کارت‌های وابسته پاک شدند و باید از متن جدید دوباره ساخته شوند.':'اصلاحات محتوا ذخیره شد؛ برای انتشار تأیید نهایی لازم است.'});
    }
    if(action==='reanalyze'){
      const revision=Number(input.revision);
      if(input.confirmReanalysis!==true)return reply(400,{message:'تأیید بازخوانی فایل اصلی لازم است.'});
      if(!Number.isInteger(revision)||revision!==Number(draft.review_revision||0)||!['draft_ready','approved','publish_error','error','waiting_provider'].includes(String(draft.status)))return reply(409,{message:'پیش‌نویس تغییر کرده یا اکنون قابل بازخوانی نیست؛ آن را دوباره باز کنید.'});
      const source=object(draft.intmed_content_ingest)?draft.intmed_content_ingest:{};
      if(!uuid.test(String(source.id||'')))return reply(400,{message:'منبع اصلی پیش‌نویس موجود نیست.'});
      if(source.kind==='pdf'||source.mime_type==='application/pdf'){
        const queued=await fetch(base+'/functions/v1/intmed-content-jobs',{method:'POST',headers:server,body:JSON.stringify({action:'dispatch',kind:'extract',draftId,ingestId:source.id,revision})});
        const result=await queued.json().catch(()=>({}));
        return reply(queued.status,{...result,draft,message:clean(result.message||(queued.ok?'بازخوانی PDF در صف پردازش ثبت شد؛ با بستن صفحه ادامه می‌یابد.':'شروع بازخوانی PDF انجام نشد.'),240)});
      }
      const claimed=await db('intmed_content_drafts?id=eq.'+draftId+'&review_revision=eq.'+revision+'&status=eq.'+encodeURIComponent(String(draft.status)),'PATCH',{status:'processing',review_revision:revision+1,reviewed_by:null,reviewed_at:null,error_code:null,updated_at:new Date().toISOString()},{Prefer:'return=representation'}) as Array<Record<string,unknown>>;
      if(!claimed.length)return reply(409,{message:'پیش‌نویس تغییر کرده؛ دوباره باز کنید.'});
      try{
        const released=await db('intmed_content_ingest?id=eq.'+source.id+'&status=in.(accepted,pending_review,error,rejected)','PATCH',{status:'pending_review',error_code:null,updated_at:new Date().toISOString()},{Prefer:'return=representation'}) as Array<Record<string,unknown>>;
        if(!released.length)throw Error('source_busy');
        const work=fetch(base+'/functions/v1/intmed-content-worker',{method:'POST',headers:server,body:JSON.stringify({ingestId:source.id})}).then(async response=>{
          if(!response.ok)throw Error('worker_'+response.status);
          const result=await response.json();
          if(result.reason==='manual_mode'||result.reason==='empty_or_busy'||(!result.processed&&!result.waitingProvider&&!result.failed))throw Error('processing_not_started');
        }).catch(async()=>{await db('intmed_content_drafts?id=eq.'+draftId+'&status=eq.processing&review_revision=eq.'+(revision+1),'PATCH',{status:'error',error_code:'reanalysis_dispatch_failed',updated_at:new Date().toISOString()},{Prefer:'return=minimal'});});
        const runtime=(globalThis as unknown as {EdgeRuntime?:{waitUntil:(promise:Promise<unknown>)=>void}}).EdgeRuntime;
        if(runtime)runtime.waitUntil(work);else await work;
        return reply(202,{ok:true,draft:claimed[0],message:'بازخوانی منبع آغاز شد؛ پس از آماده‌شدن، این پیش‌نویس را دوباره باز کنید. مطالب فعلی سایت تغییر نمی‌کنند.'});
      }catch{
        await db('intmed_content_drafts?id=eq.'+draftId+'&status=eq.processing&review_revision=eq.'+(revision+1),'PATCH',{status:'error',error_code:'reanalysis_source_busy',updated_at:new Date().toISOString()},{Prefer:'return=minimal'});
        return reply(409,{message:'منبع در حال پردازش است یا آمادهٔ بازخوانی نیست؛ کمی بعد فهرست را تازه کنید.'});
      }
    }
    if(action==='generate'){
      const revision=Number(input.revision);if(!Number.isInteger(revision)||revision!==Number(draft.review_revision||0))return reply(409,{message:'این پیش‌نویس تغییر کرده؛ آن را دوباره باز کنید.'});
      const outputSet=new Set(['lesson','flashcards','mcq','kf']),outputs=Array.isArray(input.outputs)?[...new Set(input.outputs.map(value=>clean(value,20)).filter(value=>outputSet.has(value)))]:[];
      if(!outputs.length)return reply(400,{message:'حداقل یک خروجی را انتخاب کنید.'});
      const sourceMode=clean(input.sourceMode||'auto',30);if(!['auto','question_bank','prose'].includes(sourceMode))return reply(400,{message:'نوع ورودی معتبر نیست.'});
      const generated=await fetch(base+'/functions/v1/intmed-content-jobs',{method:'POST',headers:server,body:JSON.stringify({action:'dispatch',kind:'generate',draftId,outputs,sourceMode,revision})}),result=await generated.json().catch(()=>({}));
      return reply(generated.status,{...result,draft,message:clean(result.message||(generated.ok?'تولید محتوا در صف ثبت شد؛ با بستن صفحه هم ادامه می‌یابد.':'ثبت درخواست تولید انجام نشد.'),240)});
    }
    if(!['save','approve','publish','reject','reopen'].includes(action))return reply(400,{message:'عملیات ناشناخته است.'});
    const before=String(draft.status||''),revision=Number(input.revision);
    if(!Number.isInteger(revision)||revision!==Number(draft.review_revision||0))return reply(409,{message:'این پیش‌نویس در جای دیگری تغییر کرده؛ فهرست را تازه کنید.'});
    const note=clean(input.note,4000),now=new Date().toISOString();
    const patch:Record<string,unknown>={reviewed_by:user.id,reviewed_at:now,review_revision:revision+1,updated_at:now};
    if(action==='save'||action==='approve'||action==='publish'){
      const title=clean(input.title,240),createTopic=input.createTopic===true,targetKind=clean(input.targetKind||'lesson',30);
      // Provenance is retained from storage, not declared or invented by the routing form.
      const sourceClass=clean(draft.target_source_class,40),rightsNote=clean(draft.target_rights_note,600);
      let summary=clean(input.sourceSummary,4000);
      if(summary.length<60)return reply(400,{message:'خلاصهٔ نکات طلایی باید یک پاراگراف مرتبط و دست‌کم ۶۰ نویسه باشد.'});
      if(object(draftJson.figureOrigin)){
        if(!visualKinds.has(targetKind))return reply(400,{message:'برای تصویر استخراج‌شده یک نوع تصویری انتخاب کنید.'});
        const origin=draftJson.figureOrigin,credit='[PDF: '+clean(origin.ingestId,40)+' · page '+clean(origin.page,8)+' · SHA-256 '+clean(origin.sha256,64)+']';
        if(!summary.includes(credit))summary=summary.slice(0,3800)+'\n'+credit;
      }
      let topicId=clean(input.topicId,80),targetCategory='',targetLabel='',targetIsNew=false;
      if(!title)return reply(400,{message:'عنوان پیش‌نویس الزامی است.'});
      if(!targetKinds.has(targetKind))return reply(400,{message:'نوع مقصد محتوا معتبر نیست.'});
      if(sourceClass&&!sourceClasses.has(sourceClass))return reply(400,{message:'اطلاعات منبع ثبت‌شده معتبر نیست.'});
      const embedded=object(draft.intmed_content_ingest)?draft.intmed_content_ingest:{};
      if(targetKind==='pbs'&&!/^image\//.test(String(embedded.mime_type||'')))return reply(400,{message:'PBS فقط برای فایل تصویری لام خون محیطی قابل انتخاب است.'});
      if(createTopic){targetCategory=clean(input.newTopicCategoryId,40);targetLabel=clean(input.newTopicLabel,160);if(!categoryId.test(targetCategory)||targetLabel.length<2)return reply(400,{message:'بخش و نام مبحث جدید معتبر نیست.'});if(!await findCategory(targetCategory))return reply(400,{message:'بخش انتخاب‌شده در taxonomy وجود ندارد.'});topicId=await generatedTopicId(targetCategory,targetLabel);targetIsNew=true;}else{if(!topicId||!topic.test(topicId))return reply(400,{message:'مبحث مقصد را از پیشنهادهای جست‌وجو انتخاب کنید.'});const existing=await findTopic(topicId);if(!existing)return reply(400,{message:'مبحث انتخاب‌شده در ساختار فعلی سایت وجود ندارد.'});targetCategory=existing.categoryId;targetLabel=existing.label;}
      patch.title=title;patch.topic_id=topicId;patch.source_summary=summary;patch.reviewer_note=note||null;patch.target_category_id=targetCategory;patch.target_topic_label=targetLabel;patch.target_topic_is_new=targetIsNew;patch.target_content_kind=targetKind;patch.target_source_class=sourceClass||null;patch.target_rights_note=rightsNote||null;
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
    if(action==='publish'){
      const dispatched=await fetch(base+'/functions/v1/intmed-content-publisher',{method:'POST',headers:{...server,Authorization:'Bearer '+service},body:JSON.stringify({action:'dispatch',draftId})});
      const result=await dispatched.json().catch(()=>({}));
      if(!dispatched.ok){
        const message=clean(result.message||'شروع انتشار ابری انجام نشد.',240);
        await db('intmed_content_drafts?id=eq.'+draftId+'&status=eq.publish_requested','PATCH',{status:'publish_error',publish_error:message,updated_at:new Date().toISOString()},{'Prefer':'return=minimal'});
        return reply(dispatched.status,{message,code:clean(result.code||'cloud_dispatch_failed',120),draft:saved});
      }
      const refreshed=await db('intmed_content_drafts?id=eq.'+draftId+'&select=*&limit=1') as Array<Record<string,unknown>>;
      return reply(202,{ok:true,draft:refreshed[0]||saved,message:clean(result.message||'انتشار ابری شروع شد.',240)});
    }
    return reply(200,{ok:true,draft:saved,message:action==='approve'?'برای ادغام نهایی تأیید شد؛ هنوز عمومی نشده است.':action==='reject'?'پیش‌نویس رد شد.':'تغییرات بازبینی ذخیره شد.'});
  }catch(error){return reply(503,{message:'سرویس بازبینی پاسخ نداد.',code:clean(error instanceof Error?error.message:'review_error',160)});}
});
