import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
const executable=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
const browser=await chromium.launch({headless:true,...(executable?{executablePath:executable}:{})});
const page=await browser.newPage({viewport:{width:390,height:844}});let signupBody,loginBody,gatewayAttempts=0;
await page.route(/https:\/\/(?:[^/]+\.supabase\.co|api\.drgerami-md\.ir)\//,async route=>{
 const req=route.request(),url=new URL(req.url());
 if(url.hostname==='api.drgerami-md.ir'){gatewayAttempts++;return route.abort('failed');}
 if(url.pathname==='/auth/v1/signup'){signupBody=req.postDataJSON();return route.fulfill({json:{user:{id:'test-signup',identities:signupBody.email==='duplicate@example.com'?[]:[{id:'identity'}]}}});}
 if(url.pathname==='/functions/v1/intmed-login'){loginBody=req.postDataJSON();return route.fulfill({status:401,json:{message:'نام کاربری یا رمز عبور اشتباه است.'}});}
 throw Error('Unexpected request '+url.pathname);
});
await page.route('**/rest/v1/intmed_recovery_tickets?*',r=>r.fulfill({json:[]}));
try{
 await page.goto(process.env.INTMED_BASE_URL||'http://127.0.0.1:8765');
 if(await page.locator('#loginUser').getAttribute('placeholder')!=='نام کاربری')throw Error('Login asks for email');
 await page.locator('#loginUser').fill('Doctor');await page.locator('#loginPass').fill(' password unchanged ');await page.locator('#loginForm button[type=submit]').click();
 await page.waitForFunction(()=>document.getElementById('loginErr').classList.contains('show'));
 if(loginBody.username!=='doctor'||loginBody.password!==' password unchanged ')throw Error('Username/password login payload wrong');
 await page.locator('#showSignupLink').click();
 for(const id of ['signupFullName','signupUser','signupPass','signupDegree'])if(!await page.locator('#'+id).evaluate(e=>e.required))throw Error(id+' not required');
 if(await page.locator('#signupDegree option').count()!==7)throw Error('Degree list wrong');
 if(await page.evaluate(()=>window.IntMedRegistration.provinces.length)!==31)throw Error('Province list incomplete');
 await page.locator('#signupFullName').fill('پزشک آزمایشی');await page.locator('#signupUser').fill('doctor_qa');await page.locator('#signupPass').fill('StrongPassword-123');await page.locator('#signupDegree').selectOption({label:'رزیدنت'});
 await page.locator('#signupSpecialty').fill('داخلی');await page.getByRole('option',{name:'بیماری های داخلی',exact:true}).click();
 await page.locator('#signupProvince').fill('غيرمعتبر');
 if(await page.locator('#signupProvince').evaluate(e=>e.checkValidity()))throw Error('Invalid province accepted');
 await page.locator('#signupProvince').fill('اذربايجان');
 // Normal Persian spelling and Arabic Yeh searches both match.
 await page.locator('#signupProvince').fill('آذربايجان');await page.locator('#signupProvince').press('ArrowDown');await page.locator('#signupProvince').press('Enter');
 if(await page.locator('#signupProvince').inputValue()!=='آذربایجان شرقی')throw Error('Province keyboard selection failed');
 await page.locator('#signupEmail').fill('qa@example.com');await page.locator('#signupForm button[type=submit]').click();await page.locator('#signupSuccessBox').waitFor({state:'visible'});
 if(!gatewayAttempts)throw Error('Public gateway fallback was not exercised');
 if(signupBody.data.specialty!=='بیماری های داخلی'||signupBody.data.province!=='آذربایجان شرقی'||signupBody.data.degree!=='رزیدنت'||signupBody.data.app!=='intmed')throw Error('New profile metadata lost');
 await page.locator('#backToLoginFromSuccess').click();await page.locator('#showSignupLink').click();await page.locator('#signupEmail').fill('duplicate@example.com');await page.locator('#signupForm button[type=submit]').click();await page.locator('#signupRecoveryGuide').waitFor({state:'visible'});
 if(!await page.locator('#signupErr').textContent().then(t=>t.includes('این ایمیل قبلاً ثبت شده است')))throw Error('Duplicate email message missing');
 await page.locator('#signupRecoveryLink').click();if(await page.locator('#forgotUser').inputValue()!=='duplicate@example.com')throw Error('Recovery did not receive duplicate email');
 console.log('Registration browser passed: fields, searchable choices, profile metadata, duplicate email detection and recovery guidance.');
}finally{await browser.close()}
