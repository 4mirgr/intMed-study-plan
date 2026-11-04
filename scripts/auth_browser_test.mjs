import {createRequire} from 'node:module';import fs from 'node:fs';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const executable=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
const browser=await chromium.launch({headless:true,...(executable?{executablePath:executable}:{})});
// A stalled public response must not block private synchronization, and a
// completed retry must build the education navigation once without a new login.
async function exercisePublicStartupRecovery(){
 const context=await browser.newContext({serviceWorkers:'block'}),startup=await context.newPage(),startupErrors=[];
 startup.on('pageerror',error=>startupErrors.push(error.message));
 await startup.route(/\/config\.js(?:\?.*)?$/,r=>r.fulfill({contentType:'application/javascript',body:'window.INTMED_CONFIG={supabaseUrl:"https://api.drgerami-md.ir",supabaseAnonKey:"synthetic-public",contentTimeoutMs:60,contentRetryDelayMs:10};'}));
 await startup.addInitScript(()=>{
  const id='11111111-1111-4111-8111-111111111111';sessionStorage.setItem('intmed_supabase_session',JSON.stringify({access_token:'test-only',user:{id}}));
  const original=window.fetch;window.__publicStall=true;window.__taxonomyAttempts=0;
  window.fetch=function(input,options){
   const url=new URL(typeof input==='string'?input:input.url,location.href);
   if(url.pathname==='/content/taxonomy.json'){
    window.__taxonomyAttempts++;
    if(window.__publicStall)return Promise.resolve(new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{"categories":'));}}),{headers:{'Content-Type':'application/json'}}));
   }
   return original(input,options);
  };
 });
 let failState=false;
 await startup.route('https://api.drgerami-md.ir/**',r=>{const u=new URL(r.request().url()),profile={id:'11111111-1111-4111-8111-111111111111',username:'qa',full_name:'کاربر آزمایشی',role:'user',approved:true,rejected:false};if(u.pathname==='/rest/v1/profiles')return r.fulfill({json:u.searchParams.has('id')?profile:[profile]});if(failState&&u.pathname==='/rest/v1/study_state')return r.fulfill({status:503,json:{message:'Temporary outage'}});if(r.request().method()==='POST')return r.fulfill({json:[{}]});return r.fulfill({json:[]});});
 try{
  await startup.goto(process.env.INTMED_BASE_URL||'http://127.0.0.1:8765',{waitUntil:'domcontentloaded'});
  await startup.waitForFunction(()=>document.getElementById('connStatus').textContent.includes('آنلاین'),null,{timeout:3000}).catch(async()=>{throw Error('Private sync blocked by public startup: '+JSON.stringify({status:await startup.textContent('#connStatus'),errors:startupErrors}));});
  await startup.locator('#educationRetry').waitFor({state:'visible',timeout:3000});
  if(await startup.locator('.topic-item').count())throw Error('Stalled content should not partially render');
  const attempts=await startup.evaluate(()=>window.__taxonomyAttempts);if(attempts<2||attempts>3)throw Error('Startup retry must be automatic and bounded');
  if(await startup.locator('#loginGate').isVisible())throw Error('Public content failure reopened login');
  await startup.evaluate(()=>{window.__publicStall=false;});
  await startup.locator('#educationRetry').click();
  await startup.waitForFunction(()=>document.querySelectorAll('.topic-item').length===144,null,{timeout:3000});
  if(await startup.locator('#educationRetry').count())throw Error('Successful retry must remove the error UI');
  if(await startup.locator('.topic-cat').count()!==12)throw Error('Retry duplicated topic navigation');
  if(await startup.locator('#loginGate').isVisible())throw Error('Content recovery required another login');
  failState=true;await startup.reload({waitUntil:'domcontentloaded'});
  await startup.locator('#educationRetry').waitFor({state:'visible',timeout:3000});
  await startup.waitForFunction(()=>document.getElementById('connStatus').textContent.includes('خطا'),null,{timeout:3000});
  await startup.evaluate(()=>{window.__publicStall=false;});await startup.locator('#educationRetry').click();
  await startup.waitForFunction(()=>document.querySelectorAll('.topic-item').length===144,null,{timeout:3000});
  if(!(await startup.textContent('#connStatus')).includes('خطا'))throw Error('Public recovery falsely marked failed private sync online');
 }finally{await context.close();}
}
await exercisePublicStartupRecovery();
const page=await browser.newPage();const id='11111111-1111-4111-8111-111111111111';let approved=false,github=0, failState=false;
await page.addInitScript(({id})=>{localStorage.setItem('bp_authed','1');localStorage.setItem('bp_user_id','amir');localStorage.setItem('intmed_supabase_session',JSON.stringify({access_token:'test-only',user:{id}}));},{id});
await page.route(/https:\/\/(?:[^/]+\.supabase\.co|api\.drgerami-md\.ir)\//,route=>{const u=new URL(route.request().url());if(u.pathname==='/rest/v1/profiles'&&u.searchParams.has('id'))return route.fulfill({json:{id,username:'qa',role:'user',approved,rejected:false}});if(u.pathname==='/rest/v1/profiles')return route.fulfill({json:[{id,username:'qa',role:'user',approved,rejected:false}]});if(failState && u.pathname==='/rest/v1/study_state')return route.fulfill({status:503,json:{message:'Temporary outage'}});if(route.request().method()==='POST')return route.fulfill({json:[{}]});return route.fulfill({json:[]});});
await page.route('https://api.github.com/**',route=>{github++;return route.abort()});
await page.route('**/rest/v1/intmed_recovery_tickets?*',r=>r.fulfill({json:[]}));
try{
 await page.goto(process.env.INTMED_BASE_URL||'http://127.0.0.1:8765');
 await page.waitForFunction(()=>document.getElementById('loginErr').textContent.includes('ورود حساب تأیید نشد'));
 if(await page.locator('#appRoot').isVisible())throw Error('Unapproved persisted session bypassed gate');
 approved=true;await page.evaluate(()=>sessionStorage.setItem('intmed_show_account_provider_notice','1'));await page.reload();await page.waitForFunction(()=>document.getElementById('appRoot').style.display==='');
 if(!await page.locator('#appRoot').isVisible())throw Error('Approved session blocked');
 await page.locator('#accountProviderNotice').waitFor({state:'visible'});
 if(!await page.locator('#accountProviderNoticeText').textContent().then(text=>text.includes('Supabase')&&text.includes('معتبر و امن')))throw Error('Account provider notice is incomplete');
 await page.locator('#accountProviderNoticeClose').click();if(await page.locator('#accountProviderNotice').isVisible())throw Error('Account provider notice did not close');
 if(await page.evaluate(()=>sessionStorage.getItem('intmed_show_account_provider_notice'))!==null)throw Error('Account provider notice flag was not consumed');
 if(await page.evaluate(()=>localStorage.getItem('bp_user_id'))!==id)throw Error('Legacy user id not replaced by authenticated id');
 await page.waitForFunction(()=>document.getElementById('connStatus').textContent.includes('آنلاین'));
 if(await page.locator('#ghConnectBtn').isVisible())throw Error('GitHub connect button exposed in private mode');
 failState=true;await page.reload();
 await page.waitForFunction(()=>document.getElementById('connStatus').textContent.includes('خطا'));
 if((await page.locator('#connectReminderBox').textContent()).includes('توکن'))throw Error('Legacy token instructions exposed');
 failState=false;
 // Dashboard holds the reminder; select it before clicking its retry button.
 await page.locator('#tabBtnDashboard').click();
 await page.locator('#connectReminderBtn').click();
 await page.waitForFunction(()=>document.getElementById('connStatus').textContent.includes('آنلاین'));
 if(await page.locator('#ghModal').isVisible())throw Error('Private retry opened token modal');
 if(github)throw Error('Private mode contacted GitHub state');
 const probeContext=await browser.newContext({serviceWorkers:'block'});const probe=await probeContext.newPage();
 await probe.route(/https:\/\/(?:[^/]+\.supabase\.co|api\.drgerami-md\.ir)\//,r=>r.abort('failed'));
 await probe.goto(process.env.INTMED_BASE_URL||'http://127.0.0.1:8765');
 if(await probe.locator('#trustedDevice, #checkLoginConnection').count())throw Error('Removed shared-device or connection controls remain visible');
 await probe.locator('#loginUser').fill('network_qa');await probe.locator('#loginPass').fill('synthetic-password');await probe.locator('#loginForm button[type=submit]').click();await probe.waitForFunction(()=>document.getElementById('loginErr').textContent.includes('مسیرهای امن ورود'),null,{timeout:60000});
 await probe.locator('#showSignupLink').click();if(!await probe.locator('#signupForm').isVisible())throw Error('Signup button did not open registration');
 await probeContext.close();
 console.log('Auth browser passed: stored-session approval rechecked, forged legacy identity ignored, approved account allowed, no GitHub state requests.');
}finally{await browser.close()}
