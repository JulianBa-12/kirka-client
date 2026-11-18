'use strict';
/**
 * Backup Vault — local, integrity-checked snapshots of everything the user configured.
 *
 * A backup is one JSON file in <userData>/backups/<id>.json:
 *   { format: 'polaris-backup/1', id, createdAt, reason, label, appVersion, sha256, payload }
 * where sha256 is computed over JSON.stringify(payload). A backup whose hash does not match
 * is reported as damaged and can never be restored. Library files (images, sounds) are not
 * copied — only their index and the small JSON items (crosshairs, HUD layouts, themes,
 * workspaces) — so the size of a backup stays in the kilobyte range. This is shown in the UI.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');
const { P, log, clone } = require('./core');
const state = require('./state');

const SECTIONS = {
  settings: { label: 'Settings', doc: 'settings' },
  profiles: { label: 'Smart profiles', doc: 'profiles' },
  workspaces: { label: 'Workspaces', doc: 'workspaces' },
  automation: { label: 'Profile automation', doc: 'automation' },
  journal: { label: 'Session journal', doc: 'journal' },
  analytics: { label: 'Match analytics', doc: 'analytics' },
  maps: { label: 'Map notes and presets', doc: 'maps' },
  plugins: { label: 'Plugins', doc: 'plugins' },
  library: { label: 'Library index', doc: 'library' },
};
const dir = () => path.join(P.root, 'backups');
const ID = /^[0-9]{8}T[0-9]{6}-[0-9a-f]{6}$/;
const hash = (payload) => crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');

function collect() {
  const payload = {};
  for (const [k, s] of Object.entries(SECTIONS)) payload[k] = clone(state[s.doc].get());
  delete payload.settings.privacy.installId;
  return payload;
}

function create({ reason = 'manual', label = '' } = {}) {
  fs.mkdirSync(dir(), { recursive: true });
  const now = new Date();
  const id = `${now.toISOString().replace(/[-:]/g, '').slice(0, 15)}-${crypto.randomBytes(3).toString('hex')}`;
  const payload = collect();
  const doc = { format: 'polaris-backup/1', id, createdAt: now.toISOString(), reason, label: String(label || '').slice(0, 60), appVersion: app.getVersion(), sha256: hash(payload), payload };
  const file = path.join(dir(), `${id}.json`);
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(doc));
  fs.renameSync(`${file}.tmp`, file);
  prune();
  log.info('backup created', { id, reason });
  return summary(doc, fs.statSync(file).size);
}

function read(id) {
  if (!ID.test(id || '')) throw new Error('Invalid backup id');
  const file = path.join(dir(), `${id}.json`);
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (doc.format !== 'polaris-backup/1') throw new Error('Not a Polaris backup');
  return { doc, size: fs.statSync(file).size };
}

function summary(doc, size) {
  const intact = !!doc.payload && hash(doc.payload) === doc.sha256;
  const counts = {};
  if (doc.payload) {
    counts.profiles = (doc.payload.profiles && doc.payload.profiles.items || []).length;
    counts.workspaces = (doc.payload.workspaces && doc.payload.workspaces.items || []).length;
    counts.sessions = (doc.payload.analytics && doc.payload.analytics.sessions || []).length;
    counts.libraryItems = (doc.payload.library && doc.payload.library.items || []).length;
    counts.plugins = (doc.payload.plugins && doc.payload.plugins.items || []).length;
  }
  return { id: doc.id, createdAt: doc.createdAt, reason: doc.reason, label: doc.label, appVersion: doc.appVersion, sha256: doc.sha256, intact, size, counts, sections: Object.keys(doc.payload || {}).filter((k) => k in SECTIONS) };
}

function list() {
  if (!fs.existsSync(dir())) return [];
  const out = [];
  for (const f of fs.readdirSync(dir())) {
    if (!/\.json$/.test(f)) continue;
    try { const { doc, size } = read(f.slice(0, -5)); out.push(summary(doc, size)); }
    catch (e) { out.push({ id: f.slice(0, -5), intact: false, error: e.message, createdAt: null, sections: [], counts: {} }); }
  }
  return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function prune() {
  const keep = state.settings.get().backups.keep || 20;
  const autos = list().filter((b) => b.reason === 'auto' || b.reason === 'pre-restore');
  for (const b of autos.slice(keep)) { try { fs.rmSync(path.join(dir(), `${b.id}.json`)); } catch {} }
}

function remove(id) { if (!ID.test(id || '')) throw new Error('Invalid backup id'); fs.rmSync(path.join(dir(), `${id}.json`), { force: true }); return list(); }

/** Restores selected sections. `saveSettings` is the sanitizing writer from ipc.js. */
function restore(id, sections, { saveSettings }) {
  const { doc } = read(id);
  if (hash(doc.payload) !== doc.sha256) throw new Error('This backup is damaged (checksum mismatch) and cannot be restored');
  const wanted = (Array.isArray(sections) && sections.length ? sections : Object.keys(SECTIONS)).filter((k) => k in SECTIONS && doc.payload[k]);
  if (!wanted.length) throw new Error('Nothing to restore');
  const safety = create({ reason: 'pre-restore', label: `Before restoring ${doc.id}` });
  for (const k of wanted) {
    const data = clone(doc.payload[k]);
    if (k === 'settings') saveSettings({ ...data, account: state.settings.get().account, privacy: { ...data.privacy, installId: state.settings.get().privacy.installId } });
    else if (k === 'library') {
      // Only re-link index entries whose files still exist; files are not part of the backup.
      const libDir = P.library;
      const items = (data.items || []).filter((i) => i && i.kind && i.file && fs.existsSync(path.join(libDir, i.kind, i.file)));
      state.library.set({ ...data, items });
    } else state[SECTIONS[k].doc].set(data);
  }
  state.flushAll();
  log.info('backup restored', { id, sections: wanted, safety: safety.id });
  return { restored: wanted, safetyBackup: safety.id };
}

function importFile(text) {
  const doc = JSON.parse(text);
  if (doc.format !== 'polaris-backup/1' || !doc.payload || typeof doc.sha256 !== 'string') throw new Error('Not a Polaris backup file');
  if (hash(doc.payload) !== doc.sha256) throw new Error('Backup checksum does not match — the file is damaged or was edited');
  if (!ID.test(doc.id || '')) throw new Error('Invalid backup id');
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(path.join(dir(), `${doc.id}.json`), JSON.stringify(doc));
  return summary(doc, Buffer.byteLength(JSON.stringify(doc)));
}

/** Daily automatic backup (called at startup and every few hours). */
function autoBackup() {
  const s = state.settings.get();
  if (!s.backups.auto) return null;
  const last = s.backups.lastAuto ? Date.parse(s.backups.lastAuto) : 0;
  if (Date.now() - last < 24 * 3600 * 1000) return null;
  try {
    const b = create({ reason: 'auto', label: 'Daily backup' });
    state.settings.update((st) => { st.backups.lastAuto = b.createdAt; return st; });
    return b;
  } catch (e) { log.warn('automatic backup failed', { error: e.message }); return null; }
}

module.exports = { SECTIONS, create, list, read, remove, restore, importFile, autoBackup, hash, dir };
