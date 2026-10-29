import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const executable=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
const browser=await chromium.launch({headless:true,...(executable?{executablePath:executable}:{})});
const page=await browser.newPage();
const owner='11111111-1111-4111-8111-111111111111',victim='33333333-3333-4333-8333-333333333333',otherAdmin='22222222-2222-4222-8222-222222222222',member='44444444-4444-4444-8444-444444444444';
let calls=0,fail=true,ownerRole='admin';
let profiles=[{id:owner,username:'owner',full_name:'مدیر',role:'admin',approved:true},{id:otherAdmin,username:'admin2',role:'admin',approved:true},{id:victim,username:'test_user',full_name:'کاربر آزمایشی',role:'user',approved:true},{id:member,username:'member',role:'user',approved:true}];
let rows=profiles.map(p=>({user_id:p.id,state:{},updated_at:'2026-10-20T10:00:00Z'}));
await page.addInitScript(id=>localStorage.setItem('intmed_supabase_session',JSON.stringify({access_token:'test',user:{id}})),owner);
await page.route(/https:\/\/(?:[^/]+\.supabase\.co|api\.drgerami-md\.ir)\//,async route=>{
 const req=route.request(),u=new URL(req.url()),method=req.method();
 if(u.pathname==='/rest/v1/rpc/delete_intmed_user'){
  calls++;assert.deepEqual(req.postDataJSON(),{target_user:victim});
  if(fail)return route.fulfill({status:503,json:{message:'حذف موقتاً انجام نشد'}});
  profiles=profiles.filter(p=>p.id!==victim);rows=rows.filter(r=>r.user_id!==victim);return route.fulfill({status:204,body:''});
 }
 if(u.pathname==='/rest/v1/profiles'){
  if(method==='GET'&&u.searchParams.has('id'))return route.fulfill({json:{...profiles[0],role:ownerRole}});
  if(method==='GET')return route.fulfill({json:profiles.map(p=>p.id===owner?{...p,role:ownerRole}:p)});
  return route.fulfill({status:204,body:''});
 }
 if(u.pathname==='/rest/v1/study_state'){
  if(method==='PATCH'){const body=req.postDataJSON();rows=rows.map(r=>r.user_id===owner?{...r,...body}:r);return route.fulfill({json:rows.filter(r=>r.user_id===owner)});}
  if(method==='POST'){const body=req.postDataJSON();return route.fulfill({json:Array.isArray(body)?body:[body]});}
  return route.fulfill({json:u.searchParams.has('user_id')?rows.filter(r=>r.user_id===owner):rows});
 }
 if(u.pathname==='/rest/v1/tickets')return route.fulfill({json:[]});
 if(u.pathname==='/rest/v1/intmed_conversations')return route.fulfill({json:[]});
 if(u.pathname==='/functions/v1/intmed-telegram-bot')return route.fulfill({json:{ok:true}});
 if(u.pathname==='/functions/v1/intmed-content-review')return route.fulfill({json:{items:[],counts:{}}});
 throw Error('Unexpected request '+u.pathname);
});
await page.route('**/rest/v1/intmed_recovery_tickets?*',r=>r.fulfill({json:[]}));
try{
 await page.goto(process.env.INTMED_BASE_URL||'http://127.0.0.1:8765');await page.waitForFunction(()=>document.getElementById('connStatus').textContent.includes('آنلاین'));
 await page.locator('#tabBtnManagement').click();
 assert.equal(await page.locator('[data-delete-user="'+owner+'"]').count(),0);
 assert.equal(await page.locator('[data-delete-user="'+otherAdmin+'"]').count(),0);
 await page.locator('[data-user-toggle="'+victim+'"]').click();
 assert.ok((await page.locator('[data-user-row="'+victim+'"]').textContent()).includes('test_user'));
 const button=page.locator('[data-delete-user="'+victim+'"]');
 page.once('dialog',async dialog=>{assert.ok(dialog.message().includes('کاربر آزمایشی'));assert.ok(dialog.message().includes('قابل بازگشت نیست'));await dialog.dismiss();});
 await button.click();assert.equal(calls,0);assert.equal(await button.count(),1);
 page.once('dialog',dialog=>dialog.accept());await button.click();
 await page.locator('#deleteNote-'+victim).filter({hasText:'حذف موقتاً انجام نشد'}).waitFor();assert.equal(await button.count(),1);const failedCalls=calls;assert.ok(failedCalls>=1);
 fail=false;page.once('dialog',dialog=>dialog.accept());await button.click();
 await page.waitForFunction(id=>!document.querySelector('[data-user-row="'+id+'"]'),victim);
 assert.equal(calls,failedCalls+1);assert.equal(await page.locator('[data-user-row="'+member+'"]').count(),1);
 ownerRole='user';await page.reload();await page.waitForFunction(()=>document.getElementById('connStatus').textContent.includes('آنلاین'));
 assert.equal(await page.locator('#adminPanelCard').isVisible(),false);
 console.log('Deletion browser passed: named confirmation, cancel sends no delete, failure preserves user, success removes only target, admin/self protection, member panel hidden.');
}finally{await browser.close()}
