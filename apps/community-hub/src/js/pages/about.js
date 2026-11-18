import { boot } from '../core/chrome.js';
import { h, clear, $, md, safeHref } from '../core/dom.js';
import { releases } from '../core/data.js';

const { site } = await boot('about');
const page = (site.pages && site.pages.about) || {};
if (page.title) $('[data-bind="title"]').textContent = page.title;
md($('[data-bind="body"]'), page.body || '');
const gh = safeHref(site.githubUrl || '');
clear($('[data-bind="github"]'), gh ? h('a', { href: gh, rel: 'noopener noreferrer', target: '_blank' }, gh.replace(/^https:\/\/(www\.)?/, '')) : '—');
const stable = (await releases()).channels.stable;
clear($('[data-bind="latest"]'), stable ? h('a', { href: 'downloads.html', class: 'pl-mono' }, stable.version) : 'First release pending');
