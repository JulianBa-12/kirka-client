'use strict';
/**
 * Cross-cutting services: logger (ring buffer + file), HTTP errors, input
 * validation helper, in-memory rate limiter, runtime settings and audit log.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { validate } = require('../../shared/utilities/schema');
const { json, now } = require('../database/db');

/* ---------------- logger ---------------- */
function createLogger(logsDir) {
  fs.mkdirSync(logsDir, { recursive: true });
  const file = path.join(logsDir, 'server.log');
  const ring = [];
  function write(level, msg, meta) {
    const entry = { at: now(), level, msg: String(msg), meta: meta || null };
    ring.push(entry); if (ring.length > 2000) ring.shift();
    const line = JSON.stringify(entry);
    (level === 'error' ? process.stderr : process.stdout).write(`[${entry.at}] ${level.toUpperCase()} ${entry.msg}${meta ? ' ' + JSON.stringify(meta) : ''}\n`);
    try {
      if (fs.existsSync(file) && fs.statSync(file).size > 5 * 1024 * 1024) fs.renameSync(file, file + '.1');
      fs.appendFileSync(file, line + '\n');
    } catch { /* logging must never crash the server */ }
  }
  return {
    info: (m, meta) => write('info', m, meta),
    warn: (m, meta) => write('warn', m, meta),
    error: (m, meta) => write('error', m, meta),
    entries: (level, limit = 200) => {
      const order = { info: 0, warn: 1, error: 2 };
      const min = order[level] ?? 0;
      return ring.filter((e) => order[e.level] >= min).slice(-limit).reverse();
    },
  };
}

/* ---------------- errors ---------------- */
class HttpError extends Error {
  constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; }
}
const E = {
  badRequest: (m, d) => new HttpError(400, 'bad_request', m, d),
  unauthorized: (m = 'Authentication required') => new HttpError(401, 'unauthorized', m),
  forbidden: (m = 'You do not have permission to do that') => new HttpError(403, 'forbidden', m),
  notFound: (m = 'Not found') => new HttpError(404, 'not_found', m),
  conflict: (m) => new HttpError(409, 'conflict', m),
  invalid: (details, m = 'Validation failed') => new HttpError(422, 'validation_failed', m, details),
  tooLarge: (m = 'Payload too large') => new HttpError(413, 'payload_too_large', m),
  rateLimited: () => new HttpError(429, 'rate_limited', 'Too many requests, slow down'),
};

/** Validate request input against a shared schema; throws 422 with details. */
function check(schema, value) {
  const r = validate(schema, value ?? {});
  if (!r.ok) throw E.invalid(r.errors);
  return r.value;
}

/* ---------------- rate limiter ---------------- */
function createRateLimiter() {
  const buckets = new Map();
  setInterval(() => { const t = Date.now(); for (const [k, b] of buckets) if (b.reset < t) buckets.delete(k); }, 60000).unref();
  function hit(key, limit, windowMs) {
    const t = Date.now();
    let b = buckets.get(key);
    if (!b || b.reset < t) { b = { count: 0, reset: t + windowMs }; buckets.set(key, b); }
    b.count++;
    if (b.count > limit) throw E.rateLimited();
  }
  hit.reset = () => buckets.clear();
  return hit;
}

/* ---------------- runtime settings ---------------- */
const DEFAULT_SETTINGS = {
  maintenance: false,
  maintenanceMessage: 'Polaris services are being updated. Please check back shortly.',
  registrationOpen: true,
  rateLimits: { auth: 10, api: 240, upload: 20 },
  uploadLimits: { maxBytes: 8 * 1024 * 1024, maxAvatarBytes: 1024 * 1024 },
  sessionTtlHours: { user: 24 * 30, owner: 12 },
  communityChat: true,
};

function createSettings(db) {
  let cache = null;
  function load() {
    const out = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    for (const row of db.all('SELECT key, value FROM settings')) {
      if (row.key in out) out[row.key] = json.parse(row.value, out[row.key]);
    }
    cache = out; return out;
  }
  return {
    get: () => cache || load(),
    update(patch) {
      db.tx(() => {
        for (const [k, v] of Object.entries(patch)) {
          if (!(k in DEFAULT_SETTINGS)) continue;
          db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', k, JSON.stringify(v));
        }
      });
      return load();
    },
  };
}

/* ---------------- audit ---------------- */
function createAudit(db) {
  return function audit(req, action, target, details) {
    const u = req && req.user;
    db.run('INSERT INTO audit_log (at, actor_id, actor_name, action, target, details, ip) VALUES (?, ?, ?, ?, ?, ?, ?)',
      now(), u ? u.id : null, u ? u.username : 'system', action, target == null ? null : String(target), details ? JSON.stringify(details).slice(0, 4000) : null, req ? req.ip : null);
  };
}

const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

module.exports = { createLogger, HttpError, E, check, createRateLimiter, createSettings, DEFAULT_SETTINGS, createAudit, randomToken, sha256 };
