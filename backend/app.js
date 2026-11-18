'use strict';
/** Builds the Express application and the shared service context. */
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Database, now } = require('./database/db');
const { migrate } = require('./database/migrations');
const { createLogger, HttpError, createRateLimiter, createSettings, createAudit, E } = require('./services/core');
const { createStorage } = require('./services/storage');
const { createConfigService, loadSigningKey } = require('./services/config-service');
const { createPublisher, createBackups, applyPendingRestore } = require('./services/publishing');
const { createSessions } = require('./auth/sessions');
const { createOwnerDevices, createOwnerDeviceRoutes, createConnection, writeConnectionFile } = require('./auth/owner-devices');
const { hashPassword } = require('./auth/crypto');
const { createAuthMiddleware } = require('./auth/middleware');
const { createAuthRoutes, createOwnerAuthRoutes } = require('./auth/routes');
const { createPublicRoutes, createCloudRoutes } = require('./api/public');
const { createSocialRoutes, createSocialHelpers } = require('./community/social');
const { createContent, createContentRoutes, createFeedbackRoutes } = require('./community/content');
const { createOwnerContentRoutes } = require('./admin/content');
const { createOwnerSystemRoutes } = require('./admin/system');

function createContext(cfg) {
  fs.mkdirSync(cfg.dataDir, { recursive: true, mode: 0o700 });
  const log = createLogger(cfg.logsDir);
  applyPendingRestore(cfg, log);
  const db = new Database(cfg.dbFile);
  migrate(db, log);
  const ctx = { cfg, db, log };
  ctx.settings = createSettings(db);
  ctx.audit = createAudit(db);
  ctx.rate = createRateLimiter();
  ctx.keys = loadSigningKey(cfg, log);
  ctx.storage = createStorage(cfg);
  ctx.configService = createConfigService(ctx);
  ctx.sessions = createSessions(ctx);
  ctx.ownerDevices = createOwnerDevices(ctx);
  ctx.mw = createAuthMiddleware(ctx);
  ctx.social = createSocialHelpers(db);
  ctx.items = createContent(ctx);
  ctx.publisher = createPublisher(ctx);
  ctx.backups = createBackups(ctx);
  seed(ctx);
  return ctx;
}

function seed(ctx) {
  const { db, cfg, log, configService, audit } = ctx;
  if (!db.get("SELECT id FROM community_groups WHERE slug = 'lobby'")) {
    db.run("INSERT INTO community_groups (slug, name, description, visibility, official, created_at) VALUES ('lobby', 'Community lobby', 'The public Polaris community chat.', 'public', 1, ?)", now());
  }
  // Bundles must exist (and be signed with the current key) before clients ask for them.
  const stale = ['client', 'website', 'releases'].some((t) => {
    const row = db.get('SELECT envelope FROM bundles WHERE target = ?', t);
    if (!row) return true;
    try { return JSON.parse(row.envelope).keyId !== ctx.keys.keyId; } catch { return true; }
  });
  if (stale) configService.rebuildAll();

  // Owner access works only through owner connections (device keys), never a password.
  // On the very first start the server creates the first connection file for the owner.
  const legacyToken = path.join(cfg.dataDir, 'owner-setup-token');
  if (fs.existsSync(legacyToken)) fs.unlinkSync(legacyToken);
  const connFile = path.join(cfg.dataDir, 'owner-connection.json');
  const hasDevice = db.get('SELECT id FROM owner_devices WHERE revoked_at IS NULL');
  if (!hasDevice) {
    const conn = createConnection(db, hashPassword, { backendUrl: cfg.publicUrl, name: 'First owner connection' });
    writeConnectionFile(connFile, conn);
    audit(null, 'owner.device.added', conn.deviceId, { name: conn.name, via: 'first start' });
    log.warn(`Owner connection created: ${connFile}`);
    log.warn('Copy this file to the computer that runs Polaris Owner (see docs/OWNER_SETUP.md), then delete it here. Anyone with this file has owner access.');
  } else if (fs.existsSync(connFile)) {
    log.warn(`${connFile} still exists. Delete it once Polaris Owner has imported it.`);
  }
}

function createApp(ctx) {
  const { cfg, settings, rate, log, mw } = ctx;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', cfg.trustProxy ? 1 : false);

  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Cross-Origin-Resource-Policy': 'cross-origin' });
    const origin = req.get('origin');
    if (origin && cfg.corsOrigins.includes(origin)) {
      res.set({ 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS', 'Access-Control-Max-Age': '600' });
    }
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  });

  app.use('/files', express.static(cfg.uploadsDir, {
    index: false, dotfiles: 'deny', maxAge: '7d', immutable: true,
    setHeaders: (res) => res.set({ 'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'", 'X-Content-Type-Options': 'nosniff' }),
  }));

  app.get('/', (_req, res) => res.json({ name: 'Polaris backend', version: cfg.version, api: '/api/v1', health: '/api/v1/health' }));

  const api = express.Router();
  api.use(express.json({ limit: '1mb' }));
  api.use((req, _res, next) => {
    try {
      rate(`api:${req.ip}`, settings.get().rateLimits.api, 60000);
      next();
    } catch (e) { next(e); }
  });
  api.use(mw.authenticate);

  // Maintenance: public reads, health, auth/owner keep working; everything else 503.
  api.use((req, _res, next) => {
    const s = settings.get();
    if (!s.maintenance) return next();
    if (req.path.startsWith('/owner') || (req.user && req.user.role === 'owner')) return next();
    if (req.method === 'GET' && /^\/(health|keys|bundles|news|changelog|announcements|stats|assets)(\/|$)/.test(req.path)) return next();
    if (/^\/auth\/(login|me|logout)$/.test(req.path)) return next();
    next(new HttpError(503, 'maintenance', s.maintenanceMessage));
  });

  const authApi = createAuthRoutes(ctx);
  ctx.feedback = createFeedbackRoutes(ctx);
  const social = createSocialRoutes(ctx);

  api.use('/', createPublicRoutes(ctx));
  api.use('/auth', authApi.router);
  api.use('/owner/auth', createOwnerAuthRoutes(ctx, authApi));
  const owner = express.Router();
  owner.use(mw.requireOwner);
  owner.use(createOwnerDeviceRoutes(ctx));
  owner.use(createOwnerContentRoutes(ctx));
  owner.use(createOwnerSystemRoutes(ctx));
  api.use('/owner', owner);
  api.use('/users', social.users);
  api.use('/social', social.social);
  api.use('/community', createContentRoutes(ctx));
  api.use('/feedback', ctx.feedback.router);
  api.use('/cloud', createCloudRoutes(ctx));
  api.use((req, res, next) => (/^\/(presence|notifications|reports)(\/|$)/.test(req.path) ? social.misc(req, res, next) : next()));
  api.use((_req, _res, next) => next(E.notFound('Unknown API endpoint')));

  app.use('/api/v1', api);
  app.use((_req, res) => res.status(404).json({ error: { code: 'not_found', message: 'Not found' } }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } });
    }
    if (err && err.type === 'entity.too.large') return res.status(413).json({ error: { code: 'payload_too_large', message: 'Request body too large' } });
    if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'bad_request', message: 'Malformed JSON body' } });
    const ref = crypto.randomBytes(4).toString('hex');
    log.error('unhandled error', { ref, path: req.path, method: req.method, error: err && err.message, stack: err && err.stack && err.stack.split('\n').slice(0, 6).join(' | ') });
    res.status(500).json({ error: { code: 'internal_error', message: `Internal server error (ref ${ref})` } });
  });
  return app;
}

module.exports = { createContext, createApp };
