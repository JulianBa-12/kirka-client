import { boot } from '../core/chrome.js';
import { h, $, clear, md, qparam, setParam, link } from '../core/dom.js';
import { errorState, loading } from '../core/states.js';
import * as fmt from '../core/format.js';

await boot('documentation');

const navHost = $('[data-bind="nav"]');
const docHost = $('[data-bind="doc"]');
const metaHost = $('[data-bind="meta"]');
const tocHost = $('[data-bind="toc"]');
const REPO = 'https://github.com/JulianBa-12/kirka-client/blob/main/docs/';

let index = [];
try {
  const r = await fetch('docs/index.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  index = (await r.json()).docs || [];
} catch (e) {
  clear(navHost);
  clear(docHost, errorState('Documentation index missing', `docs/index.json could not be loaded (${e.message}). The documents are also in the repository.`, [link('https://github.com/JulianBa-12/kirka-client/tree/main/docs', 'Open docs on GitHub →', 'btn btn--sm')]));
}

const slug = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

/** Cross-document links (FOO.md) become documentation.html?doc=foo; other relative .md links point at GitHub. */
function rewriteLinks(text) {
  const byFile = Object.fromEntries(index.map((d) => [d.file.toLowerCase(), d.id]));
  return text.replace(/\]\(([^)\s]+?\.md)(#[^)\s]*)?\)/g, (m, file, hash) => {
    const base = file.split('/').pop().toLowerCase();
    if (byFile[base]) return `](documentation.html?doc=${byFile[base]})`;
    return `](https://github.com/JulianBa-12/kirka-client/blob/main/${file.replace(/^\.\.\//, '').replace(/^\.\//, 'docs/')}${hash || ''})`;
  });
}

function paintNav(active) {
  const groups = [...new Set(index.map((d) => d.group))];
  clear(navHost, ...groups.map((g) => h('div', { class: 'docs__group' },
    h('p', { class: 'pl-label' }, g),
    h('ul', null, index.filter((d) => d.group === g).map((d) => h('li', null,
      h('a', { href: `documentation.html?doc=${d.id}`, 'aria-current': d.id === active ? 'page' : null, onclick: (e) => { e.preventDefault(); open(d.id); } }, d.title)))))));
}

async function open(id) {
  const d = index.find((x) => x.id === id) || index[0];
  if (!d) return;
  setParam('doc', d.id === index[0].id ? null : d.id);
  paintNav(d.id);
  clear(docHost, loading());
  clear(metaHost);
  try {
    const r = await fetch(`docs/${d.id}.md`, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    md(docHost, rewriteLinks(await r.text()));
  } catch (e) {
    clear(docHost, errorState('Could not load this document', e.message, [link(REPO + d.file, 'Read it on GitHub →', 'btn btn--sm')]));
    return;
  }
  document.title = `${d.title} — Documentation`;
  clear(metaHost, h('span', null, d.file), h('span', null, fmt.bytes(d.bytes)), link(REPO + d.file, 'View source on GitHub'));
  const heads = [...docHost.querySelectorAll('h3')];
  for (const el of docHost.querySelectorAll('h2, h3, h4')) el.id = slug(el.textContent);
  tocHost.hidden = heads.length < 3;
  if (heads.length >= 3) clear(tocHost, h('p', { class: 'pl-label' }, 'On this page'), h('ol', null, heads.map((el) => h('li', null, h('a', { href: `#${el.id}` }, el.textContent)))));
  window.scrollTo({ top: 0 });
}

if (index.length) await open(qparam('doc') || index[0].id);
