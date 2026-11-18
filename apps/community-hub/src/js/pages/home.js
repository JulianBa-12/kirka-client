import { boot } from '../core/chrome.js';
import { h, clear, $, md, img, safeHref } from '../core/dom.js';
import { releases, news, publicFiles, GITHUB_RELEASES } from '../core/data.js';
import { status, api } from '../core/api.js';
import * as fmt from '../core/format.js';
import { backendState, emptyState, loading } from '../core/states.js';
import { skinTile } from '../core/items.js';

const { site } = await boot('index');

// ------------------------------------------------------------------ hero (owner-editable)
const hero = site.hero || {};
const setText = (sel, v) => { const el = $(sel); if (el && v != null) el.textContent = v; };
setText('[data-hero="eyebrow"]', hero.eyebrow);
setText('[data-hero="title"]', hero.title);
setText('[data-hero="body"]', hero.body);
for (const [key, cta] of [['primary', hero.primaryCta], ['secondary', hero.secondaryCta]]) {
  const a = $(`[data-hero="${key}"]`);
  if (!a) continue;
  const href = cta && safeHref(cta.href);
  if (!href) { a.hidden = true; continue; }
  a.textContent = cta.label; a.setAttribute('href', href);
  if (/^https?:/.test(href)) { a.rel = 'noopener noreferrer'; a.target = '_blank'; }
}
if (hero.imageAssetUrl) {
  const fig = $('[data-hero="figure"]');
  const im = img(hero.imageAssetUrl, 'Polaris Client screenshot', { w: 1600, hgt: 900 });
  if (im && fig) { fig.append(im); fig.hidden = false; }
}

// ------------------------------------------------------------------ current build
const manifest = await releases();
const stable = manifest.channels.stable;
const releaseBox = $('[data-bind="release"]');
const rail = $('[data-bind="rail-release"]');
if (stable) {
  const files = publicFiles(stable, site.downloads);
  const app = files.find((f) => f.platform === 'linux-appimage');
  rail.textContent = `v${stable.version} · ${fmt.date(stable.publishedAt)}`;
  clear(releaseBox,
    h('p', { class: 'pl-label', id: 'build-label' }, 'Current build'),
    h('p', { class: 'release-card__version pl-mono' }, stable.version),
    h('p', { class: 'release-card__title' }, stable.title || 'Stable release'),
    h('dl', { class: 'spec release-card__spec' },
      h('dt', { class: 'pl-label' }, 'Channel'), h('dd', null, 'stable'),
      h('dt', { class: 'pl-label' }, 'Published'), h('dd', null, h('time', { datetime: stable.publishedAt }, fmt.date(stable.publishedAt))),
      app ? [h('dt', { class: 'pl-label' }, 'AppImage'), h('dd', null, fmt.bytes(app.size))] : null,
      manifest.channels.beta ? [h('dt', { class: 'pl-label' }, 'Beta'), h('dd', null, manifest.channels.beta.version)] : null),
    h('a', { class: 'arrow-link', href: 'downloads.html' }, 'Files and checksums'));
} else {
  rail.textContent = 'First release pending';
  clear(releaseBox,
    h('p', { class: 'pl-label', id: 'build-label' }, 'Current build'),
    h('p', { class: 'release-card__version release-card__version--pending pl-mono' }, '—'),
    h('p', { class: 'release-card__title' }, 'First release pending'),
    h('p', { class: 'release-card__note' }, 'No stable build has been published yet. Releases appear here and on GitHub as soon as they are signed.'),
    h('a', { class: 'arrow-link', href: GITHUB_RELEASES, rel: 'noopener noreferrer', target: '_blank' }, 'GitHub releases'));
}

// ------------------------------------------------------------------ sections (owner-ordered)
const host = $('[data-bind="sections"]');
const sections = (site.sections || []).filter((s) => s && s.visible !== false);
let n = 0;
const label = (title) => h('p', { class: 'sec-label pl-label' }, h('span', { class: 'sec-label__num' }, fmt.pad(++n)), title);

const RENDER = {
  features(sec) {
    const list = (site.features || []);
    if (!list.length) return null;
    return h('section', { class: 'section home-features', 'aria-labelledby': `sec-${sec.id}` },
      h('div', { class: 'wrap grid' },
        h('div', { class: 'home-features__intro' },
          label('Features'),
          h('h2', { class: 'sec-title', id: `sec-${sec.id}` }, sec.title || 'Features'),
          sec.body ? h('p', { class: 'sec-intro' }, sec.body) : null,
          h('a', { class: 'arrow-link home-features__more', href: 'features.html' }, 'Everything in the client')),
        h('ol', { class: 'home-features__list' }, list.map((f, i) => h('li', null,
          h('span', { class: 'home-features__num pl-mono' }, fmt.pad(i + 1)),
          h('h3', null, f.title),
          h('p', null, f.body))))));
  },

  news(sec) {
    const el = h('section', { class: 'section home-news', 'aria-labelledby': `sec-${sec.id}` });
    const inner = h('div', { class: 'wrap' }, label('News'), h('div', { class: 'home-news__head' }, h('h2', { class: 'sec-title', id: `sec-${sec.id}` }, sec.title || 'News'), h('a', { class: 'arrow-link', href: 'news.html' }, 'All posts')));
    const body = h('div', { class: 'home-news__body' }, loading('Loading posts'));
    inner.append(body); el.append(inner);
    news({ limit: 5 }).then(({ items }) => {
      if (!items.length) { clear(body, emptyState('No posts published yet', 'Release notes, devlogs and community updates will be listed here.', null, true)); return; }
      const [lead, ...rest] = items;
      const leadEl = h('article', { class: 'home-news__lead' },
        h('p', { class: 'meta' }, h('time', { datetime: lead.publishedAt }, fmt.date(lead.publishedAt)), lead.pinned ? [h('span', { class: 'meta-sep' }, '/'), 'Pinned'] : null),
        h('h3', { class: 'home-news__lead-title' }, h('a', { href: `news.html?slug=${encodeURIComponent(lead.slug)}` }, lead.title)),
        h('p', { class: 'home-news__lead-excerpt' }, lead.excerpt || ''),
        h('a', { class: 'arrow-link', href: `news.html?slug=${encodeURIComponent(lead.slug)}`, 'aria-label': `Read: ${lead.title}` }, 'Read'));
      const index = h('ol', { class: 'home-news__index' }, rest.map((p) => h('li', null,
        h('time', { class: 'meta', datetime: p.publishedAt }, fmt.date(p.publishedAt)),
        h('a', { href: `news.html?slug=${encodeURIComponent(p.slug)}` }, p.title))));
      clear(body, leadEl, rest.length ? index : null);
    });
    return el;
  },

  skins(sec) {
    const el = h('section', { class: 'section home-skins', 'aria-labelledby': `sec-${sec.id}` });
    const body = h('div', { class: 'home-skins__body' }, loading('Loading gallery'));
    el.append(h('div', { class: 'wrap' }, label('Skin gallery'),
      h('div', { class: 'home-news__head' }, h('h2', { class: 'sec-title', id: `sec-${sec.id}` }, sec.title || 'Skins'), h('a', { class: 'arrow-link', href: 'skins.html' }, 'Open the gallery')),
      sec.body ? h('p', { class: 'sec-intro' }, sec.body) : null, body));
    (async () => {
      const s = await status();
      if (s.state !== 'online') { clear(body, backendState(s, 'The skin gallery', { compact: true })); return; }
      try {
        const r = await api('/community/items', { query: { kind: 'skin', sort: 'popular', limit: 6 } });
        if (!r.items.length) { clear(body, emptyState('No skins shared yet', 'Approved community skins will show up here.', [h('a', { class: 'btn btn--sm', href: 'skins.html' }, 'Upload the first one')], true)); return; }
        clear(body, h('ul', { class: 'contact-sheet contact-sheet--strip' }, r.items.map((it) => h('li', null, skinTile(it, { href: `skins.html?item=${it.id}` })))));
      } catch { clear(body, backendState({ state: 'offline' }, 'The skin gallery', { compact: true })); }
    })();
    return el;
  },

  discord(sec) {
    const invite = safeHref(site.discordUrl || (site.pages && site.pages.discord && site.pages.discord.inviteUrl) || '');
    return h('section', { class: 'section home-discord', 'aria-labelledby': `sec-${sec.id}` },
      h('div', { class: 'wrap grid' },
        h('div', { class: 'home-discord__label' }, label('Discord')),
        h('h2', { class: 'home-discord__title', id: `sec-${sec.id}` }, sec.title || 'Discord'),
        h('div', { class: 'home-discord__side' },
          sec.body ? h('p', null, sec.body) : null,
          invite
            ? h('a', { class: 'btn btn--primary pl-chamfer', href: invite, rel: 'noopener noreferrer', target: '_blank' }, 'Join the Discord')
            : h('p', { class: 'meta' }, 'Invite link not published yet.'),
          h('a', { class: 'arrow-link', href: 'discord.html' }, 'About the server'))));
  },

  download(sec) {
    const files = stable ? publicFiles(stable, site.downloads) : [];
    const app = files.find((f) => f.platform === 'linux-appimage');
    return h('section', { class: 'section home-download', 'aria-labelledby': `sec-${sec.id}` },
      h('div', { class: 'wrap grid' },
        h('div', { class: 'home-download__copy' }, label('Download'), h('h2', { class: 'sec-title', id: `sec-${sec.id}` }, sec.title || 'Download'), sec.body ? h('p', { class: 'sec-intro' }, sec.body) : null),
        h('div', { class: 'home-download__action' }, app
          ? [h('a', { class: 'btn btn--primary btn--lg pl-chamfer', href: 'downloads.html' }, `Polaris ${stable.version} for Linux`), h('p', { class: 'meta' }, `${fmt.bytes(app.size)} · AppImage`)]
          : [h('p', { class: 'meta' }, 'First release pending.'), h('a', { class: 'arrow-link', href: GITHUB_RELEASES, rel: 'noopener noreferrer', target: '_blank' }, 'Watch GitHub releases')])));
  },

  text(sec) {
    const body = h('div', { class: 'prose' }); md(body, sec.body);
    return h('section', { class: 'section home-text', 'aria-labelledby': `sec-${sec.id}` },
      h('div', { class: 'wrap grid' }, h('div', { class: 'home-text__head' }, label(sec.title || 'Notes'), h('h2', { class: 'sec-title', id: `sec-${sec.id}` }, sec.title || '')), h('div', { class: 'home-text__body' }, body)));
  },
};

clear(host, sections.map((s) => (RENDER[s.type] ? RENDER[s.type](s) : null)));
