import {createRequire} from 'node:module';import fs from 'node:fs';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const executable=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
const browser=await chromium.launch({headless:true,...(executable?{executablePath:executable}:{})});
const page=await browser.newPage();const id='11111111-1111-4111-8111-111111111111';let approved=false,github=0;
await page.addInitScript(({id})=>{localStorage.setItem('bp_authed','1');localStorage.setItem('bp_user_id','amir');localStorage.setItem('intmed_supabase_session',JSON.stringify({access_token:'test-only',user:{id}}));},{id});
await page.route('**/*.supabase.co/**',route=>{const u=new URL(route.request().url());if(u.pathname==='/rest/v1/profiles'&&u.searchParams.has('id'))return route.fulfill({json:{id,username:'qa',role:'user',approved,rejected:false}});if(route.request().method()==='POST')return route.fulfill({json:[{}]});return route.fulfill({json:[]});});
await page.route('https://api.github.com/**',route=>{github++;return route.abort()});
try{
 await page.goto(process.env.INTMED_BASE_URL||'http://127.0.0.1:8765');
 await page.waitForFunction(()=>document.getElementById('loginErr').textContent.includes('ورود حساب تأیید نشد'));
 if(await page.locator('#appRoot').isVisible())throw Error('Unapproved persisted session bypassed gate');
 approved=true;await page.reload();await page.waitForFunction(()=>document.getElementById('appRoot').style.display==='');
 if(!await page.locator('#appRoot').isVisible())throw Error('Approved session blocked');
 if(await page.evaluate(()=>localStorage.getItem('bp_user_id'))!==id)throw Error('Legacy user id not replaced by authenticated id');
 if(github)throw Error('Private mode contacted GitHub state');
 console.log('Auth browser passed: stored-session approval rechecked, forged legacy identity ignored, approved account allowed, no GitHub state requests.');
}finally{await browser.close()}
