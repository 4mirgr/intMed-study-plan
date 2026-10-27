import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined});
const page=await browser.newPage();
await page.setContent(`<!doctype html><html lang="fa" dir="rtl"><body>
<button id="tabBtnManagement">مدیریت</button><span id="managementBadge" hidden></span>
<details id="contentReviewPanel" open><span id="contentReviewBadge" hidden></span><select id="contentReviewFilter"><option value="open">open</option></select><button id="contentReviewRefresh">refresh</button><p id="contentReviewStatus"></p><div id="contentReviewList"></div></details>
<dialog id="contentReviewDialog"><form method="dialog"><button>×</button></form><h2 id="contentReviewDialogTitle"></h2><p id="contentReviewDialogMeta"></p><div id="contentReviewSource"></div><input id="contentReviewTitle"><select id="contentReviewTopic"></select><textarea id="contentReviewSummary"></textarea><textarea id="contentReviewNote"></textarea><div id="contentReviewDraftBody"></div><input type="checkbox" id="contentReviewConfirm"><p id="contentReviewActionStatus"></p><button data-review-action="save">save</button><button data-review-action="approve">approve</button><button data-review-action="reject">reject</button><button data-review-action="reopen">reopen</button><button id="contentReviewExport">export</button></dialog>
</body></html>`);
await page.evaluate(()=>{
  window.__calls=[];
  window.INTMED_CONFIG={supabaseUrl:'https://example.supabase.co',supabaseAnonKey:'public-test-key'};
  const draft={id:'11111111-1111-4111-8111-111111111111',ingest_id:'22222222-2222-4222-8222-222222222222',status:'draft_ready',topic_id:'id-cns-meningoencephalitis',topic_confidence:.9,title:'انسفالیت',source_summary:'خلاصه',review_revision:0,updated_at:'2026-10-27T10:00:00Z',model:'gemma',draft_json:{lessonOutline:['تعریف'],sourceEvidence:[{claim:'تب'}],medicalWarnings:['نیازمند بازبینی'],insufficientEvidence:[],mcqDrafts:[],kfDrafts:[],imageCandidates:[]},intmed_content_ingest:{kind:'text',content_text:'متن منبع'}};
  window.fetch=async (url,options)=>{if(String(url).includes('taxonomy.json'))return {ok:true,json:async()=>({categories:[{label:'عفونی',topics:[{id:'id-cns-meningoencephalitis',label:'مننگوانسفالیت'}]}]})};const payload=JSON.parse(options.body);window.__calls.push(payload);const value=payload.action==='list'?{items:[draft],counts:{draft_ready:1}}:payload.action==='detail'?{draft,sourceUrl:null}:{message:'ok',draft:{...draft,status:payload.action==='approve'?'approved':'draft_ready',review_revision:1}};return {ok:true,status:200,text:async()=>JSON.stringify(value)};};
  window.IntMedBackend={session:()=>({access_token:'test-token'}),refreshSession:async()=>({access_token:'test-token'})};
});
await page.addScriptTag({path:path.join(root,'docs/js/intmed-content-review.js')});
await page.click('#contentReviewRefresh');
await page.waitForSelector('[data-review-id]');
assert.match(await page.textContent('#contentReviewList'),/انسفالیت/);
await page.click('[data-review-id]');
await page.waitForSelector('#contentReviewDialog[open]');
assert.equal(await page.inputValue('#contentReviewTopic'),'id-cns-meningoencephalitis');
await page.check('#contentReviewConfirm');
await page.click('[data-review-action="approve"]');
await page.waitForFunction(()=>window.__calls.some(call=>call.action==='approve'));
const approve=(await page.evaluate(()=>window.__calls)).find(call=>call.action==='approve');
assert.equal(approve.confirmMedicalReview,true);
assert.equal(approve.topicId,'id-cns-meningoencephalitis');
await browser.close();
console.log('Content review browser test passed.');
