import { boot } from '../core/chrome.js';
import { h, clear, $ } from '../core/dom.js';
import { releases } from '../core/data.js';
import * as fmt from '../core/format.js';
import { mountFeedback, statusTag } from '../core/feedback.js';

await boot('bugs');
const stable = (await releases()).channels.stable;
clear($('[data-bind="latest"]'), stable ? h('a', { href: 'downloads.html', class: 'pl-mono' }, stable.version) : 'pending');

const row = (it) => h('li', { class: 'bug' },
  h('details', null,
    h('summary', { class: 'bug__sum' },
      h('span', { class: 'bug__id pl-mono' }, `#${it.id}`),
      h('span', { class: 'bug__title' }, it.title),
      h('span', { class: 'bug__meta meta' },
        h('time', { datetime: it.createdAt, title: fmt.date(it.createdAt) }, fmt.relative(it.createdAt)),
        it.version ? h('span', { class: 'pl-mono' }, `v${it.version}`) : null,
        it.os ? h('span', null, it.os) : null),
      h('span', { class: 'bug__status' }, statusTag(it.status))),
    h('div', { class: 'bug__body' },
      h('p', { class: 'bug__text' }, it.body),
      h('p', { class: 'meta' }, it.author ? ['Reported by ', h('a', { href: `community.html?u=${encodeURIComponent(it.author.username)}` }, it.author.displayName || it.author.username)] : 'Reported anonymously'),
      it.response ? h('div', { class: 'fb-response' }, h('p', { class: 'pl-label' }, 'Team response'), h('p', null, it.response)) : null)));

await mountFeedback({ type: 'bug', listHost: $('[data-bind="list"]'), formHost: $('[data-bind="form"]'), renderItem: row, defaultSort: 'new', latestVersion: stable && stable.version });
