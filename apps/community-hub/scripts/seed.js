#!/usr/bin/env node
'use strict';
/**
 * Generates the static data files the site renders from.
 *
 *   node scripts/seed.js            → public/data/      (baseline shipped with the site)
 *   node scripts/seed.js --sample   → fixtures/sample/  (development fixtures: a release, news, changelog)
 *
 * public/data is honest: it contains the website bundle built from the shared defaults, an empty
 * release manifest ("first release pending"), no news and an empty apiBase. It is overwritten at
 * deploy time with the real signed data from the backend.
 *
 * fixtures/sample contains realistic but NOT REAL release data (placeholder checksums). It is only
 * for local development and visual QA: `node scripts/build.js --data fixtures/sample`.
 * Never deploy it.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const APP = path.resolve(__dirname, '..');
const { DEFAULTS, BUNDLE_TARGETS } = require(path.resolve(APP, '../../shared/configuration/defaults.js'));

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}
const envelope = (payload) => ({ format: 'polaris-envelope/1', keyId: '0000000000000000', signature: 'UNSIGNED-DEVELOPMENT-SEED', payload: canonical(payload) });
const writeJson = (dir, name, data) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2) + '\n'); };

const sample = process.argv.includes('--sample');
const out = path.join(APP, sample ? 'fixtures/sample' : 'public/data');
const now = sample ? '2026-11-14T16:00:00.000Z' : new Date().toISOString();

const domains = {};
for (const d of BUNDLE_TARGETS.website) domains[d] = { version: 0, publishedAt: now, data: DEFAULTS[d] };

const announcements = sample ? [{
  id: 1, title: 'Polaris 1.0.0 is out', body: 'The first stable build is available for Linux. Read the release notes on the downloads page.',
  level: 'info', target: 'both', startsAt: null, endsAt: null, publishedAt: '2026-11-14T16:00:00.000Z',
}] : [];

writeJson(out, 'website-bundle.json', envelope({
  format: 'polaris-bundle/1', target: 'website', sequence: sample ? 3 : 0, issuedAt: now, preview: false,
  minClientVersion: '1.0.0', domains, announcements, assetsBase: '',
}));
writeJson(out, 'site-config.json', { apiBase: '' });

if (!sample) {
  writeJson(out, 'releases.json', envelope({ format: 'polaris-releases/1', target: 'releases', sequence: 0, issuedAt: now, channels: { stable: null, beta: null }, minimumVersion: '1.0.0', history: [] }));
  writeJson(out, 'news.json', { items: [], total: 0 });
  writeJson(out, 'changelog.json', { items: [] });
  console.log(`wrote baseline data → ${path.relative(process.cwd(), out)}`);
  process.exit(0);
}

// ------------------------------------------------------------ sample fixtures (development only)
const fakeSha = (s) => crypto.createHash('sha512').update('polaris-sample-fixture:' + s).digest('base64');
const GH = 'https://github.com/JulianBa-12/kirka-client/releases/download';
const file = (v, platform, name, size) => ({ platform, name, url: `${GH}/v${v}/${name}`, size, sha512: fakeSha(name) });
const maintainer = { id: 1, username: 'polaris', displayName: 'Polaris Team', avatarUrl: null, role: 'owner', bio: '', createdAt: '2026-08-01T10:00:00.000Z' };

const r100 = {
  id: 4, version: '1.0.0', channel: 'stable', title: 'First stable release', publishedAt: '2026-11-14T16:00:00.000Z', rollout: 100, minimumVersion: '1.0.0',
  notes: '## Highlights\n\n- **Crosshair Studio** with seven official presets, outlines, T-style and animated styles.\n- **HUD Editor**: drag FPS, latency, session timer and clock overlays; restyle the supported game UI.\n- **Skin Studio**: layered pixel editor for 64×64 and 128×128 templates with undo history.\n- **Performance Center** with Performance, Balanced and Quality profiles.\n\n## Updates\n\nThe client now downloads signed update manifests and refuses any manifest whose signature does not match the key compiled into the client.\n\n## Known issues\n\n- Replay Studio is still marked beta. Long recordings on slow disks can drop frames.\n- Discord presence is off by default.',
  files: [
    file('1.0.0', 'linux-appimage', 'Polaris-Client-1.0.0.AppImage', 104857600 + 3311616),
    file('1.0.0', 'linux-deb', 'polaris-client_1.0.0_amd64.deb', 71303168 + 120034),
    // The Owner build must never be offered on the public site; it is here to test the filter.
    file('1.0.0', 'linux-appimage', 'Polaris-Owner-1.0.0.AppImage', 101000000),
  ],
};
const rBeta = {
  id: 5, version: '1.1.0-beta.1', channel: 'beta', title: 'Map presets preview', publishedAt: '2026-11-17T12:30:00.000Z', rollout: 50, minimumVersion: '1.0.0',
  notes: '- New **Maps** view with per-map visual presets.\n- Plugin permission prompts are clearer.\n- Fixed the session timer resetting after a reconnect.',
  files: [file('1.1.0-beta.1', 'linux-appimage', 'Polaris-Client-1.1.0-beta.1.AppImage', 106000000)],
};
const r092 = {
  id: 3, version: '0.9.2', channel: 'beta', title: 'Release candidate 2', publishedAt: '2026-10-30T18:00:00.000Z', rollout: 100, minimumVersion: '0.9.0',
  notes: '- Fixed the HUD editor snapping overlays to the wrong corner on ultrawide displays.\n- The update center shows download progress and verification state.\n- Reduced idle CPU usage of the launcher window.',
  files: [file('0.9.2', 'linux-appimage', 'Polaris-Client-0.9.2.AppImage', 103000000)],
};
const r090 = {
  id: 1, version: '0.9.0', channel: 'beta', title: 'Public beta', publishedAt: '2026-10-02T15:00:00.000Z', rollout: 100, minimumVersion: '0.9.0',
  notes: 'First public beta for Linux.\n\n- Crosshair overlay and HUD overlays.\n- Community marketplace (browse only).\n- Cloud sync for profiles.',
  files: [file('0.9.0', 'linux-appimage', 'Polaris-Client-0.9.0.AppImage', 98000000)],
};
writeJson(out, 'releases.json', envelope({
  format: 'polaris-releases/1', target: 'releases', sequence: 4, issuedAt: now,
  channels: { stable: r100, beta: rBeta }, minimumVersion: '1.0.0', history: [rBeta, r100, r092, r090],
}));
writeJson(out, 'changelog.json', { items: [rBeta, r100, r092, r090] });

const post = (id, slug, title, excerpt, body, tags, publishedAt, pinned = false) => ({ id, slug, title, excerpt, body, coverUrl: null, tags, pinned, publishedAt, author: maintainer });
writeJson(out, 'news.json', {
  total: 5,
  items: [
    post(5, 'polaris-1-0', 'Polaris 1.0 is stable', 'After two months of public beta the first stable build is out for Linux, with signed updates and the full studio suite.',
      'Polaris 1.0.0 is the first build we are comfortable calling stable.\n\n## What changed since the beta\n\n- Update manifests are signed. The client verifies every manifest before it downloads anything.\n- Crosshair Studio and HUD Editor are out of beta.\n- The Skin Studio gained layers and a proper undo history.\n\n## Upgrading\n\nIf you run 0.9.x, the update center will offer 1.0.0 automatically. Fresh installs: grab the AppImage from the [downloads page](downloads.html).\n\n> Polaris is an unofficial project. It loads the official Kirka.io website and never touches gameplay.',
      ['release'], '2026-11-14T16:00:00.000Z', true),
    post(4, 'skin-studio-templates', 'New Skin Studio templates', 'The 128×128 template now ships with labelled regions, so you can see which pixels end up on which part of the model.',
      'The 128×128 template now ships with labelled regions.\n\nOpen **Skin Studio → New → 128×128** and toggle *Show regions* in the layer panel.', ['skins', 'studio'], '2026-11-06T10:00:00.000Z'),
    post(3, 'release-candidate-2', 'Release candidate 2', 'Ultrawide fixes for the HUD editor, visible download progress in the update center and lower idle CPU usage.',
      'Release candidate 2 is rolling out to everyone on the beta channel.\n\n- HUD editor fixes on ultrawide displays\n- Download progress in the update center\n- Lower idle CPU usage', ['release', 'beta'], '2026-10-30T18:00:00.000Z'),
    post(2, 'community-guidelines', 'Marketplace ground rules', 'Everything in the marketplace is free. No KC, no coins, no trading — and only upload work you made yourself.',
      'Everything shared through Polaris is free.\n\n1. Upload only your own work, or work you have permission to share.\n2. No trading of Kirka.io items, KC or coins.\n3. Plugins are reviewed before they appear.', ['community'], '2026-10-12T09:00:00.000Z'),
    post(1, 'public-beta', 'The public beta is open', 'Polaris 0.9.0 is available for Linux. Expect rough edges, and please file bug reports.',
      'Polaris 0.9.0 is available for Linux as an AppImage.\n\nPlease report anything that breaks through the [bug tracker](bugs.html).', ['release', 'beta'], '2026-10-02T15:00:00.000Z'),
  ],
});
console.log(`wrote SAMPLE fixtures → ${path.relative(process.cwd(), out)} (development only, never deploy)`);
