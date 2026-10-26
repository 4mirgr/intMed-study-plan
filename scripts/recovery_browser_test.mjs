import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright'),exe=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
const browser=await chromium.launch({headless:true,...(exe?{executablePath:exe}:{})});
const page=await browser.newPage({viewport:{width:390,height:844}});let fail=false,sent=0,updateBody,requested;
await page.route(/https:\/\/(?:[^/]+\.supabase\.co|api\.drgerami-md\.ir)\//,async route=>{
 const req=route.request(),url=new URL(req.url());
 if(url.pathname==='/auth/v1/recover'){
  sent++;requested={url,body:req.postDataJSON()};
  return route.fulfill({status:fail?429:200,json:fail?{message:'Too many requests'}:{}});
 }
 if(url.pathname==='/auth/v1/user'){updateBody=req.postDataJSON();assert.equal(req.headers().authorization,'Bearer recovery-test');return route.fulfill({json:{id:'synthetic'}});}
 if(url.pathname==='/auth/v1/logout')return route.fulfill({status:204,body:''});
 return route.fulfill({status:401,json:{message:'no session'}});
});
page.on('dialog',dialog=>dialog.accept());
await page.route('**/rest/v1/intmed_recovery_tickets?*',r=>r.fulfill({json:[]}));
try{
 const base=process.env.INTMED_BASE_URL||'http://127.0.0.1:8765';await page.goto(base);await page.locator('#showForgotLink').click();
 assert.ok(!(await page.locator('#forgotForm').textContent()).includes('واتساپ'));assert.equal(await page.locator('#forgotMobile').count(),0);
 await page.locator('#forgotUser').fill('invalid');await page.locator('#forgotSendEmail').click();assert.equal(sent,0);await page.waitForFunction(()=>!document.getElementById('forgotSendEmail').disabled);
 await page.locator('#forgotUser').fill('doctor@example.com');await page.locator('#forgotSendEmail').click();await page.waitForFunction(()=>document.getElementById('forgotStatus').textContent.includes('اگر حسابی')&&!document.getElementById('forgotSendEmail').disabled);
 assert.equal(sent,1);assert.deepEqual(requested.body,{email:'doctor@example.com'});assert.equal(requested.url.searchParams.get('redirect_to'),new URL(base).origin+'/');
 fail=true;await page.locator('#forgotSendEmail').click();await page.waitForFunction(()=>document.getElementById('forgotStatus').textContent.includes('تعداد درخواست'));
 for(const id of ['loginUser','loginPass','signupFullName','signupUser','signupPass','signupDegree','signupSpecialty','signupProvince','signupEmail','forgotUser','recoveryPass','recoveryPassConfirm']){
  assert.deepEqual(await page.locator('#'+id).evaluate(e=>({direction:getComputedStyle(e).direction,align:getComputedStyle(e).textAlign})),{direction:'rtl',align:'right'});
 }
 await page.goto(base+'/#type=recovery&access_token=recovery-test&refresh_token=refresh-test&expires_in=3600');await page.locator('#recoveryForm').waitFor({state:'visible'});
 assert.ok(!page.url().includes('access_token'));
 await page.locator('#recoveryPass').fill('new secure password');await page.locator('#recoveryPassConfirm').fill('different password');await page.locator('#recoveryForm button[type=submit]').click();
 assert.equal(updateBody,undefined);await page.locator('#recoveryPassConfirm').fill('new secure password');await page.locator('#recoveryForm button[type=submit]').click();await page.locator('#loginForm').waitFor({state:'visible'});
 assert.deepEqual(updateBody,{password:'new secure password'});
 assert.equal(await page.evaluate(()=>localStorage.getItem('intmed_supabase_session')),null);
 console.log('Recovery browser passed: email-only validated requests, safe success/rate-limit messages, RTL fields, token cleanup, matching password update and return to login.');
}finally{await browser.close()}
