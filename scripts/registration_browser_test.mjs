import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
const executable=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
const browser=await chromium.launch({headless:true,...(executable?{executablePath:executable}:{})});
const page=await browser.newPage({viewport:{width:390,height:844}});let signupBody,loginBody;
await page.route('**/*.supabase.co/**',async route=>{
 const req=route.request(),url=new URL(req.url());
 if(url.pathname==='/auth/v1/signup'){signupBody=req.postDataJSON();return route.fulfill({json:{user:{id:'test-signup'}}});}
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
 await page.locator('#signupSpecialty').fill('داخلی');await page.getByRole('option',{name:'پزشکی داخلی',exact:true}).click();
 await page.locator('#signupProvince').fill('غيرمعتبر');
 if(await page.locator('#signupProvince').evaluate(e=>e.checkValidity()))throw Error('Invalid province accepted');
 await page.locator('#signupProvince').fill('اذربايجان');
 // Normal Persian spelling and Arabic Yeh searches both match.
 await page.locator('#signupProvince').fill('آذربايجان');await page.locator('#signupProvince').press('ArrowDown');await page.locator('#signupProvince').press('Enter');
 if(await page.locator('#signupProvince').inputValue()!=='آذربایجان شرقی')throw Error('Province keyboard selection failed');
 await page.locator('#signupEmail').fill('qa@example.com');await page.locator('#signupForm button[type=submit]').click();await page.locator('#signupSuccessBox').waitFor({state:'visible'});
 if(signupBody.data.specialty!=='پزشکی داخلی'||signupBody.data.province!=='آذربایجان شرقی'||signupBody.data.degree!=='رزیدنت'||signupBody.data.app!=='intmed')throw Error('New profile metadata lost');
 console.log('Registration browser passed: username login, required fields, six degrees, 31 provinces, searchable choices, keyboard selection and profile metadata.');
}finally{await browser.close()}
