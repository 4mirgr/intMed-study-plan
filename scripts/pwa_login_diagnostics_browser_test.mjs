import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
let playwright;
try{playwright=createRequire(import.meta.url)('playwright');}
catch{playwright=createRequire('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');}
const browser=await playwright.chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
const base=process.env.INTMED_BASE_URL||'http://127.0.0.1:8765';
const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const page=await context.newPage(),errors=[],requests=[];
const secrets={username:'private_username_canary',password:'private_password_canary',access:'private_access_token_canary',refresh:'private_refresh_token_canary',user:'private_user_uuid_canary',profile:'private_profile_canary',query:'private_recovery_query_canary'};
let mode='network';
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>requests.push(new URL(request.url()).pathname));
await page.addInitScript(()=>{
 Object.defineProperty(navigator,'standalone',{configurable:true,get:()=>true});
 Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copiedDiagnostics=text;}}});
});
await page.route(url=>url.origin===new URL(base).origin&&url.pathname===new URL(base).pathname,async route=>{
 const response=await route.fetch(),html=(await response.text()).replace(/js\/intmed-backend\.js\?v=[a-f0-9]+/,'js/intmed-backend.js?v=0123456789abcdef');
 return route.fulfill({response,body:html});
});
await page.route(/https:\/\/(?:[^/]+\.supabase\.co|api\.drgerami-md\.ir)\//,route=>{
 const url=new URL(route.request().url());
 if(mode==='network')return route.abort('failed');
 if(url.pathname==='/auth/v1/health')return route.fulfill({json:{name:'GoTrue',version:'synthetic'}});
 return route.fulfill({status:503,json:{message:'Synthetic service unavailable',code:secrets.access}});
});
try{
 await page.goto(base,{waitUntil:'networkidle'});
 assert.equal(await page.locator('#loginConnectionDetails').count(),0,'normal login must not show support diagnostics');
 await page.evaluate(secrets=>{
  const sensitive=new URL(location.href);sensitive.search='?type=recovery&token='+secrets.query;sensitive.hash='type=recovery&access_token='+secrets.access+'&refresh_token='+secrets.refresh;
  history.replaceState(null,'',sensitive);
  sessionStorage.setItem('intmed_supabase_session',JSON.stringify({access_token:secrets.access,refresh_token:secrets.refresh,user:{id:secrets.user},profile:secrets.profile}));
 },secrets);
 await page.locator('#loginUser').fill(secrets.username);await page.locator('#loginPass').fill(secrets.password);
 await page.locator('#loginForm button[type=submit]').click();
 await page.locator('#loginConnectionDetails').waitFor({state:'visible',timeout:2500});
 assert.match(await page.locator('#loginErr').textContent(),/مسیرهای امن ورود/,'connection support must preserve the existing login error');
 const details=page.locator('#loginConnectionDetails');
 assert.equal(await details.getAttribute('open'),null,'failure diagnostics should be collapsed by default');
 assert.equal(await details.locator('summary').textContent(),'اطلاعات اتصال برای پشتیبانی');
 await details.locator('summary').click();
 const report=await details.locator('pre').textContent(),data=JSON.parse(report);
 assert.deepEqual(data,{page:new URL(base).origin+new URL(base).pathname,standalone:true,onlineHint:false,backendVersion:'0123456789abcdef',status:null,code:'browser_network_error'});
 for(const value of Object.values(secrets))assert.equal(report.includes(value),false,'support report must not include private canaries');
 assert.equal(report.includes('?'),false);assert.equal(report.includes('#'),false);
 const beforeCopy=requests.length;
 await details.getByRole('button',{name:'کپی اطلاعات اتصال'}).click();
 assert.equal(await page.evaluate(()=>window.__copiedDiagnostics),report);
 await page.waitForTimeout(120);
 assert.equal(requests.length,beforeCopy,'showing/copying diagnostics must not issue or upload requests');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'support details must fit a mobile viewport');
 mode='server';await page.locator('#loginForm button[type=submit]').click();
 await page.waitForFunction(()=>document.querySelector('#loginConnectionDetails pre')?.textContent.includes('503'),null,{timeout:2500});
 assert.equal(await page.locator('#loginConnectionDetails').count(),1,'a later failure must replace the report instead of duplicating it');
 const next=JSON.parse(await page.locator('#loginConnectionDetails pre').textContent());
 assert.equal(next.status,503);assert.equal(next.code,'unclassified');
 for(const value of Object.values(secrets))assert.equal(JSON.stringify(next).includes(value),false,'unrecognized server codes must not leak into support reports');
 assert.equal(await page.locator('#loginConnectionDetails').getAttribute('open'),null);
 await page.locator('#loginConnectionDetails summary').click();
 await page.evaluate(()=>{navigator.clipboard.writeText=()=>Promise.reject(new Error('Synthetic clipboard denial'));});
 await page.locator('#loginConnectionDetails').getByRole('button',{name:'کپی اطلاعات اتصال'}).click();
 await page.locator('#loginConnectionDetails [role="status"]').getByText('کپی خودکار در دسترس نیست؛ متن بالا را انتخاب و کپی کنید.').waitFor();
 assert.equal(JSON.parse(await page.locator('#loginConnectionDetails pre').textContent()).status,503,'manual-copy fallback retains the safe report');
 assert.deepEqual(errors,[]);
 console.log('PWA login diagnostics passed: failure-only collapsed report, standalone/online/version hints, private URL/session/credential redaction, local copy without requests, sanitized server codes and mobile fit.');
}finally{await browser.close();}
