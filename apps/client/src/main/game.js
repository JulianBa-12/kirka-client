'use strict';
/**
 * The Kirka.io game view.
 *
 * - Loads the official game website in a WebContentsView with its own persistent session.
 * - Navigation is restricted to Kirka.io; sign-in popups for known identity providers are
 *   allowed in a sandboxed child window, every other link opens in the system browser.
 * - The game preload only draws overlays (crosshair, HUD, toasts) and applies CSS. It does
 *   not read or modify game memory, network traffic, physics, hitboxes or server values.
 * - The resource swapper only redirects *cosmetic* image/sound requests to local files.
 */
const path = require('path');
const { WebContentsView, session, shell, BrowserWindow } = require('electron');
const { log } = require('./core');
const state = require('./state');
const library = require('./library');

const GAME_HOSTS = /(^|\.)kirka\.io$/i;
const AUTH_HOSTS = /^(accounts\.google\.com|discord\.com|www\.facebook\.com|appleid\.apple\.com|login\.microsoftonline\.com|accounts\.youtube\.com)$/i;
// Third-party ad / tracking networks only. Kirka.io's own requests are never blocked.
const AD_HOSTS = [
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'adservice.google.com', 'pagead2.googlesyndication.com',
  'adnxs.com', 'amazon-adsystem.com', 'adsafeprotected.com', 'moatads.com', 'criteo.com', 'criteo.net', 'taboola.com', 'outbrain.com',
  'pubmatic.com', 'rubiconproject.com', 'openx.net', 'casalemedia.com', 'smartadserver.com', 'adform.net', 'yieldmo.com', 'sharethrough.com',
  'cpmstar.com', 'venatus.media', 'venatusmedia.com', 'adinplay.com', 'api.adinplay.com', 'aniview.com', 'playwire.com', 'ezoic.net',
  'imasdk.googleapis.com', 'scorecardresearch.com', 'quantserve.com', 'hotjar.com', 'googletagservices.com', 'id5-sync.com', '33across.com',
  'media.net', 'contextweb.com', 'lijit.com', 'sovrn.com', 'gumgum.com', 'teads.tv', 'improvedigital.com', 'indexww.com', 'unrulymedia.com',
];
const adRe = new RegExp(`(^|\\.)(${AD_HOSTS.map((h) => h.replace(/\./g, '\\.')).join('|')})$`, 'i');

let view = null; let win = null; let blocked = 0; let swapped = 0;
const listeners = { state: [], metrics: [], input: [] };
const on = (ev, fn) => listeners[ev].push(fn);
const emit = (ev, data) => { for (const fn of listeners[ev]) { try { fn(data); } catch (e) { log.error(`game listener ${ev} failed`, { error: e.message }); } } };

function isGameUrl(u) { try { const x = new URL(u); return x.protocol === 'https:' && GAME_HOSTS.test(x.hostname); } catch { return false; } }

function configureSession(ses) {
  ses.setPermissionRequestHandler((wc, permission, cb, details) => {
    // Pointer lock + fullscreen are what a browser FPS needs; clipboard-sanitized-write for "copy link"; nothing else.
    const ok = ['pointerLock', 'fullscreen', 'clipboard-sanitized-write'].includes(permission) && isGameUrl(details.requestingUrl || wc.getURL());
    cb(ok);
  });
  ses.setPermissionCheckHandler((_wc, permission, origin) => ['pointerLock', 'fullscreen', 'clipboard-sanitized-write'].includes(permission) && isGameUrl(origin));

  ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, cb) => {
    const s = state.settings.get();
    let u; try { u = new URL(details.url); } catch { return cb({}); }
    if (s.game.adblock && adRe.test(u.hostname)) { blocked++; return cb({ cancel: true }); }
    if (s.game.resourceSwapper && GAME_HOSTS.test(u.hostname) && ['image', 'media', 'xhr', 'other', 'fetch'].includes(details.resourceType)) {
      const p = u.pathname;
      const name = p.split('/').pop();
      if (/\.(png|jpe?g|webp|ogg|mp3|wav)$/i.test(name)) { recent.delete(p); recent.set(p, { path: p, type: details.resourceType, at: Date.now() }); if (recent.size > 400) recent.delete(recent.keys().next().value); }
      const hit = library.activeSwaps().find((x) => (x.target.startsWith('/') ? x.target === p : x.target === name));
      if (hit) { swapped++; return cb({ redirectURL: hit.url }); }
    }
    cb({});
  });
  ses.webRequest.onHeadersReceived({ urls: ['polaris-file://*/*'] }, (d, cb) => cb({ responseHeaders: { ...d.responseHeaders, 'Access-Control-Allow-Origin': ['*'] } }));
}

const recent = new Map(); // swappable game files seen this session (path → info)

function create(mainWindow) {
  win = mainWindow;
  const ses = session.fromPartition('persist:kirka');
  configureSession(ses);
  const s = state.settings.get();
  view = new WebContentsView({
    webPreferences: {
      session: ses,
      preload: path.join(__dirname, '..', 'preload', 'game.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: !!s.performance.backgroundThrottling,
      spellcheck: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  view.setBackgroundColor('#000000');
  view.setVisible(false);
  win.contentView.addChildView(view);
  const wc = view.webContents;

  wc.setWindowOpenHandler(({ url }) => {
    let host = ''; try { host = new URL(url).hostname; } catch {}
    if (isGameUrl(url) || AUTH_HOSTS.test(host)) {
      return { action: 'allow', overrideBrowserWindowOptions: { parent: win, width: 520, height: 700, autoHideMenuBar: true, backgroundColor: '#0b0f18', webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false } } };
    }
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('did-create-window', (child) => {
    child.webContents.on('will-navigate', (e, url) => { let h = ''; try { h = new URL(url).hostname; } catch {} if (!isGameUrl(url) && !AUTH_HOSTS.test(h)) e.preventDefault(); });
  });
  wc.on('will-navigate', (e, url) => { if (!isGameUrl(url)) { e.preventDefault(); if (/^https?:\/\//.test(url)) shell.openExternal(url); } });
  wc.on('will-redirect', (e, url) => { let h = ''; try { h = new URL(url).hostname; } catch {} if (!isGameUrl(url) && !AUTH_HOSTS.test(h)) e.preventDefault(); });
  wc.on('will-attach-webview', (e) => e.preventDefault());
  wc.on('before-input-event', (e, input) => emit('input', { event: e, input, from: 'game' }));
  wc.on('render-process-gone', (_e, d) => { log.error('game renderer exited', d); emit('state', { crashed: true, reason: d.reason }); });
  wc.on('unresponsive', () => log.warn('game view is unresponsive'));
  wc.on('did-fail-load', (_e, code, desc, url, isMain) => { if (isMain && code !== -3) { log.warn('game failed to load', { code, desc, url }); emit('state', { loadError: { code, desc } }); } });
  wc.on('did-finish-load', () => { emit('state', { loaded: true, url: wc.getURL() }); pushConfig(); });
  wc.on('page-title-updated', (_e, title) => emit('state', { title }));
  wc.ipc.on('game:metrics', (_e, m) => { if (m && typeof m === 'object') emit('metrics', sanitizeMetrics(m)); });
  wc.ipc.on('game:state', (_e, st) => { if (st && typeof st === 'object') emit('state', { inMatch: !!st.inMatch, menu: !!st.menu }); });
  wc.ipc.handle('game:config', () => buildOverlayConfig());
  return view;
}

function sanitizeMetrics(m) {
  const n = (v, max) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(v, max)) : null);
  return { fps: n(m.fps, 2000), frameTime: n(m.frameTime, 10000), frameTimeP99: n(m.frameTimeP99, 10000), low1: n(m.low1, 2000), at: Date.now() };
}

let started = false;
function start() {
  if (!view) return;
  if (!started) { started = true; view.webContents.loadURL(state.settings.get().game.url || 'https://kirka.io/'); log.info('game view loading kirka.io'); }
}
const isStarted = () => started;
function reload() { if (view && started) view.webContents.reload(); }
function stop() { if (view && started) { view.webContents.loadURL('about:blank'); started = false; } }

function setBounds(b, visible) {
  if (!view) return;
  view.setBounds(b);
  view.setVisible(!!visible);
  if (visible) view.webContents.focus();
}

/** Overlay configuration for the game preload, derived from settings + remote config. */
let remoteCfg = null; let pluginOverlay = {};
function setRemoteConfig(cfg) { remoteCfg = cfg; pushConfig(); }
function setPluginOverlay(id, text) { if (text == null) delete pluginOverlay[id]; else pluginOverlay[id] = String(text).slice(0, 80); pushConfig(); }

function buildOverlayConfig() {
  const s = state.settings.get();
  const hud = (remoteCfg && remoteCfg['client.hud']) || state.DEFAULTS['client.hud'];
  const preset = hud.presets.find((p) => p.id === s.game.hudPreset) || hud.presets.find((p) => p.id === hud.defaultPreset) || hud.presets[0];
  const elements = s.game.hudCustom || (preset && preset.elements) || {};
  const flags = ((remoteCfg && remoteCfg['client.features']) || state.DEFAULTS['client.features']).flags;
  let bg = null;
  if (s.game.menuBackground && s.backgrounds.currentId) { const it = library.get(s.backgrounds.currentId); if (it && it.mime.startsWith('image/')) bg = it.url; }
  return {
    crosshair: flags.crosshairStudio.enabled && s.game.crosshairEnabled ? s.game.crosshair : null,
    hideGameCrosshair: !!(s.game.crosshairEnabled && s.game.hideGameCrosshair && flags.crosshairStudio.enabled),
    hud: flags.hudEditor.enabled ? elements : {},
    css: s.game.gameCssEnabled ? String(s.game.gameCss || '').slice(0, 100000) : '',
    adblockCss: !!s.game.adblock,
    visualFilter: s.game.visualFilter,
    menuBackground: bg,
    selectors: s.advanced.selectorsOverride || '',
    motion: s.appearance.motion,
    plugins: pluginOverlay,
  };
}
function pushConfig() { if (view && started && !view.webContents.isDestroyed()) view.webContents.send('game:config', buildOverlayConfig()); }
function toast(text, level = 'info') { if (view && started) view.webContents.send('game:toast', { text: String(text).slice(0, 200), level }); }
function sendPing(ms) { if (view && started) view.webContents.send('game:ping', ms); }

module.exports = { create, start, stop, reload, setBounds, on, pushConfig, setRemoteConfig, setPluginOverlay, toast, sendPing, isStarted, isGameUrl, get view() { return view; }, stats: () => ({ blocked, swapped }), recentResources: () => [...recent.values()].reverse() };
