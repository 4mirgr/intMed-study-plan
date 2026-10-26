import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const base = process.env.INTMED_BASE_URL || "http://127.0.0.1:8765";
const systemChromium = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
const browser = await chromium.launch({
  headless: true,
  timeout: 30000,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
  ...(systemChromium ? {executablePath: systemChromium} : {})
});
const context = await browser.newContext({serviceWorkers:"block"});
const page = await context.newPage();
const requested = [];
const errors = [];
page.on("request", request => requested.push(request.url()));
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });

try {
  await page.goto(base, {waitUntil: "domcontentloaded"});
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() =>
    document.querySelectorAll(".topic-cat").length === 12 &&
    document.querySelectorAll(".topic-item").length === 144
  );
  const categories = await page.locator(".topic-cat").count();
  const topics = await page.locator(".topic-item").count();
  if (categories !== 12 || topics !== 144) throw new Error(`unexpected taxonomy DOM: ${categories}/${topics}`);
  if (requested.some(url => url.includes("content-bundle.json"))) throw new Error("legacy bundle was requested");
  if (requested.some(url => /content\/topics\/.+\.json/.test(url))) throw new Error("topic payload fetched eagerly");

  await page.evaluate(() => { document.getElementById("loginGate").style.display = "none"; document.getElementById("appRoot").style.display = ""; });
  if (await page.locator('.education-guide').evaluate(element => element.open)) throw new Error('education guide must be collapsed initially');
  await page.locator('#educationSearch').fill('انسفالیت');
  await page.waitForFunction(() => document.getElementById('educationSearchStatus').textContent.includes('مبحث مرتبط'));
  await page.waitForFunction(() => performance.getEntriesByType('resource').some(entry => new URL(entry.name).pathname.endsWith('/content/search.json')));
  const encephalitis = page.locator('.topic-item[data-topic-id="id-cns-meningoencephalitis"]');
  if (await encephalitis.evaluate(element => element.hidden)) throw new Error('infectious encephalitis topic was not found by education search');
  await page.locator('#educationSearch').fill('نوروتوکسیسیته');
  await page.waitForFunction(() => document.getElementById('educationSearchStatus').textContent.includes('مبحث مرتبط'));
  if (await encephalitis.evaluate(element => element.hidden)) throw new Error('full-text education search did not find encephalitis treatment content');
  await page.locator('#educationSearch').fill('انسفالیت');
  if (!(await encephalitis.locator('xpath=ancestor::div[contains(@class,"topic-cat")]').getAttribute('class')).includes('open')) throw new Error('infectious category did not open for search result');
  for (const id of ['id-cns-meningoencephalitis','id-brain-abscess-empyema','id-cns-opportunistic']) {
    const category = page.locator(`.topic-item[data-topic-id="${id}"]`).locator('xpath=ancestor::div[contains(@class,"topic-cat")]');
    if (!(await category.locator('.cat-title').textContent()).includes('عفونی')) throw new Error(`${id} is not under infectious diseases`);
  }
  await page.locator('#educationSearchClear').click();
  if (await page.locator('.topic-item[hidden]').count()) throw new Error('clearing education search did not restore topics');
  const topic = page.locator(".topic-item").filter({hasText:"خواندن و تفسیر ECG"});
  await topic.locator(".topic-list-btn").evaluate(element => element.click());
  await topic.locator(".learn-btn").filter({hasText:"درسنامه"}).evaluate(element => element.click());
  await topic.locator(".lesson-section").first().waitFor({state:"attached"});
  if (!requested.some(url => new URL(url).pathname.endsWith("/content/topics/cardio-ecg.json"))) throw new Error("topic payload was not fetched lazily");
  const anchor = await topic.locator("[data-hl-loc^='lesson:']").first().getAttribute("data-hl-loc");
  if (!anchor || /^lesson:\d+:\d+$/.test(anchor)) throw new Error(`lesson anchor is not stable: ${anchor}`);
  if (errors.length) throw new Error("browser errors: " + errors.join(" | "));
  console.log(`browser smoke passed: ${categories} categories, ${topics} topics, lazy fetch, stable lesson anchor`);
} finally {
  await browser.close();
}
