#!/usr/bin/env node
/**
 * Live-mode end-to-end test. Requires a THROWAWAY backend and a build whose
 * data/site-config.json points at it.
 *
 *   node test/live.js [--site http://127.0.0.1:4173/kirka-client/] [--api http://127.0.0.1:8789/api/v1] [--owner-token <token>]
 *
 * With --owner-token the uploaded skin is approved through the owner API so
 * likes, comments and the public listing can be exercised too.
 */
'use strict';
const zlib = require('zlib');
let pw; try { pw = require('playwright'); } catch { pw = require('/home/user/node_modules/playwright'); }

const args = process.argv.slice(2);
const arg = (n, f) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : f; };
const SITE = arg('--site', 'http://127.0.0.1:4173/kirka-client/');
const API = arg('--api', 'http://127.0.0.1:8789/api/v1');
const OWNER = arg('--owner-token', process.env.OWNER_TOKEN || '');

function png(w, h) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = (x * 4) & 255; raw[o + 1] = 217; raw[o + 2] = (y * 4) & 255; }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const results = [];
const step = async (name, fn) => {
  try { await fn(); results.push(['✓', name]); console.log('✓', name); }
  catch (e) { results.push(['✗', name, e.message]); console.log('✗', name, '\n   ', e.message.split('\n')[0]); }
};

(async () => {
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 4\d\d/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const user = `hub${Date.now().toString(36).slice(-6)}`;
  const pass = 'correct-horse-battery-9';
  let itemId = null;

  await step('support page reports backend online', async () => {
    await page.goto(SITE + 'support.html', { waitUntil: 'networkidle' });
    await page.getByText('Online', { exact: true }).nth(1).waitFor({ timeout: 5000 });
  });

  await step('register new account', async () => {
    await page.goto(SITE + 'community.html#register', { waitUntil: 'networkidle' });
    await page.fill('#re-user', user);
    await page.fill('#re-pass', pass);
    await page.fill('#re-pass2', pass);
    await page.check('#re-agree');
    await page.locator('form:has(#re-user) button[type=submit]').click();
    await page.locator('#pf-name').waitFor({ state: 'attached', timeout: 8000 });
  });

  await step('edit profile (display name, bio)', async () => {
    await page.locator('.profile-edit summary').click();
    await page.fill('#pf-name', 'Hub Tester');
    await page.fill('#pf-bio', 'Testing the community hub.');
    await page.locator('form:has(#pf-name) button[type=submit]').click();
    await page.waitForResponse((r) => r.url().endsWith('/auth/me') && r.request().method() === 'PATCH', { timeout: 8000 });
    const r = await page.evaluate(async (api) => (await fetch(api + '/auth/me', { headers: { Authorization: 'Bearer ' + localStorage.getItem('polaris.hub.token') } })).json(), API);
    const u = r.user || r;
    if (u.displayName !== 'Hub Tester') throw new Error('displayName not saved: ' + JSON.stringify(u).slice(0, 200));
  });

  await step('header shows signed-in account', async () => {
    await page.goto(SITE + 'index.html', { waitUntil: 'networkidle' });
    const t = await page.locator('[data-chrome="account"]').textContent();
    if (!/Hub Tester|hub/i.test(t)) throw new Error('account link text: ' + t);
  });

  await step('upload a skin', async () => {
    await page.goto(SITE + 'skins.html', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Upload' }).first().click();
    await page.setInputFiles('#up-file', { name: 'test-skin.png', mimeType: 'image/png', buffer: png(64, 64) });
    await page.fill('#up-title', `Cyan test skin ${user}`);
    await page.fill('#up-desc', 'Uploaded by the live-mode test.');
    const resp = page.waitForResponse((r) => r.url().includes('/community/items') && r.request().method() === 'POST', { timeout: 10000 });
    await page.locator('form:has(#up-file) button[type=submit]').click();
    const r = await resp;
    if (r.status() !== 201 && r.status() !== 200) throw new Error('upload status ' + r.status() + ' ' + (await r.text()).slice(0, 200));
    const j = await r.json(); itemId = (j.item || j).id;
  });

  if (OWNER && itemId) {
    await step('approve upload via owner API (test only)', async () => {
      const r = await fetch(`${API}/owner/community/items/${itemId}`, { method: 'PATCH', headers: { Authorization: 'Bearer ' + OWNER, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'approved' }) });
      if (!r.ok) throw new Error('approve ' + r.status);
    });

    await step('skin appears in gallery; like + comment', async () => {
      await page.goto(SITE + 'skins.html', { waitUntil: 'networkidle' });
      await page.getByText(`Cyan test skin ${user}`).first().click();
      const dlg = page.locator('dialog[open]');
      await dlg.waitFor({ timeout: 5000 });
      const like = dlg.getByRole('button', { name: /like/i }).first();
      const lr = page.waitForResponse((r) => /\/like$/.test(r.url()), { timeout: 8000 });
      await like.click(); if (!(await lr).ok()) throw new Error('like failed');
      await dlg.locator('textarea').first().fill(`Nice colours ${user}`);
      const cr = page.waitForResponse((r) => /\/comments$/.test(r.url()) && r.request().method() === 'POST', { timeout: 8000 });
      await dlg.getByRole('button', { name: 'Post comment' }).click();
      if (!(await cr).ok()) throw new Error('comment failed');
      await dlg.getByText(`Nice colours ${user}`).waitFor({ timeout: 5000 });
    });

    await step('deep link ?item= opens dialog', async () => {
      await page.goto(SITE + `skins.html?item=${itemId}`, { waitUntil: 'networkidle' });
      await page.locator('dialog[open]').waitFor({ timeout: 5000 });
    });
  }

  await step('post a suggestion and vote', async () => {
    await page.goto(SITE + 'suggestions.html', { waitUntil: 'networkidle' });
    await page.fill('#sug-title', 'Per-map crosshair presets');
    await page.fill('#sug-body', 'Switch crosshair automatically depending on the map.');
    await page.getByRole('button', { name: 'Post suggestion' }).click();
    await page.getByText(/Posted as #\d+/).waitFor({ timeout: 8000 });
    const vote = page.locator('.idea .vote').first();
    await vote.waitFor({ timeout: 5000 });
    await vote.click();
    await page.waitForFunction(() => document.querySelector('.idea .vote')?.getAttribute('aria-pressed') === 'true', null, { timeout: 5000 });
    await vote.click();
    await page.waitForFunction(() => document.querySelector('.idea .vote')?.getAttribute('aria-pressed') === 'false', null, { timeout: 5000 });
  });

  await step('file a bug report', async () => {
    await page.goto(SITE + 'bugs.html', { waitUntil: 'networkidle' });
    await page.fill('#bug-title', `Crosshair flickers on resize ${user}`);
    await page.fill('#bug-body', 'Resize the window while in a match; the crosshair overlay flickers.');
    await page.fill('#bug-version', '1.0.0');
    await page.getByRole('button', { name: 'Send bug report' }).click();
    await page.getByText(/filed as #\d+/).waitFor({ timeout: 8000 });
    await page.locator('.bug').getByText(`Crosshair flickers on resize ${user}`).first().waitFor({ timeout: 5000 });
  });

  await step('bug form validates client-side', async () => {
    await page.fill('#bug-title', 'abc');
    await page.getByRole('button', { name: 'Send bug report' }).click();
    await page.getByText('At least 5 characters.').waitFor({ timeout: 3000 });
  });

  await step('public profile ?u=', async () => {
    await page.goto(SITE + `community.html?u=${user}`, { waitUntil: 'networkidle' });
    await page.getByText('Hub Tester').first().waitFor({ timeout: 5000 });
  });

  await step('sign out then sign in again', async () => {
    await page.goto(SITE + 'community.html', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /sign out/i }).first().click();
    await page.locator('#li-user').waitFor({ timeout: 5000 });
    await page.fill('#li-user', user); await page.fill('#li-pass', pass);
    await page.locator('form:has(#li-user) button[type=submit]').click();
    await page.locator('#pf-name').waitFor({ state: 'attached', timeout: 8000 });
  });

  await step('no uncaught JS errors', async () => { if (errors.length) throw new Error(errors.join(' | ')); });
  await page.screenshot({ path: require('path').join(__dirname, 'screens', 'live-community.png'), fullPage: true });
  await browser.close();
  const failed = results.filter((r) => r[0] === '✗').length;
  console.log(failed ? `${failed} failed` : 'all live checks passed');
  process.exit(failed ? 1 : 0);
})();
