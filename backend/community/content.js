'use strict';
const express = require('express');
const { s, validate } = require('../../shared/utilities/schema');
const { ITEM_SCHEMAS, DEFAULTS } = require('../../shared/configuration/domains');
const { json, now } = require('../database/db');
const { E, check, sha256 } = require('../services/core');
const { publicUser, activeRestrictions } = require('../auth/sessions');
const { paging } = require('../api/public');

const KINDS = ['skin', 'background', 'resource', 'crosshair', 'hud', 'theme', 'plugin'];
const ALLOWED = {
  skin: ['image/png'],
  background: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/webm'],
  resource: ['image/png', 'image/jpeg', 'image/webp', 'audio/ogg', 'audio/wav', 'audio/mpeg', 'model/gltf-binary', 'model/gltf+json'],
  crosshair: ['application/json'], hud: ['application/json'], theme: ['application/json'], plugin: ['application/json'],
};
const ROLE_RANK = { user: 1, moderator: 2, admin: 3, owner: 4 };

function createContent(ctx) {
  const { db, storage, settings, rate, configService, log } = ctx;

  const communitySettings = () => { const p = configService.published('community.settings'); return p ? p.data : DEFAULTS['community.settings']; };

  function serialize(it, viewerId) {
    const author = it.author_id ? db.get('SELECT * FROM users WHERE id = ?', it.author_id) : null;
    return {
      id: it.id, kind: it.kind, title: it.title, description: it.description, category: it.category, tags: json.parse(it.tags, []),
      status: it.status, featured: !!it.featured, official: !!it.official,
      fileUrl: storage.url(it.storage_name), previewUrl: storage.url(it.preview_name) || (it.mime.startsWith('image/') ? storage.url(it.storage_name) : null),
      mime: it.mime, size: it.size, metadata: json.parse(it.metadata, {}), version: it.version, downloads: it.downloads,
      likes: db.get('SELECT COUNT(*) AS n FROM item_likes WHERE item_id = ?', it.id).n,
      liked: viewerId ? !!db.get('SELECT 1 AS ok FROM item_likes WHERE item_id = ? AND user_id = ?', it.id, viewerId) : false,
      comments: db.get('SELECT COUNT(*) AS n FROM comments WHERE item_id = ?', it.id).n,
      reviewNote: it.review_note || null,
      author: author ? publicUser(author, { showPresence: false }) : null,
      createdAt: it.created_at, updatedAt: it.updated_at,
      price: { amount: 0, currency: 'none', label: 'Free' },
    };
  }

  /** Validates the uploaded file for the kind and derives metadata. */
  function inspectFile(kind, buffer, metadataIn) {
    const meta = { ...metadataIn };
    const saved = storage.store(buffer, { allow: ALLOWED[kind] });
    if (saved.mime === 'application/json' || saved.mime === 'model/gltf+json') {
      if (ITEM_SCHEMAS[kind]) {
        const r = validate(ITEM_SCHEMAS[kind], JSON.parse(buffer.toString('utf8')));
        if (!r.ok) throw E.invalid(r.errors.map((e) => ({ path: `file.${e.path}`, message: e.message })), `The ${kind} file is not valid`);
        if (kind === 'plugin') {
          const m = r.value.manifest;
          meta.manifest = { ...m, entry: 'code', sha256: sha256(r.value.code) };
          meta.compatibility = meta.compatibility || 'untested';
          meta.approvedPermissions = [];
        }
      }
    }
    if (kind === 'skin') {
      const ok = [[64, 64], [128, 128], [64, 32], [128, 64]].some(([w, h]) => saved.width === w && saved.height === h);
      if (!ok) throw E.invalid([{ path: 'file', message: `Skins must be 64×64 or 128×128 PNG templates (got ${saved.width}×${saved.height})` }]);
    }
    if (saved.width) { meta.width = saved.width; meta.height = saved.height; }
    return { saved, meta };
  }

  function canUpload(user, kind) {
    const need = communitySettings().uploadPermissions[kind] || 'user';
    if (need === 'nobody') return false;
    return (ROLE_RANK[user.role] || 0) >= (ROLE_RANK[need] || 1);
  }

  async function createFromRequest(req, { official = false } = {}) {
    rate(`upload:${req.user.id}`, settings.get().rateLimits.upload, 3600000);
    if (!official && activeRestrictions(req.user).upload) throw E.forbidden('Uploading is restricted on your account');
    const { fields, files } = await storage.parseMultipart(req, { maxBytes: settings.get().uploadLimits.maxBytes, maxFiles: 2 });
    let metadata = {};
    if (fields.metadata) { try { metadata = JSON.parse(fields.metadata); } catch { throw E.invalid([{ path: 'metadata', message: 'must be JSON' }]); } }
    const b = check(s.object({
      kind: s.enum(KINDS), title: s.string({ min: 2, max: 80 }), description: s.optional(s.string({ max: 2000 }), ''),
      category: s.optional(s.string({ max: 40 }), ''), tags: s.optional(s.string({ max: 300 }), ''),
    }), fields);
    if (!official && !canUpload(req.user, b.kind)) throw E.forbidden(`Uploading ${b.kind}s is not open to your role`);
    const cats = communitySettings().categories[b.kind] || [];
    if (b.category && cats.length && !cats.includes(b.category)) throw E.invalid([{ path: 'category', message: `must be one of: ${cats.join(', ')}` }]);
    if (!files.file) throw E.invalid([{ path: 'file', message: 'is required' }]);
    const userMeta = check(s.record(s.any({ maxBytes: 4000 }), { maxKeys: 20 }), metadata);
    delete userMeta.approvedPermissions; delete userMeta.compatibility; delete userMeta.manifest;
    const { saved, meta } = inspectFile(b.kind, files.file.buffer, userMeta);
    let preview = null;
    if (files.preview) preview = storage.store(files.preview.buffer, { allow: ['image/png', 'image/jpeg', 'image/webp'] });
    const tags = b.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 10).map((t) => t.slice(0, 24));
    const status = official || !communitySettings().requireApproval ? 'approved' : 'pending';
    const { id } = db.run(`INSERT INTO items (kind, title, description, category, tags, status, official, storage_name, mime, size, preview_name, metadata, author_id, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, b.kind, b.title, b.description, b.category, JSON.stringify(tags), status, official ? 1 : 0,
    saved.storageName, saved.mime, saved.size, preview ? preview.storageName : null, JSON.stringify(meta), req.user.id, now(), now());
    db.run('INSERT INTO item_versions (item_id, version, storage_name, mime, size, metadata, created_at) VALUES (?,?,?,?,?,?,?)', id, 1, saved.storageName, saved.mime, saved.size, JSON.stringify(meta), now());
    log.info('community item uploaded', { id, kind: b.kind, by: req.user.username, status });
    return db.get('SELECT * FROM items WHERE id = ?', id);
  }

  function listByAuthor(authorId, viewerId) {
    return db.all("SELECT * FROM items WHERE author_id = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 50", authorId).map((i) => serialize(i, viewerId));
  }

  return { serialize, createFromRequest, inspectFile, listByAuthor, communitySettings, KINDS, ALLOWED };
}

function createContentRoutes(ctx) {
  const { db, mw, rate, storage } = ctx;
  const items = ctx.items;
  const r = express.Router();
  const getItem = (id) => db.get('SELECT * FROM items WHERE id = ?', parseInt(id, 10) || 0);
  const visibleTo = (it, user) => it && (it.status === 'approved' || (user && (it.author_id === user.id || user.role === 'owner')));

  r.get('/categories', (_req, res) => { const cs = items.communitySettings(); res.json({ categories: cs.categories, rules: cs.marketplaceRules, featured: cs.marketplaceFeatured }); });

  r.get('/items', (req, res) => {
    const { limit, offset } = paging(req.query);
    const where = []; const params = [];
    if (req.query.mine === '1' && req.user) { where.push('author_id = ?'); params.push(req.user.id); }
    else where.push("status = 'approved'");
    if (items.KINDS.includes(req.query.kind)) { where.push('kind = ?'); params.push(req.query.kind); }
    if (typeof req.query.category === 'string' && req.query.category) { where.push('category = ?'); params.push(req.query.category.slice(0, 40)); }
    if (req.query.featured === '1') where.push('featured = 1');
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      const like = `%${req.query.q.trim().slice(0, 60).replace(/[%_\\]/g, (m) => '\\' + m)}%`;
      where.push("(title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\')"); params.push(like, like, like);
    }
    if (typeof req.query.author === 'string') {
      const a = db.get('SELECT id FROM users WHERE username = ?', req.query.author);
      where.push('author_id = ?'); params.push(a ? a.id : -1);
    }
    const order = { popular: '(SELECT COUNT(*) FROM item_likes l WHERE l.item_id = items.id) DESC, downloads DESC', downloads: 'downloads DESC', new: 'created_at DESC' }[req.query.sort] || 'featured DESC, created_at DESC';
    const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = db.get(`SELECT COUNT(*) AS n FROM items ${sqlWhere}`, ...params).n;
    const rows = db.all(`SELECT * FROM items ${sqlWhere} ORDER BY ${order} LIMIT ? OFFSET ?`, ...params, limit, offset);
    res.json({ items: rows.map((i) => items.serialize(i, req.user && req.user.id)), total });
  });

  r.get('/items/:id', (req, res) => {
    const it = getItem(req.params.id);
    if (!visibleTo(it, req.user)) throw E.notFound('Item not found');
    res.json(items.serialize(it, req.user && req.user.id));
  });

  r.post('/items', mw.requireUser, async (req, res) => {
    const it = await items.createFromRequest(req);
    res.status(201).json(items.serialize(it, req.user.id));
  });

  r.patch('/items/:id', mw.requireUser, (req, res) => {
    const it = getItem(req.params.id);
    if (!it || it.author_id !== req.user.id) throw E.notFound('Item not found');
    const b = check(s.object({ title: s.optional(s.string({ min: 2, max: 80 })), description: s.optional(s.string({ max: 2000 })), category: s.optional(s.string({ max: 40 })), tags: s.optional(s.array(s.string({ max: 24 }), { max: 10 })) }), req.body);
    const status = items.communitySettings().requireApproval && it.status === 'approved' ? 'pending' : it.status;
    db.run('UPDATE items SET title = ?, description = ?, category = ?, tags = ?, status = ?, updated_at = ? WHERE id = ?',
      b.title ?? it.title, b.description ?? it.description, b.category ?? it.category, JSON.stringify(b.tags ?? json.parse(it.tags, [])), status, now(), it.id);
    res.json(items.serialize(getItem(it.id), req.user.id));
  });

  r.delete('/items/:id', mw.requireUser, (req, res) => {
    const it = getItem(req.params.id);
    if (!it || (it.author_id !== req.user.id && req.user.role !== 'owner')) throw E.notFound('Item not found');
    db.run('DELETE FROM items WHERE id = ?', it.id);
    res.json({ ok: true });
  });

  r.post('/items/:id/like', mw.requireUser, (req, res) => {
    const it = getItem(req.params.id);
    if (!visibleTo(it, req.user) || it.status !== 'approved') throw E.notFound('Item not found');
    db.run('INSERT INTO item_likes (item_id, user_id, created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING', it.id, req.user.id, now());
    res.json({ likes: db.get('SELECT COUNT(*) AS n FROM item_likes WHERE item_id = ?', it.id).n, liked: true });
  });
  r.delete('/items/:id/like', mw.requireUser, (req, res) => {
    db.run('DELETE FROM item_likes WHERE item_id = ? AND user_id = ?', parseInt(req.params.id, 10) || 0, req.user.id);
    res.json({ likes: db.get('SELECT COUNT(*) AS n FROM item_likes WHERE item_id = ?', parseInt(req.params.id, 10) || 0).n, liked: false });
  });

  r.get('/items/:id/comments', (req, res) => {
    const it = getItem(req.params.id);
    if (!visibleTo(it, req.user)) throw E.notFound('Item not found');
    const rows = db.all('SELECT * FROM comments WHERE item_id = ? ORDER BY id ASC LIMIT 200', it.id);
    res.json({ items: rows.map((c) => ({ id: c.id, user: publicUser(db.get('SELECT * FROM users WHERE id = ?', c.user_id), { showPresence: false }), body: c.body, createdAt: c.created_at })) });
  });
  r.post('/items/:id/comments', mw.requireUser, (req, res) => {
    rate(`comment:${req.user.id}`, 20, 600000);
    if (activeRestrictions(req.user).chat) throw E.forbidden('Commenting is restricted on your account');
    const it = getItem(req.params.id);
    if (!it || it.status !== 'approved') throw E.notFound('Item not found');
    const { body } = check(s.object({ body: s.string({ min: 1, max: 1000 }) }), req.body);
    const { id } = db.run('INSERT INTO comments (item_id, user_id, body, created_at) VALUES (?,?,?,?)', it.id, req.user.id, body.trim(), now());
    if (it.author_id && it.author_id !== req.user.id) ctx.social.notify(it.author_id, 'comment', `${req.user.display_name} commented on "${it.title}"`, body.slice(0, 140), `polaris://marketplace/item/${it.id}`);
    res.status(201).json({ id, user: publicUser(req.user, { showPresence: false }), body: body.trim(), createdAt: now() });
  });

  r.get('/items/:id/download', (req, res) => {
    const it = getItem(req.params.id);
    if (!visibleTo(it, req.user)) throw E.notFound('Item not found');
    // count at most one download per IP and item every 10 minutes; never block the download itself
    let count = true;
    try { rate(`dlitem:${req.ip}:${it.id}`, 1, 600000); } catch { count = false; }
    if (count) db.run('UPDATE items SET downloads = downloads + 1 WHERE id = ?', it.id);
    res.redirect(302, storage.url(it.storage_name));
  });

  return r;
}

function createFeedbackRoutes(ctx) {
  const { db, rate } = ctx;
  const r = express.Router();
  const serialize = (f, viewerId) => {
    const author = f.author_id ? db.get('SELECT * FROM users WHERE id = ?', f.author_id) : null;
    return {
      id: f.id, type: f.type, title: f.title, body: f.body, status: f.status, response: f.response, version: f.version, os: f.os,
      votes: db.get('SELECT COUNT(*) AS n FROM feedback_votes WHERE feedback_id = ?', f.id).n,
      voted: viewerId ? !!db.get('SELECT 1 AS ok FROM feedback_votes WHERE feedback_id = ? AND user_id = ?', f.id, viewerId) : false,
      createdAt: f.created_at, updatedAt: f.updated_at, author: author ? publicUser(author, { showPresence: false }) : null,
    };
  };

  r.get('/', (req, res) => {
    const { limit, offset } = paging(req.query);
    const type = req.query.type === 'bug' ? 'bug' : req.query.type === 'suggestion' ? 'suggestion' : null;
    const where = []; const params = [];
    if (type) { where.push('type = ?'); params.push(type); }
    if (typeof req.query.status === 'string' && req.query.status) { where.push('status = ?'); params.push(req.query.status); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const order = req.query.sort === 'new' ? 'created_at DESC' : '(SELECT COUNT(*) FROM feedback_votes v WHERE v.feedback_id = feedback.id) DESC, created_at DESC';
    const total = db.get(`SELECT COUNT(*) AS n FROM feedback ${w}`, ...params).n;
    res.json({ items: db.all(`SELECT * FROM feedback ${w} ORDER BY ${order} LIMIT ? OFFSET ?`, ...params, limit, offset).map((f) => serialize(f, req.user && req.user.id)), total });
  });

  r.post('/', (req, res) => {
    if (req.user) rate(`fb:${req.user.id}`, 10, 3600000); else rate(`fb-anon:${req.ip}`, 3, 3600000);
    const b = check(s.object({
      type: s.enum(['bug', 'suggestion']), title: s.string({ min: 5, max: 120 }), body: s.string({ min: 10, max: 5000 }),
      version: s.optional(s.nullable(s.string({ max: 20 })), null), os: s.optional(s.nullable(s.string({ max: 60 })), null), contact: s.optional(s.nullable(s.string({ max: 120 })), null),
    }), req.body);
    const { id } = db.run('INSERT INTO feedback (type, title, body, version, os, contact, author_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
      b.type, b.title.trim(), b.body.trim(), b.version, b.os, b.contact, req.user ? req.user.id : null, now(), now());
    res.status(201).json(serialize(db.get('SELECT * FROM feedback WHERE id = ?', id), req.user && req.user.id));
  });

  r.post('/:id/vote', ctx.mw.requireUser, (req, res) => {
    const f = db.get('SELECT * FROM feedback WHERE id = ?', parseInt(req.params.id, 10) || 0);
    if (!f) throw E.notFound('Not found');
    db.run('INSERT INTO feedback_votes (feedback_id, user_id) VALUES (?,?) ON CONFLICT DO NOTHING', f.id, req.user.id);
    res.json(serialize(f, req.user.id));
  });
  r.delete('/:id/vote', ctx.mw.requireUser, (req, res) => {
    const f = db.get('SELECT * FROM feedback WHERE id = ?', parseInt(req.params.id, 10) || 0);
    if (!f) throw E.notFound('Not found');
    db.run('DELETE FROM feedback_votes WHERE feedback_id = ? AND user_id = ?', f.id, req.user.id);
    res.json(serialize(f, req.user.id));
  });

  return { router: r, serialize };
}

module.exports = { createContent, createContentRoutes, createFeedbackRoutes, KINDS };
