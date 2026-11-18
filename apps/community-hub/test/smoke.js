#!/usr/bin/env node
/**
 * Static smoke test over dist/ (no browser):
 *  - every expected page exists, has CSP meta, lang, title, single h1
 *  - every relative href/src in the HTML resolves to a file in dist/
 *  - no absolute root links ("/...") that would break under /kirka-client/
 *  - no Owner build referenced anywhere in pages or data
 *  - data files parse and have the expected shapes
 *
 *   node test/smoke.js [--dist dist]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const DIST = path.resolve(__dirname, '..', args[args.indexOf('--dist') + 1] && args.includes('--dist') ? args[args.indexOf('--dist') + 1] : 'dist');
const PAGES = ['index', 'downloads', 'news', 'changelog', 'features', 'community', 'skins', 'resources', 'plugins', 'guides', 'support', 'bugs', 'suggestions', 'discord', 'about', '404'];
const fails = [];
const fail = (m) => fails.push(m);

if (!fs.existsSync(path.join(DIST, '.nojekyll'))) fail('.nojekyll missing');

for (const p of PAGES) {
  const file = path.join(DIST, `${p}.html`);
  if (!fs.existsSync(file)) { fail(`${p}.html missing`); continue; }
  const html = fs.readFileSync(file, 'utf8');
  if (!/<meta http-equiv="Content-Security-Policy"/.test(html)) fail(`${p}: no CSP`);
  if (!/<html lang="en"/.test(html)) fail(`${p}: no lang`);
  if (!/<title>[^<]+<\/title>/.test(html)) fail(`${p}: no title`);
  const h1 = (html.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) fail(`${p}: ${h1} h1 elements`);
  if (/\sstyle="/.test(html)) fail(`${p}: inline style attribute`);
  if (/<script(?![^>]*\ssrc=)[^>]*>/.test(html)) fail(`${p}: inline script`);
  if (/owner/i.test(html.replace(/not affiliated[^<]*/gi, '').replace(/respective owners/gi, ''))) fail(`${p}: mentions owner`);
  for (const m of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    const u = m[1];
    if (/^(https?:|mailto:|#|data:)/.test(u)) continue;
    if (u.startsWith('/')) { if (p !== '404' || !u.startsWith('/kirka-client/')) fail(`${p}: root-absolute link ${u}`); continue; }
    const target = path.join(DIST, decodeURIComponent(u.replace(/[?#].*$/, '')));
    if (!fs.existsSync(target)) fail(`${p}: broken link ${u}`);
  }
}

// JS module imports resolve
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
for (const f of walk(path.join(DIST, 'assets/js')).filter((f) => f.endsWith('.js'))) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/(?:import|from)\s*\(?\s*['"](\.[^'"]+)['"]/g)) {
    if (!fs.existsSync(path.resolve(path.dirname(f), m[1]))) fail(`${path.relative(DIST, f)}: unresolved import ${m[1]}`);
  }
  if (/\.innerHTML\s*=/.test(src) && !/core\/dom\.js$/.test(f)) fail(`${path.relative(DIST, f)}: innerHTML assignment`);
}

// brand assets: never the owner icon
for (const f of walk(path.join(DIST, 'assets'))) if (/owner/i.test(path.basename(f))) fail(`owner asset shipped: ${path.relative(DIST, f)}`);

// data shapes
const json = (n) => { try { return JSON.parse(fs.readFileSync(path.join(DIST, 'data', n), 'utf8')); } catch (e) { fail(`data/${n}: ${e.message}`); return null; } };
const cfg = json('site-config.json'); if (cfg && typeof cfg.apiBase !== 'string') fail('site-config.apiBase not a string');
for (const n of ['website-bundle.json', 'releases.json']) {
  const env = json(n);
  if (env) { if (typeof env.payload !== 'string') fail(`${n}: payload not a string`); else try { JSON.parse(env.payload); } catch { fail(`${n}: payload not JSON`); } }
}
for (const n of ['news.json', 'changelog.json']) { const d = json(n); if (d && !Array.isArray(d.items)) fail(`${n}: items not an array`); }

console.log(fails.length ? fails.map((f) => '✗ ' + f).join('\n') + `\n${fails.length} problem(s)` : `✓ smoke: ${PAGES.length} pages, links, imports, data shapes OK`);
process.exit(fails.length ? 1 : 0);
