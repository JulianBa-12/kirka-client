'use strict';
const express = require('express');
const { s } = require('../../shared/utilities/schema');
const { json, now, today } = require('../database/db');
const { E, check } = require('../services/core');
const { publicUser } = require('../auth/sessions');
const { serializeAnnouncement } = require('../services/config-service');

function serializeNews(n, db) {
  const author = n.author_id ? db.get('SELECT * FROM users WHERE id = ?', n.author_id) : null;
  return {
    id: n.id, slug: n.slug, title: n.title, excerpt: n.excerpt, body: n.body, coverUrl: n.cover_url || null,
    tags: json.parse(n.tags, []), pinned: !!n.pinned, status: n.status, publishedAt: n.published_at,
    createdAt: n.created_at, updatedAt: n.updated_at, author: author ? publicUser(author, { showPresence: false }) : null,
  };
}

function serializeAsset(a, storage) {
  return { id: a.id, name: a.name, category: a.category, mime: a.mime, size: a.size, width: a.width, height: a.height, url: storage.url(a.storage_name), version: a.version, published: !!a.published, createdAt: a.created_at, updatedAt: a.updated_at };
}

const paging = (q) => ({ limit: Math.min(Math.max(parseInt(q.limit, 10) || 20, 1), 100), offset: Math.max(parseInt(q.offset, 10) || 0, 0) });

function createPublicRoutes(ctx) {
  const { db, settings, keys, configService, storage, cfg } = ctx;
  const r = express.Router();

  r.get('/health', (_req, res) => {
    let database = 'ok';
    try { db.get('SELECT 1 AS ok'); } catch { database = 'error'; }
    const st = settings.get();
    res.json({ status: 'ok', version: cfg.version, time: now(), database, maintenance: st.maintenance, maintenanceMessage: st.maintenance ? st.maintenanceMessage : '', registrationOpen: st.registrationOpen });
  });

  r.get('/keys', (_req, res) => res.json({ keys: [{ keyId: keys.keyId, publicKey: keys.publicKey, algorithm: 'ed25519' }] }));

  for (const target of ['client', 'website', 'releases']) {
    r.get(`/bundles/${target}`, (_req, res) => { res.set('Cache-Control', 'no-cache'); res.json(configService.envelope(target)); });
  }

  r.get('/news', (req, res) => {
    const { limit, offset } = paging(req.query);
    const tag = typeof req.query.tag === 'string' ? req.query.tag.slice(0, 40) : null;
    let rows = db.all("SELECT * FROM news WHERE status = 'published' ORDER BY pinned DESC, published_at DESC");
    if (tag) rows = rows.filter((n) => json.parse(n.tags, []).includes(tag));
    res.json({ items: rows.slice(offset, offset + limit).map((n) => serializeNews(n, db)), total: rows.length });
  });
  r.get('/news/:slug', (req, res) => {
    const n = db.get("SELECT * FROM news WHERE slug = ? AND status = 'published'", req.params.slug);
    if (!n) throw E.notFound('Article not found');
    res.json(serializeNews(n, db));
  });

  r.get('/changelog', (_req, res) => {
    res.json({ items: configService.buildReleasesPayload().history });
  });

  r.get('/announcements', (req, res) => {
    const target = req.query.target === 'client' ? 'client' : 'website';
    res.json({ items: configService.activeAnnouncements(target) });
  });

  r.get('/stats', (_req, res) => {
    const count = (kind) => db.get("SELECT COUNT(*) AS n FROM items WHERE kind = ? AND status = 'approved'", kind).n;
    res.json({
      users: db.get("SELECT COUNT(*) AS n FROM users WHERE status = 'active'").n,
      skins: count('skin'), resources: count('resource'), plugins: count('plugin'),
      items: db.get("SELECT COUNT(*) AS n FROM items WHERE status = 'approved'").n,
      downloads: db.get('SELECT COUNT(*) AS n FROM downloads').n + db.get('SELECT COALESCE(SUM(downloads),0) AS n FROM items').n,
    });
  });

  r.get('/assets/:id', (req, res) => {
    const a = db.get('SELECT * FROM assets WHERE id = ? AND published = 1', parseInt(req.params.id, 10) || 0);
    if (!a) throw E.notFound('Asset not found');
    res.json(serializeAsset(a, storage));
  });

  /* ---------- telemetry (opt-in, anonymous) ---------- */
  const installId = s.string({ min: 8, max: 64, pattern: /^[a-zA-Z0-9-]+$/ });
  r.post('/telemetry/heartbeat', (req, res) => {
    ctx.rate(`tele:${req.ip}`, 30, 3600000);
    const b = check(s.object({ installId, version: s.string({ max: 20, pattern: /^[0-9a-z.-]+$/i }), channel: s.optional(s.enum(['stable', 'beta']), 'stable'), platform: s.optional(s.string({ max: 40 }), 'linux') }), req.body);
    db.run('INSERT INTO telemetry_heartbeats (install_id, date, version, channel, platform) VALUES (?,?,?,?,?) ON CONFLICT(install_id, date) DO UPDATE SET version = excluded.version, channel = excluded.channel, platform = excluded.platform',
      b.installId, today(), b.version, b.channel, b.platform);
    res.json({ ok: true });
  });
  r.post('/telemetry/crash', (req, res) => {
    ctx.rate(`crash:${req.ip}`, 10, 3600000);
    const b = check(s.object({ installId, version: s.string({ max: 20 }), message: s.string({ max: 500 }), stack: s.optional(s.string({ max: 8000 }), ''), context: s.optional(s.any({ maxBytes: 4000 }), null) }), req.body);
    db.run('INSERT INTO telemetry_crashes (install_id, version, message, stack, context, created_at) VALUES (?,?,?,?,?,?)', b.installId, b.version, b.message, b.stack, JSON.stringify(b.context), now());
    ctx.log.warn('client crash report', { version: b.version, message: b.message });
    res.json({ ok: true });
  });
  r.post('/telemetry/download', (req, res) => {
    ctx.rate(`dl:${req.ip}`, 30, 3600000);
    const b = check(s.object({ releaseId: s.optional(s.nullable(s.int({ min: 0 })), null), platform: s.optional(s.string({ max: 40 }), 'linux-appimage') }), req.body);
    db.run('INSERT INTO downloads (release_id, platform, date, created_at) VALUES (?,?,?,?)', b.releaseId, b.platform, today(), now());
    res.json({ ok: true });
  });

  return r;
}

function createCloudRoutes(ctx) {
  const { db, mw } = ctx;
  const r = express.Router();
  r.use(mw.requireUser);
  const KEY = /^[a-z0-9-]{1,40}$/;
  r.get('/', (req, res) => res.json({ items: db.all('SELECT key, updated_at, size FROM cloud WHERE user_id = ? ORDER BY key', req.user.id).map((c) => ({ key: c.key, updatedAt: c.updated_at, size: c.size })) }));
  r.get('/:key', (req, res) => {
    if (!KEY.test(req.params.key)) throw E.badRequest('Invalid key');
    const c = db.get('SELECT * FROM cloud WHERE user_id = ? AND key = ?', req.user.id, req.params.key);
    if (!c) throw E.notFound('Nothing stored under that key');
    res.json({ key: c.key, data: json.parse(c.data, null), updatedAt: c.updated_at });
  });
  r.put('/:key', (req, res) => {
    if (!KEY.test(req.params.key)) throw E.badRequest('Invalid key');
    const body = req.body || {};
    if (body.data === undefined) throw E.invalid([{ path: 'data', message: 'is required' }]);
    const str = JSON.stringify(body.data);
    if (str.length > 512 * 1024) throw E.tooLarge('Cloud entries are limited to 512 KB');
    const existing = db.get('SELECT updated_at FROM cloud WHERE user_id = ? AND key = ?', req.user.id, req.params.key);
    if (!existing && db.get('SELECT COUNT(*) AS n FROM cloud WHERE user_id = ?', req.user.id).n >= 20) throw E.badRequest('Cloud storage is limited to 20 keys');
    if (existing && body.baseUpdatedAt && existing.updated_at > body.baseUpdatedAt) throw E.conflict('The cloud copy is newer than yours');
    const t = now();
    db.run('INSERT INTO cloud (user_id, key, data, size, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id, key) DO UPDATE SET data = excluded.data, size = excluded.size, updated_at = excluded.updated_at', req.user.id, req.params.key, str, str.length, t);
    res.json({ key: req.params.key, updatedAt: t });
  });
  r.delete('/:key', (req, res) => { db.run('DELETE FROM cloud WHERE user_id = ? AND key = ?', req.user.id, req.params.key); res.json({ ok: true }); });
  return r;
}

module.exports = { createPublicRoutes, createCloudRoutes, serializeNews, serializeAsset, serializeAnnouncement, paging };
