import { boot } from '../core/chrome.js';
import { h, clear, $, md } from '../core/dom.js';
import { status } from '../core/api.js';
import { releases } from '../core/data.js';
import * as fmt from '../core/format.js';

const { site } = await boot('support');
const page = (site.pages && site.pages.support) || {};
if (page.title) $('[data-bind="title"]').textContent = page.title;
md($('[data-bind="body"]'), page.body || '');

const [s, manifest] = await Promise.all([status(), releases()]);
const stable = manifest.channels.stable;
const STATE = {
  online: ['dot--ok', 'Online'], maintenance: ['dot--warn', 'Maintenance'], offline: ['dot--danger', 'Unreachable'], unconfigured: ['', 'Not configured'],
};
const [dot, label] = STATE[s.state];
clear($('[data-bind="status"]'),
  h('p', { class: 'pl-label' }, 'Service status'),
  h('dl', { class: 'spec' },
    h('dt', { class: 'pl-label' }, 'Website'), h('dd', null, h('span', { class: 'dot dot--ok' }), 'Online'),
    h('dt', { class: 'pl-label' }, 'Community backend'), h('dd', null, h('span', { class: `dot ${dot}` }), label),
    s.health ? [h('dt', { class: 'pl-label' }, 'Backend version'), h('dd', null, s.health.version || '—')] : null,
    h('dt', { class: 'pl-label' }, 'Latest client'), h('dd', null, stable ? `${stable.version} · ${fmt.date(stable.publishedAt)}` : 'pending')),
  s.state === 'maintenance' && s.message ? h('p', { class: 'field__hint' }, s.message) : null,
  s.state === 'unconfigured' ? h('p', { class: 'field__hint' }, 'This copy of the site runs from the static mirror only.') : null);
