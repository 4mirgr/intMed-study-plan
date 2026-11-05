import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const code=fs.readFileSync('backend/supabase/functions/intmed-content-generator/index.ts','utf8');
const id='11111111-1111-4111-8111-111111111111';
const pages=[{page:1,text:'سؤال ۱: بررسی مناسب برای درگیری مغز چیست؟\nالف) MRI\nب) ECG\nج) اسپیرومتری\nد) کولونوسکوپی',unreadable:false},
  {page:2,text:'پاسخنامه\n۱: الف\nتوضیح: MRI برای بررسی مغز به کار می‌رود.',unreadable:false}];
const q={sourceNumber:'۱',stem:'بررسی مناسب برای درگیری مغز چیست؟',stemEvidence:'بررسی مناسب برای درگیری مغز چیست؟',options:['MRI','ECG','اسپیرومتری','کولونوسکوپی'],correctIndex:0,explanation:'MRI برای بررسی مغز به کار می‌رود.',sourcePages:[1],answerSourcePages:[2],answerEvidence:'۱: الف',issues:[]};
async function run({sourcePages=pages,questions=[q],bank,request={},responses,sourceMode='question_bank'}={}){
  let handler,calls=[],writes=[],row={id,ingest_id:id,title:'بانک سؤال',status:'draft_ready',review_revision:2,draft_json:{documentExtraction:{pageCount:sourcePages.length,pages:sourcePages,quality:{canReuseText:true}},...(bank?{questionBank:bank}:{})}};
  const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service',GEMINI_API_KEY:'test'};
  const context=vm.createContext({Deno:{serve:fn=>handler=fn,env:{get:key=>env[key]}},Request,Response,TextEncoder,Uint8Array,btoa,crypto:webcrypto,console,fetch:async(url,options={})=>{
    if(url.includes('/rest/v1/intmed_content_drafts?')){if(options.method==='PATCH'){const patch=JSON.parse(options.body);writes.push(patch);row={...row,...patch};}return Response.json([row]);}
    if(url.includes('/rest/v1/intmed_content_ingest?'))return Response.json([{id,kind:'pdf'}]);
    if(url.includes('generativelanguage.googleapis.com')){calls.push(JSON.parse(options.body));return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(responses?.[calls.length-1]||{questions})}]}}]});}
    throw Error('unexpected '+url);
  }});
  vm.runInContext(code,context);
  const body={draftId:id,outputs:['source_questions'],chunkIndex:0,runId:'question-run-0001',sourceMode,...request};
  const response=await handler(new Request('https://project.supabase.co/generate',{method:'POST',headers:{authorization:'Bearer service'},body:JSON.stringify(body)}));
  return {status:response.status,result:await response.json(),calls,writes,context,row};
}

let r=await run();
assert.equal(r.status,200,'internal source preparation must retain original questions before lessons');
assert.equal(r.result.complete,true);
let bank=r.result.draft.draft_json.questionBank;
assert.equal(bank.complete,true);assert.equal(bank.questions[0].status,'ready');assert.equal(bank.questions[0].correctIndex,0);
assert.deepEqual(bank.questions[0].answerSourcePages,[2]);assert.equal(bank.questions[0].sourceNumber,'1');
assert.equal(r.writes[0].reviewed_at,null,'extraction never performs medical approval');
r=await run({bank});assert.equal(r.calls.length,0,'unchanged source preparation reuses cached evidence');
r=await run({questions:[{...q,correctIndex:null,answerEvidence:'',answerSourcePages:[]}]});
assert.equal(r.status,200);assert.equal(r.result.draft.draft_json.questionBank.questions[0].status,'needs_review');
assert.equal(r.result.draft.draft_json.questionBank.questions[0].correctIndex,null);
r=await run({questions:[{...q,correctIndex:1,answerEvidence:'۱: الف'}]});
assert.equal(r.result.draft.draft_json.questionBank.questions[0].status,'needs_review','key mismatch cannot silently become a usable question');
r=await run({questions:[{...q,answerEvidence:'این پاسخ اصلاً در فایل نیست'}]});
assert.equal(r.result.draft.draft_json.questionBank.questions[0].status,'needs_review');
r=await run({sourcePages:[pages[0]],questions:[{...q,correctIndex:1,answerSourcePages:[1],answerEvidence:'ECG',explanation:''}]});
assert.equal(r.result.draft.draft_json.questionBank.questions[0].status,'needs_review','a distractor appearing in the question is not evidence for an answer');
r=await run({questions:[{...q,stem:'بررسی مناسب برای درگیری مغز با دوز ۲۰ چیست؟'}]});
assert.equal(r.result.draft.draft_json.questionBank.questions[0].status,'needs_review','cleanup cannot introduce clinical numbers');
r=await run({questions:[{...q,options:['دوز ساختگی ۲۰','ECG','اسپیرومتری','کولونوسکوپی']}]});
assert.equal(r.result.draft.draft_json.questionBank.questions[0].status,'needs_review','options must be grounded in their question pages');
r=await run({questions:[{...q,explanation:'دوز ساختگی خارج از پاسخنامه'}]});
assert.equal(r.result.draft.draft_json.questionBank.questions[0].status,'needs_review','extraction cannot fabricate source explanations');
r=await run({questions:[{...q,options:['ECG','MRI','اسپیرومتری','کولونوسکوپی']}]});
assert.equal(r.result.draft.draft_json.questionBank.questions[0].status,'needs_review','original option ordering must survive extraction');
r=await run({questions:[]});
assert.equal(r.status,200);assert.equal(r.result.draft.draft_json.questionBank.questions[0].status,'needs_review','detectable but omitted questions remain visible, never silently disappear');
assert.ok(r.result.draft.draft_json.questionBank.questions[0].issues.includes('question_not_extracted'));
r=await run({sourcePages:[pages[0],{...pages[1],text:'پاسخنامه\n۱: الف\n۱: ب'}]});
assert.equal(r.result.draft.draft_json.questionBank.questions[0].status,'needs_review','conflicting explicit keys withhold the question');
r=await run({request:{outputs:['lesson']}});assert.equal(r.status,409);assert.equal(r.calls.length,0,'question sources require the cached source stage, never bypass to prose generation');
r=await run({sourceMode:'prose'});assert.equal(r.status,200);assert.equal(r.calls.length,0,'explicit prose mode needs no extra model call');

// Answer-page context remains available to a question chunk far earlier in the source.
const distant=[pages[0],{page:2,text:'شرح '.repeat(3200),unreadable:false},{page:3,text:'شرح '.repeat(3200),unreadable:false},{...pages[1],page:4}];
r=await run({sourcePages:distant,questions:[{...q,answerSourcePages:[4]}]});
assert.equal(r.status,200);assert.equal(r.result.complete,false);
assert.ok(JSON.stringify(r.calls[0].contents).includes('۱: الف'),'end-of-file answer key must accompany early question chunks');
const continued=[{...pages[0],text:pages[0].text.replace('۱','۲')},pages[1],{page:3,text:'۲: الف',unreadable:false}];
r=await run({sourcePages:continued,questions:[{...q,sourceNumber:'۲',answerSourcePages:[3],answerEvidence:'۲: الف',explanation:''}]});
assert.equal(r.status,200);assert.equal(r.result.draft.draft_json.questionBank.questions[0].status,'ready','answer keys continuing onto a page without a repeated heading still resolve');

r=await run({bank,request:{outputs:['mcq']}});
assert.equal(r.status,200);assert.equal(r.calls.length,0,'original source MCQs must not be regenerated from a paraphrased lesson');
const original=r.result.draft.draft_json.mcqDrafts[0];
assert.equal(original.sourceQuestionId,bank.questions[0].id);assert.equal(original.origin,'source');
assert.deepEqual(original.options,q.options);assert.equal(original.correctIndex,0);
assert.deepEqual(original.sourcePages,[1,2],'published references include question and answer pages');
const blocked={...bank,questions:[{...bank.questions[0],status:'needs_review',issues:['answer_key_conflict']}]};
r=await run({bank:blocked,request:{outputs:['lesson']}});
assert.equal(r.status,409);assert.equal(r.calls.length,0,'withheld questions cannot feed generated teaching content');
const mixed={...bank,questions:[...bank.questions,{...bank.questions[0],id:'bad-q',stem:'SECRET_UNSUPPORTED_QUESTION',status:'needs_review',issues:['answer_missing']}]};
const lessonResult={lessonDrafts:[{heading:'بررسی مغز',paragraphs:['MRI در سؤال منبع پاسخ صحیح است.'],keyPoints:['MRI'],sourcePages:[1,2]}]};
r=await run({bank:mixed,request:{outputs:['lesson']},responses:[lessonResult]});
assert.equal(r.status,200);assert.ok(!JSON.stringify(r.calls).includes('SECRET_UNSUPPORTED_QUESTION'),'only verified source questions feed derived lessons');
assert.ok(JSON.stringify(r.calls).includes('پاسخ مستند'),'lesson instructions require supported answer-based synthesis');
console.log('Question-first source preparation passed: evidence-linked original MCQs, distant keys, cache, conflicts and unsupported answers withheld.');
