import { boot } from '../core/chrome.js';
import { h, clear, $, md, safeHref } from '../core/dom.js';

const { site } = await boot('discord');
const page = (site.pages && site.pages.discord) || {};
if (page.title) $('[data-bind="title"]').textContent = page.title;
md($('[data-bind="body"]'), page.body || '');
const url = safeHref(site.discordUrl || page.inviteUrl || '');
const valid = url && /^https:\/\/(discord\.gg|(www\.)?discord(app)?\.com)\//i.test(url);
clear($('[data-bind="invite"]'), valid
  ? [h('a', { class: 'btn btn--primary btn--lg pl-chamfer', href: url, rel: 'noopener noreferrer', target: '_blank' }, 'Join the Discord'), h('p', { class: 'meta discord__url pl-mono' }, url.replace(/^https:\/\//, ''))]
  : [h('p', { class: 'discord__pending' }, 'Invite link not published yet.'), h('p', { class: 'meta' }, 'The team will post it here once the server opens. Until then use the ', h('a', { href: 'support.html' }, 'support page'), ' or ', h('a', { href: 'https://github.com/JulianBa-12/kirka-client', rel: 'noopener noreferrer', target: '_blank' }, 'GitHub'), '.')]);
