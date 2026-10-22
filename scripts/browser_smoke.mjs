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
const page = await browser.newPage();
const requested = [];
const errors = [];
page.on("request", request => requested.push(request.url()));
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });

try {
  await page.goto(base, {waitUntil: "domcontentloaded"});
  await page.waitForSelector(".topic-item", {state:"attached"});
  const categories = await page.locator(".topic-cat").count();
  const topics = await page.locator(".topic-item").count();
  if (categories !== 12 || topics !== 141) throw new Error(`unexpected taxonomy DOM: ${categories}/${topics}`);
  if (requested.some(url => url.includes("content-bundle.json"))) throw new Error("legacy bundle was requested");
  if (requested.some(url => /content\/topics\/.+\.json/.test(url))) throw new Error("topic payload fetched eagerly");

  await page.evaluate(() => { document.getElementById("loginGate").style.display = "none"; document.getElementById("appRoot").style.display = ""; });
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
