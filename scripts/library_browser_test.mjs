import {createRequire} from 'node:module';import assert from 'node:assert/strict';import fs from 'node:fs';
const schema=JSON.parse(fs.readFileSync('content/_schema/topic-content.schema.json','utf8'));assert.ok(schema.properties.images.items.properties.kind.enum.includes('pbs'));assert.deepEqual(schema.properties.images.items.properties.sourceClass.enum,['harrison-private','authored','open-license']);assert.match(fs.readFileSync('scripts/content_pipeline.py','utf8'),/"pbs"/);
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
const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
try{
 await page.goto(process.env.INTMED_BASE_URL||'http://127.0.0.1:8765');await page.waitForFunction(()=>document.getElementById('connStatus').textContent.includes('آنلاین'));await page.locator('#headerCollapseBtn').click();await page.locator('#tabBtnLibrary').click();
 await page.locator('.library-card').first().waitFor();assert.ok(await page.locator('.library-card').count()>20);assert.match(await page.locator('#libraryStatus').textContent(),/مورد پیدا شد/);
 assert.equal(await page.locator('#librarySourceClass option[value="harrison-private"]').textContent(),'منبع هاریسون · استفاده خصوصی');assert.equal(await page.locator('#librarySourceClass option[value="authored"]').textContent(),'منبع تألیفی');assert.equal(await page.locator('#librarySourceClass option[value="open-license"]').textContent(),'منبع آزاد اینترنتی');await page.locator('#librarySourceClass').selectOption('__none');assert.ok(await page.locator('.library-card').count()>20);await page.locator('#librarySourceClass').selectOption('');
 assert.equal(await page.locator('#libraryKind option[value="pbs"]').textContent(),'PBS · لام خون محیطی');await page.locator('#libraryKind').selectOption('pbs');assert.equal(await page.locator('.library-card').count(),0);assert.match(await page.locator('#libraryStatus').textContent(),/موردی با این فیلتر پیدا نشد/);
 await page.locator('#libraryKind').selectOption('algorithm');assert.ok(await page.locator('.library-card').count()>5);assert.equal(await page.locator('.library-kind').first().textContent(),'الگوریتم');
 const algorithm=page.locator('.library-card').first();await algorithm.locator('.library-card-favorite').click();await page.waitForTimeout(700);const favoriteKey=Object.keys(state.itemState).find(key=>key.startsWith('library-favorite:'));assert.ok(favoriteKey);assert.equal(state.itemState[favoriteKey].favorite,true);
 await page.locator('#libraryFavoritesOnly').check();assert.equal(await page.locator('.library-card').count(),1);await page.locator('#libraryFavoritesOnly').uncheck();
 await page.locator('#libraryKind').selectOption('tracing');await page.locator('.library-card').first().waitFor();await page.locator('.library-card-open').first().click();await page.locator('#libraryViewer[open]').waitFor();await page.locator('.library-viewer-image').waitFor();assert.ok(await page.locator('.library-viewer-image').evaluate(image=>image.complete&&image.naturalWidth>0));
 await page.waitForTimeout(700);assert.ok(Object.keys(state.itemState).includes('library:recent'));await page.locator('#libraryViewerTopic').click();await page.locator('#tabPanelEducation.active').waitFor();assert.equal(await page.locator('.topic-item.open .learn-panel.open').count(),1);
 await page.locator('#tabBtnLibrary').click();await page.locator('#librarySearch').fill('ECG');assert.ok(await page.locator('.library-card').count()>0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Library creates mobile overflow');
 await page.screenshot({path:'/tmp/intmed-library-mobile.png',fullPage:true});await page.setViewportSize({width:1365,height:900});await page.screenshot({path:'/tmp/intmed-library-desktop.png',fullPage:true});assert.deepEqual(errors,[]);
 console.log('Library browser passed: generated discovery index, Persian search/filter, image viewer, private favorite/recent state, topic deep-link and mobile layout.');
}finally{await browser.close();}
