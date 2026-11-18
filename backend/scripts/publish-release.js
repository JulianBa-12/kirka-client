'use strict';
/**
 * Operator CLI: registers and publishes a client release from built artifacts.
 *
 *   node scripts/publish-release.js --version 1.0.0 --notes ../docs/RELEASE_NOTES.md \
 *     --base-url https://github.com/<owner>/<repo>/releases/download/v1.0.0 \
 *     ../dist/Polaris-Client-1.0.0.AppImage ../dist/Polaris-Client-1.0.0.deb [--news]
 *   Recognised files: *.AppImage, *.deb, *-Setup.exe (Windows x64), *-mac-arm64.dmg, *-mac-x64.dmg
 *
 * Runs with direct database access on the server machine (the same trust level as the
 * operator who holds the signing key) — it is the scripted equivalent of the Owner app's
 * Release Manager. Size and SHA-512 are computed from the files, never typed by hand.
 * With --news a published news post announcing the release is created as well.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg = require('../config');
const { createContext } = require('../app');

const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf(`--${name}`); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = (name) => { const i = args.indexOf(`--${name}`); if (i < 0) return false; args.splice(i, 1); return true; };

const version = opt('version');
const channel = opt('channel', 'stable');
const title = opt('title', `Polaris Client ${version}`);
const notesFile = opt('notes');
const baseUrl = (opt('base-url') || '').replace(/\/+$/, '');
const withNews = flag('news');
const files = args;

if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version || '')) { console.error('--version x.y.z is required'); process.exit(2); }
if (!/^https:\/\//.test(baseUrl)) { console.error('--base-url https://… is required'); process.exit(2); }
if (!files.length) { console.error('pass at least one artifact path'); process.exit(2); }

const notes = notesFile ? fs.readFileSync(notesFile, 'utf8') : '';
const entries = files.map((f) => {
  const name = path.basename(f);
  const platform = name.endsWith('.AppImage') ? 'linux-appimage' : name.endsWith('.deb') ? 'linux-deb'
    : /-Setup\.exe$/.test(name) ? 'win-x64'
    : /-mac-arm64\.dmg$/.test(name) ? 'mac-arm64' : /-mac-x64\.dmg$/.test(name) ? 'mac-x64' : null;
  if (!platform) throw new Error(`unsupported artifact ${name}`);
  const data = fs.readFileSync(f);
  return { platform, name, url: `${baseUrl}/${encodeURIComponent(name)}`, size: data.length, sha512: crypto.createHash('sha512').update(data).digest('base64') };
});

const ctx = createContext(cfg);
const { db, configService } = ctx;
const now = () => new Date().toISOString();
const existing = db.get('SELECT * FROM releases WHERE version = ? AND channel = ?', version, channel);
let rid;
if (existing) {
  db.run('UPDATE releases SET title = ?, notes = ?, files = ?, updated_at = ? WHERE id = ?', title, notes, JSON.stringify(entries), now(), existing.id);
  rid = existing.id;
} else {
  rid = db.run('INSERT INTO releases (version, channel, title, notes, files, rollout, minimum_version, visible, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    version, channel, title, notes, JSON.stringify(entries), 100, '1.0.0', 1, 'draft', now(), now()).id;
}
db.run("UPDATE releases SET status = 'published', published_at = COALESCE(published_at, ?), updated_at = ? WHERE id = ?", now(), now(), rid);
ctx.audit(null, existing ? 'release.updated' : 'release.created', rid, { version, channel, via: 'publish-release.js', files: entries.map((e) => e.name) });
ctx.audit(null, 'release.published', rid, { version, channel, via: 'publish-release.js' });

if (withNews) {
  const slug = `polaris-client-${version.replace(/\./g, '-')}`;
  if (!db.get('SELECT id FROM news WHERE slug = ?', slug)) {
    const has = (p) => entries.some((e) => e.platform.startsWith(p));
    const systems = [has('win') && 'Windows', has('mac') && 'macOS', has('linux') && 'Linux'].filter(Boolean);
    const excerpt = `Polaris Client ${version} is available for ${systems.length > 1 ? `${systems.slice(0, -1).join(', ')} and ${systems.at(-1)}` : systems[0]}.`;
    db.run('INSERT INTO news (slug, title, excerpt, body, cover_url, tags, pinned, status, author_id, created_at, updated_at, published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      slug, title, excerpt, notes, null, JSON.stringify(['release']), 1, 'published', null, now(), now(), now());
    ctx.audit(null, 'news.created', slug, { title, via: 'publish-release.js' });
  }
}
configService.rebuild('releases');
configService.rebuild('client');
configService.rebuild('website');
for (const e of entries) console.log(`${e.platform}  ${e.name}  ${e.size} bytes  sha512 ${e.sha512.slice(0, 16)}…`);
console.log(`release ${version} (${channel}) published as #${rid}`);
ctx.db.close();
