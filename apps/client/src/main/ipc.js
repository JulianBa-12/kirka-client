'use strict';
/**
 * IPC surface between the shell renderer and the main process.
 * Every handler validates its input; the renderer never receives tokens, file paths
 * outside the user's own dialogs, or Node.js capabilities.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, ipcMain, dialog, shell, clipboard, nativeImage } = require('electron');
const { P, log, clone, mergeDefaults } = require('./core');
const state = require('./state');
const remote = require('./remote');
const game = require('./game');
const library = require('./library');
const metrics = require('./metrics');
const updates = require('./updates');
const plugins = require('./plugins');
const server = require('./server');
const { validate } = require('../shared/utilities/schema');
const { ITEM_SCHEMAS, CLIENT_DESTINATIONS, HOME_WIDGETS, HUD_ELEMENTS, PLUGIN_PERMISSIONS } = (() => {
  const d = require('../shared/configuration/domains'); const def = require('../shared/configuration/defaults');
  return { ...d, CLIENT_DESTINATIONS: def.CLIENT_DESTINATIONS, HOME_WIDGETS: def.HOME_WIDGETS, HUD_ELEMENTS: def.HUD_ELEMENTS };
})();

let ctx = null;
const UUID = /^[0-9a-f-]{36}$/;
const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
const strList = (v, n, max) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string' && x.length <= max))].slice(0, n) : []);

/* ---------------- settings ---------------- */
const KEY_RE = /^((Ctrl|Shift|Alt)\+){0,3}(F([1-9]|1[0-2])|[A-Z0-9]|Insert|Home|End|PageUp|PageDown|Pause|`)$/;

function sanitizeSettings(incoming) {
  const cur = state.settings.get();
  const s = mergeDefaults(state.SETTINGS_DEFAULTS, incoming || {});
  s.privacy.installId = cur.privacy.installId;
  for (const k of Object.keys(s)) if (!(k in state.SETTINGS_DEFAULTS)) delete s[k];
  s.appearance.uiScale = Math.min(1.4, Math.max(0.8, Number(s.appearance.uiScale) || 1));
  if (!['comfortable', 'compact'].includes(s.appearance.density)) s.appearance.density = 'comfortable';
  if (!game.isGameUrl(s.game.url)) s.game.url = 'https://kirka.io/';
  const cx = validate(ITEM_SCHEMAS.crosshair, { format: 'polaris-crosshair/1', name: 'x', crosshair: s.game.crosshair });
  s.game.crosshair = cx.ok ? cx.value.crosshair : clone(cur.game.crosshair);
  if (s.game.hudCustom) { const h = validate(ITEM_SCHEMAS.hud, { format: 'polaris-hud/1', name: 'x', elements: s.game.hudCustom }); s.game.hudCustom = h.ok ? h.value.elements : cur.game.hudCustom; }
  s.game.gameCss = str(s.game.gameCss, 100000);
  for (const k of ['brightness', 'contrast', 'saturation']) s.game.visualFilter[k] = Math.min(2, Math.max(0.2, Number(s.game.visualFilter[k]) || 1));
  for (const [k, v] of Object.entries(s.game.keybinds)) { if (!(k in state.KEYBIND_DEFAULTS) || (v && !KEY_RE.test(v))) s.game.keybinds[k] = cur.game.keybinds[k] || state.KEYBIND_DEFAULTS[k]; }
  const srv = str(s.account.serverUrl, 300).trim();
  s.account.serverUrl = /^https?:\/\/[^\s"'<>]+$/.test(srv) || srv === '' ? srv.replace(/\/+$/, '') : cur.account.serverUrl;
  const mir = str(s.advanced.mirrorUrl, 300).trim();
  s.advanced.mirrorUrl = /^https:\/\/[^\s"'<>]+$/.test(mir) || mir === '' ? mir.replace(/\/+$/, '') : cur.advanced.mirrorUrl;
  s.advanced.selectorsOverride = str(s.advanced.selectorsOverride, 4000);
  if (!['stable', 'beta'].includes(s.updates.channel)) s.updates.channel = 'stable';
  s.home.hidden = Array.isArray(s.home.hidden) ? s.home.hidden.filter((x) => typeof x === 'string').slice(0, 20) : [];
  s.home.order = strList(s.home.order, 20, 40);
  if (!['en', 'de'].includes(s.general.language)) s.general.language = 'en';
  const dests = new Set(CLIENT_DESTINATIONS.map((d) => d.id));
  s.layout.navOrder = strList(s.layout.navOrder, 40, 40).filter((d) => dests.has(d));
  s.layout.navHidden = strList(s.layout.navHidden, 40, 40).filter((d) => dests.has(d) && !['home', 'settings'].includes(d));
  s.layout.toolsOpen = !!s.layout.toolsOpen;
  s.layout.quickAccess = strList(s.layout.quickAccess, 8, 60);
  const usage = {};
  for (const [k, v] of Object.entries(s.commands.usage || {}).slice(0, 300)) if (/^[\w:.-]{1,60}$/.test(k) && Number.isFinite(Number(v))) usage[k] = Math.min(1e6, Math.max(0, Math.round(Number(v))));
  s.commands.usage = usage;
  const sc = {}; const reserved = new Set(Object.values(s.game.keybinds));
  for (const [k, v] of Object.entries(s.commands.shortcuts || {}).slice(0, 60)) if (/^[\w:.-]{1,60}$/.test(k) && typeof v === 'string' && KEY_RE.test(v) && !reserved.has(v)) sc[k] = v;
  s.commands.shortcuts = sc;
  if (!KEY_RE.test(s.commands.paletteKey || '') || reserved.has(s.commands.paletteKey)) s.commands.paletteKey = 'Ctrl+K';
  s.backups.auto = !!s.backups.auto;
  s.backups.keep = Math.min(100, Math.max(3, Math.round(Number(s.backups.keep)) || 20));
  s.realtime.enabled = !!s.realtime.enabled;
  if (s.activeWorkspaceId && !state.workspaces.get().items.some((w) => w.id === s.activeWorkspaceId)) s.activeWorkspaceId = null;
  s.replays.fps = [30, 60].includes(Number(s.replays.fps)) ? Number(s.replays.fps) : 60;
  s.replays.bitrateMbps = Math.min(40, Math.max(1, Number(s.replays.bitrateMbps) || 8));
  s.replays.maxMinutes = Math.min(180, Math.max(1, Math.round(Number(s.replays.maxMinutes)) || 30));
  if (!['vp9', 'vp8'].includes(s.replays.codec)) s.replays.codec = 'vp9';
  const limit = remote.current.config['client.backgrounds'].queueLimit || 50;
  const known = new Set(library.list('background').map((i) => i.id));
  s.backgrounds.queue = [...new Set(s.backgrounds.queue.filter((id) => known.has(id)))].slice(0, Math.min(50, limit));
  if (s.backgrounds.currentId && !known.has(s.backgrounds.currentId)) s.backgrounds.currentId = null;
  s.backgrounds.rotation.intervalMinutes = Math.min(1440, Math.max(1, Math.round(s.backgrounds.rotation.intervalMinutes) || 10));
  return s;
}

function saveSettings(next) {
  const s = sanitizeSettings(next);
  state.settings.set(s);
  game.pushConfig();
  if (ctx) { const w = ctx.getWin(); if (w && game.view) game.view.webContents.setBackgroundThrottling(!!s.performance.backgroundThrottling); }
  return s;
}

/* ---------------- profiles ---------------- */
const PROFILE_FIELDS = ['performanceProfile', 'hudPreset', 'hudCustom', 'crosshairPreset', 'crosshair', 'crosshairEnabled', 'gameCssEnabled', 'gameCss', 'visualFilter', 'themeItemId', 'backgroundId'];

function snapshot() {
  const s = state.settings.get();
  return {
    performanceProfile: s.performance.profile, hudPreset: s.game.hudPreset, hudCustom: s.game.hudCustom, crosshairPreset: s.game.crosshairPreset,
    crosshair: s.game.crosshair, crosshairEnabled: s.game.crosshairEnabled, gameCssEnabled: s.game.gameCssEnabled, gameCss: s.game.gameCss,
    visualFilter: s.game.visualFilter, themeItemId: s.appearance.themeItemId, backgroundId: s.backgrounds.currentId,
  };
}

function applyPerformanceProfile(s, id) {
  const perf = remote.current.config['client.performance'];
  const p = perf.profiles.find((x) => x.id === id);
  if (!p) return s;
  s.performance.profile = p.id;
  s.appearance.motion = p.settings.animations;
  s.appearance.decorativeEffects = p.settings.decorativeEffects;
  s.performance.animatedBackgrounds = p.settings.animatedBackgrounds;
  s.performance.fpsUnlock = p.settings.fpsUnlock;
  s.performance.hardwareAcceleration = p.settings.hardwareAcceleration;
  s.performance.backgroundThrottling = p.settings.backgroundThrottling;
  if (s.game.hudCustom && s.game.hudCustom.fps) s.game.hudCustom.fps.visible = p.settings.showFps;
  return s;
}

function applyData(data) {
  const s = clone(state.settings.get());
  const cfg = remote.current.config;
  if (data.performanceProfile) applyPerformanceProfile(s, data.performanceProfile);
  if (data.hudPreset && cfg['client.hud'].presets.some((p) => p.id === data.hudPreset)) { s.game.hudPreset = data.hudPreset; s.game.hudCustom = null; }
  if (data.hudCustom !== undefined) s.game.hudCustom = data.hudCustom;
  if (data.crosshairPreset) {
    const cp = cfg['client.crosshairs'].presets.find((p) => p.id === data.crosshairPreset);
    if (cp) { s.game.crosshairPreset = cp.id; s.game.crosshair = clone(cp.crosshair); }
  }
  if (data.crosshair) s.game.crosshair = data.crosshair;
  for (const [k, target] of [['crosshairEnabled', 'crosshairEnabled'], ['gameCssEnabled', 'gameCssEnabled'], ['gameCss', 'gameCss'], ['visualFilter', 'visualFilter']]) if (data[k] !== undefined) s.game[target] = data[k];
  if (data.themeItemId !== undefined) s.appearance.themeItemId = data.themeItemId && library.get(data.themeItemId) ? data.themeItemId : null;
  if (data.backgroundId !== undefined) s.backgrounds.currentId = data.backgroundId && library.get(data.backgroundId) ? data.backgroundId : null;
  return saveSettings(s);
}

function applyProfile(id) {
  const own = state.profiles.get().items.find((p) => p.id === id);
  const official = remote.current.config['client.profiles'].official.find((p) => `official:${p.id}` === id || p.id === id);
  const prof = own || official;
  if (!prof) throw new Error('Profile not found');
  const s = applyData(prof.data);
  s.activeProfileId = own ? own.id : `official:${official.id}`;
  state.settings.set(s);
  const f = ctx ? ctx.startupFlags : {};
  return { settings: s, restartRequired: f.fpsUnlock !== s.performance.fpsUnlock || f.hardwareAcceleration !== s.performance.hardwareAcceleration };
}

function cleanProfile(p) {
  const data = {};
  for (const k of PROFILE_FIELDS) if (p.data && p.data[k] !== undefined) data[k] = p.data[k];
  return { id: UUID.test(p.id || '') ? p.id : crypto.randomUUID(), name: str(p.name, 40) || 'Profile', description: str(p.description, 200), data, createdAt: p.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
}

/* ---------------- dialogs ---------------- */
const FILTERS = {
  image: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
  png: [{ name: 'PNG image', extensions: ['png'] }],
  background: [{ name: 'Images and videos', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'webm', 'mp4'] }],
  resource: [{ name: 'Images and sounds', extensions: ['png', 'jpg', 'jpeg', 'webp', 'ogg', 'mp3', 'wav'] }],
  json: [{ name: 'JSON', extensions: ['json'] }],
  plugin: [{ name: 'Polaris plugin', extensions: ['json', 'polaris-plugin'] }],
};
async function pickFiles(filter, multi = false) {
  const r = await dialog.showOpenDialog(ctx.getWin(), { properties: multi ? ['openFile', 'multiSelections'] : ['openFile'], filters: FILTERS[filter] || [] });
  return r.canceled ? [] : r.filePaths;
}
async function pickSave(defaultName, filter) {
  const r = await dialog.showSaveDialog(ctx.getWin(), { defaultPath: path.join(app.getPath('downloads'), defaultName), filters: FILTERS[filter] || [] });
  return r.canceled ? null : r.filePath;
}
const readSmall = (f, max) => { const st = fs.statSync(f); if (st.size > max) throw new Error(`${path.basename(f)} is too large`); return fs.readFileSync(f); };

/* ---------------- replays ---------------- */
const recordings = new Map();
function replayItem(i) { return { ...i, url: `polaris-file://replays/${i.id}.webm` }; }

/* ---------------- plugin installs awaiting confirmation ---------------- */
const pending = new Map();
function stagePlugin(text, source, extra = {}) {
  const pkg = plugins.parsePackage(text);
  const token = crypto.randomBytes(16).toString('hex');
  pending.set(token, { text, source, ...extra, at: Date.now() });
  const ceiling = source === 'marketplace' ? (extra.approvedPermissions || []) : pkg.manifest.permissions;
  return { token, manifest: pkg.manifest, source, reviewed: source === 'marketplace', codeBytes: pkg.code.length,
    permissions: pkg.manifest.permissions.map((p) => ({ id: p, description: plugins.PERMISSION_INFO[p], allowed: ceiling.includes(p) })) };
}

/* ---------------- handler registry ---------------- */
const H = {};
const handle = (ch, fn) => { H[ch] = fn; };

function errorPayload(e) {
  return { __error: true, message: e.message || String(e), code: e.code || null, status: e.status || null, details: e.details || null };
}

function registerIpc(context) {
  ctx = context;
  for (const [ch, fn] of Object.entries(H)) {
    ipcMain.handle(ch, async (event, ...args) => {
      const w = ctx.getWin();
      if (!w || event.sender !== w.webContents) throw new Error('IPC sender not allowed');
      try { const r = await fn(...args); return r === undefined ? null : r; }
      catch (e) { log.warn(`ipc ${ch} failed`, { error: e.message }); return errorPayload(e); }
    });
  }
}

/* window */
handle('win:minimize', () => ctx.getWin().minimize());
handle('win:maximize', () => { const w = ctx.getWin(); if (w.isMaximized()) w.unmaximize(); else w.maximize(); });
handle('win:close', () => ctx.getWin().close());
handle('win:fullscreen', () => { const w = ctx.getWin(); w.setFullScreen(!w.isFullScreen()); });
handle('win:state', () => { const w = ctx.getWin(); return { maximized: w.isMaximized(), fullscreen: w.isFullScreen(), focused: w.isFocused(), mode: ctx.getMode() }; });
handle('shell:mode', (m) => ctx.setMode(m));

/* app */
handle('app:info', () => ({
  version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node,
  platform: process.platform, arch: process.arch, appImage: !!process.env.APPIMAGE, packaged: app.isPackaged, userData: P.root,
  startupFlags: ctx.startupFlags, destinations: CLIENT_DESTINATIONS, homeWidgets: HOME_WIDGETS, hudElements: HUD_ELEMENTS,
  pluginPermissions: PLUGIN_PERMISSIONS.map((p) => ({ id: p, description: plugins.PERMISSION_INFO[p] })),
}));
handle('app:openExternal', (url) => { if (!/^https:\/\/[^\s]+$/.test(String(url))) throw new Error('Only https links can be opened'); return shell.openExternal(url); });
handle('app:openFolder', (which) => {
  const map = { logs: P.logs, library: P.library, replays: P.replays, data: P.data, screenshots: path.join(app.getPath('pictures'), 'Polaris') };
  if (!map[which]) throw new Error('Unknown folder');
  fs.mkdirSync(map[which], { recursive: true });
  return shell.openPath(map[which]);
});
handle('app:relaunch', () => { state.flushAll(); app.relaunch(process.env.APPIMAGE ? { execPath: process.env.APPIMAGE } : undefined); app.exit(0); });
handle('app:logs', (limit) => log.entries(Math.min(1000, Number(limit) || 300)));
handle('app:copy', (text) => clipboard.writeText(str(text, 100000)));
handle('app:clearCache', async () => { const { session } = require('electron'); await session.fromPartition('persist:kirka').clearCache(); return true; });
handle('app:clearGameData', async () => { const { session } = require('electron'); await session.fromPartition('persist:kirka').clearStorageData(); game.reload(); return true; });

handle('app:hubData', async () => {
  const s = state.settings.get();
  const mirror = (s.advanced.mirrorUrl || '').replace(/\/+$/, '');
  const siteUrl = mirror.replace(/\/data$/, '/') || null;
  if (server.base()) {
    try { const r = await server.request('GET', '/news?limit=12'); return { items: r.items, source: 'server', siteUrl }; } catch {}
  }
  if (!/^https:\/\//.test(mirror)) return { items: [], source: null, siteUrl, error: 'No news source configured' };
  try {
    const res = await fetch(`${mirror}/news.json`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    return { items: Array.isArray(j.items) ? j.items.slice(0, 12) : [], source: 'mirror', siteUrl };
  } catch (e) { return { items: [], source: null, siteUrl, error: `News unavailable (${e.message})` }; }
});

/* game */
handle('game:start', () => { game.start(); return ctx.setMode('play'); });
handle('game:reload', () => game.reload());
handle('game:stop', () => { game.stop(); return ctx.setMode('shell'); });
handle('game:status', () => ({ started: game.isStarted(), url: game.view ? game.view.webContents.getURL() : null, ...game.stats() }));
handle('game:pluginOverlay', (id, text) => {
  const p = plugins.get(str(id, 64));
  if (!p || !p.enabled || !p.grantedPermissions.includes('hud.overlay')) throw new Error('hud.overlay permission not granted');
  game.setPluginOverlay(p.id, text == null ? null : str(text, 80));
});

/* settings */
handle('settings:get', () => state.settings.get());
handle('settings:set', (next) => saveSettings(next));
handle('settings:reset', (section) => {
  const s = clone(state.settings.get());
  if (section && section in state.SETTINGS_DEFAULTS && typeof state.SETTINGS_DEFAULTS[section] === 'object') s[section] = clone(state.SETTINGS_DEFAULTS[section]);
  else if (!section) { const id = s.privacy.installId; Object.assign(s, clone(state.SETTINGS_DEFAULTS)); s.privacy.installId = id; s.onboardingDone = true; }
  return saveSettings(s);
});
handle('settings:export', async () => {
  const file = await pickSave(`polaris-settings-${new Date().toISOString().slice(0, 10)}.json`, 'json');
  if (!file) return null;
  fs.writeFileSync(file, JSON.stringify(state.exportBundle(), null, 2));
  return file;
});
handle('settings:import', async () => {
  const [file] = await pickFiles('json');
  if (!file) return null;
  const json = JSON.parse(readSmall(file, 8 << 20).toString('utf8'));
  if (json.format !== 'polaris-client-export/1') throw new Error('This is not a Polaris settings export');
  const s = saveSettings(json.settings || {});
  if (json.profiles && Array.isArray(json.profiles.items)) state.profiles.set({ items: json.profiles.items.slice(0, 100).map(cleanProfile), rules: { onBattery: null, onAC: null } });
  if (json.maps && typeof json.maps === 'object') state.maps.set(mergeDefaults({ notes: {}, presets: [] }, json.maps));
  let pluginsImported = 0;
  for (const p of (json.plugins && json.plugins.items) || []) {
    try { plugins.install({ text: JSON.stringify({ format: 'polaris-plugin/1', manifest: p.manifest, code: p.code }), source: 'local', grant: [] }); pluginsImported++; } catch {}
  }
  return { settings: s, pluginsImported, note: pluginsImported ? 'Imported plugins are disabled-by-permission: re-grant permissions on the Plugins page.' : null };
});

/* remote configuration */
handle('config:get', () => { const c = remote.current; return { config: c.config, announcements: c.announcements, rejected: c.rejected, source: c.source, sequence: c.sequence, issuedAt: c.issuedAt, preview: !!c.preview, status: remote.status }; });
handle('config:refresh', async () => { const c = await remote.refresh('client'); game.setRemoteConfig(c.config); return { source: c.source, sequence: c.sequence, status: remote.status }; });
handle('config:loadPreview', async () => {
  const [file] = await pickFiles('json');
  if (!file) return null;
  const c = remote.loadPreviewFile(file);
  game.setRemoteConfig(c.config);
  return { source: c.source, sequence: c.sequence, rejected: c.rejected };
});
handle('config:resetPreview', () => { const c = remote.loadCached(); game.setRemoteConfig(c.config); return { source: c.source }; });

/* profiles */
handle('profiles:list', () => ({ ...state.profiles.get(), official: remote.current.config['client.profiles'].official, active: state.settings.get().activeProfileId }));
handle('profiles:save', (p) => {
  const input = p || {};
  const existing = state.profiles.get().items.find((x) => x.id === input.id);
  const prof = cleanProfile({ ...(existing || {}), ...input, data: input.fromCurrent ? snapshot() : (input.data || (existing && existing.data) || snapshot()) });
  state.profiles.update((d) => { d.items = d.items.filter((x) => x.id !== prof.id); d.items.push(prof); if (d.items.length > 100) throw new Error('Profile limit reached (100)'); return d; });
  return prof;
});
handle('profiles:delete', (id) => state.profiles.update((d) => { d.items = d.items.filter((x) => x.id !== id); for (const k of ['onBattery', 'onAC']) if (d.rules[k] === id) d.rules[k] = null; return d; }));
handle('profiles:apply', (id) => applyProfile(str(id, 80)));
handle('profiles:rules', (rules) => state.profiles.update((d) => { for (const k of ['onBattery', 'onAC']) d.rules[k] = rules && typeof rules[k] === 'string' ? rules[k] : null; return d; }).rules);
handle('profiles:applyPerformance', (id) => {
  const s = saveSettings(applyPerformanceProfile(clone(state.settings.get()), str(id, 64)));
  const f = ctx.startupFlags;
  return { settings: s, restartRequired: f.fpsUnlock !== s.performance.fpsUnlock || f.hardwareAcceleration !== s.performance.hardwareAcceleration };
});
handle('profiles:export', async (id) => {
  const p = state.profiles.get().items.find((x) => x.id === id);
  if (!p) throw new Error('Profile not found');
  const file = await pickSave(`${p.name.replace(/[^\w-]+/g, '-')}.polaris-profile.json`, 'json');
  if (!file) return null;
  fs.writeFileSync(file, JSON.stringify({ format: 'polaris-profile/1', profile: p }, null, 2));
  return file;
});
handle('profiles:import', async () => {
  const [file] = await pickFiles('json');
  if (!file) return null;
  const json = JSON.parse(readSmall(file, 2 << 20).toString('utf8'));
  if (json.format !== 'polaris-profile/1' || !json.profile) throw new Error('This is not a Polaris profile file');
  const prof = cleanProfile({ ...json.profile, id: undefined });
  state.profiles.update((d) => { d.items.push(prof); return d; });
  return prof;
});

/* library */
handle('library:list', (kind) => library.list(kind && library.KINDS.includes(kind) ? kind : undefined));
handle('library:add', (o) => library.add({ kind: o.kind, name: str(o.name, 80), data: Buffer.from(o.data), source: o.source === 'studio' ? 'studio' : 'local', meta: o.meta && typeof o.meta === 'object' ? o.meta : {}, tags: Array.isArray(o.tags) ? o.tags : [] }));
handle('library:import', async (kind) => {
  const filter = { skin: 'png', background: 'background', resource: 'resource', crosshair: 'json', hud: 'json', theme: 'json' }[kind];
  if (!filter) throw new Error('Unknown kind');
  const files = await pickFiles(filter, true);
  const added = []; const errors = [];
  for (const f of files.slice(0, 50)) {
    try { added.push(library.add({ kind, name: path.basename(f).replace(/\.[^.]+$/, '').slice(0, 80), data: readSmall(f, 64 << 20), source: 'local' })); }
    catch (e) { errors.push(`${path.basename(f)}: ${e.message}`); }
  }
  return { added, errors };
});
handle('library:importResource', async (target) => {
  const t = str(target, 200).trim();
  const [file] = await pickFiles('resource');
  if (!file) return null;
  return library.add({ kind: 'resource', name: path.basename(file).replace(/\.[^.]+$/, '').slice(0, 80), data: readSmall(file, 16 << 20), source: 'local', meta: { target: t } });
});
handle('game:recentResources', () => game.recentResources());
handle('library:update', (id, patch) => library.update(id, patch || {}));
handle('library:replace', (id, data) => library.replaceData(id, Buffer.from(data)));
handle('library:remove', (id) => library.remove(id));
handle('library:read', (id) => { const b = library.read(id); return b ? new Uint8Array(b) : null; });
handle('library:export', async (id) => {
  const it = library.get(id);
  if (!it) throw new Error('Item not found');
  const ext = path.extname(it.file);
  const file = await pickSave(`${it.name.replace(/[^\w-]+/g, '-')}${ext}`, '');
  if (!file) return null;
  fs.copyFileSync(library.fileOf(it), file);
  return file;
});
handle('dialog:openImage', async (filter) => {
  const [file] = await pickFiles(filter === 'png' ? 'png' : 'image');
  if (!file) return null;
  const data = readSmall(file, 16 << 20);
  return { name: path.basename(file), data: new Uint8Array(data), type: (library.sniff(data) || {}).mime || null };
});
handle('dialog:openJson', async () => {
  const [file] = await pickFiles('json');
  if (!file) return null;
  return { name: path.basename(file), text: readSmall(file, 4 << 20).toString('utf8') };
});
handle('dialog:saveData', async (name, data) => {
  const file = await pickSave(str(name, 120).replace(/[/\\]/g, '-') || 'polaris-export', '');
  if (!file) return null;
  fs.writeFileSync(file, typeof data === 'string' ? data : Buffer.from(data));
  return file;
});

/* analytics */
handle('analytics:get', () => ({ ...state.analytics.get(), current: ctx.tracker.current() }));
const MATCH_FIELDS = { kills: [0, 999], deaths: [0, 999], assists: [0, 999], score: [0, 1e6], headshots: [0, 999], durationMin: [0, 600] };
handle('analytics:saveMatch', (m) => {
  const match = { id: UUID.test((m && m.id) || '') ? m.id : crypto.randomUUID(), at: Date.parse(m.at) ? new Date(m.at).toISOString() : new Date().toISOString(),
    mode: str(m.mode, 40), map: str(m.map, 40), result: ['win', 'loss', 'draw', ''].includes(m.result) ? m.result : '', notes: str(m.notes, 500), source: 'manual' };
  // Only values the player typed in are stored; empty means "not recorded", never zero.
  for (const [k, [lo, hi]] of Object.entries(MATCH_FIELDS)) { const v = m[k]; match[k] = v === '' || v == null || !Number.isFinite(Number(v)) ? null : Math.min(hi, Math.max(lo, Number(v))); }
  state.analytics.update((a) => { a.matches = a.matches.filter((x) => x.id !== match.id); a.matches.push(match); a.matches.sort((x, y) => x.at.localeCompare(y.at)); if (a.matches.length > 5000) a.matches.shift(); return a; });
  return match;
});
handle('analytics:deleteMatch', (id) => state.analytics.update((a) => { a.matches = a.matches.filter((x) => x.id !== id); return a; }));
handle('analytics:clear', (what) => state.analytics.update((a) => { if (what === 'sessions' || what === 'all') a.sessions = []; if (what === 'matches' || what === 'all') a.matches = []; if (what === 'benchmarks' || what === 'all') a.benchmarks = []; return a; }));
handle('analytics:saveBenchmark', (b) => {
  const bench = { id: crypto.randomUUID(), at: new Date().toISOString(), label: str(b.label, 60) || 'Benchmark', profile: str(b.profile, 40), durationSec: Number(b.durationSec) || 0,
    samples: Math.max(0, Math.round(Number(b.samples) || 0)), fpsAvg: num(b.fpsAvg), fpsMin: num(b.fpsMin), low1: num(b.low1), frameTimeAvg: num(b.frameTimeAvg), cpuAvg: num(b.cpuAvg), memAvg: num(b.memAvg), inMatch: !!b.inMatch,
    flags: { ...ctx.startupFlags } };
  if (!bench.samples) throw new Error('No FPS samples were measured — start a match and keep the game view visible while benchmarking');
  state.analytics.update((a) => { a.benchmarks.push(bench); if (a.benchmarks.length > 200) a.benchmarks.shift(); return a; });
  return bench;
});
const num = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 10) / 10);
handle('analytics:exportCsv', async (what) => {
  const a = state.analytics.get();
  const rows = what === 'sessions' ? a.sessions : a.matches;
  if (!rows.length) throw new Error('Nothing to export yet');
  const cols = Object.keys(rows[0]);
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => { const v = r[c] == null ? '' : String(r[c]); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(','))].join('\n');
  const file = await pickSave(`polaris-${what}.csv`, '');
  if (!file) return null;
  fs.writeFileSync(file, csv);
  return file;
});

/* metrics */
handle('metrics:history', () => metrics.history());
handle('metrics:system', () => metrics.systemInfo());

/* maps */
handle('maps:get', () => state.maps.get());
handle('maps:note', (map, note) => state.maps.update((m) => { const k = str(map, 40); if (!k) return m; if (note) m.notes[k] = str(note, 2000); else delete m.notes[k]; return m; }));
handle('maps:savePreset', (p) => state.maps.update((m) => {
  const preset = { id: UUID.test((p && p.id) || '') ? p.id : crypto.randomUUID(), name: str(p.name, 40) || 'Preset', map: str(p.map, 40),
    filter: { enabled: true, brightness: Number(p.filter.brightness) || 1, contrast: Number(p.filter.contrast) || 1, saturation: Number(p.filter.saturation) || 1 } };
  m.presets = m.presets.filter((x) => x.id !== preset.id); m.presets.push(preset); return m;
}));
handle('maps:deletePreset', (id) => state.maps.update((m) => { m.presets = m.presets.filter((x) => x.id !== id); return m; }));

/* replays */
handle('replays:list', () => state.replays.get().items.map(replayItem).reverse());
handle('replays:start', (meta) => {
  const id = crypto.randomUUID();
  fs.mkdirSync(P.replays, { recursive: true });
  const file = path.join(P.replays, `${id}.webm`);
  recordings.set(id, { fd: fs.openSync(file, 'w'), size: 0, file, meta: meta || {} });
  return id;
});
handle('replays:chunk', (id, data) => {
  const r = recordings.get(id);
  if (!r) throw new Error('Unknown recording');
  const buf = Buffer.from(data);
  r.size += buf.length;
  if (r.size > 8 * 1024 * 1024 * 1024) throw new Error('Recording exceeds 8 GB');
  fs.writeSync(r.fd, buf);
  return r.size;
});
handle('replays:finish', (id, info) => {
  const r = recordings.get(id);
  if (!r) throw new Error('Unknown recording');
  fs.closeSync(r.fd); recordings.delete(id);
  if (r.size === 0) { fs.rmSync(r.file, { force: true }); throw new Error('The recording is empty'); }
  const i = info || {};
  const item = { id, title: str(i.title, 80) || `Recording ${new Date().toLocaleString()}`, createdAt: new Date().toISOString(), durationSec: Math.max(0, Number(i.durationSec) || 0), size: r.size,
    bookmarks: (Array.isArray(i.bookmarks) ? i.bookmarks : []).slice(0, 200).map((b) => ({ t: Math.max(0, Number(b.t) || 0), label: str(b.label, 60) })),
    clipOf: UUID.test(i.clipOf || '') ? i.clipOf : null, inMatch: !!i.inMatch };
  state.replays.update((d) => { d.items.push(item); return d; });
  return replayItem(item);
});
handle('replays:abort', (id) => { const r = recordings.get(id); if (r) { fs.closeSync(r.fd); fs.rmSync(r.file, { force: true }); recordings.delete(id); } });
handle('replays:update', (id, patch) => {
  let out = null;
  state.replays.update((d) => {
    const it = d.items.find((x) => x.id === id);
    if (!it) return d;
    if (typeof patch.title === 'string') it.title = patch.title.slice(0, 80);
    if (Array.isArray(patch.bookmarks)) it.bookmarks = patch.bookmarks.slice(0, 200).map((b) => ({ t: Math.max(0, Number(b.t) || 0), label: str(b.label, 60) }));
    if (Number(patch.durationSec) > 0 && !it.durationSec) it.durationSec = Number(patch.durationSec);
    out = replayItem(it); return d;
  });
  return out;
});
handle('replays:delete', (id) => { if (!UUID.test(id)) return false; fs.rmSync(path.join(P.replays, `${id}.webm`), { force: true }); state.replays.update((d) => { d.items = d.items.filter((x) => x.id !== id); return d; }); return true; });
handle('replays:export', async (id) => {
  const it = state.replays.get().items.find((x) => x.id === id);
  if (!it) throw new Error('Replay not found');
  const file = await pickSave(`${it.title.replace(/[^\w-]+/g, '-')}.webm`, '');
  if (!file) return null;
  fs.copyFileSync(path.join(P.replays, `${id}.webm`), file);
  return file;
});
handle('replays:reveal', (id) => shell.showItemInFolder(path.join(P.replays, `${id}.webm`)));

/* updates */
handle('updates:status', () => ({ ...updates.status(), canRollback: updates.canRollback() }));
handle('updates:check', () => updates.check());
handle('updates:download', () => updates.download());
handle('updates:install', () => updates.install());
handle('updates:rollback', () => updates.rollback());

/* plugins */
handle('plugins:list', () => plugins.list());
handle('plugins:inspectLocal', async () => {
  const [file] = await pickFiles('plugin');
  if (!file) return null;
  return stagePlugin(readSmall(file, 512 << 10).toString('utf8'), 'local');
});
handle('plugins:confirm', (token, grant) => {
  const p = pending.get(token);
  if (!p || Date.now() - p.at > 10 * 60 * 1000) throw new Error('This installation request expired — start again');
  pending.delete(token);
  return plugins.install({ text: p.text, source: p.source, remoteId: p.remoteId || null, approvedPermissions: p.approvedPermissions || null, expectedSha256: p.expectedSha256 || null, grant: Array.isArray(grant) ? grant : [] });
});
handle('plugins:setEnabled', (id, v) => { plugins.setEnabled(id, v); if (!v) game.setPluginOverlay(id, null); return plugins.list(); });
handle('plugins:setPermissions', (id, perms) => { plugins.setPermissions(id, Array.isArray(perms) ? perms : []); if (!(perms || []).includes('hud.overlay')) game.setPluginOverlay(id, null); return plugins.list(); });
handle('plugins:remove', (id) => { plugins.remove(id); game.setPluginOverlay(id, null); return plugins.list(); });
handle('plugins:storageGet', (id) => { const p = plugins.get(id); if (!p || !p.grantedPermissions.includes('storage')) throw new Error('storage permission not granted'); return plugins.storageGet(id); });
handle('plugins:storageSet', (id, key, value) => plugins.storageSet(id, key, value));

/* Polaris server */
handle('server:status', async () => {
  const b = server.base();
  if (!b) return { configured: false };
  try { const h = await server.request('GET', '/health', null, { timeoutMs: 5000 }); const me = await server.session(); return { configured: true, base: b, health: h, user: me }; }
  catch (e) { return { configured: true, base: b, error: e.message, user: server.me }; }
});
handle('server:request', (method, p, body) => server.request(str(method, 8), str(p, 400), body));
handle('server:login', (u, pw, totp) => server.login(str(u, 40), str(pw, 200), str(totp, 12)));
handle('server:register', (u, pw, email) => server.register(str(u, 40), str(pw, 200), str(email, 200)));
handle('server:logout', () => server.logout());
handle('server:uploadItem', (fields, file, preview) => server.uploadItem(fields, { name: str(file.name, 120), type: str(file.type, 80), data: Buffer.from(file.data) }, preview ? { name: str(preview.name, 120), type: 'image/png', data: Buffer.from(preview.data) } : null));
handle('server:uploadLibraryItem', async (libId, fields) => {
  const it = library.get(libId);
  if (!it) throw new Error('Item not found');
  const data = library.read(libId);
  const preview = it.mime.startsWith('image/') && it.mime !== 'image/gif' ? { name: 'preview.png', type: it.mime, data } : null;
  const metadata = it.kind === 'resource' && it.meta.target ? { target: it.meta.target } : undefined;
  return server.uploadItem({ kind: it.kind, ...fields, metadata }, { name: it.file, type: it.mime, data }, preview);
});
const imageCache = new Map();
handle('server:image', async (url) => {
  const u = str(url, 600);
  if (imageCache.has(u)) return imageCache.get(u);
  const { buffer, type } = await server.downloadFile(u, 4 * 1024 * 1024);
  const sniffed = library.sniff(buffer);
  if (!sniffed || !sniffed.mime.startsWith('image/')) throw new Error('Not an image');
  const out = { data: new Uint8Array(buffer), type: sniffed.mime || type };
  imageCache.set(u, out);
  if (imageCache.size > 200) imageCache.delete(imageCache.keys().next().value);
  return out;
});
handle('server:uploadAvatar', (file) => server.uploadAvatar({ name: str(file.name, 120), type: str(file.type, 80), data: Buffer.from(file.data) }));
handle('cloud:push', async () => {
  const bundle = state.exportBundle();
  delete bundle.plugins; // plugin code is not synced
  return server.request('PUT', '/cloud/settings', { data: bundle });
});
handle('cloud:pull', async () => {
  const r = await server.request('GET', '/cloud/settings');
  if (!r || !r.data || r.data.format !== 'polaris-client-export/1') throw new Error('No compatible cloud copy found');
  const s = saveSettings({ ...r.data.settings, account: state.settings.get().account });
  if (r.data.profiles && Array.isArray(r.data.profiles.items)) state.profiles.set({ items: r.data.profiles.items.slice(0, 100).map(cleanProfile), rules: r.data.profiles.rules || { onBattery: null, onAC: null } });
  return { settings: s, updatedAt: r.updatedAt };
});

/* marketplace install: downloads through the server (counts the download), validates, installs locally */
handle('market:install', async (itemId) => {
  const id = Math.round(Number(itemId));
  if (!id) throw new Error('Invalid item');
  const item = await server.request('GET', `/community/items/${id}`);
  if (item.status !== 'approved') throw new Error('Only approved items can be installed');
  if (item.price && item.price.amount) throw new Error('Polaris only distributes free items');
  const data = await server.request('GET', `/community/items/${id}/download`, null, { raw: true, timeoutMs: 120000 });
  if (item.kind === 'plugin') {
    return { plugin: stagePlugin(data.toString('utf8'), 'marketplace', { remoteId: id, approvedPermissions: (item.metadata && item.metadata.approvedPermissions) || [], expectedSha256: (item.metadata && item.metadata.manifest && item.metadata.manifest.sha256) || null }) };
  }
  let payload = data; const meta = {};
  if (['crosshair', 'hud', 'theme', 'workspace'].includes(item.kind)) {
    const r = validate(ITEM_SCHEMAS[item.kind], JSON.parse(data.toString('utf8')));
    if (!r.ok) throw new Error(`Downloaded ${item.kind} is invalid`);
    payload = Buffer.from(JSON.stringify(r.value));
  }
  if (item.kind === 'resource' && item.metadata && typeof item.metadata.target === 'string') meta.target = item.metadata.target;
  const added = library.add({ kind: item.kind, name: item.title, data: payload, source: 'marketplace', remoteId: id, meta, tags: item.tags || [] });
  if (meta.target) { try { library.update(added.id, { target: meta.target, enabled: false }); } catch {} }
  return { libraryItem: library.get(added.id) };
});

module.exports = { registerIpc, applyProfile, applyData, applyPerformanceProfile, sanitizeSettings, saveSettings, cleanProfile, pickSave, pickFiles, readSmall, handle, getCtx: () => ctx, CHANNELS: () => Object.keys(H) };
