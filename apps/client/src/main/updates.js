'use strict';
/**
 * Update Center.
 * 1. Fetch the signed release manifest (server or Pages mirror) — remote.refresh('releases').
 * 2. Pick the newest release on the user's channel that applies to this install (rollout bucket).
 * 3. Download the AppImage to <userData>/updates, verifying size and SHA-512 from the signed manifest.
 * 4. Only after the user confirms: swap the running AppImage file (old one kept as .previous),
 *    then relaunch. Unverified files are deleted, never installed. Non-AppImage installs get
 *    the verified file and instructions instead of an in-place replacement.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, shell } = require('electron');
const { P, log } = require('./core');
const state = require('./state');
const remote = require('./remote');
const { compareVersions } = require('../shared/utilities/signing');

let manifest = null; let downloaded = null; let progress = null; let lastCheck = null; let checking = null;
const listeners = [];
const emit = () => { const s = status(); for (const fn of listeners) fn(s); };

function bucket() {
  const id = state.settings.get().privacy.installId || 'x';
  return parseInt(crypto.createHash('sha256').update(id).digest('hex').slice(0, 8), 16) % 100;
}

function candidate() {
  if (!manifest) return null;
  const ch = state.settings.get().updates.channel;
  const pool = [manifest.channels.stable, ch === 'beta' ? manifest.channels.beta : null].filter(Boolean);
  pool.sort((a, b) => compareVersions(b.version, a.version));
  const rel = pool[0];
  if (!rel || compareVersions(rel.version, app.getVersion()) <= 0) return null;
  if ((rel.rollout ?? 100) <= bucket() && compareVersions(app.getVersion(), manifest.minimumVersion || '0.0.0') >= 0) return { ...rel, held: true };
  return rel;
}

function status() {
  const c = candidate();
  return {
    current: app.getVersion(), channel: state.settings.get().updates.channel, lastCheck,
    manifest: manifest ? { sequence: manifest.sequence, issuedAt: manifest.issuedAt, minimumVersion: manifest.minimumVersion } : null,
    available: c ? { version: c.version, title: c.title, notes: c.notes, publishedAt: c.publishedAt, channel: c.channel, held: !!c.held, files: c.files } : null,
    belowMinimum: manifest ? compareVersions(app.getVersion(), manifest.minimumVersion || '0.0.0') < 0 : false,
    history: manifest ? manifest.history.slice(0, 30).map((r) => ({ version: r.version, title: r.title, notes: r.notes, publishedAt: r.publishedAt, channel: r.channel })) : [],
    progress, downloaded: downloaded ? { version: downloaded.version, file: downloaded.file, verified: true } : null,
    isAppImage: !!process.env.APPIMAGE,
    error: remote.status.releases && !remote.status.releases.ok ? (remote.status.releases.errors || []).join(' · ') : null,
  };
}

async function check() {
  if (checking) return checking;
  checking = (async () => {
    try { manifest = await remote.refresh('releases'); lastCheck = new Date().toISOString(); }
    finally { checking = null; emit(); }
    return status();
  })();
  return checking;
}

const ALLOWED_DOWNLOAD_HOSTS = /^(github\.com|objects\.githubusercontent\.com|release-assets\.githubusercontent\.com|julianba-12\.github\.io)$/i;

async function download() {
  const rel = candidate();
  if (!rel) throw new Error('No update is available');
  if (rel.held) throw new Error('This update is being rolled out gradually and is not yet available for this installation');
  const f = (rel.files || []).find((x) => x.platform === 'linux-appimage');
  if (!f) throw new Error('This release has no AppImage');
  const u = new URL(f.url);
  const server = (state.settings.get().account.serverUrl || '').replace(/\/+$/, '');
  if (u.protocol !== 'https:' || !(ALLOWED_DOWNLOAD_HOSTS.test(u.hostname) || (server && f.url.startsWith(`${server}/files/`)))) throw new Error(`Refusing to download from ${u.hostname}`);
  fs.mkdirSync(P.updates, { recursive: true });
  const dest = path.join(P.updates, `Polaris-Client-${rel.version}.AppImage`);
  const part = `${dest}.part`;
  const res = await fetch(f.url, { redirect: 'follow', signal: AbortSignal.timeout(30 * 60 * 1000) });
  if (!res.ok || !res.body) throw new Error(`Download failed (HTTP ${res.status})`);
  const hash = crypto.createHash('sha512');
  const out = fs.createWriteStream(part, { mode: 0o755 });
  let got = 0; const total = f.size || Number(res.headers.get('content-length')) || 0;
  progress = { version: rel.version, received: 0, total };
  emit();
  let lastEmit = 0;
  try {
    for await (const chunk of res.body) {
      got += chunk.length;
      if (f.size && got > f.size) throw new Error('Download is larger than the signed manifest says');
      hash.update(chunk);
      if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
      if (Date.now() - lastEmit > 250) { progress = { version: rel.version, received: got, total }; emit(); lastEmit = Date.now(); }
    }
    await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
    const digest = hash.digest('base64');
    if (f.size && got !== f.size) throw new Error(`Size mismatch (${got} ≠ ${f.size})`);
    if (digest !== f.sha512) throw new Error('SHA-512 does not match the signed release manifest');
    fs.renameSync(part, dest);
    downloaded = { version: rel.version, file: dest };
    log.info('update downloaded and verified', { version: rel.version, size: got });
    return status();
  } catch (e) {
    out.destroy(); fs.rmSync(part, { force: true });
    log.error('update download rejected', { error: e.message });
    throw e;
  } finally { progress = null; emit(); }
}

/** Called only after explicit confirmation in the UI. */
function install() {
  if (!downloaded || !fs.existsSync(downloaded.file)) throw new Error('No verified update has been downloaded');
  const target = process.env.APPIMAGE;
  if (!target) { shell.showItemInFolder(downloaded.file); return { installed: false, message: 'Polaris is not running as an AppImage. The verified file was opened in your file manager — replace your installation manually.' }; }
  const dir = path.dirname(target);
  fs.accessSync(dir, fs.constants.W_OK);
  const staged = `${target}.new`;
  fs.copyFileSync(downloaded.file, staged);
  fs.chmodSync(staged, 0o755);
  fs.renameSync(target, `${target}.previous`);
  fs.renameSync(staged, target);
  log.info('update installed, relaunching', { version: downloaded.version, target });
  app.relaunch({ execPath: target, args: process.argv.slice(1).filter((a) => !a.startsWith('--updated')).concat('--updated') });
  setTimeout(() => app.exit(0), 200);
  return { installed: true };
}

/** Restore the AppImage that was replaced by the last update. */
function rollback() {
  const target = process.env.APPIMAGE;
  if (!target || !fs.existsSync(`${target}.previous`)) throw new Error('No previous version is available to restore');
  fs.renameSync(target, `${target}.failed`);
  fs.renameSync(`${target}.previous`, target);
  app.relaunch({ execPath: target }); setTimeout(() => app.exit(0), 200);
  return { ok: true };
}
const canRollback = () => !!(process.env.APPIMAGE && fs.existsSync(`${process.env.APPIMAGE}.previous`));

module.exports = { check, download, install, rollback, canRollback, status, onStatus: (fn) => listeners.push(fn) };
