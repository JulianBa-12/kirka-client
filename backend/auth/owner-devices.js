'use strict';
/**
 * Owner connections (no login).
 *
 * Polaris Owner has no login screen. Instead, every installation of the Owner app
 * holds an Ed25519 private key ("owner connection"). The backend knows the
 * matching public keys (owner_devices). When the app starts it silently:
 *
 *   1. GET  /owner/auth/challenge          → single-use nonce (2 minutes)
 *   2. POST /owner/auth/connect            → { deviceId, nonce, signature }
 *   3. receives an owner-scope session that is bound to that device.
 *
 * Signed message: "polaris-owner-device/1|connect|<nonce>|<deviceId>"
 *
 * There is no password, username or token the owner has to type, and there is no
 * way to obtain owner rights without a registered private key: no claim endpoint,
 * no password login, no "I am the owner" flag. The first connection is created on
 * the server (first start, or `npm run owner:connection`), i.e. by whoever controls
 * the server. Further computers are added from a connected Owner app (the new key
 * pair is generated locally) or with the server CLI. Revoking a device ends its
 * sessions immediately.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { now } = require('../database/db');
const { E } = require('../services/core');

const CHALLENGE_TTL_MS = 2 * 60 * 1000;
const CONNECTION_FORMAT = 'polaris-owner-connection/1';
const DEVICE_ID = /^[a-f0-9]{16}$/;

const deviceMessage = (nonce, deviceId) => Buffer.from(`polaris-owner-device/1|connect|${nonce}|${deviceId}`, 'utf8');
const keyId = (der) => crypto.createHash('sha256').update(der).digest('hex').slice(0, 16);
const cleanName = (name) => String(name || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 60) || 'Polaris Owner';

/** Parses a base64 SPKI DER Ed25519 public key. Throws 422 when it is not one. */
function parsePublicKey(b64) {
  const der = Buffer.from(String(b64 || ''), 'base64');
  let key = null;
  if (der.length === 44) { try { key = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' }); } catch { key = null; } }
  if (!key || key.asymmetricKeyType !== 'ed25519') throw E.invalid([{ path: 'publicKey', message: 'must be a base64 Ed25519 SPKI public key' }]);
  return { key, der, id: keyId(der) };
}

/** The single owner account. It has no usable password: owner access only works through device keys. */
function ensureOwnerUser(db, hashPassword) {
  const row = db.get("SELECT * FROM users WHERE role = 'owner'");
  if (row) return row;
  const id = db.run("INSERT INTO users (username, display_name, password_hash, role, privacy, created_at, updated_at) VALUES ('owner', 'Polaris Owner', ?, 'owner', ?, ?, ?)",
    hashPassword(crypto.randomBytes(48).toString('base64url')), JSON.stringify({ profile: 'public', onlineStatus: false, allowMessages: 'everyone', allowFriendRequests: false }), now(), now()).id;
  return db.get('SELECT * FROM users WHERE id = ?', id);
}

function registerDevice(db, userId, der, name, ip) {
  const id = keyId(der);
  db.run('INSERT INTO owner_devices (id, user_id, name, public_key, created_at, last_ip) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revoked_at = NULL, name = excluded.name',
    id, userId, cleanName(name), der.toString('base64'), now(), ip || null);
  return id;
}

/**
 * Creates a complete owner connection on the server: new key pair, registered
 * public key, and the connection document containing the private key. The caller
 * writes it to a file with mode 0600 for the owner.
 */
function createConnection(db, hashPassword, { backendUrl, name }) {
  const owner = ensureOwnerUser(db, hashPassword);
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const der = publicKey.export({ format: 'der', type: 'spki' });
  const deviceId = registerDevice(db, owner.id, der, name || 'Owner connection', null);
  return {
    format: CONNECTION_FORMAT,
    backendUrl: String(backendUrl || '').replace(/\/+$/, ''),
    deviceId,
    name: cleanName(name || 'Owner connection'),
    privateKey: privateKey.export({ format: 'pem', type: 'pkcs8' }),
    createdAt: now(),
  };
}

function writeConnectionFile(file, connection) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(connection, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function createOwnerDevices(ctx) {
  const { db } = ctx;
  const challenges = new Map(); // nonce -> expiry ms

  function issueChallenge() {
    const t = Date.now();
    for (const [n, exp] of challenges) if (exp < t) challenges.delete(n);
    if (challenges.size > 2000) throw E.rateLimited();
    const nonce = crypto.randomBytes(24).toString('base64url');
    challenges.set(nonce, t + CHALLENGE_TTL_MS);
    return { nonce, expiresAt: new Date(t + CHALLENGE_TTL_MS).toISOString() };
  }

  const fail = (code, message, status = 401) => { const e = status === 403 ? E.forbidden(message) : E.unauthorized(message); e.code = code; return e; };

  /** Verifies a connect proof and returns { user, device }. */
  function connect(proof) {
    const nonce = String(proof.nonce || '');
    const exp = challenges.get(nonce);
    challenges.delete(nonce);
    if (!exp || exp < Date.now()) throw fail('device_challenge', 'The connection challenge expired. Try again.');
    if (!DEVICE_ID.test(String(proof.deviceId || ''))) throw fail('device_unknown', 'Unknown owner device');
    const row = db.get('SELECT d.*, u.status AS user_status, u.role AS user_role FROM owner_devices d JOIN users u ON u.id = d.user_id WHERE d.id = ?', proof.deviceId);
    if (!row || row.user_role !== 'owner') throw fail('device_unknown', 'This owner connection is not registered on this backend', 403);
    if (row.revoked_at) throw fail('device_revoked', 'This owner connection was removed. Create a new one on the server or from another connected Owner app.', 403);
    if (row.user_status !== 'active') throw fail('device_unknown', 'The owner account is disabled', 403);
    const sig = Buffer.from(String(proof.signature || ''), 'base64');
    const key = crypto.createPublicKey({ key: Buffer.from(row.public_key, 'base64'), format: 'der', type: 'spki' });
    if (sig.length !== 64 || !crypto.verify(null, deviceMessage(nonce, row.id), key, sig)) throw fail('device_signature', 'The device signature is not valid');
    return { user: db.get('SELECT * FROM users WHERE id = ?', row.user_id), device: row };
  }

  function touch(deviceId, ip) { db.run('UPDATE owner_devices SET last_used_at = ?, last_ip = ? WHERE id = ?', now(), ip || null, deviceId); }

  function list(userId) {
    return db.all('SELECT id, name, created_at, last_used_at, last_ip, revoked_at FROM owner_devices WHERE user_id = ? ORDER BY revoked_at IS NOT NULL, created_at', userId)
      .map((d) => ({ id: d.id, name: d.name, createdAt: d.created_at, lastUsedAt: d.last_used_at, lastIp: d.last_ip, revokedAt: d.revoked_at }));
  }

  function add(userId, publicKeyB64, name, ip) {
    const parsed = parsePublicKey(publicKeyB64);
    const existing = db.get('SELECT id, revoked_at FROM owner_devices WHERE id = ?', parsed.id);
    if (existing && !existing.revoked_at) throw E.conflict('This key is already registered');
    return registerDevice(db, userId, parsed.der, name, ip);
  }

  function revoke(userId, id) {
    const row = db.get('SELECT * FROM owner_devices WHERE id = ? AND user_id = ?', id, userId);
    if (!row) throw E.notFound('Device not found');
    if (row.revoked_at) return false;
    const active = db.get('SELECT COUNT(*) AS n FROM owner_devices WHERE user_id = ? AND revoked_at IS NULL', userId).n;
    if (active <= 1) throw E.conflict('This is the last owner connection. Add another one first, or create a new one on the server with npm run owner:connection.');
    db.tx(() => {
      db.run('UPDATE owner_devices SET revoked_at = ? WHERE id = ?', now(), id);
      db.run('UPDATE sessions SET revoked_at = ? WHERE device_id = ? AND revoked_at IS NULL', now(), id);
    });
    return true;
  }

  function rename(userId, id, name) {
    const r = db.run('UPDATE owner_devices SET name = ? WHERE id = ? AND user_id = ?', cleanName(name), id, userId);
    if (!r.changes) throw E.notFound('Device not found');
  }

  /** requireOwner check: the session must belong to an active device of this owner. */
  function sessionDeviceActive(session, userId) {
    if (!session || !session.device_id) return false;
    return !!db.get('SELECT id FROM owner_devices WHERE id = ? AND user_id = ? AND revoked_at IS NULL', session.device_id, userId);
  }

  return { issueChallenge, connect, touch, list, add, revoke, rename, sessionDeviceActive };
}

/** /owner/devices… (mounted behind requireOwner) */
function createOwnerDeviceRoutes(ctx) {
  const express = require('express');
  const { s } = require('../../shared/utilities/schema');
  const { check } = require('../services/core');
  const { ownerDevices, audit } = ctx;
  const r = express.Router();

  r.get('/devices', (req, res) => {
    res.json({ items: ownerDevices.list(req.user.id).map((d) => ({ ...d, current: d.id === req.session.device_id })) });
  });
  // The Owner app generates the key pair locally and only sends the public key.
  r.post('/devices', (req, res) => {
    const body = check(s.object({ publicKey: s.string({ min: 40, max: 120 }), name: s.string({ min: 1, max: 60 }) }), req.body);
    const id = ownerDevices.add(req.user.id, body.publicKey, body.name, null);
    audit(req, 'owner.device.added', id, { name: body.name });
    res.status(201).json({ id });
  });
  r.patch('/devices/:id', (req, res) => {
    const body = check(s.object({ name: s.string({ min: 1, max: 60 }) }), req.body);
    ownerDevices.rename(req.user.id, req.params.id, body.name);
    audit(req, 'owner.device.renamed', req.params.id, { name: body.name });
    res.json({ ok: true });
  });
  r.delete('/devices/:id', (req, res) => {
    const changed = ownerDevices.revoke(req.user.id, req.params.id);
    if (changed) audit(req, 'owner.device.revoked', req.params.id);
    res.json({ ok: true, revoked: changed });
  });
  return r;
}

module.exports = {
  createOwnerDevices, createOwnerDeviceRoutes, createConnection, writeConnectionFile, ensureOwnerUser,
  parsePublicKey, deviceMessage, CONNECTION_FORMAT,
};
