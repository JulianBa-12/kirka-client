'use strict';
/**
 * Content-addressed file storage with magic-byte sniffing.
 * The declared MIME type / file extension from the client is never trusted.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Busboy = require('busboy');
const { E } = require('./core');

const EXT = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg',
  'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/mpeg': 'mp3', 'font/woff2': 'woff2',
  'application/json': 'json', 'model/gltf-binary': 'glb', 'model/gltf+json': 'gltf', 'video/webm': 'webm',
  'application/zip': 'zip',
};
const GROUPS = {
  image: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'],
  raster: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  audio: ['audio/ogg', 'audio/wav', 'audio/mpeg'],
  font: ['font/woff2'],
  data: ['application/json'],
  model: ['model/gltf-binary', 'model/gltf+json'],
};

function sniff(buf) {
  const b = buf;
  const ascii = (o, n) => b.slice(o, o + n).toString('latin1');
  if (b.length >= 8 && b[0] === 0x89 && ascii(1, 3) === 'PNG') return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp';
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') return 'audio/wav';
  if (b.length >= 6 && (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a')) return 'image/gif';
  if (b.length >= 4 && ascii(0, 4) === 'OggS') return 'audio/ogg';
  if (b.length >= 3 && ascii(0, 3) === 'ID3') return 'audio/mpeg';
  if (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return 'audio/mpeg';
  if (b.length >= 4 && ascii(0, 4) === 'wOF2') return 'font/woff2';
  if (b.length >= 4 && ascii(0, 4) === 'glTF') return 'model/gltf-binary';
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'video/webm';
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return 'application/zip';
  const text = b.slice(0, Math.min(b.length, 2048)).toString('utf8').replace(/^\uFEFF/, '').trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(text)) return 'image/svg+xml';
  if (text.startsWith('{') || text.startsWith('[')) {
    try { const j = JSON.parse(b.toString('utf8')); return j && j.asset && j.asset.version ? 'model/gltf+json' : 'application/json'; } catch { return null; }
  }
  return null;
}

/** Rejects SVGs that could execute script or load external resources. */
function checkSvg(buf) {
  const t = buf.toString('utf8');
  const bad = [
    [/<script/i, 'script elements'], [/\son[a-z]+\s*=/i, 'event handler attributes'], [/javascript:/i, 'javascript: URLs'],
    [/<foreignObject/i, 'foreignObject'], [/<!ENTITY/i, 'XML entities'], [/<!DOCTYPE/i, 'DOCTYPE declarations'],
    [/<(iframe|embed|object|audio|video|link|meta|style)\b/i, 'embedded or styling elements'],
    [/(?:xlink:)?href\s*=\s*["']\s*(?!#)/i, 'external references'], [/url\s*\(\s*["']?\s*(?!#)/i, 'external url() references'],
    [/@import/i, '@import'],
  ];
  for (const [re, what] of bad) if (re.test(t)) throw E.invalid([{ path: 'file', message: `SVG contains ${what}, which is not allowed` }]);
}

function dimensions(mime, b) {
  try {
    if (mime === 'image/png') return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    if (mime === 'image/gif') return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
    if (mime === 'image/webp') {
      const kind = b.slice(12, 16).toString('latin1');
      if (kind === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
      if (kind === 'VP8L') { const bits = b.readUInt32LE(21); return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }; }
      if (kind === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    }
    if (mime === 'image/jpeg') {
      let o = 2;
      while (o < b.length) {
        if (b[o] !== 0xff) { o++; continue; }
        const marker = b[o + 1];
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: b.readUInt16BE(o + 5), width: b.readUInt16BE(o + 7) };
        o += 2 + b.readUInt16BE(o + 2);
      }
    }
  } catch { /* fallthrough */ }
  return { width: null, height: null };
}

function createStorage(cfg) {
  fs.mkdirSync(cfg.uploadsDir, { recursive: true });

  function parseMultipart(req, { maxBytes, maxFiles = 2 }) {
    return new Promise((resolve, reject) => {
      if (!/^multipart\/form-data/i.test(req.get('content-type') || '')) return reject(E.badRequest('Expected multipart/form-data'));
      let bb;
      try { bb = Busboy({ headers: req.headers, limits: { fileSize: maxBytes, files: maxFiles, fields: 30, fieldSize: 64 * 1024 } }); }
      catch (e) { return reject(E.badRequest('Malformed upload')); }
      const fields = {}; const files = {}; let failed = null;
      bb.on('field', (name, val) => { fields[name] = val; });
      bb.on('file', (name, stream, info) => {
        const chunks = []; let size = 0;
        stream.on('data', (c) => { size += c.length; chunks.push(c); });
        stream.on('limit', () => { failed = E.tooLarge(`File exceeds ${Math.round(maxBytes / 1024)} KB`); });
        stream.on('end', () => { if (!failed) files[name] = { buffer: Buffer.concat(chunks), size, filename: String(info.filename || '').slice(0, 200) }; });
      });
      bb.on('filesLimit', () => { failed = E.badRequest('Too many files'); });
      bb.on('error', () => reject(E.badRequest('Malformed upload')));
      bb.on('close', () => (failed ? reject(failed) : resolve({ fields, files })));
      req.pipe(bb);
    });
  }

  /** Validates and stores a buffer. `allow` = list of MIME types. Returns metadata. */
  function store(buffer, { allow }) {
    if (!buffer || !buffer.length) throw E.badRequest('Empty file');
    const mime = sniff(buffer);
    if (!mime || !allow.includes(mime)) throw E.invalid([{ path: 'file', message: `File type ${mime || 'unknown'} is not accepted here (allowed: ${allow.map((m) => EXT[m]).join(', ')})` }]);
    if (mime === 'image/svg+xml') checkSvg(buffer);
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const storageName = `${sha256.slice(0, 32)}.${EXT[mime]}`;
    const file = path.join(cfg.uploadsDir, storageName);
    if (!fs.existsSync(file)) fs.writeFileSync(file, buffer, { mode: 0o644 });
    return { storageName, mime, size: buffer.length, sha256, ...dimensions(mime, buffer) };
  }

  const url = (storageName) => (storageName ? `${cfg.publicUrl}/files/${storageName}` : null);
  const filePath = (storageName) => path.join(cfg.uploadsDir, path.basename(storageName));

  return { parseMultipart, store, url, filePath, sniff, GROUPS, EXT };
}

module.exports = { createStorage, sniff, GROUPS, EXT };
