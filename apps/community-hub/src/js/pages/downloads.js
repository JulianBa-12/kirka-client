import { boot } from '../core/chrome.js';
import { h, clear, $, md, copyButton, codeBlock, link } from '../core/dom.js';
import { releases, publicFiles, GITHUB_RELEASES } from '../core/data.js';
import { api, status } from '../core/api.js';
import * as fmt from '../core/format.js';
import { stateBlock } from '../core/states.js';

const { site } = await boot('downloads');
const opts = site.downloads || { showDeb: true };
const manifest = await releases();
const stable = manifest.channels.stable;
const beta = manifest.channels.beta;
const content = $('[data-bind="content"]');
const ext = { rel: 'noopener noreferrer', target: '_blank' };
const fileLink = { rel: 'noopener' }; // release assets download in place

let sec = 0;
const label = (t) => h('p', { class: 'sec-label pl-label' }, h('span', { class: 'sec-label__num' }, fmt.pad(++sec)), t);

function trackClick(release, file) {
  status().then((s) => {
    if (s.state !== 'online') return;
    api('/telemetry/download', { method: 'POST', auth: 'none', body: { releaseId: release.id, platform: file.platform } }).catch(() => {});
  });
}

if (!stable) {
  $('[data-bind="title"]').textContent = 'First release pending';
  $('[data-bind="lede"]').textContent = 'No stable build of Polaris Client has been published yet. When it is, the downloads, checksums and release notes appear here automatically.';
  clear(content, h('section', { class: 'section section--flush' }, h('div', { class: 'wrap grid' },
    h('div', { class: 'dl-pending' },
      stateBlock({ label: 'Release manifest', title: 'Nothing to download yet', body: 'Polaris only lists builds that are published through the signed release manifest. Follow the GitHub releases page to be notified of the first build.', actions: [h('a', { class: 'btn btn--primary pl-chamfer', href: GITHUB_RELEASES, ...ext }, 'GitHub releases'), h('a', { class: 'btn', href: 'news.html' }, 'Read the news')] }),
      beta ? betaBlock(beta) : null),
    h('aside', { class: 'dl-pending__side', 'aria-labelledby': 'pend-h' },
      h('h2', { class: 'pl-label', id: 'pend-h' }, 'What to expect'),
      h('dl', { class: 'spec' },
        h('dt', { class: 'pl-label' }, 'Platforms'), h('dd', null, 'Windows · macOS · Linux'),
        h('dt', { class: 'pl-label' }, 'Packages'), h('dd', null, opts.showDeb ? 'Installer · DMG · AppImage · DEB' : 'Installer · DMG · AppImage'),
        h('dt', { class: 'pl-label' }, 'Checksums'), h('dd', null, 'SHA-512, listed here'),
        h('dt', { class: 'pl-label' }, 'Updates'), h('dd', null, 'Signed, in-app')),
      h('p', { class: 'field__hint' }, 'Until then, the ', h('a', { href: 'guides.html#install' }, 'install guide'), ' explains how the first build will be set up.')))));
} else {
  render();
}

function betaBlock(b) {
  const files = publicFiles(b, opts);
  const app = files.find((f) => f.platform === 'linux-appimage');
  return h('aside', { class: 'dl-beta', 'aria-labelledby': 'beta-h' },
    h('p', { class: 'pl-label', id: 'beta-h' }, 'Beta channel'),
    h('p', { class: 'dl-beta__ver pl-mono' }, b.version),
    h('p', null, b.title || 'Pre-release build', '. Beta builds get features first and may break. ', b.rollout < 100 ? `Rolling out to ${b.rollout}% of beta clients.` : ''),
    app ? h('a', { class: 'btn btn--sm', href: app.url, onclick: () => trackClick(b, app), ...fileLink }, `Beta AppImage · ${fmt.bytes(app.size)}`) : null,
    h('a', { class: 'arrow-link', href: 'changelog.html' }, 'Beta notes in the changelog'));
}

/* ------------------------------------------------------------------ systems */
const SYSTEMS = {
  windows: { label: 'Windows', spec: 'Windows 10 / 11 · x64' },
  macos: { label: 'macOS', spec: 'macOS 11+ · Apple Silicon and Intel' },
  linux: { label: 'Linux', spec: 'Linux x86-64' },
};
function detectSystem() {
  const p = ((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent || '').toLowerCase();
  if (p.includes('win')) return 'windows';
  if (p.includes('mac') || /iphone|ipad/.test(p)) return 'macos';
  return 'linux';
}
const systemOf = (f) => (f.platform.startsWith('win') ? 'windows' : f.platform.startsWith('mac') ? 'macos' : 'linux');
const hashCmd = {
  windows: (n, hex) => [`Get-FileHash .\\${n} -Algorithm SHA512`, hex ? `# expected: ${hex}` : null].filter(Boolean),
  macos: (n, hex) => hex ? [`echo "${hex}  ${n}" | shasum -a 512 -c`] : [`shasum -a 512 ${n}`],
  linux: (n, hex) => hex ? [`echo "${hex}  ${n}" | sha512sum -c`] : [`sha512sum ${n}`],
};

function render() {
  const files = publicFiles(stable, opts);
  const by = (p) => files.find((f) => f.platform === p);
  const app = by('linux-appimage'); const deb = by('linux-deb');
  const win = by('win-x64'); const macArm = by('mac-arm64'); const macX64 = by('mac-x64');
  const available = Object.keys(SYSTEMS).filter((k) => files.some((f) => systemOf(f) === k));
  let current = available.includes(detectSystem()) ? detectSystem() : available[0] || 'linux';

  $('[data-bind="title"]').textContent = `Polaris Client ${stable.version}`;
  const names = available.map((k) => SYSTEMS[k].label);
  $('[data-bind="lede"]').textContent = `${stable.title ? stable.title + '. ' : ''}Stable channel, published ${fmt.date(stable.publishedAt)}. Free, for ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0] || 'Linux'}.`;
  const headLabel = document.querySelector('.dl-head .page-head__label');
  if (headLabel) headLabel.textContent = `Downloads · ${names.join(' · ')}`;

  const primary = (f, meta) => h('a', { class: 'dl-block__primary', href: f.url, onclick: () => trackClick(stable, f), ...fileLink },
    h('span', { class: 'dl-block__file' }, f.name), h('span', { class: 'dl-block__meta pl-mono' }, meta));
  const alt = (f, text) => f ? h('a', { class: 'btn btn--sm', href: f.url, onclick: () => trackClick(stable, f), ...fileLink }, `${text} · ${fmt.bytes(f.size)}`) : null;
  function blockFor(sys) {
    if (sys === 'windows') return win ? [primary(win, `Installer · ${fmt.bytes(win.size)} · Windows 10 and 11, 64-bit`)] : [h('p', null, 'No Windows build in this release.')];
    if (sys === 'macos') {
      const main = macArm || macX64;
      if (!main) return [h('p', null, 'No macOS build in this release.')];
      return [primary(main, `Disk image · ${fmt.bytes(main.size)} · ${main === macArm ? 'Apple Silicon (M1 and newer)' : 'Intel Macs'}`),
        main === macArm && macX64 ? alt(macX64, 'Intel Mac') : null];
    }
    return app ? [primary(app, `AppImage · ${fmt.bytes(app.size)} · runs on most distributions`), alt(deb, 'DEB for Debian / Ubuntu')] : [h('p', null, 'This release has no AppImage attached.')];
  }

  const blockHost = h('div');
  const seg = h('div', { class: 'seg dl-os', role: 'group', 'aria-label': 'Operating system' });
  const installHost = h('div'); const verifyHost = h('div'); const platformDd = h('dd');
  function paint() {
    for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.os === current));
    const parts = blockFor(current);
    const [first, ...rest] = parts;
    clear(blockHost, h('div', { class: 'dl-block pl-chamfer' },
      h('p', { class: 'pl-label' }, current === detectSystem() ? `Recommended for ${SYSTEMS[current].label}` : SYSTEMS[current].label),
      first,
      h('div', { class: 'dl-block__alt' }, ...rest.filter(Boolean), h('a', { class: 'arrow-link', href: GITHUB_RELEASES, ...ext }, 'All releases on GitHub'))));
    platformDd.textContent = SYSTEMS[current].spec;
    clear(installHost, installFor(current));
    clear(verifyHost, verifyFor(current));
  }
  for (const k of available) seg.append(h('button', { type: 'button', 'data-os': k, onclick: () => { current = k; paint(); } }, SYSTEMS[k].label));

  const spec = h('dl', { class: 'spec dl-spec' },
    h('dt', { class: 'pl-label' }, 'Version'), h('dd', null, stable.version),
    h('dt', { class: 'pl-label' }, 'Channel'), h('dd', null, 'stable'),
    h('dt', { class: 'pl-label' }, 'Published'), h('dd', null, h('time', { datetime: stable.publishedAt }, fmt.date(stable.publishedAt))),
    h('dt', { class: 'pl-label' }, 'Platform'), platformDd,
    stable.minimumVersion ? [h('dt', { class: 'pl-label' }, 'Minimum supported'), h('dd', null, `${stable.minimumVersion} or later`)] : null,
    h('dt', { class: 'pl-label' }, 'Manifest'), h('dd', null, `signed · #${manifest.sequence || 0}`));

  // ---------------------------------------------------- files table
  const rows = files.map((f) => {
    const hex = fmt.base64ToHex(f.sha512);
    return h('tr', null,
      h('th', { scope: 'row' }, link(f.url, f.name, 'dl-files__name'), h('span', { class: 'dl-files__fmt meta' }, fmt.platformLabel(f.platform))),
      h('td', { class: 'num' }, fmt.bytes(f.size), h('span', { class: 'pl-sr' }, ` (${fmt.number(f.size)} bytes)`)),
      h('td', { class: 'dl-files__hash' }, hex
        ? h('details', null, h('summary', { class: 'hash' }, `${hex.slice(0, 16)}…${hex.slice(-8)}`, h('span', { class: 'pl-sr' }, ' — show full checksum')), h('code', { class: 'hash dl-files__full' }, hex))
        : h('span', { class: 'meta' }, 'not provided')),
      h('td', { class: 'dl-files__copy' }, hex ? copyButton(hex, 'Copy') : null));
  });
  const table = h('div', { class: 'table-wrap' }, h('table', { class: 'table dl-files' },
    h('caption', { class: 'pl-sr' }, `Files of Polaris Client ${stable.version}`),
    h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'File'), h('th', { scope: 'col', class: 'num' }, 'Size'), h('th', { scope: 'col' }, 'SHA-512 (hex)'), h('th', { scope: 'col' }, h('span', { class: 'pl-sr' }, 'Copy')))),
    h('tbody', null, rows)));

  // ---------------------------------------------------- install
  const unsigned = (text) => h('p', { class: 'field__hint' }, text);
  function installFor(sys) {
    if (sys === 'windows') {
      const n = win ? win.name : 'Polaris-Client-Setup.exe';
      return h('div', { class: 'dl-steps' },
        h('div', { class: 'dl-step' }, h('h3', null, 'Installer'),
          h('p', null, 'Run ', h('code', null, n), '. Polaris installs for your user account (no administrator rights needed), adds a Start menu entry and starts.'),
          unsigned('The installer is not code-signed yet, so Windows SmartScreen may show “Windows protected your PC”. Choose “More info”, check that the file name matches, then “Run anyway”. Verify the checksum below first if you want to be sure.')),
        h('div', { class: 'dl-step' }, h('h3', null, 'Updates and removal'),
          h('p', null, 'The in-app Update Center downloads the next installer, checks its signed size and SHA-512 and runs it after you confirm. Settings and library are kept.'),
          unsigned('Uninstall under Settings → Apps → Installed apps → Polaris Client.')));
    }
    if (sys === 'macos') {
      return h('div', { class: 'dl-steps' },
        h('div', { class: 'dl-step' }, h('h3', null, 'Disk image'),
          h('p', null, 'Open the .dmg and drag Polaris Client into Applications. Use the Apple Silicon build on M1 and newer, the Intel build on older Macs.'),
          unsigned('Polaris is not notarized by Apple yet. On the first start macOS says it can’t verify the app. Open System Settings → Privacy & Security, scroll down and choose “Open Anyway” for Polaris Client. Alternatively run:'),
          codeBlock(['xattr -dr com.apple.quarantine "/Applications/Polaris Client.app"'])),
        h('div', { class: 'dl-step' }, h('h3', null, 'Recording and updates'),
          h('p', null, 'For replays, allow Polaris under Privacy & Security → Screen Recording. The Update Center downloads and verifies the next disk image and opens it for you; drag the new version over the old one.')));
    }
    const appName = app ? app.name : 'Polaris-Client.AppImage';
    return h('div', { class: 'dl-steps' },
      h('div', { class: 'dl-step' },
        h('h3', null, 'AppImage'),
        h('p', null, 'One file, no installation. Make it executable once, then start it. Keep it anywhere — ', h('code', null, '~/Applications'), ' is a good place.'),
        codeBlock([`chmod +x ${appName}`, `./${appName}`]),
        h('p', { class: 'field__hint' }, 'If it fails to start with a FUSE error, install ', h('code', null, 'libfuse2'), ' (Ubuntu 22.04+: ', h('code', null, 'sudo apt install libfuse2'), ').')),
      deb ? h('div', { class: 'dl-step' },
        h('h3', null, 'DEB package'),
        h('p', null, 'For Debian, Ubuntu and derivatives. Installs a menu entry; updates go through the in-app update center.'),
        codeBlock([`sudo apt install ./${deb.name}`]),
        h('p', { class: 'field__hint' }, 'Uninstall with ', h('code', null, 'sudo apt remove polaris-client'), '.')) : null);
  }
  const notes = (opts.installNotes || '').trim();
  const ownerNotes = notes && !/^chmod \+x \S+\.AppImage\n\.\/\S+\.AppImage$/.test(notes)
    ? h('div', { class: 'dl-step dl-step--wide' }, h('h3', null, 'Notes from the maintainers'), h('pre', { class: 'dl-notes' }, notes)) : null;

  // ---------------------------------------------------- verify
  function verifyFor(sys) {
    const f = sys === 'windows' ? win : sys === 'macos' ? (macArm || macX64) : (app || deb);
    const name = f ? f.name : 'Polaris-Client';
    const hex = fmt.base64ToHex((f || {}).sha512 || '');
    const ok = sys === 'windows' ? 'the Hash value matches the SHA-512 in the files table' : h('span', null, 'it prints ', h('code', null, `${name}: OK`));
    return h('div', { class: 'dl-verify' },
      h('div', { class: 'dl-verify__text' },
        h('p', null, 'Every file is listed with its SHA-512 checksum. Compare it with what your machine computes before running the file:'),
        h('p', { class: 'field__hint' }, 'The file is intact when ', ok, '. Anything else means the download is corrupted or not the published build — delete it.'),
        h('p', null, 'After installation you do not need to do this again: the client checks the Ed25519 signature of every update manifest against the key compiled into it, and refuses unsigned or tampered updates and older manifests.')),
      h('div', { class: 'dl-verify__cmd' }, codeBlock(hashCmd[sys](name, hex))));
  }

  // ---------------------------------------------------- notes + history
  const notesEl = h('div', { class: 'prose' }); md(notesEl, stable.notes || 'No release notes.');
  const older = (manifest.history || []).filter((r) => r.version !== stable.version).slice(0, 6);

  paint();
  clear(content,
    h('section', { class: 'section section--flush dl-top' }, h('div', { class: 'wrap grid' },
      h('div', { class: 'dl-top__block' }, available.length > 1 ? seg : null, blockHost),
      h('div', { class: 'dl-top__spec' }, spec))),
    h('section', { class: 'section', 'aria-labelledby': 'files-h' }, h('div', { class: 'wrap' }, label('Files'), h('h2', { class: 'sec-title pl-sr', id: 'files-h' }, 'Files'), table,
      h('p', { class: 'field__hint dl-files__note' }, 'Checksums are published in the signed release manifest as base64; shown here in hex, the format ', h('code', null, 'sha512sum'), ' and ', h('code', null, 'Get-FileHash'), ' print.'))),
    h('section', { class: 'section', 'aria-labelledby': 'install-h' }, h('div', { class: 'wrap grid' },
      h('div', { class: 'dl-side' }, label('Install'), h('h2', { class: 'sec-title', id: 'install-h' }, 'Install')),
      h('div', { class: 'dl-main' }, installHost, ownerNotes))),
    h('section', { class: 'section', 'aria-labelledby': 'verify-h' }, h('div', { class: 'wrap grid' },
      h('div', { class: 'dl-side' }, label('Verify'), h('h2', { class: 'sec-title', id: 'verify-h' }, 'Verify')),
      h('div', { class: 'dl-main' }, verifyHost))),
    h('section', { class: 'section', 'aria-labelledby': 'notes-h' }, h('div', { class: 'wrap grid' },
      h('div', { class: 'dl-side' }, label('Release notes'), h('h2', { class: 'sec-title', id: 'notes-h' }, `What’s in ${stable.version}`)),
      h('div', { class: 'dl-main' }, notesEl,
        older.length ? h('div', { class: 'dl-older' }, h('p', { class: 'pl-label' }, 'Earlier releases'),
          h('ul', null, older.map((r) => h('li', null, h('span', { class: 'pl-mono' }, r.version), h('span', { class: `tag${r.channel === 'beta' ? ' tag--warn' : ''}` }, r.channel), h('time', { class: 'meta', datetime: r.publishedAt }, fmt.date(r.publishedAt))))),
          h('a', { class: 'arrow-link', href: 'changelog.html' }, 'Full changelog')) : null),
      beta ? h('div', { class: 'dl-main dl-main--beta' }, betaBlock(beta)) : null)));
}
