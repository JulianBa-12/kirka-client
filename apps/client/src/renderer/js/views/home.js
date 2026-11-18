import { h, icon, button, fmt, clear, empty } from '../lib/dom.js';
import { api, store, cfg, flag, subscribe, updateSettings, modal } from '../lib/store.js';
import { go } from '../app.js';
import * as dom from '../lib/dom.js';

function greetingWord() { const hr = new Date().getHours(); return hr < 5 ? 'Late session' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'; }

function weekStats(sessions) {
  const since = Date.now() - 7 * 86400000;
  const recent = sessions.filter((s) => Date.parse(s.start) >= since);
  const inMatch = recent.reduce((a, s) => a + (s.inMatchSec || 0), 0);
  const fps = recent.filter((s) => s.fpsAvg != null);
  const w = fps.reduce((a, s) => a + s.fpsSamples, 0);
  return { count: recent.length, inMatch, matches: recent.reduce((a, s) => a + (s.matchesEntered || 0), 0), fpsAvg: w ? fps.reduce((a, s) => a + s.fpsAvg * s.fpsSamples, 0) / w : null };
}

const WIDGETS = {
  greeting(ctx) {
    const s = store.settings;
    const name = store.server.user ? (store.server.user.displayName || store.server.user.username) : null;
    const last = ctx.analytics.sessions.slice(-1)[0];
    return h('section.home-hero',
      h('div.home-hero-text',
        h('div.pl-label.page-kicker', `${greetingWord()}${name ? `, ${name}` : ''}`),
        h('h1.home-title', cfg('client.home').greeting || 'Welcome back'),
        h('p.text2', last ? `Last session ${fmt.ago(last.end)} · ${fmt.dur(last.inMatchSec)} in matches${last.fpsAvg != null ? ` · ${Math.round(last.fpsAvg)} fps average` : ''}` : 'No sessions recorded yet. Polaris starts counting the first time you open the game.')),
      h('div.home-hero-actions',
        button(store.game.started ? 'Return to game' : 'Play Kirka.io', () => api('game:start'), { kind: 'primary', iconName: 'play' }),
        h('span.muted.mono', `${s.game.keybinds.toggleShell} toggles game and shell`)));
  },
  quickLaunch() {
    const links = [
      ['crosshair', 'Crosshair Studio', 'customization', { tab: 'crosshair' }, 'crosshairStudio'],
      ['sliders', 'HUD Editor', 'customization', { tab: 'hud' }, 'hudEditor'],
      ['brush', 'Skin Studio', 'skins', {}, 'skinStudio'],
      ['image', 'Backgrounds', 'customization', { tab: 'backgrounds' }, 'backgroundStudio'],
      ['gauge', 'Performance Center', 'performance', {}, null],
      ['film', 'Replays', 'replays', {}, 'replays'],
    ].filter((l) => !l[4] || (flag(l[4]).enabled && flag(l[4]).visible));
    return h('div.linklist', links.map(([ic, label, dest, params]) => h('button.linkrow', { type: 'button', on: { click: () => go(dest, params) } }, icon(ic, 16), h('span', label), icon('external', 12))));
  },
  sessionStats(ctx) {
    const w = weekStats(ctx.analytics.sessions);
    return h('div.readouts.readouts-2',
      readout('Sessions', w.count, '', 'last 7 days'),
      readout('In matches', fmt.dur(w.inMatch), '', 'measured time'),
      readout('Matches', w.matches, '', 'entered'),
      readout('Avg FPS', w.fpsAvg == null ? '—' : Math.round(w.fpsAvg), '', 'during matches'));
  },
  recentMatches(ctx) {
    const list = ctx.analytics.matches.slice(-5).reverse();
    if (!list.length) return h('p.text2.small', 'Kirka.io does not share match results with third-party clients. Log matches yourself in Analytics to see them here.', ' ', h('a', { href: '#', on: { click: (e) => { e.preventDefault(); go('analytics', { tab: 'matches' }); } } }, 'Open Analytics'));
    return h('table.table', h('tbody', list.map((m) => h('tr', h('td', fmt.date(m.at)), h('td', m.mode || '—'), h('td', m.map || '—'), h('td.num', m.kills == null ? '—' : `${m.kills}/${m.deaths ?? '—'}`)))));
  },
  favoriteSkins(ctx) {
    const favs = ctx.skins.filter((s) => s.favorite).slice(0, 8);
    const list = favs.length ? favs : ctx.skins.slice(0, 8);
    if (!list.length) return h('p.text2.small', 'No skins yet. ', h('a', { href: '#', on: { click: (e) => { e.preventDefault(); go('skins'); } } }, 'Open Skin Studio'));
    return h('div.skin-strip', list.map((s) => h('button.skin-thumb', { type: 'button', title: s.name, on: { click: () => go('skins', { open: s.id }) } }, h('img', { src: s.url, alt: s.name }))));
  },
  announcements() {
    const items = store.remote.announcements || [];
    if (!items.length) return h('p.muted.small', 'No announcements.');
    return h('div.ann-list', items.slice(0, 4).map((a) => h(`article.ann.ann-${a.level || 'info'}`, h('div.ann-title', a.title), h('div.ann-body.text2', a.body))));
  },
  news(ctx) {
    const box = h('div.news-list', h('p.muted.small', 'Loading news…'));
    api('app:hubData').then((r) => {
      clear(box);
      if (!r.items.length) { box.appendChild(h('p.muted.small', r.error || 'No news published yet.')); return; }
      for (const n of r.items.slice(0, 4)) {
        const url = r.siteUrl ? `${r.siteUrl}news.html#${encodeURIComponent(n.slug)}` : null;
        box.appendChild(h('article.news-item', h('div.news-meta.pl-label', fmt.date(n.publishedAt || n.createdAt), (n.tags || []).slice(0, 2).map((t) => h('span', ` · ${t}`))),
          h('h3.news-title', url ? h('a', { href: '#', on: { click: (e) => { e.preventDefault(); api('app:openExternal', url); } } }, n.title) : n.title), n.excerpt ? h('p.text2', n.excerpt) : null));
      }
    }).catch(() => { clear(box).appendChild(h('p.muted.small', 'News unavailable offline.')); });
    return box;
  },
  updates() {
    const box = h('div', h('p.muted.small', 'Checking…'));
    const show = (st) => {
      clear(box);
      box.append(h('div.inline', h('span.mono', `v${st.current}`), h('span.badge.badge-muted', st.channel)));
      if (st.available) box.append(h('p.text2', `Version ${st.available.version} is available${st.available.held ? ' (rolling out gradually)' : ''}.`), button('Open Update Center', () => go('updates'), { small: true }));
      else box.append(h('p.text2.small', st.error || !st.manifest ? 'Release information unavailable — could not verify the release manifest.' : st.lastCheck ? `Up to date · checked ${fmt.ago(st.lastCheck)}` : (st.error ? 'Release information unavailable.' : 'Not checked yet.')));
    };
    api('updates:status').then(show);
    return box;
  },
};

function readout(label, value, unit, sub) {
  return h('div.readout', h('div.pl-label.readout-label', label), h('div.readout-value', String(value), unit ? h('small', unit) : null), sub ? h('div.readout-sub', sub) : null);
}

export async function render(root) {
  const draw = async () => {
    const [analytics, skins] = await Promise.all([api('analytics:get'), api('library:list', 'skin')]);
    const ctx = { analytics, skins };
    clear(root);
    const home = cfg('client.home');
    const hidden = new Set(store.settings.home.hidden);
    const widgets = home.widgets.filter((w) => w.visible && home.available.includes(w.id) && !hidden.has(w.id)).sort((a, b) => a.order - b.order);
    const grid = h('div.home-grid');
    for (const w of widgets) {
      if (!WIDGETS[w.id]) continue;
      if (w.id === 'favoriteSkins' && !flag('skinStudio').visible) continue;
      let body;
      try { body = WIDGETS[w.id](ctx); } catch (e) { body = h('p.muted', `Widget failed: ${e.message}`); }
      if (w.id === 'greeting') { grid.appendChild(h('div.home-cell.home-full', body)); continue; }
      grid.appendChild(h(`section.home-cell${w.size === 'wide' ? '.home-wide' : ''}`, h('header.home-cell-head', h('span.pl-label', w.label)), body));
    }
    root.appendChild(grid);
    root.appendChild(h('div.home-foot', button('Customize home', customize, { small: true, kind: 'quiet', iconName: 'sliders' })));
  };
  const customize = () => {
    const home = cfg('client.home');
    const body = h('div.rows', home.widgets.filter((w) => w.visible && w.id !== 'greeting').map((w) => dom.row(w.label, null, dom.toggle(!store.settings.home.hidden.includes(w.id), (v) => {
      updateSettings((s) => { s.home.hidden = v ? s.home.hidden.filter((x) => x !== w.id) : [...new Set([...s.home.hidden, w.id])]; });
    }))));
    modal({ title: 'Home widgets', body, actions: [{ label: 'Done', kind: 'primary', onClick: () => draw() }], onClose: draw });
  };
  await draw();
  const offs = [subscribe('game', () => {}), subscribe('server', draw)];
  return () => offs.forEach((o) => o());
}
