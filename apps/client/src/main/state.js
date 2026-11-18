'use strict';
/**
 * Persistent client state: settings, profiles, library index, analytics, replays, plugins.
 * Every document is a JSON file in <userData>/data, written atomically.
 */
const crypto = require('crypto');
const { createDoc, mergeDefaults, clone } = require('./core');
const { DEFAULTS, CROSSHAIR_DEFAULT } = require('../shared/configuration/defaults');

const KEYBIND_DEFAULTS = { toggleShell: 'F1', fullscreen: 'F11', reloadGame: 'F5', record: 'F8', bookmark: 'F9', screenshot: 'F12' };

const SETTINGS_DEFAULTS = {
  schema: 1,
  general: { startView: 'home', startFullscreen: false, rememberWindow: true, autoLaunchGame: false, confirmQuit: false },
  appearance: { motion: true, decorativeEffects: true, uiScale: 1, density: 'comfortable', shellBackground: true, themeItemId: null },
  performance: { profile: 'balanced', fpsUnlock: true, hardwareAcceleration: true, backgroundThrottling: true, animatedBackgrounds: false },
  game: {
    url: 'https://kirka.io/',
    adblock: true,
    resourceSwapper: true,
    crosshairEnabled: true,
    hideGameCrosshair: true,
    crosshairPreset: 'polaris',
    crosshair: clone(CROSSHAIR_DEFAULT),
    hudPreset: 'polaris-default',
    hudCustom: null,          // user-edited element map (null = use preset)
    gameCssEnabled: false,
    gameCss: '',
    visualFilter: { enabled: false, brightness: 1, contrast: 1, saturation: 1 },
    menuBackground: false,    // apply the selected background to Kirka's menu (best-effort selectors)
    keybinds: clone(KEYBIND_DEFAULTS),
  },
  privacy: { telemetry: false, crashReports: false, shareOnlineStatus: true, installId: null },
  account: { serverUrl: '', username: null },
  updates: { channel: 'stable', autoCheck: true, autoDownload: false },
  advanced: { mirrorUrl: 'https://julianba-12.github.io/kirka-client/data', testMode: false, selectorsOverride: '' },
  home: { hidden: [] },
  replays: { fps: 60, bitrateMbps: 8, maxMinutes: 30, codec: 'vp9' },
  backgrounds: { currentId: null, queue: [], rotation: { enabled: false, intervalMinutes: 10, random: true } },
  activeProfileId: null,
  onboardingDone: false,
};

const settings = createDoc('settings', (stored) => {
  const s = mergeDefaults(SETTINGS_DEFAULTS, stored || {});
  if (!s.privacy.installId) s.privacy.installId = crypto.randomUUID();
  s.game.keybinds = { ...KEYBIND_DEFAULTS, ...s.game.keybinds };
  return s;
});

const profiles = createDoc('profiles', (stored) => mergeDefaults({ items: [], rules: { onBattery: null, onAC: null } }, stored || {}));
const library = createDoc('library', (stored) => mergeDefaults({ items: [] }, stored || {}));
const analytics = createDoc('analytics', (stored) => mergeDefaults({ sessions: [], matches: [], benchmarks: [] }, stored || {}));
const replays = createDoc('replays', (stored) => mergeDefaults({ items: [] }, stored || {}));
const plugins = createDoc('plugins', (stored) => mergeDefaults({ items: [], storage: {} }, stored || {}));
const maps = createDoc('maps', (stored) => mergeDefaults({ notes: {}, presets: [] }, stored || {}));
const windowState = createDoc('window', (stored) => mergeDefaults({ width: 1360, height: 820, x: null, y: null, maximized: false, fullscreen: false }, stored || {}));

const ALL = { settings, profiles, library, analytics, replays, plugins, maps, windowState };
const flushAll = () => { for (const d of Object.values(ALL)) d.flush(); };

/** Snapshot used for "export all settings" (no files, no tokens). */
function exportBundle() {
  const s = clone(settings.get());
  delete s.privacy.installId;
  return {
    format: 'polaris-client-export/1', exportedAt: new Date().toISOString(),
    settings: s, profiles: profiles.get(), maps: maps.get(),
    plugins: { items: plugins.get().items.map((p) => ({ ...p })), storage: plugins.get().storage },
  };
}

module.exports = { ...ALL, flushAll, exportBundle, SETTINGS_DEFAULTS, KEYBIND_DEFAULTS, DEFAULTS };
