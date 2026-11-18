import { boot } from '../core/chrome.js';
import { h, clear, $ } from '../core/dom.js';
import * as fmt from '../core/format.js';
import { emptyState } from '../core/states.js';

const { site } = await boot('features');
const features = Array.isArray(site.features) ? site.features : [];
const slug = (s, i) => `f-${i + 1}-${String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

if (!features.length) {
  clear($('[data-bind="list"]'), emptyState('No features listed', 'The feature list has not been published.'));
} else {
  clear($('[data-bind="index"]'), h('p', { class: 'pl-label' }, `${features.length} features`),
    h('ol', null, features.map((f, i) => h('li', null, h('a', { href: `#${slug(f.title, i)}` }, h('span', { class: 'pl-mono' }, fmt.pad(i + 1)), f.title)))));
  clear($('[data-bind="list"]'), features.map((f, i) => h('div', { class: 'feat__item', id: slug(f.title, i) },
    h('dt', null, h('span', { class: 'feat__num pl-mono' }, fmt.pad(i + 1)), h('span', { class: 'feat__name' }, f.title)),
    h('dd', null, f.body))));
}
