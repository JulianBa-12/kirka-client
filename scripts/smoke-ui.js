'use strict';
// UI smoke test: drives a running Polaris desktop app through the Chrome DevTools Protocol,
// opens every view, records uncaught exceptions / console errors and saves screenshots.
// Usage: node scripts/smoke-ui.js <port> <outDir> [views...]
const fs = require('node:fs');
const path = require('node:path');

const port = Number(process.argv[2] || 9333);
const out = path.resolve(process.argv[3] || 'smoke-out');
const VIEWS = process.argv.slice(4);
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target(match) {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const t = list.find((x) => x.type === 'page' && match(x.url));
      if (t) return t;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('target not found');
}

(async () => {
  const t = await target((u) => u.includes('index.html'));
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map(); const errors = [];
  let current = 'boot';
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') errors.push({ view: current, text: m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text });
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push({ view: current, text: m.params.args.map((a) => a.value ?? a.description).join(' ') });
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push({ view: current, text: `${m.params.entry.text} ${m.params.entry.url || ''}` });
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJs = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description; };
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await sleep(2500);
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(r.result.data, 'base64')); };
  if (process.env.SMOKE_PRE) { const r = await evalJs(process.env.SMOKE_PRE); console.log('pre:', r); await sleep(1500); }
  await shot('00-boot');
  const views = VIEWS.length ? VIEWS : ['home', 'play', 'customization', 'skins', 'inventory', 'marketplace', 'social', 'analytics', 'replays', 'performance', 'profiles', 'resources', 'maps', 'plugins', 'updates', 'hub', 'settings'];
  let n = 1;
  for (const v of views) {
    const [route, after] = v.split('|');
    const [dest, q] = route.split('?');
    const params = q ? Object.fromEntries(new URLSearchParams(q)) : {};
    current = v;
    const r = await evalJs(`(async()=>{ document.querySelectorAll('.modal-backdrop,.modal').forEach(m=>m.remove()); const m = await import('./js/app.js'); await m.go(${JSON.stringify(dest)}, ${JSON.stringify(params)}); return 'ok'; })()`);
    if (r !== 'ok') errors.push({ view: v, text: `go failed: ${r}` });
    await sleep(1800);
    if (after) { const a = await evalJs(after); if (typeof a === 'string' && a.startsWith('Error')) errors.push({ view: v, text: a }); await sleep(1200); }
    await shot(`${String(n++).padStart(2, '0')}-${route.replace(/[^a-z0-9]+/gi, '_')}`);
  }
  fs.writeFileSync(path.join(out, 'errors.json'), JSON.stringify(errors, null, 2));
  console.log(`${views.length} views, ${errors.length} errors`);
  for (const e of errors) console.log(`[${e.view}] ${e.text}`);
  ws.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
