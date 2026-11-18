'use strict';
/**
 * Plugin registry (main process side).
 *
 * Plugins are JSON packages { format:'polaris-plugin/1', manifest, code }. The code runs only
 * inside a sandboxed, opaque-origin iframe in the shell (no Node.js, no Electron APIs, no
 * network — CSP default-src 'none') and talks to Polaris through a postMessage API that
 * enforces the permissions the user granted. Marketplace plugins can only receive the
 * permissions the Polaris owner approved during review; local plugins are marked unreviewed.
 */
const crypto = require('crypto');
const state = require('./state');
const { validate } = require('../shared/utilities/schema');
const { ITEM_SCHEMAS, PLUGIN_PERMISSIONS } = require('../shared/configuration/domains');
const { compareVersions } = require('../shared/utilities/signing');
const { app } = require('electron');

const PERMISSION_INFO = {
  'ui.panel': 'Show its own panel inside the Plugins page',
  storage: 'Store up to 256 KB of its own data on this computer',
  notifications: 'Show short notifications',
  'hud.overlay': 'Show one line of text on the in-game overlay',
  'game.events': 'Know when a match starts or ends and read your measured FPS',
  'theme.read': 'Read the colours of the current Polaris theme',
};

function parsePackage(text) {
  let json;
  try { json = JSON.parse(text); } catch { throw new Error('The plugin file is not valid JSON'); }
  const r = validate(ITEM_SCHEMAS.plugin, json);
  if (!r.ok) throw new Error(`Invalid plugin package: ${r.errors.slice(0, 3).map((e) => `${e.path} ${e.message}`).join('; ')}`);
  if (compareVersions(app.getVersion(), r.value.manifest.minClientVersion || '1.0.0') < 0) throw new Error(`This plugin needs Polaris ${r.value.manifest.minClientVersion} or newer`);
  return r.value;
}

const list = () => state.plugins.get().items.map(({ code, ...rest }) => ({ ...rest, codeBytes: code.length }));
const get = (id) => state.plugins.get().items.find((p) => p.id === id) || null;

/**
 * install({ text, source:'local'|'marketplace', remoteId, approvedPermissions, expectedSha256, grant:[...] })
 * `grant` is what the user accepted in the confirmation dialog.
 */
function install({ text, source, remoteId = null, approvedPermissions = null, expectedSha256 = null, grant = [] }) {
  const pkg = parsePackage(text);
  const sha = crypto.createHash('sha256').update(pkg.code).digest('hex');
  if (expectedSha256 && sha !== expectedSha256) throw new Error('Plugin code does not match the reviewed version');
  const requested = pkg.manifest.permissions;
  const ceiling = source === 'marketplace' ? (approvedPermissions || []) : requested;
  const granted = grant.filter((p) => requested.includes(p) && ceiling.includes(p) && PLUGIN_PERMISSIONS.includes(p));
  const entry = {
    id: pkg.manifest.id, manifest: pkg.manifest, code: pkg.code, sha256: sha, source, remoteId,
    reviewed: source === 'marketplace', requestedPermissions: requested, allowedPermissions: ceiling.filter((q) => requested.includes(q)), grantedPermissions: granted,
    enabled: true, installedAt: new Date().toISOString(),
  };
  state.plugins.update((p) => { p.items = p.items.filter((x) => x.id !== entry.id); p.items.push(entry); return p; });
  return { ...entry, code: undefined };
}

function setEnabled(id, enabled) { state.plugins.update((p) => { const x = p.items.find((i) => i.id === id); if (x) x.enabled = !!enabled; return p; }); }
function setPermissions(id, perms) {
  state.plugins.update((p) => {
    const x = p.items.find((i) => i.id === id);
    if (x) x.grantedPermissions = perms.filter((q) => (x.allowedPermissions || x.requestedPermissions).includes(q) && PLUGIN_PERMISSIONS.includes(q));
    return p;
  });
}
function remove(id) { state.plugins.update((p) => { p.items = p.items.filter((x) => x.id !== id); delete p.storage[id]; return p; }); }

function storageGet(id) { return state.plugins.get().storage[id] || {}; }
function storageSet(id, key, value) {
  const plugin = get(id);
  if (!plugin || !plugin.grantedPermissions.includes('storage')) throw new Error('storage permission not granted');
  if (typeof key !== 'string' || !/^[\w.-]{1,64}$/.test(key)) throw new Error('invalid key');
  state.plugins.update((p) => {
    const st = { ...(p.storage[id] || {}) };
    if (value === undefined || value === null) delete st[key]; else st[key] = value;
    if (JSON.stringify(st).length > 256 * 1024) throw new Error('plugin storage quota (256 KB) exceeded');
    p.storage[id] = st; return p;
  });
}

module.exports = { parsePackage, list, get, install, setEnabled, setPermissions, remove, storageGet, storageSet, PERMISSION_INFO };
