'use strict';
const crypto = require('crypto');
const { json, now, today } = require('../database/db');
const { E, randomToken, sha256 } = require('../services/core');

const DEFAULT_PRIVACY = { profile: 'public', onlineStatus: true, allowMessages: 'everyone', allowFriendRequests: true };
const ONLINE_MS = 120 * 1000;

function createSessions(ctx) {
  const { db, settings } = ctx;
  const touched = new Map(); // sessionId -> last write ms (throttle writes)

  function create(user, scope, req, client, deviceId) {
    const ttlH = settings.get().sessionTtlHours[scope === 'owner' ? 'owner' : 'user'];
    const token = randomToken(32);
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + ttlH * 3600 * 1000).toISOString();
    db.run('INSERT INTO sessions (id, user_id, token_hash, scope, client, ip, user_agent, created_at, last_seen_at, expires_at, device_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      id, user.id, sha256(token), scope, client || null, req.ip, String(req.get('user-agent') || '').slice(0, 300), now(), now(), expiresAt, deviceId || null);
    return { token, expiresAt, id };
  }

  function resolve(token) {
    if (!token || token.length > 200) return null;
    const s = db.get('SELECT * FROM sessions WHERE token_hash = ?', sha256(token));
    if (!s || s.revoked_at || s.expires_at < now()) return null;
    const u = db.get('SELECT * FROM users WHERE id = ?', s.user_id);
    if (!u || u.status !== 'active') return null;
    return { session: s, user: u };
  }

  function touch(s, userId) {
    const last = touched.get(s.id) || 0;
    if (Date.now() - last < 60000) return;
    touched.set(s.id, Date.now());
    db.run('UPDATE sessions SET last_seen_at = ? WHERE id = ?', now(), s.id);
    db.run('UPDATE users SET last_seen_at = ? WHERE id = ?', now(), userId);
    db.run('INSERT INTO daily_activity (user_id, date) VALUES (?, ?) ON CONFLICT DO NOTHING', userId, today());
  }

  const revokeAll = (userId, exceptId) => db.run('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND id != ?', now(), userId, exceptId || '');
  const revoke = (id) => db.run('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', now(), id);

  return { create, resolve, touch, revoke, revokeAll };
}

/* ---------- serialization ---------- */
function isOnline(u) { return !!(u.last_seen_at && Date.now() - Date.parse(u.last_seen_at) < ONLINE_MS); }

function publicUser(u, { showPresence = true } = {}) {
  if (!u) return null;
  const privacy = { ...DEFAULT_PRIVACY, ...json.parse(u.privacy, {}) };
  const out = {
    id: u.id, username: u.username, displayName: u.display_name, avatarUrl: u.avatar_url || null,
    role: u.role, bio: u.bio || '', createdAt: u.created_at,
  };
  if (showPresence && privacy.onlineStatus) {
    const online = isOnline(u);
    out.online = online;
    out.status = online ? (u.presence_status || 'online') : 'offline';
    if (online && u.presence_activity) out.activity = u.presence_activity;
  }
  return out;
}

function meUser(u) {
  return {
    ...publicUser(u),
    email: u.email || null,
    twoFactorEnabled: !!u.totp_enabled,
    privacy: { ...DEFAULT_PRIVACY, ...json.parse(u.privacy, {}) },
    restrictions: activeRestrictions(u),
  };
}

function activeRestrictions(u) {
  const r = { chat: false, upload: false, until: null, ...json.parse(u.restrictions, {}) };
  if (r.until && r.until < now()) return { chat: false, upload: false, until: null };
  return r;
}

module.exports = { createSessions, publicUser, meUser, activeRestrictions, DEFAULT_PRIVACY, isOnline };
