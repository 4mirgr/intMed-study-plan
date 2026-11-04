// Private durable jobs; GitHub receives a short-lived one-job capability, never a service key.
import {ocrPage} from './ocr.ts';
import {saveFigure} from './figures.ts';
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hex=/^[0-9a-f]{64}$/;
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const clean=(value,max=240)=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,max);
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
const outputsAllowed=new Set(['lesson','flashcards','mcq','kf']);
const publicJob=job=>({id:job.id,jobId:job.id,kind:job.kind,status:job.status,progress:job.progress,error:job.error,updatedAt:job.updated_at});

Deno.serve(async req=>{
  const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
  if(req.method!=='POST')return reply(405,{message:'Method not allowed'});
  if(Number(req.headers.get('content-length')||0)>8_000_000)return reply(413,{message:'Payload too large'});
  const base=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!base||!service)return reply(503,{message:'Content jobs configuration missing'});
  let input;try{input=await req.json();}catch{return reply(400,{message:'Invalid JSON'});}
  if(!object(input)||new TextEncoder().encode(JSON.stringify(input)).length>8_000_000)return reply(400,{message:'Invalid payload'});
  const internal=req.headers.get('authorization')==='Bearer '+service,action=clean(input.action,30);
  const server={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
  async function db(path,method='GET',body,extra={}){
    const response=await fetch(base+'/rest/v1/'+path,{method,headers:{...server,...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const text=await response.text();let value=null;try{value=text?JSON.parse(text):null;}catch{}
    if(!response.ok)throw Error('database_'+response.status);
    return value;
  }
  const patchJob=(id,value,condition='')=>db('intmed_content_jobs?id=eq.'+id+condition,'PATCH',{...value,updated_at:new Date().toISOString()},{Prefer:'return=representation'});
  async function wake(ingestId){
    try{
      const response=await fetch(base+'/functions/v1/intmed-content-worker',{method:'POST',headers:server,body:JSON.stringify({ingestId})});
      const value=await response.json().catch(()=>({}));
      return response.ok?value:{reason:'routing_http_'+response.status};
    }catch{return {reason:'routing_dispatch_failed'};}
  }
  async function finishRouting(job,quality,metrics,alreadyReady=false){
    let result={processed:alreadyReady?1:0};
    if(!alreadyReady){
      await db('intmed_content_ingest?id=eq.'+job.ingest_id,'PATCH',{status:'pending_review',error_code:null,updated_at:new Date().toISOString()},{Prefer:'return=minimal'});
      result=await wake(job.ingest_id);
    }
    if(Number(result.processed||0)>0){
      await patchJob(job.id,{status:'completed',expected_revision:job.expected_revision+1,progress:{...job.progress,...metrics,stage:'ready'},error:null},'&status=eq.running');
      return {ok:true,completed:true,quality};
    }
    const reason=clean(result.reason||(result.waitingProvider?'routing_waiting_provider':'routing_failed'),100);
    await patchJob(job.id,{status:'error',expected_revision:job.expected_revision+1,progress:{...job.progress,...metrics,stage:'routing',extractionSaved:true},error:reason},'&status=eq.running');
    await db('intmed_content_drafts?id=eq.'+job.draft_id+'&review_revision=eq.'+(job.expected_revision+1)+'&status=eq.processing','PATCH',{status:'error',error_code:reason,updated_at:new Date().toISOString()},{Prefer:'return=minimal'});
    // Native output is durable even when the routing model/queue is unavailable.
    return {ok:true,completed:false,extractionSaved:true,routingError:reason,quality};
  }
  try{
    if(action==='status'){
      if(!internal)return reply(403,{message:'Internal status only'});
      const draftId=clean(input.draftId,40);if(!uuid.test(draftId))return reply(400,{message:'Invalid draft'});
      const rows=await db('intmed_content_jobs?draft_id=eq.'+draftId+'&order=created_at.desc&limit=5');
      return reply(200,{jobs:rows.map(publicJob)});
    }
    if(action==='dispatch'){
      if(!internal)return reply(403,{message:'Internal dispatch only'});
      const kind=clean(input.kind,20),draftId=clean(input.draftId,40),ingestId=clean(input.ingestId,40);
      if(!['extract','generate'].includes(kind)||(!uuid.test(draftId)&&!uuid.test(ingestId)))return reply(400,{message:'Invalid content job'});
      const github=Deno.env.get('INTMED_GITHUB_ACTIONS_TOKEN');if(!github)return reply(503,{message:'کلید اجرای GitHub تنظیم نشده است.',code:'github_token_missing'});
      let drafts=await db('intmed_content_drafts?'+(uuid.test(draftId)?'id=eq.'+draftId:'ingest_id=eq.'+ingestId)+'&select=*&limit=1'),draft=drafts[0];
      const sourceId=draft?.ingest_id||ingestId;if(!uuid.test(sourceId))return reply(404,{message:'Source not found'});
      const sources=await db('intmed_content_ingest?id=eq.'+sourceId+'&select=id,kind,status,original_filename&limit=1');
      if(!sources[0]||(kind==='extract'&&sources[0].kind!=='pdf'))return reply(400,{message:'PDF source required'});
      if(!draft){
        const made=await db('intmed_content_drafts?on_conflict=ingest_id','POST',{ingest_id:sourceId,status:'processing',title:clean(sources[0].original_filename,240),draft_json:{},review_revision:0},{Prefer:'resolution=ignore-duplicates,return=representation'});
        draft=made?.[0]||(await db('intmed_content_drafts?ingest_id=eq.'+sourceId+'&select=*&limit=1'))[0];
      }
      const validationOnly=kind==='extract'&&input.validationOnly===true,figuresOnly=kind==='extract'&&input.figuresOnly===true;
      if(validationOnly&&figuresOnly)return reply(400,{message:'Conflicting extraction modes'});
      if(!draft||(!validationOnly&&['publishing','publish_requested','rejected',...(figuresOnly?[]:['published'])].includes(draft.status)))return reply(409,{message:'ابتدا پیش‌نویس را برای پردازش بازگشایی کنید.'});
      if(figuresOnly&&draft.status==='processing')return reply(409,{message:'Source processing is active'});
      if(input.revision!==undefined&&input.revision!==Number(draft.review_revision||0))return reply(409,{message:'پیش‌نویس تغییر کرده؛ آن را دوباره باز کنید.'});
      const requested=Array.isArray(input.outputs)?[...new Set(input.outputs.filter(output=>outputsAllowed.has(output)))]:[];
      if(kind==='generate'&&!requested.length)return reply(400,{message:'خروجی موردنظر را انتخاب کنید.'});
      if(kind==='generate'&&!requested.includes('lesson')&&(!Array.isArray(draft.draft_json?.lessonDrafts)||!draft.draft_json.lessonDrafts.length||draft.draft_json?.generation?.chunkProgress?.lesson?.complete===false))requested.unshift('lesson');
      requested.sort((a,b)=>a==='lesson'?-1:b==='lesson'?1:0);
      const active=await db('intmed_content_jobs?ingest_id=eq.'+sourceId+'&status=in.(queued,running)&order=created_at.desc&limit=1');
      if(active[0]){
        if(figuresOnly)return reply(409,{message:'Source already has an active job'});
        if(Date.parse(active[0].updated_at)>Date.now()-25*60*1000)return reply(202,{ok:true,reused:true,...publicJob(active[0])});
        await patchJob(active[0].id,{status:'error',error:'runner_lease_expired'},'&status=in.(queued,running)');
      }
      const previous=await db('intmed_content_jobs?draft_id=eq.'+draft.id+'&kind=eq.'+kind+'&status=eq.error&order=created_at.desc&limit=1');
      const resume=previous[0]&&previous[0].expected_revision===Number(draft.review_revision||0)&&(previous[0].progress?.validationOnly===true)===validationOnly&&(previous[0].progress?.figuresOnly===true)===figuresOnly&&JSON.stringify(previous[0].outputs)===JSON.stringify(requested)?previous[0].progress:{};
      const capability=token(),capabilityHash=await digest(capability),now=new Date().toISOString(),newId=crypto.randomUUID();
      const rows=await db('intmed_content_jobs','POST',{id:newId,draft_id:draft.id,ingest_id:sourceId,kind,outputs:requested,expected_revision:Number(draft.review_revision||0),progress:{...(resume||{}),runId:resume?.runId||newId,...(validationOnly?{validationOnly:true}:{}),...(figuresOnly?{figuresOnly:true}:{})},capability_hash:capabilityHash,expires_at:new Date(Date.now()+2*3600*1000).toISOString(),created_at:now,updated_at:now},{Prefer:'return=representation'}),job=rows[0];
      const dispatched=await fetch('https://api.github.com/repos/4mirgr/intMed-study-plan/actions/workflows/process-content.yml/dispatches',{method:'POST',headers:{Authorization:'Bearer '+github,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:JSON.stringify({ref:'claude/quirky-ride-mavb6b',inputs:{job_id:job.id,capability}})});
      if(!dispatched.ok){await patchJob(job.id,{status:'error',error:'github_dispatch_'+dispatched.status});return reply(502,{message:'شروع پردازش ابری ناموفق بود.',code:'github_dispatch_'+dispatched.status});}
      return reply(202,{ok:true,...publicJob(job),message:'پردازش ابری ثبت شد؛ می‌توانید این پنجره را ببندید.'});
    }
    const jobId=clean(input.jobId,40),capability=clean(input.capability,80);
    if(!uuid.test(jobId)||!hex.test(capability))return reply(403,{message:'Invalid job capability'});
    const rows=await db('intmed_content_jobs?id=eq.'+jobId+'&capability_hash=eq.'+await digest(capability)+'&expires_at=gt.'+encodeURIComponent(new Date().toISOString())+'&limit=1'),job=rows[0];
    if(!job)return reply(403,{message:'Job capability expired or invalid'});
    if(action==='kick'){
      if(job.status!=='queued')return reply(409,{message:'Only queued jobs can be dispatched'});
      const github=Deno.env.get('INTMED_GITHUB_ACTIONS_TOKEN');if(!github)return reply(503,{message:'GitHub dispatch unavailable'});
      const dispatched=await fetch('https://api.github.com/repos/4mirgr/intMed-study-plan/actions/workflows/process-content.yml/dispatches',{method:'POST',headers:{Authorization:'Bearer '+github,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:JSON.stringify({ref:'claude/quirky-ride-mavb6b',inputs:{job_id:job.id,capability}})});
      if(!dispatched.ok)return reply(502,{message:'Queued job dispatch failed',code:'github_dispatch_'+dispatched.status});
      await patchJob(job.id,{},'&status=eq.queued');
      return reply(202,{ok:true,jobId:job.id,status:'queued'});
    }
    if(action==='claim'){
      const claimed=await patchJob(job.id,{status:'running',error:null},'&status=eq.queued');
      if(!claimed.length)return reply(409,{message:'Job already claimed'});
      const sources=await db('intmed_content_ingest?id=eq.'+job.ingest_id+'&select=id,mime_type,original_filename,storage_path,sha256&limit=1'),source=sources[0];
      let downloadUrl=null;
      if(job.kind==='extract'){
        if(!source?.storage_path)throw Error('source_missing');
        const signed=await fetch(base+'/storage/v1/object/sign/intmed-content-inbox/'+source.storage_path.split('/').map(encodeURIComponent).join('/'),{method:'POST',headers:server,body:JSON.stringify({expiresIn:3600})});
        if(!signed.ok)throw Error('source_sign_failed');const result=await signed.json(),path=result.signedURL||result.signedUrl||'';
        downloadUrl=path.startsWith('http')?path:base+'/storage/v1'+(path.startsWith('/')?'':'/')+path;
      }
      return reply(200,{ok:true,job:{id:job.id,kind:job.kind,outputs:job.outputs,progress:job.progress,revision:job.expected_revision,draftId:job.draft_id,source:{downloadUrl,mimeType:source?.mime_type,sha256:source?.sha256,filename:clean(source?.original_filename,180)}}});
    }
    if(job.status==='completed'&&action==='generate_step'&&job.progress?.completedOutputs?.includes(input.output))return reply(200,{ok:true,progress:job.progress,completed:true,outputComplete:true,cached:true});
    if(job.status==='completed'&&action==='extract_result')return reply(200,{ok:true,completed:true,cached:true});
    if(job.status!=='running')return reply(409,{message:'Job is not running'});
    if(action==='figure_manifest'){
      if(job.kind!=='extract'||job.progress?.validationOnly===true||!Number.isInteger(input.pageCount)||input.pageCount<1||input.pageCount>2000||!Array.isArray(input.figures)||input.figures.length>80)return reply(400,{message:'Invalid figure manifest'});
      const figures=[],seen=new Set();
      for(const figure of input.figures){
        if(!object(figure)||!Number.isInteger(figure.page)||figure.page<1||figure.page>input.pageCount||!Number.isInteger(figure.xref)||figure.xref<1||!Number.isInteger(figure.width)||!Number.isInteger(figure.height)||Math.min(figure.width,figure.height)<128||figure.width*figure.height>100000000||!hex.test(String(figure.sha256||'')))return reply(400,{message:'Invalid figure manifest'});
        const key=figure.page+':'+figure.xref;if(seen.has(key))return reply(400,{message:'Duplicate figure manifest entry'});seen.add(key);
        figures.push({page:figure.page,xref:figure.xref,width:figure.width,height:figure.height,sha256:figure.sha256});
      }
      figures.sort((a,b)=>a.page-b.page||a.xref-b.xref);
      const manifest={pageCount:input.pageCount,figures},manifestHash=await digest(JSON.stringify(manifest));
      if(job.progress?.figureManifestHash)return reply(job.progress.figureManifestHash===manifestHash?200:409,{ok:job.progress.figureManifestHash===manifestHash,cached:true});
      const saved=await patchJob(job.id,{progress:{...job.progress,nativeFigureManifest:manifest,figureManifestHash:manifestHash}},'&status=eq.running&progress->>figureManifestHash=is.null');
      if(!saved.length)return reply(409,{message:'Figure manifest already registered'});
      return reply(200,{ok:true,cached:false});
    }
    if(action==='figure_result'){
      if(job.kind!=='extract'||job.progress?.validationOnly===true)return reply(400,{message:'Wrong job kind'});
      try{return reply(200,{ok:true,...await saveFigure(input,job,{db,base,server})});}
      catch(error){if(error?.message==='figure_invalid')return reply(400,{message:'Invalid figure'});throw error;}
    }
    if(action==='fail'){
      await patchJob(job.id,{status:'error',error:clean(input.error||'runner_failed',1000)},'&status=eq.running');
      if(job.kind==='extract'&&!job.progress?.figuresOnly&&!job.progress?.validationOnly){
        await db('intmed_content_drafts?id=eq.'+job.draft_id+'&review_revision=eq.'+job.expected_revision+'&status=eq.processing','PATCH',{status:'error',error_code:'native_extraction_failed',updated_at:new Date().toISOString()},{Prefer:'return=minimal'});
        await db('intmed_content_ingest?id=eq.'+job.ingest_id+'&status=in.(processing,pending_review)','PATCH',{status:'error',error_code:'native_extraction_failed',updated_at:new Date().toISOString()},{Prefer:'return=minimal'});
      }
      return reply(200,{ok:true});
    }
    if(action==='ocr_page'){
      if(job.kind!=='extract'||job.progress?.figuresOnly===true||!Number.isInteger(input.page)||input.page<1||input.page>2000)return reply(400,{message:'Invalid OCR page'});
      const cached=object(job.progress?.ocrPages)?job.progress.ocrPages:{};
      if(cached[String(input.page)])return reply(200,{ok:true,...cached[String(input.page)],cached:true});
      const result=await ocrPage(input,job);
      await patchJob(job.id,{progress:{...job.progress,ocrPages:{...cached,[String(input.page)]:result}}},'&status=eq.running');
      return reply(200,{ok:true,...result,cached:false});
    }
    const drafts=await db('intmed_content_drafts?id=eq.'+job.draft_id+'&select=*&limit=1'),draft=drafts[0];
    if(action==='generate_step'&&draft){
      // A completed chunk may have been saved just before a network interruption.
      // Recover only that exact runner revision, never a later teacher edit.
      const saved=draft.draft_json?.generation?.chunkProgress?.[input.output];
      const runId=job.progress?.runId||job.id;
      if(draft.draft_json?.generation?.chunks?.runId===runId&&saved?.runId===runId&&saved.savedRevision===Number(draft.review_revision)&&Number(draft.review_revision)===job.expected_revision+1){
        job.expected_revision=Number(draft.review_revision);
        await patchJob(job.id,{expected_revision:job.expected_revision},'&status=eq.running');
      }
    }
    if(action==='extract_result'&&!job.progress?.figuresOnly&&(draft?.draft_json?.generation?.extractionJobId===job.id||draft?.draft_json?.documentExtraction?.jobId===job.id)&&Number(draft.review_revision)===job.expected_revision+1){
      const extraction=draft.draft_json.documentExtraction;
      const result=await finishRouting(job,extraction?.quality,{pageCount:extraction?.pageCount||0,figureCount:extraction?.figures?.length||0},draft.status==='draft_ready');
      return reply(200,{...result,cached:true});
    }
    const validationOnly=job.kind==='extract'&&action==='extract_result'&&job.progress?.validationOnly===true;
    const figuresOnly=job.kind==='extract'&&action==='extract_result'&&job.progress?.figuresOnly===true;
    if(!validationOnly&&(!draft||Number(draft.review_revision||0)!==job.expected_revision||['publishing','publish_requested','rejected',...(figuresOnly?[]:['published'])].includes(draft.status)))return reply(409,{message:'پیش‌نویس هم‌زمان تغییر کرده است.',code:'stale_revision'});
    if(action==='generate_step'){
      const output=clean(input.output,20);if(job.kind!=='generate'||!job.outputs.includes(output))return reply(400,{message:'Output not allowed'});
      const completed=Array.isArray(job.progress?.completedOutputs)?job.progress.completedOutputs:[];
      if(completed.includes(output))return reply(200,{ok:true,progress:job.progress,completed:false});
      const chunkIndex=Number(job.progress?.nextChunkIndex?.[output]||0);
      const result=await fetch(base+'/functions/v1/intmed-content-generator',{method:'POST',headers:server,body:JSON.stringify({draftId:draft.id,revision:job.expected_revision,outputs:[output],chunkIndex,runId:job.progress?.runId||job.id})}),value=await result.json().catch(()=>({}));
      if(!result.ok){await patchJob(job.id,{error:clean(value.code||value.message||'generation_failed',1000)},'&status=eq.running');return reply(result.status,{message:value.message||'تولید محتوا متوقف شد.',code:value.code||'generation_failed'});}
      const outputComplete=value.complete!==false;
      const progress={...job.progress,completedOutputs:outputComplete?[...completed,output]:completed,nextChunkIndex:{...(job.progress?.nextChunkIndex||{}),[output]:Number(value.nextChunkIndex||chunkIndex+1)},totalChunks:{...(job.progress?.totalChunks||{}),[output]:Number(value.totalChunks||1)}},done=job.outputs.every(output=>progress.completedOutputs.includes(output));
      await patchJob(job.id,{progress,expected_revision:Number(value.draft.review_revision||0),status:done?'completed':'running',error:null},'&status=eq.running');
      return reply(200,{ok:true,progress,completed:done,outputComplete,nextChunkIndex:progress.nextChunkIndex[output],totalChunks:progress.totalChunks[output]});
    }
    if(action==='extract_result'){
      if(job.kind!=='extract')return reply(400,{message:'Wrong job kind'});
      const extraction=input.extraction;
      if(!object(extraction)||!Number.isInteger(extraction.pageCount)||extraction.pageCount<1||extraction.pageCount>2000||!Array.isArray(extraction.pages)||extraction.pages.length!==extraction.pageCount)return reply(400,{message:'Incomplete PDF extraction'});
      if(job.progress?.nativeFigureManifest&&job.progress.nativeFigureManifest.pageCount!==extraction.pageCount)return reply(400,{message:'Figure manifest page count mismatch'});
      const seen=new Set(),pages=[];
      for(const page of extraction.pages){
        if(!object(page)||!Number.isInteger(page.page)||page.page<1||page.page>extraction.pageCount||seen.has(page.page)||typeof page.text!=='string'||page.text.length>100000||typeof page.unreadable!=='boolean')return reply(400,{message:'Invalid page inventory'});
        seen.add(page.page);pages.push({page:page.page,heading:clean(page.heading,240),text:clean(page.text,100000),unreadable:page.unreadable,method:['ocr','gemini_ocr','blank_page'].includes(page.method)?page.method:'native'});
      }
      pages.sort((a,b)=>a.page-b.page);
      const unreadablePages=pages.filter(page=>page.unreadable||(!page.text&&page.method!=='blank_page')).map(page=>page.page),warnings=Array.isArray(extraction.warnings)?extraction.warnings.map(value=>clean(value,500)).slice(0,100):[];
      const figures=Array.isArray(extraction.figures)?extraction.figures.filter(object).slice(0,1000).map(figure=>({page:Number(figure.page)||0,xref:Number(figure.xref)||0,width:Number(figure.width)||0,height:Number(figure.height)||0,sha256:hex.test(String(figure.sha256||''))?figure.sha256:null,extension:clean(figure.extension,12)})):[];
      const storedFigures=await db('intmed_content_figures?ingest_id=eq.'+job.ingest_id+'&stored=eq.true&select=id,page,sha256');
      for(const figure of figures){const stored=storedFigures.find(row=>row.page===figure.page&&row.sha256===figure.sha256);if(stored)figure.storedFigureId=stored.id;}
      const storedFigureCount=figures.filter(figure=>figure.storedFigureId).length;
      const figureUploadFailures=Array.isArray(extraction.figureUploadFailures)?extraction.figureUploadFailures.filter(value=>object(value)&&Number.isInteger(value.page)&&value.page>=1&&value.page<=extraction.pageCount&&Number.isInteger(value.xref)&&value.xref>0&&/^(job_api_http_[0-9]{3}|job_request_failed|job_response_invalid|figure_response_invalid|figure_upload_failed)$/.test(value.code)).slice(0,80).map(value=>({page:value.page,xref:value.xref,code:value.code})):[];
      const quality={status:unreadablePages.length?'needs_review':'parser_verified',countBasis:'pdf_parser',actualPageCountVerified:true,reportedPageCount:extraction.pageCount,uniquePageCount:pages.length,missingPages:[],duplicatePages:[],invalidPages:[],unreadablePages,emptyPages:pages.filter(page=>!page.text&&page.method!=='blank_page').map(page=>page.page),blankPages:pages.filter(page=>page.method==='blank_page').map(page=>page.page),warnings,canReuseText:!unreadablePages.length&&pages.some(page=>!!page.text)};
      if(validationOnly||figuresOnly){
        const metrics={...(validationOnly?{validationOnly:true}:{figuresOnly:true}),pageCount:pages.length,nativePages:pages.filter(page=>page.method==='native').length,ocrPages:pages.filter(page=>['ocr','gemini_ocr'].includes(page.method)).length,blankPages:quality.blankPages,unreadablePages,figureCount:figures.length,storedFigureCount,unstoredFigureCount:figures.length-storedFigureCount,figureUploadFailureCount:figureUploadFailures.length,figureUploadFailures,textCharacters:pages.reduce((count,page)=>count+page.text.length,0)};
        await patchJob(job.id,{status:'completed',progress:metrics,error:null},'&status=eq.running');
        return reply(200,{ok:true,completed:true,...(validationOnly?{validationOnly:true}:{figuresOnly:true}),metrics,quality});
      }
      const sourceExtraction={jobId:job.id,pageCount:extraction.pageCount,pages,warnings,figures,storedFigureCount,figureUploadFailures,quality},old=object(draft.draft_json)?draft.draft_json:{};
      const saved=await db('intmed_content_drafts?id=eq.'+draft.id+'&review_revision=eq.'+job.expected_revision+'&status=in.(draft_ready,approved,publish_error,error,processing,waiting_provider)','PATCH',{draft_json:{...old,documentExtraction:sourceExtraction,lessonDrafts:[],flashcardDrafts:[],mcqDrafts:[],kfDrafts:[],generation:{phase:'analysis',generated:[],available:['lesson','flashcards','mcq','kf'],extractionJobId:job.id}},extracted_text:pages.map(page=>'صفحه '+page.page+'\n'+page.text).join('\n\n'),review_revision:job.expected_revision+1,reviewed_by:null,reviewed_at:null,status:'processing',error_code:null,updated_at:new Date().toISOString()},{Prefer:'return=representation'});
      if(!saved.length)return reply(409,{message:'پیش‌نویس تغییر کرده است.',code:'stale_revision'});
      return reply(200,await finishRouting(job,quality,{pageCount:pages.length,unreadablePages,figureCount:figures.length,storedFigureCount,figureUploadFailureCount:figureUploadFailures.length}));
    }
    return reply(400,{message:'Unknown action'});
  }catch(error){return reply(error?.status===429?429:503,{message:'سرویس پردازش ابری پاسخ نداد.',code:clean(error instanceof Error?error.message:'job_failed',100)});}
});
