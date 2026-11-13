import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';

let playwright;
try{playwright=createRequire(import.meta.url)('playwright');}
catch{playwright=createRequire('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');}
const browser=await playwright.chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
const base=process.env.INTMED_BASE_URL||'http://127.0.0.1:8765';
const manifest=JSON.parse(fs.readFileSync('docs/content/manifest.json','utf8'));
const library=JSON.parse(fs.readFileSync('docs/content/library.json','utf8'));
const cases=[];
async function fixture(path,mode){
 const page=await browser.newPage({serviceWorkers:'block'});page.setDefaultTimeout(5000);
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.waitForSelector('.topic-item[data-topic-id="heme-pbs"]',{state:'attached'});
 await page.evaluate(({path,mode})=>{
  document.getElementById('loginGate').style.display='none';document.getElementById('appRoot').style.display='';
  window.INTMED_CONFIG={...(window.INTMED_CONFIG||{}),contentTimeoutMs:150};
  const original=window.fetch.bind(window);
  window.contentProbe={path,mode,calls:[],aborted:false};
  window.fetch=function(input,options){
   const url=new URL(typeof input==='string'?input:input.url,location.href),probe=window.contentProbe;
   if(url.pathname.endsWith(probe.path)){
    probe.calls.push(url.href);
    if(probe.mode!=='healthy'){
     options?.signal?.addEventListener('abort',()=>{probe.aborted=true;});
     if(probe.mode==='headers')return new Promise(()=>{});
     if(probe.mode==='body')return Promise.resolve({ok:true,status:200,json:()=>new Promise(()=>{})});
     if(probe.mode==='reject')return Promise.reject(new TypeError('Synthetic temporary network failure'));
    }
   }
   return original(input,options);
  };
 },{path,mode});
 if(await page.locator('#headerCollapseBtn').getAttribute('aria-expanded')==='false')await page.locator('#headerCollapseBtn').click();
 return page;
}
async function openTopic(page,type){
 await page.locator('#educationSearch').fill('PBS');
 const topic=page.locator('.topic-item[data-topic-id="heme-pbs"]');
 await topic.locator('.topic-list-btn').click();
 await topic.locator('.learn-btn').filter({hasText:type}).click();
 return topic;
}
async function run(name,body){
 try{await body();cases.push({name,ok:true});console.log('PASS '+name);}
 catch(error){cases.push({name,ok:false});console.error('FAIL '+name+': '+error.message.split('\n')[0]);}
}
try{
 for(const mode of ['headers','body'])await run('topic '+mode+' timeout releases the loader and a retry renders the lesson',async()=>{
  const page=await fixture('/content/topics/heme-pbs.json',mode);
  try{
   const topic=await openTopic(page,'درسنامه');
   await topic.getByText('بارگذاری این مبحث ناموفق بود.',{exact:false}).waitFor({timeout:1200});
   assert.equal(await page.evaluate(()=>window.contentProbe.aborted),true);
   assert.equal(new URL(await page.evaluate(()=>window.contentProbe.calls[0])).searchParams.get('v'),manifest.topics['heme-pbs'].sha256,'topic requests retain their exact content hash');
   await page.evaluate(()=>{window.contentProbe.mode='healthy';window.INTMED_CONFIG.contentTimeoutMs=1500;});
   await topic.getByRole('button',{name:'تلاش مجدد'}).click();
   await topic.locator('.lesson-section').first().waitFor({timeout:2000});
   assert.equal(await page.evaluate(()=>window.contentProbe.calls.length),2);
  }finally{await page.close();}
 });
 await run('lesson opening does not wait for an unrelated question image topic',async()=>{
  const page=await fixture('/content/topics/heme-iron-anemia.json','headers');
  try{
   const payload=JSON.parse(fs.readFileSync('docs/content/topics/heme-pbs.json','utf8'));
   payload.mcq=[{id:'qa-external-image',question:'Synthetic image question',options:[],imageRef:{topicId:'heme-iron-anemia',imageId:'pbs-iron-deficiency-uthman'}}];
   await page.route('**/content/topics/heme-pbs.json?*',route=>route.fulfill({json:payload}));
   const topic=await openTopic(page,'درسنامه');
   await topic.locator('.lesson-section').first().waitFor({timeout:1200});
   assert.equal(await page.evaluate(()=>window.contentProbe.calls.length),0,'lesson must not request question-only image dependencies');
   await topic.locator('.learn-btn').filter({hasText:'آزمون ۴'}).click();
   await topic.getByText('بارگذاری این مبحث ناموفق بود.',{exact:false}).waitFor({timeout:1200});
   assert.equal(await page.evaluate(()=>window.contentProbe.calls.length),1,'question opening still requests its external image topic');
  }finally{await page.close();}
 });
 for(const mode of ['headers','body'])await run('search '+mode+' timeout permits a later full-text search',async()=>{
  const page=await fixture('/content/search.json',mode);
  try{
   await page.locator('#educationSearch').fill('PBS');
   await page.waitForFunction(()=>window.contentProbe.aborted,null,{timeout:1200});
   await page.evaluate(()=>{window.contentProbe.mode='healthy';window.INTMED_CONFIG.contentTimeoutMs=1500;});
   await page.locator('#educationSearch').fill('نوروتوکسیسیته');
   await page.waitForFunction(()=>!document.querySelector('.topic-item[data-topic-id="id-cns-meningoencephalitis"]').hidden,null,{timeout:2000});
   assert.equal(await page.evaluate(()=>window.contentProbe.calls.length),2);
  }finally{await page.close();}
 });
 for(const mode of ['headers','body'])await run('library '+mode+' timeout permits a later index load',async()=>{
  const page=await fixture('/content/library.json',mode),errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
   await page.locator('#tabBtnLibrary').click();
   await page.waitForFunction(()=>document.getElementById('libraryStatus').textContent.includes('بارگذاری کتابخانه انجام نشد'),null,{timeout:1200});
   assert.equal(await page.evaluate(()=>window.contentProbe.aborted),true);
   await page.evaluate(()=>{window.contentProbe.mode='healthy';window.INTMED_CONFIG.contentTimeoutMs=1500;});
   await page.locator('#tabBtnLibrary').click();
   await page.locator('.library-card').first().waitFor({timeout:2000});
   assert.equal(await page.evaluate(()=>window.contentProbe.calls.length),2);assert.deepEqual(errors,[],'reported network errors must not become unhandled rejections');
  }finally{await page.close();}
 });
 await run('library topic timeout can retry the same viewer without reloading the page',async()=>{
  const entry=library.entries.find(item=>item.itemId==='pbs-bccd-labeled-example');
  const page=await fixture('/content/topics/heme-pbs.json','body');
  try{
   await page.locator('#tabBtnLibrary').click();
   await page.locator('.library-card').first().waitFor();
   await page.locator('#librarySearch').fill(entry.title);
   await page.locator('.library-card[data-library-id="'+entry.id+'"] .library-card-open').click();
   await page.waitForFunction(()=>document.getElementById('libraryViewerBody').textContent.includes('دریافت جزئیات انجام نشد'),null,{timeout:1200});
   assert.equal(await page.evaluate(()=>window.contentProbe.aborted),true);
   await page.evaluate(()=>{window.contentProbe.mode='healthy';window.INTMED_CONFIG.contentTimeoutMs=1500;});
   await page.locator('#libraryViewerBody').getByRole('button',{name:'تلاش مجدد'}).click();
   await page.waitForFunction(()=>{const img=document.querySelector('#libraryViewerBody img');return img&&img.complete&&img.naturalWidth>0;},null,{timeout:2000});
   assert.equal(await page.evaluate(()=>window.contentProbe.calls.length),2);
  }finally{await page.close();}
 });
}finally{await browser.close();}
assert.equal(cases.filter(item=>!item.ok).length,0,JSON.stringify(cases.filter(item=>!item.ok)));
console.log('Content recovery passed: deadlines include headers and bodies; lesson/question dependency separation, same-page retries and search recovery.');
