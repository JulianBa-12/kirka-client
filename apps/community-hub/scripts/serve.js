#!/usr/bin/env node
'use strict';
/**
 * Tiny static server that mimics GitHub Pages: dist/ is served under /kirka-client/,
 * unknown paths get 404.html with status 404.
 *
 *   node scripts/serve.js [--port 4173] [--dir dist] [--prefix /kirka-client/]
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const arg = (n, f) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : f; };
const PORT = Number(arg('--port', process.env.PORT || 4173));
const DIR = path.resolve(__dirname, '..', arg('--dir', 'dist'));
const PREFIX = arg('--prefix', '/kirka-client/');

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.webp': 'image/webp', '.jpg': 'image/jpeg' };

function send(res, status, file) {
  res.writeHead(status, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/' || url.pathname === PREFIX.replace(/\/$/, '')) { res.writeHead(302, { Location: PREFIX }); return res.end(); }
  if (!url.pathname.startsWith(PREFIX)) return send(res, 404, path.join(DIR, '404.html'));
  let rel = decodeURIComponent(url.pathname.slice(PREFIX.length));
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(DIR, rel));
  if (!file.startsWith(DIR)) { res.writeHead(400); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, path.join(DIR, '404.html'));
    send(res, 200, file);
  });
}).listen(PORT, '127.0.0.1', () => console.log(`Community Hub: http://127.0.0.1:${PORT}${PREFIX}`));
