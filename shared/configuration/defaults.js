'use strict';
/**
 * Polaris — default values for every remotely configurable domain.
 *
 * These defaults are compiled into the client and the website so both work
 * offline / without a backend. The Owner application edits drafts of these
 * domains on the backend; published revisions are delivered as signed bundles.
 *
 * Every domain has: a default value (here) and a validator (validators.js).
 */

const CLIENT_THEME = {
  name: 'Polaris Night',
  colors: {
    bg: '#080D18',
    panel: '#111C32',
    panel2: '#192943',
    line: '#22344F',
    text: '#E8EEF6',
    text2: '#AAB7C8',
    text3: '#6B7A90',
    accent: '#00D9FF',
    accent2: '#287BFF',
    accent3: '#914DFF',
    ok: '#3DDC97',
    warn: '#FFB547',
    danger: '#FF5A6A',
    titlebar: '#060A13',
    sidebar: '#0A1120',
    buttonBg: '#00D9FF',
    buttonText: '#04111A',
    buttonHover: '#5BE7FF',
    buttonActive: '#00B5D6',
  },
  typography: {
    ui: 'Satoshi',
    display: 'Satoshi',
    mono: 'JetBrains Mono',
    baseSize: 14,
    scale: 1.2,
  },
  shape: {
    radius: 3,       // px — Polaris uses tight radii and chamfered primary actions
    chamfer: 8,      // px — size of the cut corner on primary buttons / panels
    borderWidth: 1,
  },
  effects: {
    shadow: 'subtle',          // none | subtle | deep
    accentGradient: false,     // gradients are opt-in, never default
    animations: true,
    transitionMs: 140,
  },
};

/** Every view the client can show. Navigation entries must reference one of these. */
const CLIENT_DESTINATIONS = [
  { id: 'home', label: 'Home', icon: 'home', description: 'Your dashboard' },
  { id: 'play', label: 'Play', icon: 'play', description: 'Launch Kirka.io' },
  { id: 'inventory', label: 'Inventory', icon: 'box', description: 'Your local cosmetics' },
  { id: 'skins', label: 'Skin Studio', icon: 'brush', description: 'Pixel editor and skin library' },
  { id: 'backgrounds', label: 'Backgrounds', icon: 'image', description: 'Menu backgrounds and rotation' },
  { id: 'maps', label: 'Map Studio', icon: 'map', description: 'Map library and visual presets' },
  { id: 'resources', label: 'Weapon Studio', icon: 'cube', description: 'Weapon textures and resource swaps' },
  { id: 'performance', label: 'Performance', icon: 'gauge', description: 'FPS, frame time, resources' },
  { id: 'hud', label: 'HUD Editor', icon: 'sliders', description: 'Position and style HUD overlays' },
  { id: 'crosshair', label: 'Crosshair Studio', icon: 'crosshair', description: 'Custom crosshair overlay' },
  { id: 'analytics', label: 'Match Analytics', icon: 'chart', description: 'Sessions and match history' },
  { id: 'replays', label: 'Replay Studio', icon: 'film', description: 'Recordings and bookmarks' },
  { id: 'social', label: 'Social', icon: 'users', description: 'Friends, messages, groups' },
  { id: 'marketplace', label: 'Marketplace', icon: 'store', description: 'Community cosmetics and resources' },
  { id: 'plugins', label: 'Plugins', icon: 'plug', description: 'Approved extensions' },
  { id: 'customization', label: 'Themes & Style', icon: 'palette', description: 'Themes and game style' },
  { id: 'lab', label: 'Visual Lab', icon: 'eye', description: 'Live preview and side-by-side comparison' },
  { id: 'gallery', label: 'Creator Gallery', icon: 'star', description: 'Top community creations by type' },
  { id: 'journal', label: 'Session Journal', icon: 'bookmark', description: 'Sessions, notes and personal history' },
  { id: 'profiles', label: 'Profiles', icon: 'layers', description: 'Smart configuration profiles' },
  { id: 'workspace', label: 'Workspaces', icon: 'grid', description: 'Menu layout, widgets and quick access' },
  { id: 'automation', label: 'Automation', icon: 'bolt', description: 'Local rules that switch profiles and workspaces' },
  { id: 'backups', label: 'Backup Vault', icon: 'archive', description: 'Snapshots, history and restore' },
  { id: 'diagnostics', label: 'Diagnostics', icon: 'activity', description: 'Checks, logs and fixes' },
  { id: 'updates', label: 'Updates', icon: 'download', description: 'Update Center' },
  { id: 'settings', label: 'Settings', icon: 'gear', description: 'Client preferences' },
  { id: 'hub', label: 'Community Hub', icon: 'globe', description: 'News, guides and support' },
];

/** Tools: reachable from the collapsible Tools group and the Command Center. */
const CLIENT_TOOLS = ['customization', 'lab', 'gallery', 'journal', 'profiles', 'workspace', 'automation', 'backups', 'diagnostics', 'updates'];

const DEFAULT_NAV_ORDER = ['home', 'play', 'inventory', 'skins', 'backgrounds', 'maps', 'resources', 'performance', 'hud', 'crosshair', 'analytics', 'replays', 'social', 'marketplace', 'plugins', 'settings', 'hub'];

const CLIENT_NAVIGATION = {
  items: CLIENT_DESTINATIONS.map((d) => ({
    id: d.id,
    destination: d.id,
    label: d.label,
    icon: d.icon,
    description: d.description,
    visible: DEFAULT_NAV_ORDER.includes(d.id),
    order: DEFAULT_NAV_ORDER.includes(d.id) ? DEFAULT_NAV_ORDER.indexOf(d.id) : 50 + CLIENT_DESTINATIONS.indexOf(d),
    group: ['settings', 'hub'].includes(d.id) ? 'footer' : 'main',
  })),
};

/** Central feature registry. Owner can toggle, rename, mark beta, hide. */
const CLIENT_FEATURES = {
  flags: {
    hudEditor: { enabled: true, visible: true, beta: false, label: 'HUD Editor', description: 'Position and style Polaris HUD overlays.' },
    crosshairStudio: { enabled: true, visible: true, beta: false, label: 'Crosshair Studio', description: 'Custom crosshair overlay.' },
    skinStudio: { enabled: true, visible: true, beta: false, label: 'Skin Studio', description: 'Pixel editor for skins.' },
    backgroundStudio: { enabled: true, visible: true, beta: false, label: 'Background Studio', description: 'Menu backgrounds and rotation queue.' },
    resourceSwapper: { enabled: true, visible: true, beta: false, label: 'Resource Swapper', description: 'Replace cosmetic game resources locally.' },
    marketplace: { enabled: true, visible: true, beta: false, label: 'Marketplace', description: 'Community cosmetics catalog.' },
    social: { enabled: true, visible: true, beta: false, label: 'Social', description: 'Friends, messages and groups.' },
    replays: { enabled: true, visible: true, beta: true, label: 'Replay Studio', description: 'Record and review gameplay.' },
    analytics: { enabled: true, visible: true, beta: false, label: 'Match Analytics', description: 'Session tracking and match log.' },
    plugins: { enabled: true, visible: true, beta: true, label: 'Plugins', description: 'Sandboxed extensions.' },
    cloudSync: { enabled: true, visible: true, beta: false, label: 'Cloud Sync', description: 'Sync profiles and settings.' },
    adblock: { enabled: true, visible: true, beta: false, label: 'Ad filtering', description: 'Block third-party ad networks inside the game view.' },
    discordPresence: { enabled: false, visible: true, beta: true, label: 'Discord presence', description: 'Show Polaris activity on Discord.' },
    autoUpdate: { enabled: true, visible: true, beta: false, label: 'Automatic updates', description: 'Download verified updates in the background.' },
    mapStudio: { enabled: true, visible: true, beta: false, label: 'Map Studio', description: 'Map library, notes and local visual presets.' },
    commandCenter: { enabled: true, visible: true, beta: false, label: 'Command Center', description: 'Search and run every feature from one keyboard palette (Ctrl+K).' },
    smartSetup: { enabled: true, visible: true, beta: false, label: 'Smart Setup', description: 'First-start assistant with hardware-based recommendations.' },
    workspaces: { enabled: true, visible: true, beta: false, label: 'Workspaces', description: 'Personal menu order, widgets and quick access.' },
    visualLab: { enabled: true, visible: true, beta: false, label: 'Visual Lab', description: 'Live preview and side-by-side comparison of visual settings.' },
    creatorGallery: { enabled: true, visible: true, beta: false, label: 'Creator Gallery', description: 'Top community creations grouped by type.' },
    sessionJournal: { enabled: true, visible: true, beta: false, label: 'Session Journal', description: 'Sessions with notes, favorites and history.' },
    profileAutomation: { enabled: true, visible: true, beta: false, label: 'Profile Automation', description: 'Local rules that switch profiles and workspaces.' },
    backupVault: { enabled: true, visible: true, beta: false, label: 'Backup Vault', description: 'Automatic and manual snapshots with integrity checks.' },
    diagnostics: { enabled: true, visible: true, beta: false, label: 'Diagnostics', description: 'Checks for connection, configuration and version problems.' },
    liveUpdates: { enabled: true, visible: true, beta: false, label: 'Live configuration', description: 'Receive published changes instantly over the realtime connection.' },
  },
};

const HOME_WIDGETS = [
  { id: 'greeting', label: 'Greeting', size: 'wide' },
  { id: 'quickLaunch', label: 'Quick launch', size: 'normal' },
  { id: 'sessionStats', label: 'Session statistics', size: 'normal' },
  { id: 'recentMatches', label: 'Recent matches', size: 'normal' },
  { id: 'favoriteSkins', label: 'Favorite skins', size: 'normal' },
  { id: 'announcements', label: 'Announcements', size: 'normal' },
  { id: 'news', label: 'Community news', size: 'wide' },
  { id: 'updates', label: 'Updates', size: 'normal' },
];

const CLIENT_HOME = {
  available: HOME_WIDGETS.map((w) => w.id),
  widgets: HOME_WIDGETS.map((w, i) => ({ id: w.id, label: w.label, size: w.size, visible: true, order: i })),
  greeting: 'Welcome back',
};

const PERFORMANCE_PROFILES = {
  profiles: [
    {
      id: 'performance', name: 'Performance', official: true,
      description: 'Lowest overhead: no animations, no animated backgrounds, unlocked frame rate.',
      settings: { animations: false, animatedBackgrounds: false, decorativeEffects: false, fpsUnlock: true, hardwareAcceleration: true, backgroundThrottling: true, showFps: true },
    },
    {
      id: 'balanced', name: 'Balanced', official: true,
      description: 'Light animations, unlocked frame rate.',
      settings: { animations: true, animatedBackgrounds: false, decorativeEffects: true, fpsUnlock: true, hardwareAcceleration: true, backgroundThrottling: true, showFps: true },
    },
    {
      id: 'quality', name: 'Quality', official: true,
      description: 'All interface effects, VSync-locked frame rate for smooth pacing.',
      settings: { animations: true, animatedBackgrounds: true, decorativeEffects: true, fpsUnlock: false, hardwareAcceleration: true, backgroundThrottling: false, showFps: false },
    },
  ],
  defaultProfile: 'balanced',
};

const HUD_ELEMENTS = {
  fps: { label: 'FPS counter', visible: true, x: 98.5, y: 1.5, anchor: 'top-right', scale: 1, opacity: 0.9, color: '#E8EEF6', background: 'rgba(6,10,19,0.55)', fontSize: 13, font: 'JetBrains Mono', align: 'right', padding: 6, borderColor: 'rgba(0,217,255,0.35)', borderWidth: 0 },
  ping: { label: 'Latency', visible: true, x: 98.5, y: 5.5, anchor: 'top-right', scale: 1, opacity: 0.9, color: '#AAB7C8', background: 'rgba(6,10,19,0.55)', fontSize: 12, font: 'JetBrains Mono', align: 'right', padding: 6, borderColor: 'rgba(0,217,255,0.35)', borderWidth: 0 },
  timer: { label: 'Session timer', visible: false, x: 50, y: 1.5, anchor: 'top-center', scale: 1, opacity: 0.85, color: '#E8EEF6', background: 'rgba(6,10,19,0.55)', fontSize: 14, font: 'JetBrains Mono', align: 'center', padding: 6, borderColor: 'rgba(0,217,255,0.35)', borderWidth: 0 },
  clock: { label: 'Clock', visible: false, x: 1.5, y: 1.5, anchor: 'top-left', scale: 1, opacity: 0.8, color: '#AAB7C8', background: 'transparent', fontSize: 12, font: 'JetBrains Mono', align: 'left', padding: 4, borderColor: 'transparent', borderWidth: 0 },
  killfeed: { label: 'Kill feed (game UI)', visible: true, x: 98.5, y: 12, anchor: 'top-right', scale: 1, opacity: 1, color: '#FFFFFF', background: 'transparent', fontSize: 13, font: 'Satoshi', align: 'right', padding: 0, borderColor: 'transparent', borderWidth: 0, gameSelector: '.kill-feed, [class*="kill-feed"], [class*="killfeed"]' },
  scoreboard: { label: 'Scoreboard (game UI)', visible: true, x: 50, y: 20, anchor: 'top-center', scale: 1, opacity: 1, color: '#FFFFFF', background: 'rgba(6,10,19,0.8)', fontSize: 13, font: 'Satoshi', align: 'center', padding: 0, borderColor: 'transparent', borderWidth: 0, gameSelector: '.tab-info, [class*="scoreboard"]' },
  weapon: { label: 'Weapon info (game UI)', visible: true, x: 98, y: 92, anchor: 'bottom-right', scale: 1, opacity: 1, color: '#FFFFFF', background: 'transparent', fontSize: 14, font: 'Satoshi', align: 'right', padding: 0, borderColor: 'transparent', borderWidth: 0, gameSelector: '.ammo, [class*="weapon-info"], [class*="ammo"]' },
};

const CLIENT_HUD = {
  presets: [
    { id: 'polaris-default', name: 'Polaris Default', official: true, elements: HUD_ELEMENTS },
    {
      id: 'polaris-minimal', name: 'Minimal', official: true,
      elements: Object.fromEntries(Object.entries(HUD_ELEMENTS).map(([k, v]) => [k, { ...v, visible: k === 'fps', opacity: 0.6, background: 'transparent' }])),
    },
  ],
  defaultPreset: 'polaris-default',
};

const CROSSHAIR_DEFAULT = {
  enabled: true, shape: 'cross', size: 10, thickness: 2, gap: 4, color: '#00D9FF', opacity: 1,
  outline: true, outlineColor: '#000000', outlineThickness: 1,
  dot: false, dotSize: 2, dotColor: '#00D9FF',
  style: 'static', animation: 'none', animationSpeed: 1, tStyle: false, rotation: 0,
};

const CLIENT_CROSSHAIRS = {
  presets: [
    { id: 'polaris', name: 'Polaris', official: true, crosshair: CROSSHAIR_DEFAULT },
    { id: 'classic-white', name: 'Classic White', official: true, crosshair: { ...CROSSHAIR_DEFAULT, color: '#FFFFFF', size: 8, gap: 3 } },
    { id: 'dot', name: 'Dot only', official: true, crosshair: { ...CROSSHAIR_DEFAULT, shape: 'dot', dot: true, dotSize: 4, dotColor: '#3DDC97' } },
    { id: 'circle', name: 'Ring', official: true, crosshair: { ...CROSSHAIR_DEFAULT, shape: 'circle', size: 12, thickness: 2, color: '#FFB547', dot: true, dotSize: 2, dotColor: '#FFB547' } },
    { id: 't-style', name: 'T-Style', official: true, crosshair: { ...CROSSHAIR_DEFAULT, tStyle: true, color: '#FF5A6A', size: 9, gap: 3 } },
    { id: 'polaris-star', name: 'North Star', official: true, crosshair: { ...CROSSHAIR_DEFAULT, shape: 'star', size: 9, thickness: 2, gap: 0, color: '#E8EEF6', dot: true, dotSize: 2, dotColor: '#00D9FF' } },
    { id: 'pulse', name: 'Pulse (animated)', official: true, crosshair: { ...CROSSHAIR_DEFAULT, style: 'animated', animation: 'pulse', animationSpeed: 1.2 } },
  ],
  defaultPreset: 'polaris',
};

const CLIENT_BACKGROUNDS = {
  featured: [],            // [{ id, name, assetUrl, category, animated }]
  categories: ['Abstract', 'Landscape', 'Minimal', 'Community', 'Official'],
  defaultBackground: null, // asset url or null (built-in starfield)
  queueLimit: 50,
  rotation: { enabled: false, intervalMinutes: 10, random: true },
  allowUserUploads: true,
};

const OFFICIAL_PROFILES = {
  official: [
    { id: 'competitive', name: 'Competitive', description: 'Minimal HUD, static crosshair, performance settings.', data: { performanceProfile: 'performance', hudPreset: 'polaris-minimal', crosshairPreset: 'classic-white' } },
    { id: 'casual', name: 'Casual', description: 'Full HUD with animations.', data: { performanceProfile: 'balanced', hudPreset: 'polaris-default', crosshairPreset: 'polaris' } },
    { id: 'minimal', name: 'Minimal', description: 'Almost nothing on screen.', data: { performanceProfile: 'balanced', hudPreset: 'polaris-minimal', crosshairPreset: 'dot' } },
    { id: 'performance', name: 'Performance', description: 'Everything tuned for low-end hardware.', data: { performanceProfile: 'performance', hudPreset: 'polaris-minimal', crosshairPreset: 'polaris' } },
    { id: 'practice', name: 'Practice', description: 'Timer and FPS visible for practice sessions.', data: { performanceProfile: 'balanced', hudPreset: 'polaris-default', crosshairPreset: 'circle' } },
  ],
};

const CLIENT_CSS = {
  // Approved style overrides. Validated by shared/utilities/css-sanitize.js:
  // only `.pl-*` / `[data-pl-*]` selectors and `:root` custom properties, no url(), no @import.
  overrides: '',
};

const CLIENT_UPDATES = {
  channels: ['stable', 'beta'],
  defaultChannel: 'stable',
  minimumVersion: '1.0.0',
  checkIntervalHours: 6,
  message: '',
};

const COMMUNITY_SETTINGS = {
  categories: {
    skin: ['Characters', 'Abstract', 'Anime', 'Minimal', 'Seasonal'],
    background: ['Abstract', 'Landscape', 'Minimal', 'Community'],
    resource: ['Weapon textures', 'Sounds', 'Skyboxes', 'UI icons'],
    crosshair: ['Static', 'Animated'],
    hud: ['Competitive', 'Casual'],
    theme: ['Dark', 'Light', 'Colorful'],
    workspace: ['Player', 'Creator', 'Minimal'],
    plugin: ['Interface', 'Utility', 'Social', 'Statistics'],
  },
  uploadPermissions: { skin: 'user', background: 'user', resource: 'user', crosshair: 'user', hud: 'user', theme: 'user', workspace: 'user', plugin: 'user' },
  requireApproval: true,
  marketplaceRules: 'All Polaris marketplace items are free community creations. Polaris does not sell, trade or process Kirka.io items, KC, coins or any official game currency. Upload only work you created or have permission to share.',
  marketplaceFeatured: [],
};

const WEBSITE_THEME = {
  colors: {
    bg: '#07090F',
    surface: '#0D1220',
    surface2: '#141B2D',
    line: '#1E283D',
    text: '#EDF1F7',
    text2: '#A3AFC2',
    text3: '#68758B',
    accent: '#00D9FF',
    accent2: '#287BFF',
    accent3: '#914DFF',
    paper: '#F2EFE8',
    ink: '#0B0F18',
  },
  typography: { ui: 'Satoshi', display: 'Satoshi', mono: 'JetBrains Mono' },
  effects: { animations: true },
};

const WEBSITE_SITE = {
  siteName: 'Polaris Community Hub',
  tagline: 'A desktop client for Kirka.io, built by players.',
  navigation: [
    { label: 'Downloads', href: 'downloads.html', visible: true },
    { label: 'News', href: 'news.html', visible: true },
    { label: 'Features', href: 'features.html', visible: true },
    { label: 'Community', href: 'community.html', visible: true },
    { label: 'Skins', href: 'skins.html', visible: true },
    { label: 'Resources', href: 'resources.html', visible: true },
    { label: 'Plugins', href: 'plugins.html', visible: true },
    { label: 'Guides', href: 'guides.html', visible: true },
    { label: 'Docs', href: 'documentation.html', visible: true },
    { label: 'Support', href: 'support.html', visible: true },
  ],
  hero: {
    eyebrow: 'Polaris Client 1.1',
    title: 'Kirka.io, on your own terms.',
    body: 'Polaris is an independent desktop client for Kirka.io. It runs the official game in a focused window and adds the things players actually ask for: a crosshair studio, a HUD editor, a pixel skin editor, performance tooling and a community to share it all with.',
    primaryCta: { label: 'Download for Linux', href: 'downloads.html' },
    secondaryCta: { label: 'Read the changelog', href: 'changelog.html' },
    imageAssetUrl: null,
  },
  sections: [
    { id: 'features', type: 'features', visible: true, title: 'What Polaris adds', body: '' },
    { id: 'news', type: 'news', visible: true, title: 'From the log', body: '' },
    { id: 'skins', type: 'skins', visible: true, title: 'Made by the community', body: '' },
    { id: 'discord', type: 'discord', visible: true, title: 'Talk to us', body: 'Bug reports, skin drops and release previews happen on Discord first.' },
  ],
  features: [
    { title: 'Crosshair Studio', body: 'Shapes, gaps, outlines, animated styles. Live preview, presets, import and export.' },
    { title: 'HUD Editor', body: 'Drag FPS, latency, timer and clock overlays where you want them. Restyle supported game UI.' },
    { title: 'Skin Studio', body: 'A layered pixel editor for 64×64 and 128×128 templates with undo history and PNG export.' },
    { title: 'Performance Center', body: 'Measured FPS, frame time, memory and CPU — plus profiles for weaker machines.' },
    { title: 'Smart Profiles', body: 'Switch between competitive, casual and practice setups in one click.' },
    { title: 'Replay Studio', body: 'Record your game window locally, bookmark moments, review at any speed.' },
  ],
  pages: {
    about: { title: 'About Polaris', body: 'Polaris is an independent, community-run project. It is not affiliated with, endorsed by or connected to Kirka.io or its developers. Polaris loads the official game website and never modifies gameplay, hitboxes or server-controlled values. No cheats, no automation, no anti-cheat bypasses.' },
    support: { title: 'Support', body: 'Most problems are solved by the troubleshooting steps below. If yours is not, file a bug report with your client version and the log file from Settings → Advanced → Logs.' },
    guides: { title: 'Guides', body: '' },
    discord: { title: 'Discord', body: 'Join the Polaris Discord for release previews, support and skin drops.', inviteUrl: '' },
    documentation: { title: 'Documentation', body: '' },
    contact: { title: 'Contact', body: 'Questions about Polaris, press requests or a security problem? Pick the channel that fits. Please do not send Kirka.io account or purchase questions here: Polaris is not affiliated with Kirka.io and cannot help with official accounts, KC or items.' },
  },
  downloads: {
    showDeb: true,
    installNotes: 'chmod +x Polaris-Client-1.1.1.AppImage\n./Polaris-Client-1.1.1.AppImage',
  },
  footer: {
    note: 'Polaris is an unofficial community project and is not affiliated with Kirka.io.',
    columns: [
      { title: 'Client', links: [{ label: 'Downloads', href: 'downloads.html' }, { label: 'Changelog', href: 'changelog.html' }, { label: 'Features', href: 'features.html' }] },
      { title: 'Community', links: [{ label: 'Skin gallery', href: 'skins.html' }, { label: 'Resources', href: 'resources.html' }, { label: 'Plugins', href: 'plugins.html' }, { label: 'Discord', href: 'discord.html' }] },
      { title: 'Help', links: [{ label: 'Guides', href: 'guides.html' }, { label: 'Support', href: 'support.html' }, { label: 'Bug reports', href: 'bugs.html' }, { label: 'Suggestions', href: 'suggestions.html' }, { label: 'Documentation', href: 'documentation.html' }, { label: 'Contact', href: 'contact.html' }] },
    ],
  },
  discordUrl: '',
  githubUrl: 'https://github.com/JulianBa-12/kirka-client',
};

const WEBSITE_CSS = { overrides: '' };

const DEFAULTS = {
  'client.theme': CLIENT_THEME,
  'client.navigation': CLIENT_NAVIGATION,
  'client.features': CLIENT_FEATURES,
  'client.home': CLIENT_HOME,
  'client.performance': PERFORMANCE_PROFILES,
  'client.hud': CLIENT_HUD,
  'client.crosshairs': CLIENT_CROSSHAIRS,
  'client.backgrounds': CLIENT_BACKGROUNDS,
  'client.profiles': OFFICIAL_PROFILES,
  'client.css': CLIENT_CSS,
  'client.updates': CLIENT_UPDATES,
  'community.settings': COMMUNITY_SETTINGS,
  'website.theme': WEBSITE_THEME,
  'website.site': WEBSITE_SITE,
  'website.css': WEBSITE_CSS,
};

/** Which domains are delivered in which signed bundle. */
/**
 * How a published change reaches running clients.
 *   live    — applied immediately when the client receives the new bundle (realtime or poll)
 *   restart — stored immediately, but some values only take effect after the client restarts
 * Changes to program code are never delivered through configuration; they need a release
 * (Update Center: signed manifest, SHA-512 check, rollback).
 */
const DOMAIN_APPLY = {
  'client.theme': 'live', 'client.navigation': 'live', 'client.features': 'live', 'client.home': 'live',
  'client.performance': 'restart', 'client.hud': 'live', 'client.crosshairs': 'live', 'client.backgrounds': 'live',
  'client.profiles': 'live', 'client.css': 'live', 'client.updates': 'live', 'community.settings': 'live',
  'website.theme': 'live', 'website.site': 'live', 'website.css': 'live',
};

const BUNDLE_TARGETS = {
  client: ['client.theme', 'client.navigation', 'client.features', 'client.home', 'client.performance', 'client.hud', 'client.crosshairs', 'client.backgrounds', 'client.profiles', 'client.css', 'client.updates', 'community.settings'],
  website: ['website.theme', 'website.site', 'website.css', 'community.settings'],
};

module.exports = {
  DEFAULTS, BUNDLE_TARGETS, CLIENT_DESTINATIONS, CLIENT_TOOLS, HOME_WIDGETS, HUD_ELEMENTS, CROSSHAIR_DEFAULT, DOMAIN_APPLY,
};
