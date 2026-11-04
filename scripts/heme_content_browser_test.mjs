import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
let playwright;try{playwright=createRequire(import.meta.url)('playwright');}catch{playwright=createRequire('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright');}
const browser=await playwright.chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
const page=await browser.newPage({serviceWorkers:'block'}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
  await page.goto(process.env.INTMED_BASE_URL||'http://127.0.0.1:8765',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('.topic-item[data-topic-id="heme-mpn"]',{state:'attached',timeout:5000});
  await page.evaluate(()=>{document.getElementById('loginGate').style.display='none';document.getElementById('appRoot').style.display='';});
  await page.locator('#educationSearch').fill('میلوپرولیفراتیو');
  const topic=page.locator('.topic-item[data-topic-id="heme-mpn"]');
  await topic.locator('.topic-list-btn').click();
  await topic.locator('.learn-btn').filter({hasText:'درسنامه'}).click();
  await topic.locator('.lesson-section').first().waitFor();
  assert.ok((await topic.textContent()).includes('PV'));
  await topic.locator('.learn-btn').filter({hasText:'تصاویر'}).click();
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('.topic-item[data-topic-id="heme-mpn"] img')).some(img=>img.complete&&img.naturalWidth>0));
  const topicPayload=await page.evaluate(async()=>{const manifest=await (await fetch('content/manifest.json')).json();const entry=manifest.topics['heme-mpn'];return (await fetch(entry.path||'content/topics/heme-mpn.json')).json();});
  assert.ok(topicPayload.mcq.length>=25,'source-question bank must not silently shrink to a handful of examples');
  assert.ok(topicPayload.flashcards.length>=10);assert.ok(topicPayload.kfPmp.length>=1);
  assert.ok(topicPayload.images.some(image=>image.sourceClass==='authored'&&image.kind==='algorithm'));
  assert.deepEqual(errors,[]);
  console.log('Heme PDF content browser passed: searchable MPN topic, lesson, algorithm and complete adapted question bank.');
}finally{await browser.close();}
