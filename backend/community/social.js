'use strict';
const express = require('express');
const { s } = require('../../shared/utilities/schema');
const { json, now } = require('../database/db');
const { E, check } = require('../services/core');
const { publicUser, activeRestrictions, DEFAULT_PRIVACY } = require('../auth/sessions');

function createSocialHelpers(db) {
  const pair = (a, b) => (a < b ? [a, b] : [b, a]);
  const areFriends = (a, b) => { const [x, y] = pair(a, b); return !!db.get('SELECT 1 AS ok FROM friendships WHERE user_a = ? AND user_b = ?', x, y); };
  const isBlocked = (a, b) => !!db.get('SELECT 1 AS ok FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)', a, b, b, a);
  const privacy = (u) => ({ ...DEFAULT_PRIVACY, ...json.parse(u.privacy, {}) });
  const notify = (userId, type, title, body, link) => db.run('INSERT INTO notifications (user_id, type, title, body, link, created_at) VALUES (?,?,?,?,?,?)', userId, type, title, body || '', link || null, now());
  const userByName = (username) => db.get("SELECT * FROM users WHERE username = ? AND status = 'active'", username);
  /** Presence is only revealed to the user themself, friends, or everyone if the profile is public. */
  const viewUser = (u, viewerId) => {
    const p = privacy(u);
    const allowed = viewerId === u.id || (p.onlineStatus && (p.profile === 'public' || areFriends(u.id, viewerId)));
    return publicUser(u, { showPresence: allowed });
  };
  return { pair, areFriends, isBlocked, privacy, notify, userByName, viewUser };
}

function createSocialRoutes(ctx) {
  const { db, mw, settings, rate } = ctx;
  const h = createSocialHelpers(db);
  const users = express.Router();
  const social = express.Router();
  const misc = express.Router();
  users.use(mw.requireUser); social.use(mw.requireUser); misc.use(mw.requireUser);
  const msgLimit = (req) => rate(`msg:${req.user.id}`, 30, 60000);
  const chatRestricted = (req) => { if (activeRestrictions(req.user).chat) throw E.forbidden('Chat is restricted on your account'); if (!settings.get().communityChat) throw E.forbidden('Community chat is currently disabled'); };

  /* ---------- users ---------- */
  users.get('/search', (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ items: [] });
    const like = `%${q.replace(/[%_\\]/g, (m) => '\\' + m)}%`;
    const rows = db.all("SELECT * FROM users WHERE status = 'active' AND (username LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\') AND id != ? ORDER BY username LIMIT 40", like, like, req.user.id)
      .filter((u) => !h.isBlocked(req.user.id, u.id) && h.privacy(u).profile !== 'private').slice(0, 20);
    res.json({ items: rows.map((u) => h.viewUser(u, req.user.id)) });
  });

  users.get('/:username', (req, res) => {
    const u = h.userByName(req.params.username);
    if (!u) throw E.notFound('User not found');
    const me = req.user.id;
    let friendship = 'none';
    if (u.id === me) friendship = 'self';
    else if (h.isBlocked(me, u.id)) friendship = 'blocked';
    else if (h.areFriends(me, u.id)) friendship = 'friends';
    else if (db.get('SELECT 1 AS ok FROM friend_requests WHERE from_id = ? AND to_id = ?', me, u.id)) friendship = 'outgoing';
    else if (db.get('SELECT 1 AS ok FROM friend_requests WHERE from_id = ? AND to_id = ?', u.id, me)) friendship = 'incoming';
    const p = h.privacy(u);
    const visible = u.id === me || p.profile === 'public' || (p.profile === 'friends' && friendship === 'friends');
    if (friendship === 'blocked' && u.id !== me) throw E.notFound('User not found');
    const user = visible ? h.viewUser(u, me) : { id: u.id, username: u.username, displayName: u.display_name, avatarUrl: null, role: u.role, bio: '', createdAt: u.created_at, private: true };
    const items = visible ? ctx.items.listByAuthor(u.id, me) : [];
    res.json({ user, friendship, items });
  });

  /* ---------- presence ---------- */
  misc.post('/presence', (req, res) => {
    const b = check(s.object({ status: s.enum(['online', 'in-game', 'away']), activity: s.optional(s.nullable(s.string({ max: 60 })), null) }), req.body);
    db.run('UPDATE users SET presence_status = ?, presence_activity = ?, last_seen_at = ? WHERE id = ?', b.status, b.activity, now(), req.user.id);
    res.json({ ok: true });
  });

  /* ---------- friends ---------- */
  social.get('/friends', (req, res) => {
    const me = req.user.id;
    const friends = db.all('SELECT * FROM friendships WHERE user_a = ? OR user_b = ? ORDER BY created_at DESC', me, me).map((f) => {
      const other = db.get('SELECT * FROM users WHERE id = ?', f.user_a === me ? f.user_b : f.user_a);
      return other && other.status === 'active' ? { user: h.viewUser(other, me), since: f.created_at } : null;
    }).filter(Boolean);
    friends.sort((a, b) => (b.user.online ? 1 : 0) - (a.user.online ? 1 : 0));
    const reqs = (sql, col) => db.all(sql, me).map((r) => ({ id: r.id, user: publicUser(db.get('SELECT * FROM users WHERE id = ?', r[col]), { showPresence: false }), createdAt: r.created_at })).filter((x) => x.user);
    res.json({
      friends,
      incoming: reqs('SELECT * FROM friend_requests WHERE to_id = ? ORDER BY created_at DESC', 'from_id'),
      outgoing: reqs('SELECT * FROM friend_requests WHERE from_id = ? ORDER BY created_at DESC', 'to_id'),
    });
  });

  social.post('/friends/requests', (req, res) => {
    rate(`friendreq:${req.user.id}`, 30, 3600000);
    const { username } = check(s.object({ username: s.string({ min: 1, max: 40 }) }), req.body);
    const other = h.userByName(username);
    const me = req.user.id;
    if (!other || other.id === me) throw E.notFound('User not found');
    if (h.isBlocked(me, other.id)) throw E.forbidden('You cannot send a request to this user');
    if (h.areFriends(me, other.id)) throw E.conflict('You are already friends');
    if (!h.privacy(other).allowFriendRequests) throw E.forbidden('This user does not accept friend requests');
    const reverse = db.get('SELECT * FROM friend_requests WHERE from_id = ? AND to_id = ?', other.id, me);
    if (reverse) {
      const [a, b] = h.pair(me, other.id);
      db.tx(() => { db.run('INSERT INTO friendships (user_a, user_b, created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING', a, b, now()); db.run('DELETE FROM friend_requests WHERE id = ?', reverse.id); });
      h.notify(other.id, 'friend_accepted', `${req.user.display_name} accepted your friend request`, '', `polaris://social/profile/${req.user.username}`);
      return res.json({ request: null, friends: true });
    }
    try { db.run('INSERT INTO friend_requests (from_id, to_id, created_at) VALUES (?,?,?)', me, other.id, now()); }
    catch { throw E.conflict('Request already sent'); }
    h.notify(other.id, 'friend_request', `${req.user.display_name} sent you a friend request`, '', 'polaris://social/requests');
    res.status(201).json({ request: { toUser: publicUser(other, { showPresence: false }) }, friends: false });
  });

  social.post('/friends/requests/:id/accept', (req, res) => {
    const fr = db.get('SELECT * FROM friend_requests WHERE id = ? AND to_id = ?', parseInt(req.params.id, 10) || 0, req.user.id);
    if (!fr) throw E.notFound('Request not found');
    const [a, b] = h.pair(fr.from_id, fr.to_id);
    db.tx(() => { db.run('INSERT INTO friendships (user_a, user_b, created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING', a, b, now()); db.run('DELETE FROM friend_requests WHERE id = ?', fr.id); });
    h.notify(fr.from_id, 'friend_accepted', `${req.user.display_name} accepted your friend request`, '', `polaris://social/profile/${req.user.username}`);
    res.json({ ok: true });
  });
  social.post('/friends/requests/:id/decline', (req, res) => {
    const r = db.run('DELETE FROM friend_requests WHERE id = ? AND (to_id = ? OR from_id = ?)', parseInt(req.params.id, 10) || 0, req.user.id, req.user.id);
    if (!r.changes) throw E.notFound('Request not found');
    res.json({ ok: true });
  });
  social.delete('/friends/:userId', (req, res) => {
    const [a, b] = h.pair(req.user.id, parseInt(req.params.userId, 10) || 0);
    db.run('DELETE FROM friendships WHERE user_a = ? AND user_b = ?', a, b);
    res.json({ ok: true });
  });

  /* ---------- blocks ---------- */
  social.get('/blocks', (req, res) => {
    res.json({ items: db.all('SELECT u.* FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = ? ORDER BY b.created_at DESC', req.user.id).map((u) => publicUser(u, { showPresence: false })) });
  });
  social.post('/blocks', (req, res) => {
    const { username } = check(s.object({ username: s.string({ min: 1, max: 40 }) }), req.body);
    const other = db.get('SELECT * FROM users WHERE username = ?', username);
    if (!other || other.id === req.user.id) throw E.notFound('User not found');
    if (other.role === 'owner') throw E.forbidden('The project owner cannot be blocked');
    const [a, b] = h.pair(req.user.id, other.id);
    db.tx(() => {
      db.run('INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING', req.user.id, other.id, now());
      db.run('DELETE FROM friendships WHERE user_a = ? AND user_b = ?', a, b);
      db.run('DELETE FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)', req.user.id, other.id, other.id, req.user.id);
    });
    res.json({ ok: true });
  });
  social.delete('/blocks/:userId', (req, res) => { db.run('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?', req.user.id, parseInt(req.params.userId, 10) || 0); res.json({ ok: true }); });

  /* ---------- direct messages ---------- */
  social.get('/conversations', (req, res) => {
    const me = req.user.id;
    const rows = db.all(`SELECT CASE WHEN from_id = ? THEN to_id ELSE from_id END AS other, MAX(id) AS last_id FROM messages WHERE from_id = ? OR to_id = ? GROUP BY other ORDER BY last_id DESC LIMIT 50`, me, me, me);
    const items = rows.map((r) => {
      const other = db.get('SELECT * FROM users WHERE id = ?', r.other);
      if (!other || h.isBlocked(me, other.id)) return null;
      const last = db.get('SELECT * FROM messages WHERE id = ?', r.last_id);
      const unread = db.get('SELECT COUNT(*) AS n FROM messages WHERE from_id = ? AND to_id = ? AND read_at IS NULL', other.id, me).n;
      return { user: h.viewUser(other, me), lastMessage: { body: last.body, at: last.created_at, fromMe: last.from_id === me }, unread };
    }).filter(Boolean);
    res.json({ items });
  });

  social.get('/messages/:username', (req, res) => {
    const other = h.userByName(req.params.username);
    if (!other) throw E.notFound('User not found');
    const me = req.user.id;
    const after = parseInt(req.query.after, 10) || 0;
    const rows = after
      ? db.all('SELECT * FROM messages WHERE ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)) AND id > ? ORDER BY id ASC LIMIT 100', me, other.id, other.id, me, after)
      : db.all('SELECT * FROM (SELECT * FROM messages WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?) ORDER BY id DESC LIMIT 100) ORDER BY id ASC', me, other.id, other.id, me);
    db.run('UPDATE messages SET read_at = ? WHERE from_id = ? AND to_id = ? AND read_at IS NULL', now(), other.id, me);
    res.json({ items: rows.map((m) => ({ id: m.id, from: m.from_id, to: m.to_id, body: m.body, createdAt: m.created_at, read: !!m.read_at })) });
  });

  social.post('/messages/:username', (req, res) => {
    msgLimit(req); chatRestricted(req);
    const { body } = check(s.object({ body: s.string({ min: 1, max: 1000 }) }), req.body);
    const other = h.userByName(req.params.username);
    const me = req.user.id;
    if (!other || other.id === me) throw E.notFound('User not found');
    if (h.isBlocked(me, other.id)) throw E.forbidden('You cannot message this user');
    const p = h.privacy(other);
    if (p.allowMessages === 'nobody' || (p.allowMessages === 'friends' && !h.areFriends(me, other.id))) throw E.forbidden('This user only accepts messages from friends');
    const { id } = db.run('INSERT INTO messages (from_id, to_id, body, created_at) VALUES (?,?,?,?)', me, other.id, body.trim(), now());
    const m = db.get('SELECT * FROM messages WHERE id = ?', id);
    res.status(201).json({ message: { id: m.id, from: m.from_id, to: m.to_id, body: m.body, createdAt: m.created_at, read: false } });
  });

  /* ---------- groups / community chat ---------- */
  const serializeGroup = (g) => ({
    id: g.id, slug: g.slug, name: g.name, description: g.description, visibility: g.visibility, official: !!g.official, createdAt: g.created_at,
    members: db.get('SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?', g.id).n,
    owner: g.owner_id ? publicUser(db.get('SELECT * FROM users WHERE id = ?', g.owner_id), { showPresence: false }) : null,
  });
  const member = (gid, uid) => db.get('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?', gid, uid);
  const groupById = (id) => db.get('SELECT * FROM community_groups WHERE id = ?', parseInt(id, 10) || 0);

  social.get('/groups', (req, res) => {
    const joined = db.all('SELECT group_id FROM group_members WHERE user_id = ?', req.user.id).map((r) => r.group_id);
    const rows = db.all("SELECT * FROM community_groups ORDER BY official DESC, id ASC").filter((g) => g.visibility === 'public' || joined.includes(g.id));
    res.json({ items: rows.map(serializeGroup), joined });
  });
  social.post('/groups', (req, res) => {
    rate(`group:${req.user.id}`, 5, 86400000);
    const b = check(s.object({ name: s.string({ min: 3, max: 40 }), description: s.optional(s.string({ max: 300 }), ''), visibility: s.optional(s.enum(['public', 'private']), 'public') }), req.body);
    const slug = b.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'group';
    if (db.get('SELECT id FROM community_groups WHERE slug = ?', slug)) throw E.conflict('A group with that name exists');
    const id = db.tx(() => {
      const { id } = db.run('INSERT INTO community_groups (slug, name, description, visibility, owner_id, created_at) VALUES (?,?,?,?,?,?)', slug, b.name, b.description, b.visibility, req.user.id, now());
      db.run("INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?,?,'owner',?)", id, req.user.id, now());
      return id;
    });
    res.status(201).json({ group: serializeGroup(groupById(id)) });
  });
  social.post('/groups/:id/join', (req, res) => {
    const g = groupById(req.params.id);
    if (!g || g.visibility !== 'public') throw E.notFound('Group not found');
    db.run("INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?,?,'member',?) ON CONFLICT DO NOTHING", g.id, req.user.id, now());
    res.json({ ok: true });
  });
  social.post('/groups/:id/leave', (req, res) => {
    const g = groupById(req.params.id);
    if (!g) throw E.notFound('Group not found');
    db.run('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', g.id, req.user.id);
    res.json({ ok: true });
  });
  social.get('/groups/:id/messages', (req, res) => {
    const g = groupById(req.params.id);
    if (!g || (g.visibility !== 'public' && !member(g.id, req.user.id))) throw E.notFound('Group not found');
    const after = parseInt(req.query.after, 10) || 0;
    const blocked = new Set(db.all('SELECT blocked_id FROM blocks WHERE blocker_id = ?', req.user.id).map((r) => r.blocked_id));
    const rows = after
      ? db.all('SELECT * FROM group_messages WHERE group_id = ? AND id > ? ORDER BY id ASC LIMIT 100', g.id, after)
      : db.all('SELECT * FROM (SELECT * FROM group_messages WHERE group_id = ? ORDER BY id DESC LIMIT 100) ORDER BY id ASC', g.id);
    const cache = new Map();
    const u = (id) => { if (!cache.has(id)) cache.set(id, publicUser(db.get('SELECT * FROM users WHERE id = ?', id), { showPresence: false })); return cache.get(id); };
    res.json({ items: rows.filter((m) => !blocked.has(m.user_id)).map((m) => ({ id: m.id, user: u(m.user_id), body: m.body, createdAt: m.created_at })) });
  });
  social.post('/groups/:id/messages', (req, res) => {
    msgLimit(req); chatRestricted(req);
    const g = groupById(req.params.id);
    if (!g) throw E.notFound('Group not found');
    if (!member(g.id, req.user.id)) {
      if (g.slug === 'lobby') db.run("INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?,?,'member',?) ON CONFLICT DO NOTHING", g.id, req.user.id, now());
      else throw E.forbidden('Join the group to post');
    }
    const { body } = check(s.object({ body: s.string({ min: 1, max: 1000 }) }), req.body);
    const { id } = db.run('INSERT INTO group_messages (group_id, user_id, body, created_at) VALUES (?,?,?,?)', g.id, req.user.id, body.trim(), now());
    res.status(201).json({ message: { id, user: publicUser(req.user, { showPresence: false }), body: body.trim(), createdAt: now() } });
  });

  /* ---------- notifications ---------- */
  misc.get('/notifications', (req, res) => {
    const onlyUnread = req.query.unread === '1';
    const rows = db.all(`SELECT * FROM notifications WHERE user_id = ? ${onlyUnread ? 'AND read = 0' : ''} ORDER BY id DESC LIMIT 50`, req.user.id);
    res.json({
      items: rows.map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, read: !!n.read, createdAt: n.created_at })),
      unread: db.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0', req.user.id).n,
    });
  });
  misc.post('/notifications/read', (req, res) => {
    const b = req.body || {};
    if (b.all === true) db.run('UPDATE notifications SET read = 1 WHERE user_id = ?', req.user.id);
    else {
      const { ids } = check(s.object({ ids: s.array(s.int({ min: 1 }), { max: 100 }) }), b);
      for (const id of ids) db.run('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?', id, req.user.id);
    }
    res.json({ ok: true });
  });

  /* ---------- reports ---------- */
  misc.post('/reports', (req, res) => {
    rate(`report:${req.user.id}`, 20, 3600000);
    const b = check(s.object({
      targetType: s.enum(['user', 'message', 'group_message', 'item', 'comment']), targetId: s.int({ min: 1 }),
      reason: s.enum(['spam', 'abuse', 'cheating', 'copyright', 'inappropriate', 'other']), details: s.optional(s.string({ max: 2000 }), ''),
    }), req.body);
    const table = { user: 'users', message: 'messages', group_message: 'group_messages', item: 'items', comment: 'comments' }[b.targetType];
    if (!db.get(`SELECT id FROM ${table} WHERE id = ?`, b.targetId)) throw E.notFound('Reported content not found');
    if (b.targetType === 'message') {
      const m = db.get('SELECT * FROM messages WHERE id = ?', b.targetId);
      if (m.to_id !== req.user.id && m.from_id !== req.user.id) throw E.forbidden('You can only report messages in your own conversations');
    }
    const { id } = db.run('INSERT INTO reports (reporter_id, target_type, target_id, reason, details, created_at) VALUES (?,?,?,?,?,?)', req.user.id, b.targetType, b.targetId, b.reason, b.details, now());
    res.status(201).json({ id, status: 'open' });
  });

  return { users, social, misc, helpers: h };
}

module.exports = { createSocialRoutes, createSocialHelpers };
