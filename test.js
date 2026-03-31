const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ai = 'GPT-5 Codex';
const runCount = 5;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round = (n) => parseFloat((Number.isFinite(n) ? n : 0).toFixed(2));

async function safeType(page, selector, text) {
  try {
    const el = await page.$(selector);
    if (!el) return;
    await page.type(selector, text, { delay: 20 });
  } catch (_) {}
}

async function safeClick(page, selector) {
  try {
    const el = await page.$(selector);
    if (!el) return;
    await page.click(selector);
  } catch (_) {}
}

async function runSingleTest(fileUrl) {
  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: { width: 1280, height: 800 }
  });

  const page = await browser.newPage();
  page.on('dialog', async (dialog) => {
    try {
      await dialog.accept();
    } catch (_) {}
  });

  const totalStart = Date.now();

  const loadStart = Date.now();
  try {
    await page.goto(fileUrl, { waitUntil: 'networkidle0' });
  } catch (_) {}
  const loadTime = Date.now() - loadStart;

  const scrollStart = Date.now();
  try {
    const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight || 0);
    for (let i = 0; i <= 20; i++) {
      const y = (scrollHeight * i) / 20;
      await page.evaluate((pos) => window.scrollTo(0, pos), y);
      await wait(50);
    }
  } catch (_) {}
  const scrollTime = Date.now() - scrollStart;

  const formStart = Date.now();
  await safeType(page, '#ad', 'Ada');
  await safeType(page, '#soyad', 'Yilmaz');
  await safeType(page, '#eposta', 'ada.yilmaz@example.com');
  await safeClick(page, '#onay');
  await safeClick(page, '#gonder');
  const formTime = Date.now() - formStart;

  let metrics = {};
  try {
    metrics = await page.metrics();
  } catch (_) {
    metrics = {};
  }

  let perfData = { domContentLoaded: 0, domInteractive: 0, domNodes: 0, htmlBytes: 0 };
  try {
    perfData = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const dcl = nav ? nav.domContentLoadedEventEnd : 0;
      const di = nav ? nav.domInteractive : 0;
      const nodes = document.querySelectorAll('*').length;
      const htmlSize = document.documentElement.outerHTML.length;
      return {
        domContentLoaded: dcl || 0,
        domInteractive: di || 0,
        domNodes: nodes || 0,
        htmlBytes: htmlSize || 0
      };
    });
  } catch (_) {}

  const totalTime = Date.now() - totalStart;

  const result = {
    loadTime: round(loadTime),
    scrollTime: round(scrollTime),
    formTime: round(formTime),
    totalTime: round(totalTime),
    jsHeapMB: round(((metrics.JSHeapUsedSize || 0) / 1024 / 1024)),
    domNodes: round(perfData.domNodes || 0),
    htmlBytes: round(perfData.htmlBytes || 0),
    domContentLoaded: round(perfData.domContentLoaded || 0),
    domInteractive: round(perfData.domInteractive || 0),
    layoutCount: round(metrics.LayoutCount || 0),
    styleCount: round(metrics.RecalcStyleCount || 0),
    scriptDuration: round((metrics.ScriptDuration || 0) * 1000),
    rawMetrics: metrics
  };

  try {
    await browser.close();
  } catch (_) {}

  return result;
}

function averageRuns(runs) {
  const keys = [
    'loadTime',
    'scrollTime',
    'formTime',
    'totalTime',
    'jsHeapMB',
    'domNodes',
    'htmlBytes',
    'domContentLoaded',
    'layoutCount',
    'styleCount',
    'scriptDuration'
  ];

  const avg = {};
  for (const key of keys) {
    const sum = runs.reduce((acc, run) => acc + (Number(run[key]) || 0), 0);
    avg[key] = round(sum / runs.length);
  }
  return avg;
}

async function main() {
  const htmlPath = path.resolve(__dirname, 'site.html');
  const fileUrl = `file://${htmlPath.replace(/\\/g, '/')}`;

  const runs = [];
  for (let i = 0; i < runCount; i++) {
    try {
      const runResult = await runSingleTest(fileUrl);
      runs.push(runResult);
    } catch (_) {
      runs.push({
        loadTime: 0,
        scrollTime: 0,
        formTime: 0,
        totalTime: 0,
        jsHeapMB: 0,
        domNodes: 0,
        htmlBytes: 0,
        domContentLoaded: 0,
        domInteractive: 0,
        layoutCount: 0,
        styleCount: 0,
        scriptDuration: 0,
        rawMetrics: {}
      });
    }
  }

  const output = {
    ai,
    runs,
    avg: averageRuns(runs)
  };

  const resultsDir = path.resolve(__dirname, 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const outputPath = path.join(resultsDir, 'puppeteer_results.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
}

main().catch(() => {});
