/**
 * Backend client (live mode). The site works without it; every caller must handle
 * `status().state !== 'online'`.
 */
import { allowOrigin } from './dom.js';

const TOKEN_KEY = 'polaris.hub.token';
let configPromise;
let statusPromise;

export class ApiError extends Error {
  constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details || []; }
}

async function fetchWithTimeout(url, opts = {}, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); } finally { clearTimeout(t); }
}

/** data/site-config.json → { apiBase, apiRoot, origin } */
export function config() {
  if (!configPromise) {
    configPromise = fetchWithTimeout('data/site-config.json', { cache: 'no-cache' }, 5000)
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}))
      .then((c) => {
        const raw = typeof c.apiBase === 'string' ? c.apiBase.trim().replace(/\/+$/, '') : '';
        let apiRoot = ''; let origin = '';
        if (raw) {
          try {
            const u = new URL(raw);
            if (u.protocol === 'https:' || (u.protocol === 'http:' && /^(127\.0\.0\.1|localhost)$/.test(u.hostname))) {
              apiRoot = /\/api\/v1$/.test(raw) ? raw : `${raw}/api/v1`;
              origin = u.origin;
              allowOrigin(origin);
            }
          } catch { /* invalid apiBase → treated as not configured */ }
        }
        return { apiBase: raw, apiRoot, origin };
      });
  }
  return configPromise;
}

/**
 * Backend status: { state: 'unconfigured' | 'offline' | 'online' | 'maintenance', health, message }
 */
export function status() {
  if (!statusPromise) {
    statusPromise = (async () => {
      const c = await config();
      if (!c.apiRoot) return { state: 'unconfigured', health: null };
      try {
        const r = await fetchWithTimeout(`${c.apiRoot}/health`, { cache: 'no-store' }, 4500);
        if (!r.ok && r.status !== 503) return { state: 'offline', health: null };
        const health = await r.json();
        if (health.maintenance) return { state: 'maintenance', health, message: health.maintenanceMessage || '' };
        return { state: 'online', health };
      } catch { return { state: 'offline', health: null }; }
    })();
  }
  return statusPromise;
}
export function resetStatus() { statusPromise = null; }

export const token = {
  get() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } },
  set(v) { try { localStorage.setItem(TOKEN_KEY, v); } catch { /* storage disabled */ } },
  clear() { try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
};

/**
 * api('/news', { query, method, body, form, auth })
 * auth: 'auto' (default, send if present) | 'required' | 'none'
 */
export async function api(path, { method = 'GET', query, body, form, auth = 'auto', timeout = 10000 } = {}) {
  const c = await config();
  if (!c.apiRoot) throw new ApiError(0, 'not_configured', 'The community backend is not configured for this site.');
  const url = new URL(c.apiRoot + path);
  if (query) for (const [k, v] of Object.entries(query)) if (v != null && v !== '') url.searchParams.set(k, String(v));
  const headers = { Accept: 'application/json' };
  const t = token.get();
  if (auth === 'required' && !t) throw new ApiError(401, 'unauthorized', 'Sign in to do this.');
  if (t && auth !== 'none') headers.Authorization = `Bearer ${t}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let res;
  try {
    res = await fetchWithTimeout(url.href, { method, headers, body: payload, credentials: 'omit', mode: 'cors' }, timeout);
  } catch (e) {
    throw new ApiError(0, 'network', e.name === 'AbortError' ? 'The community backend did not respond in time.' : 'Could not reach the community backend.');
  }
  let data = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch { data = null; } }
  if (!res.ok) {
    const err = (data && data.error) || {};
    if (res.status === 401 && t && err.code !== 'totp_required') { token.clear(); meCache = null; }
    throw new ApiError(res.status, err.code || `http_${res.status}`, err.message || defaultMessage(res.status), err.details);
  }
  return data;
}

function defaultMessage(status) {
  if (status === 429) return 'Too many requests. Wait a minute and try again.';
  if (status === 503) return 'The community backend is in maintenance mode.';
  if (status === 413) return 'That file is too large.';
  if (status >= 500) return 'The community backend had a problem. Try again later.';
  return 'Request failed.';
}

/** Human message for an ApiError, including validation details. */
export function errorText(e) {
  if (!(e instanceof ApiError)) return 'Something went wrong.';
  if (e.code === 'validation_failed' && e.details.length) return e.details.map((d) => `${d.path ? d.path + ': ' : ''}${d.message}`).join(' · ');
  return e.message;
}

// ------------------------------------------------------------------ session
let meCache = null;
export async function me({ refresh = false } = {}) {
  if (!token.get()) return null;
  if (meCache && !refresh) return meCache;
  meCache = (async () => {
    const s = await status();
    if (s.state !== 'online') return null;
    try { const r = await api('/auth/me'); return r.user; } catch (e) { if (e.status === 401) token.clear(); return null; }
  })();
  return meCache;
}

export async function login(username, password, totp) {
  const r = await api('/auth/login', { method: 'POST', auth: 'none', body: { username, password, totp: totp || undefined, client: 'website' } });
  token.set(r.token); meCache = Promise.resolve(r.user);
  window.dispatchEvent(new CustomEvent('polaris:session', { detail: r.user }));
  return r.user;
}
export async function register(username, password, email) {
  const r = await api('/auth/register', { method: 'POST', auth: 'none', body: { username, password, email: email || undefined, client: 'website' } });
  token.set(r.token); meCache = Promise.resolve(r.user);
  window.dispatchEvent(new CustomEvent('polaris:session', { detail: r.user }));
  return r.user;
}
export async function logout() {
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* token may already be invalid */ }
  token.clear(); meCache = null;
  window.dispatchEvent(new CustomEvent('polaris:session', { detail: null }));
}
export function setMe(user) { meCache = Promise.resolve(user); window.dispatchEvent(new CustomEvent('polaris:session', { detail: user })); }
