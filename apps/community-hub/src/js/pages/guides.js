import { boot } from '../core/chrome.js';
import { $, $$, md } from '../core/dom.js';

const { site } = await boot('guides');
const page = (site.pages && site.pages.guides) || {};
if (page.title) { $('[data-bind="title"]').textContent = page.title; }
if (page.body && page.body.trim()) { const intro = $('[data-bind="intro"]'); md(intro, page.body); intro.hidden = false; }

// Highlight the section currently in view in the table of contents.
const links = new Map($$('.guides__toc a').map((a) => [a.getAttribute('href').slice(1), a]));
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    for (const a of links.values()) a.removeAttribute('aria-current');
    const a = links.get(e.target.id); if (a) a.setAttribute('aria-current', 'true');
  }
}, { rootMargin: '-30% 0px -60% 0px' });
for (const s of $$('.guide')) io.observe(s);
