'use strict';
const { E } = require('../services/core');

function bearer(req) {
  const h = req.get('authorization') || '';
  const m = /^Bearer\s+([A-Za-z0-9_-]{20,200})$/.exec(h);
  return m ? m[1] : null;
}

function createAuthMiddleware(ctx) {
  const { sessions } = ctx;
  /** Attaches req.user / req.session when a valid token is present. Never rejects. */
  function authenticate(req, _res, next) {
    const token = bearer(req);
    if (token) {
      const r = sessions.resolve(token);
      if (r) { req.user = r.user; req.session = r.session; sessions.touch(r.session, r.user.id); }
    }
    next();
  }
  function requireUser(req, _res, next) {
    if (!req.user) return next(E.unauthorized());
    next();
  }
  /** Owner API: owner-scoped session AND owner role. Both are server-side facts. */
  function requireOwner(req, _res, next) {
    if (!req.user) return next(E.unauthorized());
    if (req.session.scope !== 'owner' || req.user.role !== 'owner') return next(E.forbidden('Owner session required'));
    next();
  }
  return { authenticate, requireUser, requireOwner };
}

module.exports = { createAuthMiddleware, bearer };
