import {createRequire} from 'node:module';import assert from 'node:assert/strict';import fs from 'node:fs';
const schema=JSON.parse(fs.readFileSync('content/_schema/topic-content.schema.json','utf8'));assert.ok(schema.properties.images.items.properties.kind.enum.includes('image'));assert.ok(schema.properties.images.items.properties.kind.enum.includes('pbs'));assert.deepEqual(schema.properties.images.items.properties.sourceClass.enum,['harrison-private','authored','open-license']);assert.match(fs.readFileSync('scripts/content_pipeline.py','utf8'),/"pbs"/);
const {chromium}=createRequire(import.meta.url)('playwright'),exe=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
const browser=await chromium.launch({headless:true,...(exe?{executablePath:exe}:{})}),owner='11111111-1111-4111-8111-111111111111';
const state={itemState:{},highlights:{},meta:{}},context=await browser.newContext({viewport:{width:390,height:844}});
await context.addInitScript(id=>localStorage.setItem('intmed_supabase_session',JSON.stringify({access_token:id,user:{id}})),owner);
await context.route(/https:\/\/(?:[^/]+\.supabase\.co|api\.drgerami-md\.ir)\//,async route=>{
 const req=route.request(),url=new URL(req.url());
 if(url.pathname==='/rest/v1/profiles'){const profile={id:owner,username:'library_qa',full_name:'بازبین کتابخانه',role:'user',approved:true};return route.fulfill({json:url.searchParams.has('id')?profile:[profile]});}
 if(url.pathname==='/rest/v1/study_state'){
  if(req.method()==='PATCH'){Object.assign(state,req.postDataJSON().state);return route.fulfill({json:[{user_id:owner,state}]});}
  return route.fulfill({json:[{user_id:owner,state,updated_at:'2026-10-24T10:00:00Z'}]});
 }
 if(url.pathname==='/rest/v1/tickets')return route.fulfill({json:[]});
 if(url.pathname==='/rest/v1/intmed_conversations')return route.fulfill({json:[]});
 if(url.pathname==='/functions/v1/intmed-telegram-bot')return route.fulfill({json:{ok:true}});
 if(url.pathname==='/functions/v1/intmed-content-review')return route.fulfill({json:{items:[],counts:{}}});
 throw Error('Unexpected request '+url.pathname);
});
await context.route('**/rest/v1/intmed_recovery_tickets?*',route=>route.fulfill({json:[]}));
await context.route('**/content/library.json',async route=>{
 const response=await route.fetch(),payload=await response.json();
 if(!payload.entries.some(entry=>entry.kind==='pbs'))payload.entries.push({...payload.entries.find(entry=>entry.field==='images'),id:'qa-pbs-entry',kind:'pbs'});
 return route.fulfill({json:payload});
});
await context.route(/\/content\/topics\/[^/]+\.json(?:\?.*)?$/,async route=>{
 if(new URL(route.request().url()).search)await new Promise(resolve=>setTimeout(resolve,250));
 const response=await route.fetch(),payload=await response.json();
 for(const image of payload.images||[])Object.assign(image,{credit:'PBS photographer QA',licenseLabel:'CC BY-SA 4.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/',originUrl:'https://commons.wikimedia.org/wiki/File:QA.jpg',changesNote:'اصل تصویر بدون تغییر؛ شرح فارسی تألیفی.'});
 return route.fulfill({json:payload});
});
const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
try{
 await page.goto(process.env.INTMED_BASE_URL||'http://127.0.0.1:8765');await page.waitForFunction(()=>document.getElementById('connStatus').textContent.includes('آنلاین'));await page.locator('#headerCollapseBtn').click();await page.locator('#tabBtnLibrary').click();
 await page.locator('.library-card').first().waitFor();assert.ok(await page.locator('.library-card').count()>20);assert.match(await page.locator('#libraryStatus').textContent(),/مورد پیدا شد/);
 assert.equal(await page.locator('#librarySourceClass option[value="harrison-private"]').textContent(),'منبع هاریسون · استفاده خصوصی');assert.equal(await page.locator('#librarySourceClass option[value="authored"]').textContent(),'منبع تألیفی');assert.equal(await page.locator('#librarySourceClass option[value="open-license"]').textContent(),'منبع آزاد اینترنتی');await page.locator('#librarySourceClass').selectOption('__none');assert.ok(await page.locator('.library-card').count()>20);await page.locator('#librarySourceClass').selectOption('');
	 assert.equal(await page.locator('#libraryKind option[value="pbs"]').textContent(),'PBS · لام خون محیطی');await page.locator('#libraryKind').selectOption('pbs');assert.ok(await page.locator('.library-card').count()>0);assert.equal(await page.locator('.library-kind').first().textContent(),'PBS · لام خون محیطی');
 assert.equal(await page.locator('#libraryMore').isVisible(),false,'PBS below one page must not show a stale load-more button');
 await page.locator('#libraryKind').selectOption('');assert.equal(await page.locator('.library-card').count(),48);
 await page.locator('#libraryMore').click();assert.equal(await page.locator('.library-card').count(),96,'load more appends the next page');
 assert.equal(new Set(await page.locator('.library-card').evaluateAll(rows=>rows.map(row=>row.dataset.libraryId))).size,96);
 await page.locator('#libraryKind').selectOption('algorithm');assert.ok(await page.locator('.library-card').count()>5);assert.equal(await page.locator('.library-kind').first().textContent(),'الگوریتم');
 const structuredEntry=JSON.parse(fs.readFileSync('docs/content/library.json','utf8')).entries.find(entry=>entry.kind==='algorithm'&&entry.field==='tables');assert.ok(structuredEntry);
 await page.locator('#librarySearch').fill(structuredEntry.title);
 const structuredCard=page.locator('.library-card[data-library-id="'+structuredEntry.id+'"]');
 await structuredCard.scrollIntoViewIfNeeded();await structuredCard.locator('.library-card-preview').waitFor({timeout:3000});
 assert.ok((await structuredCard.locator('.library-card-preview').textContent()).trim().length>10,'structured algorithms show actual content instead of a generic icon');
 const sourceTable=JSON.parse(fs.readFileSync('docs/content/topics/'+structuredEntry.topicId+'.json','utf8')).tables.find(item=>item.id===structuredEntry.itemId);
 const sourceCell=sourceTable.markdown.split('\n').find(line=>line.trim().startsWith('|')).replace(/^\s*\|/,'').split('|')[0].trim();
 assert.ok((await structuredCard.locator('.library-card-preview').textContent()).includes(sourceCell),'preview must contain the source table cells');
 await structuredCard.locator('.library-card-open').click();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#libraryViewerTitle').textContent(),structuredEntry.title,'a one-item search cannot navigate outside its results');
 await page.keyboard.press('Escape');assert.equal(await page.locator('#libraryViewer').isVisible(),false);assert.equal(await page.evaluate(()=>location.hash.startsWith('#library=')),false);
 await page.locator('#librarySearch').fill('');
 const algorithm=page.locator('.library-card').first();await algorithm.locator('.library-card-favorite').click();await page.waitForTimeout(700);const favoriteKey=Object.keys(state.itemState).find(key=>key.startsWith('library-favorite:'));assert.ok(favoriteKey);assert.equal(state.itemState[favoriteKey].favorite,true);
 await page.locator('#libraryFavoritesOnly').check();assert.equal(await page.locator('.library-card').count(),1);await page.locator('#libraryFavoritesOnly').uncheck();
 await page.locator('#libraryKind').selectOption('tracing');await page.locator('.library-card').first().waitFor();await page.locator('.library-card-open').first().click();await page.locator('#libraryViewer[open]').waitFor();await page.locator('.library-viewer-image').waitFor();assert.ok(await page.locator('.library-viewer-image').evaluate(image=>image.complete&&image.naturalWidth>0));
 const tracingTitles=await page.locator('.library-card-copy strong').allTextContents();assert.ok(tracingTitles.length>1);
 await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#libraryViewerTitle').textContent(),tracingTitles[1],'right arrow advances within the active filter');
 await page.keyboard.press('Alt+ArrowRight');assert.equal(await page.locator('#libraryViewerTitle').textContent(),tracingTitles[1],'modified keys must not navigate the gallery');
 await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('#libraryViewerTitle').textContent(),tracingTitles[0]);
 assert.equal(await page.locator('#libraryViewerPrevious').isDisabled(),true,'navigation stops at the first item');
 await page.locator('#libraryViewerNext').click();assert.equal(await page.locator('#libraryViewerTitle').textContent(),tracingTitles[1]);
 await page.locator('#libraryViewerPrevious').click();await page.locator('.library-viewer-image').waitFor();
 await page.evaluate(()=>{var field=document.createElement('textarea');field.id='qaViewerInput';document.getElementById('libraryViewerBody').appendChild(field);field.focus();});
 await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#libraryViewerTitle').textContent(),tracingTitles[0],'arrows while editing a field must not navigate');
 await page.locator('#qaViewerInput').evaluate(node=>node.remove());
 assert.match(await page.locator('#libraryViewerBody').textContent(),/PBS photographer QA.*CC BY-SA 4.0/s);
 assert.equal(await page.locator('#libraryViewerBody a[href="https://commons.wikimedia.org/wiki/File:QA.jpg"]').count(),1);
 assert.equal(await page.locator('#libraryViewerBody a[href="https://creativecommons.org/licenses/by-sa/4.0/"]').count(),1);
 assert.match(await page.locator('#libraryViewerBody').textContent(),/اصل تصویر بدون تغییر/);
 await page.waitForTimeout(700);assert.ok(Object.keys(state.itemState).includes('library:recent'));await page.locator('#libraryViewerTopic').click();await page.locator('#tabPanelEducation.active').waitFor();await page.locator('.topic-item.open .learn-panel.open').waitFor();assert.equal(await page.locator('.topic-item.open .learn-panel.open').count(),1);
 await page.locator('#tabBtnLibrary').click();await page.locator('#librarySearch').fill('ECG');assert.ok(await page.locator('.library-card').count()>0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Library creates mobile overflow');
 await page.screenshot({path:'/tmp/intmed-library-mobile.png',fullPage:true});await page.setViewportSize({width:1365,height:900});await page.screenshot({path:'/tmp/intmed-library-desktop.png',fullPage:true});assert.deepEqual(errors,[]);
 console.log('Library browser passed: generated discovery index, Persian search/filter, image viewer, private favorite/recent state, topic deep-link and mobile layout.');
}finally{await browser.close();}
