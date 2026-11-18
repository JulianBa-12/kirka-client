'use strict';
/**
 * Remote configuration & release manifest.
 *
 * Sources (first success wins): the Polaris server (if configured) and the static
 * GitHub Pages mirror. Every envelope must:
 *   1. be signed by a key compiled into the client (shared/configuration/trust.json),
 *   2. carry a sequence >= the last accepted one (anti-rollback),
 *   3. contain only domains that pass the shared validators — invalid domains are
 *      dropped individually and the last good/default value is kept.
 * Remote data is pure JSON. Nothing in it is ever executed.
 */
const fs = require('fs');
const path = require('path');
const { P, log, readJson, writeJson, clone } = require('./core');
const state = require('./state');
const { verifyEnvelope } = require('../shared/utilities/signing');
const { validateDomain, DEFAULTS, BUNDLE_TARGETS } = require('../shared/configuration/domains');
const TRUST = require('../shared/configuration/trust.json').keys;

const cacheFile = (t) => path.join(P.cache, `${t}-bundle.json`);
const status = { client: null, releases: null };

function sources(target) {
  const s = state.settings.get();
  const out = [];
  const server = (s.account.serverUrl || '').replace(/\/+$/, '');
  if (/^https?:\/\//.test(server)) out.push({ name: 'server', url: `${server}/api/v1/bundles/${target}` });
  const mirror = (s.advanced.mirrorUrl || '').replace(/\/+$/, '');
  if (/^https:\/\//.test(mirror)) out.push({ name: 'mirror', url: `${mirror}/${target === 'releases' ? 'releases' : `${target}-bundle`}.json` });
  return out;
}

async function fetchJson(url, timeoutMs = 10000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { 'Cache-Control': 'no-cache', 'User-Agent': `PolarisClient/${require('electron').app.getVersion()}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (text.length > 4 * 1024 * 1024) throw new Error('response too large');
  return JSON.parse(text);
}

/** Verifies an envelope and returns its payload, or throws with a precise reason. */
function accept(envelope, target, { allowPreview = false } = {}) {
  const payload = verifyEnvelope(envelope, TRUST);
  if (payload.target !== target) throw new Error(`envelope is for "${payload.target}", expected "${target}"`);
  if (payload.preview && !allowPreview) throw new Error('preview bundles are only accepted in test mode');
  const cached = readJson(cacheFile(target), null);
  if (cached && !payload.preview) {
    try {
      const prev = verifyEnvelope(cached, TRUST);
      if (!prev.preview && payload.sequence < prev.sequence) throw new Error(`rollback rejected (sequence ${payload.sequence} < ${prev.sequence})`);
    } catch (e) { if (/rollback/.test(e.message)) throw e; }
  }
  return payload;
}

/** Build the effective configuration: defaults overlaid with each valid remote domain. */
function effective(payload) {
  const cfg = {}; const rejected = [];
  for (const d of BUNDLE_TARGETS.client) cfg[d] = clone(DEFAULTS[d]);
  if (payload) {
    for (const [domain, entry] of Object.entries(payload.domains || {})) {
      if (!BUNDLE_TARGETS.client.includes(domain)) continue;
      const r = validateDomain(domain, entry && entry.data);
      if (r.ok) cfg[domain] = r.value; else { rejected.push({ domain, errors: r.errors.slice(0, 5) }); }
    }
  }
  return { config: cfg, rejected, announcements: (payload && Array.isArray(payload.announcements)) ? payload.announcements.slice(0, 20) : [] };
}

let current = null;

function loadCached() {
  const env = readJson(cacheFile('client'), null);
  if (!env) { current = { ...effective(null), source: 'defaults', sequence: 0, issuedAt: null }; return current; }
  try {
    const payload = verifyEnvelope(env, TRUST);
    current = { ...effective(payload), source: 'cache', sequence: payload.sequence, issuedAt: payload.issuedAt, preview: !!payload.preview };
  } catch (e) {
    log.warn('cached configuration failed verification, using defaults', { error: e.message });
    current = { ...effective(null), source: 'defaults', sequence: 0, issuedAt: null };
  }
  return current;
}

async function refresh(target = 'client') {
  const errors = [];
  for (const src of sources(target)) {
    try {
      const env = await fetchJson(src.url);
      const payload = accept(env, target);
      writeJson(cacheFile(target), env);
      if (target === 'client') {
        current = { ...effective(payload), source: src.name, sequence: payload.sequence, issuedAt: payload.issuedAt };
        if (current.rejected.length) log.warn('some configuration domains were rejected', current.rejected);
      }
      status[target] = { ok: true, source: src.name, at: new Date().toISOString(), sequence: payload.sequence };
      log.info(`accepted ${target} bundle`, { source: src.name, sequence: payload.sequence });
      return target === 'client' ? current : payload;
    } catch (e) {
      errors.push(`${src.name}: ${e.message}`);
    }
  }
  status[target] = { ok: false, at: new Date().toISOString(), errors };
  if (errors.length) log.warn(`could not refresh ${target} bundle`, errors);
  if (target === 'client') return current || loadCached();
  const cached = readJson(cacheFile('releases'), null);
  if (cached) { try { return verifyEnvelope(cached, TRUST); } catch {} }
  return null;
}

/** Test mode: load a signed preview bundle exported by the Owner app from a local file. */
function loadPreviewFile(file) {
  if (!state.settings.get().advanced.testMode) throw new Error('Enable test mode in Settings → Advanced first');
  const env = JSON.parse(fs.readFileSync(file, 'utf8'));
  const payload = accept(env, 'client', { allowPreview: true });
  current = { ...effective(payload), source: 'preview-file', sequence: payload.sequence, issuedAt: payload.issuedAt, preview: true };
  return current;
}

module.exports = {
  get current() { return current || loadCached(); },
  loadCached, refresh, loadPreviewFile, status, accept, effective, TRUST,
};
