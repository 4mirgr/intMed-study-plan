// Live protocol check only: empty JSON is rejected before username lookup/Auth.
// No account credentials, forms, notifications, or private data are used.
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';

for(const [name,engine] of [['Chromium',chromium],['WebKit',webkit]]){
 const browser=await engine.launch({headless:true});
 try{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();
  const response=await page.goto('https://gerami-website.pages.dev/intmed/',{waitUntil:'domcontentloaded',timeout:45000});
  assert.equal(response.status(),200);
  await page.waitForFunction(()=>!!window.INTMED_CONFIG?.supabaseAnonKey,null,{timeout:15000});
  const results=await page.evaluate(async()=>{
   const config=window.INTMED_CONFIG,results=[];
   for(const origin of ['https://api.drgerami-md.ir','https://upwbktvnybsjugdegjji.supabase.co']){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    try{
     const response=await fetch(origin+'/functions/v1/intmed-login',{method:'POST',headers:{apikey:config.supabaseAnonKey,'Content-Type':'application/json'},body:'{}',signal:controller.signal});
     await response.text();results.push({host:new URL(origin).host,status:response.status});
    }finally{clearTimeout(timer);}
   }
   return results;
  });
  assert.equal(results.length,2);
  for(const result of results)assert.equal(result.status,401,name+' Pages.dev request must reach readable credential validation at '+result.host);
  console.log('PASS live '+name+' Pages.dev CORS: gateway and direct route return readable empty-request rejection; no credentials used.');
 }finally{await browser.close();}
}
