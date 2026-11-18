'use strict';
/**
 * Local library: skins, backgrounds, resources, crosshairs, HUD layouts, themes.
 * Files live in <userData>/library/<kind>/<id>.<ext> and are served to the shell and
 * the game view through the read-only polaris-file:// protocol.
 *
 * These are LOCAL cosmetics. They are never presented as official Kirka inventory.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { P, log } = require('./core');
const state = require('./state');
const { validate } = require('../shared/utilities/schema');
const { ITEM_SCHEMAS } = require('../shared/configuration/domains');

const KINDS = ['skin', 'background', 'resource', 'crosshair', 'hud', 'theme', 'workspace'];
const MAX_BYTES = { skin: 2 << 20, background: 40 << 20, resource: 16 << 20, crosshair: 64 << 10, hud: 256 << 10, theme: 256 << 10, workspace: 64 << 10 };

/** Magic-byte sniffing; the declared type/extension is never trusted. */
function sniff(buf) {
  const b = buf.subarray(0, 16);
  const hex = b.toString('hex');
  if (hex.startsWith('89504e470d0a1a0a')) return { mime: 'image/png', ext: 'png' };
  if (hex.startsWith('ffd8ff')) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WAVE') return { mime: 'audio/wav', ext: 'wav' };
  if (b.toString('ascii', 0, 6) === 'GIF87a' || b.toString('ascii', 0, 6) === 'GIF89a') return { mime: 'image/gif', ext: 'gif' };
  if (b.toString('ascii', 0, 4) === 'OggS') return { mime: 'audio/ogg', ext: 'ogg' };
  if (b.toString('ascii', 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { mime: 'audio/mpeg', ext: 'mp3' };
  if (hex.startsWith('1a45dfa3')) return { mime: 'video/webm', ext: 'webm' };
  if (b.toString('ascii', 4, 8) === 'ftyp') return { mime: 'video/mp4', ext: 'mp4' };
  const head = buf.subarray(0, 1).toString('utf8');
  if (head === '{' || head === '[') { try { JSON.parse(buf.toString('utf8')); return { mime: 'application/json', ext: 'json' }; } catch {} }
  return null;
}

const ALLOWED = {
  skin: ['image/png'],
  background: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/webm', 'video/mp4'],
  resource: ['image/png', 'image/jpeg', 'image/webp', 'audio/ogg', 'audio/mpeg', 'audio/wav'],
  crosshair: ['application/json'], hud: ['application/json'], theme: ['application/json'], workspace: ['application/json'],
};

function pngSize(buf) { return buf.length > 24 && buf.toString('hex', 0, 8) === '89504e470d0a1a0a' ? { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) } : {}; }

const dirFor = (kind) => path.join(P.library, kind);
const fileOf = (item) => path.join(dirFor(item.kind), item.file);
const urlOf = (item) => `polaris-file://library/${item.kind}/${encodeURIComponent(item.file)}`;

function serialize(item) { return { ...item, url: urlOf(item) }; }
function list(kind) { return state.library.get().items.filter((i) => !kind || i.kind === kind).map(serialize); }
function get(id) { const i = state.library.get().items.find((x) => x.id === id); return i ? serialize(i) : null; }

/**
 * Adds a file to the library after validation.
 * opts: { kind, name, data(Buffer), source:'local'|'studio'|'marketplace', remoteId?, meta?, tags? }
 */
function add({ kind, name, data, source = 'local', remoteId = null, meta = {}, tags = [] }) {
  if (!KINDS.includes(kind)) throw new Error(`Unknown library kind "${kind}"`);
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (!buf.length) throw new Error('The file is empty');
  if (buf.length > MAX_BYTES[kind]) throw new Error(`File too large for a ${kind} (max ${Math.round(MAX_BYTES[kind] / 1024)} KB)`);
  const type = sniff(buf);
  if (!type || !ALLOWED[kind].includes(type.mime)) throw new Error(`This file type is not accepted for ${kind}s (${ALLOWED[kind].join(', ')})`);
  const outMeta = { ...meta };
  if (type.mime === 'image/png') Object.assign(outMeta, pngSize(buf));
  if (kind === 'skin') {
    const ok = [[64, 64], [128, 128], [64, 32], [128, 64]].some(([w, h]) => outMeta.width === w && outMeta.height === h);
    if (!ok) throw new Error(`Skins must be 64×64 or 128×128 PNG templates (this one is ${outMeta.width}×${outMeta.height})`);
  }
  if (type.mime === 'application/json') {
    const parsed = JSON.parse(buf.toString('utf8'));
    const r = validate(ITEM_SCHEMAS[kind], parsed);
    if (!r.ok) throw new Error(`Not a valid Polaris ${kind} file: ${r.errors.slice(0, 3).map((e) => `${e.path} ${e.message}`).join('; ')}`);
    outMeta.content = r.value;
  }
  if (kind === 'resource') {
    const t = String(outMeta.target || '').trim();
    if (!/^\/?[\w./-]{3,200}$/.test(t) || t.includes('..')) throw new Error('Resource swaps need a target file path from the game (for example /assets/sounds/hit.mp3 or hit.mp3)');
    if (!/\.(png|jpe?g|webp|ogg|mp3|wav)$/i.test(t)) throw new Error('Only image and sound resources can be swapped. Models, maps, scripts and data files are never replaced.');
    outMeta.target = t;
  }
  const id = crypto.randomUUID();
  const file = `${id}.${type.ext}`;
  fs.mkdirSync(dirFor(kind), { recursive: true });
  fs.writeFileSync(path.join(dirFor(kind), file), buf);
  const item = {
    id, kind, name: String(name || `Untitled ${kind}`).slice(0, 80), file, mime: type.mime, size: buf.length,
    source, remoteId, tags: (tags || []).slice(0, 10).map((t) => String(t).slice(0, 24)), favorite: false, enabled: kind === 'resource',
    meta: outMeta, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
  };
  state.library.update((l) => { l.items.unshift(item); return l; });
  log.info('library item added', { kind, id, source });
  return serialize(item);
}

function update(id, patch) {
  let out = null;
  state.library.update((l) => {
    const i = l.items.find((x) => x.id === id);
    if (!i) return l;
    if (typeof patch.name === 'string') i.name = patch.name.slice(0, 80);
    if (typeof patch.favorite === 'boolean') i.favorite = patch.favorite;
    if (typeof patch.enabled === 'boolean') i.enabled = patch.enabled;
    if (Array.isArray(patch.tags)) i.tags = patch.tags.slice(0, 10).map((t) => String(t).slice(0, 24));
    if (i.kind === 'resource' && typeof patch.target === 'string') {
      const t = patch.target.trim();
      if (/^\/?[\w./-]{3,200}$/.test(t) && !t.includes('..') && /\.(png|jpe?g|webp|ogg|mp3|wav)$/i.test(t)) i.meta.target = t;
      else throw new Error('Invalid resource target');
    }
    i.updatedAt = new Date().toISOString();
    out = serialize(i);
    return l;
  });
  return out;
}

/** Replace the file of an existing studio item (e.g. saving a skin again). */
function replaceData(id, data) {
  const cur = state.library.get().items.find((x) => x.id === id);
  if (!cur) throw new Error('Item not found');
  const buf = Buffer.from(data);
  const type = sniff(buf);
  if (!type || !ALLOWED[cur.kind].includes(type.mime)) throw new Error('Invalid file type');
  fs.writeFileSync(fileOf(cur), buf);
  state.library.update((l) => {
    const i = l.items.find((x) => x.id === id);
    i.size = buf.length;
    Object.assign(i.meta, pngSize(buf));
    i.sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    i.updatedAt = new Date().toISOString();
    return l;
  });
  return get(id);
}

function remove(id) {
  const cur = state.library.get().items.find((x) => x.id === id);
  if (!cur) return false;
  try { fs.rmSync(fileOf(cur), { force: true }); } catch {}
  state.library.update((l) => { l.items = l.items.filter((x) => x.id !== id); return l; });
  state.settings.update((s) => { s.backgrounds.queue = s.backgrounds.queue.filter((x) => x !== id); if (s.backgrounds.currentId === id) s.backgrounds.currentId = null; return s; });
  return true;
}

function read(id) { const i = state.library.get().items.find((x) => x.id === id); return i ? fs.readFileSync(fileOf(i)) : null; }

/** Resolve a polaris-file:// URL to a path inside the library (no traversal). */
function resolveUrl(u) {
  const url = new URL(u);
  if (url.host !== 'library') return null;
  const [kind, file] = decodeURIComponent(url.pathname).replace(/^\/+/, '').split('/');
  if (!KINDS.includes(kind) || !/^[0-9a-f-]{36}\.[a-z0-9]{2,5}$/.test(file || '')) return null;
  const p = path.join(dirFor(kind), file);
  return fs.existsSync(p) ? p : null;
}

/** Active resource swaps, for the game session's request filter. */
function activeSwaps() {
  return state.library.get().items.filter((i) => i.kind === 'resource' && i.enabled && i.meta && i.meta.target).map((i) => ({ target: i.meta.target, url: urlOf(i), id: i.id }));
}

module.exports = { KINDS, list, get, add, update, replaceData, remove, read, resolveUrl, activeSwaps, sniff, urlOf, fileOf };
