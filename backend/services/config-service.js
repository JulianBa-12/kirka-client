'use strict';
/**
 * Remote configuration: drafts → validation → publication (versioned revisions)
 * → signed bundles. Also builds the signed release manifest.
 */
const fs = require('fs');
const path = require('path');
const { DOMAINS, DEFAULTS, BUNDLE_TARGETS, validateDomain } = require('../../shared/configuration/domains');
const { signPayload, generateKeyPair, keyIdFromPublicPem } = require('../../shared/utilities/signing');
const { json, now } = require('../database/db');
const { E } = require('./core');

function loadSigningKey(cfg, log) {
  let privPem;
  if (cfg.signingKeyFile) {
    privPem = fs.readFileSync(cfg.signingKeyFile, 'utf8');
  } else {
    fs.mkdirSync(cfg.keysDir, { recursive: true, mode: 0o700 });
    const privFile = path.join(cfg.keysDir, 'signing-private.pem');
    if (!fs.existsSync(privFile)) {
      const kp = generateKeyPair();
      fs.writeFileSync(privFile, kp.privateKey, { mode: 0o600 });
      fs.writeFileSync(path.join(cfg.keysDir, 'signing-public.pem'), kp.publicKey, { mode: 0o644 });
      log.warn(`generated new Ed25519 signing key ${kp.keyId} in ${cfg.keysDir} — export it to clients with "npm run keys:export-trust" and back it up securely`);
    }
    privPem = fs.readFileSync(privFile, 'utf8');
  }
  const crypto = require('crypto');
  const publicKey = crypto.createPublicKey(crypto.createPrivateKey(privPem)).export({ type: 'spki', format: 'pem' }).toString();
  const keyFile = cfg.signingKeyFile || path.join(cfg.keysDir, 'signing-private.pem');
  return { privateKey: privPem, publicKey, keyId: keyIdFromPublicPem(publicKey), createdAt: fs.statSync(keyFile).mtime.toISOString() };
}

function createConfigService(ctx) {
  const { db, log, keys, storage, cfg } = ctx;

  const published = (domain) => {
    const r = db.get("SELECT * FROM config_revisions WHERE domain = ? AND status = 'published' ORDER BY version DESC LIMIT 1", domain);
    return r ? { version: r.version, data: json.parse(r.data, null), publishedAt: r.published_at, note: r.note, publishedBy: r.published_by } : null;
  };
  const draft = (domain) => {
    const r = db.get('SELECT * FROM config_drafts WHERE domain = ?', domain);
    return r ? { data: json.parse(r.data, null), updatedAt: r.updated_at, note: r.note, updatedBy: r.updated_by } : null;
  };
  const assertDomain = (d) => { if (!DOMAINS.includes(d)) throw E.notFound(`Unknown configuration domain "${d}"`); };

  function validateOrThrow(domain, data) {
    const r = validateDomain(domain, data);
    if (!r.ok) throw E.invalid(r.errors, `Configuration for ${domain} is invalid`);
    return r.value;
  }

  function saveDraft(domain, data, note, actor) {
    assertDomain(domain);
    const value = validateOrThrow(domain, data);
    db.run('INSERT INTO config_drafts (domain, data, note, updated_by, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(domain) DO UPDATE SET data = excluded.data, note = excluded.note, updated_by = excluded.updated_by, updated_at = excluded.updated_at',
      domain, JSON.stringify(value), note || null, actor, now());
    return draft(domain);
  }

  function discardDraft(domain) { assertDomain(domain); db.run('DELETE FROM config_drafts WHERE domain = ?', domain); }

  function publishData(domain, data, note, actor) {
    const value = validateOrThrow(domain, data);
    const version = db.tx(() => {
      const max = db.get('SELECT MAX(version) AS v FROM config_revisions WHERE domain = ?', domain).v || 0;
      db.run("UPDATE config_revisions SET status = 'superseded' WHERE domain = ? AND status = 'published'", domain);
      db.run("INSERT INTO config_revisions (domain, version, data, note, status, published_by, published_at) VALUES (?,?,?,?,'published',?,?)",
        domain, max + 1, JSON.stringify(value), note || null, actor, now());
      db.run('DELETE FROM config_drafts WHERE domain = ?', domain);
      return max + 1;
    });
    rebuildFor(domain);
    log.info(`published ${domain} v${version}`, { actor });
    return version;
  }

  function publish(domain, note, actor) {
    assertDomain(domain);
    const d = draft(domain);
    if (!d) throw E.badRequest('There is no draft to publish');
    return publishData(domain, d.data, note || d.note, actor);
  }

  function rollback(domain, version, actor) {
    assertDomain(domain);
    const r = db.get('SELECT * FROM config_revisions WHERE domain = ? AND version = ?', domain, version);
    if (!r) throw E.notFound(`Version ${version} of ${domain} does not exist`);
    return publishData(domain, json.parse(r.data, null), `Rollback to v${version}`, actor);
  }

  function history(domain) {
    assertDomain(domain);
    return db.all('SELECT * FROM config_revisions WHERE domain = ? ORDER BY version DESC LIMIT 200', domain).map((r) => ({
      version: r.version, note: r.note, publishedAt: r.published_at, publishedBy: r.published_by, status: r.status, data: json.parse(r.data, null),
    }));
  }

  function activeAnnouncements(target) {
    const t = now();
    return db.all("SELECT * FROM announcements WHERE status = 'published' AND (target = ? OR target = 'both') AND (starts_at IS NULL OR starts_at <= ?) AND (ends_at IS NULL OR ends_at > ?) ORDER BY published_at DESC LIMIT 20", target, t, t)
      .map(serializeAnnouncement);
  }

  function buildPayload(target, { preview = false } = {}) {
    const domains = {};
    for (const d of BUNDLE_TARGETS[target]) {
      const dr = preview ? draft(d) : null;
      const p = published(d);
      domains[d] = dr ? { version: (p ? p.version : 0) + 1, publishedAt: dr.updatedAt, draft: true, data: dr.data }
        : p ? { version: p.version, publishedAt: p.publishedAt, data: p.data }
          : { version: 0, publishedAt: null, data: DEFAULTS[d] };
    }
    const updates = domains['client.updates'] ? domains['client.updates'].data : DEFAULTS['client.updates'];
    return {
      format: 'polaris-bundle/1', target, preview, issuedAt: now(),
      minClientVersion: '1.0.0', minimumVersion: updates.minimumVersion,
      domains, announcements: activeAnnouncements(target), assetsBase: `${cfg.publicUrl}/files/`,
    };
  }

  function storeBundle(target, payload) {
    const prev = db.get('SELECT sequence FROM bundles WHERE target = ?', target);
    payload.sequence = (prev ? prev.sequence : 0) + 1;
    const env = signPayload(payload, keys.privateKey, keys.publicKey);
    db.run('INSERT INTO bundles (target, sequence, envelope, issued_at) VALUES (?,?,?,?) ON CONFLICT(target) DO UPDATE SET sequence = excluded.sequence, envelope = excluded.envelope, issued_at = excluded.issued_at',
      target, payload.sequence, JSON.stringify(env), payload.issuedAt);
    return env;
  }

  function rebuild(target) {
    if (target === 'releases') return storeBundle('releases', buildReleasesPayload());
    return storeBundle(target, buildPayload(target));
  }
  function rebuildFor(domain) { for (const [t, ds] of Object.entries(BUNDLE_TARGETS)) if (ds.includes(domain)) rebuild(t); }
  function rebuildAll() { for (const t of [...Object.keys(BUNDLE_TARGETS), 'releases']) rebuild(t); }

  function previewEnvelope(target) {
    if (!BUNDLE_TARGETS[target]) throw E.notFound('Unknown bundle target');
    const payload = buildPayload(target, { preview: true });
    payload.sequence = 0; // preview bundles never advance the client's anti-rollback sequence
    return signPayload(payload, keys.privateKey, keys.publicKey);
  }

  function envelope(target) {
    let row = db.get('SELECT envelope FROM bundles WHERE target = ?', target);
    if (!row) { rebuild(target); row = db.get('SELECT envelope FROM bundles WHERE target = ?', target); }
    return JSON.parse(row.envelope);
  }

  function bundleInfo() {
    const out = {};
    for (const t of [...Object.keys(BUNDLE_TARGETS), 'releases']) {
      const r = db.get('SELECT sequence, issued_at FROM bundles WHERE target = ?', t);
      out[t] = r ? { sequence: r.sequence, issuedAt: r.issued_at, keyId: keys.keyId } : null;
    }
    return out;
  }

  /* ---------- releases ---------- */
  function serializeRelease(r) {
    return {
      id: r.id, version: r.version, channel: r.channel, title: r.title, notes: r.notes, files: json.parse(r.files, []),
      rollout: r.rollout, minimumVersion: r.minimum_version, visible: !!r.visible, status: r.status,
      createdAt: r.created_at, updatedAt: r.updated_at, publishedAt: r.published_at,
    };
  }
  function buildReleasesPayload() {
    const rows = db.all("SELECT * FROM releases WHERE status = 'published' AND visible = 1").map(serializeRelease);
    const { compareVersions } = require('../../shared/utilities/signing');
    rows.sort((a, b) => compareVersions(b.version, a.version));
    const latest = (ch) => rows.find((r) => r.channel === ch) || null;
    const strip = (r) => r && { id: r.id, version: r.version, channel: r.channel, title: r.title, notes: r.notes, files: r.files, rollout: r.rollout, minimumVersion: r.minimumVersion, publishedAt: r.publishedAt };
    const p = published('client.updates');
    return {
      format: 'polaris-releases/1', target: 'releases', issuedAt: now(),
      channels: { stable: strip(latest('stable')), beta: strip(latest('beta')) },
      minimumVersion: (p ? p.data : DEFAULTS['client.updates']).minimumVersion,
      history: rows.slice(0, 50).map(strip),
    };
  }

  return {
    published, draft, saveDraft, discardDraft, publish, rollback, history, validateOrThrow,
    envelope, previewEnvelope, rebuild, rebuildAll, rebuildFor, bundleInfo, serializeRelease, activeAnnouncements, buildReleasesPayload,
  };
}

function serializeAnnouncement(a) {
  return { id: a.id, title: a.title, body: a.body, level: a.level, target: a.target, startsAt: a.starts_at, endsAt: a.ends_at, publishedAt: a.published_at, status: a.status, createdAt: a.created_at, updatedAt: a.updated_at };
}

module.exports = { createConfigService, loadSigningKey, serializeAnnouncement };
