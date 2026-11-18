/**
 * Published data. Order of preference: live backend (when configured and reachable) →
 * static mirror in data/ (generated at deploy time) → compiled defaults.
 * The website only displays this data; signature verification happens in the client.
 */
import { DEFAULTS } from '../defaults.js';
import { api, status } from './api.js';

const cache = new Map();
const once = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };
/** Forget cached data (used when the realtime channel reports a change). No key = everything. */
export function invalidate(key) { if (key) cache.delete(key); else cache.clear(); }

async function staticJson(file) {
  try {
    const r = await fetch(`data/${file}`, { cache: 'no-cache' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

function parseEnvelope(env) {
  if (!env || typeof env !== 'object') return null;
  if (typeof env.payload === 'string') { try { return JSON.parse(env.payload); } catch { return null; } }
  return null;
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
function merge(base, over) {
  if (!isObj(base) || !isObj(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = isObj(v) && isObj(base[k]) ? merge(base[k], v) : v;
  return out;
}

async function live(fn) {
  const s = await status();
  if (s.state !== 'online' && s.state !== 'maintenance') return null; // public reads still work in maintenance
  try { return await fn(); } catch { return null; }
}

/** Website bundle → { site, theme, css, community, announcements, sequence, source } */
export function bundle() {
  return once('bundle', async () => {
    const [liveEnv, staticEnv] = await Promise.all([live(() => api('/bundles/website', { auth: 'none' })), staticJson('website-bundle.json')]);
    let payload = parseEnvelope(liveEnv); let source = 'live';
    if (!payload) { payload = parseEnvelope(staticEnv); source = 'static'; }
    if (!payload) { payload = { domains: {}, announcements: [], sequence: 0 }; source = 'defaults'; }
    const dom = payload.domains || {};
    const pick = (name) => merge(DEFAULTS[name], dom[name] && dom[name].data);
    return {
      site: pick('website.site'),
      theme: pick('website.theme'),
      css: pick('website.css'),
      community: pick('community.settings'),
      announcements: Array.isArray(payload.announcements) ? payload.announcements : [],
      sequence: payload.sequence || 0,
      issuedAt: payload.issuedAt || null,
      source,
    };
  });
}

/** Release manifest payload (or an empty manifest). */
export function releases() {
  return once('releases', async () => {
    const [liveEnv, staticEnv] = await Promise.all([live(() => api('/bundles/releases', { auth: 'none' })), staticJson('releases.json')]);
    const p = parseEnvelope(liveEnv) || parseEnvelope(staticEnv);
    const empty = { channels: { stable: null, beta: null }, history: [], minimumVersion: null, sequence: 0 };
    if (!p) return { ...empty, source: 'none' };
    return { ...empty, ...p, channels: { ...empty.channels, ...(p.channels || {}) }, history: Array.isArray(p.history) ? p.history : [], source: parseEnvelope(liveEnv) ? 'live' : 'static' };
  });
}

/** Changelog: { items: [Release] } newest first. */
export function changelog() {
  return once('changelog', async () => {
    const l = await live(() => api('/changelog', { auth: 'none' }));
    if (l && Array.isArray(l.items)) return { items: l.items, source: 'live' };
    const s = await staticJson('changelog.json');
    if (s && Array.isArray(s.items) && s.items.length) return { items: sortReleases(s.items), source: 'static' };
    const r = await releases();
    return { items: sortReleases(r.history), source: r.source };
  });
}
const sortReleases = (list) => list.slice().sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));

/** News list: { items, total, source }. Pinned first, newest first. */
export async function news({ limit = 20, offset = 0, tag = '' } = {}) {
  const l = await live(() => api('/news', { auth: 'none', query: { limit, offset, tag } }));
  if (l && Array.isArray(l.items)) return { items: l.items, total: l.total ?? l.items.length, source: 'live' };
  const all = await once('news-static', async () => { const s = await staticJson('news.json'); return (s && Array.isArray(s.items)) ? s.items : []; });
  const filtered = all.filter((p) => !tag || (p.tags || []).includes(tag))
    .sort((a, b) => (Number(!!b.pinned) - Number(!!a.pinned)) || String(b.publishedAt).localeCompare(String(a.publishedAt)));
  return { items: filtered.slice(offset, offset + limit), total: filtered.length, source: 'static' };
}

export async function newsPost(slug) {
  const l = await live(() => api(`/news/${encodeURIComponent(slug)}`, { auth: 'none' }));
  if (l && l.slug) return l;
  const all = await news({ limit: 1000 });
  return all.items.find((p) => p.slug === slug) || null;
}

/** Active announcements targeting the website: bundle + live endpoint, deduplicated by id. */
export async function announcements() {
  const b = await bundle();
  const l = await live(() => api('/announcements', { auth: 'none', query: { target: 'website' } }));
  const list = [...((l && l.items) || []), ...b.announcements];
  const seen = new Set(); const now = Date.now();
  return list.filter((a) => {
    if (!a || seen.has(a.id)) return false; seen.add(a.id);
    if (a.target && !['website', 'both'].includes(a.target)) return false;
    if (a.startsAt && Date.parse(a.startsAt) > now) return false;
    if (a.endsAt && Date.parse(a.endsAt) < now) return false;
    return true;
  });
}

/**
 * Public downloadable files of a release. Only the Polaris Client is ever offered:
 * anything that looks like the Owner application is dropped, as are unknown platforms.
 */
export function publicFiles(release, { showDeb = true } = {}) {
  if (!release || !Array.isArray(release.files)) return [];
  return release.files.filter((f) => {
    if (!f || typeof f.name !== 'string') return false;
    if (/owner/i.test(f.name) || /owner/i.test(f.url || '')) return false;
    if (f.platform === 'linux-appimage') return true;
    if (f.platform === 'linux-deb') return !!showDeb;
    if (['win-x64', 'mac-arm64', 'mac-x64'].includes(f.platform)) return true;
    return false;
  });
}

export const GITHUB_RELEASES = 'https://github.com/JulianBa-12/kirka-client/releases';
