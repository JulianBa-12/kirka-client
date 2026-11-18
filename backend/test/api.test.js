'use strict';
/**
 * End-to-end API tests: boots the real app against a temporary data directory
 * and exercises it over HTTP. Run: npm test  (Node >= 22.13)
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'polaris-test-'));
process.env.POLARIS_DATA_DIR = dataDir;
process.env.POLARIS_GITHUB_TOKEN = '';
const PORT = 18000 + Math.floor(Math.random() * 2000);
process.env.POLARIS_PORT = String(PORT);
process.env.POLARIS_PUBLIC_URL = `http://127.0.0.1:${PORT}`;
const cfg = require('../config');
const { createContext, createApp } = require('../app');
const { verifyEnvelope } = require('../../shared/utilities/signing');
const { totpAt } = require('../auth/crypto');

let server, base, ctx;
const T = {};

async function call(method, url, { token, body, form, expect } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(base + url, { method, headers, body: payload });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.arrayBuffer();
  if (expect !== undefined) assert.equal(res.status, expect, `${method} ${url} → ${res.status} ${JSON.stringify(data).slice(0, 300)}`);
  return { status: res.status, data, headers: res.headers };
}

function png(w, h) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h, 0x80); for (let y = 0; y < h; y++) raw[y * (w * 4 + 1)] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const fileForm = (fields, buf, name, type) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.append(k, v); f.append('file', new Blob([buf], { type }), name); return f; };

test.before(async () => {
  ctx = createContext(cfg);
  ctx.settings.update({ rateLimits: { auth: 1000, api: 10000, upload: 1000 } });
  server = createApp(ctx).listen(PORT, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${PORT}/api/v1`;
});
test.after(() => { server.close(); ctx.db.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

test('health, keys and signed bundles', async () => {
  const h = await call('GET', '/health', { expect: 200 });
  assert.equal(h.data.status, 'ok'); assert.equal(h.data.database, 'ok');
  const k = await call('GET', '/keys', { expect: 200 });
  const trust = k.data.keys;
  for (const t of ['client', 'website', 'releases']) {
    const env = (await call('GET', `/bundles/${t}`, { expect: 200 })).data;
    const payload = verifyEnvelope(env, trust);
    assert.equal(payload.target, t);
    // tampering and unknown keys must be detected
    assert.throws(() => verifyEnvelope({ ...env, payload: env.payload.replace('"sequence":', '"sequence": ') }, trust), /signature/);
    assert.throws(() => verifyEnvelope({ ...env, keyId: '0000000000000000' }, trust), /untrusted/);
  }
  await call('GET', '/does-not-exist', { expect: 404 });
});

test('owner claim requires the setup token and is single use', async () => {
  const st = await call('GET', '/owner/auth/status', { expect: 200 });
  assert.equal(st.data.claimed, false);
  await call('POST', '/owner/auth/claim', { body: { setupToken: 'x'.repeat(32), username: 'owner', password: 'a-very-long-password-1' }, expect: 401 });
  const token = fs.readFileSync(path.join(dataDir, 'owner-setup-token'), 'utf8').trim();
  await call('POST', '/owner/auth/claim', { body: { setupToken: token, username: 'owner', password: 'short' }, expect: 422 });
  const c = await call('POST', '/owner/auth/claim', { body: { setupToken: token, username: 'owner', password: 'Northern-Star-Pass-2026' }, expect: 201 });
  T.owner = c.data.token;
  assert.equal(fs.existsSync(path.join(dataDir, 'owner-setup-token')), false);
  await call('POST', '/owner/auth/claim', { body: { setupToken: token, username: 'owner2', password: 'Northern-Star-Pass-2026' }, expect: 409 });
  assert.equal((await call('GET', '/owner/auth/status')).data.claimed, true);
});

test('normal users cannot reach the owner API', async () => {
  const r = await call('POST', '/auth/register', { body: { username: 'alice', password: 'Kirka-Sniper-Pw7', client: 'client' }, expect: 201 });
  T.alice = r.data.token;
  T.aliceId = r.data.user.id;
  await call('GET', '/owner/overview', { expect: 401 });
  await call('GET', '/owner/overview', { token: T.alice, expect: 403 });
  // the owner's user-scope login cannot use the owner API either
  const u = await call('POST', '/auth/login', { body: { username: 'owner', password: 'Northern-Star-Pass-2026', client: 'client' }, expect: 200 });
  await call('GET', '/owner/overview', { token: u.data.token, expect: 403 });
  await call('POST', '/owner/auth/login', { body: { username: 'alice', password: 'Kirka-Sniper-Pw7' }, expect: 403 });
  await call('POST', '/owner/auth/login', { body: { username: 'owner', password: 'wrong-password-xx' }, expect: 401 });
  const o = await call('GET', '/owner/overview', { token: T.owner, expect: 200 });
  assert.equal(o.data.users.total, 2);
});

test('user account: me, privacy, sessions, password', async () => {
  const me = await call('PATCH', '/auth/me', { token: T.alice, body: { displayName: 'Alice', bio: 'hi', privacy: { profile: 'public', onlineStatus: true, allowMessages: 'everyone', allowFriendRequests: true } }, expect: 200 });
  assert.equal(me.data.user.displayName, 'Alice');
  const s = await call('GET', '/auth/sessions', { token: T.alice, expect: 200 });
  assert.equal(s.data.items.length, 1); assert.equal(s.data.items[0].current, true);
  await call('POST', '/auth/register', { body: { username: 'alice', password: 'Another-Secret-9', client: 'client' }, expect: 409 });
  const bob = await call('POST', '/auth/register', { body: { username: 'bob', password: 'Quiet-River-Pw19', client: 'website' }, expect: 201 });
  T.bob = bob.data.token;
});

test('owner 2FA enrolment and TOTP-protected login', async () => {
  const setup = await call('POST', '/auth/2fa/setup', { token: T.owner, expect: 200 });
  const secret = setup.data.secret;
  const code = () => totpAt(secret, Math.floor(Date.now() / 30000));
  await call('POST', '/auth/2fa/enable', { token: T.owner, body: { code: '000000' }, expect: 422 });
  const en = await call('POST', '/auth/2fa/enable', { token: T.owner, body: { code: code() }, expect: 200 });
  assert.equal(en.data.recoveryCodes.length, 8);
  const noCode = await call('POST', '/owner/auth/login', { body: { username: 'owner', password: 'Northern-Star-Pass-2026' } });
  assert.equal(noCode.status, 401); assert.equal(noCode.data.error.code, 'totp_required');
  const ok = await call('POST', '/owner/auth/login', { body: { username: 'owner', password: 'Northern-Star-Pass-2026', totp: code() }, expect: 200 });
  T.owner = ok.data.token;
  const sec = await call('GET', '/owner/security', { token: T.owner, expect: 200 });
  assert.equal(sec.data.owner.twoFactorEnabled, true);
  assert.ok(sec.data.failedLogins24h >= 1);
});

test('configuration: validate, draft, publish, signed bundle, rollback', async () => {
  const cur = await call('GET', '/owner/config/client.theme', { token: T.owner, expect: 200 });
  const data = JSON.parse(JSON.stringify(cur.data.published ? cur.data.published.data : cur.data.defaults));
  const bad = await call('PUT', '/owner/config/client.theme/draft', { token: T.owner, body: { data: { ...data, colors: { ...data.colors, accent: 'javascript:alert(1)' } } } });
  assert.equal(bad.status, 422);
  data.colors.accent = '#12ABCD';
  await call('PUT', '/owner/config/client.theme/draft', { token: T.owner, body: { data, note: 'test accent' }, expect: 200 });
  const before = JSON.parse((await call('GET', '/bundles/client')).data.payload).sequence;
  const pub = await call('POST', '/owner/config/client.theme/publish', { token: T.owner, body: { note: 'publish' }, expect: 200 });
  const env = (await call('GET', '/bundles/client', { expect: 200 })).data;
  const payload = JSON.parse(env.payload);
  assert.ok(payload.sequence > before);
  assert.equal(payload.domains['client.theme'].data.colors.accent, '#12ABCD');
  // css sanitization: selectors outside .pl-* are dropped/rejected
  const css = await call('POST', '/owner/config/client.css/validate', { token: T.owner, body: { data: { overrides: 'body{display:none} .pl-card{color:red;background:url(http://x)}' } }, expect: 200 });
  assert.equal(css.data.ok, false, 'unsafe CSS is rejected');
  const okCss = await call('POST', '/owner/config/client.css/validate', { token: T.owner, body: { data: { overrides: '.pl-card { color: #fff; }' } }, expect: 200 });
  assert.equal(okCss.data.ok, true, JSON.stringify(okCss.data.errors));
  const hist = await call('GET', '/owner/config/client.theme/history', { token: T.owner, expect: 200 });
  assert.ok(hist.data.items.length >= 1);
  const first = hist.data.items[hist.data.items.length - 1].version;
  if (first !== pub.data.version) await call('POST', '/owner/config/client.theme/rollback', { token: T.owner, body: { version: first }, expect: 200 });
  const preview = await call('GET', '/owner/bundles/client/preview', { token: T.owner, expect: 200 });
  assert.equal(JSON.parse(preview.data.payload).preview, true);
  await call('GET', '/owner/config/not.a.domain', { token: T.owner, expect: 404 });
});

test('news, announcements and releases', async () => {
  const n = await call('POST', '/owner/news', { token: T.owner, body: { title: 'Polaris 1.0', excerpt: 'First release', body: '# Hello\n\nFirst **release**.', tags: ['release'], pinned: true, status: 'published' }, expect: 201 });
  const list = await call('GET', '/news', { expect: 200 });
  assert.equal(list.data.items[0].title, 'Polaris 1.0');
  await call('GET', `/news/${n.data.slug}`, { expect: 200 });
  await call('POST', '/owner/announcements', { token: T.owner, body: { title: 'Welcome', body: 'Hello', level: 'info', target: 'both', status: 'published' }, expect: 201 });
  const ann = await call('GET', '/announcements?target=client', { expect: 200 });
  assert.equal(ann.data.items.length, 1);
  const rel = await call('POST', '/owner/releases', { token: T.owner, body: { version: '1.0.0', channel: 'stable', title: 'Polaris 1.0.0', notes: 'Initial', files: [{ platform: 'linux-appimage', name: 'Polaris-Client-1.0.0.AppImage', url: 'https://example.invalid/x', size: 1, sha512: Buffer.alloc(64, 7).toString('base64') }], rollout: 100, minimumVersion: '1.0.0', visible: true }, expect: 201 });
  await call('POST', `/owner/releases/${rel.data.id}/publish`, { token: T.owner, body: {}, expect: 200 });
  const manifest = JSON.parse((await call('GET', '/bundles/releases')).data.payload);
  assert.equal(manifest.channels.stable.version, '1.0.0');
  assert.equal((await call('GET', '/changelog', { expect: 200 })).data.items.length, 1);
});

test('community uploads, moderation, likes, comments, downloads', async () => {
  const bad = await call('POST', '/community/items', { token: T.alice, form: fileForm({ kind: 'skin', title: 'Wrong size' }, png(50, 50), 's.png', 'image/png') });
  assert.equal(bad.status, 422);
  const fake = await call('POST', '/community/items', { token: T.alice, form: fileForm({ kind: 'skin', title: 'Not a png' }, Buffer.from('<script>alert(1)</script>'), 's.png', 'image/png') });
  assert.ok(fake.status >= 400 && fake.status < 500);
  const up = await call('POST', '/community/items', { token: T.alice, form: fileForm({ kind: 'skin', title: 'Night Cyan', tags: 'cyan,dark' }, png(64, 64), 'skin.png', 'image/png'), expect: 201 });
  const id = up.data.id;
  const pub = await call('GET', '/community/items?kind=skin', { expect: 200 });
  const visible = pub.data.items.some((i) => i.id === id);
  if (up.data.status === 'pending') {
    assert.equal(visible, false, 'pending items are not public');
    await call('PATCH', `/owner/community/items/${id}`, { token: T.owner, body: { status: 'approved', featured: true }, expect: 200 });
  }
  const after = await call('GET', '/community/items?kind=skin', { expect: 200 });
  assert.ok(after.data.items.some((i) => i.id === id));
  await call('POST', `/community/items/${id}/like`, { token: T.bob, expect: 200 });
  await call('POST', `/community/items/${id}/comments`, { token: T.bob, body: { body: 'Looks great' }, expect: 201 });
  const dl = await call('GET', `/community/items/${id}/download`, { expect: 200 });
  assert.ok(dl.data.url || dl.data.fileUrl || dl.data.byteLength, 'download returns the file or its URL');
  const item = await call('GET', `/community/items/${id}`, { expect: 200 });
  assert.equal(item.data.item ? item.data.item.likes : item.data.likes, 1);
  const file = await fetch((item.data.item || item.data).fileUrl);
  assert.equal(file.status, 200);
  assert.match(file.headers.get('content-security-policy'), /sandbox/);
  // plugins: manifest validated, permissions only approved by owner
  const plugin = { format: 'polaris-plugin/1', manifest: { id: 'session-timer', name: 'Session timer', version: '1.0.0', description: 'Shows a timer', permissions: ['ui.panel', 'storage'], minClientVersion: '1.0.0' }, code: 'polaris.ui.panel({ title: "Timer" });' };
  const pu = await call('POST', '/community/items', { token: T.alice, form: fileForm({ kind: 'plugin', title: 'Session timer' }, Buffer.from(JSON.stringify(plugin)), 'p.json', 'application/json') });
  assert.equal(pu.status, 201, JSON.stringify(pu.data));
  assert.deepEqual(pu.data.metadata.approvedPermissions, []);
  const mod = await call('PATCH', `/owner/community/items/${pu.data.id}`, { token: T.owner, body: { status: 'approved', metadata: { approvedPermissions: ['ui.panel', 'fs.write'], compatibility: 'compatible' } }, expect: 200 });
  assert.deepEqual(mod.data.metadata.approvedPermissions, ['ui.panel']);
  const notes = await call('GET', '/notifications', { token: T.alice, expect: 200 });
  assert.ok(notes.data.items.length >= 1);
});

test('social: friends, messages, blocks, groups, reports', async () => {
  const req = await call('POST', '/social/friends/requests', { token: T.alice, body: { username: 'bob' }, expect: 201 });
  const inc = await call('GET', '/social/friends', { token: T.bob, expect: 200 });
  assert.equal(inc.data.incoming.length, 1);
  await call('POST', `/social/friends/requests/${inc.data.incoming[0].id || req.data.request.id}/accept`, { token: T.bob, expect: 200 });
  assert.equal((await call('GET', '/social/friends', { token: T.alice })).data.friends.length, 1);
  const m = await call('POST', '/social/messages/bob', { token: T.alice, body: { body: 'gg' }, expect: 201 });
  const conv = await call('GET', '/social/messages/alice', { token: T.bob, expect: 200 });
  assert.equal(conv.data.items[0].body, 'gg');
  await call('POST', '/presence', { token: T.bob, body: { status: 'in-game' }, expect: 200 });
  const groups = await call('GET', '/social/groups', { token: T.alice, expect: 200 });
  const lobby = groups.data.items.find((g) => g.slug === 'lobby');
  assert.ok(lobby);
  await call('POST', `/social/groups/${lobby.id}/messages`, { token: T.alice, body: { body: 'hello lobby' }, expect: 201 });
  assert.equal((await call('GET', `/social/groups/${lobby.id}/messages`, { token: T.bob, expect: 200 })).data.items.length, 1);
  await call('POST', '/reports', { token: T.bob, body: { targetType: 'message', targetId: m.data.message.id, reason: 'spam' }, expect: 201 });
  const rep = await call('GET', '/owner/reports?status=open', { token: T.owner, expect: 200 });
  assert.equal(rep.data.items[0].target.body, 'gg');
  await call('PATCH', `/owner/reports/${rep.data.items[0].id}`, { token: T.owner, body: { status: 'resolved', resolution: 'warned' }, expect: 200 });
  await call('POST', '/social/blocks', { token: T.bob, body: { username: 'alice' }, expect: 200 });
  await call('POST', '/social/messages/bob', { token: T.alice, body: { body: 'still there?' }, expect: 403 });
  assert.equal((await call('GET', '/social/friends', { token: T.alice })).data.friends.length, 0);
});

test('owner moderation of users: restrictions, disable, sessions', async () => {
  await call('PATCH', `/owner/users/${T.aliceId}`, { token: T.owner, body: { restrictions: { chat: true, upload: false, until: null } }, expect: 200 });
  const groups = await call('GET', '/social/groups', { token: T.alice });
  const lobby = groups.data.items.find((g) => g.slug === 'lobby');
  await call('POST', `/social/groups/${lobby.id}/messages`, { token: T.alice, body: { body: 'muted?' }, expect: 403 });
  await call('PATCH', `/owner/users/${T.aliceId}`, { token: T.owner, body: { status: 'disabled' }, expect: 200 });
  await call('GET', '/auth/me', { token: T.alice, expect: 401 });
  const ownerRow = (await call('GET', '/owner/users?role=owner', { token: T.owner })).data.items[0];
  await call('PATCH', `/owner/users/${ownerRow.id}`, { token: T.owner, body: { role: 'user' }, expect: 403 });
  await call('PATCH', `/owner/users/${T.aliceId}`, { token: T.owner, body: { role: 'owner' }, expect: 422 });
  const detail = await call('GET', `/owner/users/${T.aliceId}`, { token: T.owner, expect: 200 });
  assert.ok(detail.data.loginHistory.length >= 1);
});

test('feedback, cloud sync, telemetry and stats', async () => {
  const f = await call('POST', '/feedback', { token: T.bob, body: { type: 'bug', title: 'Crosshair offset', body: 'The crosshair is 1px off at 125% scaling.', version: '1.0.0' }, expect: 201 });
  await call('POST', `/feedback/${f.data.id}/vote`, { token: T.bob, expect: 200 });
  await call('PATCH', `/owner/feedback/${f.data.id}`, { token: T.owner, body: { status: 'planned', response: 'Thanks' }, expect: 200 });
  assert.equal((await call('GET', '/feedback?type=bug', { expect: 200 })).data.items[0].status, 'planned');
  const put = await call('PUT', '/cloud/settings', { token: T.bob, body: { data: { theme: 'x' } }, expect: 200 });
  await call('PUT', '/cloud/settings', { token: T.bob, body: { data: { theme: 'y' }, baseUpdatedAt: '2000-01-01T00:00:00.000Z' }, expect: 409 });
  assert.equal((await call('GET', '/cloud/settings', { token: T.bob, expect: 200 })).data.data.theme, 'x');
  assert.ok(put.data.updatedAt);
  await call('POST', '/telemetry/heartbeat', { body: { installId: '3b241101-e2bb-4255-8caf-4136c566a962', version: '1.0.0', channel: 'stable', platform: 'linux' }, expect: 200 });
  const a = await call('GET', '/owner/analytics?days=7', { token: T.owner, expect: 200 });
  assert.equal(a.data.daily.length, 7);
  assert.equal(a.data.daily[6].heartbeats, 1);
  const st = await call('GET', '/stats', { expect: 200 });
  assert.equal(st.data.users, 2); // alice is disabled
  assert.ok(st.data.skins >= 1);
});

test('system: maintenance, database browser redaction, audit, backups, assets', async () => {
  await call('PATCH', '/owner/system/settings', { token: T.owner, body: { maintenance: true }, expect: 200 });
  const mt = await call('POST', '/feedback', { token: T.bob, body: { type: 'suggestion', title: 'Dark mode', body: 'More dark mode please.' } });
  assert.equal(mt.status, 503);
  await call('GET', '/bundles/client', { expect: 200 });
  await call('PATCH', '/owner/system/settings', { token: T.owner, body: { maintenance: false }, expect: 200 });
  const users = await call('GET', '/owner/database/tables/users', { token: T.owner, expect: 200 });
  assert.ok(users.data.rows.every((r) => r.password_hash === '••• redacted •••'));
  const sessions = await call('GET', '/owner/database/tables/sessions', { token: T.owner, expect: 200 });
  assert.ok(sessions.data.rows.every((r) => r.token_hash === '••• redacted •••'));
  await call('GET', '/owner/database/tables/sqlite_master', { token: T.owner, expect: 404 });
  const integ = await call('POST', '/owner/database/integrity', { token: T.owner, expect: 200 });
  assert.equal(integ.data.ok, true);
  const audit = await call('GET', '/owner/audit?limit=100', { token: T.owner, expect: 200 });
  assert.ok(audit.data.items.some((x) => x.action === 'item.moderated'));
  const b = await call('POST', '/owner/backups', { token: T.owner, expect: 201 });
  assert.ok(b.data.size > 0);
  await call('GET', `/owner/backups/${encodeURIComponent('../polaris.db')}/download`, { token: T.owner, expect: 400 });
  const dl = await call('GET', `/owner/backups/${b.data.name}/download`, { token: T.owner, expect: 200 });
  assert.equal(Buffer.from(dl.data).subarray(0, 15).toString(), 'SQLite format 3');
  const asset = await call('POST', '/owner/assets', { token: T.owner, form: fileForm({ name: 'Logo', category: 'logo' }, png(32, 32), 'logo.png', 'image/png'), expect: 201 });
  const svg = await call('POST', '/owner/assets', { token: T.owner, form: fileForm({ name: 'Evil', category: 'icon' }, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'e.svg', 'image/svg+xml') });
  assert.ok(svg.status >= 400 && svg.status < 500);
  await call('POST', `/owner/assets/${asset.data.id}/replace`, { token: T.owner, form: fileForm({}, png(48, 48), 'logo2.png', 'image/png'), expect: 200 });
  assert.equal((await call('GET', `/owner/assets/${asset.data.id}/versions`, { token: T.owner, expect: 200 })).data.items.length, 2);
  const gh = await call('GET', '/owner/integrations/github', { token: T.owner, expect: 200 });
  assert.equal(gh.data.configured, false);
  await call('POST', '/owner/integrations/github/publish', { token: T.owner, expect: 400 });
});

test('error contract and input hardening', async () => {
  const r = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad json' });
  assert.equal(r.status, 400);
  const v = await call('POST', '/auth/register', { body: { username: 'x', password: '1' } });
  assert.equal(v.status, 422); assert.ok(Array.isArray(v.data.error.details));
  await call('GET', '/owner/overview', { token: 'A'.repeat(43), expect: 401 });
});

test('auth endpoints are rate limited per IP', async () => {
  ctx.settings.update({ rateLimits: { auth: 3, api: 10000, upload: 1000 } });
  ctx.rate.reset();
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await call('POST', '/auth/login', { body: { username: 'nobody', password: 'Wrong-Password-1', client: 'client' } })).status);
  assert.deepEqual(codes, [401, 401, 401, 429, 429]);
});
