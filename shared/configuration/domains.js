'use strict';
/**
 * Schemas for every remotely configurable domain. Used by:
 *   backend  — reject invalid drafts / publications
 *   client   — reject invalid or incompatible bundles even if correctly signed
 *   owner    — inline validation feedback
 */
const { s, validate } = require('../utilities/schema');
const { sanitizeCss } = require('../utilities/css-sanitize');
const { DEFAULTS, BUNDLE_TARGETS, CLIENT_DESTINATIONS, HOME_WIDGETS } = require('./defaults');

const FONTS = ['Satoshi', 'JetBrains Mono', 'system-ui', 'Inter', 'Arial', 'Georgia'];
const ICONS = ['home', 'play', 'sliders', 'brush', 'box', 'store', 'users', 'chart', 'film', 'gauge', 'layers', 'cube', 'map', 'plug', 'download', 'gear', 'globe', 'star', 'bell', 'shield', 'flag', 'heart', 'bolt', 'crosshair', 'image', 'message', 'compass'];
const DESTS = CLIENT_DESTINATIONS.map((d) => d.id);
const id = (max = 64) => s.string({ min: 1, max, pattern: /^[a-zA-Z0-9_-]+$/ });
const text = (max = 200) => s.string({ max });
const assetUrl = s.nullable(s.url());

const colorMap = (keys) => s.object(Object.fromEntries(keys.map((k) => [k, s.color()])));

const clientTheme = s.object({
  name: text(60),
  colors: colorMap(Object.keys(DEFAULTS['client.theme'].colors)),
  typography: s.object({
    ui: s.enum(FONTS), display: s.enum(FONTS), mono: s.enum(FONTS),
    baseSize: s.int({ min: 11, max: 20 }), scale: s.number({ min: 1, max: 1.6 }),
  }),
  shape: s.object({ radius: s.int({ min: 0, max: 16 }), chamfer: s.int({ min: 0, max: 20 }), borderWidth: s.int({ min: 0, max: 3 }) }),
  effects: s.object({
    shadow: s.enum(['none', 'subtle', 'deep']), accentGradient: s.bool(), animations: s.bool(),
    transitionMs: s.int({ min: 0, max: 600 }),
  }),
});

const navItem = s.object({
  id: id(), destination: s.enum(DESTS), label: s.string({ min: 1, max: 32 }), icon: s.enum(ICONS),
  description: text(120), visible: s.bool(), order: s.int({ min: 0, max: 999 }), group: s.enum(['main', 'footer']),
});

const featureFlag = s.object({ enabled: s.bool(), visible: s.bool(), beta: s.bool(), label: s.string({ min: 1, max: 48 }), description: text(200) });

const widget = s.object({
  id: s.enum(HOME_WIDGETS.map((w) => w.id)), label: s.string({ min: 1, max: 40 }), size: s.enum(['normal', 'wide']),
  visible: s.bool(), order: s.int({ min: 0, max: 99 }),
});

const perfSettings = s.object({
  animations: s.bool(), animatedBackgrounds: s.bool(), decorativeEffects: s.bool(), fpsUnlock: s.bool(),
  hardwareAcceleration: s.bool(), backgroundThrottling: s.bool(), showFps: s.bool(),
});
const perfProfile = s.object({ id: id(), name: s.string({ min: 1, max: 40 }), official: s.bool(), description: text(200), settings: perfSettings });

const hudElement = s.object({
  label: text(48), visible: s.bool(), x: s.number({ min: 0, max: 100 }), y: s.number({ min: 0, max: 100 }),
  anchor: s.enum(['top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right']),
  scale: s.number({ min: 0.25, max: 4 }), opacity: s.number({ min: 0, max: 1 }), color: s.color(), background: s.color(),
  fontSize: s.int({ min: 8, max: 48 }), font: s.enum(FONTS), align: s.enum(['left', 'center', 'right']),
  padding: s.int({ min: 0, max: 40 }), borderColor: s.color(), borderWidth: s.int({ min: 0, max: 6 }),
  gameSelector: s.optional(s.string({ max: 300, pattern: /^[a-zA-Z0-9_\-.,#\s[\]="*^$|:()]+$/ })),
});
const hudPreset = s.object({ id: id(), name: s.string({ min: 1, max: 40 }), official: s.bool(), elements: s.record(hudElement, { maxKeys: 32 }) });

const crosshair = s.object({
  enabled: s.bool(), shape: s.enum(['cross', 'dot', 'circle', 'square', 'star', 'chevron', 'x']),
  size: s.number({ min: 1, max: 64 }), thickness: s.number({ min: 0.5, max: 16 }), gap: s.number({ min: 0, max: 40 }),
  color: s.color(), opacity: s.number({ min: 0, max: 1 }), outline: s.bool(), outlineColor: s.color(), outlineThickness: s.number({ min: 0, max: 6 }),
  dot: s.bool(), dotSize: s.number({ min: 0.5, max: 16 }), dotColor: s.color(),
  style: s.enum(['static', 'animated']), animation: s.enum(['none', 'pulse', 'spin', 'breathe']), animationSpeed: s.number({ min: 0.1, max: 5 }),
  tStyle: s.bool(), rotation: s.number({ min: 0, max: 360 }),
});
const crosshairPreset = s.object({ id: id(), name: s.string({ min: 1, max: 40 }), official: s.bool(), crosshair });

const background = s.object({ id: id(), name: s.string({ min: 1, max: 60 }), assetUrl: s.url(), category: text(40), animated: s.bool() });

const officialProfile = s.object({
  id: id(), name: s.string({ min: 1, max: 40 }), description: text(200),
  data: s.object({ performanceProfile: id(), hudPreset: id(), crosshairPreset: id() }),
});

const link = s.object({ label: s.string({ min: 1, max: 40 }), href: s.url() });

const SCHEMAS = {
  'client.theme': clientTheme,
  'client.navigation': s.object({ items: s.array(navItem, { max: 40, uniqueBy: 'id' }) }),
  'client.features': s.object({ flags: s.record(featureFlag, { maxKeys: 64 }) }),
  'client.home': s.object({ available: s.array(s.enum(HOME_WIDGETS.map((w) => w.id)), { max: 20 }), widgets: s.array(widget, { max: 20, uniqueBy: 'id' }), greeting: text(60) }),
  'client.performance': s.object({ profiles: s.array(perfProfile, { max: 20, uniqueBy: 'id' }), defaultProfile: id() }),
  'client.hud': s.object({ presets: s.array(hudPreset, { max: 30, uniqueBy: 'id' }), defaultPreset: id() }),
  'client.crosshairs': s.object({ presets: s.array(crosshairPreset, { max: 60, uniqueBy: 'id' }), defaultPreset: id() }),
  'client.backgrounds': s.object({
    featured: s.array(background, { max: 100, uniqueBy: 'id' }), categories: s.array(s.string({ min: 1, max: 40 }), { max: 40 }),
    defaultBackground: assetUrl, queueLimit: s.int({ min: 1, max: 50 }),
    rotation: s.object({ enabled: s.bool(), intervalMinutes: s.int({ min: 1, max: 1440 }), random: s.bool() }),
    allowUserUploads: s.bool(),
  }),
  'client.profiles': s.object({ official: s.array(officialProfile, { max: 30, uniqueBy: 'id' }) }),
  'client.css': s.object({ overrides: s.string({ max: 65536 }) }),
  'client.updates': s.object({
    channels: s.array(s.enum(['stable', 'beta']), { max: 2 }), defaultChannel: s.enum(['stable', 'beta']),
    minimumVersion: s.string({ pattern: /^\d+\.\d+\.\d+$/ }), checkIntervalHours: s.int({ min: 1, max: 168 }), message: text(300),
  }),
  'community.settings': s.object({
    categories: s.record(s.array(s.string({ min: 1, max: 40 }), { max: 40 }), { maxKeys: 12 }),
    uploadPermissions: s.record(s.enum(['nobody', 'user', 'moderator', 'owner']), { maxKeys: 12 }),
    requireApproval: s.bool(), marketplaceRules: text(4000), marketplaceFeatured: s.array(s.int({ min: 1 }), { max: 50 }),
  }),
  'website.theme': s.object({
    colors: colorMap(Object.keys(DEFAULTS['website.theme'].colors)),
    typography: s.object({ ui: s.enum(FONTS), display: s.enum(FONTS), mono: s.enum(FONTS) }),
    effects: s.object({ animations: s.bool() }),
  }),
  'website.site': s.object({
    siteName: s.string({ min: 1, max: 60 }), tagline: text(160),
    navigation: s.array(s.object({ label: s.string({ min: 1, max: 30 }), href: s.url(), visible: s.bool() }), { max: 16 }),
    hero: s.object({ eyebrow: text(60), title: s.string({ min: 1, max: 120 }), body: text(800), primaryCta: link, secondaryCta: link, imageAssetUrl: assetUrl }),
    sections: s.array(s.object({ id: id(), type: s.enum(['features', 'news', 'skins', 'discord', 'text', 'download']), visible: s.bool(), title: text(120), body: text(2000) }), { max: 20, uniqueBy: 'id' }),
    features: s.array(s.object({ title: s.string({ min: 1, max: 60 }), body: text(400) }), { max: 24 }),
    pages: s.record(s.object({ title: s.string({ min: 1, max: 80 }), body: text(20000), inviteUrl: s.optional(s.nullable(s.string({ max: 300, pattern: /^(|https:\/\/[^\s"'<>]+)$/ }))) }), { maxKeys: 20 }),
    downloads: s.object({ showDeb: s.bool(), installNotes: text(2000) }),
    footer: s.object({ note: text(300), columns: s.array(s.object({ title: s.string({ min: 1, max: 30 }), links: s.array(link, { max: 10 }) }), { max: 5 }) }),
    discordUrl: s.string({ max: 300, pattern: /^(|https:\/\/[^\s"'<>]+)$/ }),
    githubUrl: s.string({ max: 300, pattern: /^(|https:\/\/[^\s"'<>]+)$/ }),
  }),
  'website.css': s.object({ overrides: s.string({ max: 65536 }) }),
};

const DOMAINS = Object.keys(SCHEMAS);

/** Schemas for shareable JSON documents (community items of kind crosshair / hud / theme / plugin). */
const PLUGIN_PERMISSIONS = ['ui.panel', 'storage', 'notifications', 'hud.overlay', 'game.events', 'theme.read'];
const ITEM_SCHEMAS = {
  crosshair: s.object({ format: s.enum(['polaris-crosshair/1']), name: s.string({ min: 1, max: 40 }), crosshair }),
  hud: s.object({ format: s.enum(['polaris-hud/1']), name: s.string({ min: 1, max: 40 }), elements: s.record(hudElement, { maxKeys: 32 }) }),
  theme: s.object({ format: s.enum(['polaris-theme/1']), theme: clientTheme }),
  plugin: s.object({
    format: s.enum(['polaris-plugin/1']),
    manifest: s.object({
      id: s.string({ min: 3, max: 48, pattern: /^[a-z0-9][a-z0-9.-]+$/ }), name: s.string({ min: 1, max: 48 }),
      version: s.string({ pattern: /^\d+\.\d+\.\d+$/ }), description: s.optional(s.string({ max: 300 }), ''),
      author: s.optional(s.string({ max: 48 }), ''), permissions: s.array(s.enum(PLUGIN_PERMISSIONS), { max: PLUGIN_PERMISSIONS.length }),
      minClientVersion: s.optional(s.string({ pattern: /^\d+\.\d+\.\d+$/ }), '1.0.0'),
    }),
    code: s.string({ min: 1, max: 200000 }),
  }),
};

/** Domain-level semantic checks beyond shape. */
function semanticChecks(domain, v, errors) {
  if (domain === 'client.css' || domain === 'website.css') {
    const r = sanitizeCss(v.overrides);
    if (!r.ok) for (const e of r.errors) errors.push({ path: 'overrides', message: e });
    else v.overrides = r.css;
  }
  if (domain === 'client.performance' && !v.profiles.some((p) => p.id === v.defaultProfile)) errors.push({ path: 'defaultProfile', message: 'must reference an existing profile' });
  if (domain === 'client.hud' && !v.presets.some((p) => p.id === v.defaultPreset)) errors.push({ path: 'defaultPreset', message: 'must reference an existing preset' });
  if (domain === 'client.crosshairs' && !v.presets.some((p) => p.id === v.defaultPreset)) errors.push({ path: 'defaultPreset', message: 'must reference an existing preset' });
  if (domain === 'client.navigation') {
    if (!v.items.some((i) => i.visible && i.destination === 'settings')) errors.push({ path: 'items', message: 'Settings must stay reachable (visible) so users can recover' });
  }
}

function validateDomain(domain, data) {
  const schema = SCHEMAS[domain];
  if (!schema) return { ok: false, errors: [{ path: '(domain)', message: `unknown domain ${domain}` }] };
  const r = validate(schema, data);
  if (!r.ok) return r;
  const errors = [];
  semanticChecks(domain, r.value, errors);
  return errors.length ? { ok: false, errors, value: undefined } : r;
}

module.exports = { ITEM_SCHEMAS, PLUGIN_PERMISSIONS, DOMAINS, SCHEMAS, DEFAULTS, BUNDLE_TARGETS, validateDomain, FONTS, ICONS };
