import { h, button, clear, tabs, fmt, row, toggle, select, range, field } from '../lib/dom.js';
import { api, store, toast, fail, confirmDialog, modal, updateSettings, reloadSettings, reloadRemote, refreshServer, signedIn } from '../lib/store.js';
import { go, startOnboarding } from '../app.js';
import { LANGUAGES } from '../lib/i18n.js';
import { comboOf, assignShortcut, allCommands } from '../lib/commands.js';

const CATS = [
  { id: 'general', label: 'General' }, { id: 'appearance', label: 'Appearance' }, { id: 'performance', label: 'Performance' }, { id: 'game', label: 'Game' },
  { id: 'privacy', label: 'Privacy' }, { id: 'account', label: 'Account' }, { id: 'advanced', label: 'Advanced' },
];
const KEY_LABELS = { toggleShell: 'Switch between Polaris and the game', fullscreen: 'Fullscreen', reloadGame: 'Reload the game', record: 'Start / stop recording', bookmark: 'Bookmark the recording', screenshot: 'Screenshot' };

const set = (fn) => updateSettings(fn);
const sw = (get, put, opts) => toggle(get(store.settings), (v) => set((s) => put(s, v)), opts);

export async function render(root, params = {}) {
  let cat = CATS.some((c) => c.id === params.tab) ? params.tab : 'general';
  const bar = h('div'); const body = h('div.settings-body');
  root.append(h('header.page-head', h('div', h('div.pl-label.page-kicker', 'Preferences'), h('h1', 'Settings')),
    h('div.page-actions', button('Export', async () => { try { const f = await api('settings:export'); if (f) toast(`Saved ${f}`, 'ok'); } catch (e) { fail(e); } }, { iconName: 'download' }),
      button('Import', async () => { try { const r = await api('settings:import'); if (r) { await reloadSettings(); toast('Settings imported', 'ok'); draw(); } } catch (e) { fail(e, 'Import failed: '); } }, { iconName: 'upload' }))),
  bar, body);

  async function draw() {
    clear(bar).append(tabs(CATS, cat, (id) => { cat = id; draw(); }));
    clear(body);
    try { await SECTIONS[cat](body, draw); } catch (e) { body.append(h('div.note.note-danger', e.message)); }
    body.append(h('div.settings-foot', button(`Reset ${CATS.find((c) => c.id === cat).label.toLowerCase()} settings`, async () => {
      if (!await confirmDialog('Reset settings', `Restore the defaults for ${CATS.find((c) => c.id === cat).label}?`, { danger: true, confirm: 'Reset' })) return;
      const section = { general: 'general', appearance: 'appearance', performance: 'performance', game: 'game', privacy: 'privacy', account: null, advanced: 'advanced' }[cat];
      if (!section) { toast('Account settings are reset by signing out', 'info'); return; }
      await api('settings:reset', section); await reloadSettings(); draw();
    }, { small: true, kind: 'quiet' })));
  }
  await draw();
}

const SECTIONS = {
  general(body) {
    const views = store.info.destinations.filter((d) => !['settings', 'updates'].includes(d.id)).map((d) => ({ value: d.id, label: d.label }));
    body.append(h('div.rows',
      row('Language', 'Interface language. Community content and server messages stay in the language they were written in.', select(LANGUAGES, store.settings.general.language, (v) => set((s) => { s.general.language = v; }))),
      row('Start on', 'The page Polaris opens with.', select(views, store.settings.general.startView, (v) => set((s) => { s.general.startView = v; }))),
      row('Launch the game on start', 'Go straight to Kirka.io when Polaris opens.', sw((s) => s.general.autoLaunchGame, (s, v) => { s.general.autoLaunchGame = v; })),
      row('Start in fullscreen', null, sw((s) => s.general.startFullscreen, (s, v) => { s.general.startFullscreen = v; })),
      row('Remember window size and position', null, sw((s) => s.general.rememberWindow, (s, v) => { s.general.rememberWindow = v; })),
      row('Confirm before quitting', 'Ask before closing while the game is running.', sw((s) => s.general.confirmQuit, (s, v) => { s.general.confirmQuit = v; })),
      row('Home widgets', 'Choose which blocks appear on Home.', h('div.chips', store.info.homeWidgets.map((w) => {
        const hidden = store.settings.home.hidden.includes(w.id);
        const b = h(`button.chip${hidden ? '' : '.is-active'}`, { type: 'button' }, w.label);
        b.addEventListener('click', () => { set((s) => { s.home.hidden = s.home.hidden.includes(w.id) ? s.home.hidden.filter((x) => x !== w.id) : [...s.home.hidden, w.id]; }); b.classList.toggle('is-active'); });
        return b;
      }))),
      row('Run Smart Setup again', 'Re-check this computer and review the recommendations. Nothing changes until you finish.', button('Start', () => startOnboarding(), { small: true }))));
  },

  appearance(body) {
    body.append(h('div.rows',
      row('Interface scale', 'Size of the Polaris interface (not the game).', range(store.settings.appearance.uiScale, { min: 0.8, max: 1.4, step: 0.05, format: (v) => `${Math.round(v * 100)}%`, onInput: (v) => set((s) => { s.appearance.uiScale = v; }) })),
      row('Density', null, select([{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }], store.settings.appearance.density, (v) => set((s) => { s.appearance.density = v; }))),
      row('Animations', 'Transitions and motion in the interface.', sw((s) => s.appearance.motion, (s, v) => { s.appearance.motion = v; })),
      row('Decorative effects', 'Fine visual details such as background images behind pages.', sw((s) => s.appearance.decorativeEffects, (s, v) => { s.appearance.decorativeEffects = v; })),
      row('Background behind pages', 'Show your selected background in the Polaris shell.', sw((s) => s.appearance.shellBackground, (s, v) => { s.appearance.shellBackground = v; })),
      row('Theme', store.settings.appearance.themeItemId ? 'A custom theme from your inventory is active.' : 'Using the official Polaris theme.', h('div.inline',
        store.settings.appearance.themeItemId ? button('Use official theme', () => { set((s) => { s.appearance.themeItemId = null; }); setTimeout(() => go('settings', { tab: 'appearance' }), 200); }, { small: true }) : null,
        button('Theme editor', () => go('customization', { tab: 'themes' }), { small: true })))));
  },

  performance(body) {
    const p = store.cfg ? null : null;
    body.append(h('div.note', 'Live measurements, profiles and benchmarks are in the Performance Center. ', button('Open Performance Center', () => go('performance'), { small: true })),
      h('div.rows',
        row('Unlock frame rate', `Disables VSync. Applies after restart (currently ${store.info.startupFlags.fpsUnlock ? 'on' : 'off'}).`, sw((s) => s.performance.fpsUnlock, (s, v) => { s.performance.fpsUnlock = v; })),
        row('Hardware acceleration', `Applies after restart (currently ${store.info.startupFlags.hardwareAcceleration ? 'on' : 'off'}).`, sw((s) => s.performance.hardwareAcceleration, (s, v) => { s.performance.hardwareAcceleration = v; })),
        row('Throttle in background', null, sw((s) => s.performance.backgroundThrottling, (s, v) => { s.performance.backgroundThrottling = v; })),
        row('Animated backgrounds', 'Allow video backgrounds in the shell.', sw((s) => s.performance.animatedBackgrounds, (s, v) => { s.performance.animatedBackgrounds = v; })),
        row('Restart Polaris', 'Needed after changing frame-rate unlock or hardware acceleration.', button('Restart', () => api('app:relaunch'), { small: true }))));
    void p;
  },

  game(body, redraw) {
    const url = h('input.input', { value: store.settings.game.url, maxlength: 200 });
    url.addEventListener('change', () => { set((s) => { s.game.url = url.value.trim(); }); setTimeout(() => { url.value = store.settings.game.url; }, 400); });
    const kb = store.settings.game.keybinds;
    const keyBtn = (id) => {
      const b = h('button.btn.btn-ghost.btn-sm.kbd-btn', { type: 'button' }, kb[id] || 'not set');
      b.addEventListener('click', () => {
        b.textContent = 'Press a key…'; b.classList.add('is-listening');
        const onKey = (e) => {
          e.preventDefault(); e.stopPropagation();
          if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
          document.removeEventListener('keydown', onKey, true); b.classList.remove('is-listening');
          if (e.key === 'Escape') { b.textContent = kb[id] || 'not set'; return; }
          if (e.key === 'Backspace' || e.key === 'Delete') { set((s) => { s.game.keybinds[id] = ''; }); b.textContent = 'not set'; return; }
          const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
          const combo = [(e.ctrlKey || (/Mac/.test(navigator.platform) && e.metaKey)) ? 'Ctrl' : null, e.shiftKey ? 'Shift' : null, e.altKey ? 'Alt' : null, key].filter(Boolean).join('+');
          if (!/^((Ctrl|Shift|Alt)\+){0,3}(F([1-9]|1[0-2])|[A-Z0-9]|Insert|Home|End|PageUp|PageDown|Pause|`)$/.test(combo)) { toast(`${combo} cannot be used. Use F1–F12, letters, digits or Insert/Home/End/PageUp/PageDown/Pause, optionally with Ctrl/Shift/Alt.`, 'warn', 6000); b.textContent = kb[id] || 'not set'; return; }
          const clash = Object.entries(store.settings.game.keybinds).find(([k, v]) => k !== id && v === combo);
          if (clash) { toast(`${combo} is already used for “${KEY_LABELS[clash[0]]}”`, 'warn'); b.textContent = kb[id] || 'not set'; return; }
          if (!e.ctrlKey && !e.altKey && /^[A-Z0-9]$/.test(key)) toast('Single letters and digits are also game controls. A modifier (Ctrl/Alt) or an F-key is safer.', 'warn', 6000);
          set((s) => { s.game.keybinds[id] = combo; }); b.textContent = combo;
        };
        document.addEventListener('keydown', onKey, true);
      });
      return b;
    };
    body.append(
      h('section.section', h('div.section-head', h('h2', 'Game')), h('div.rows',
        row('Game address', 'Only kirka.io addresses are accepted.', url),
        row('Block ads and trackers', 'Blocks third-party ad networks. Kirka.io’s own requests are never blocked.', sw((s) => s.game.adblock, (s, v) => { s.game.adblock = v; })),
        row('Resource swapper', 'Use your image and sound swaps from Resources.', sw((s) => s.game.resourceSwapper, (s, v) => { s.game.resourceSwapper = v; })),
        row('Polaris crosshair', 'Draw your crosshair from Crosshair Studio.', sw((s) => s.game.crosshairEnabled, (s, v) => { s.game.crosshairEnabled = v; })),
        row('Hide the game’s crosshair', 'Only while the Polaris crosshair is on.', sw((s) => s.game.hideGameCrosshair, (s, v) => { s.game.hideGameCrosshair = v; })),
        row('Background in game menus', 'Show your background behind Kirka.io menus. Best effort — depends on the game’s page layout.', sw((s) => s.game.menuBackground, (s, v) => { s.game.menuBackground = v; })),
        row('Clear game cache', 'Forces the game to download its files again.', button('Clear cache', async () => { await api('app:clearCache'); toast('Game cache cleared', 'ok'); }, { small: true })),
        row('Sign out of Kirka.io', 'Deletes cookies and storage of the game page (your Kirka login on this computer).', button('Clear game data', async () => { if (await confirmDialog('Clear game data', 'You will be signed out of Kirka.io in Polaris. Your Kirka account itself is not affected.', { danger: true, confirm: 'Clear' })) { await api('app:clearGameData'); toast('Game data cleared', 'ok'); } }, { small: true, kind: 'danger' })))),
      h('section.section', h('div.section-head', h('h2', 'Keyboard shortcuts'), h('span.muted.small', 'Click, then press keys · Backspace clears · Esc cancels')),
        h('div.rows', Object.keys(KEY_LABELS).map((id) => row(KEY_LABELS[id], null, keyBtn(id)))),
        h('div.inline', button('Restore default shortcuts', () => { set((s) => { s.game.keybinds = { toggleShell: 'F1', fullscreen: 'F11', reloadGame: 'F5', record: 'F8', bookmark: 'F9', screenshot: 'F12' }; }); setTimeout(redraw, 300); }, { small: true, kind: 'quiet' }))),
      h('section.section', h('div.section-head', h('h2', 'Recording')), h('div.rows',
        row('Frame rate', null, select([{ value: '30', label: '30 FPS' }, { value: '60', label: '60 FPS' }], String(store.settings.replays.fps), (v) => set((s) => { s.replays.fps = Number(v); }))),
        row('Bitrate', 'Higher looks better and makes larger files.', range(store.settings.replays.bitrateMbps, { min: 2, max: 40, step: 1, format: (v) => `${v} Mbit/s`, onInput: (v) => set((s) => { s.replays.bitrateMbps = v; }) })),
        row('Codec', 'VP8 uses less CPU, VP9 makes smaller files.', select([{ value: 'vp9', label: 'VP9' }, { value: 'vp8', label: 'VP8' }], store.settings.replays.codec, (v) => set((s) => { s.replays.codec = v; }))),
        row('Stop automatically after', null, range(store.settings.replays.maxMinutes, { min: 1, max: 180, step: 1, format: (v) => `${v} min`, onInput: (v) => set((s) => { s.replays.maxMinutes = v; }) })))));
  },

  privacy(body) {
    body.append(h('div.note', 'Polaris collects nothing unless you opt in below. It never reads your Kirka.io password, account data or inventory.'),
      h('div.rows',
        row('Anonymous usage statistics', 'Sends app version, platform and a random install ID to the Polaris server every few hours. Helps decide what to support. Off by default.', sw((s) => s.privacy.telemetry, (s, v) => { s.privacy.telemetry = v; })),
        row('Crash reports', 'Sends the error message and stack trace when Polaris crashes. No personal data.', sw((s) => s.privacy.crashReports, (s, v) => { s.privacy.crashReports = v; })),
        row('Share online status', 'Lets friends on your Polaris server see when you are online or in a match.', sw((s) => s.privacy.shareOnlineStatus, (s, v) => { s.privacy.shareOnlineStatus = v; }))));
    if (signedIn()) privacyRemote(body);
  },

  async account(body, redraw) {
    const srv = await refreshServer();
    const urlIn = h('input.input', { value: store.settings.account.serverUrl, placeholder: 'https://polaris.example.org', maxlength: 300 });
    body.append(h('section.section', h('div.section-head', h('h2', 'Polaris server')),
      h('p.muted.small', 'Marketplace, social features, cloud sync and uploads need a Polaris community server. It is run by the project owner (or yourself). This is not your Kirka.io account.'),
      h('div.inline', urlIn, button('Save', async () => {
        const v = urlIn.value.trim().replace(/\/+$/, '');
        if (v && !/^https?:\/\/[^\s"'<>]+$/.test(v)) { toast('Enter an address starting with https://', 'warn'); return; }
        if (v.startsWith('http://') && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(v)) toast('Without https your password is sent unencrypted. Use https for any server that is not on this computer.', 'warn', 8000);
        if (v !== store.settings.account.serverUrl && signedIn()) await api('server:logout');
        updateSettings((s) => { s.account.serverUrl = v; }, { immediate: true });
        setTimeout(redraw, 400);
      }, { kind: 'primary' })),
      srv.configured ? h('p.small', srv.error ? h('span.text-danger', `Not reachable: ${srv.error}`) : h('span', h('span.badge.badge-ok', 'connected'), ` ${srv.health && srv.health.name ? srv.health.name : ''} ${srv.health && srv.health.version ? `v${srv.health.version}` : ''}`)) : null));
    if (!srv.configured || srv.error) return;
    if (!srv.user) { body.append(loginForm(redraw)); return; }
    const u = srv.user;
    body.append(h('section.section', h('div.section-head', h('h2', `Signed in as ${u.displayName || u.username}`), button('Sign out', async () => { await api('server:logout'); await refreshServer(); redraw(); }, { small: true })),
      h('div.rows', profileRows(u, redraw)),
      h('div.section-head', h('h3', 'Cloud sync')),
      h('p.muted.small', 'Saves your settings, profiles, map notes and the index of your library to your account. Library files and plugin code are not uploaded.'),
      h('div.inline', button('Upload my settings', async () => { try { await api('cloud:push'); toast('Settings saved to your account', 'ok'); } catch (e) { fail(e); } }, { small: true, iconName: 'upload' }),
        button('Restore from account', async () => { if (!await confirmDialog('Restore settings', 'Replace your settings on this computer with the copy saved in your account?', { danger: true, confirm: 'Restore' })) return; try { await api('cloud:pull'); await reloadSettings(); toast('Settings restored', 'ok'); } catch (e) { fail(e); } }, { small: true, iconName: 'download' }))));
    twoFactor(body, u, redraw);
  },

  async advanced(body, redraw) {
    const remote = store.remote;
    const mirror = h('input.input', { value: store.settings.advanced.mirrorUrl, maxlength: 300 });
    const sel = h('textarea.input.code', { rows: 5, maxlength: 4000, spellcheck: false, placeholder: '{ "menu": ".some-selector", "inMatch": ".game-interface" }' });
    sel.value = store.settings.advanced.selectorsOverride;
    const st = remote.status || {};
    body.append(
      h('section.section', h('div.section-head', h('h2', 'Remote configuration')),
        h('dl.kv', h('dt', 'Source'), h('dd', remote.source || 'built-in defaults'), h('dt', 'Sequence'), h('dd.mono', String(remote.sequence ?? '—')), h('dt', 'Issued'), h('dd', remote.issuedAt ? fmt.datetime(remote.issuedAt) : '—'),
          h('dt', 'Preview'), h('dd', remote.preview ? 'a local test configuration is loaded' : 'no'),
          remote.rejected && remote.rejected.length ? [h('dt', 'Rejected'), h('dd.text-danger', remote.rejected.join(' · '))] : null,
          st.client && !st.client.ok ? [h('dt', 'Last check'), h('dd.text-danger', (st.client.errors || []).join(' · '))] : null),
        h('p.muted.small', 'Configuration is signed by the project owner. Unsigned or tampered bundles are rejected and the last verified copy is used. It can change texts, colours, layout and features, but can never run code.'),
        h('div.inline', button('Check for new configuration', async () => { try { await api('config:refresh'); await reloadRemote(); toast('Configuration refreshed', 'ok'); redraw(); } catch (e) { fail(e); } }, { small: true, iconName: 'refresh' }))),
      await realtimeSection(redraw),
      commandSection(redraw),
      h('section.section', h('div.section-head', h('h2', 'Test mode'), h('span.muted.small', 'for the project owner')),
        h('div.rows', row('Test mode', 'Shows draft-preview tools. Has no effect for normal play.', sw((s) => s.advanced.testMode, (s, v) => { s.advanced.testMode = v; }, {}))),
        store.settings.advanced.testMode ? h('div.inline', button('Load preview bundle…', async () => { try { const r = await api('config:loadPreview'); if (r) { await reloadRemote(); toast(r.rejected && r.rejected.length ? `Loaded with rejected parts: ${r.rejected.join(', ')}` : 'Preview configuration loaded', r.rejected && r.rejected.length ? 'warn' : 'ok', 6000); redraw(); } } catch (e) { fail(e); } }, { small: true }),
          button('Back to published configuration', async () => { await api('config:resetPreview'); await reloadRemote(); redraw(); }, { small: true, kind: 'quiet' })) : null),
      h('section.section', h('div.section-head', h('h2', 'Sources')), h('div.form',
        field('Website data mirror', mirror, 'Used for news and signed configuration when no server is set. Must be https.'),
        field('Game page selectors (JSON)', sel, 'Overrides how Polaris detects menus and matches on the Kirka.io page if the game layout changes. Leave empty to use the official values.'),
        h('div.inline', button('Save', () => {
          if (sel.value.trim()) { try { JSON.parse(sel.value); } catch { toast('Selectors must be valid JSON', 'warn'); return; } }
          updateSettings((s) => { s.advanced.mirrorUrl = mirror.value.trim(); s.advanced.selectorsOverride = sel.value.trim(); }, { immediate: true }); toast('Saved', 'ok', 1500);
        }, { small: true, kind: 'primary' })))),
      h('section.section', h('div.section-head', h('h2', 'Files and logs')), h('div.inline',
        button('Data folder', () => api('app:openFolder', 'data'), { small: true, iconName: 'folder' }), button('Logs folder', () => api('app:openFolder', 'logs'), { small: true, iconName: 'folder' }),
        button('Library folder', () => api('app:openFolder', 'library'), { small: true, iconName: 'folder' }), button('Screenshots', () => api('app:openFolder', 'screenshots'), { small: true, iconName: 'folder' }),
        button('View log', () => showLogs(), { small: true, iconName: 'code' }))),
      h('section.section', h('div.section-head', h('h2', 'About')), h('dl.kv',
        h('dt', 'Version'), h('dd.mono', store.info.version), h('dt', 'Electron'), h('dd.mono', `${store.info.electron} · Chromium ${store.info.chrome} · Node ${store.info.node}`),
        h('dt', 'Platform'), h('dd.mono', `${store.info.platform} ${store.info.arch}${store.info.appImage ? ' · AppImage' : ''}`), h('dt', 'Data'), h('dd.mono.small', store.info.userData)),
        h('p.muted.small', 'Polaris Client is an unofficial community project, not affiliated with Kirka.io. MIT licensed.')),
      h('section.section', h('div.section-head', h('h2', 'Reset')), h('div.rows', row('Reset all settings', 'Your library, profiles, replays and plugins are kept.', button('Reset everything', async () => {
        if (!await confirmDialog('Reset all settings', 'Restore every setting to its default?', { danger: true, confirm: 'Reset' })) return;
        await api('settings:reset'); await reloadSettings(); toast('Settings reset', 'ok'); redraw();
      }, { small: true, kind: 'danger' }), { danger: true }))));
  },
};

async function realtimeSection(redraw) {
  let st = {};
  try { st = await api('realtime:status'); } catch {}
  const stateText = { connected: 'Connected', connecting: 'Connecting…', off: 'Off', error: 'Error', closed: 'Disconnected' }[st.state] || st.state || 'unknown';
  return h('section.section', h('div.section-head', h('h2', 'Realtime connection'), h(`span.badge${st.state === 'connected' ? '.badge-ok' : '.badge-muted'}`, stateText)),
    h('div.rows', row('Live updates', 'Keep a WebSocket connection to the Polaris server so configuration, announcements, maintenance notices and notifications arrive instantly. Without it, Polaris checks periodically.', sw((s) => s.realtime.enabled, (s, v) => { s.realtime.enabled = v; }, {}))),
    h('dl.kv', h('dt', 'Server'), h('dd.mono.small', st.url || '—'), h('dt', 'Status'), h('dd', st.reason ? `${stateText} — ${st.reason}` : stateText),
      h('dt', 'Signed in'), h('dd', st.authenticated ? 'yes (personal notifications)' : 'no'), h('dt', 'Events received'), h('dd.mono', String(st.events ?? 0)),
      h('dt', 'Last event'), h('dd', st.lastEventAt ? `${st.lastEvent} · ${fmt.datetime(st.lastEventAt)}` : '—'), h('dt', 'Reconnects'), h('dd.mono', String(st.reconnects ?? 0))),
    h('div.inline', button('Reconnect', async () => { try { await api('realtime:reconnect'); setTimeout(redraw, 800); } catch (e) { fail(e); } }, { small: true, iconName: 'refresh' }),
      button('Restart Polaris', () => api('app:relaunch'), { small: true, kind: 'quiet' })));
}

function commandSection(redraw) {
  const sc = store.settings.commands.shortcuts || {};
  const capture = () => {
    const shown = h('div.palette-capture.mono', store.settings.commands.paletteKey);
    const overlay = h('div.palette-overlay', h('div.palette.palette-small', h('div.stack', h('h2.section-title', 'Command Center shortcut'), h('p.text2', 'Press the new combination (with Ctrl, Alt or Shift, or a function key). Esc cancels.'), shown)));
    const done = () => { window.removeEventListener('keydown', onKey, true); overlay.remove(); };
    function onKey(e) {
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') return done();
      const c = comboOf(e); if (!c) return;
      if (!/^(Ctrl|Alt|Shift)\+|^F\d{1,2}$/.test(c)) { shown.textContent = `${c} — needs a modifier`; return; }
      if (Object.values(store.settings.game.keybinds).includes(c)) { shown.textContent = `${c} — already used by a game keybind`; return; }
      updateSettings((s) => { s.commands.paletteKey = c; }, { immediate: true }).then(() => { toast(`Command Center: ${c}`, 'ok'); done(); redraw(); }).catch((er) => { fail(er); done(); });
    }
    window.addEventListener('keydown', onKey, true); document.body.append(overlay);
  };
  return h('section.section', h('div.section-head', h('h2', 'Command Center')),
    h('div.rows', row('Open with', 'Works in Polaris and inside the game.', h('div.inline', h('kbd', store.settings.commands.paletteKey), button('Change', capture, { small: true }))),
      row('Custom shortcuts', 'Assign shortcuts in the Command Center: select a command and press Alt+Enter.', h('span.mono.small', `${Object.keys(sc).length} assigned`))),
    Object.keys(sc).length ? h('div.rows', Object.entries(sc).map(([k, id]) => row(h('kbd', k), id, h('div.inline',
      button('Change', async () => { const c = (await allCommands()).find((x) => x.id === id); if (c) assignShortcut(c); else toast('That command is not available right now', 'warn'); }, { small: true, kind: 'quiet' }),
      button('Remove', () => updateSettings((s) => { delete s.commands.shortcuts[k]; }).then(redraw), { small: true, kind: 'quiet' }))))) : null,
    h('div.inline', button('Reset usage ranking', () => updateSettings((s) => { s.commands.usage = {}; }).then(() => toast('Ranking reset', 'ok', 1500)), { small: true, kind: 'quiet' })));
}

async function showLogs() {
  const entries = await api('app:logs', 500);
  const text = entries.map((e) => `${e.at} ${e.level.toUpperCase().padEnd(5)} ${e.msg}${e.meta ? ` ${JSON.stringify(e.meta)}` : ''}`).join('\n');
  modal({ title: 'Log', wide: true, body: h('pre.log-view', text || 'Empty.'), actions: [{ label: 'Copy', onClick: async () => { await api('app:copy', text); toast('Copied', 'ok', 1200); return true; } }, { label: 'Close', onClick: () => {} }] });
}

function loginForm(redraw) {
  let mode = 'login';
  const wrap = h('section.section');
  const draw = () => {
    clear(wrap);
    const user = h('input.input', { autocomplete: 'username', maxlength: 40 });
    const pass = h('input.input', { type: 'password', autocomplete: mode === 'login' ? 'current-password' : 'new-password', maxlength: 200 });
    const email = h('input.input', { type: 'email', maxlength: 200, placeholder: 'optional, for account recovery' });
    const totp = h('input.input', { inputmode: 'numeric', maxlength: 12, placeholder: '123456 or a recovery code' });
    const totpField = field('Authenticator code', totp); totpField.hidden = true;
    const submit = async () => {
      try {
        if (mode === 'login') await api('server:login', user.value.trim(), pass.value, totp.value.trim());
        else await api('server:register', user.value.trim(), pass.value, email.value.trim());
        await refreshServer(); toast('Signed in', 'ok'); redraw();
      } catch (e) {
        if (e.code === 'totp_required') { totpField.hidden = false; totp.focus(); if (totp.value) fail(e); return; }
        fail(e);
      }
    };
    for (const i of [user, pass, totp]) i.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    wrap.append(h('div.section-head', h('h2', mode === 'login' ? 'Sign in' : 'Create an account'), h('button.linklike', { type: 'button', on: { click: () => { mode = mode === 'login' ? 'register' : 'login'; draw(); } } }, mode === 'login' ? 'Create an account instead' : 'I already have an account')),
      h('div.form-2', field('Username', user), field('Password', pass, mode === 'register' ? 'At least 10 characters' : null), mode === 'register' ? field('Email', email) : totpField),
      h('div.inline', button(mode === 'login' ? 'Sign in' : 'Create account', submit, { kind: 'primary' })),
      h('p.muted.small', 'Never use your Kirka.io password here. Polaris accounts are separate.'));
  };
  draw();
  return wrap;
}

function profileRows(u, redraw) {
  const dn = h('input.input', { value: u.displayName || '', maxlength: 32 });
  const bio = h('input.input', { value: u.bio || '', maxlength: 300 });
  return [
    row('Display name', null, h('div.inline', dn)),
    row('Bio', null, bio),
    row('Avatar', 'PNG, JPEG or WebP, up to 1 MB.', button('Choose image', async () => {
      try { const f = await api('dialog:openImage', 'image'); if (!f) return; await api('server:uploadAvatar', f); toast('Avatar updated', 'ok'); redraw(); } catch (e) { fail(e); }
    }, { small: true })),
    row('', null, button('Save profile', async () => { try { await api('server:request', 'PATCH', '/auth/me', { displayName: dn.value.trim() || undefined, bio: bio.value.trim() }); toast('Profile saved', 'ok'); } catch (e) { fail(e); } }, { small: true, kind: 'primary' })),
  ];
}

async function privacyRemote(body) {
  const u = store.server.user;
  const p = { ...u.privacy };
  const save = async () => { try { const r = await api('server:request', 'PATCH', '/auth/me', { privacy: p }); store.server.user = r.user || store.server.user; toast('Saved', 'ok', 1200); } catch (e) { fail(e); } };
  body.append(h('section.section', h('div.section-head', h('h2', 'Polaris account privacy'), h('span.muted.small', `@${u.username}`)), h('div.rows',
    row('Who can see my profile', null, select([{ value: 'public', label: 'Everyone' }, { value: 'friends', label: 'Friends' }, { value: 'private', label: 'Only me' }], p.profile, (v) => { p.profile = v; save(); })),
    row('Who can message me', null, select([{ value: 'everyone', label: 'Everyone' }, { value: 'friends', label: 'Friends' }, { value: 'nobody', label: 'Nobody' }], p.allowMessages, (v) => { p.allowMessages = v; save(); })),
    row('Accept friend requests', null, toggle(p.allowFriendRequests, (v) => { p.allowFriendRequests = v; save(); })),
    row('Show when I am online', null, toggle(p.onlineStatus, (v) => { p.onlineStatus = v; save(); }))),
  h('div.inline', button('Download my data', async () => { try { const d = await api('server:request', 'GET', '/auth/export'); const f = await api('dialog:saveData', 'polaris-account-export.json', JSON.stringify(d, null, 2)); if (f) toast(`Saved ${f}`, 'ok'); } catch (e) { fail(e); } }, { small: true }),
    button('Delete my account', async () => {
      const pw = h('input.input', { type: 'password' });
      modal({ title: 'Delete account', body: h('div.stack', h('p.modal-text', 'This permanently deletes your Polaris account, messages and uploads on this server.'), field('Password', pw)), actions: [{ label: 'Cancel', onClick: () => {} }, { label: 'Delete account', kind: 'danger', onClick: async () => {
        try { await api('server:request', 'DELETE', '/auth/me', { password: pw.value }); await api('server:logout'); await refreshServer(); toast('Account deleted', 'ok'); } catch (e) { fail(e); return true; }
      } }] });
    }, { small: true, kind: 'danger' }))));
}

function twoFactor(body, u, redraw) {
  const sec = h('section.section', h('div.section-head', h('h3', 'Two-factor authentication'), u.twoFactorEnabled ? h('span.badge.badge-ok', 'on') : h('span.badge.badge-muted', 'off')));
  if (!u.twoFactorEnabled) {
    sec.append(h('p.muted.small', 'Protect your Polaris account with an authenticator app (TOTP).'), button('Set up', async () => {
      try {
        const r = await api('server:request', 'POST', '/auth/2fa/setup');
        const code = h('input.input', { inputmode: 'numeric', maxlength: 6 });
        modal({ title: 'Set up two-factor authentication', body: h('div.stack', h('p.modal-text', 'Add this key to your authenticator app (manual entry, time-based), then enter the 6-digit code it shows.'),
          h('div.secret.mono', r.secret.replace(/(.{4})/g, '$1 ').trim()), button('Copy setup link', () => api('app:copy', r.otpauthUrl).then(() => toast('Copied', 'ok', 1200)), { small: true }), field('Code', code)),
        actions: [{ label: 'Cancel', onClick: () => {} }, { label: 'Enable', kind: 'primary', onClick: async () => {
          try {
            const x = await api('server:request', 'POST', '/auth/2fa/enable', { code: code.value.trim() });
            modal({ title: 'Recovery codes', body: h('div.stack', h('p.modal-text', 'Store these codes somewhere safe. Each one can be used once if you lose your device.'), h('pre.secret.mono', x.recoveryCodes.join('\n'))),
              actions: [{ label: 'Copy', onClick: async () => { await api('app:copy', x.recoveryCodes.join('\n')); toast('Copied', 'ok', 1200); return true; } }, { label: 'Done', kind: 'primary', onClick: () => { redraw(); } }] });
            return true;
          } catch (e) { fail(e); return true; }
        } }] });
      } catch (e) { fail(e); }
    }, { small: true }));
  } else {
    sec.append(button('Turn off', async () => {
      const pw = h('input.input', { type: 'password' }); const code = h('input.input', { inputmode: 'numeric', maxlength: 12 });
      modal({ title: 'Turn off two-factor authentication', body: h('div.form', field('Password', pw), field('Authenticator code', code)), actions: [{ label: 'Cancel', onClick: () => {} }, { label: 'Turn off', kind: 'danger', onClick: async () => {
        try { await api('server:request', 'POST', '/auth/2fa/disable', { password: pw.value, code: code.value.trim() }); await refreshServer(); redraw(); } catch (e) { fail(e); return true; }
      } }] });
    }, { small: true, kind: 'danger' }));
  }
  body.append(sec);
}
