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
<dialog id="contentReviewDialog"><form method="dialog"><button>×</button></form><h2 id="contentReviewDialogTitle"></h2><p id="contentReviewDialogMeta"></p><div id="contentReviewSource"></div><input id="contentReviewTitle"><input id="contentReviewTopicSearch" list="contentReviewTopicOptions"><datalist id="contentReviewTopicOptions"></datalist><input id="contentReviewTopic" type="hidden"><small id="contentReviewTopicHint"></small><button id="contentReviewNewTopicToggle">new</button><div id="contentReviewNewTopicFields" hidden><select id="contentReviewNewTopicCategory"></select><input id="contentReviewNewTopicLabel"></div><select id="contentReviewTargetKind"><option value="lesson">lesson</option><option value="image">image</option><option value="pbs">pbs</option></select><label id="contentReviewSourceClassField" hidden><select id="contentReviewSourceClass"><option value=""></option><option value="authored">authored</option></select><input id="contentReviewRightsNote"></label><textarea id="contentReviewSummary"></textarea><button id="contentReviewSummarySuggest">summary</button><textarea id="contentReviewNote"></textarea><div id="contentReviewDraftBody"></div><input type="checkbox" id="contentReviewConfirm"><p id="contentReviewActionStatus"></p><button data-review-action="save">save</button><button data-review-action="approve">approve</button><button data-review-action="publish" id="contentReviewPublish">publish</button><button data-review-action="reject">reject</button><button data-review-action="reopen">reopen</button><button id="contentReviewExport">export</button></dialog>
</body></html>`);
await page.evaluate(()=>{
  window.__calls=[];
  window.INTMED_CONFIG={supabaseUrl:'https://example.supabase.co',supabaseAnonKey:'public-test-key'};
  let draft={id:'11111111-1111-4111-8111-111111111111',ingest_id:'22222222-2222-4222-8222-222222222222',status:'draft_ready',topic_id:'id-cns-meningoencephalitis',topic_confidence:.9,title:'انسفالیت',source_summary:'خلاصه',review_revision:0,updated_at:'2026-10-27T10:00:00Z',model:'gemma',draft_json:{lessonOutline:['تعریف و رویکرد تشخیصی انسفالیت ویروسی'],sourceEvidence:[{claim:'تب و تغییر سطح هوشیاری از تظاهرات مهم هستند'},{claim:'MRI و بررسی CSF در ارزیابی تشخیصی نقش دارند'}],medicalWarnings:['نیازمند بازبینی'],insufficientEvidence:[],mcqDrafts:[],kfDrafts:[],imageCandidates:[]},intmed_content_ingest:{kind:'photo',mime_type:'image/png',content_text:'متن منبع'}};
  window.fetch=async (url,options)=>{if(String(url).includes('taxonomy.json'))return {ok:true,json:async()=>({categories:[{id:'id',label:'عفونی',topics:[{id:'id-cns-meningoencephalitis',label:'مننژیت و انسفالیت'}]}]})};const payload=JSON.parse(options.body);window.__calls.push(payload);if(payload.action==='list')return {ok:true,status:200,text:async()=>JSON.stringify({items:[draft],counts:{[draft.status]:1}})};if(payload.action==='detail')return {ok:true,status:200,text:async()=>JSON.stringify({draft,sourceUrl:null})};draft={...draft,status:payload.action==='approve'?'approved':payload.action==='publish'?'publish_requested':'draft_ready',review_revision:draft.review_revision+1,target_topic_is_new:payload.createTopic,target_topic_label:payload.newTopicLabel,target_category_id:payload.newTopicCategoryId,target_content_kind:payload.targetKind,target_source_class:payload.sourceClass,target_rights_note:payload.rightsNote,source_summary:payload.sourceSummary};return {ok:true,status:200,text:async()=>JSON.stringify({message:'ok',draft})};};
  window.IntMedBackend={session:()=>({access_token:'test-token'}),refreshSession:async()=>({access_token:'test-token'})};
});
await page.addScriptTag({path:path.join(root,'docs/js/intmed-content-review.js')});
await page.click('#contentReviewRefresh');
await page.waitForSelector('[data-review-id]');
assert.match(await page.textContent('#contentReviewList'),/انسفالیت/);
await page.click('[data-review-id]');
await page.waitForSelector('#contentReviewDialog[open]');
assert.equal(await page.inputValue('#contentReviewTopic'),'id-cns-meningoencephalitis');
assert.match(await page.inputValue('#contentReviewTopicSearch'),/مننژیت و انسفالیت/);
assert.ok((await page.inputValue('#contentReviewSummary')).length>=60);
assert.equal(await page.locator('#contentReviewNewTopicToggle').isVisible(),false);
await page.fill('#contentReviewTopicSearch','انسفالیت‌های نوپدید');
assert.equal(await page.locator('#contentReviewNewTopicToggle').isVisible(),true);
await page.click('#contentReviewNewTopicToggle');
await page.selectOption('#contentReviewNewTopicCategory','id');
await page.fill('#contentReviewNewTopicLabel','انسفالیت‌های نوپدید');
await page.selectOption('#contentReviewTargetKind','pbs');
await page.selectOption('#contentReviewSourceClass','authored');
await page.fill('#contentReviewRightsNote','تصویر تألیفی و مجاز برای انتشار عمومی');
await page.check('#contentReviewConfirm');
assert.equal(await page.locator('#contentReviewPublish').isVisible(),true);
assert.match(await page.textContent('#contentReviewPublish'),/تأیید و انتشار/);
page.once('dialog',dialog=>dialog.accept());
await page.click('#contentReviewPublish');
await page.waitForFunction(()=>window.__calls.some(call=>call.action==='approve'));
await page.waitForFunction(()=>window.__calls.some(call=>call.action==='publish'));
const approve=(await page.evaluate(()=>window.__calls)).find(call=>call.action==='approve');
assert.equal(approve.confirmMedicalReview,true);
assert.equal(approve.createTopic,true);
assert.equal(approve.newTopicCategoryId,'id');
assert.equal(approve.newTopicLabel,'انسفالیت‌های نوپدید');
assert.equal(approve.targetKind,'pbs');
assert.equal(approve.sourceClass,'authored');
assert.match(approve.rightsNote,/تألیفی/);
const publish=(await page.evaluate(()=>window.__calls)).find(call=>call.action==='publish');
assert.equal(publish.confirmPublish,true);
assert.equal(publish.targetKind,'pbs');
await browser.close();
console.log('Content review browser test passed.');
