import { boot } from '../core/chrome.js';
import { h, $ } from '../core/dom.js';
import * as fmt from '../core/format.js';
import { mountFeedback, statusTag } from '../core/feedback.js';

await boot('suggestions');

function row(it, ctx) {
  const count = h('span', { class: 'vote__n pl-mono' }, fmt.number(it.votes));
  const btn = h('button', { type: 'button', class: 'vote', 'aria-pressed': String(!!it.voted), 'aria-label': `${it.voted ? 'Remove vote' : 'Vote'} for “${it.title}” (${it.votes} votes)` },
    h('span', { class: 'vote__arrow', 'aria-hidden': 'true' }, '▲'), count);
  btn.addEventListener('click', () => ctx.vote(it, btn, count));
  return h('li', { class: 'idea' },
    btn,
    h('div', { class: 'idea__main' },
      h('h3', { class: 'idea__title' }, it.title),
      h('p', { class: 'idea__body' }, it.body),
      h('p', { class: 'meta idea__meta' }, statusTag(it.status),
        h('span', { class: 'pl-mono' }, `#${it.id}`),
        h('time', { datetime: it.createdAt, title: fmt.date(it.createdAt) }, fmt.relative(it.createdAt)),
        it.author ? h('a', { href: `community.html?u=${encodeURIComponent(it.author.username)}` }, it.author.displayName || it.author.username) : h('span', null, 'anonymous')),
      it.response ? h('div', { class: 'fb-response' }, h('p', { class: 'pl-label' }, 'Team response'), h('p', null, it.response)) : null));
}

await mountFeedback({ type: 'suggestion', listHost: $('[data-bind="list"]'), formHost: $('[data-bind="form"]'), renderItem: row, defaultSort: 'top' });
