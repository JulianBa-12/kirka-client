/* Polaris Client shell — boot, theme, navigation, routing, Command Center, realtime events. */
import { h, icon, clear, $ } from './lib/dom.js';
import { api, on, store, cfg, flag, emit, subscribe, toast, updateSettings, reloadRemote, refreshServer, modal, t } from './lib/store.js';
import { setLanguage } from './lib/i18n.js';
import * as recorder from './lib/recorder.js';
import * as pluginHost from './lib/plugin-host.js';
import { initCommands, openPalette, openQuickAccess, runById, comboOf, quickAccessCommands } from './lib/commands.js';
import { smartSetup } from './lib/setup.js';

const VIEWS = {
  home: () => import('./views/home.js'), play: () => import('./views/play.js'), customization: () => import('./views/customization.js'),
  skins: () => import('./views/skins.js'), inventory: () => import('./views/inventory.js'), marketplace: () => import('./views/marketplace.js'),
  social: () => import('./views/social.js'), analytics: () => import('./views/analytics.js'), replays: () => import('./views/replays.js'),
  performance: () => import('./views/performance.js'), profiles: () => import('./views/profiles.js'), resources: () => import('./views/resources.js'),
  maps: () => import('./views/maps.js'), plugins: () => import('./views/plugins.js'), updates: () => import('./views/updates.js'),
  settings: () => import('./views/settings.js'), hub: () => import('./views/hub.js'),
  hud: () => import('./views/hud.js'), crosshair: () => import('./views/crosshair.js'), backgrounds: () => import('./views/backgrounds.js'),
  lab: () => import('./views/lab.js'), gallery: () => import('./views/gallery.js'), journal: () => import('./views/journal.js'),
  workspace: () => import('./views/workspace.js'), automation: () => import('./views/automation.js'), backups: () => import('./views/backups.js'),
  diagnostics: () => import('./views/diagnostics.js'),
};
const FLAG_FOR = {
  skins: 'skinStudio', marketplace: 'marketplace', social: 'social', replays: 'replays', analytics: 'analytics', plugins: 'plugins', resources: 'resourceSwapper',
  hud: 'hudEditor', crosshair: 'crosshairStudio', backgrounds: 'backgroundStudio', maps: 'mapStudio', lab: 'visualLab', gallery: 'creatorGallery',
  journal: 'sessionJournal', workspace: 'workspaces', automation: 'profileAutomation', backups: 'backupVault', diagnostics: 'diagnostics',
};
const TOOLS = ['customization', 'lab', 'gallery', 'journal', 'profiles', 'workspace', 'automation', 'backups', 'diagnostics', 'updates'];
const PINNED = new Set(['home', 'settings']);

let current = null; let cleanup = null; let routeToken = 0;

function bootStep(t) { const el = document.getElementById('boot-step'); if (el) el.textContent = t; }

/* ---------- theme ---------- */
export function applyTheme() {
  let theme = cfg('client.theme');
  const s = store.settings;
  if (s.appearance.themeItemId) {
    const it = store.themeItem;
    if (it && it.meta && it.meta.content && it.meta.content.theme) theme = it.meta.content.theme;
  }
  const c = theme.colors;
  const map = { bg: 'bg', panel: 'panel', panel2: 'panel2', line: 'line', text: 'text', text2: 'text2', text3: 'text3', accent: 'accent', accent2: 'accent2', accent3: 'accent3', ok: 'ok', warn: 'warn', danger: 'danger', titlebar: 'titlebar', sidebar: 'sidebar', buttonBg: 'btn', buttonText: 'btn-text', buttonHover: 'btn-hover', buttonActive: 'btn-active' };
  const vars = Object.entries(map).map(([k, v]) => `--c-${v}: ${c[k]};`).join(' ');
  const t = theme.typography; const sh = theme.shape; const fx = theme.effects;
  const font = (f) => `'${f}', system-ui, sans-serif`;
  document.getElementById('theme-vars').textContent = `:root { ${vars} --font-ui: ${font(t.ui)}; --font-display: ${font(t.display)}; --font-mono: '${t.mono}', ui-monospace, monospace; --fs-base: ${t.baseSize}px; --radius: ${sh.radius}px; --chamfer: ${sh.chamfer}px; --t: ${fx.transitionMs}ms; ${fx.shadow === 'none' ? '--shadow: none;' : fx.shadow === 'deep' ? '--shadow: 0 10px 30px rgba(0,0,0,.45);' : ''} }`;
  const motion = fx.animations && s.appearance.motion;
  const root = document.documentElement;
  root.dataset.motion = motion ? 'on' : 'off';
  root.dataset.effects = s.appearance.decorativeEffects ? 'on' : 'off';
  root.dataset.density = s.appearance.density;
  document.getElementById('shell').style.zoom = String(s.appearance.uiScale || 1);
  document.getElementById('owner-css').textContent = cfg('client.css').overrides || '';
}

async function loadThemeItem() {
  const id = store.settings.appearance.themeItemId;
  store.themeItem = null;
  if (id) { const items = await api('library:list', 'theme'); store.themeItem = items.find((i) => i.id === id) || null; }
}

/* ---------- stage background (menu backdrop behind the shell) ---------- */
let bgTimer = null;
async function applyBackground() {
  const el = document.getElementById('stage-bg');
  clear(el); el.classList.remove('is-on'); el.style.backgroundImage = '';
  const s = store.settings;
  if (!s.appearance.shellBackground || !s.backgrounds.currentId || !flag('backgroundStudio').enabled) return;
  const items = await api('library:list', 'background');
  const it = items.find((i) => i.id === s.backgrounds.currentId);
  if (!it) return;
  if (it.mime.startsWith('video/')) {
    if (!s.performance.animatedBackgrounds) return; // animated backgrounds are opt-in (performance)
    el.appendChild(h('video', { src: it.url, muted: true, loop: true, autoplay: true, playsinline: true }));
  } else el.style.backgroundImage = `url("${it.url}")`;
  el.classList.add('is-on');
}
function scheduleRotation() {
  clearInterval(bgTimer);
  const r = store.settings.backgrounds.rotation;
  const q = store.settings.backgrounds.queue;
  if (!r.enabled || q.length < 2) return;
  bgTimer = setInterval(() => {
    const queue = store.settings.backgrounds.queue;
    if (queue.length < 2) return;
    const i = queue.indexOf(store.settings.backgrounds.currentId);
    let next;
    if (store.settings.backgrounds.rotation.random) { do { next = queue[Math.floor(Math.random() * queue.length)]; } while (next === store.settings.backgrounds.currentId); }
    else next = queue[(i + 1) % queue.length];
    updateSettings((st) => { st.backgrounds.currentId = next; });
  }, Math.max(1, r.intervalMinutes) * 60000);
}

/* ---------- navigation ---------- */
function navVisible(dest) {
  const f = FLAG_FOR[dest];
  return !f || flag(f).visible;
}
const destInfo = (id) => store.info.destinations.find((x) => x.id === id);
/** Menu model: remote navigation (Owner) + user layout (order/hidden) + Tools group. Destinations
 *  that an older remote configuration does not know yet are appended so new pages stay reachable. */
function navModel({ includeHidden = false } = {}) {
  const remoteItems = cfg('client.navigation').items;
  const known = new Set(remoteItems.map((i) => i.destination));
  const extra = store.info.destinations.filter((d) => !known.has(d.id) && !TOOLS.includes(d.id))
    .map((d, i) => ({ destination: d.id, label: d.label, icon: d.icon, description: d.description, visible: true, order: 900 + i, group: 'main' }));
  const items = remoteItems.concat(extra).filter((i) => i.visible && VIEWS[i.destination] && navVisible(i.destination)).sort((a, b) => a.order - b.order);
  const hidden = includeHidden ? new Set() : new Set(store.settings.layout.navHidden.filter((d) => !PINNED.has(d)));
  const order = store.settings.layout.navOrder;
  const rank = (d) => { const i = order.indexOf(d); return i < 0 ? 1000 : i; };
  const main = items.filter((i) => i.group !== 'footer' && !hidden.has(i.destination)).map((it, i) => ({ it, i })).sort((a, b) => (rank(a.it.destination) - rank(b.it.destination)) || (a.i - b.i)).map((x) => x.it);
  const footer = items.filter((i) => i.group === 'footer' && !hidden.has(i.destination));
  const inNav = new Set(items.map((i) => i.destination));
  // Everything not placed in the menu by the Owner is reachable under Tools (same rule as 1.0).
  const rest = store.info.destinations.map((d) => d.id).filter((d) => !TOOLS.includes(d));
  const tools = [...TOOLS, ...rest].filter((d) => !inNav.has(d) && VIEWS[d] && navVisible(d) && destInfo(d)).map((d) => { const x = destInfo(d); return { destination: d, label: x.label, icon: x.icon, description: x.description }; });
  return { main, footer, tools };
}
/** Every destination the player can order in the menu (main group, then footer), hidden ones included. */
export function navDestinations() { const m = navModel({ includeHidden: true }); return [...m.main, ...m.footer].map((i) => i.destination); }
export function destinationVisible(d) { return !!VIEWS[d] && navVisible(d); }

function renderRail() {
  const rail = clear(document.getElementById('rail'));
  const { main, footer, tools } = navModel();
  const btn = (it) => {
    const b = h(`button.nav${current === it.destination ? '.is-active' : ''}`, { type: 'button', title: t(it.description || ''), dataset: { dest: it.destination } }, icon(it.icon, 17), h('span', t(it.label)));
    const fl = FLAG_FOR[it.destination] && flag(FLAG_FOR[it.destination]);
    if (fl && fl.beta) b.appendChild(h('span.badge.badge-muted', 'Beta'));
    if (it.destination === 'play') b.appendChild(h('span.nav-kbd', store.settings.game.keybinds.toggleShell || 'F1'));
    b.addEventListener('click', () => go(it.destination));
    return b;
  };
  const open = store.settings.layout.toolsOpen || tools.some((x) => x.destination === current);
  const toolsHead = h('button.rail-label.pl-label.rail-toggle', { type: 'button', 'aria-expanded': String(open), on: { click: () => updateSettings((s) => { s.layout.toolsOpen = !open; }).then(renderRail) } }, h('span', t('Tools')), icon(open ? 'chevron-down' : 'chevron-right', 12));
  rail.appendChild(h('div.rail-group', main.map(btn), tools.length ? [toolsHead, open ? tools.map(btn) : null] : null));
  rail.appendChild(h('div.rail-group', footer.map(btn)));
}

const REDIRECT_TABS = { crosshair: 'crosshair', hud: 'hud', backgrounds: 'backgrounds' };

export async function go(dest, params = {}) {
  document.querySelectorAll('.palette-overlay,.quick-menu').forEach((el) => el.remove());
  if (dest === 'customization' && params.tab && REDIRECT_TABS[params.tab]) { dest = REDIRECT_TABS[params.tab]; params = {}; }
  if (!VIEWS[dest]) dest = 'home';
  const f = FLAG_FOR[dest];
  current = dest; store.route = { dest, params };
  for (const b of document.querySelectorAll('.nav')) b.classList.toggle('is-active', b.dataset.dest === dest);
  const d = destInfo(dest);
  const ctxEl = clear(document.getElementById('tb-context'));
  ctxEl.appendChild(h('b', t((cfg('client.navigation').items.find((i) => i.destination === dest) || d || {}).label || dest)));
  if (d && d.description) ctxEl.appendChild(h('span', t(d.description)));
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  pluginHost.hidePanel();
  const view = clear(document.getElementById('view'));
  const token = ++routeToken;
  if (f && !flag(f).enabled) {
    view.appendChild(h('div.page', h('div.page-head', h('div', h('h1', flag(f).label), h('p', 'This feature is currently turned off by the Polaris team. It will come back automatically when it is re-enabled.')))));
    return;
  }
  try {
    const mod = await VIEWS[dest]();
    if (token !== routeToken) return;
    const page = h('div.page');
    view.appendChild(page);
    cleanup = (await mod.render(page, params)) || null;
    view.scrollTop = 0; view.focus({ preventScroll: true });
  } catch (e) {
    console.error(e);
    view.appendChild(h('div.page', h('div.note.note-danger', h('b', 'This page failed to load. '), e.message)));
  }
}

/** Applies the result of workspace:activate (settings + restart hint). */
export function applyWorkspaceResult(r) {
  if (!r) return;
  if (r.settings) { store.settings = r.settings; emit('settings', r.settings); }
  renderRail();
  if (r.restartRequired) restartNotice('The workspace changed settings that take effect after a restart.');
}

/* ---------- banners (maintenance, restart required, announcements) ---------- */
const banners = new Map();
function setBanner(id, content) {
  const root = document.getElementById('banners');
  if (banners.has(id)) { banners.get(id).remove(); banners.delete(id); }
  if (!content) return;
  const el = h(`div.banner.banner-${content.level || 'info'}`, { role: 'status' }, icon(content.icon || 'info', 15), h('div.banner-text', content.title ? h('b', t(content.title), ' ') : null, t(content.text || '')),
    content.action ? h('button.btn.btn-ghost.btn-sm', { type: 'button', on: { click: content.action.run } }, t(content.action.label)) : null,
    content.dismiss === false ? null : h('button.banner-x', { type: 'button', 'aria-label': 'Dismiss', on: { click: () => setBanner(id, null) } }, icon('close', 13)));
  banners.set(id, el); root.appendChild(el);
}
function restartNotice(text) {
  setBanner('restart', { level: 'warn', icon: 'refresh', title: 'Restart required.', text, action: { label: 'Restart now', run: () => api('app:relaunch') } });
}
function maintenanceBanner(m) {
  if (!m || !(m.active || m.enabled)) return setBanner('maintenance', null);
  setBanner('maintenance', { level: 'warn', icon: 'alert', title: 'Maintenance.', text: m.message || 'Community features are temporarily unavailable.', dismiss: false });
}

/* ---------- titlebar ---------- */
function titlebarButtons() {
  const set = (id, ic, fn, title) => { const b = document.getElementById(id); if (!b) return null; clear(b).appendChild(icon(ic, 14)); b.onclick = fn; if (title) { b.title = t(title); b.setAttribute('aria-label', t(title)); } return b; };
  set('tb-min', 'minimize', () => api('win:minimize'), 'Minimize');
  set('tb-max', store.win.maximized ? 'restore' : 'maximize', () => api('win:maximize'), store.win.maximized ? 'Restore' : 'Maximize');
  set('tb-close', 'close', async () => {
    if (recorder.isRecording()) { await recorder.stop(); }
    if (store.settings.general.confirmQuit) {
      modal({ title: 'Quit Polaris?', body: h('p.modal-text', 'The game session will end.'), actions: [{ label: 'Cancel', onClick: () => {} }, { label: 'Quit', kind: 'danger', onClick: () => api('win:close') }] });
    } else api('win:close');
  }, 'Close');
  set('tb-full', 'external', () => api('win:fullscreen'), `Fullscreen (${store.settings.game.keybinds.fullscreen})`);
  const cmd = set('tb-cmd', 'search', () => openPalette(), `Command Center (${store.settings.commands.paletteKey})`);
  if (cmd) cmd.hidden = !flag('commandCenter').visible;
  const quick = document.getElementById('tb-quick');
  set('tb-quick', 'bolt', () => openQuickAccess(quick), 'Quick access');
  const play = document.getElementById('tb-play');
  clear(play).append(icon(store.win.mode === 'play' ? 'grid' : 'play', 13), h('span', t(store.win.mode === 'play' ? 'Shell' : (store.game.started ? 'Game' : 'Play'))));
  play.title = `${t('Toggle game')} (${store.settings.game.keybinds.toggleShell})`;
  play.classList.toggle('is-live', store.game.started);
  play.onclick = () => api('shell:mode', store.win.mode === 'play' ? 'shell' : 'play');
}

function renderStatus() {
  const el = clear(document.getElementById('tb-status'));
  const m = store.metrics;
  if (store.game.started) {
    el.appendChild(h(`span.st.${store.game.inMatch ? 'ok' : ''}`, h('i'), t(store.game.inMatch ? 'In match' : 'Kirka.io')));
    if (m && m.fps != null) el.appendChild(h('span.st', h('b', Math.round(m.fps)), 'fps'));
  }
  if (m && m.rtt != null) el.appendChild(h('span.st', { title: 'HTTPS round-trip time to kirka.io — not the in-game server ping' }, h('b', Math.round(m.rtt)), 'ms rtt'));
  if (recorder.isRecording()) el.appendChild(h('span.st.live', h('i'), 'REC'));
  if (store.remote.preview) el.appendChild(h('span.st.warn', h('i'), 'Preview config'));
  const rt = store.realtime;
  if (rt && rt.state === 'connected') el.appendChild(h('span.st.ok', { title: `${t('Live connection to')} ${rt.url || 'server'} · ${rt.events} ${t('events')}` }, h('i'), t('Live')));
  else if (rt && store.settings.realtime.enabled && store.settings.account.serverUrl && ['connecting', 'error', 'closed'].includes(rt.state)) el.appendChild(h('span.st.warn', { title: rt.reason || '' }, h('i'), t('Offline')));
  if (store.server.user) el.appendChild(h('span.st', icon('users', 12), store.server.user.username));
}

/* ---------- onboarding (when Smart Setup is turned off by the Owner) ---------- */
function onboarding() {
  const s = store.settings;
  modal({
    title: 'Welcome to Polaris',
    wide: true,
    body: h('div.stack',
      h('p.text2', 'Polaris is a desktop client for Kirka.io. It loads the official game and adds a custom crosshair, HUD overlays, local cosmetics, recording and performance tools around it.'),
      h('div.rows',
        h('div.row', h('div.row-text', h('div.row-title', 'What Polaris does not do'), h('div.row-desc', 'No cheats, aimbots, wallhacks or automation. Polaris does not read game memory, change hitboxes or touch your Kirka account, inventory or KC. Skins you create here are local cosmetics.'))),
        h('div.row', h('div.row-text', h('div.row-title', 'Shortcuts'), h('div.row-desc', `${s.game.keybinds.toggleShell} switches between Polaris and the game · ${s.game.keybinds.fullscreen} fullscreen · ${s.game.keybinds.record} record · ${s.game.keybinds.screenshot} screenshot · ${s.commands.paletteKey} Command Center`))),
        h('div.row', h('div.row-text', h('div.row-title', 'Privacy'), h('div.row-desc', 'Usage statistics and crash reports are off. You can opt in under Settings → Privacy. Community features need a Polaris server account (Settings → Account).'))))),
    actions: [{ label: 'Start', kind: 'primary', onClick: () => updateSettings((st) => { st.onboardingDone = true; }, { immediate: true }) }],
    onClose: () => updateSettings((st) => { st.onboardingDone = true; }),
  });
}
export function startOnboarding() { if (flag('smartSetup').enabled) smartSetup(); else onboarding(); }

async function toggleRecord() {
  if (!flag('replays').enabled) return toast('Replay Studio is disabled', 'warn');
  recorder.isRecording() ? await recorder.stop() : await recorder.start();
  renderStatus();
}

/* ---------- realtime ---------- */
function onRealtimeEvent({ event, data }) {
  const d = data || {};
  if (event === 'maintenance') maintenanceBanner(d);
  else if (event === 'announcements.changed') {
    const before = new Set((store.remote.announcements || []).map((a) => a.id));
    store.remote.announcements = d.items || [];
    emit('announcements', store.remote.announcements);
    for (const a of store.remote.announcements) if (!before.has(a.id)) toast(`${a.title}${a.body ? ` — ${a.body}` : ''}`, a.level === 'critical' ? 'error' : a.level === 'warning' ? 'warn' : 'info', 8000);
  } else if (event === 'notification') { toast(`${d.title}${d.body ? ` — ${d.body}` : ''}`, 'info', 6000); emit('notification', d); }
  else if (event === 'releases.changed') {
    api('updates:check').then((st) => { if (st && st.available && !st.available.held) setBanner('update', { level: 'info', icon: 'download', title: `Polaris ${st.available.version}`, text: 'is available.', action: { label: 'Open Update Center', run: () => { setBanner('update', null); go('updates'); } } }); }).catch(() => {});
  } else if (event === 'news.changed') emit('news', d);
  emit('realtime', { event, data: d });
}

/* ---------- boot ---------- */
async function boot() {
  bootStep('Loading settings');
  [store.info, store.settings, store.remote] = await Promise.all([api('app:info'), api('settings:get'), api('config:get')]);
  store.win = await api('win:state');
  setLanguage(store.settings.general.language);
  await loadThemeItem();
  applyTheme();
  bootStep('Preparing interface');
  initCommands({ go, toggleRecord, visible: destinationVisible });
  renderRail(); titlebarButtons(); renderStatus();
  applyBackground(); scheduleRotation();

  on('win:state', (w) => {
    store.win = w;
    document.documentElement.dataset.fullscreen = String(w.fullscreen);
    document.documentElement.dataset.mode = w.mode;
    titlebarButtons();
    emit('win', w);
  });
  on('game:state', (st) => {
    if (st.loaded || st.title) store.game.started = true;
    if ('inMatch' in st) store.game.inMatch = st.inMatch;
    if (st.loadError) toast(`Kirka.io could not be loaded (${st.loadError.desc}). Check your connection and press F5 in the game view.`, 'error', 8000);
    if (st.crashed) toast('The game view stopped unexpectedly. Open Play to start it again.', 'error', 8000);
    Object.assign(store.game, st); titlebarButtons(); renderStatus(); emit('game', store.game);
  });
  on('game:match', (m) => { emit('match', m); pluginHost.broadcast('match', m); });
  let lastStatus = 0;
  on('metrics:sample', (m) => {
    store.metrics = m; emit('metrics', m); pluginHost.broadcast('metrics', { fps: m.fps, frameTime: m.frameTime });
    if (Date.now() - lastStatus > 1000) { lastStatus = Date.now(); renderStatus(); }
  });
  on('updates:status', (st) => emit('updates', st));
  on('hotkey', async (k) => {
    if (k === 'record') await toggleRecord();
    if (k === 'bookmark') recorder.bookmark();
    if (k === 'palette') openPalette();
  });
  on('toast', (tt) => toast(tt.text, tt.level));
  on('config:changed', async (info) => {
    await reloadRemote(); applyTheme(); renderRail(); titlebarButtons(); pluginHost.broadcast('theme', cfg('client.theme').colors);
    emit('config', info || {});
    if (info && info.live) {
      if (info.restartRequired) restartNotice(`New configuration from the Polaris team${info.domains && info.domains.length ? ` (${info.domains.join(', ')})` : ''} takes full effect after a restart.`);
      else toast('Configuration updated live', 'ok', 2000);
      if (current && ['home', 'settings', 'performance', 'hud', 'crosshair', 'backgrounds', 'customization'].includes(current) && !document.querySelector('.modal')) go(current, store.route.params);
    }
  });
  on('settings:changed', async () => { store.settings = await api('settings:get'); emit('settings', store.settings); });
  on('realtime:status', (st) => { store.realtime = st; if (st.maintenance) maintenanceBanner(st.maintenance); renderStatus(); emit('realtime:status', st); });
  on('realtime:event', onRealtimeEvent);
  api('realtime:status').then((st) => { store.realtime = st; if (st && st.maintenance) maintenanceBanner(st.maintenance); renderStatus(); }).catch(() => {});

  let prevBg = store.settings.backgrounds.currentId; let prevTheme = store.settings.appearance.themeItemId; let prevRot = JSON.stringify(store.settings.backgrounds.rotation) + store.settings.backgrounds.queue.length;
  let prevLang = store.settings.general.language; let prevLayout = JSON.stringify(store.settings.layout);
  subscribe('settings', async (s) => {
    if (s.appearance.themeItemId !== prevTheme) { prevTheme = s.appearance.themeItemId; await loadThemeItem(); }
    applyTheme();
    const rot = JSON.stringify(s.backgrounds.rotation) + s.backgrounds.queue.length;
    if (rot !== prevRot) { prevRot = rot; scheduleRotation(); }
    if (s.backgrounds.currentId !== prevBg) { prevBg = s.backgrounds.currentId; }
    applyBackground();
    const lay = JSON.stringify(s.layout);
    if (lay !== prevLayout) { prevLayout = lay; renderRail(); }
    if (s.general.language !== prevLang) {
      prevLang = s.general.language; setLanguage(prevLang);
      renderRail(); titlebarButtons(); renderStatus(); go(current, store.route.params);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && store.win.mode === 'play') { api('shell:mode', 'shell'); return; }
    const tag = (e.target && e.target.tagName) || '';
    if (document.querySelector('.palette-overlay')) return;
    const combo = comboOf(e);
    if (!combo) return;
    const id = store.settings.commands.shortcuts[combo];
    if (id && !(['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) && !/^(Ctrl|Alt)\+|^F\d/.test(combo))) { e.preventDefault(); runById(id); }
  });

  recorder.init();
  pluginHost.init();
  refreshServer().then(renderStatus);

  bootStep('Ready');
  await go(store.settings.general.startView in VIEWS ? store.settings.general.startView : 'home');
  document.getElementById('boot').classList.add('is-done');
  setTimeout(() => document.getElementById('boot').remove(), 400);
  if (!store.settings.onboardingDone) startOnboarding();
  if (store.remote.rejected && store.remote.rejected.length) toast(`${store.remote.rejected.length} remote configuration section(s) failed validation and were ignored.`, 'warn');
}

window.addEventListener('error', (e) => console.error('[polaris]', e.message));
boot().catch((e) => {
  console.error(e);
  bootStep(`Startup failed: ${e.message}`);
});

export { renderRail, renderStatus, quickAccessCommands, setBanner };
