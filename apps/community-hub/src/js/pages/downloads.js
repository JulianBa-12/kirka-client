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
  $('[data-bind="lede"]').textContent = 'No stable build of Polaris Client has been published yet. When it is, the AppImage, checksums and release notes appear here automatically.';
  clear(content, h('section', { class: 'section section--flush' }, h('div', { class: 'wrap grid' },
    h('div', { class: 'dl-pending' },
      stateBlock({ label: 'Release manifest', title: 'Nothing to download yet', body: 'Polaris only lists builds that are published through the signed release manifest. Follow the GitHub releases page to be notified of the first build.', actions: [h('a', { class: 'btn btn--primary pl-chamfer', href: GITHUB_RELEASES, ...ext }, 'GitHub releases'), h('a', { class: 'btn', href: 'news.html' }, 'Read the news')] }),
      beta ? betaBlock(beta) : null),
    h('aside', { class: 'dl-pending__side', 'aria-labelledby': 'pend-h' },
      h('h2', { class: 'pl-label', id: 'pend-h' }, 'What to expect'),
      h('dl', { class: 'spec' },
        h('dt', { class: 'pl-label' }, 'Platform'), h('dd', null, 'Linux x86-64'),
        h('dt', { class: 'pl-label' }, 'Packages'), h('dd', null, opts.showDeb ? 'AppImage · DEB' : 'AppImage'),
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

function render() {
  const files = publicFiles(stable, opts);
  const app = files.find((f) => f.platform === 'linux-appimage');
  const deb = files.find((f) => f.platform === 'linux-deb');
  $('[data-bind="title"]').textContent = `Polaris Client ${stable.version}`;
  $('[data-bind="lede"]').textContent = `${stable.title ? stable.title + '. ' : ''}Stable channel, published ${fmt.date(stable.publishedAt)}. Free, for Linux on x86-64.`;

  // ---------------------------------------------------- download block + spec
  const block = h('div', { class: 'dl-block pl-chamfer' },
    h('p', { class: 'pl-label' }, 'Recommended'),
    app ? [
      h('a', { class: 'dl-block__primary', href: app.url, onclick: () => trackClick(stable, app), ...fileLink },
        h('span', { class: 'dl-block__file' }, app.name),
        h('span', { class: 'dl-block__meta pl-mono' }, `AppImage · ${fmt.bytes(app.size)} · runs on most distributions`)),
    ] : h('p', null, 'This release has no AppImage attached.'),
    h('div', { class: 'dl-block__alt' },
      deb ? h('a', { class: 'btn btn--sm', href: deb.url, onclick: () => trackClick(stable, deb), ...fileLink }, `DEB for Debian / Ubuntu · ${fmt.bytes(deb.size)}`) : null,
      h('a', { class: 'arrow-link', href: GITHUB_RELEASES, ...ext }, 'All releases on GitHub')));

  const spec = h('dl', { class: 'spec dl-spec' },
    h('dt', { class: 'pl-label' }, 'Version'), h('dd', null, stable.version),
    h('dt', { class: 'pl-label' }, 'Channel'), h('dd', null, 'stable'),
    h('dt', { class: 'pl-label' }, 'Published'), h('dd', null, h('time', { datetime: stable.publishedAt }, fmt.date(stable.publishedAt))),
    h('dt', { class: 'pl-label' }, 'Platform'), h('dd', null, 'Linux x86-64'),
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
  const appName = app ? app.name : 'Polaris-Client.AppImage';
  const install = h('div', { class: 'dl-steps' },
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
  const notes = (opts.installNotes || '').trim();
  const autoNotes = `chmod +x ${appName}\n./${appName}`;
  const ownerNotes = notes && !/^chmod \+x \S+\.AppImage\n\.\/\S+\.AppImage$/.test(notes) && notes !== autoNotes
    ? h('div', { class: 'dl-step dl-step--wide' }, h('h3', null, 'Notes from the maintainers'), h('pre', { class: 'dl-notes' }, notes)) : null;

  // ---------------------------------------------------- verify
  const verifyName = app ? app.name : deb ? deb.name : 'Polaris-Client.AppImage';
  const verifyHex = fmt.base64ToHex((app || deb || {}).sha512 || '');
  const verify = h('div', { class: 'dl-verify' },
    h('div', { class: 'dl-verify__text' },
      h('p', null, 'Every file is listed with its SHA-512 checksum. Compare it with what your machine computes before running the file:'),
      h('p', { class: 'field__hint' }, 'The check prints ', h('code', null, `${verifyName}: OK`), ' when the file is intact. Anything else means the download is corrupted or not the published build — delete it.'),
      h('p', null, 'After installation you do not need to do this again: the client checks the Ed25519 signature of every update manifest against the key compiled into it, and refuses unsigned or tampered updates and older manifests.')),
    h('div', { class: 'dl-verify__cmd' },
      codeBlock([`sha512sum ${verifyName}`]),
      verifyHex ? codeBlock([`echo "${verifyHex}  ${verifyName}" | sha512sum -c`]) : null));

  // ---------------------------------------------------- notes + history
  const notesEl = h('div', { class: 'prose' }); md(notesEl, stable.notes || 'No release notes.');
  const older = (manifest.history || []).filter((r) => r.version !== stable.version).slice(0, 6);

  clear(content,
    h('section', { class: 'section section--flush dl-top' }, h('div', { class: 'wrap grid' },
      h('div', { class: 'dl-top__block' }, block),
      h('div', { class: 'dl-top__spec' }, spec))),
    h('section', { class: 'section', 'aria-labelledby': 'files-h' }, h('div', { class: 'wrap' }, label('Files'), h('h2', { class: 'sec-title pl-sr', id: 'files-h' }, 'Files'), table,
      h('p', { class: 'field__hint dl-files__note' }, 'Checksums are published in the signed release manifest as base64; shown here in hex, the format ', h('code', null, 'sha512sum'), ' prints.'))),
    h('section', { class: 'section', 'aria-labelledby': 'install-h' }, h('div', { class: 'wrap grid' },
      h('div', { class: 'dl-side' }, label('Install'), h('h2', { class: 'sec-title', id: 'install-h' }, 'Install')),
      h('div', { class: 'dl-main' }, install, ownerNotes))),
    h('section', { class: 'section', 'aria-labelledby': 'verify-h' }, h('div', { class: 'wrap grid' },
      h('div', { class: 'dl-side' }, label('Verify'), h('h2', { class: 'sec-title', id: 'verify-h' }, 'Verify')),
      h('div', { class: 'dl-main' }, verify))),
    h('section', { class: 'section', 'aria-labelledby': 'notes-h' }, h('div', { class: 'wrap grid' },
      h('div', { class: 'dl-side' }, label('Release notes'), h('h2', { class: 'sec-title', id: 'notes-h' }, `What’s in ${stable.version}`)),
      h('div', { class: 'dl-main' }, notesEl,
        older.length ? h('div', { class: 'dl-older' }, h('p', { class: 'pl-label' }, 'Earlier releases'),
          h('ul', null, older.map((r) => h('li', null, h('span', { class: 'pl-mono' }, r.version), h('span', { class: `tag${r.channel === 'beta' ? ' tag--warn' : ''}` }, r.channel), h('time', { class: 'meta', datetime: r.publishedAt }, fmt.date(r.publishedAt))))),
          h('a', { class: 'arrow-link', href: 'changelog.html' }, 'Full changelog')) : null),
      beta ? h('div', { class: 'dl-main dl-main--beta' }, betaBlock(beta)) : null)));
}
