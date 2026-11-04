import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {crc32} from 'node:zlib';

const code=fs.readFileSync('backend/supabase/functions/intmed-content-jobs/figures.ts','utf8').replace('export async function','async function')+'\n'+fs.readFileSync('backend/supabase/functions/intmed-content-jobs/index.ts','utf8').replace("import {ocrPage} from './ocr.ts';",'').replace("import {saveFigure} from './figures.ts';",'');
const draftId='11111111-1111-4111-8111-111111111111',ingestId='22222222-2222-4222-8222-222222222222',jobId='33333333-3333-4333-8333-333333333333';
const sha=async text=>Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(text))).toString('hex');

async function harness({kind='generate',outputs=['lesson','mcq'],revision=4,progress={},chunks=1,failFirstStep=false,failFirstUpload=false,routingResult={processed:1}}={}){
  let handler,dispatches=[],generator=[],wakes=0,ocrCalls=0,figures=[],uploads=[];
  const capability='a'.repeat(64),job={id:jobId,draft_id:draftId,ingest_id:ingestId,kind,outputs,status:'queued',expected_revision:revision,progress,capability_hash:await sha(capability),expires_at:'2099-01-01T00:00:00Z',created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
  let draft={id:draftId,ingest_id:ingestId,status:'draft_ready',review_revision:revision,draft_json:{lessonDrafts:[{heading:'old',paragraphs:['prior lesson']}],sourceEvidence:['original evidence']}};
  const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service',INTMED_GITHUB_ACTIONS_TOKEN:'github-secret'};
  const fetchMock=async(url,options={})=>{
    if(url.includes('api.github.com')){dispatches.push(JSON.parse(options.body));return new Response(null,{status:204});}
    if(url.includes('/functions/v1/intmed-content-worker')){
      wakes++;assert.equal(job.status,'running','job cannot finish before routing acknowledgement');assert.equal(draft.status,'processing','generation must remain blocked until routing finishes');
      if(routingResult.processed)draft={...draft,status:'draft_ready'};
      if(routingResult.waitingProvider)draft={...draft,status:'waiting_provider'};
      return Response.json(routingResult);
    }
    if(url.includes('/functions/v1/intmed-content-generator')){
      const input=JSON.parse(options.body);generator.push(input);assert.equal(input.revision,draft.review_revision);
      if(failFirstStep&&generator.length===1)return Response.json({message:'temporary',code:'provider_rate_limited'},{status:429});
      draft={...draft,review_revision:draft.review_revision+1};
      return Response.json({ok:true,draft,nextChunkIndex:input.chunkIndex+1,totalChunks:chunks,complete:input.chunkIndex+1>=chunks});
    }
    if(url.includes('/storage/v1/object/sign/'))return Response.json({signedURL:'/object/sign/intmed-content-inbox/private.pdf?token=signed'});
    if(url.includes('/storage/v1/object/intmed-content-inbox/')){assert.ok(figures.length,'quota reservation precedes storage upload');uploads.push({url,...options});return Response.json({},{status:failFirstUpload&&uploads.length===1?503:200});}
    if(url.includes('/rest/v1/intmed_content_figures')){
      if(options.method==='PATCH'){const id=new URL(url).searchParams.get('id').slice(3);Object.assign(figures.find(row=>row.id===id),JSON.parse(options.body));return new Response(null,{status:204});}
      if(options.method==='POST'){const row=JSON.parse(options.body);const prior=figures.find(item=>item.sha256===row.sha256&&item.page===row.page);if(prior)return Response.json([]);figures.push({id:'44444444-4444-4444-8444-444444444444',...row});return Response.json([figures.at(-1)]);}
      return Response.json(figures);
    }
    const parsed=new URL(url),query=parsed.searchParams;
    if(url.includes('/rest/v1/intmed_content_jobs')){
      if(options.method==='POST'){
        Object.assign(job,JSON.parse(options.body),{id:jobId,status:'queued'});return Response.json([job]);
      }
      if(query.has('capability_hash')&&query.get('capability_hash')!=='eq.'+job.capability_hash)return Response.json([]);
      const state=query.get('status');
      if(state==='eq.queued'&&job.status!=='queued')return Response.json([]);
      if(state==='eq.running'&&job.status!=='running')return Response.json([]);
      if(state==='in.(queued,running)'&&!['queued','running'].includes(job.status))return Response.json([]);
      if(state==='eq.error'&&job.status!=='error')return Response.json([]);
      if(options.method==='PATCH'){Object.assign(job,JSON.parse(options.body));return Response.json([job]);}
      return Response.json([job]);
    }
    if(url.includes('/rest/v1/intmed_content_drafts')){
      if(options.method==='PATCH'){
        if(query.has('review_revision')&&query.get('review_revision')!=='eq.'+draft.review_revision)return Response.json([]);
        if(query.get('status')?.startsWith('eq.')&&query.get('status')!=='eq.'+draft.status)return Response.json([]);
        draft={...draft,...JSON.parse(options.body)};return Response.json([draft]);
      }
      return Response.json([draft]);
    }
    if(url.includes('/rest/v1/intmed_content_ingest')){
      if(options.method==='PATCH')return new Response(null,{status:204});
      return Response.json([{id:ingestId,kind:'pdf',status:'accepted',mime_type:'application/pdf',storage_path:'private/source.pdf',sha256:'b'.repeat(64),original_filename:'chapter.pdf'}]);
    }
    throw Error('unexpected '+url);
  };
  const context=vm.createContext({Deno:{serve:fn=>handler=fn,env:{get:key=>env[key]}},fetch:fetchMock,Request,Response,TextEncoder,Uint8Array,DataView,atob,crypto:webcrypto,ocrPage:async input=>{ocrCalls++;return {page:input.page,text:'OCR result',unreadable:false,method:'gemini_ocr'};}});
  vm.runInContext(code,context);
  const request=async(body,internal=false)=>{
    const response=await handler(new Request('https://project.supabase.co/functions/v1/intmed-content-jobs',{method:'POST',headers:{'content-type':'application/json',...(internal?{authorization:'Bearer service'}:{})},body:JSON.stringify(body)}));
    return {status:response.status,body:await response.json()};
  };
  const call=(action,more={})=>request({action,jobId,capability,...more});
  return {call,request,job,figures,uploads,get draft(){return draft;},set draft(value){draft=value;},generator,dispatches,get wakes(){return wakes;},get ocrCalls(){return ocrCalls;}};
}

// Real 128x128 RGB PNG produced by PyMuPDF; validates actual binary round trips.
const imageBase64='iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAIAAABMXPacAAAACXBIWXMAAA7EAAAOxAGVKw4bAAABKklEQVR4nO3RMQ0AAAjAMGQjHxk9WBUs2Wyo0QHfNQBrANYArAFYA7AGYA3AGoA1AGsA1gCsAVgDsAZgDcAagDUAawDWAKwBWAOwBmANwBqANQBrANYArAFYA7AGYA3AGoA1AGsA1gCsAVgDsAZgDcAagDUAawDWAKwBWAOwBmANwBqANQBrANYArAFYA7AGYA3AGoA1AGsA1gCsAVgDsAZgDcAagDUAawDWAKwBWAOwBmANwBqANQBrANYArAFYA7AGYA3AGoA1AGsA1gCsAVgDsAZgDcAagDUAawDWAKwBWAOwBmANwBqANQBrANYArAFYA7AGYA3AGoA1AGsA1gCsAVgDsAZgDcAagDUAawDWAKwBWAOwBmANwBqANQBrANYArAFYA7AGYAdvxAVHHb2EGQAAAABJRU5ErkJggg==';
const imageSha=Buffer.from(await webcrypto.subtle.digest('SHA-256',Buffer.from(imageBase64,'base64'))).toString('hex');
const figureInput={page:1,xref:12,width:128,height:128,sha256:imageSha,imageBase64};
const registerFigure=(app,input=figureInput,pageCount=1)=>app.call('figure_manifest',{pageCount,figures:[Object.fromEntries(['page','xref','width','height','sha256'].map(key=>[key,input[key]]))]});
const fakePng=Buffer.alloc(45);Buffer.from(imageBase64,'base64').copy(fakePng,0,0,33);fakePng.fill(0,29,33);fakePng.write('IEND',37);
const fakeJpeg=Buffer.from([255,216,255,192,0,11,8,0,128,0,128,1,1,17,0,255,217]);
const noIdat=Buffer.from(fakePng);noIdat.writeUInt32BE(crc32(noIdat.subarray(12,29)),29);noIdat.writeUInt32BE(crc32(noIdat.subarray(37,41)),41);
const corruptCrc=Buffer.from(imageBase64,'base64');corruptCrc[corruptCrc.length-1]^=1;
for(const bytes of [fakePng,noIdat,corruptCrc,fakeJpeg]){
 const corrupt=await harness({kind:'extract'});await corrupt.call('claim');
 const input={...figureInput,imageBase64:bytes.toString('base64'),sha256:Buffer.from(await webcrypto.subtle.digest('SHA-256',bytes)).toString('hex')};
 assert.equal((await registerFigure(corrupt,input)).status,200);
 assert.equal((await corrupt.call('figure_result',input)).status,400,'structurally corrupt image must fail even when its hash matches');assert.equal(corrupt.uploads.length,0);
}
const jpegBase64='/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAIBAQEBAQIBAQECAgICAgQDAgICAgUEBAMEBgUGBgYFBgYGBwkIBgcJBwYGCAsICQoKCgoKBggLDAsKDAkKCgr/2wBDAQICAgICAgUDAwUKBwYHCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgr/wgARCACAAIADAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGeAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8QAFBABAAAAAAAAAAAAAAAAAAAAgP/aAAgBAQABBQIAf//EABQRAQAAAAAAAAAAAAAAAAAAAID/2gAIAQMBAT8BAH//xAAUEQEAAAAAAAAAAAAAAAAAAACA/9oACAECAQE/AQB//8QAFBABAAAAAAAAAAAAAAAAAAAAgP/aAAgBAQAGPwIAf//EABQQAQAAAAAAAAAAAAAAAAAAAID/2gAIAQEAAT8hAH//2gAMAwEAAgADAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAID/2gAIAQMBAT8QAH//xAAUEQEAAAAAAAAAAAAAAAAAAACA/9oACAECAQE/EAB//8QAFBABAAAAAAAAAAAAAAAAAAAAgP/aAAgBAQABPxAAf//Z';
const jpegInput={...figureInput,imageBase64:jpegBase64,sha256:Buffer.from(await webcrypto.subtle.digest('SHA-256',Buffer.from(jpegBase64,'base64'))).toString('hex')};
const jpegApp=await harness({kind:'extract'});await jpegApp.call('claim');await registerFigure(jpegApp,jpegInput);
assert.equal((await jpegApp.call('figure_result',jpegInput)).status,200,'real progressive JPEG with multiple scans remains original');assert.match(jpegApp.uploads[0].url,/\.jpg$/);
let app=await harness({kind:'extract',outputs:[]}),response;
assert.equal((await app.call('figure_result',figureInput)).status,409);
await app.call('claim');
assert.equal((await app.call('figure_result',figureInput)).status,400,'upload must be bound to a frozen parser manifest');
assert.equal((await registerFigure(app)).status,200);assert.equal((await registerFigure(app)).body.cached,true);
assert.equal((await registerFigure(app,{...figureInput,page:2},2)).status,409,'registered inventory cannot drift');
assert.equal((await app.call('figure_result',{...figureInput,page:2000})).status,400);
assert.equal((await app.call('figure_result',{...figureInput,xref:13})).status,400);
for(const invalid of [{sha256:'0'.repeat(64)},{width:129},{page:0},{imageBase64:'not-an-image'},{imageBase64:Buffer.from('<svg></svg>').toString('base64')}])assert.equal((await app.call('figure_result',{...figureInput,...invalid})).status,400);
assert.equal(app.uploads.length,0);
response=await app.call('figure_result',{...figureInput,storage_path:'public/evil.png'});
assert.equal(response.status,200);assert.equal(app.figures.length,1);assert.equal(app.ocrCalls,0);
assert.equal(app.uploads[0].url,'https://project.supabase.co/storage/v1/object/intmed-content-inbox/figures/'+ingestId+'/'+imageSha+'.png');
assert.equal(Buffer.from(app.uploads[0].body).toString('base64'),imageBase64);
assert.equal((await app.call('figure_result',figureInput)).body.cached,true);assert.equal(app.uploads.length,1);
response=await app.call('extract_result',{extraction:{pageCount:1,pages:[{page:1,text:'Native evidence',unreadable:false}],figures:[{...figureInput,storedFigureId:'untrusted'}]}});
assert.equal(response.status,200);assert.equal(app.draft.draft_json.documentExtraction.figures[0].storedFigureId,app.figures[0].id);assert.equal(app.draft.draft_json.documentExtraction.storedFigureCount,1);
assert.equal((await app.call('figure_result',figureInput)).status,409);
app=await harness({kind:'extract',failFirstUpload:true});await app.call('claim');
await registerFigure(app);
assert.equal((await app.call('figure_result',figureInput)).status,503);assert.equal(app.figures.length,1);assert.equal(app.figures[0].stored,false);
assert.equal((await app.call('figure_result',figureInput)).status,200);assert.equal(app.figures.length,1);assert.equal(app.figures[0].stored,true);assert.equal(app.uploads.length,2);
app=await harness({kind:'generate'});await app.call('claim');assert.equal((await app.call('figure_result',figureInput)).status,400);
app=await harness({kind:'extract',progress:{validationOnly:true}});await app.call('claim');assert.equal((await app.call('figure_result',figureInput)).status,400);
app=await harness({kind:'extract'});await app.call('claim');
await registerFigure(app);
for(let i=0;i<80;i++)app.figures.push({id:String(i),sha256:'0'.repeat(64),page:i+1,byte_size:1});
assert.equal((await app.call('figure_result',figureInput)).status,503);assert.equal(app.uploads.length,0);
app.figures.splice(0);app.figures.push({sha256:'0'.repeat(64),page:1,byte_size:30*1024*1024});
assert.equal((await app.call('figure_result',figureInput)).status,503);assert.equal(app.uploads.length,0);

app=await harness({kind:'extract',progress:{figuresOnly:true}});app.draft.status='published';
const originalDraft=JSON.stringify(app.draft);await app.call('claim');await registerFigure(app);
assert.equal((await app.call('ocr_page',{page:1,imageBase64})).status,400);assert.equal(app.ocrCalls,0);
assert.equal((await app.call('figure_result',figureInput)).status,200);
response=await app.call('extract_result',{extraction:{pageCount:1,pages:[{page:1,text:'Existing source',unreadable:false}],figures:[figureInput,{...figureInput,xref:13,sha256:'e'.repeat(64)}],figureUploadFailures:[{page:1,xref:13,code:'job_api_http_503'},{page:1,xref:13,code:'private URL or token'}]}});
assert.equal(response.status,200);assert.equal(response.body.figuresOnly,true);assert.equal(response.body.metrics.storedFigureCount,1);
assert.equal(response.body.metrics.unstoredFigureCount,1);assert.equal(response.body.metrics.figureUploadFailureCount,1);assert.deepEqual(response.body.metrics.figureUploadFailures,[{page:1,xref:13,code:'job_api_http_503'}]);assert.ok(!JSON.stringify(response.body).includes('private URL'));
assert.equal(app.job.status,'completed');assert.equal(app.job.progress.figuresOnly,true);assert.equal(JSON.stringify(app.draft),originalDraft);assert.equal(app.wakes,0);assert.equal(app.generator.length,0);
app=await harness({kind:'extract',progress:{figuresOnly:true}});const beforeFailure=JSON.stringify(app.draft);await app.call('claim');await app.call('fail',{error:'bounded_error'});assert.equal(JSON.stringify(app.draft),beforeFailure);
app=await harness({kind:'extract'});app.job.status='completed';app.draft.status='published';
assert.equal((await app.request({action:'dispatch',kind:'extract',draftId,figuresOnly:true,validationOnly:true},true)).status,400);
response=await app.request({action:'dispatch',kind:'extract',draftId,figuresOnly:true},true);assert.equal(response.status,202);assert.equal(response.body.progress.figuresOnly,true);assert.equal(app.draft.status,'published');
assert.equal((await app.request({action:'dispatch',kind:'extract',draftId,figuresOnly:true},true)).status,409,'backfill cannot reuse a concurrently active job');

app=await harness();
assert.equal((await app.request({action:'dispatch',kind:'generate',draftId,outputs:['mcq']})).status,403);
assert.equal((await app.request({action:'status',draftId})).status,403);
assert.equal((await app.request({action:'claim',jobId,capability:'0'.repeat(64)})).status,403);
assert.equal((await app.request({action:'kick',jobId,capability:'0'.repeat(64)})).status,403);assert.equal(app.dispatches.length,0);
response=await app.call('kick');assert.equal(response.status,202);assert.equal(app.dispatches.length,1);assert.ok(!JSON.stringify(response.body).includes('capability'));
response=await app.call('claim');assert.equal(response.status,200);assert.equal(response.body.job.revision,4);assert.ok(!JSON.stringify(response.body).includes('service'));
assert.equal((await app.call('kick')).status,409);assert.equal(app.dispatches.length,1);
assert.equal((await app.call('claim')).status,409,'same capability cannot claim duplicate concurrent runner');
response=await app.call('generate_step',{output:'lesson'});assert.equal(response.body.completed,false);assert.deepEqual(response.body.progress.completedOutputs,['lesson']);assert.equal(app.job.expected_revision,5);
response=await app.call('generate_step',{output:'mcq'});assert.equal(response.body.completed,true);assert.equal(app.job.status,'completed');assert.equal(app.generator.length,2);
assert.equal((await app.call('kick')).status,409);assert.equal((await app.call('generate_step',{output:'mcq'})).body.cached,true);

app=await harness({outputs:['lesson'],failFirstStep:true});await app.call('claim');
assert.equal((await app.call('generate_step',{output:'lesson'})).status,429);assert.equal(app.job.status,'running');
assert.equal((await app.call('generate_step',{output:'lesson'})).body.completed,true,'transient provider error remains retryable');

app=await harness({outputs:['lesson'],chunks:2});await app.call('claim');
response=await app.call('generate_step',{output:'lesson'});assert.equal(response.body.outputComplete,false);assert.deepEqual(response.body.progress.completedOutputs,[]);assert.equal(response.body.nextChunkIndex,1);assert.equal(app.job.status,'running');
response=await app.call('generate_step',{output:'lesson'});assert.equal(response.body.completed,true);assert.equal(app.generator[1].chunkIndex,1);assert.equal(app.generator[1].runId,jobId);

app=await harness();await app.call('claim');app.draft={...app.draft,review_revision:5};
assert.equal((await app.call('generate_step',{output:'lesson'})).status,409);assert.equal(app.generator.length,0,'stale job never spends provider tokens');

app=await harness({outputs:['lesson'],progress:{runId:jobId}});await app.call('claim');
app.draft={...app.draft,review_revision:5,draft_json:{generation:{chunks:{runId:jobId},chunkProgress:{lesson:{runId:jobId,savedRevision:5}}}}};
assert.equal((await app.call('generate_step',{output:'lesson'})).status,200);assert.equal(app.generator[0].revision,5,'exact saved-chunk revision recovers a lost HTTP response');

app=await harness({kind:'extract',outputs:[]});response=await app.call('claim');
assert.match(response.body.job.source.downloadUrl,/object\/sign\/intmed-content-inbox/);
assert.equal((await app.call('extract_result',{extraction:{pageCount:2,pages:[{page:1,text:'first',unreadable:false},{page:1,text:'duplicate',unreadable:false}]}})).status,400);
assert.equal(app.job.status,'running');
response=await app.call('ocr_page',{page:2,imageBase64:'image'});assert.equal(response.status,200);
response=await app.call('ocr_page',{page:2,imageBase64:'same'});assert.equal(response.body.cached,true);assert.equal(app.ocrCalls,1,'OCR cache avoids repeated model spend');
response=await app.call('extract_result',{extraction:{pageCount:2,pages:[{page:1,text:'first\nsecond',unreadable:false,method:'native'},{page:2,text:'OCR result',unreadable:false,method:'gemini_ocr'}],warnings:[],figures:[{page:1,xref:12,width:500,height:400,sha256:'c'.repeat(64)}]}});
assert.equal(response.status,200);assert.equal(app.job.status,'completed');assert.equal(app.draft.draft_json.documentExtraction.quality.actualPageCountVerified,true);assert.equal(app.draft.draft_json.documentExtraction.quality.canReuseText,true);assert.equal(app.draft.draft_json.documentExtraction.pages[1].method,'gemini_ocr');assert.match(app.draft.extracted_text,/first\nsecond/);assert.deepEqual(app.draft.draft_json.lessonDrafts,[]);assert.equal(app.wakes,1);

app=await harness({kind:'extract',outputs:[]});await app.call('claim');
response=await app.call('extract_result',{extraction:{pageCount:1,pages:[{page:1,text:'',unreadable:true,method:'native'}]}});
assert.equal(response.body.quality.canReuseText,false);assert.deepEqual(response.body.quality.unreadablePages,[1]);

app=await harness({kind:'extract',outputs:[]});await app.call('claim');
response=await app.call('extract_result',{extraction:{pageCount:2,pages:[{page:1,text:'native source',unreadable:false,method:'native'},{page:2,text:'',unreadable:false,method:'blank_page'}]}});
assert.equal(response.body.quality.canReuseText,true);assert.deepEqual(response.body.quality.blankPages,[2]);

app=await harness({kind:'extract',outputs:[],routingResult:{processed:0,reason:'empty_or_busy'}});await app.call('claim');
response=await app.call('extract_result',{extraction:{pageCount:1,pages:[{page:1,text:'native extraction must survive',unreadable:false,method:'native'}]}});
assert.equal(response.status,200);assert.equal(response.body.completed,false);assert.equal(response.body.extractionSaved,true);assert.equal(app.job.status,'error');assert.equal(app.job.progress.stage,'routing');assert.equal(app.draft.status,'error');assert.match(app.draft.extracted_text,/must survive/);assert.equal(app.draft.draft_json.documentExtraction.quality.actualPageCountVerified,true);

app=await harness({kind:'extract',outputs:[],routingResult:{processed:0,waitingProvider:1}});await app.call('claim');
response=await app.call('extract_result',{extraction:{pageCount:1,pages:[{page:1,text:'preserved while provider waits',unreadable:false,method:'native'}]}});
assert.equal(response.body.routingError,'routing_waiting_provider');assert.equal(app.draft.status,'waiting_provider','do not erase provider waiting state');assert.equal(app.job.status,'error');

app=await harness({kind:'extract',outputs:[],progress:{validationOnly:true}});app.draft={...app.draft,status:'published'};
const untouched=JSON.stringify(app.draft);await app.call('claim');
response=await app.call('extract_result',{extraction:{pageCount:1,pages:[{page:1,text:'diagnostic native source',unreadable:false,method:'native'}]}});
assert.equal(response.status,200);assert.equal(response.body.validationOnly,true);assert.equal(app.job.progress.nativePages,1);assert.equal(app.job.progress.textCharacters,24);assert.equal(JSON.stringify(app.draft),untouched,'diagnostic never mutates published draft');assert.equal(app.wakes,0,'diagnostic never starts analysis');

app=await harness();
response=await app.request({action:'dispatch',kind:'generate',draftId,outputs:['mcq'],revision:4},true);
assert.equal(response.status,202);assert.equal(response.body.reused,true);assert.equal(app.dispatches.length,0,'active job dedup prevents duplicate runner');
app.job.status='completed';app.draft={...app.draft,draft_json:{}};
response=await app.request({action:'dispatch',kind:'generate',draftId,outputs:['mcq'],revision:4},true);
assert.equal(response.status,202);assert.deepEqual(app.job.outputs,['lesson','mcq']);assert.equal(app.dispatches.length,1);assert.ok(app.dispatches[0].inputs.capability);assert.ok(!JSON.stringify(response.body).includes('capability'));

app=await harness({progress:{runId:'old-run',nextChunkIndex:{lesson:2},completedOutputs:[]}});app.job.status='error';app.draft={...app.draft,draft_json:{}};
response=await app.request({action:'dispatch',kind:'generate',draftId,outputs:['mcq'],revision:4},true);
assert.equal(response.status,202);assert.equal(app.job.progress.runId,'old-run','retry retains generator namespace');assert.equal(app.job.progress.nextChunkIndex.lesson,2);

const sql=fs.readFileSync('backend/supabase/content_jobs.sql','utf8');
assert.match(sql,/enable row level security/);assert.match(sql,/revoke all.*from public,anon,authenticated/);assert.match(sql,/where kind='extract' and status in \('queued','running'\)/);
console.log('Content jobs passed: private capabilities, one-runner claims, revision-safe resumable generation, parser extraction validation, selective OCR cache and active-job deduplication.');
