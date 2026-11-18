'use strict';
/**
 * Polaris server client (social, marketplace, cloud sync, feedback).
 * The session token never reaches the renderer: it is kept in the main process and
 * persisted with Electron safeStorage (OS keychain) when available.
 * The owner API is unreachable from the public client by construction.
 */
const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');
const { P, log } = require('./core');
const state = require('./state');

const tokenFile = () => path.join(P.data, 'session.bin');
let token = null; let me = null;

function base() {
  const u = (state.settings.get().account.serverUrl || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/]+/.test(u)) return null;
  return u;
}

function loadToken() {
  try {
    const raw = fs.readFileSync(tokenFile());
    token = safeStorage.isEncryptionAvailable() && raw[0] !== 0x7b ? safeStorage.decryptString(raw) : JSON.parse(raw.toString('utf8')).t;
  } catch { token = null; }
}
function saveToken(t) {
  token = t;
  try {
    if (!t) { fs.rmSync(tokenFile(), { force: true }); return; }
    fs.mkdirSync(P.data, { recursive: true });
    if (safeStorage.isEncryptionAvailable()) fs.writeFileSync(tokenFile(), safeStorage.encryptString(t), { mode: 0o600 });
    else { fs.writeFileSync(tokenFile(), JSON.stringify({ t }), { mode: 0o600 }); log.warn('OS keychain unavailable: session token stored with file permissions only'); }
  } catch (e) { log.error('could not persist session', { error: e.message }); }
}

class ApiError extends Error { constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; } }

const ALLOWED = /^\/(health|keys|bundles\/[a-z]+|news(\/[\w-]+)?|changelog|announcements|stats|assets\/\d+|auth(\/[\w/-]+)?|users(\/[\w%-]+)?|social(\/[\w/%-]+)?|presence|notifications(\/read)?|reports|community(\/[\w/-]+)?|feedback(\/[\w/-]+)?|cloud(\/[\w-]+)?|telemetry\/(heartbeat|crash))(\?.*)?$/;

async function request(method, p, body, { raw = false, timeoutMs = 15000 } = {}) {
  const b = base();
  if (!b) throw new ApiError(0, 'not_configured', 'No Polaris server is configured. Add one in Settings → Account.');
  if (typeof p !== 'string' || !ALLOWED.test(p) || p.startsWith('/owner')) throw new ApiError(0, 'forbidden_path', 'This request is not allowed from the client');
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) throw new ApiError(0, 'bad_method', 'Bad method');
  const headers = { 'User-Agent': `PolarisClient/${app.getVersion()}` };
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined && body !== null) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let res;
  try { res = await fetch(`${b}/api/v1${p}`, { method, headers, body: payload, signal: AbortSignal.timeout(timeoutMs) }); }
  catch (e) { throw new ApiError(0, 'network', `Cannot reach the Polaris server (${e.cause ? e.cause.code || e.cause.message : e.message})`); }
  if (raw && res.ok) return Buffer.from(await res.arrayBuffer());
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    if (res.status === 401 && token && !/^\/auth\/(login|register)/.test(p)) { saveToken(null); me = null; }
    const err = (data && data.error) || {};
    throw new ApiError(res.status, err.code || 'http_error', err.message || `Server responded ${res.status}`, err.details);
  }
  return data;
}

async function login(username, password, totp) {
  const r = await request('POST', '/auth/login', { username, password, totp: totp || undefined, client: 'client' });
  saveToken(r.token); me = r.user;
  state.settings.update((s) => { s.account.username = r.user.username; return s; });
  return r.user;
}
async function register(username, password, email) {
  const r = await request('POST', '/auth/register', { username, password, email: email || undefined, client: 'client' });
  saveToken(r.token); me = r.user;
  state.settings.update((s) => { s.account.username = r.user.username; return s; });
  return r.user;
}
async function logout() {
  try { if (token) await request('POST', '/auth/logout'); } catch {}
  saveToken(null); me = null;
}
async function session() {
  if (!token || !base()) return null;
  try { me = (await request('GET', '/auth/me')).user; return me; } catch (e) { if (e.status === 401) return null; return me; }
}

/** Multipart upload of a community item. `file`/`preview` are { name, type, data: Uint8Array }. */
async function uploadItem(fields, file, preview) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) form.append(k, typeof v === 'string' ? v : JSON.stringify(v));
  form.append('file', new Blob([file.data], { type: file.type || 'application/octet-stream' }), file.name || 'file');
  if (preview) form.append('preview', new Blob([preview.data], { type: preview.type }), preview.name || 'preview.png');
  return request('POST', '/community/items', form, { timeoutMs: 60000 });
}
async function uploadAvatar(file) {
  const form = new FormData();
  form.append('file', new Blob([file.data], { type: file.type }), file.name || 'avatar.png');
  const r = await request('POST', '/auth/avatar', form, { timeoutMs: 30000 });
  me = r.user; return r.user;
}

/** Downloads an absolute file URL that belongs to the configured server. */
async function downloadFile(url, maxBytes = 64 * 1024 * 1024) {
  const b = base();
  if (!b || !String(url).startsWith(`${b}/files/`)) throw new ApiError(0, 'forbidden_url', 'Downloads are only allowed from the configured Polaris server');
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new ApiError(res.status, 'download_failed', `Download failed (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new ApiError(0, 'too_large', 'File too large');
  return { buffer: buf, type: res.headers.get('content-type') || 'application/octet-stream' };
}

module.exports = { loadToken, request, login, register, logout, session, uploadItem, uploadAvatar, downloadFile, base, ApiError, get me() { return me; }, get signedIn() { return !!token; } };
