import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
let playwright;
try{playwright=createRequire(import.meta.url)('playwright');}
catch{playwright=createRequire('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');}
const browser=await playwright.chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const page=await context.newPage(),errors=[],calls=[];
const id='11111111-1111-4111-8111-111111111111';
page.on('pageerror',error=>errors.push(error.message));
await page.route(/\/config\.js(?:\?.*)?$/,r=>r.fulfill({contentType:'application/javascript',body:'window.INTMED_CONFIG={supabaseUrl:"https://api.drgerami-md.ir",supabaseFallbackUrl:"https://upwbktvnybsjugdegjji.supabase.co",supabaseAnonKey:"synthetic-public",authPrimaryTimeoutMs:200,authFallbackTimeoutMs:350,authProbeTimeoutMs:500,authProbeDelayMs:10,authSignInTimeoutMs:1500};'}));
await page.addInitScript(()=>{
 const original=window.fetch;
 window.fetch=function(input,options){
  const url=new URL(typeof input==='string'?input:input.url,location.href);
  if(url.origin==='https://api.drgerami-md.ir')return new Promise(()=>{});
  return original(input,options);
 };
});
await page.route('https://upwbktvnybsjugdegjji.supabase.co/**',async route=>{
 const url=new URL(route.request().url());calls.push({path:url.pathname,method:route.request().method()});
 if(url.pathname==='/auth/v1/health')return route.fulfill({json:{name:'GoTrue',version:'synthetic'}});
 if(url.pathname==='/functions/v1/intmed-login'){
  await new Promise(r=>setTimeout(r,600));
  return route.fulfill({json:{access_token:'synthetic-access',refresh_token:'synthetic-refresh',user:{id}}});
 }
 if(url.pathname==='/rest/v1/profiles'){
  const profile={id,username:'synthetic',full_name:'کاربر آزمایشی',role:'user',approved:true,rejected:false};
  return route.fulfill({json:url.searchParams.has('id')?profile:[profile]});
 }
 if(url.pathname==='/rest/v1/study_state')return route.fulfill({json:[{user_id:id,state:{itemState:{},highlights:{},meta:{}},updated_at:'2026-11-13T00:00:00Z'}]});
 if(url.pathname.startsWith('/functions/'))return route.fulfill({json:{ok:true}});
 return route.fulfill({json:[]});
});
try{
 await page.goto(process.env.INTMED_BASE_URL||'http://127.0.0.1:8765');
 await page.locator('#loginUser').fill('synthetic');await page.locator('#loginPass').fill('synthetic-password');
 await page.locator('#loginForm button[type=submit]').click();
 await page.waitForFunction(()=>document.getElementById('appRoot').style.display==='',null,{timeout:6000});
 await page.waitForFunction(()=>document.getElementById('connStatus').textContent.includes('آنلاین'),null,{timeout:6000});
 assert.equal(calls.filter(x=>x.path==='/functions/v1/intmed-login').length,1,'discovery and post-login reload must not repeat the password');
 assert.equal(await page.evaluate(()=>window.IntMedBackend.session().user.id),id);
 assert.equal(await page.locator('#loginGate').isVisible(),false);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
 assert.deepEqual(errors,[]);
 console.log('Mobile auth route browser passed: blocked primary, slow valid fallback sign-in, post-login reload/session verification and private sync without repeated credentials.');
}catch(error){
 console.error(JSON.stringify({loginError:await page.locator('#loginErr').textContent(),calls,errors}));
 throw error;
}finally{await browser.close();}
