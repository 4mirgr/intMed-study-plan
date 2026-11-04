import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
let playwright;try{playwright=createRequire(import.meta.url)('playwright');}catch{playwright=createRequire('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');}
const browser=await playwright.chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
const id='11111111-1111-4111-8111-111111111111';let unavailable=true,passwordCalls=0,approved=true,expired=false;
await page.addInitScript(({id})=>sessionStorage.setItem('intmed_supabase_session',JSON.stringify({access_token:'synthetic-access',refresh_token:'synthetic-refresh',user:{id}})),{id});
await page.route(/https:\/\/(?:[^/]+\.supabase\.co|api\.drgerami-md\.ir)\//,route=>{
  const url=new URL(route.request().url());
  if(expired&&url.pathname==='/auth/v1/token')return route.fulfill({status:400,json:{message:'Invalid refresh token'}});
  if(url.pathname==='/auth/v1/token'||url.pathname==='/functions/v1/intmed-login'){passwordCalls++;return route.fulfill({status:500,json:{message:'Password must not be resubmitted'}});}
  if(url.pathname==='/rest/v1/profiles'){
    if(expired)return route.fulfill({status:401,json:{message:'Expired token'}});
    if(unavailable)return route.fulfill({status:503,json:{message:'Temporary profile outage'}});
    const profile={id,username:'synthetic',approved,rejected:false,role:'user'};
    return route.fulfill({json:url.searchParams.has('id')?profile:[profile]});
  }
  return route.fulfill({json:[]});
});
try{
  await page.goto(process.env.INTMED_BASE_URL||'http://127.0.0.1:8765');
  await page.waitForFunction(()=>document.getElementById('loginErr').textContent.includes('تکمیل ورود'),null,{timeout:6000});
  assert.equal(await page.locator('#appRoot').isVisible(),false);
  assert.equal(await page.inputValue('#loginUser'),'');assert.equal(await page.inputValue('#loginPass'),'');
  unavailable=false;await page.locator('#loginForm button[type=submit]').click();
  await page.waitForFunction(()=>document.getElementById('appRoot').style.display==='');
  assert.equal(passwordCalls,0,'resume must work with empty credential fields and no password exchange');
  approved=false;await page.reload();
  await page.waitForFunction(()=>document.getElementById('loginErr').classList.contains('show'));
  assert.equal(await page.locator('#appRoot').isVisible(),false);
  assert.equal(await page.evaluate(()=>window.IntMedBackend.session()),null);
  expired=true;await page.reload();
  await page.waitForFunction(()=>document.getElementById('loginErr').classList.contains('show'));
  assert.match(await page.textContent('#loginErr'),/نشست پایان یافته/);
  assert.equal(await page.locator('#appRoot').isVisible(),false);
  console.log('Login resume browser passed: profile outage stays gated, retry needs no credentials, inactive account remains blocked.');
}finally{await browser.close();}
