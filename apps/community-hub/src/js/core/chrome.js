/**
 * Page chrome: theme tokens, approved CSS overrides, header/navigation, footer, announcements,
 * account link. Every page module calls `boot()` first.
 */
import { h, clear, icon, link, safeHref, $ } from './dom.js';
import { bundle, announcements, invalidate } from './data.js';
import { startRealtime } from './realtime.js';
import { status, me } from './api.js';

const HEX = /^#[0-9a-f]{6}$/i;
const COLOR_VARS = { bg: '--c-bg', surface: '--c-surface', surface2: '--c-surface2', line: '--c-line', text: '--c-text', text2: '--c-text2', text3: '--c-text3', accent: '--c-accent', accent2: '--c-accent2', accent3: '--c-accent3', paper: '--c-paper', ink: '--c-ink' };
const FONT_STACKS = {
  Satoshi: "'Satoshi', system-ui, sans-serif",
  'JetBrains Mono': "'JetBrains Mono', ui-monospace, monospace",
  'system-ui': 'system-ui, sans-serif',
  Inter: "Inter, system-ui, sans-serif",
  Arial: 'Arial, Helvetica, sans-serif',
  Georgia: 'Georgia, serif',
};

export function applyTheme(theme) {
  const root = document.documentElement.style;
  const colors = (theme && theme.colors) || {};
  for (const [k, v] of Object.entries(COLOR_VARS)) if (HEX.test(colors[k] || '')) root.setProperty(v, colors[k]);
  const t = (theme && theme.typography) || {};
  if (FONT_STACKS[t.ui]) root.setProperty('--font-ui', FONT_STACKS[t.ui]);
  if (FONT_STACKS[t.display]) root.setProperty('--font-display', FONT_STACKS[t.display]);
  if (FONT_STACKS[t.mono]) root.setProperty('--font-mono', FONT_STACKS[t.mono]);
  if (theme && theme.effects && theme.effects.animations === false) document.documentElement.dataset.motion = 'off';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && HEX.test(colors.bg || '')) meta.setAttribute('content', colors.bg);
}

/** website.css overrides are sanitized server-side; applied through CSSOM so no 'unsafe-inline' is needed. */
export function applyCss(css) {
  const text = css && typeof css.overrides === 'string' ? css.overrides : '';
  if (!text.trim()) return;
  if (/@import|url\s*\(|expression\s*\(|javascript:/i.test(text)) return; // defence in depth
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(text);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  } catch { /* unsupported browser or invalid CSS: ignore */ }
}

const pageFile = () => (location.pathname.split('/').pop() || 'index.html').replace(/^$/, 'index.html');

function renderNav(site, pageId) {
  const list = document.querySelector('[data-chrome="nav"]');
  if (!list || !Array.isArray(site.navigation)) return;
  const items = site.navigation.filter((n) => n && n.visible !== false && safeHref(n.href));
  if (!items.length) return;
  const current = `${pageId}.html`;
  clear(list, items.map((n) => {
    const a = link(n.href, n.label);
    if (String(n.href).replace(/[?#].*$/, '') === current) a.setAttribute('aria-current', 'page');
    return h('li', null, a);
  }));
}

function renderFooter(site) {
  for (const el of document.querySelectorAll('[data-chrome="site-name"]')) el.textContent = site.siteName;
  const tag = $('[data-chrome="tagline"]'); if (tag) tag.textContent = site.tagline || '';
  const cols = $('[data-chrome="footer-cols"]');
  const columns = site.footer && Array.isArray(site.footer.columns) ? site.footer.columns : [];
  if (cols && columns.length) {
    clear(cols, columns.map((c) => h('div', { class: 'site-footer__col' },
      h('h2', { class: 'pl-label' }, c.title),
      h('ul', null, (c.links || []).filter((l) => safeHref(l.href)).map((l) => h('li', null, link(l.href, l.label)))))));
  }
  const note = $('[data-chrome="footer-note"]');
  if (note) {
    const text = (site.footer && site.footer.note) || '';
    // The disclaimer is not optional: if a published note drops it, it is appended.
    const disclaimer = 'Polaris is an unofficial community project and is not affiliated with Kirka.io.';
    note.textContent = /affiliated/i.test(text) ? text : [text, disclaimer].filter(Boolean).join(' ');
  }
  const gh = $('[data-chrome="github"]');
  if (gh) { const href = safeHref(site.githubUrl); if (href) gh.setAttribute('href', href); else gh.hidden = true; }
}

function wireNavToggle() {
  const btn = $('.nav-toggle'); const nav = $('#site-nav');
  if (!btn || !nav) return;
  const set = (open) => {
    btn.setAttribute('aria-expanded', String(open)); nav.dataset.open = String(open);
    const label = btn.querySelector('.nav-toggle__label'); if (label) label.textContent = open ? 'Close' : 'Menu';
  };
  btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.dataset.open === 'true') { set(false); btn.focus(); } });
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  matchMedia('(min-width: 1181px)').addEventListener('change', (e) => { if (e.matches) set(false); });
}

async function renderAnnouncements() {
  const host = $('[data-chrome="announcements"]');
  if (!host) return;
  let dismissed = [];
  try { dismissed = JSON.parse(localStorage.getItem('polaris.hub.dismissed') || '[]'); } catch { dismissed = []; }
  const list = (await announcements()).filter((a) => !dismissed.includes(a.id)).slice(0, 3);
  clear(host, list.map((a) => {
    const close = h('button', { type: 'button', class: 'announcement__close', 'aria-label': `Dismiss announcement: ${a.title}` }, icon('close', 14));
    const el = h('div', { class: 'announcement', dataset: { level: a.level || 'info' }, role: a.level === 'critical' ? 'alert' : null },
      h('div', { class: 'wrap announcement__inner' },
        h('span', { class: 'announcement__level pl-label' }, a.level === 'critical' ? 'Critical' : a.level === 'warning' ? 'Notice' : 'Update'),
        h('p', { class: 'announcement__text' }, h('strong', null, a.title), a.body || ''),
        close));
    close.addEventListener('click', () => {
      el.remove();
      try { localStorage.setItem('polaris.hub.dismissed', JSON.stringify([...dismissed, a.id].slice(-50))); } catch { /* ignore */ }
    });
    return el;
  }));
}

function renderMaintenance(m) {
  const host = $('[data-chrome="announcements"]');
  if (!host) return;
  const old = host.querySelector('[data-maintenance]');
  if (old) old.remove();
  if (!m || !m.active) return;
  host.prepend(h('div', { class: 'announcement', dataset: { level: 'warning', maintenance: '1' }, role: 'status' },
    h('div', { class: 'wrap announcement__inner' },
      h('span', { class: 'announcement__level pl-label' }, 'Maintenance'),
      h('p', { class: 'announcement__text' }, h('strong', null, 'Community features are paused.'), m.message || 'Downloads and documentation keep working.'))));
}

async function renderAccount() {
  const a = $('[data-chrome="account"]');
  if (!a) return;
  const update = (user) => {
    a.textContent = user ? `@${user.username}` : 'Sign in';
    a.setAttribute('href', user ? 'community.html#profile' : 'community.html#account');
  };
  update(await me());
  window.addEventListener('polaris:session', (e) => update(e.detail));
}

async function renderDataStatus(b) {
  const el = $('[data-chrome="data-status"]');
  if (!el) return;
  const s = await status();
  const label = { online: 'Community backend online', maintenance: 'Backend in maintenance', offline: 'Backend offline — static mirror', unconfigured: 'Static mirror' }[s.state];
  el.textContent = b.sequence ? `${label} · config #${b.sequence}` : label;
}

/**
 * Boot the page chrome. Resolves with { bundle } once theme and navigation are applied.
 */
export async function boot(pageId) {
  wireNavToggle();
  const b = await bundle();
  applyTheme(b.theme);
  applyCss(b.css);
  renderNav(b.site, pageId);
  renderFooter(b.site);
  if (b.site.siteName && document.title) document.title = document.title.replace(/Polaris Community Hub$/, b.site.siteName);
  renderAnnouncements();
  renderAccount();
  renderDataStatus(b);
  startRealtime({
    async onConfig() {
      invalidate('bundle');
      const nb = await bundle();
      applyTheme(nb.theme); applyCss(nb.css); renderNav(nb.site, pageId); renderFooter(nb.site); renderDataStatus(nb);
      window.dispatchEvent(new CustomEvent('polaris:bundle', { detail: nb }));
    },
    onAnnouncements() { renderAnnouncements(); },
    onMaintenance(m) { renderMaintenance(m); },
    onEvent(e) { window.dispatchEvent(new CustomEvent('polaris:live', { detail: e })); },
    onStatus(st) { const el = $('[data-chrome="data-status"]'); if (el) el.dataset.live = st; },
  });
  return { bundle: b, site: b.site, community: b.community };
}

export { pageFile };
