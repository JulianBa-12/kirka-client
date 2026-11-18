'use strict';
/**
 * Realtime hub tests: boots the real app + WebSocket hub on a temporary data directory and
 * checks that published changes reach connected clients, website pages and the owner app.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const http = require('http');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'polaris-rt-'));
process.env.POLARIS_DATA_DIR = dataDir;
process.env.POLARIS_GITHUB_TOKEN = '';
const PORT = 20000 + Math.floor(Math.random() * 2000);
process.env.POLARIS_PORT = String(PORT);
process.env.POLARIS_PUBLIC_URL = `http://127.0.0.1:${PORT}`;
const cfg = require('../config');
const { createContext, createApp } = require('../app');
const { deviceMessage } = require('../auth/owner-devices');
const { DEFAULTS } = require('../../shared/configuration/domains');

let server; let ctx; let base; const T = {};
const WS = `ws://127.0.0.1:${PORT}/api/v1/realtime`;

async function call(method, url, { token, body, expect } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => null);
  if (expect !== undefined) assert.equal(res.status, expect, `${method} ${url} → ${res.status} ${JSON.stringify(data).slice(0, 300)}`);
  return { status: res.status, data };
}

/** Small socket wrapper that buffers messages and lets a test wait for a matching one. */
function socket(channel) {
  const ws = new WebSocket(`${WS}?channel=${channel}`);
  const msgs = []; const waiters = [];
  let closed = null;
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data); msgs.push(m);
    for (const w of [...waiters]) if (w.match(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); }
  };
  ws.onclose = (e) => { closed = { code: e.code, reason: e.reason }; for (const w of waiters) if (w.onClose) w.onClose(closed); };
  return {
    ws, msgs,
    open: () => new Promise((r, j) => { ws.onopen = r; ws.onerror = j; }),
    send: (m) => ws.send(JSON.stringify(m)),
    closed: () => closed,
    wait(match, ms = 3000) {
      const hit = msgs.find(match);
      if (hit) { msgs.splice(msgs.indexOf(hit), 1); return Promise.resolve(hit); }
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`timeout waiting on ${channel}`)), ms);
        waiters.push({ match, resolve: (m) => { clearTimeout(t); msgs.splice(msgs.indexOf(m), 1); resolve(m); }, onClose: (c) => { clearTimeout(t); reject(new Error(`closed ${c.code} ${c.reason}`)); } });
      });
    },
    close: () => ws.close(),
  };
}
const ev = (name) => (m) => m.type === 'event' && m.event === name;

test.before(async () => {
  ctx = createContext(cfg);
  ctx.settings.update({ rateLimits: { auth: 1000, api: 10000, upload: 1000 } });
  server = http.createServer(createApp(ctx));
  ctx.realtime.attach(server);
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  base = `http://127.0.0.1:${PORT}/api/v1`;
  const conn = JSON.parse(fs.readFileSync(path.join(dataDir, 'owner-connection.json'), 'utf8'));
  const ch = (await call('GET', '/owner/auth/challenge', { expect: 200 })).data;
  const signature = crypto.sign(null, deviceMessage(ch.nonce, conn.deviceId), crypto.createPrivateKey(conn.privateKey)).toString('base64');
  T.owner = (await call('POST', '/owner/auth/connect', { body: { deviceId: conn.deviceId, nonce: ch.nonce, signature }, expect: 200 })).data.token;
  T.alice = (await call('POST', '/auth/register', { body: { username: 'alice', password: 'Kirka-Sniper-Pw7', client: 'client' }, expect: 201 })).data.token;
  T.bob = (await call('POST', '/auth/register', { body: { username: 'bob', password: 'Kirka-Sniper-Pw8', client: 'client' }, expect: 201 })).data.token;
});
test.after(() => { ctx.realtime.close(); server.close(); ctx.db.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

test('client and website channels get a hello with bundle sequences and maintenance state', async () => {
  for (const ch of ['client', 'website']) {
    const s = socket(ch); await s.open();
    const hello = await s.wait((m) => m.type === 'hello');
    assert.equal(hello.channel, ch);
    assert.ok(hello.bundles.client.sequence >= 1);
    assert.equal(hello.maintenance.active, false);
    s.send({ type: 'ping' });
    await s.wait((m) => m.type === 'pong');
    s.close();
  }
});

test('owner channel requires an owner session bound to an owner connection', async () => {
  const anon = socket('owner'); await anon.open();
  await anon.wait((m) => m.type === 'auth-required');
  anon.send({ type: 'auth', token: T.alice });
  const r = await anon.wait((m) => m.type === 'auth');
  assert.equal(r.ok, false);
  await new Promise((res) => setTimeout(res, 100));
  assert.equal(anon.closed().code, 4403);

  // browsers (Origin header) can never open the owner channel
  const res = await new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: '/api/v1/realtime?channel=owner', headers: { Connection: 'Upgrade', Upgrade: 'websocket', Origin: 'https://evil.example', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64') } });
    req.on('response', (r2) => resolve(r2.statusCode)); req.on('upgrade', () => resolve(101)); req.on('error', () => resolve('error')); req.end();
  });
  assert.equal(res, 403);

  const owner = socket('owner'); await owner.open();
  owner.send({ type: 'auth', token: T.owner });
  const ok = await owner.wait((m) => m.type === 'auth');
  assert.equal(ok.ok, true); assert.equal(ok.role, 'owner');
  const st = await owner.wait((m) => m.type === 'stats');
  assert.ok(st.data.byChannel.owner >= 1);
  T.ownerSock = owner;
});

test('publishing a feature change reaches connected clients instantly, with apply mode', async () => {
  const client = socket('client'); await client.open(); await client.wait((m) => m.type === 'hello');
  const website = socket('website'); await website.open(); await website.wait((m) => m.type === 'hello');
  const before = ctx.configService.bundleInfo().client.sequence;

  const features = JSON.parse(JSON.stringify(DEFAULTS['client.features']));
  features.flags.marketplace.enabled = false;
  await call('PUT', '/owner/config/client.features/draft', { token: T.owner, body: { data: features, note: 'turn off marketplace' }, expect: 200 });
  await call('POST', '/owner/config/client.features/publish', { token: T.owner, body: { note: 'rt test' }, expect: 200 });
  const m = await client.wait(ev('config.updated'));
  assert.equal(m.data.target, 'client');
  assert.ok(m.data.sequence > before, 'sequence must increase');
  assert.deepEqual(m.data.domains.map((d) => [d.domain, d.apply]), [['client.features', 'live']]);
  assert.equal(m.data.restartRequired, false);
  // the bundle that the client then fetches really contains the change
  const bundle = (await call('GET', '/bundles/client', { expect: 200 })).data;
  const payload = JSON.parse(bundle.payload);
  assert.equal(payload.sequence, m.data.sequence);
  assert.equal(payload.domains['client.features'].data.flags.marketplace.enabled, false);
  // website pages are not told about client-only domains
  await assert.rejects(website.wait(ev('config.updated'), 400));

  const perf = JSON.parse(JSON.stringify(DEFAULTS['client.performance']));
  perf.profiles[0].description = 'changed';
  await call('PUT', '/owner/config/client.performance/draft', { token: T.owner, body: { data: perf }, expect: 200 });
  await call('POST', '/owner/config/client.performance/publish', { token: T.owner, body: {}, expect: 200 });
  const p = await client.wait(ev('config.updated'));
  assert.equal(p.data.restartRequired, true);

  // the owner sees the audit entries live
  const a = await T.ownerSock.wait((x) => ev('audit')(x) && x.data.action === 'config.published');
  assert.equal(a.data.target, 'client.features');
  client.close(); website.close();
});

test('announcements and maintenance are pushed to clients and website pages', async () => {
  const client = socket('client'); await client.open(); await client.wait((m) => m.type === 'hello');
  const website = socket('website'); await website.open(); await website.wait((m) => m.type === 'hello');
  await call('POST', '/owner/announcements', { token: T.owner, body: { title: 'Server maintenance tonight', body: '22:00 CET', level: 'warning', target: 'both', status: 'published' }, expect: 201 });
  const a = await client.wait(ev('announcements.changed'));
  assert.equal(a.data.items[0].title, 'Server maintenance tonight');
  const w = await website.wait(ev('announcements.changed'));
  assert.equal(w.data.items.length, 1);

  await call('PATCH', '/owner/system/settings', { token: T.owner, body: { maintenance: true, maintenanceMessage: 'Back in 10 minutes' }, expect: 200 });
  const mt = await client.wait(ev('maintenance'));
  assert.deepEqual(mt.data, { active: true, message: 'Back in 10 minutes' });
  await call('PATCH', '/owner/system/settings', { token: T.owner, body: { maintenance: false }, expect: 200 });
  assert.equal((await website.wait((x) => ev('maintenance')(x) && x.data.active === false)).data.active, false);
  client.close(); website.close();
});

test('personal notifications only reach the signed-in user', async () => {
  const bob = socket('client'); await bob.open(); await bob.wait((m) => m.type === 'hello');
  const other = socket('client'); await other.open(); await other.wait((m) => m.type === 'hello');
  bob.send({ type: 'auth', token: T.bob });
  assert.equal((await bob.wait((m) => m.type === 'auth')).ok, true);
  await call('POST', '/social/friends/requests', { token: T.alice, body: { username: 'bob' } });
  const n = await bob.wait(ev('notification'));
  assert.match(n.data.title, /alice|friend/i);
  await assert.rejects(other.wait(ev('notification'), 400));
  bob.close(); other.close();
});

test('owner REST view of the realtime hub and resync', async () => {
  const c = socket('client'); await c.open(); await c.wait((m) => m.type === 'hello');
  const r = await call('GET', '/owner/realtime', { token: T.owner, expect: 200 });
  assert.ok(r.data.byChannel.client >= 1);
  assert.ok(r.data.recent.some((x) => x.event === 'config.updated'));
  await call('GET', '/owner/realtime', { token: T.alice, expect: 403 });
  await call('POST', '/owner/realtime/resync', { token: T.owner, body: {}, expect: 200 });
  const m = await c.wait(ev('config.updated'));
  assert.equal(m.data.reason, 'resync');
  c.close();
});

test('contact messages are stored privately and never listed publicly', async () => {
  await call('POST', '/feedback', { body: { type: 'contact', title: 'Press request', body: 'Hello, I would like to write about Polaris.', contact: 'press@example.org' }, expect: 201 });
  const pub = await call('GET', '/feedback', { expect: 200 });
  assert.ok(!pub.data.items.some((f) => f.type === 'contact'));
  const own = await call('GET', '/owner/feedback', { token: T.owner, expect: 200 });
  assert.ok(own.data.items.some((f) => f.type === 'contact' && f.contact === 'press@example.org'));
  T.ownerSock.close();
});
