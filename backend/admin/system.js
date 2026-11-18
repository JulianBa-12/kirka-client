'use strict';
/** Owner API: overview, community moderation, users, system, security, data, analytics. */
const express = require('express');
const fs = require('fs');
const { s } = require('../../shared/utilities/schema');
const { compareVersions } = require('../../shared/utilities/signing');
const { json, now } = require('../database/db');
const { E, check } = require('../services/core');
const { publicUser, meUser, isOnline } = require('../auth/sessions');
const { paging } = require('../api/public');
const { latest: SCHEMA_VERSION } = require('../database/migrations');

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

function createOwnerSystemRoutes(ctx) {
  const { db, configService, audit, settings, log, cfg, keys, storage, backups, publisher, items, feedback } = ctx;
  const r = express.Router();
  const id = (req) => parseInt(req.params.id, 10) || 0;

  /* ---------------- overview ---------------- */
  r.get('/overview', (_req, res) => {
    const rel = configService.buildReleasesPayload();
    let database = 'ok'; try { db.get('PRAGMA quick_check'); } catch { database = 'error'; }
    res.json({
      users: {
        total: db.get('SELECT COUNT(*) AS n FROM users').n,
        active7d: db.get('SELECT COUNT(DISTINCT user_id) AS n FROM daily_activity WHERE date >= ?', daysAgo(7).slice(0, 10)).n,
        online: db.get('SELECT COUNT(*) AS n FROM users WHERE last_seen_at > ?', new Date(Date.now() - 120000).toISOString()).n,
        new7d: db.get('SELECT COUNT(*) AS n FROM users WHERE created_at > ?', daysAgo(7)).n,
      },
      version: { server: cfg.version, latestStable: rel.channels.stable ? rel.channels.stable.version : null, latestBeta: rel.channels.beta ? rel.channels.beta.version : null },
      status: { api: 'ok', database, signing: keys.keyId ? 'ok' : 'missing', github: publisher.configured ? 'configured' : 'not_configured', maintenance: settings.get().maintenance },
      pending: {
        items: db.get("SELECT COUNT(*) AS n FROM items WHERE status = 'pending'").n,
        feedback: db.get("SELECT COUNT(*) AS n FROM feedback WHERE status = 'open'").n,
        reports: db.get("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'").n,
      },
      recentAudit: db.all('SELECT * FROM audit_log ORDER BY id DESC LIMIT 12').map(serializeAudit),
      recentErrors: log.entries('warn', 12),
      updates: {
        heartbeats7d: db.get('SELECT COUNT(DISTINCT install_id) AS n FROM telemetry_heartbeats WHERE date >= ?', daysAgo(7).slice(0, 10)).n,
        versions: db.all('SELECT version, COUNT(DISTINCT install_id) AS installs FROM telemetry_heartbeats WHERE date >= ? GROUP BY version', daysAgo(7).slice(0, 10)).sort((a, b) => compareVersions(b.version, a.version)),
      },
      bundles: configService.bundleInfo(),
    });
  });

  /* ---------------- community items ---------------- */
  r.get('/community/items', (req, res) => {
    const { limit, offset } = paging(req.query);
    const where = []; const p = [];
    if (['pending', 'approved', 'rejected', 'hidden'].includes(req.query.status)) { where.push('status = ?'); p.push(req.query.status); }
    if (items.KINDS.includes(req.query.kind)) { where.push('kind = ?'); p.push(req.query.kind); }
    if (typeof req.query.q === 'string' && req.query.q.trim()) { where.push("title LIKE ? ESCAPE '\\'"); p.push(`%${req.query.q.trim().slice(0, 60).replace(/[%_\\]/g, (m) => '\\' + m)}%`); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    res.json({ items: db.all(`SELECT * FROM items ${w} ORDER BY (status = 'pending') DESC, created_at DESC LIMIT ? OFFSET ?`, ...p, limit, offset).map((i) => items.serialize(i)), total: db.get(`SELECT COUNT(*) AS n FROM items ${w}`, ...p).n });
  });
  r.post('/community/items', async (req, res) => {
    const it = await items.createFromRequest(req, { official: true });
    audit(req, 'item.official_created', it.id, { kind: it.kind, title: it.title });
    res.status(201).json(items.serialize(it));
  });
  r.patch('/community/items/:id', (req, res) => {
    const it = db.get('SELECT * FROM items WHERE id = ?', id(req));
    if (!it) throw E.notFound('Item not found');
    const b = check(s.object({
      status: s.optional(s.enum(['pending', 'approved', 'rejected', 'hidden'])), featured: s.optional(s.bool()), official: s.optional(s.bool()),
      title: s.optional(s.string({ min: 2, max: 80 })), description: s.optional(s.string({ max: 2000 })), category: s.optional(s.string({ max: 40 })),
      tags: s.optional(s.array(s.string({ max: 24 }), { max: 10 })), metadata: s.optional(s.record(s.any({ maxBytes: 8000 }), { maxKeys: 30 })),
      reviewNote: s.optional(s.nullable(s.string({ max: 500 }))),
    }), req.body);
    let metadata = json.parse(it.metadata, {});
    if (b.metadata) {
      metadata = { ...metadata, ...b.metadata };
      if (it.kind === 'plugin') {
        const requested = (metadata.manifest && metadata.manifest.permissions) || [];
        metadata.approvedPermissions = (b.metadata.approvedPermissions || metadata.approvedPermissions || []).filter((x) => requested.includes(x));
        if (!['compatible', 'untested', 'incompatible'].includes(metadata.compatibility)) metadata.compatibility = 'untested';
        // manifest is derived from the uploaded file and cannot be edited
        metadata.manifest = json.parse(it.metadata, {}).manifest;
      }
    }
    db.run('UPDATE items SET status = ?, featured = ?, official = ?, title = ?, description = ?, category = ?, tags = ?, metadata = ?, review_note = ?, updated_at = ? WHERE id = ?',
      b.status ?? it.status, b.featured ?? !!it.featured, b.official ?? !!it.official, b.title ?? it.title, b.description ?? it.description, b.category ?? it.category,
      JSON.stringify(b.tags ?? json.parse(it.tags, [])), JSON.stringify(metadata), b.reviewNote !== undefined ? b.reviewNote : it.review_note, now(), it.id);
    if (b.status && b.status !== it.status && it.author_id) {
      const verb = { approved: 'was approved', rejected: 'was rejected', hidden: 'was hidden by moderation' }[b.status];
      if (verb) ctx.social.notify(it.author_id, 'moderation', `Your ${it.kind} "${it.title}" ${verb}`, b.reviewNote || '', `polaris://marketplace/item/${it.id}`);
    }
    audit(req, 'item.moderated', it.id, { status: b.status, featured: b.featured, official: b.official });
    res.json(items.serialize(db.get('SELECT * FROM items WHERE id = ?', it.id)));
  });
  r.delete('/community/items/:id', (req, res) => {
    const it = db.get('SELECT * FROM items WHERE id = ?', id(req));
    if (!it) throw E.notFound('Item not found');
    db.run('DELETE FROM items WHERE id = ?', it.id);
    audit(req, 'item.deleted', it.id, { title: it.title, kind: it.kind });
    res.json({ ok: true });
  });

  r.get('/community/groups', (_req, res) => {
    res.json({ items: db.all('SELECT * FROM community_groups ORDER BY id').map((g) => ({ id: g.id, slug: g.slug, name: g.name, description: g.description, visibility: g.visibility, official: !!g.official, createdAt: g.created_at, members: db.get('SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?', g.id).n, messages: db.get('SELECT COUNT(*) AS n FROM group_messages WHERE group_id = ?', g.id).n })) });
  });
  r.delete('/community/groups/:id', (req, res) => {
    const g = db.get('SELECT * FROM community_groups WHERE id = ?', id(req));
    if (!g) throw E.notFound('Group not found');
    if (g.slug === 'lobby') throw E.badRequest('The community lobby cannot be deleted');
    db.run('DELETE FROM community_groups WHERE id = ?', g.id);
    audit(req, 'group.deleted', g.id, { name: g.name });
    res.json({ ok: true });
  });
  r.get('/community/groups/:id/messages', (req, res) => {
    res.json({ items: db.all('SELECT * FROM group_messages WHERE group_id = ? ORDER BY id DESC LIMIT 200', id(req)).map((m) => ({ id: m.id, user: publicUser(db.get('SELECT * FROM users WHERE id = ?', m.user_id), { showPresence: false }), body: m.body, createdAt: m.created_at })) });
  });
  r.delete('/community/messages/:kind/:id', (req, res) => {
    const table = req.params.kind === 'direct' ? 'messages' : req.params.kind === 'group' ? 'group_messages' : null;
    if (!table) throw E.notFound('Unknown message kind');
    const { changes } = db.run(`DELETE FROM ${table} WHERE id = ?`, id(req));
    if (!changes) throw E.notFound('Message not found');
    audit(req, 'message.deleted', `${req.params.kind}:${id(req)}`);
    res.json({ ok: true });
  });
  r.delete('/community/comments/:id', (req, res) => {
    const { changes } = db.run('DELETE FROM comments WHERE id = ?', id(req));
    if (!changes) throw E.notFound('Comment not found');
    audit(req, 'comment.deleted', id(req));
    res.json({ ok: true });
  });

  /* ---------------- reports & feedback ---------------- */
  function resolveTarget(type, tid) {
    const u = (uid) => publicUser(db.get('SELECT * FROM users WHERE id = ?', uid), { showPresence: false });
    if (type === 'user') { const x = db.get('SELECT * FROM users WHERE id = ?', tid); return x ? { user: publicUser(x, { showPresence: false }) } : null; }
    if (type === 'message') { const x = db.get('SELECT * FROM messages WHERE id = ?', tid); return x ? { body: x.body, from: u(x.from_id), to: u(x.to_id), createdAt: x.created_at } : null; }
    if (type === 'group_message') { const x = db.get('SELECT * FROM group_messages WHERE id = ?', tid); return x ? { body: x.body, from: u(x.user_id), groupId: x.group_id, createdAt: x.created_at } : null; }
    if (type === 'item') { const x = db.get('SELECT * FROM items WHERE id = ?', tid); return x ? { item: items.serialize(x) } : null; }
    if (type === 'comment') { const x = db.get('SELECT * FROM comments WHERE id = ?', tid); return x ? { body: x.body, from: u(x.user_id), itemId: x.item_id } : null; }
    return null;
  }
  r.get('/reports', (req, res) => {
    const st = ['open', 'resolved', 'dismissed'].includes(req.query.status) ? req.query.status : null;
    const rows = st ? db.all('SELECT * FROM reports WHERE status = ? ORDER BY id DESC LIMIT 200', st) : db.all('SELECT * FROM reports ORDER BY id DESC LIMIT 200');
    res.json({ items: rows.map((x) => ({ id: x.id, reporter: x.reporter_id ? publicUser(db.get('SELECT * FROM users WHERE id = ?', x.reporter_id), { showPresence: false }) : null, targetType: x.target_type, targetId: x.target_id, target: resolveTarget(x.target_type, x.target_id), reason: x.reason, details: x.details, status: x.status, resolution: x.resolution, createdAt: x.created_at, resolvedAt: x.resolved_at })) });
  });
  r.patch('/reports/:id', (req, res) => {
    const b = check(s.object({ status: s.enum(['open', 'resolved', 'dismissed']), resolution: s.optional(s.nullable(s.string({ max: 1000 })), null) }), req.body);
    const { changes } = db.run('UPDATE reports SET status = ?, resolution = ?, resolved_by = ?, resolved_at = ? WHERE id = ?', b.status, b.resolution, req.user.id, b.status === 'open' ? null : now(), id(req));
    if (!changes) throw E.notFound('Report not found');
    audit(req, 'report.updated', id(req), b);
    res.json({ ok: true });
  });
  r.get('/feedback', (req, res) => {
    const where = []; const p = [];
    if (['bug', 'suggestion'].includes(req.query.type)) { where.push('type = ?'); p.push(req.query.type); }
    if (typeof req.query.status === 'string' && req.query.status) { where.push('status = ?'); p.push(req.query.status); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    res.json({ items: db.all(`SELECT * FROM feedback ${w} ORDER BY id DESC LIMIT 300`, ...p).map((f) => ({ ...feedback.serialize(f), contact: f.contact })) });
  });
  r.patch('/feedback/:id', (req, res) => {
    const f = db.get('SELECT * FROM feedback WHERE id = ?', id(req));
    if (!f) throw E.notFound('Not found');
    const b = check(s.object({ status: s.optional(s.enum(['open', 'planned', 'in-progress', 'done', 'wontfix', 'duplicate'])), response: s.optional(s.nullable(s.string({ max: 2000 }))) }), req.body);
    db.run('UPDATE feedback SET status = ?, response = ?, updated_at = ? WHERE id = ?', b.status ?? f.status, b.response !== undefined ? b.response : f.response, now(), f.id);
    if (f.author_id && b.status && b.status !== f.status) ctx.social.notify(f.author_id, 'feedback', `Your ${f.type === 'bug' ? 'bug report' : 'suggestion'} "${f.title}" is now ${b.status}`, b.response || '', null);
    audit(req, 'feedback.updated', f.id, b);
    res.json(feedback.serialize(db.get('SELECT * FROM feedback WHERE id = ?', f.id)));
  });
  r.delete('/feedback/:id', (req, res) => { db.run('DELETE FROM feedback WHERE id = ?', id(req)); audit(req, 'feedback.deleted', id(req)); res.json({ ok: true }); });

  /* ---------------- users ---------------- */
  const adminUser = (u) => ({
    ...meUser(u), status: u.status, lastSeenAt: u.last_seen_at, online: isOnline(u),
    sessions: db.get('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?', u.id, now()).n,
    reportsAgainst: db.get("SELECT COUNT(*) AS n FROM reports WHERE target_type = 'user' AND target_id = ?", u.id).n,
  });
  r.get('/users', (req, res) => {
    const { limit, offset } = paging(req.query);
    const where = []; const p = [];
    if (typeof req.query.q === 'string' && req.query.q.trim()) { const like = `%${req.query.q.trim().slice(0, 60).replace(/[%_\\]/g, (m) => '\\' + m)}%`; where.push("(username LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\')"); p.push(like, like, like); }
    if (['user', 'moderator', 'admin', 'owner'].includes(req.query.role)) { where.push('role = ?'); p.push(req.query.role); }
    if (['active', 'disabled'].includes(req.query.status)) { where.push('status = ?'); p.push(req.query.status); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sort = { lastSeen: 'last_seen_at DESC', name: 'username ASC' }[req.query.sort] || 'created_at DESC';
    res.json({ items: db.all(`SELECT * FROM users ${w} ORDER BY ${sort} LIMIT ? OFFSET ?`, ...p, limit, offset).map(adminUser), total: db.get(`SELECT COUNT(*) AS n FROM users ${w}`, ...p).n });
  });
  r.get('/users/:id', (req, res) => {
    const u = db.get('SELECT * FROM users WHERE id = ?', id(req));
    if (!u) throw E.notFound('User not found');
    res.json({
      user: adminUser(u),
      sessions: db.all('SELECT * FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY last_seen_at DESC', u.id, now()).map((x) => ({ id: x.id, scope: x.scope, client: x.client, ip: x.ip, userAgent: x.user_agent, createdAt: x.created_at, lastSeenAt: x.last_seen_at, expiresAt: x.expires_at })),
      loginHistory: db.all('SELECT at, ip, user_agent, success, reason, scope FROM login_history WHERE user_id = ? ORDER BY id DESC LIMIT 50', u.id).map((x) => ({ at: x.at, ip: x.ip, userAgent: x.user_agent, success: !!x.success, reason: x.reason, scope: x.scope })),
      reports: db.all("SELECT * FROM reports WHERE (target_type = 'user' AND target_id = ?) OR reporter_id = ? ORDER BY id DESC LIMIT 50", u.id, u.id).map((x) => ({ id: x.id, targetType: x.target_type, targetId: x.target_id, reason: x.reason, details: x.details, status: x.status, createdAt: x.created_at, againstUser: x.target_type === 'user' && x.target_id === u.id })),
      items: db.all('SELECT * FROM items WHERE author_id = ? ORDER BY id DESC LIMIT 50', u.id).map((i) => items.serialize(i)),
      activity: {
        messages: db.get('SELECT COUNT(*) AS n FROM messages WHERE from_id = ?', u.id).n + db.get('SELECT COUNT(*) AS n FROM group_messages WHERE user_id = ?', u.id).n,
        items: db.get('SELECT COUNT(*) AS n FROM items WHERE author_id = ?', u.id).n,
        comments: db.get('SELECT COUNT(*) AS n FROM comments WHERE user_id = ?', u.id).n,
        activeDays30: db.get('SELECT COUNT(*) AS n FROM daily_activity WHERE user_id = ? AND date >= ?', u.id, daysAgo(30).slice(0, 10)).n,
        lastSeenAt: u.last_seen_at,
      },
    });
  });
  r.patch('/users/:id', (req, res) => {
    const u = db.get('SELECT * FROM users WHERE id = ?', id(req));
    if (!u) throw E.notFound('User not found');
    const b = check(s.object({
      displayName: s.optional(s.string({ min: 1, max: 32 })), bio: s.optional(s.string({ max: 300 })),
      role: s.optional(s.enum(['user', 'moderator', 'admin'])), status: s.optional(s.enum(['active', 'disabled'])),
      restrictions: s.optional(s.object({ chat: s.bool(), upload: s.bool(), until: s.optional(s.nullable(s.string({ max: 40 })), null) })),
    }), req.body);
    if (u.role === 'owner' && (b.role || b.status === 'disabled')) throw E.forbidden('The owner account role and status cannot be changed');
    db.run('UPDATE users SET display_name = ?, bio = ?, role = ?, status = ?, restrictions = ?, updated_at = ? WHERE id = ?',
      b.displayName ?? u.display_name, b.bio ?? u.bio, b.role ?? u.role, b.status ?? u.status,
      b.restrictions ? JSON.stringify({ ...b.restrictions, until: b.restrictions.until ? new Date(b.restrictions.until).toISOString() : null }) : u.restrictions, now(), u.id);
    if (b.status === 'disabled') ctx.sessions.revokeAll(u.id);
    audit(req, 'user.updated', u.id, { username: u.username, ...b });
    res.json({ user: adminUser(db.get('SELECT * FROM users WHERE id = ?', u.id)) });
  });
  r.post('/users/:id/revoke-sessions', (req, res) => {
    const u = db.get('SELECT * FROM users WHERE id = ?', id(req));
    if (!u) throw E.notFound('User not found');
    ctx.sessions.revokeAll(u.id, u.id === req.user.id ? req.session.id : null);
    audit(req, 'user.sessions_revoked', u.id, { username: u.username });
    res.json({ ok: true });
  });
  r.delete('/users/:id', (req, res) => {
    const u = db.get('SELECT * FROM users WHERE id = ?', id(req));
    if (!u) throw E.notFound('User not found');
    if (u.role === 'owner') throw E.forbidden('The owner account cannot be deleted');
    db.run('DELETE FROM users WHERE id = ?', u.id);
    audit(req, 'user.deleted', u.id, { username: u.username });
    res.json({ ok: true });
  });

  /* ---------------- system ---------------- */
  r.get('/system', (_req, res) => {
    const m = process.memoryUsage();
    res.json({
      settings: settings.get(),
      runtime: { node: process.version, uptime: Math.round(process.uptime()), memory: { rss: m.rss, heapUsed: m.heapUsed, heapTotal: m.heapTotal }, platform: `${process.platform} ${process.arch}`, pid: process.pid, serverVersion: cfg.version },
      env: { publicUrl: cfg.publicUrl, corsOrigins: cfg.corsOrigins, githubPublishing: publisher.configured, dataDir: cfg.dataDir, trustProxy: cfg.trustProxy },
    });
  });
  r.patch('/system/settings', (req, res) => {
    const b = check(s.object({
      maintenance: s.optional(s.bool()), maintenanceMessage: s.optional(s.string({ max: 300 })), registrationOpen: s.optional(s.bool()),
      rateLimits: s.optional(s.object({ auth: s.int({ min: 1, max: 1000 }), api: s.int({ min: 10, max: 10000 }), upload: s.int({ min: 1, max: 1000 }) })),
      uploadLimits: s.optional(s.object({ maxBytes: s.int({ min: 64 * 1024, max: 64 * 1024 * 1024 }), maxAvatarBytes: s.int({ min: 32 * 1024, max: 8 * 1024 * 1024 }) })),
      sessionTtlHours: s.optional(s.object({ user: s.int({ min: 1, max: 24 * 90 }), owner: s.int({ min: 1, max: 72 }) })),
      communityChat: s.optional(s.bool()),
    }), req.body);
    const out = settings.update(b);
    audit(req, 'system.settings_updated', null, b);
    res.json({ settings: out });
  });

  r.get('/security', (_req, res) => {
    const owner = db.get("SELECT * FROM users WHERE role = 'owner'");
    res.json({
      owner: { username: owner && owner.username },
      ownerSessions: owner ? db.all("SELECT * FROM sessions WHERE user_id = ? AND scope = 'owner' AND revoked_at IS NULL AND expires_at > ? ORDER BY last_seen_at DESC", owner.id, now()).map((x) => ({ id: x.id, ip: x.ip, userAgent: x.user_agent, createdAt: x.created_at, lastSeenAt: x.last_seen_at, expiresAt: x.expires_at })) : [],
      failedLogins24h: db.get('SELECT COUNT(*) AS n FROM login_history WHERE success = 0 AND at > ?', daysAgo(1)).n,
      recentFailures: db.all('SELECT at, username, ip, reason, scope FROM login_history WHERE success = 0 ORDER BY id DESC LIMIT 30'),
      signingKey: { keyId: keys.keyId, createdAt: keys.createdAt, algorithm: 'ed25519' },
    });
  });
  r.delete('/security/sessions/:sid', (req, res) => { ctx.sessions.revoke(req.params.sid); audit(req, 'security.owner_session_revoked', req.params.sid); res.json({ ok: true }); });

  r.get('/audit', (req, res) => {
    const { limit, offset } = paging({ limit: req.query.limit || 50, offset: req.query.offset });
    const where = []; const p = [];
    if (typeof req.query.actor === 'string' && req.query.actor) { where.push('actor_name = ?'); p.push(req.query.actor); }
    if (typeof req.query.action === 'string' && req.query.action) { where.push('action LIKE ?'); p.push(`${req.query.action.replace(/[%_]/g, '')}%`); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    res.json({ items: db.all(`SELECT * FROM audit_log ${w} ORDER BY id DESC LIMIT ? OFFSET ?`, ...p, limit, offset).map(serializeAudit), total: db.get(`SELECT COUNT(*) AS n FROM audit_log ${w}`, ...p).n });
  });
  r.get('/logs', (req, res) => res.json({ items: log.entries(['info', 'warn', 'error'].includes(req.query.level) ? req.query.level : 'info', Math.min(parseInt(req.query.limit, 10) || 300, 2000)) }));
  r.get('/login-history', (_req, res) => res.json({ items: db.all('SELECT at, username, ip, user_agent, success, reason, scope FROM login_history ORDER BY id DESC LIMIT 300').map((x) => ({ ...x, success: !!x.success })) }));

  /* ---------------- analytics ---------------- */
  r.get('/analytics', (req, res) => {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
    const from = daysAgo(days - 1).slice(0, 10);
    const byDate = (sql, ...p) => Object.fromEntries(db.all(sql, ...p).map((x) => [x.d, x.n]));
    const active = byDate('SELECT date AS d, COUNT(*) AS n FROM daily_activity WHERE date >= ? GROUP BY date', from);
    const regs = byDate('SELECT substr(created_at, 1, 10) AS d, COUNT(*) AS n FROM users WHERE created_at >= ? GROUP BY d', from);
    const beats = byDate('SELECT date AS d, COUNT(*) AS n FROM telemetry_heartbeats WHERE date >= ? GROUP BY date', from);
    const dls = byDate('SELECT date AS d, COUNT(*) AS n FROM downloads WHERE date >= ? GROUP BY date', from);
    const ups = byDate('SELECT substr(created_at, 1, 10) AS d, COUNT(*) AS n FROM items WHERE created_at >= ? GROUP BY d', from);
    const msgs = byDate('SELECT d, SUM(n) AS n FROM (SELECT substr(created_at, 1, 10) AS d, COUNT(*) AS n FROM messages WHERE created_at >= ? GROUP BY d UNION ALL SELECT substr(created_at, 1, 10) AS d, COUNT(*) AS n FROM group_messages WHERE created_at >= ? GROUP BY d) GROUP BY d', from, from);
    const daily = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = daysAgo(i).slice(0, 10);
      daily.push({ date: d, activeUsers: active[d] || 0, registrations: regs[d] || 0, heartbeats: beats[d] || 0, downloads: dls[d] || 0, uploads: ups[d] || 0, messages: msgs[d] || 0 });
    }
    res.json({
      days, daily,
      versions: db.all('SELECT version, COUNT(DISTINCT install_id) AS installs FROM telemetry_heartbeats WHERE date >= ? GROUP BY version', from).sort((a, b) => compareVersions(b.version, a.version)),
      platforms: db.all('SELECT platform, COUNT(DISTINCT install_id) AS installs FROM telemetry_heartbeats WHERE date >= ? GROUP BY platform', from),
      channels: db.all('SELECT channel, COUNT(DISTINCT install_id) AS installs FROM telemetry_heartbeats WHERE date >= ? GROUP BY channel', from),
      content: { byKind: Object.fromEntries(db.all("SELECT kind, COUNT(*) AS n FROM items WHERE status = 'approved' GROUP BY kind").map((x) => [x.kind, x.n])), pending: db.get("SELECT COUNT(*) AS n FROM items WHERE status = 'pending'").n },
      crashes: db.all('SELECT version, message, created_at FROM telemetry_crashes ORDER BY id DESC LIMIT 20'),
      totals: { users: db.get('SELECT COUNT(*) AS n FROM users').n, items: db.get('SELECT COUNT(*) AS n FROM items').n, downloads: db.get('SELECT COUNT(*) AS n FROM downloads').n, installs: db.get('SELECT COUNT(DISTINCT install_id) AS n FROM telemetry_heartbeats').n },
    });
  });

  /* ---------------- database ---------------- */
  const SECRET_COLUMNS = new Set(['password_hash', 'token_hash', 'totp_secret', 'totp_pending', 'recovery_codes', 'envelope']);
  const tables = () => db.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map((t) => t.name);
  r.get('/database', (_req, res) => {
    let size = 0; try { size = fs.statSync(cfg.dbFile).size + (fs.existsSync(cfg.dbFile + '-wal') ? fs.statSync(cfg.dbFile + '-wal').size : 0); } catch {}
    res.json({ engine: 'sqlite (node:sqlite)', path: cfg.dbFile, sizeBytes: size, schemaVersion: SCHEMA_VERSION, sqliteVersion: db.get('SELECT sqlite_version() AS v').v, tables: tables().map((name) => ({ name, rows: db.get(`SELECT COUNT(*) AS n FROM "${name}"`).n })) });
  });
  r.get('/database/tables/:name', (req, res) => {
    const name = req.params.name;
    if (!tables().includes(name)) throw E.notFound('Unknown table');
    const { limit, offset } = paging({ limit: req.query.limit || 50, offset: req.query.offset });
    const cols = db.all(`PRAGMA table_info("${name}")`).map((c) => c.name);
    const rows = db.all(`SELECT * FROM "${name}" LIMIT ? OFFSET ?`, limit, offset).map((row) => {
      const out = {};
      for (const c of cols) out[c] = SECRET_COLUMNS.has(c) && row[c] != null ? '••• redacted •••' : row[c];
      return out;
    });
    res.json({ name, columns: cols, rows, total: db.get(`SELECT COUNT(*) AS n FROM "${name}"`).n });
  });
  r.post('/database/vacuum', (req, res) => { db.exec('VACUUM'); audit(req, 'database.vacuum'); res.json({ ok: true }); });
  r.post('/database/integrity', (req, res) => { const rows = db.all('PRAGMA integrity_check'); audit(req, 'database.integrity_check'); res.json({ ok: rows.length === 1 && rows[0].integrity_check === 'ok', results: rows.map((x) => x.integrity_check) }); });

  /* ---------------- backups ---------------- */
  r.get('/backups', (_req, res) => res.json({ items: backups.list() }));
  r.post('/backups', (req, res) => { const b = backups.create(); audit(req, 'backup.created', b.name); res.status(201).json(b); });
  r.get('/backups/:name/download', (req, res) => { const file = backups.path(req.params.name); if (!fs.existsSync(file)) throw E.notFound('Backup not found'); audit(req, 'backup.downloaded', req.params.name); res.download(file, req.params.name); });
  r.post('/backups/:name/restore', (req, res) => {
    if (!fs.existsSync(backups.path(req.params.name))) throw E.notFound('Backup not found');
    backups.stageRestore(req.params.name);
    audit(req, 'backup.restore_staged', req.params.name);
    res.json({ ok: true, message: 'Restore staged — it will be applied the next time the server starts.' });
  });
  r.delete('/backups/:name', (req, res) => { backups.remove(req.params.name); audit(req, 'backup.deleted', req.params.name); res.json({ ok: true }); });

  /* ---------------- integrations ---------------- */
  r.get('/integrations/github', (_req, res) => res.json(publisher.status()));
  r.post('/integrations/github/publish', async (req, res) => {
    if (!publisher.configured) throw E.badRequest('GitHub publishing is not configured on the server (POLARIS_GITHUB_TOKEN, POLARIS_GITHUB_REPO)');
    try { const out = await publisher.publishNow(req.user.username); audit(req, 'github.published', out.commit); res.json(out); }
    catch (e) { audit(req, 'github.publish_failed', null, { error: e.message }); throw E.badRequest(`Publishing failed: ${e.message}`); }
  });

  return r;
}

function serializeAudit(a) { return { id: a.id, at: a.at, actor: a.actor_name, actorId: a.actor_id, action: a.action, target: a.target, details: json.parse(a.details, null), ip: a.ip }; }

module.exports = { createOwnerSystemRoutes };
