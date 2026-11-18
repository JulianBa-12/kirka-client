import { boot } from '../core/chrome.js';
import { h, clear, $, md, img, qparam, copyButton } from '../core/dom.js';
import { news, newsPost } from '../core/data.js';
import * as fmt from '../core/format.js';
import { emptyState, stateBlock, loading } from '../core/states.js';

const { site } = await boot('news');
const view = $('[data-bind="view"]');
const slug = qparam('slug');
const postHref = (p) => `news.html?slug=${encodeURIComponent(p.slug)}`;
const authorName = (u) => (u ? u.displayName || u.username : 'Polaris');

if (slug) await renderArticle(slug); else await renderIndex();

async function renderIndex() {
  const PAGE = 20;
  let tag = qparam('tag') || '';
  let offset = 0;
  const all = await news({ limit: 100 });
  const tags = [...new Set(all.items.flatMap((p) => p.tags || []))].sort();

  const head = h('header', { class: 'page-head news-head' }, h('div', { class: 'wrap' },
    h('p', { class: 'page-head__label pl-label' }, 'News · devlog'),
    h('div', { class: 'grid' },
      h('div', { class: 'page-head__main' }, h('h1', { class: 'page-head__title' }, 'News'),
        h('p', { class: 'page-head__lede' }, 'Release notes, devlogs and community updates from the people building Polaris.')),
      h('div', { class: 'page-head__side news-head__count' }, h('p', { class: 'pl-mono' }, fmt.number(all.total)), h('p', { class: 'pl-label' }, all.total === 1 ? 'post published' : 'posts published')))));

  const filter = tags.length ? h('div', { class: 'seg', role: 'group', 'aria-label': 'Filter by tag' },
    ['', ...tags].map((t) => h('button', { type: 'button', 'aria-pressed': String(t === tag), dataset: { tag: t } }, t || 'All'))) : null;
  const list = h('div', { class: 'news-list' });
  const more = h('button', { type: 'button', class: 'btn', hidden: true }, 'Older posts');
  clear(view, head, h('section', { class: 'news-body' }, h('div', { class: 'wrap' },
    filter ? h('div', { class: 'toolbar' }, h('span', { class: 'pl-label news-filter__label' }, 'Tag'), filter) : null,
    list, h('div', { class: 'news-more' }, more))));

  const load = async (reset) => {
    if (reset) { offset = 0; clear(list, loading('Loading posts')); }
    const r = await news({ limit: PAGE, offset, tag });
    if (reset) clear(list);
    if (reset && !r.items.length) {
      list.append(emptyState(tag ? `No posts tagged “${tag}”` : 'No posts published yet', tag ? 'Pick another tag or show all posts.' : 'News, release notes and devlogs will be listed here as soon as the first post is published.'));
    }
    const items = r.items.slice();
    if (reset && items.length && !tag) list.append(lead(items.shift()));
    if (items.length) list.append(h('ol', { class: 'news-index', start: String(offset + 1) }, items.map(row)));
    offset += r.items.length;
    more.hidden = offset >= r.total;
  };
  more.addEventListener('click', async () => { more.disabled = true; await load(false); more.disabled = false; });
  filter && filter.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    tag = b.dataset.tag;
    for (const x of filter.children) x.setAttribute('aria-pressed', String(x === b));
    const u = new URL(location.href); if (tag) u.searchParams.set('tag', tag); else u.searchParams.delete('tag');
    history.replaceState(null, '', 'news.html' + u.search);
    load(true);
  });
  await load(true);
}

function lead(p) {
  const d = fmt.dateParts(p.publishedAt);
  return h('article', { class: 'news-lead' },
    h('div', { class: 'news-lead__date', 'aria-hidden': 'true' }, h('span', { class: 'news-lead__day' }, d.day), h('span', { class: 'pl-label' }, `${d.month} ${d.year}`)),
    h('div', { class: 'news-lead__main' },
      h('p', { class: 'meta' }, h('time', { datetime: p.publishedAt }, fmt.date(p.publishedAt)), p.pinned ? [h('span', { class: 'meta-sep' }, '/'), 'Pinned'] : null, h('span', { class: 'meta-sep' }, '/'), authorName(p.author)),
      h('h2', { class: 'news-lead__title' }, h('a', { href: postHref(p) }, p.title)),
      h('p', { class: 'news-lead__excerpt' }, p.excerpt || ''),
      h('a', { class: 'arrow-link', href: postHref(p), 'aria-label': `Read: ${p.title}` }, 'Read the post')),
    p.coverUrl ? h('figure', { class: 'news-lead__cover' }, img(p.coverUrl, '', { w: 800, hgt: 450 })) : null,
    tagList(p.tags, 'news-lead__tags'));
}

function row(p) {
  return h('li', { class: 'news-row' },
    h('time', { class: 'news-row__date meta', datetime: p.publishedAt }, fmt.date(p.publishedAt)),
    h('div', { class: 'news-row__main' },
      h('h2', { class: 'news-row__title' }, h('a', { href: postHref(p) }, p.title)),
      p.excerpt ? h('p', { class: 'news-row__excerpt' }, p.excerpt) : null),
    tagList(p.tags, 'news-row__tags'));
}

function tagList(tags, cls) {
  if (!tags || !tags.length) return h('span', { class: cls });
  return h('ul', { class: `tag-list ${cls}`, 'aria-label': 'Tags' }, tags.map((t) => h('li', null, h('a', { class: 'tag', href: `news.html?tag=${encodeURIComponent(t)}` }, t))));
}

async function renderArticle(s) {
  const p = await newsPost(s);
  if (!p) {
    clear(view, h('header', { class: 'page-head' }, h('div', { class: 'wrap' },
      h('p', { class: 'page-head__label pl-label' }, 'News'),
      h('h1', { class: 'page-head__title' }, 'Post not found'))),
    h('div', { class: 'wrap section section--flush' }, stateBlock({ label: 'News', title: 'This post does not exist or was unpublished', body: 'The link may be outdated.', actions: [h('a', { class: 'btn', href: 'news.html' }, 'All news')] })));
    return;
  }
  document.title = `${p.title} — ${site.siteName}`;
  const body = h('div', { class: 'prose article__body' }); md(body, p.body || p.excerpt || '');
  const listing = await news({ limit: 100 });
  const idx = listing.items.findIndex((x) => x.slug === p.slug);
  const newer = idx > 0 ? listing.items[idx - 1] : null;
  const older = idx >= 0 ? listing.items[idx + 1] : null;
  const url = location.href;

  clear(view,
    h('article', { class: 'article' },
      h('header', { class: 'page-head article__head' }, h('div', { class: 'wrap' },
        h('p', { class: 'page-head__label pl-label' }, h('a', { href: 'news.html', class: 'article__back' }, '← News'), h('span', null, fmt.date(p.publishedAt))),
        h('div', { class: 'grid' }, h('div', { class: 'article__titles' },
          h('h1', { class: 'page-head__title article__title' }, p.title),
          p.excerpt ? h('p', { class: 'page-head__lede' }, p.excerpt) : null)))),
      p.coverUrl ? h('figure', { class: 'wrap article__cover' }, img(p.coverUrl, '', { w: 1600, hgt: 900 })) : null,
      h('div', { class: 'wrap grid article__grid' },
        h('aside', { class: 'article__aside' }, h('dl', { class: 'spec' },
          h('dt', { class: 'pl-label' }, 'Published'), h('dd', null, h('time', { datetime: p.publishedAt }, fmt.date(p.publishedAt))),
          h('dt', { class: 'pl-label' }, 'By'), h('dd', null, authorName(p.author)),
          p.tags && p.tags.length ? [h('dt', { class: 'pl-label' }, 'Tags'), h('dd', null, tagList(p.tags, 'article__tags'))] : null),
        h('div', { class: 'article__share' }, copyButton(url, 'Copy link'))),
        body)),
    h('nav', { class: 'article-nav', 'aria-label': 'More posts' }, h('div', { class: 'wrap article-nav__inner' },
      older ? h('a', { class: 'article-nav__link', href: postHref(older) }, h('span', { class: 'pl-label' }, 'Older'), h('span', { class: 'article-nav__title' }, older.title)) : h('span'),
      newer ? h('a', { class: 'article-nav__link article-nav__link--next', href: postHref(newer) }, h('span', { class: 'pl-label' }, 'Newer'), h('span', { class: 'article-nav__title' }, newer.title)) : h('span'))));
}
