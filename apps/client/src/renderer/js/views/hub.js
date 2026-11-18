import { h, button, clear, fmt, icon } from '../lib/dom.js';
import { api, toast, fail, modal } from '../lib/store.js';

const LINKS = [
  ['Downloads', 'downloads.html', 'Latest builds and install steps'], ['Changelog', 'changelog.html', 'Every release, in order'],
  ['Guides', 'guides.html', 'Setup, performance tuning, Skin Studio'], ['Support', 'support.html', 'Answers to common problems'],
  ['Bug reports', 'bugs.html', 'Tell us what broke'], ['Suggestions', 'suggestions.html', 'Ideas and votes'],
  ['Skin gallery', 'skins.html', 'Community skins'], ['Plugins', 'plugins.html', 'Reviewed plugins'], ['Discord', 'discord.html', 'Chat with the community'],
];

export async function render(root) {
  const body = h('div.hub');
  root.append(h('header.page-head', h('div', h('div.pl-label.page-kicker', 'Website'), h('h1', 'Community Hub'), h('p', 'News, guides, support and feedback. Links open in your browser.'))), body);
  let d;
  try { d = await api('app:hubData'); } catch (e) { d = { items: [], error: e.message, siteUrl: null }; }
  const site = d.siteUrl;
  const open = (page) => { if (!site) { toast('No website address configured (Settings → Advanced)', 'warn'); return; } api('app:openExternal', `${site.replace(/\/?$/, '/')}${page}`).catch(fail); };
  const news = h('section.section.hub-news', h('div.section-head', h('h2', 'News'), d.source ? h('span.muted.small', d.source === 'server' ? 'from the Polaris server' : 'from the website') : null));
  if (!d.items.length) news.append(h('p.muted', d.error ? `News could not be loaded (${d.error}). The client keeps working offline.` : 'No news has been published yet.'));
  else news.append(h('div.news-list', d.items.map((n) => h('article.news-item',
    h('div.news-meta.mono.small.muted', fmt.date(n.publishedAt), n.pinned ? ' · pinned' : '', (n.tags || []).length ? ` · ${n.tags.join(', ')}` : ''),
    h('button.news-title.linklike', { type: 'button', on: { click: () => { const b = h('div.md'); b.innerHTML = window.PolarisMarkdown.render(n.body || n.excerpt || ''); modal({ title: n.title, wide: true, body: b }); } } }, n.title),
    n.excerpt ? h('p.text2.small', n.excerpt) : null))));
  body.append(h('div.split.hub-split', news,
    h('section.section', h('div.section-head', h('h2', 'Pages'), site ? button('Open website', () => open(''), { small: true, iconName: 'external' }) : null),
      h('div.linklist', LINKS.map(([label, page, desc]) => h('button.linkrow', { type: 'button', on: { click: () => open(page) } }, h('span', h('b', label), h('span.muted.small', desc)), icon('external', 14)))))));
}
