'use strict';
/**
 * Polaris Client — main process entry.
 */
const { app, BrowserWindow, protocol, session, net, shell, powerMonitor, desktopCapturer, Menu } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

app.setName('Polaris Client');
if (process.env.POLARIS_USER_DATA) app.setPath('userData', path.resolve(process.env.POLARIS_USER_DATA));

const { P, log, readJson } = require('./core');

/* ---------- startup switches (must run before ready) ---------- */
const bootSettings = readJson(path.join(app.getPath('userData'), 'data', 'settings.json'), {}) || {};
const perf = bootSettings.performance || {};
if (perf.fpsUnlock !== false) { app.commandLine.appendSwitch('disable-frame-rate-limit'); app.commandLine.appendSwitch('disable-gpu-vsync'); }
if (perf.hardwareAcceleration === false) app.disableHardwareAcceleration();
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const STARTUP_FLAGS = { fpsUnlock: perf.fpsUnlock !== false, hardwareAcceleration: perf.hardwareAcceleration !== false };

protocol.registerSchemesAsPrivileged([
  { scheme: 'polaris-app', privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } },
  { scheme: 'polaris-file', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, bypassCSP: false } },
  { scheme: 'polaris-plugin', privileges: { standard: true, secure: true } },
]);

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

const state = require('./state');
const remote = require('./remote');
const game = require('./game');
const library = require('./library');
const metrics = require('./metrics');
const updates = require('./updates');
const plugins = require('./plugins');
const server = require('./server');
let presenceInMatch = false;
const { registerIpc } = require('./ipc');
const extras = require('./extras');
let gameStartedFired = false;

const TITLEBAR = 38;
let win = null; let mode = 'shell';
const SRC = path.join(__dirname, '..');

/* ---------- protocols ---------- */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.txt': 'text/plain', '.webm': 'video/webm' };
const SHELL_CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
  "img-src 'self' polaris-file: data: blob: https:", "media-src 'self' polaris-file: blob:", "font-src 'self'",
  "connect-src 'self' polaris-file:", "frame-src polaris-plugin:", "worker-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'",
].join('; ');
const PLUGIN_CSP = "default-src 'none'; script-src polaris-plugin:; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";

function serveFile(file, headers = {}) {
  const ext = path.extname(file).toLowerCase();
  return net.fetch(pathToFileURL(file).toString()).then((r) => new Response(r.body, { status: r.status, headers: { 'Content-Type': MIME[ext] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', ...headers } }));
}
const notFound = () => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });

function inside(base, rel) {
  const p = path.normalize(path.join(base, rel));
  return p.startsWith(base + path.sep) ? p : null;
}

function registerProtocols(ses) {
  ses.protocol.handle('polaris-file', (req) => {
    const u = new URL(req.url);
    let file = null;
    if (u.host === 'library') file = library.resolveUrl(req.url);
    else if (u.host === 'replays') { const name = decodeURIComponent(u.pathname.slice(1)); if (/^[0-9a-f-]{36}\.webm$/.test(name)) file = path.join(P.replays, name); }
    if (!file || !fs.existsSync(file)) return notFound();
    return serveFile(file, { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' });
  });
}

function registerAppProtocols() {
  protocol.handle('polaris-app', (req) => {
    const u = new URL(req.url);
    if (u.host !== 'shell') return notFound();
    let rel = decodeURIComponent(u.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    let file = null;
    if (rel.startsWith('/shared/')) file = inside(path.join(SRC, 'shared'), rel.slice(8));
    else if (rel.startsWith('/common/')) file = inside(path.join(SRC, 'common'), rel.slice(8));
    else file = inside(path.join(SRC, 'renderer'), rel.slice(1));
    if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return notFound();
    return serveFile(file, rel.endsWith('.html') ? { 'Content-Security-Policy': SHELL_CSP } : {});
  });
  // Plugin frames: polaris-plugin://run/<pluginId>/index.html | runtime.js | plugin.js
  protocol.handle('polaris-plugin', (req) => {
    const u = new URL(req.url);
    const [, id, name] = u.pathname.split('/');
    if (u.host !== 'run') return notFound();
    const p = plugins.get(decodeURIComponent(id || ''));
    if (!p || !p.enabled) return notFound();
    const headers = { 'Content-Security-Policy': PLUGIN_CSP, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' };
    if (name === 'index.html') return new Response(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:10px;font:13px/1.45 system-ui,sans-serif;color:#E8EEF6;background:transparent}</style></head><body><div id="root"></div><script src="runtime.js"></script><script src="plugin.js"></script></body></html>`, { headers: { ...headers, 'Content-Type': 'text/html' } });
    if (name === 'runtime.js') return serveFile(path.join(SRC, 'renderer', 'plugin-runtime.js'), headers);
    if (name === 'plugin.js') return new Response(`(function(){'use strict';\n${p.code}\n})();`, { headers: { ...headers, 'Content-Type': 'text/javascript' } });
    return notFound();
  });
}

/* ---------- window ---------- */
function createWindow() {
  const ws = state.windowState.get();
  const s = state.settings.get();
  const theme = remote.current.config['client.theme'];
  win = new BrowserWindow({
    width: ws.width, height: ws.height, x: s.general.rememberWindow && ws.x != null ? ws.x : undefined, y: s.general.rememberWindow && ws.y != null ? ws.y : undefined,
    minWidth: 1024, minHeight: 640, frame: false, show: false, backgroundColor: theme.colors.bg, title: 'Polaris Client',
    icon: path.join(SRC, 'shared', 'design', 'brand', 'icon-client.png'),
    webPreferences: {
      preload: path.join(SRC, 'preload', 'shell.js'), contextIsolation: true, nodeIntegration: false, sandbox: true,
      webSecurity: true, spellcheck: false, backgroundThrottling: true, devTools: !app.isPackaged || !!process.env.POLARIS_DEVTOOLS,
    },
  });
  if (s.general.rememberWindow && ws.maximized) win.maximize();
  if (s.general.startFullscreen || (s.general.rememberWindow && ws.fullscreen)) win.setFullScreen(true);

  const wc = win.webContents;
  wc.on('will-navigate', (e, url) => { if (!url.startsWith('polaris-app://shell/')) { e.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url); } });
  wc.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  wc.on('will-attach-webview', (e) => e.preventDefault());
  wc.on('before-input-event', (e, input) => hotkey(e, input, 'shell'));
  wc.on('render-process-gone', (_e, d) => { log.error('shell renderer exited', d); if (d.reason !== 'clean-exit') wc.reload(); });
  win.loadURL('polaris-app://shell/index.html');
  win.once('ready-to-show', () => win.show());

  const saveBounds = () => {
    if (!win || win.isDestroyed()) return;
    state.windowState.update((w) => {
      w.maximized = win.isMaximized(); w.fullscreen = win.isFullScreen();
      if (!w.maximized && !w.fullscreen) Object.assign(w, win.getBounds());
      return w;
    });
  };
  for (const ev of ['resize', 'move', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) {
    win.on(ev, () => { layout(); saveBounds(); sendWinState(); });
  }
  win.on('focus', sendWinState); win.on('blur', sendWinState);
  win.on('closed', () => { win = null; });

  game.create(win);
  game.on('input', ({ event, input }) => hotkey(event, input, 'game'));
  game.on('state', (st) => {
    send('game:state', st);
    if (st.loaded && !gameStartedFired) { gameStartedFired = true; extras.fire('gameStart'); }
    if ('inMatch' in st) { if (st.inMatch !== presenceInMatch) extras.fire(st.inMatch ? 'matchStart' : 'matchEnd'); tracker.inMatch(st.inMatch); presenceInMatch = st.inMatch; }
  });
  game.on('metrics', (m) => { metrics.setGameMetrics(m); tracker.metrics(m); });
  metrics.onSample((snap) => send('metrics:sample', snap));
  metrics.onRtt((ms) => game.sendPing(ms));
  updates.onStatus((st) => send('updates:status', st));
  return win;
}

function send(ch, data) { if (win && !win.isDestroyed()) win.webContents.send(ch, data); }
function sendWinState() { if (win && !win.isDestroyed()) send('win:state', { maximized: win.isMaximized(), fullscreen: win.isFullScreen(), focused: win.isFocused(), mode }); }

function layout() {
  if (!win || win.isDestroyed()) return;
  const [w, h] = win.getContentSize();
  const top = win.isFullScreen() ? 0 : TITLEBAR;
  game.setBounds({ x: 0, y: top, width: w, height: Math.max(0, h - top) }, mode === 'play');
}
function setMode(m) {
  mode = m === 'play' ? 'play' : 'shell';
  if (mode === 'play') game.start();
  layout(); sendWinState();
  return mode;
}

/* ---------- hotkeys (window-local, never global) ---------- */
function matches(binding, input) {
  if (!binding) return false;
  const parts = binding.split('+');
  const key = parts.pop();
  const want = { ctrl: parts.includes('Ctrl'), shift: parts.includes('Shift'), alt: parts.includes('Alt') };
  return input.key.toLowerCase() === key.toLowerCase() && !!input.control === want.ctrl && !!input.shift === want.shift && !!input.alt === want.alt;
}
function hotkey(e, input, from) {
  if (input.type !== 'keyDown' || input.isAutoRepeat) return;
  const kb = state.settings.get().game.keybinds;
  if (matches(kb.toggleShell, input)) { e.preventDefault(); setMode(mode === 'play' ? 'shell' : 'play'); return; }
  if (matches(kb.fullscreen, input)) { e.preventDefault(); win.setFullScreen(!win.isFullScreen()); return; }
  if (from === 'game' && matches(kb.reloadGame, input)) { e.preventDefault(); game.reload(); return; }
  if (matches(kb.record, input)) { e.preventDefault(); send('hotkey', 'record'); return; }
  if (matches(kb.bookmark, input)) { e.preventDefault(); send('hotkey', 'bookmark'); game.toast('Bookmark added'); return; }
  if (matches(kb.screenshot, input)) { e.preventDefault(); screenshot(); return; }
  const pk = state.settings.get().commands.paletteKey;
  if (pk && matches(pk, input)) { e.preventDefault(); if (mode === 'play') setMode('shell'); send('hotkey', 'palette'); }
}

async function screenshot() {
  try {
    const target = mode === 'play' && game.view ? game.view.webContents : win.webContents;
    const img = await target.capturePage();
    const dir = path.join(app.getPath('pictures'), 'Polaris');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `polaris-${new Date().toISOString().replace(/[:.]/g, '-')}.png`);
    fs.writeFileSync(file, img.toPNG());
    game.toast(`Screenshot saved to ${file}`, 'ok'); send('toast', { text: `Screenshot saved: ${file}`, level: 'ok' });
  } catch (e) { log.warn('screenshot failed', { error: e.message }); }
}

/* ---------- session tracker (local analytics; nothing invented) ---------- */
const tracker = (() => {
  const session = { id: require('crypto').randomUUID(), start: new Date().toISOString(), end: null, durationSec: 0, inMatchSec: 0, matchesEntered: 0, fpsSamples: 0, fpsSum: 0, fpsMin: null, low1Sum: 0, low1Samples: 0 };
  let matchSince = null;
  const save = () => {
    session.end = new Date().toISOString();
    session.durationSec = Math.round((Date.now() - Date.parse(session.start)) / 1000);
    const inMatch = session.inMatchSec + (matchSince ? (Date.now() - matchSince) / 1000 : 0);
    const out = { id: session.id, start: session.start, end: session.end, durationSec: session.durationSec, inMatchSec: Math.round(inMatch), matchesEntered: session.matchesEntered,
      fpsAvg: session.fpsSamples ? Math.round((session.fpsSum / session.fpsSamples) * 10) / 10 : null, fpsMin: session.fpsMin == null ? null : Math.round(session.fpsMin),
      low1Avg: session.low1Samples ? Math.round((session.low1Sum / session.low1Samples) * 10) / 10 : null, fpsSamples: session.fpsSamples, gameStarted: game.isStarted() || session.matchesEntered > 0 };
    if (!out.gameStarted && out.durationSec < 30) return;
    state.analytics.update((a) => { a.sessions = a.sessions.filter((x) => x.id !== out.id); a.sessions.push(out); if (a.sessions.length > 1000) a.sessions.shift(); return a; });
  };
  setInterval(save, 60000).unref();
  return {
    inMatch(v) {
      if (v && !matchSince) { matchSince = Date.now(); session.matchesEntered++; send('game:match', { started: true }); }
      if (!v && matchSince) { session.inMatchSec += (Date.now() - matchSince) / 1000; matchSince = null; send('game:match', { started: false }); }
    },
    metrics(m) {
      if (!matchSince || m.fps == null) return; // only count frames while a match is on screen
      session.fpsSamples++; session.fpsSum += m.fps; session.fpsMin = session.fpsMin == null ? m.fps : Math.min(session.fpsMin, m.fps);
      if (m.low1 != null) { session.low1Sum += m.low1; session.low1Samples++; }
    },
    save, current: () => ({ id: session.id, start: session.start, durationSec: Math.round((Date.now() - Date.parse(session.start)) / 1000),
      inMatchSec: Math.round(session.inMatchSec + (matchSince ? (Date.now() - matchSince) / 1000 : 0)), matchesEntered: session.matchesEntered,
      fpsAvg: session.fpsSamples ? Math.round((session.fpsSum / session.fpsSamples) * 10) / 10 : null, fpsMin: session.fpsMin == null ? null : Math.round(session.fpsMin),
      low1Avg: session.low1Samples ? Math.round((session.low1Sum / session.low1Samples) * 10) / 10 : null, fpsSamples: session.fpsSamples, inMatchNow: !!matchSince }),
  };
})();

/* ---------- smart profile rules ---------- */
function applyPowerRule(onBattery) {
  const rules = state.profiles.get().rules;
  const id = onBattery ? rules.onBattery : rules.onAC;
  if (!id) return;
  try { require('./ipc').applyProfile(id); send('toast', { text: `Switched to profile for ${onBattery ? 'battery' : 'AC'} power`, level: 'info' }); send('settings:changed'); }
  catch (e) { log.warn('power rule failed', { error: e.message }); }
}

/* ---------- telemetry (opt-in only) ---------- */
async function heartbeat() {
  const s = state.settings.get();
  if (!s.privacy.telemetry || !server.base()) return;
  try { await server.request('POST', '/telemetry/heartbeat', { installId: s.privacy.installId, version: app.getVersion(), channel: s.updates.channel, platform: 'linux' }); } catch {}
}

/* ---------- lifecycle ---------- */
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (ev) => ev.preventDefault());
});
process.on('uncaughtException', (e) => {
  log.error('uncaught exception', { error: e.message, stack: e.stack && e.stack.split('\n').slice(0, 5).join(' | ') });
  const s = state.settings.get();
  if (s.privacy.crashReports && server.base()) server.request('POST', '/telemetry/crash', { installId: s.privacy.installId, version: app.getVersion(), message: e.message.slice(0, 500), stack: String(e.stack || '').slice(0, 8000) }).catch(() => {});
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  log.info(`Polaris Client ${app.getVersion()} starting`, { electron: process.versions.electron, userData: P.root, flags: STARTUP_FLAGS, appImage: !!process.env.APPIMAGE });
  registerAppProtocols();
  registerProtocols(session.defaultSession);
  registerProtocols(session.fromPartition('persist:kirka'));
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(['media', 'display-capture', 'clipboard-sanitized-write', 'fullscreen'].includes(permission)));
  session.defaultSession.setDisplayMediaRequestHandler(async (_req, cb) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } });
      const id = win && win.getMediaSourceId();
      const src = sources.find((x) => x.id === id) || sources.find((x) => x.name === 'Polaris Client');
      cb(src ? { video: src } : {});
    } catch (e) { log.error('display capture failed', { error: e.message }); cb({}); }
  });
  server.loadToken();
  remote.loadCached();
  game.setRemoteConfig(remote.current.config);
  registerIpc({ getWin: () => win, setMode, getMode: () => mode, send, tracker, startupFlags: STARTUP_FLAGS, layout });
  createWindow();
  metrics.start();
  powerMonitor.on('on-battery', () => { applyPowerRule(true); extras.fire('battery'); });
  powerMonitor.on('on-ac', () => { applyPowerRule(false); extras.fire('ac'); });
  extras.start({ onConfig: (cur) => game.setRemoteConfig(cur.config) });

  // Network work happens after the window is up; the client is fully usable offline.
  remote.refresh('client').then((cur) => { game.setRemoteConfig(cur.config); send('config:changed'); }).catch(() => {});
  if (state.settings.get().updates.autoCheck) setTimeout(() => updates.check().then((st) => { if (st.available && state.settings.get().updates.autoDownload && !st.available.held) updates.download().catch(() => {}); }).catch(() => {}), 4000);
  heartbeat(); setInterval(heartbeat, 6 * 3600 * 1000).unref();
  setInterval(() => remote.refresh('client').then((cur) => { game.setRemoteConfig(cur.config); send('config:changed'); }).catch(() => {}), 30 * 60 * 1000).unref();
  // Presence for the Polaris community server (never sent when the user disabled online status).
  const presence = () => {
    if (!server.signedIn || !state.settings.get().privacy.shareOnlineStatus) return;
    server.request('POST', '/presence', { status: presenceInMatch ? 'in-game' : 'online', activity: presenceInMatch ? 'Playing Kirka.io' : null }).catch(() => {});
  };
  setTimeout(presence, 8000); setInterval(presence, 90 * 1000).unref();
  if (state.settings.get().general.autoLaunchGame) setMode('play');
});

app.on('before-quit', () => { tracker.save(); state.flushAll(); try { extras.realtime.stop(); } catch {} });
app.on('window-all-closed', () => app.quit());
