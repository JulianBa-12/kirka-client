import { boot } from '../core/chrome.js';
import { h, clear, $, md, qparam, setParam } from '../core/dom.js';
import { changelog, releases, publicFiles, GITHUB_RELEASES } from '../core/data.js';
import * as fmt from '../core/format.js';
import { stateBlock } from '../core/states.js';

const { site } = await boot('changelog');
const [{ items }, manifest] = await Promise.all([changelog(), releases()]);
const host = $('[data-bind="timeline"]');
const summary = $('[data-bind="summary"]');
const stableVersion = manifest.channels.stable && manifest.channels.stable.version;

const counts = { all: items.length, stable: items.filter((r) => r.channel === 'stable').length, beta: items.filter((r) => r.channel === 'beta').length };
clear(summary, h('dl', { class: 'spec changelog__counts' },
  h('dt', { class: 'pl-label' }, 'Releases'), h('dd', null, fmt.number(counts.all)),
  h('dt', { class: 'pl-label' }, 'Latest stable'), h('dd', null, stableVersion || '—'),
  h('dt', { class: 'pl-label' }, 'Last update'), h('dd', null, items[0] ? fmt.date(items[0].publishedAt) : '—')));

if (!items.length) {
  clear(host, stateBlock({ label: 'Changelog', title: 'No releases published yet', body: 'The first release and its notes will appear here as soon as it is published.', actions: [h('a', { class: 'btn', href: GITHUB_RELEASES, rel: 'noopener noreferrer', target: '_blank' }, 'GitHub releases')] }));
} else {
  let channel = ['stable', 'beta'].includes(qparam('channel')) ? qparam('channel') : 'all';
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Channel' }, ['all', 'stable', 'beta'].map((c) => h('button', { type: 'button', 'aria-pressed': String(c === channel), dataset: { c } }, `${c} ${counts[c]}`)));
  const list = h('ol', { class: 'timeline' });
  const draw = () => {
    clear(list, items.filter((r) => channel === 'all' || r.channel === channel).map(entry));
  };
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    channel = b.dataset.c; setParam('channel', channel === 'all' ? null : channel);
    for (const x of seg.children) x.setAttribute('aria-pressed', String(x === b));
    draw();
  });
  clear(host, h('div', { class: 'changelog__filter' }, h('span', { class: 'pl-label' }, 'Channel'), seg), list);
  draw();
}

function entry(r) {
  const notes = h('div', { class: 'prose timeline__notes' }); md(notes, r.notes || 'No notes.');
  const files = publicFiles(r, site.downloads);
  const current = r.version === stableVersion;
  return h('li', { class: 'timeline__item', id: `v${r.version}` },
    h('div', { class: 'timeline__meta' },
      h('p', { class: 'timeline__version pl-mono' }, h('a', { href: `#v${r.version}`, 'aria-label': `Version ${r.version}` }, r.version)),
      h('p', { class: 'timeline__tags' },
        h('span', { class: `tag ${r.channel === 'stable' ? 'tag--ink' : ''}` }, r.channel),
        current ? h('span', { class: 'tag tag--ink-solid' }, 'current') : null,
        r.rollout != null && r.rollout < 100 ? h('span', { class: 'tag' }, `${r.rollout}% rollout`) : null),
      h('time', { class: 'meta', datetime: r.publishedAt }, fmt.date(r.publishedAt))),
    h('div', { class: 'timeline__body' },
      h('h2', { class: 'timeline__title' }, r.title || `Polaris ${r.version}`),
      notes,
      files.length ? h('p', { class: 'timeline__files meta' }, files.map((f, i) => [i ? h('span', { class: 'meta-sep' }, '·') : null, `${fmt.platformLabel(f.platform)} ${fmt.bytes(f.size)}`]),
        current ? [h('span', { class: 'meta-sep' }, '·'), h('a', { href: 'downloads.html' }, 'Download')] : null) : null));
}
