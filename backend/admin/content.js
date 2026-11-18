'use strict';
/** Owner API: configuration workflow, news, announcements, releases, assets. */
const express = require('express');
const crypto = require('crypto');
const { s } = require('../../shared/utilities/schema');
const { DOMAINS, DEFAULTS, validateDomain } = require('../../shared/configuration/domains');
const { json, now } = require('../database/db');
const { E, check } = require('../services/core');
const { serializeNews, serializeAsset, paging } = require('../api/public');
const { serializeAnnouncement } = require('../services/config-service');

const SEMVER = s.string({ pattern: /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/ });
const ASSET_CATEGORIES = ['image', 'icon', 'logo', 'background', 'skin-template', 'weapon', 'ui', 'sound', 'font', 'plugin', 'cosmetic', 'model', 'data'];
const ASSET_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'audio/ogg', 'audio/wav', 'audio/mpeg', 'font/woff2', 'application/json', 'model/gltf-binary', 'model/gltf+json'];

function createOwnerContentRoutes(ctx) {
  const { db, configService, audit, storage, settings, log } = ctx;
  const r = express.Router();
  const actor = (req) => req.user.username;
  const id = (req) => parseInt(req.params.id, 10) || 0;

  /* ---------------- configuration ---------------- */
  r.get('/config', (_req, res) => {
    res.json({ items: DOMAINS.map((d) => { const p = configService.published(d); const dr = configService.draft(d); return { domain: d, publishedVersion: p ? p.version : 0, publishedAt: p ? p.publishedAt : null, hasDraft: !!dr, draftUpdatedAt: dr ? dr.updatedAt : null }; }) });
  });
  r.get('/config/:domain', (req, res) => {
    const d = req.params.domain;
    if (!DOMAINS.includes(d)) throw E.notFound('Unknown domain');
    res.json({ domain: d, defaults: DEFAULTS[d], published: configService.published(d), draft: configService.draft(d) });
  });
  r.put('/config/:domain/draft', (req, res) => {
    const b = req.body || {};
    const note = typeof b.note === 'string' ? b.note.slice(0, 300) : null;
    const draft = configService.saveDraft(req.params.domain, b.data, note, actor(req));
    audit(req, 'config.draft_saved', req.params.domain, { note });
    res.json({ draft });
  });
  r.post('/config/:domain/validate', (req, res) => {
    if (!DOMAINS.includes(req.params.domain)) throw E.notFound('Unknown domain');
    const v = validateDomain(req.params.domain, (req.body || {}).data);
    res.json({ ok: v.ok, errors: v.errors || [], normalized: v.ok ? v.value : null });
  });
  r.delete('/config/:domain/draft', (req, res) => { configService.discardDraft(req.params.domain); audit(req, 'config.draft_discarded', req.params.domain); res.json({ ok: true }); });
  r.post('/config/:domain/publish', (req, res) => {
    const note = typeof (req.body || {}).note === 'string' ? req.body.note.slice(0, 300) : null;
    const version = configService.publish(req.params.domain, note, actor(req));
    audit(req, 'config.published', req.params.domain, { version, note });
    ctx.publisher.schedule();
    res.json({ version, bundles: configService.bundleInfo() });
  });
  r.get('/config/:domain/history', (req, res) => res.json({ items: configService.history(req.params.domain) }));
  r.post('/config/:domain/rollback', (req, res) => {
    const { version } = check(s.object({ version: s.int({ min: 1 }) }), req.body);
    const nv = configService.rollback(req.params.domain, version, actor(req));
    audit(req, 'config.rolled_back', req.params.domain, { to: version, newVersion: nv });
    ctx.publisher.schedule();
    res.json({ version: nv, bundles: configService.bundleInfo() });
  });
  r.get('/bundles', (_req, res) => res.json(configService.bundleInfo()));
  r.get('/bundles/:target/preview', (req, res) => res.json(configService.previewEnvelope(req.params.target)));
  r.post('/bundles/:target/rebuild', (req, res) => {
    if (!['client', 'website', 'releases'].includes(req.params.target)) throw E.notFound('Unknown target');
    configService.rebuild(req.params.target);
    audit(req, 'bundle.rebuilt', req.params.target);
    res.json(configService.bundleInfo());
  });

  /* ---------------- news ---------------- */
  const newsSchema = s.object({
    slug: s.optional(s.string({ min: 1, max: 80, pattern: /^[a-z0-9-]+$/ })), title: s.string({ min: 1, max: 160 }),
    excerpt: s.optional(s.string({ max: 400 }), ''), body: s.optional(s.string({ max: 50000 }), ''),
    coverUrl: s.optional(s.nullable(s.url())), tags: s.optional(s.array(s.string({ min: 1, max: 24 }), { max: 10 }), []),
    pinned: s.optional(s.bool(), false), status: s.optional(s.enum(['draft', 'published']), 'draft'),
  });
  const slugify = (t) => t.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'post';
  const uniqueSlug = (base, exceptId) => { let sl = base, i = 2; while (db.get('SELECT id FROM news WHERE slug = ? AND id != ?', sl, exceptId || 0)) sl = `${base}-${i++}`; return sl; };

  r.get('/news', (req, res) => {
    const { limit, offset } = paging(req.query);
    const total = db.get('SELECT COUNT(*) AS n FROM news').n;
    res.json({ items: db.all('SELECT * FROM news ORDER BY COALESCE(published_at, updated_at) DESC LIMIT ? OFFSET ?', limit, offset).map((n) => serializeNews(n, db)), total });
  });
  r.post('/news', (req, res) => {
    const b = check(newsSchema, req.body);
    const slug = uniqueSlug(b.slug || slugify(b.title));
    const { id: nid } = db.run('INSERT INTO news (slug, title, excerpt, body, cover_url, tags, pinned, status, author_id, created_at, updated_at, published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      slug, b.title, b.excerpt, b.body, b.coverUrl || null, JSON.stringify(b.tags), b.pinned, b.status, req.user.id, now(), now(), b.status === 'published' ? now() : null);
    audit(req, 'news.created', nid, { title: b.title, status: b.status });
    if (b.status === 'published') ctx.publisher.schedule();
    res.status(201).json(serializeNews(db.get('SELECT * FROM news WHERE id = ?', nid), db));
  });
  r.patch('/news/:id', (req, res) => {
    const n = db.get('SELECT * FROM news WHERE id = ?', id(req));
    if (!n) throw E.notFound('Article not found');
    const merged = { slug: n.slug, title: n.title, excerpt: n.excerpt, body: n.body, coverUrl: n.cover_url, tags: json.parse(n.tags, []), pinned: !!n.pinned, status: n.status, ...(req.body || {}) };
    const b = check(newsSchema, merged);
    const slug = uniqueSlug(b.slug || slugify(b.title), n.id);
    const publishedAt = b.status === 'published' ? (n.published_at || now()) : null;
    db.run('UPDATE news SET slug = ?, title = ?, excerpt = ?, body = ?, cover_url = ?, tags = ?, pinned = ?, status = ?, updated_at = ?, published_at = ? WHERE id = ?',
      slug, b.title, b.excerpt, b.body, b.coverUrl || null, JSON.stringify(b.tags), b.pinned, b.status, now(), publishedAt, n.id);
    audit(req, 'news.updated', n.id, { status: b.status });
    ctx.publisher.schedule();
    res.json(serializeNews(db.get('SELECT * FROM news WHERE id = ?', n.id), db));
  });
  r.delete('/news/:id', (req, res) => {
    const n = db.get('SELECT * FROM news WHERE id = ?', id(req));
    if (!n) throw E.notFound('Article not found');
    db.run('DELETE FROM news WHERE id = ?', n.id);
    audit(req, 'news.deleted', n.id, { title: n.title });
    ctx.publisher.schedule();
    res.json({ ok: true });
  });

  /* ---------------- announcements ---------------- */
  const iso = s.nullable(s.string({ max: 40, pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/ }));
  const annSchema = s.object({
    title: s.string({ min: 1, max: 120 }), body: s.optional(s.string({ max: 2000 }), ''), level: s.optional(s.enum(['info', 'warning', 'critical']), 'info'),
    target: s.optional(s.enum(['client', 'website', 'both']), 'both'), startsAt: s.optional(iso, null), endsAt: s.optional(iso, null), status: s.optional(s.enum(['draft', 'published']), 'draft'),
  });
  const normIso = (v) => (v ? new Date(v).toISOString() : null);
  r.get('/announcements', (_req, res) => res.json({ items: db.all('SELECT * FROM announcements ORDER BY id DESC LIMIT 200').map(serializeAnnouncement) }));
  r.post('/announcements', (req, res) => {
    const b = check(annSchema, req.body);
    const { id: aid } = db.run('INSERT INTO announcements (title, body, level, target, starts_at, ends_at, status, created_by, created_at, updated_at, published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      b.title, b.body, b.level, b.target, normIso(b.startsAt), normIso(b.endsAt), b.status, req.user.id, now(), now(), b.status === 'published' ? now() : null);
    if (b.status === 'published') { configService.rebuild('client'); configService.rebuild('website'); ctx.publisher.schedule(); }
    audit(req, 'announcement.created', aid, { title: b.title, status: b.status });
    res.status(201).json(serializeAnnouncement(db.get('SELECT * FROM announcements WHERE id = ?', aid)));
  });
  r.patch('/announcements/:id', (req, res) => {
    const a = db.get('SELECT * FROM announcements WHERE id = ?', id(req));
    if (!a) throw E.notFound('Announcement not found');
    const b = check(annSchema, { title: a.title, body: a.body, level: a.level, target: a.target, startsAt: a.starts_at, endsAt: a.ends_at, status: a.status, ...(req.body || {}) });
    db.run('UPDATE announcements SET title = ?, body = ?, level = ?, target = ?, starts_at = ?, ends_at = ?, status = ?, updated_at = ?, published_at = ? WHERE id = ?',
      b.title, b.body, b.level, b.target, normIso(b.startsAt), normIso(b.endsAt), b.status, now(), b.status === 'published' ? (a.published_at || now()) : null, a.id);
    configService.rebuild('client'); configService.rebuild('website'); ctx.publisher.schedule();
    audit(req, 'announcement.updated', a.id, { status: b.status });
    res.json(serializeAnnouncement(db.get('SELECT * FROM announcements WHERE id = ?', a.id)));
  });
  r.delete('/announcements/:id', (req, res) => {
    const a = db.get('SELECT * FROM announcements WHERE id = ?', id(req));
    if (!a) throw E.notFound('Announcement not found');
    db.run('DELETE FROM announcements WHERE id = ?', a.id);
    configService.rebuild('client'); configService.rebuild('website'); ctx.publisher.schedule();
    audit(req, 'announcement.deleted', a.id, { title: a.title });
    res.json({ ok: true });
  });

  /* ---------------- releases ---------------- */
  const fileSchema = s.object({
    platform: s.enum(['linux-appimage', 'linux-deb']), name: s.string({ min: 1, max: 120, pattern: /^[A-Za-z0-9._-]+$/ }),
    url: s.string({ max: 500, pattern: /^https:\/\/[^\s"'<>]+$/ }), size: s.int({ min: 1 }), sha512: s.string({ min: 80, max: 100, pattern: /^[A-Za-z0-9+/=]+$/ }),
  });
  const relSchema = s.object({
    version: SEMVER, channel: s.enum(['stable', 'beta']), title: s.optional(s.string({ max: 120 }), ''), notes: s.optional(s.string({ max: 50000 }), ''),
    files: s.optional(s.array(fileSchema, { max: 6 }), []), rollout: s.optional(s.int({ min: 0, max: 100 }), 100),
    minimumVersion: s.optional(SEMVER, '1.0.0'), visible: s.optional(s.bool(), true),
  });
  const getRelease = (rid) => db.get('SELECT * FROM releases WHERE id = ?', rid);
  r.get('/releases', (_req, res) => res.json({ items: db.all('SELECT * FROM releases ORDER BY id DESC').map(configService.serializeRelease) }));
  r.post('/releases', (req, res) => {
    const b = check(relSchema, req.body);
    if (db.get('SELECT id FROM releases WHERE version = ? AND channel = ?', b.version, b.channel)) throw E.conflict(`Release ${b.version} (${b.channel}) already exists`);
    const { id: rid } = db.run('INSERT INTO releases (version, channel, title, notes, files, rollout, minimum_version, visible, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      b.version, b.channel, b.title, b.notes, JSON.stringify(b.files), b.rollout, b.minimumVersion, b.visible, 'draft', now(), now());
    audit(req, 'release.created', rid, { version: b.version, channel: b.channel });
    res.status(201).json(configService.serializeRelease(getRelease(rid)));
  });
  r.patch('/releases/:id', (req, res) => {
    const rel = getRelease(id(req));
    if (!rel) throw E.notFound('Release not found');
    const cur = configService.serializeRelease(rel);
    const b = check(relSchema, { version: cur.version, channel: cur.channel, title: cur.title, notes: cur.notes, files: cur.files, rollout: cur.rollout, minimumVersion: cur.minimumVersion, visible: cur.visible, ...(req.body || {}) });
    db.run('UPDATE releases SET version = ?, channel = ?, title = ?, notes = ?, files = ?, rollout = ?, minimum_version = ?, visible = ?, updated_at = ? WHERE id = ?',
      b.version, b.channel, b.title, b.notes, JSON.stringify(b.files), b.rollout, b.minimumVersion, b.visible, now(), rel.id);
    if (rel.status === 'published') { configService.rebuild('releases'); ctx.publisher.schedule(); }
    audit(req, 'release.updated', rel.id, { version: b.version });
    res.json(configService.serializeRelease(getRelease(rel.id)));
  });
  r.post('/releases/:id/publish', (req, res) => {
    const rel = getRelease(id(req));
    if (!rel) throw E.notFound('Release not found');
    if (!json.parse(rel.files, []).length) throw E.badRequest('Add at least one file before publishing');
    db.run("UPDATE releases SET status = 'published', published_at = COALESCE(published_at, ?), updated_at = ? WHERE id = ?", now(), now(), rel.id);
    configService.rebuild('releases'); ctx.publisher.schedule();
    audit(req, 'release.published', rel.id, { version: rel.version, channel: rel.channel });
    res.json(configService.serializeRelease(getRelease(rel.id)));
  });
  r.post('/releases/:id/unpublish', (req, res) => {
    const rel = getRelease(id(req));
    if (!rel) throw E.notFound('Release not found');
    db.run("UPDATE releases SET status = 'draft', updated_at = ? WHERE id = ?", now(), rel.id);
    configService.rebuild('releases'); ctx.publisher.schedule();
    audit(req, 'release.unpublished', rel.id, { version: rel.version });
    res.json(configService.serializeRelease(getRelease(rel.id)));
  });
  r.delete('/releases/:id', (req, res) => {
    const rel = getRelease(id(req));
    if (!rel) throw E.notFound('Release not found');
    db.run('DELETE FROM releases WHERE id = ?', rel.id);
    configService.rebuild('releases'); ctx.publisher.schedule();
    audit(req, 'release.deleted', rel.id, { version: rel.version });
    res.json({ ok: true });
  });
  r.post('/releases/:id/verify', async (req, res) => {
    const rel = getRelease(id(req));
    if (!rel) throw E.notFound('Release not found');
    const results = [];
    for (const f of json.parse(rel.files, [])) {
      try {
        const resp = await fetch(f.url, { redirect: 'follow', signal: AbortSignal.timeout(10 * 60 * 1000) });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const hash = crypto.createHash('sha512'); let size = 0;
        for await (const chunk of resp.body) { hash.update(chunk); size += chunk.length; }
        const sha512 = hash.digest('base64');
        results.push({ name: f.name, ok: sha512 === f.sha512 && size === f.size, sha512, size, expectedSha512: f.sha512, expectedSize: f.size });
      } catch (e) { results.push({ name: f.name, ok: false, error: e.message }); }
    }
    audit(req, 'release.verified', rel.id, { ok: results.every((x) => x.ok) });
    res.json({ results });
  });

  /* ---------------- assets ---------------- */
  r.get('/assets', (req, res) => {
    const { limit, offset } = paging({ limit: req.query.limit || 50, offset: req.query.offset });
    const where = []; const p = [];
    if (ASSET_CATEGORIES.includes(req.query.category)) { where.push('category = ?'); p.push(req.query.category); }
    if (typeof req.query.q === 'string' && req.query.q.trim()) { where.push("name LIKE ? ESCAPE '\\'"); p.push(`%${req.query.q.trim().slice(0, 60).replace(/[%_\\]/g, (m) => '\\' + m)}%`); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    res.json({ items: db.all(`SELECT * FROM assets ${w} ORDER BY updated_at DESC LIMIT ? OFFSET ?`, ...p, limit, offset).map((a) => serializeAsset(a, storage)), total: db.get(`SELECT COUNT(*) AS n FROM assets ${w}`, ...p).n });
  });
  r.post('/assets', async (req, res) => {
    const { fields, files } = await storage.parseMultipart(req, { maxBytes: Math.max(settings.get().uploadLimits.maxBytes, 32 * 1024 * 1024), maxFiles: 1 });
    const b = check(s.object({ name: s.string({ min: 1, max: 120 }), category: s.enum(ASSET_CATEGORIES) }), fields);
    if (!files.file) throw E.invalid([{ path: 'file', message: 'is required' }]);
    const saved = storage.store(files.file.buffer, { allow: ASSET_MIMES });
    const { id: aid } = db.tx(() => {
      const ins = db.run('INSERT INTO assets (name, category, mime, size, width, height, storage_name, sha256, version, published, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,1,1,?,?,?)',
        b.name, b.category, saved.mime, saved.size, saved.width, saved.height, saved.storageName, saved.sha256, req.user.id, now(), now());
      db.run('INSERT INTO asset_versions (asset_id, version, storage_name, mime, size, width, height, sha256, created_at) VALUES (?,?,?,?,?,?,?,?,?)', ins.id, 1, saved.storageName, saved.mime, saved.size, saved.width, saved.height, saved.sha256, now());
      return ins;
    });
    audit(req, 'asset.uploaded', aid, { name: b.name, mime: saved.mime, size: saved.size });
    res.status(201).json(serializeAsset(db.get('SELECT * FROM assets WHERE id = ?', aid), storage));
  });
  r.patch('/assets/:id', (req, res) => {
    const a = db.get('SELECT * FROM assets WHERE id = ?', id(req));
    if (!a) throw E.notFound('Asset not found');
    const b = check(s.object({ name: s.optional(s.string({ min: 1, max: 120 })), category: s.optional(s.enum(ASSET_CATEGORIES)), published: s.optional(s.bool()) }), req.body);
    db.run('UPDATE assets SET name = ?, category = ?, published = ?, updated_at = ? WHERE id = ?', b.name ?? a.name, b.category ?? a.category, b.published ?? !!a.published, now(), a.id);
    audit(req, 'asset.updated', a.id, b);
    res.json(serializeAsset(db.get('SELECT * FROM assets WHERE id = ?', a.id), storage));
  });
  r.post('/assets/:id/replace', async (req, res) => {
    const a = db.get('SELECT * FROM assets WHERE id = ?', id(req));
    if (!a) throw E.notFound('Asset not found');
    const { files } = await storage.parseMultipart(req, { maxBytes: Math.max(settings.get().uploadLimits.maxBytes, 32 * 1024 * 1024), maxFiles: 1 });
    if (!files.file) throw E.invalid([{ path: 'file', message: 'is required' }]);
    const saved = storage.store(files.file.buffer, { allow: ASSET_MIMES });
    const v = a.version + 1;
    db.tx(() => {
      db.run('INSERT INTO asset_versions (asset_id, version, storage_name, mime, size, width, height, sha256, created_at) VALUES (?,?,?,?,?,?,?,?,?)', a.id, v, saved.storageName, saved.mime, saved.size, saved.width, saved.height, saved.sha256, now());
      db.run('UPDATE assets SET mime = ?, size = ?, width = ?, height = ?, storage_name = ?, sha256 = ?, version = ?, updated_at = ? WHERE id = ?', saved.mime, saved.size, saved.width, saved.height, saved.storageName, saved.sha256, v, now(), a.id);
    });
    audit(req, 'asset.replaced', a.id, { version: v });
    res.json(serializeAsset(db.get('SELECT * FROM assets WHERE id = ?', a.id), storage));
  });
  r.get('/assets/:id/versions', (req, res) => {
    res.json({ items: db.all('SELECT * FROM asset_versions WHERE asset_id = ? ORDER BY version DESC', id(req)).map((v) => ({ version: v.version, url: storage.url(v.storage_name), size: v.size, mime: v.mime, width: v.width, height: v.height, createdAt: v.created_at })) });
  });
  r.post('/assets/:id/rollback', (req, res) => {
    const a = db.get('SELECT * FROM assets WHERE id = ?', id(req));
    if (!a) throw E.notFound('Asset not found');
    const { version } = check(s.object({ version: s.int({ min: 1 }) }), req.body);
    const v = db.get('SELECT * FROM asset_versions WHERE asset_id = ? AND version = ?', a.id, version);
    if (!v) throw E.notFound('Version not found');
    const nv = a.version + 1;
    db.tx(() => {
      db.run('INSERT INTO asset_versions (asset_id, version, storage_name, mime, size, width, height, sha256, created_at) VALUES (?,?,?,?,?,?,?,?,?)', a.id, nv, v.storage_name, v.mime, v.size, v.width, v.height, v.sha256, now());
      db.run('UPDATE assets SET mime = ?, size = ?, width = ?, height = ?, storage_name = ?, sha256 = ?, version = ?, updated_at = ? WHERE id = ?', v.mime, v.size, v.width, v.height, v.storage_name, v.sha256, nv, now(), a.id);
    });
    audit(req, 'asset.rolled_back', a.id, { to: version, version: nv });
    res.json(serializeAsset(db.get('SELECT * FROM assets WHERE id = ?', a.id), storage));
  });
  r.delete('/assets/:id', (req, res) => {
    const a = db.get('SELECT * FROM assets WHERE id = ?', id(req));
    if (!a) throw E.notFound('Asset not found');
    db.run('DELETE FROM assets WHERE id = ?', a.id);
    audit(req, 'asset.deleted', a.id, { name: a.name });
    res.json({ ok: true });
  });

  return r;
}

module.exports = { createOwnerContentRoutes, ASSET_CATEGORIES };
