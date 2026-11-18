'use strict';
/**
 * Core services for the main process: paths, logging, atomic JSON storage.
 * Everything Polaris writes lives under app.getPath('userData').
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const root = () => app.getPath('userData');
const P = {
  get root() { return root(); },
  get logs() { return path.join(root(), 'logs'); },
  get data() { return path.join(root(), 'data'); },
  get library() { return path.join(root(), 'library'); },
  get cache() { return path.join(root(), 'polaris-cache'); },
  get replays() { return path.join(root(), 'replays'); },
  get updates() { return path.join(root(), 'updates'); },
};

/* ---------------- logger ---------------- */
let logFile = null;
const ring = [];
function writeLog(level, msg, meta) {
  const entry = { at: new Date().toISOString(), level, msg: String(msg), meta: meta === undefined ? null : meta };
  ring.push(entry); if (ring.length > 1000) ring.shift();
  const line = `[${entry.at}] ${level.toUpperCase().padEnd(5)} ${entry.msg}${meta !== undefined ? ' ' + safeJson(meta) : ''}`;
  (level === 'error' ? process.stderr : process.stdout).write(line + '\n');
  try {
    if (!logFile) { fs.mkdirSync(P.logs, { recursive: true }); logFile = path.join(P.logs, 'polaris-client.log'); }
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > 4 * 1024 * 1024) fs.renameSync(logFile, logFile + '.1');
    fs.appendFileSync(logFile, line + '\n');
  } catch { /* never crash because of logging */ }
}
function safeJson(v) { try { return JSON.stringify(v); } catch { return String(v); } }
const log = {
  info: (m, meta) => writeLog('info', m, meta),
  warn: (m, meta) => writeLog('warn', m, meta),
  error: (m, meta) => writeLog('error', m, meta),
  entries: (limit = 300) => ring.slice(-limit).reverse(),
  file: () => logFile || path.join(P.logs, 'polaris-client.log'),
};

/* ---------------- atomic JSON files ---------------- */
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) {
    if (e.code !== 'ENOENT') {
      log.warn(`could not read ${path.basename(file)}, keeping a copy and using defaults`, { error: e.message });
      try { fs.copyFileSync(file, `${file}.corrupt-${Date.now()}`); } catch {}
    }
    return fallback;
  }
}
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

/** A persistent JSON document with debounced, atomic writes. */
function createDoc(name, defaults) {
  const file = path.join(P.data, `${name}.json`);
  let value = null; let timer = null;
  const load = () => {
    if (value) return value;
    const stored = readJson(file, null);
    value = typeof defaults === 'function' ? defaults(stored) : (stored == null ? clone(defaults) : stored);
    return value;
  };
  const flush = () => { clearTimeout(timer); timer = null; if (value) writeJson(file, value); };
  return {
    file,
    get: () => load(),
    set(v) { value = v; clearTimeout(timer); timer = setTimeout(flush, 250); return value; },
    update(fn) { const v = fn(load()); return this.set(v === undefined ? value : v); },
    flush,
  };
}
const clone = (v) => JSON.parse(JSON.stringify(v));

/** Deep merge used to upgrade stored settings with new defaults (arrays replace). */
function mergeDefaults(defaults, stored) {
  if (stored === undefined || stored === null) return clone(defaults);
  if (Array.isArray(defaults) || typeof defaults !== 'object' || defaults === null) return typeof stored === typeof defaults ? stored : clone(defaults);
  const out = {};
  for (const k of Object.keys(defaults)) out[k] = mergeDefaults(defaults[k], stored[k]);
  for (const k of Object.keys(stored)) if (!(k in out)) out[k] = stored[k];
  return out;
}

module.exports = { P, log, readJson, writeJson, createDoc, clone, mergeDefaults };
