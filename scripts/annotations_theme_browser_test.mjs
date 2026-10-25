import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright'),exe=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
const browser=await chromium.launch({headless:true,...(exe?{executablePath:exe}:{})});
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',topic='cardio-ecg';
let admin=false;const profiles=[{id:owner,username:'qa',full_name:'پزشک آزمایشی',role:'user',approved:true},{id:other,username:'other',full_name:'کاربر دوم',role:'user',approved:true}];
const states={[owner]:{itemState:{},highlights:{},meta:{}},[other]:{itemState:{['favorite:'+topic]:{favorite:true}},meta:{},highlights:{}}};
const context=await browser.newContext({viewport:{width:390,height:844}});
await context.addInitScript(id=>localStorage.setItem('intmed_supabase_session',JSON.stringify({access_token:id,user:{id}})),owner);
await context.route(/https:\/\/(?:[^/]+\.supabase\.co|api\.drgerami-md\.ir)\//,async route=>{
 const req=route.request(),url=new URL(req.url()),uid=(req.headers().authorization||'').replace('Bearer ','')||owner;
 if(url.pathname==='/rest/v1/profiles'){
  const list=(admin?profiles:profiles.filter(p=>p.id===uid)).map(p=>p.id===owner?{...p,role:admin?'admin':'user'}:p);
  return route.fulfill({json:url.searchParams.has('id')?list.find(p=>p.id===uid):list});
 }
 if(url.pathname==='/rest/v1/study_state'){
  if(req.method()==='PATCH'){const body=req.postDataJSON();states[uid]=body.state;return route.fulfill({json:[{user_id:uid,...body}]});}
  const ids=url.searchParams.has('user_id')?[uid]:(admin?Object.keys(states):[uid]);
  return route.fulfill({json:ids.map(id=>({user_id:id,state:states[id],updated_at:'2026-10-21T10:00:00Z'}))});
 }
 if(url.pathname==='/rest/v1/tickets')return route.fulfill({json:[]});
 if(url.pathname==='/rest/v1/intmed_conversations')return route.fulfill({json:[]});
 throw Error('Unexpected request '+url.pathname);
});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await context.route('**/rest/v1/intmed_recovery_tickets?*',r=>r.fulfill({json:[]}));
try{
 const base=process.env.INTMED_BASE_URL||'http://127.0.0.1:8765';
 const payload=await (await page.request.get(base+'/content/topics/cardio-ecg.json')).json();
 const section=payload.lesson.find(s=>s.paragraphs&&s.paragraphs.length),paragraph=section.paragraphs[0];
 states[owner].itemState[topic]={note:'نوشته شخصی من'};
 states[owner].itemState['favorite:'+topic]={favorite:true};
 states[owner].highlights[topic]=[{id:'own-highlight',loc:'lesson:'+section.id+':'+paragraph.id,quote:paragraph.text,occurrence:0,color:'pink',note:'توضیح هایلایت من'}];
 states[other].itemState[topic]={note:'نباید در دفتر من دیده شود'};
 await page.goto(base);await page.waitForFunction(()=>document.getElementById('connStatus').textContent.includes('آنلاین'));await page.locator('#headerCollapseBtn').click();await page.locator('#tabBtnDashboard').click();
 assert.equal(await page.locator('#personalNotes .annotation-card').count(),2);
 assert.equal(await page.locator('#personalHighlights .annotation-card').count(),1);
 assert.ok((await page.locator('#personalNotes').textContent()).includes('خواندن و تفسیر ECG'));
 assert.ok(!(await page.locator('#personalNotes').textContent()).includes('نباید'));
 await page.locator('#annotationSearch').fill('توضیح');assert.equal(await page.locator('#personalNotes .annotation-card').count(),1);assert.equal(await page.locator('#personalHighlights .annotation-card').count(),0);await page.locator('#annotationSearch').fill('');
 await page.locator('#dashboardFavorites [data-remove-favorite]').click();await page.waitForTimeout(900);
 assert.equal(states[owner].itemState['favorite:'+topic].favorite,false);assert.equal(states[other].itemState['favorite:'+topic].favorite,true);assert.equal(states[owner].itemState[topic].note,'نوشته شخصی من');
 await page.locator('#personalHighlightsFold > summary').click();await page.locator('#personalHighlights .annotation-open').click();await page.locator('mark[data-hl-id="own-highlight"]').waitFor({state:'visible'});assert.equal(await page.locator('mark[data-hl-id="own-highlight"]').evaluate(e=>e===document.activeElement),true);
 await page.locator('#tabBtnDashboard').click();await page.locator('#personalNotes .annotation-card').filter({hasText:'نوشته شخصی من'}).locator('button').click();assert.equal(await page.locator('.topic-note:focus').inputValue(),'نوشته شخصی من');
 await page.evaluate(()=>{localStorage.setItem('bp_theme','light');dispatchEvent(new StorageEvent('storage',{key:'bp_theme',newValue:'light'}));});
 for(const mode of ['dark','night-shift','light']){await page.locator('#themeToggleBtn').click();assert.equal(await page.locator('html').getAttribute('data-theme'),mode);}
 assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()),'#f5f0e7');
 await page.locator('#themeToggleBtn').click();
 const contrasts=await page.evaluate(()=>{function lum(rgb){return rgb.match(/\d+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);}return ['yellow','green','pink','blue','purple','orange'].map(color=>{const mark=document.createElement('mark');mark.className='hl hl-'+color;document.body.append(mark);const s=getComputedStyle(mark),ratio=(lum(s.color)+.05)/(lum(s.backgroundColor)+.05);mark.remove();return ratio;});});assert.ok(contrasts.every(v=>v>=4.5),JSON.stringify(contrasts));
 await page.locator('#themeToggleBtn').click();await page.reload();assert.equal(await page.locator('html').getAttribute('data-theme'),'night-shift');await page.emulateMedia({colorScheme:'dark'});assert.equal(await page.locator('html').getAttribute('data-theme'),'night-shift');
 await page.waitForFunction(()=>document.getElementById('connStatus').textContent.includes('آنلاین'));await page.locator('#headerCollapseBtn').click();await page.locator('#tabBtnDashboard').click();assert.equal(await page.locator('#dashboardFavorites [data-remove-favorite]').count(),0);assert.equal(await page.locator('#personalHighlights .annotation-card').count(),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 const fc=payload.flashcards[0];states[owner].highlights[topic].push({id:'answer-highlight',loc:'fc:'+fc.id,quote:fc.back,occurrence:0,color:'blue'});
 await page.reload();await page.waitForFunction(()=>document.getElementById('connStatus').textContent.includes('آنلاین'));await page.locator('#headerCollapseBtn').click();await page.locator('#tabBtnDashboard').click();
 await page.locator('#personalHighlightsFold > summary').click();await page.locator('#personalHighlights .annotation-card').filter({hasText:fc.back}).locator('button').click();await page.locator('mark[data-hl-id="answer-highlight"]').waitFor({state:'visible'});assert.equal(await page.locator('.fc-back').first().evaluate(e=>getComputedStyle(e).display),'block');
 await page.locator('#tabBtnDashboard').click();
 await page.screenshot({path:'/tmp/intmed-annotations-night-shift.png',fullPage:true});assert.deepEqual(errors,[]);console.log('Annotations/themes passed: private lists, searchable source links, precise highlight focus, unlike persistence, three saved palettes, dark contrast and mobile layout.');
}finally{await browser.close()}
