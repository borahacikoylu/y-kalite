const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const AI_NAME = "Sonnet";
const RUN_COUNT = 5;
const VIEWPORT = { width: 1280, height: 800 };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round = (n) => parseFloat((Number.isFinite(n) ? n : 0).toFixed(2));

function toFileUrl(filePath) {
  return `file:///${filePath.replace(/\\/g, "/")}`;
}

function pickFirstSelector(page, selectors) {
  return selectors.reduce(async (accPromise, selector) => {
    const acc = await accPromise;
    if (acc) return acc;
    const node = await page.$(selector);
    return node ? selector : null;
  }, Promise.resolve(null));
}

async function typeInto(page, selectors, value, issues, fieldName) {
  const selector = await pickFirstSelector(page, selectors);
  if (!selector) {
    issues.push(`${fieldName} alani bulunamadi (${selectors.join(", ")})`);
    return false;
  }
  await page.click(selector, { clickCount: 3 });
  await page.type(selector, value, { delay: 20 });
  return true;
}

async function clickFirst(page, selectors, issues, fieldName) {
  const selector = await pickFirstSelector(page, selectors);
  if (!selector) {
    issues.push(`${fieldName} elementi bulunamadi (${selectors.join(", ")})`);
    return false;
  }
  await page.click(selector);
  return true;
}

async function runSingleTest(fileUrl, runIndex) {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);

  const issues = [];
  let dialogSeen = false;
  page.once("dialog", async (dialog) => {
    dialogSeen = true;
    await dialog.accept();
  });

  const totalStart = Date.now();

  const loadStart = Date.now();
  await page.goto(fileUrl, { waitUntil: "networkidle0" });
  const loadTime = Date.now() - loadStart;

  const scrollStart = Date.now();
  const scrollSteps = 20;
  const scrollHeight = await page.evaluate(() => {
    const bodyHeight = document.body ? document.body.scrollHeight : 0;
    const docHeight = document.documentElement ? document.documentElement.scrollHeight : 0;
    return Math.max(bodyHeight, docHeight, 1);
  });
  for (let i = 1; i <= scrollSteps; i += 1) {
    const y = (scrollHeight * i) / scrollSteps;
    await page.evaluate((pos) => window.scrollTo(0, pos), y);
    await wait(50);
  }
  const scrollTime = Date.now() - scrollStart;

  await page.evaluate(() => window.scrollTo(0, 0));

  const formStart = Date.now();
  await typeInto(page, ["#ad", "#firstName", 'input[name="ad"]'], "Ada", issues, "Ad");
  await typeInto(page, ["#soyad", "#lastName", 'input[name="soyad"]'], "Yilmaz", issues, "Soyad");
  await typeInto(page, ["#eposta", "#email", 'input[type="email"]'], "ada.yilmaz@example.com", issues, "E-posta");
  await clickFirst(page, ["#sozlesme", "#agreeCheckbox", "#onay", 'input[type="checkbox"]'], issues, "Sozlesme checkbox");
  const formTime = Date.now() - formStart;

  await clickFirst(
    page,
    ['button[type="submit"]', "#gonder", 'button[id*="submit"]'],
    issues,
    "Gonder butonu"
  );
  await wait(300);

  if (!dialogSeen) {
    issues.push("Alert/dialog yakalanamadi");
  }

  const totalTime = Date.now() - totalStart;
  const metrics = await page.metrics();
  const perfData = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] || {};
    return {
      domContentLoaded: nav.domContentLoadedEventEnd || 0,
      domInteractive: nav.domInteractive || 0,
      domNodes: document.querySelectorAll("*").length || 0,
      htmlBytes: document.documentElement ? document.documentElement.outerHTML.length : 0
    };
  });

  await page.close();
  await browser.close();

  return {
    run: runIndex + 1,
    loadTime: round(loadTime),
    scrollTime: round(scrollTime),
    formTime: round(formTime),
    totalTime: round(totalTime),
    jsHeapMB: round((metrics.JSHeapUsedSize || 0) / 1024 / 1024),
    domNodes: round(perfData.domNodes),
    htmlBytes: round(perfData.htmlBytes),
    domContentLoaded: round(perfData.domContentLoaded),
    domInteractive: round(perfData.domInteractive),
    layoutCount: round(metrics.LayoutCount || 0),
    styleCount: round(metrics.RecalcStyleCount || 0),
    scriptDuration: round((metrics.ScriptDuration || 0) * 1000),
    issues
  };
}

function averageRuns(runs) {
  const keys = [
    "loadTime",
    "scrollTime",
    "formTime",
    "totalTime",
    "jsHeapMB",
    "domNodes",
    "htmlBytes",
    "domContentLoaded",
    "layoutCount",
    "styleCount",
    "scriptDuration"
  ];
  const avg = {};
  for (const key of keys) {
    const sum = runs.reduce((acc, run) => acc + (Number(run[key]) || 0), 0);
    avg[key] = round(sum / runs.length);
  }
  return avg;
}

async function main() {
  const htmlPath = path.resolve(__dirname, "site.html");
  if (!fs.existsSync(htmlPath)) {
    throw new Error(`site.html bulunamadi: ${htmlPath}`);
  }
  const fileUrl = toFileUrl(htmlPath);

  const runs = [];
  for (let i = 0; i < RUN_COUNT; i += 1) {
    const runResult = await runSingleTest(fileUrl, i);
    runs.push(runResult);
  }

  const allIssues = runs.flatMap((r) => r.issues.map((issue) => `Run ${r.run}: ${issue}`));
  const output = {
    ai: AI_NAME,
    runs,
    avg: averageRuns(runs),
    issues: allIssues
  };

  const resultsDir = path.resolve(__dirname, "results");
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  const outputPath = path.join(resultsDir, "puppeteer_results.json");
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf8");

  if (allIssues.length > 0) {
    console.error("Test issue listesi:");
    for (const issue of allIssues) {
      console.error(`- ${issue}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`Test basarili. Sonuclar: ${outputPath}`);
  }
}

main().catch((error) => {
  console.error("Test calisirken hata olustu:", error.message);
  process.exit(1);
});
