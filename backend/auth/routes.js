'use strict';
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const { s } = require('../../shared/utilities/schema');
const { json, now } = require('../database/db');
const { E, check, sha256 } = require('../services/core');
const { hashPassword, verifyPassword, DUMMY_HASH, verifyTotp, newTotpSecret } = require('./crypto');
const { meUser, DEFAULT_PRIVACY } = require('./sessions');

const USERNAME = s.string({ min: 3, max: 20, pattern: /^[a-zA-Z0-9_]+$/ });
const PASSWORD = s.string({ min: 10, max: 200 });
const CLIENT = s.optional(s.enum(['client', 'website', 'owner']), 'website');

const RESERVED = new Set(['admin', 'owner', 'polaris', 'system', 'moderator', 'support', 'kirka', 'root', 'staff']);

function weakPassword(pw, username) {
  if (pw.toLowerCase().includes(username.toLowerCase())) return 'must not contain the username';
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter((r) => r.test(pw)).length;
  if (classes < 2) return 'must mix at least two of: lowercase, uppercase, digits, symbols';
  if (/^(.)\1+$/.test(pw)) return 'is too repetitive';
  return null;
}

function createAuthRoutes(ctx) {
  const { db, sessions, settings, rate, audit, log, storage, mw } = ctx;
  const r = express.Router();
  const authLimit = (req) => rate(`auth:${req.ip}`, settings.get().rateLimits.auth, 60000);

  function recordLogin(user, username, req, success, reason, scope) {
    db.run('INSERT INTO login_history (user_id, username, at, ip, user_agent, success, reason, scope) VALUES (?,?,?,?,?,?,?,?)',
      user ? user.id : null, username, now(), req.ip, String(req.get('user-agent') || '').slice(0, 300), success ? 1 : 0, reason || null, scope);
  }

  /** Shared credential check for user and owner logins. Returns the user row or throws. */
  function verifyCredentials(req, body, scope) {
    const user = db.get('SELECT * FROM users WHERE username = ?', body.username);
    const ok = verifyPassword(body.password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) { recordLogin(user, body.username, req, false, 'bad_credentials', scope); throw E.unauthorized('Wrong username or password'); }
    if (user.status !== 'active') { recordLogin(user, body.username, req, false, 'disabled', scope); throw E.forbidden('This account is disabled'); }
    if (user.totp_enabled) {
      if (!body.totp) { const e = E.unauthorized('Enter the code from your authenticator app'); e.code = 'totp_required'; throw e; }
      let passed = verifyTotp(user.totp_secret, body.totp);
      if (!passed) {
        // recovery codes are single-use
        const codes = json.parse(user.recovery_codes, []);
        const h = sha256(String(body.totp).replace(/[\s-]+/g, '').toUpperCase());
        if (codes.includes(h)) { passed = true; db.run('UPDATE users SET recovery_codes = ? WHERE id = ?', JSON.stringify(codes.filter((c) => c !== h)), user.id); }
      }
      if (!passed) { recordLogin(user, body.username, req, false, 'bad_totp', scope); const e = E.unauthorized('The authenticator code is not valid'); e.code = 'totp_required'; throw e; }
    }
    return user;
  }

  r.post('/register', (req, res) => {
    authLimit(req);
    const st = settings.get();
    if (!st.registrationOpen) throw E.forbidden('Registration is currently closed');
    const body = check(s.object({ username: USERNAME, password: PASSWORD, email: s.optional(s.nullable(s.string({ max: 200, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }))), client: CLIENT }), req.body);
    if (RESERVED.has(body.username.toLowerCase())) throw E.invalid([{ path: 'username', message: 'is reserved' }]);
    const weak = weakPassword(body.password, body.username);
    if (weak) throw E.invalid([{ path: 'password', message: weak }]);
    if (db.get('SELECT id FROM users WHERE username = ?', body.username)) throw E.conflict('That username is taken');
    const id = db.tx(() => {
      const { id } = db.run('INSERT INTO users (username, display_name, email, password_hash, privacy, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
        body.username, body.username, body.email || null, hashPassword(body.password), JSON.stringify(DEFAULT_PRIVACY), now(), now());
      const lobby = db.get("SELECT id FROM community_groups WHERE slug = 'lobby'");
      if (lobby) db.run('INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?,?,?,?) ON CONFLICT DO NOTHING', lobby.id, id, 'member', now());
      return id;
    });
    const user = db.get('SELECT * FROM users WHERE id = ?', id);
    const sess = sessions.create(user, 'user', req, body.client);
    recordLogin(user, user.username, req, true, 'register', 'user');
    log.info('user registered', { id, username: user.username });
    res.status(201).json({ token: sess.token, expiresAt: sess.expiresAt, user: meUser(user) });
  });

  r.post('/login', (req, res) => {
    authLimit(req);
    const body = check(s.object({ username: s.string({ min: 1, max: 40 }), password: s.string({ min: 1, max: 200 }), totp: s.optional(s.string({ max: 20 })), client: CLIENT }), req.body);
    const user = verifyCredentials(req, body, 'user');
    const sess = sessions.create(user, 'user', req, body.client);
    recordLogin(user, user.username, req, true, null, 'user');
    res.json({ token: sess.token, expiresAt: sess.expiresAt, user: meUser(user) });
  });

  r.post('/logout', mw.requireUser, (req, res) => { sessions.revoke(req.session.id); res.json({ ok: true }); });

  r.get('/me', mw.requireUser, (req, res) => res.json({ user: meUser(req.user) }));

  r.patch('/me', mw.requireUser, (req, res) => {
    const body = check(s.object({
      displayName: s.optional(s.string({ min: 1, max: 32 })),
      bio: s.optional(s.string({ max: 300 })),
      avatarUrl: s.optional(s.nullable(s.string({ max: 400, pattern: /^https:\/\/[^\s"'<>]+$/ }))),
      email: s.optional(s.nullable(s.string({ max: 200, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }))),
      privacy: s.optional(s.object({
        profile: s.enum(['public', 'friends', 'private']), onlineStatus: s.bool(),
        allowMessages: s.enum(['everyone', 'friends', 'nobody']), allowFriendRequests: s.bool(),
      })),
    }), req.body);
    const u = req.user;
    db.run('UPDATE users SET display_name = ?, bio = ?, avatar_url = ?, email = ?, privacy = ?, updated_at = ? WHERE id = ?',
      body.displayName ?? u.display_name, body.bio ?? u.bio, body.avatarUrl !== undefined ? body.avatarUrl : u.avatar_url,
      body.email !== undefined ? body.email : u.email, JSON.stringify(body.privacy ?? json.parse(u.privacy, DEFAULT_PRIVACY)), now(), u.id);
    res.json({ user: meUser(db.get('SELECT * FROM users WHERE id = ?', u.id)) });
  });

  r.post('/avatar', mw.requireUser, async (req, res) => {
    rate(`upload:${req.user.id}`, settings.get().rateLimits.upload, 3600000);
    const { files } = await storage.parseMultipart(req, { maxBytes: settings.get().uploadLimits.maxAvatarBytes, maxFiles: 1 });
    const f = files.file;
    if (!f) throw E.badRequest('file is required');
    const saved = storage.store(f.buffer, { allow: ['image/png', 'image/jpeg', 'image/webp'] });
    db.run('UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?', storage.url(saved.storageName), now(), req.user.id);
    res.json({ user: meUser(db.get('SELECT * FROM users WHERE id = ?', req.user.id)) });
  });

  r.post('/password', mw.requireUser, (req, res) => {
    authLimit(req);
    const body = check(s.object({ current: s.string({ min: 1, max: 200 }), next: PASSWORD }), req.body);
    if (!verifyPassword(body.current, req.user.password_hash)) throw E.unauthorized('Current password is wrong');
    const minLen = req.user.role === 'owner' ? 14 : 10;
    if (body.next.length < minLen) throw E.invalid([{ path: 'next', message: `must be at least ${minLen} characters` }]);
    const weak = weakPassword(body.next, req.user.username);
    if (weak) throw E.invalid([{ path: 'next', message: weak }]);
    db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', hashPassword(body.next), now(), req.user.id);
    sessions.revokeAll(req.user.id, req.session.id);
    audit(req, 'account.password_changed', req.user.id);
    res.json({ ok: true });
  });

  r.get('/sessions', mw.requireUser, (req, res) => {
    const items = db.all('SELECT * FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY last_seen_at DESC', req.user.id, now())
      .map((x) => ({ id: x.id, scope: x.scope, client: x.client, ip: x.ip, userAgent: x.user_agent, createdAt: x.created_at, lastSeenAt: x.last_seen_at, expiresAt: x.expires_at, current: x.id === req.session.id }));
    res.json({ items });
  });

  r.delete('/sessions/:id', mw.requireUser, (req, res) => {
    const sess = db.get('SELECT id FROM sessions WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
    if (!sess) throw E.notFound('Session not found');
    sessions.revoke(sess.id);
    audit(req, 'account.session_revoked', sess.id);
    res.json({ ok: true });
  });

  r.get('/login-history', mw.requireUser, (req, res) => {
    const items = db.all('SELECT at, ip, user_agent, success, reason, scope FROM login_history WHERE user_id = ? ORDER BY id DESC LIMIT 100', req.user.id)
      .map((x) => ({ at: x.at, ip: x.ip, userAgent: x.user_agent, success: !!x.success, reason: x.reason, scope: x.scope }));
    res.json({ items });
  });

  r.post('/2fa/setup', mw.requireUser, (req, res) => {
    if (req.user.totp_enabled) throw E.conflict('Two-factor authentication is already enabled');
    const secret = newTotpSecret();
    db.run('UPDATE users SET totp_pending = ? WHERE id = ?', secret, req.user.id);
    const label = encodeURIComponent(`Polaris:${req.user.username}`);
    res.json({ secret, otpauthUrl: `otpauth://totp/${label}?secret=${secret}&issuer=Polaris&algorithm=SHA1&digits=6&period=30` });
  });

  r.post('/2fa/enable', mw.requireUser, (req, res) => {
    const { code } = check(s.object({ code: s.string({ max: 10 }) }), req.body);
    const u = db.get('SELECT * FROM users WHERE id = ?', req.user.id);
    if (!u.totp_pending) throw E.badRequest('Start the setup first');
    if (!verifyTotp(u.totp_pending, code)) throw E.invalid([{ path: 'code', message: 'is not valid — check your device clock' }]);
    const recovery = Array.from({ length: 8 }, () => crypto.randomBytes(5).toString('hex').toUpperCase());
    db.run('UPDATE users SET totp_secret = ?, totp_pending = NULL, totp_enabled = 1, recovery_codes = ? WHERE id = ?', u.totp_pending, JSON.stringify(recovery.map(sha256)), u.id);
    audit(req, 'account.2fa_enabled', u.id);
    res.json({ ok: true, recoveryCodes: recovery });
  });

  r.post('/2fa/disable', mw.requireUser, (req, res) => {
    const body = check(s.object({ code: s.string({ max: 20 }), password: s.string({ min: 1, max: 200 }) }), req.body);
    const u = req.user;
    if (!u.totp_enabled) throw E.badRequest('Two-factor authentication is not enabled');
    if (!verifyPassword(body.password, u.password_hash) || !verifyTotp(u.totp_secret, body.code)) throw E.unauthorized('Password or code is wrong');
    if (u.role === 'owner' && settings.get().requireOwner2fa) throw E.forbidden('Owner two-factor authentication is required by system settings');
    db.run("UPDATE users SET totp_secret = NULL, totp_enabled = 0, recovery_codes = '[]' WHERE id = ?", u.id);
    audit(req, 'account.2fa_disabled', u.id);
    res.json({ ok: true });
  });

  r.get('/export', mw.requireUser, (req, res) => {
    const id = req.user.id;
    const data = {
      exportedAt: now(),
      account: meUser(req.user),
      sessions: db.all('SELECT id, scope, client, ip, user_agent, created_at, last_seen_at, expires_at FROM sessions WHERE user_id = ?', id),
      loginHistory: db.all('SELECT at, ip, user_agent, success, reason FROM login_history WHERE user_id = ?', id),
      items: db.all('SELECT id, kind, title, description, category, status, created_at FROM items WHERE author_id = ?', id),
      comments: db.all('SELECT item_id, body, created_at FROM comments WHERE user_id = ?', id),
      messagesSent: db.all('SELECT to_id, body, created_at FROM messages WHERE from_id = ?', id),
      groupMessages: db.all('SELECT group_id, body, created_at FROM group_messages WHERE user_id = ?', id),
      friends: db.all('SELECT user_a, user_b, created_at FROM friendships WHERE user_a = ? OR user_b = ?', id, id),
      feedback: db.all('SELECT type, title, body, created_at FROM feedback WHERE author_id = ?', id),
      cloud: db.all('SELECT key, data, updated_at FROM cloud WHERE user_id = ?', id).map((c) => ({ ...c, data: json.parse(c.data, null) })),
    };
    res.setHeader('Content-Disposition', `attachment; filename="polaris-data-${req.user.username}.json"`);
    res.json(data);
  });

  r.delete('/me', mw.requireUser, (req, res) => {
    const { password } = check(s.object({ password: s.string({ min: 1, max: 200 }) }), req.body);
    if (req.user.role === 'owner') throw E.forbidden('The owner account cannot be deleted from here');
    if (!verifyPassword(password, req.user.password_hash)) throw E.unauthorized('Password is wrong');
    db.run('DELETE FROM users WHERE id = ?', req.user.id);
    log.info('account deleted by user', { id: req.user.id });
    res.json({ ok: true });
  });

  return { router: r, verifyCredentials, recordLogin, weakPassword };
}

/* ---------------- owner auth (/owner/auth) ---------------- */
function createOwnerAuthRoutes(ctx, authApi) {
  const { db, sessions, settings, rate, audit, log, cfg } = ctx;
  const r = express.Router();
  const tokenFile = () => require('path').join(cfg.dataDir, 'owner-setup-token');
  const ownerExists = () => !!db.get("SELECT id FROM users WHERE role = 'owner'");

  r.get('/status', (_req, res) => res.json({ claimed: ownerExists(), require2fa: settings.get().requireOwner2fa }));

  r.post('/claim', (req, res) => {
    rate(`auth:${req.ip}`, settings.get().rateLimits.auth, 60000);
    if (ownerExists()) throw E.conflict('An owner account already exists');
    const body = check(s.object({ setupToken: s.string({ min: 20, max: 200 }), username: USERNAME, password: s.string({ min: 14, max: 200 }) }), req.body);
    let expected = '';
    try { expected = fs.readFileSync(tokenFile(), 'utf8').trim(); } catch { /* none */ }
    const a = Buffer.from(sha256(body.setupToken)); const b = Buffer.from(sha256(expected || crypto.randomBytes(16).toString('hex')));
    if (!expected || !crypto.timingSafeEqual(a, b)) { log.warn('owner claim with invalid setup token', { ip: req.ip }); throw E.unauthorized('Setup token is not valid'); }
    const weak = authApi.weakPassword(body.password, body.username);
    if (weak) throw E.invalid([{ path: 'password', message: weak }]);
    if (db.get('SELECT id FROM users WHERE username = ?', body.username)) throw E.conflict('That username is taken by a community account');
    const id = db.tx(() => db.run("INSERT INTO users (username, display_name, password_hash, role, privacy, created_at, updated_at) VALUES (?,?,?,'owner',?,?,?)",
      body.username, body.username, hashPassword(body.password), JSON.stringify({ ...DEFAULT_PRIVACY, onlineStatus: false }), now(), now()).id);
    try { fs.unlinkSync(tokenFile()); } catch { /* already gone */ }
    const user = db.get('SELECT * FROM users WHERE id = ?', id);
    req.user = user;
    audit(req, 'owner.claimed', id);
    log.info('owner account provisioned', { username: user.username });
    const sess = sessions.create(user, 'owner', req, 'owner');
    authApi.recordLogin(user, user.username, req, true, 'claim', 'owner');
    res.status(201).json({ token: sess.token, expiresAt: sess.expiresAt, user: meUser(user) });
  });

  r.post('/login', (req, res) => {
    rate(`auth:${req.ip}`, settings.get().rateLimits.auth, 60000);
    const body = check(s.object({ username: s.string({ min: 1, max: 40 }), password: s.string({ min: 1, max: 200 }), totp: s.optional(s.string({ max: 20 })) }), req.body);
    const user = authApi.verifyCredentials(req, body, 'owner');
    if (user.role !== 'owner') { authApi.recordLogin(user, user.username, req, false, 'not_owner', 'owner'); log.warn('non-owner attempted owner login', { username: user.username, ip: req.ip }); throw E.forbidden('This account is not the project owner'); }
    if (settings.get().requireOwner2fa && !user.totp_enabled) {
      // still allow login so the owner can enable 2FA, but flag it
      log.warn('owner login without 2FA while 2FA is required');
    }
    const sess = sessions.create(user, 'owner', req, 'owner');
    authApi.recordLogin(user, user.username, req, true, null, 'owner');
    req.user = user;
    audit(req, 'owner.login', user.id);
    res.json({ token: sess.token, expiresAt: sess.expiresAt, user: meUser(user), mustEnable2fa: settings.get().requireOwner2fa && !user.totp_enabled });
  });

  return r;
}

module.exports = { createAuthRoutes, createOwnerAuthRoutes };
