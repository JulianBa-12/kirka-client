/* Polaris Client shell — boot, theme, navigation, routing. */
import { h, icon, clear, $ } from './lib/dom.js';
import { api, on, store, cfg, flag, emit, subscribe, toast, updateSettings, reloadRemote, refreshServer, modal } from './lib/store.js';
import * as recorder from './lib/recorder.js';
import * as pluginHost from './lib/plugin-host.js';

const VIEWS = {
  home: () => import('./views/home.js'), play: () => import('./views/play.js'), customization: () => import('./views/customization.js'),
  skins: () => import('./views/skins.js'), inventory: () => import('./views/inventory.js'), marketplace: () => import('./views/marketplace.js'),
  social: () => import('./views/social.js'), analytics: () => import('./views/analytics.js'), replays: () => import('./views/replays.js'),
  performance: () => import('./views/performance.js'), profiles: () => import('./views/profiles.js'), resources: () => import('./views/resources.js'),
  maps: () => import('./views/maps.js'), plugins: () => import('./views/plugins.js'), updates: () => import('./views/updates.js'),
  settings: () => import('./views/settings.js'), hub: () => import('./views/hub.js'),
};
const FLAG_FOR = { skins: 'skinStudio', marketplace: 'marketplace', social: 'social', replays: 'replays', analytics: 'analytics', plugins: 'plugins', resources: 'resourceSwapper' };
const TOOLS = ['performance', 'profiles', 'resources', 'maps', 'plugins', 'updates'];

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
function renderRail() {
  const rail = clear(document.getElementById('rail'));
  const items = cfg('client.navigation').items.filter((i) => i.visible && navVisible(i.destination)).sort((a, b) => a.order - b.order);
  const main = items.filter((i) => i.group === 'main');
  const footer = items.filter((i) => i.group === 'footer');
  const inNav = new Set(items.map((i) => i.destination));
  const tools = TOOLS.filter((d) => !inNav.has(d) && navVisible(d)).map((d) => store.info.destinations.find((x) => x.id === d));
  const btn = (it) => {
    const b = h(`button.nav${current === it.destination ? '.is-active' : ''}`, { type: 'button', title: it.description || '', dataset: { dest: it.destination } }, icon(it.icon, 17), h('span', it.label));
    const fl = FLAG_FOR[it.destination] && flag(FLAG_FOR[it.destination]);
    if (fl && fl.beta) b.appendChild(h('span.badge.badge-muted', 'Beta'));
    if (it.destination === 'play') b.appendChild(h('span.nav-kbd', store.settings.game.keybinds.toggleShell || 'F1'));
    b.addEventListener('click', () => go(it.destination));
    return b;
  };
  rail.appendChild(h('div.rail-group', main.map(btn), tools.length ? [h('div.rail-label.pl-label', 'Tools'), tools.map((d) => btn({ destination: d.id, label: d.label, icon: d.icon, description: d.description }))] : null));
  rail.appendChild(h('div.rail-group', footer.map(btn)));
}

export async function go(dest, params = {}) {
  if (!VIEWS[dest]) dest = 'home';
  const f = FLAG_FOR[dest];
  current = dest; store.route = { dest, params };
  for (const b of document.querySelectorAll('.nav')) b.classList.toggle('is-active', b.dataset.dest === dest);
  const d = store.info.destinations.find((x) => x.id === dest);
  const ctxEl = clear(document.getElementById('tb-context'));
  ctxEl.appendChild(h('b', (cfg('client.navigation').items.find((i) => i.destination === dest) || d || {}).label || dest));
  if (d && d.description) ctxEl.appendChild(h('span', d.description));
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

/* ---------- titlebar ---------- */
function titlebarButtons() {
  const set = (id, ic, fn) => { const b = document.getElementById(id); clear(b).appendChild(icon(ic, 14)); b.onclick = fn; };
  set('tb-min', 'minimize', () => api('win:minimize'));
  set('tb-max', store.win.maximized ? 'restore' : 'maximize', () => api('win:maximize'));
  set('tb-close', 'close', async () => {
    if (recorder.isRecording()) { await recorder.stop(); }
    if (store.settings.general.confirmQuit) {
      modal({ title: 'Quit Polaris?', body: h('p.modal-text', 'The game session will end.'), actions: [{ label: 'Cancel', onClick: () => {} }, { label: 'Quit', kind: 'danger', onClick: () => api('win:close') }] });
    } else api('win:close');
  });
  set('tb-full', 'external', () => api('win:fullscreen'));
  const play = document.getElementById('tb-play');
  clear(play).append(icon(store.win.mode === 'play' ? 'grid' : 'play', 13), h('span', store.win.mode === 'play' ? 'Shell' : (store.game.started ? 'Game' : 'Play')));
  play.classList.toggle('is-live', store.game.started);
  play.onclick = () => api('shell:mode', store.win.mode === 'play' ? 'shell' : 'play');
}

function renderStatus() {
  const el = clear(document.getElementById('tb-status'));
  const m = store.metrics;
  if (store.game.started) {
    el.appendChild(h(`span.st.${store.game.inMatch ? 'ok' : ''}`, h('i'), store.game.inMatch ? 'In match' : 'Kirka.io'));
    if (m && m.fps != null) el.appendChild(h('span.st', h('b', Math.round(m.fps)), 'fps'));
  }
  if (m && m.rtt != null) el.appendChild(h('span.st', { title: 'HTTPS round-trip time to kirka.io — not the in-game server ping' }, h('b', Math.round(m.rtt)), 'ms rtt'));
  if (recorder.isRecording()) el.appendChild(h('span.st.live', h('i'), 'REC'));
  if (store.remote.preview) el.appendChild(h('span.st.warn', h('i'), 'Preview config'));
  if (store.server.user) el.appendChild(h('span.st', icon('users', 12), store.server.user.username));
}

/* ---------- onboarding ---------- */
function onboarding() {
  const s = store.settings;
  modal({
    title: 'Welcome to Polaris',
    wide: true,
    body: h('div.stack',
      h('p.text2', 'Polaris is a desktop client for Kirka.io. It loads the official game and adds a custom crosshair, HUD overlays, local cosmetics, recording and performance tools around it.'),
      h('div.rows',
        h('div.row', h('div.row-text', h('div.row-title', 'What Polaris does not do'), h('div.row-desc', 'No cheats, aimbots, wallhacks or automation. Polaris does not read game memory, change hitboxes or touch your Kirka account, inventory or KC. Skins you create here are local cosmetics.'))),
        h('div.row', h('div.row-text', h('div.row-title', 'Shortcuts'), h('div.row-desc', `${s.game.keybinds.toggleShell} switches between Polaris and the game · ${s.game.keybinds.fullscreen} fullscreen · ${s.game.keybinds.record} record · ${s.game.keybinds.screenshot} screenshot`))),
        h('div.row', h('div.row-text', h('div.row-title', 'Privacy'), h('div.row-desc', 'Usage statistics and crash reports are off. You can opt in under Settings → Privacy. Community features need a Polaris server account (Settings → Account).'))))),
    actions: [{ label: 'Start', kind: 'primary', onClick: () => updateSettings((st) => { st.onboardingDone = true; }, { immediate: true }) }],
    onClose: () => updateSettings((st) => { st.onboardingDone = true; }),
  });
}

/* ---------- boot ---------- */
async function boot() {
  bootStep('Loading settings');
  [store.info, store.settings, store.remote] = await Promise.all([api('app:info'), api('settings:get'), api('config:get')]);
  store.win = await api('win:state');
  await loadThemeItem();
  applyTheme();
  bootStep('Preparing interface');
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
    if (k === 'record') { if (!flag('replays').enabled) return toast('Replay Studio is disabled', 'warn'); recorder.isRecording() ? await recorder.stop() : await recorder.start(); renderStatus(); }
    if (k === 'bookmark') recorder.bookmark();
  });
  on('toast', (t) => toast(t.text, t.level));
  on('config:changed', async () => { await reloadRemote(); applyTheme(); renderRail(); pluginHost.broadcast('theme', cfg('client.theme').colors); });
  on('settings:changed', async () => { store.settings = await api('settings:get'); emit('settings', store.settings); });

  let prevBg = store.settings.backgrounds.currentId; let prevTheme = store.settings.appearance.themeItemId; let prevRot = JSON.stringify(store.settings.backgrounds.rotation) + store.settings.backgrounds.queue.length;
  subscribe('settings', async (s) => {
    if (s.appearance.themeItemId !== prevTheme) { prevTheme = s.appearance.themeItemId; await loadThemeItem(); }
    applyTheme();
    const rot = JSON.stringify(s.backgrounds.rotation) + s.backgrounds.queue.length;
    if (rot !== prevRot) { prevRot = rot; scheduleRotation(); }
    if (s.backgrounds.currentId !== prevBg) { prevBg = s.backgrounds.currentId; }
    applyBackground();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && store.win.mode === 'play') api('shell:mode', 'shell');
  });

  recorder.init();
  pluginHost.init();
  refreshServer().then(renderStatus);

  bootStep('Ready');
  await go(store.settings.general.startView in VIEWS ? store.settings.general.startView : 'home');
  document.getElementById('boot').classList.add('is-done');
  setTimeout(() => document.getElementById('boot').remove(), 400);
  if (!store.settings.onboardingDone) onboarding();
  if (store.remote.rejected && store.remote.rejected.length) toast(`${store.remote.rejected.length} remote configuration section(s) failed validation and were ignored.`, 'warn');
}

window.addEventListener('error', (e) => console.error('[polaris]', e.message));
boot().catch((e) => {
  console.error(e);
  bootStep(`Startup failed: ${e.message}`);
});

export { renderRail, renderStatus };
