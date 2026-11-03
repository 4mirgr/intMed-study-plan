import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('backend/supabase/functions/intmed-content-worker/index.ts','utf8');
const ingestId='11111111-1111-4111-8111-111111111111';
async function run({extraction,finishReason='STOP',raw,kind='pdf'}){
  const saves=[],updates=[],calls=[];let handler,claimed=false;
  const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service',SUPABASE_ANON_KEY:'anon',GEMINI_API_KEY:'model-key',INTMED_EXTRACTION_MODEL:'test-extractor'};
  const fetch=async(url,options={})=>{
    calls.push({url,options});
    if(url.endsWith('/content/taxonomy.json'))return Response.json({categories:[{label:'عفونی',topics:[{id:'id-cns',label:'انسفالیت'}]}]});
    if(url.includes('/rpc/claim_intmed_content_ingest')){if(claimed)return Response.json(null);claimed=true;return Response.json(ingestId);}
    if(url.includes('/rpc/release_intmed_content_lease'))return new Response(null,{status:204});
    if(url.includes('/intmed_content_ingest?')){
      if(options.method==='PATCH'){updates.push(JSON.parse(options.body));return new Response(null,{status:204});}
      return Response.json([{id:ingestId,kind,mime_type:kind==='pdf'?'application/pdf':'text/plain',content_text:'متن\nمنبع',storage_path:'source.pdf',byte_size:123}]);
    }
    if(url.includes('/intmed_bot_topic_hints?'))return Response.json([]);
    if(url.includes('/intmed_content_drafts?on_conflict=')){saves.push(JSON.parse(options.body));return new Response(null,{status:204});}
    if(url.includes('/storage/v1/object/'))return new Response('%PDF-1.7 source');
    if(url.includes('generativelanguage.googleapis.com'))return Response.json({candidates:[{finishReason,content:{parts:[{text:raw??JSON.stringify({title:'عنوان',sourceSummary:'خلاصه',suggestedTopicId:'id-cns',confidence:.8,documentExtraction:extraction})}]}}]});
    throw Error('Unexpected mock URL: '+url);
  };
  const context=vm.createContext({Deno:{serve:fn=>handler=fn,env:{get:key=>env[key]}},fetch,Response,Request,crypto,btoa,console});
  vm.runInContext(source,context);
  const response=await handler(new Request('https://project.supabase.co/functions/v1/intmed-content-worker',{method:'POST',headers:{authorization:'Bearer service','content-type':'application/json'},body:JSON.stringify({ingestId})}));
  return {saves,updates,calls,response:await response.json(),quality:value=>JSON.parse(JSON.stringify(vm.runInContext('extractionQuality('+JSON.stringify(value)+')',context)))};
}

const page=(number,text='خط اول\nخط دوم')=>({page:number,heading:'بخش',text,unreadable:false});
const complete={pageCount:2,pages:[page(1),page(2)],warnings:[]};
const good=await run({extraction:complete});
assert.equal(good.response.processed,1);
const draft=good.saves.find(save=>save.status==='draft_ready');
assert.ok(draft);
assert.match(draft.extracted_text,/خط اول\nخط دوم/,'source line boundaries must survive extraction');
assert.equal(draft.draft_json.documentExtraction.quality.status,'model_reported_complete');
assert.equal(draft.draft_json.documentExtraction.quality.actualPageCountVerified,false,'model reports must never masquerade as parser verification');
assert.equal(draft.draft_json.documentExtraction.quality.canReuseText,true);
assert.ok(good.calls.some(call=>call.url.includes('/models/test-extractor:')),'role-specific extractor model must be used');

for(const [extraction,key] of [
  [{pageCount:3,pages:[page(1),page(3)],warnings:[]},'missingPages'],
  [{pageCount:2,pages:[page(1),page(1)],warnings:[]},'duplicatePages'],
  [{pageCount:2,pages:[page(1),page(4)],warnings:[]},'invalidPages'],
  [{pageCount:1,pages:[{...page(1),unreadable:true}],warnings:[]},'unreadablePages'],
  [{pageCount:1,pages:[page(1,'')],warnings:[]},'emptyPages'],
  [{pageCount:1,pages:[page(1,'x'.repeat(3500))],warnings:[]},'warnings'],
]){
  const quality=good.quality(extraction);
  assert.equal(quality.status,'needs_review');
  assert.equal(quality.canReuseText,false);
  assert.ok(quality[key].length,key+' must identify the extraction gap');
}
assert.equal(good.quality({pageCount:61,pages:Array.from({length:60},(_,i)=>page(i+1)),warnings:[]}).canReuseText,false);

for(const input of [{extraction:complete,finishReason:'MAX_TOKENS'},{raw:'{"title":'},{extraction:{pageCount:1,pages:[],warnings:[]}}]){
  const failed=await run(input);
  assert.equal(failed.response.failed,1);
  assert.ok(!failed.saves.some(save=>save.status==='draft_ready'),'incomplete provider responses must not become ready drafts');
  assert.ok(failed.saves.some(save=>save.status==='error'&&save.error_code.startsWith('extraction_')));
  assert.ok(!failed.updates.some(update=>update.status==='accepted'),'failed source must remain retryable');
}
console.log('Extraction quality passed: model-reported coverage, missing/duplicate/unreadable pages, limits, multiline text, role selection and truncated-response recovery.');
