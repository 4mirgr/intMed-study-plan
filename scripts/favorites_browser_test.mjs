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
 if(url.pathname==='/functions/v1/intmed-telegram-bot')return route.fulfill({json:{ok:true}});
 throw Error('Unexpected request '+url.pathname);
});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await context.route('**/rest/v1/intmed_recovery_tickets?*',r=>r.fulfill({json:[]}));
try{
 await page.goto(process.env.INTMED_BASE_URL||'http://127.0.0.1:8765');await page.waitForFunction(()=>document.getElementById('connStatus').textContent.includes('آنلاین'));
 const row=page.locator('.topic-item').filter({hasText:'خواندن و تفسیر ECG'});
 await row.evaluate(el=>el.closest('.topic-cat').classList.add('open'));
 const heart=row.locator('.topic-favorite');
 assert.equal(await heart.getAttribute('aria-pressed'),'false','Other user favorite leaked');
 await heart.click();assert.equal(await heart.getAttribute('aria-pressed'),'true');assert.equal(await row.evaluate(e=>e.classList.contains('open')),false,'Liking opened topic');
 await page.waitForFunction(()=>document.getElementById('connStatus').textContent.includes('آنلاین'));
 await page.waitForTimeout(700);assert.equal(states[owner].itemState['favorite:'+topic].favorite,true);
 await row.locator('.topic-pill').click();await row.locator('.topic-open-btn').click();await row.locator('.topic-note').fill('یادداشت محفوظ');await page.waitForTimeout(1300);
 assert.equal(states[owner].itemState[topic].note,'یادداشت محفوظ');assert.equal(states[owner].itemState['favorite:'+topic].favorite,true);
 await page.reload();await page.waitForFunction(()=>document.getElementById('connStatus').textContent.includes('آنلاین'));
 assert.equal(await row.locator('.topic-favorite').getAttribute('aria-pressed'),'true');
 await page.locator('#headerCollapseBtn').click();
 await page.locator('#tabBtnDashboard').click();assert.equal(await page.locator('#dashboardFavorites [data-favorite-topic]').count(),1);assert.equal(await page.locator('#profileFavorites [data-favorite-topic]').count(),1);
 await page.locator('#dashboardFavorites [data-favorite-topic]').click();await page.waitForTimeout(350);
 assert.equal(await page.locator('#tabPanelEducation').evaluate(e=>e.classList.contains('active')),true);assert.equal(await row.evaluate(e=>e.classList.contains('open')),true);
 assert.equal(await row.locator('.topic-note').inputValue(),'یادداشت محفوظ');
 await page.locator('#headerCollapseBtn').click();assert.equal(await page.locator('#headerCollapseBtn').getAttribute('aria-expanded'),'false');assert.equal(await page.locator('#headerCollapsible').evaluate(e=>e.inert),true);
 await page.locator('#headerCollapseBtn').click();assert.equal(await page.locator('#headerCollapseBtn').getAttribute('aria-expanded'),'true');
 await row.locator('.topic-favorite').click();await page.waitForTimeout(700);assert.equal(states[owner].itemState['favorite:'+topic].favorite,false);assert.equal(states[other].itemState['favorite:'+topic].favorite,true);
 admin=true;await page.reload();await page.waitForFunction(()=>document.getElementById('connStatus').textContent.includes('آنلاین'));await page.locator('#headerCollapseBtn').click();await page.locator('#tabBtnManagement').click();
 assert.equal(await page.locator('[data-ranked-topic="'+topic+'"] b').textContent(),'۱ لایک');
 // A fresh server-side change must survive manual statistics refresh.
 states[owner].itemState['favorite:'+topic]={favorite:true};
 await page.locator('#refreshFavoriteStats').click();await page.waitForFunction(()=>document.getElementById('favoriteStatsStatus').textContent.includes('به‌روزرسانی شد'));
 assert.equal(await page.locator('[data-ranked-topic="'+topic+'"] b').textContent(),'۲ لایک');
 assert.equal(await page.locator('#dashboardFavorites [data-favorite-topic]').count(),1);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'Mobile horizontal overflow');
 await page.screenshot({path:'/tmp/intmed-dashboard-neon-mobile.png',fullPage:true});
 await page.setViewportSize({width:1365,height:900});await page.screenshot({path:'/tmp/intmed-dashboard-neon-desktop.png',fullPage:true});
 await page.evaluate(()=>document.documentElement.dataset.theme='dark');await page.screenshot({path:'/tmp/intmed-dashboard-neon-dark.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('Favorites browser passed: own-account isolation, like/unlike persistence, notes/status retained, shortcuts, mobile layout, header control, admin counts and fresh cross-device refresh.');
}finally{await browser.close()}
