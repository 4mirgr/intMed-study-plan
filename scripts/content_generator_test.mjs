import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code=fs.readFileSync('backend/supabase/functions/intmed-content-generator/index.ts','utf8');
const id='11111111-1111-4111-8111-111111111111';
const lesson={lessonDrafts:[{heading:'تشخیص',paragraphs:['درگیری پارانشیم مغز نیازمند بررسی فوری است.'],keyPoints:['MRI و CSF'],sourcePages:[1]}]};
const mcq={mcqDrafts:[{stem:'بررسی مناسب چیست؟',options:['MRI','ECG','اسپیرومتری','کولونوسکوپی'],correctIndex:0,explanation:'با توجه به درگیری عصبی MRI مناسب است.',optionExplanations:['بررسی مغز','بررسی قلب','بررسی ریه','بررسی کولون'],sourcePages:[1]}]};
const extraction={pageCount:1,pages:[{page:1,heading:'انسفالیت',text:'درگیری پارانشیم مغز؛ بررسی MRI و CSF',unreadable:false}],quality:{canReuseText:true}};

async function run({outputs=['mcq'],draftJson={documentExtraction:extraction},conflict=false,finishReason='STOP',responses=[lesson,mcq],kind='pdf',providerStatus=200,failOnCall=0}={}){
  let handler,modelCalls=[],storageCalls=0,writes=[],row={id,ingest_id:id,status:'draft_ready',title:'انسفالیت',review_revision:2,draft_json:structuredClone(draftJson)};
  const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service',GEMINI_API_KEY:'test',INTMED_LESSON_MODEL:'lesson-model',INTMED_ASSESSMENT_MODEL:'assessment-model'};
  const fetchMock=async(url,options={})=>{
    if(url.includes('/rest/v1/intmed_content_drafts?')){
      if(options.method==='PATCH'){
        assert.match(url,/review_revision=eq\.[23]/);
        assert.match(url,/status=in\.\(draft_ready,approved,publish_error\)/);
        assert.equal(options.headers.Prefer,'return=representation');
        if(conflict)return Response.json([]);
        const patch=JSON.parse(options.body);writes.push(patch);row={...row,...patch};return Response.json([row]);
      }
      return Response.json([row]);
    }
    if(url.includes('/rest/v1/intmed_content_ingest?'))return Response.json([{id,kind,mime_type:kind==='text'?'text/plain':'application/pdf',content_text:'متن منبع',storage_path:'private/file.pdf',byte_size:30}]);
    if(url.includes('/storage/')){storageCalls++;return new Response('PDF bytes');}
    if(url.includes('generativelanguage.googleapis.com')){
      const body=JSON.parse(options.body);modelCalls.push({url,body});
      if(providerStatus!==200||modelCalls.length===failOnCall)return Response.json({error:{message:'rate limit'}},{status:providerStatus!==200?providerStatus:429});
      const response=responses[modelCalls.length-1]||mcq;
      return Response.json({candidates:[{finishReason,content:{parts:[{text:JSON.stringify(response)}]}}],usageMetadata:{totalTokenCount:100}});
    }
    throw Error('unexpected '+url);
  };
  const context=vm.createContext({Deno:{serve:fn=>handler=fn,env:{get:key=>env[key]}},fetch:fetchMock,Request,Response,TextEncoder,Uint8Array,btoa,console});
  vm.runInContext(code,context);
  const response=await handler(new Request('https://project.supabase.co/generate',{method:'POST',headers:{authorization:'Bearer service'},body:JSON.stringify({draftId:id,outputs})}));
  return {status:response.status,result:await response.json(),modelCalls,storageCalls,writes};
}

let value=await run();
assert.equal(value.status,200);assert.equal(value.storageCalls,0,'complete reusable extraction must avoid downloading PDF');
assert.equal(value.modelCalls.length,2,'assessment-only request should create missing lesson first');
assert.match(value.modelCalls[0].url,/lesson-model/);assert.match(value.modelCalls[1].url,/assessment-model/);
assert.ok(!JSON.stringify(value.modelCalls).includes('inlineData'),'cached extraction should use text only');
assert.match(value.modelCalls[1].body.contents[0].parts[0].text,/درگیری پارانشیم مغز نیازمند بررسی فوری/);
assert.equal(value.writes[0].draft_json.generation.phase,'lesson_ready');
assert.equal(value.writes[1].review_revision,4);assert.equal(value.writes[1].status,'draft_ready');
assert.deepEqual(value.writes[1].draft_json.mcqDrafts[0].sourcePages,[1]);
assert.equal(value.writes[1].draft_json.generation.clinicalReview,'pending_teacher');

value=await run({failOnCall:2});
assert.equal(value.status,429);assert.equal(value.writes.length,1,'a failed assessment must preserve the completed lesson checkpoint');
assert.equal(value.writes[0].draft_json.lessonDrafts.length,1);assert.match(value.result.message,/درسنامهٔ ذخیره‌شده محفوظ/);

value=await run({draftJson:{documentExtraction:extraction,...lesson},responses:[mcq]});
assert.equal(value.modelCalls.length,1,'an existing lesson should be reused for assessments');
assert.equal(value.status,200);

value=await run({outputs:['lesson'],draftJson:{documentExtraction:{...extraction,quality:{canReuseText:false}}},responses:[lesson]});
assert.equal(value.storageCalls,1,'uncertain extraction must fall back to original source');
assert.ok(value.modelCalls[0].body.contents[0].parts.some(part=>part.inlineData));

value=await run({conflict:true});
assert.equal(value.status,409);assert.equal(value.result.code,'stale_revision');assert.equal(value.modelCalls.length,1);assert.equal(value.writes.length,0);
value=await run({finishReason:'MAX_TOKENS'});
assert.equal(value.status,503);assert.equal(value.result.code,'incomplete_model_response');assert.equal(value.writes.length,0);
value=await run({outputs:['mcq'],draftJson:{documentExtraction:extraction,...lesson},responses:[{mcqDrafts:[{...mcq.mcqDrafts[0],sourcePages:[2]}]}]});
assert.equal(value.result.code,'invalid_artifact_schema');assert.equal(value.writes.length,0,'invented page citations must not be saved');
value=await run({outputs:['lesson'],draftJson:{documentExtraction:extraction,...mcq},responses:[lesson]});
assert.deepEqual(value.writes[0].draft_json.mcqDrafts,[],'regenerated lesson invalidates assessments from the old lesson');
value=await run({outputs:['mcq'],draftJson:{documentExtraction:extraction,...lesson},responses:[{mcqDrafts:[{...mcq.mcqDrafts[0],options:['الف','الف','ب','ج']}]}]});
assert.equal(value.result.code,'duplicate_mcq_options');
value=await run({draftJson:{},outputs:['lesson']});
assert.equal(value.status,409);assert.equal(value.result.code,'source_page_map_required');assert.equal(value.modelCalls.length,0);
console.log('Content generator passed: lesson-first checkpoint, role-specific models, evidence-linked assessments, cached source reuse, stale edit protection and incomplete/invalid output rejection.');
