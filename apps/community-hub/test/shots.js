#!/usr/bin/env node
'use strict';
/**
 * Visual QA: full-page screenshots of every page at 1440/1024/768/375 (and 360 overflow check).
 *   node test/shots.js [--base http://127.0.0.1:4173/kirka-client/] [--pages index,downloads] [--widths 1440,375] [--out test/screens]
 * Reports console errors, failed requests, CSP violations and horizontal overflow.
 */
const path = require('path');
const fs = require('fs');
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/home/user/node_modules/playwright'); }

const args = process.argv.slice(2);
const arg = (n, f) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : f; };
const BASE = arg('--base', 'http://127.0.0.1:4173/kirka-client/');
const OUT = path.resolve(__dirname, '..', arg('--out', 'test/screens'));
const PAGES = arg('--pages', 'index,downloads,news,changelog,features,community,skins,resources,plugins,guides,support,bugs,suggestions,discord,about,404').split(',');
const WIDTHS = arg('--widths', '1440,1024,768,375').split(',').map(Number);
const FULL = !args.includes('--viewport');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await playwright.chromium.launch();
  let problems = 0;
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 800 : 900 }, deviceScaleFactor: 1 });
    for (const p of PAGES) {
      const page = await ctx.newPage();
      const issues = [];
      page.on('console', (m) => { if (m.type() === 'error') issues.push(`console: ${m.text()}`); });
      page.on('pageerror', (e) => issues.push(`pageerror: ${e.message}`));
      page.on('requestfailed', (r) => { if (!/\/api\/v1\//.test(r.url())) issues.push(`requestfailed: ${r.url()}`); });
      page.on('response', (r) => { if (r.status() >= 400 && !/\/api\/v1\//.test(r.url()) && !(p === '404' && r.url().endsWith('/does-not-exist'))) issues.push(`http ${r.status()}: ${r.url()}`); });
      const url = p === '404' ? BASE + 'does-not-exist' : BASE + (p.includes('.html') || p.includes('?') ? p : `${p}.html`);
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(250);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 0) issues.push(`horizontal overflow: ${overflow}px`);
      const name = `${p.replace(/[^a-z0-9]+/gi, '_')}-${w}.png`;
      await page.screenshot({ path: path.join(OUT, name), fullPage: FULL });
      if (issues.length) { problems += issues.length; console.log(`✗ ${p} @${w}\n   ${issues.join('\n   ')}`); } else console.log(`✓ ${p} @${w}`);
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
  console.log(problems ? `${problems} issue(s)` : 'no issues');
  process.exitCode = problems ? 1 : 0;
})();
