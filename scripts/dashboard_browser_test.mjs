import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright'),exe=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
const browser=await chromium.launch({headless:true,...(exe?{executablePath:exe}:{})});
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',pending='33333333-3333-4333-8333-333333333333',topic='cardio-ecg';
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let admin=false,profileWrites=0,stateWrites=0;
const profiles=[{id:owner,username:'owner',full_name:'کاربر آزمایشی',degree:'رزیدنت',email:'owner@example.com',approved:true,role:'user',province:'تهران',specialty:'پزشکی داخلی'},{id:other,username:'member',full_name:'کاربر دوم',role:'user',approved:true,email:'other@example.com'},{id:pending,username:'pending',role:'user',approved:false,rejected:false}];
const states={[owner]:{itemState:{[topic]:{note:'یادداشت قبلی',status:'ضعیف'}},highlights:{[topic]:[{id:'stable-hl',quote:'متن مهم',note:'یادداشت هایلایت'}]},meta:{}},[other]:{itemState:{['activity:'+topic+':'+today]:{opens:5,seconds:120,lastOpenedAt:new Date().toISOString()},['favorite:'+topic]:{favorite:true}},highlights:{},meta:{}},[pending]:{itemState:{},highlights:{},meta:{}}};
const page=await browser.newPage({viewport:{width:390,height:844}});await page.clock.install();
await page.addInitScript(id=>localStorage.setItem('intmed_supabase_session',JSON.stringify({access_token:'test-token',user:{id,email:'owner@example.com'}})),owner);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*.supabase.co/**',async route=>{
 const req=route.request(),u=new URL(req.url()),method=req.method();
 if(u.pathname==='/rest/v1/profiles'){
  if(method==='PATCH'){profileWrites++;Object.assign(profiles[0],req.postDataJSON());return route.fulfill({status:204,body:''});}
  const list=(admin?profiles:[profiles[0]]).map(p=>p.id===owner?{...p,role:admin?'admin':'user'}:p);
  return route.fulfill({json:u.searchParams.has('id')?list[0]:list});
 }
 if(u.pathname==='/rest/v1/study_state'){
  if(method==='PATCH'){stateWrites++;const body=req.postDataJSON();states[owner]=body.state;return route.fulfill({json:[{user_id:owner,...body}]});}
  return route.fulfill({json:(u.searchParams.has('user_id')?[owner]:(admin?Object.keys(states):[owner])).map(id=>({user_id:id,state:states[id],updated_at:'2026-10-21T10:00:00Z'}))});
 }
 if(u.pathname==='/rest/v1/tickets')return route.fulfill({json:[]});
 if(u.pathname==='/rest/v1/rpc/update_intmed_username'){profiles[0].username=req.postDataJSON().new_username;return route.fulfill({status:204,body:''});}
 if(u.pathname==='/rest/v1/rpc/set_intmed_user_approval'){const body=req.postDataJSON(),p=profiles.find(p=>p.id===body.target_user);p.approved=body.new_approved;p.rejected=!p.approved;return route.fulfill({status:204,body:''});}
 if(u.pathname==='/functions/v1/intmed-signup-notify'){const body=req.postDataJSON();return route.fulfill({json:body.action==='discover'?{chats:[{id:'123',name:'مدیر'}]}:body.action==='status'?{tokenConfigured:true,connected:true,pending:1}:{connected:true,sent:1}});}
 throw Error('Unexpected endpoint '+u.pathname);
});
try{
 await page.goto(process.env.INTMED_BASE_URL||'http://127.0.0.1:8765');await page.waitForFunction(()=>document.getElementById('connStatus').textContent.includes('آنلاین'));
 const row=page.locator('.topic-item').filter({hasText:'خواندن و تفسیر ECG'});await row.evaluate(e=>e.closest('.topic-cat').classList.add('open'));await row.locator('.topic-open-btn').click();
 await row.locator('[data-study-tag="مطالعه‌شده"]').click();await row.locator('[data-study-tag="مهم"]').click();await row.locator('.topic-favorite').click();
 await page.waitForTimeout(300);assert.equal(await row.locator('.topic-favorite').evaluate(e=>getComputedStyle(e).color),'rgb(233, 77, 157)');
 await row.locator('.learn-btn').filter({hasText:'درسنامه'}).click();await row.locator('.lesson-section').first().waitFor({state:'attached'});await page.waitForTimeout(700);
 assert.equal(states[owner].itemState['activity:'+topic+':'+today].opens,1);assert.equal(states[owner].itemState['tag:'+topic].tags.length,2);
 await page.clock.fastForward(30010);await page.waitForTimeout(700);assert.ok(states[owner].itemState['activity:'+topic+':'+today].seconds>0);
 await row.locator('.learn-btn').filter({hasText:'آزمون ۴ گزینه‌ای'}).click();await row.locator('.mcq-block').first().waitFor({state:'visible'});
 const payload=await (await page.request.get(new URL('/content/topics/cardio-ecg.json',process.env.INTMED_BASE_URL||'http://127.0.0.1:8765').href)).json();
 await row.locator('.mcq-block').first().locator('.mcq-opt').nth(payload.mcq[0].correctIndex).click();await page.waitForTimeout(700);
 assert.equal(states[owner].itemState['quiz:'+topic+':'+payload.mcq[0].id].firstCorrect,true);
 await page.locator('#tabBtnDashboard').click();assert.ok((await page.locator('#studyQuizSummary').textContent()).includes('۱۰۰'));assert.ok((await page.locator('#studyMetrics').textContent()).includes('۱'));assert.equal(await page.locator('#studyTagged [data-insight-topic]').count(),1);
 await page.locator('#studyTagFilter').selectOption('نیاز به مرور');assert.equal(await page.locator('#studyTagged [data-insight-topic]').count(),0);
 await page.waitForTimeout(700);const preserved=JSON.stringify(states[owner]);const previousStateWrites=stateWrites;
 await page.locator('#profileEditor summary').first().click();await page.locator('#profileInput-fullName').fill('نام ویرایش‌شده');await page.locator('#profileInput-province').fill('فارس');await page.locator('#profileSaveBtn').click();await page.waitForFunction(()=>document.getElementById('profileSavedNote').textContent.includes('مشخصات ذخیره شد'));
 assert.equal(profileWrites,1);assert.equal(stateWrites,previousStateWrites,'Profile edit rewrote study state');assert.equal(JSON.stringify(states[owner]),preserved);assert.equal(profiles[0].full_name,'نام ویرایش‌شده');assert.equal(await page.locator('#profileInput-email').getAttribute('readonly'),'');
 await page.locator('.account-security summary').click();await page.locator('#accountUsername').fill('new_username');await page.locator('#accountSave').click();await page.waitForFunction(()=>document.getElementById('accountStatus').textContent.includes('اطلاعات حساب ذخیره شد'));assert.equal(profiles[0].username,'new_username');assert.equal(states[owner].highlights[topic][0].id,'stable-hl');
 admin=true;await page.reload();await page.waitForFunction(()=>document.getElementById('connStatus').textContent.includes('آنلاین'));await page.locator('#tabBtnDashboard').click();
 assert.ok((await page.locator('#adminOverview').textContent()).includes('منتظر تأیید'));assert.ok((await page.locator('#adminReadChart').textContent()).includes('خواندن و تفسیر ECG'));
 await page.locator('#analyticsMetric').selectOption('completed');assert.ok((await page.locator('#adminReadChart').textContent()).includes('۱ کاربر'));await page.locator('#analyticsMetric').selectOption('readers');assert.ok((await page.locator('#adminReadChart').textContent()).includes('۲ کاربر'));
 await page.locator('[data-user-toggle="'+other+'"]').click();const otherBefore=JSON.stringify(states[other]);page.once('dialog',dialog=>dialog.accept());await page.locator('[data-account-approval="'+other+'"]').click();await page.waitForFunction(()=>document.getElementById('adminOverview').textContent.includes('دسترسی معلق'));
 await page.waitForTimeout(200);assert.equal(profiles[1].approved,false);assert.equal(JSON.stringify(states[other]),otherBefore);
 await page.locator('.notification-panel summary').click();await page.locator('[data-notification-action="status"]').click();await page.waitForFunction(()=>document.getElementById('notificationStatus').textContent.includes('تلگرام متصل است'));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(250);await page.screenshot({path:'/tmp/intmed-dashboard-v2-mobile.png',fullPage:true});await page.setViewportSize({width:1365,height:900});await page.screenshot({path:'/tmp/intmed-dashboard-v2-desktop.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('Dashboard browser passed: pink likes, tags, recorded activity/time, personal/admin analytics, profile and username edits preserve UUID/highlights/state, suspension preserves data and notification controls.');
}finally{await browser.close()}
