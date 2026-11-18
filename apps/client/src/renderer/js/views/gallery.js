/* Creator Gallery — the best community creations grouped by type, with ratings, favorites,
 * reports and sharing from your own library. Everything is free; nothing here is an official
 * Kirka.io item. Requires a Polaris community server. */
import { h, icon, button, clear, tabs, empty, fmt, select, field } from '../lib/dom.js';
import { api, store, toast, fail, modal, signedIn, refreshServer } from '../lib/store.js';
import { remoteImg } from '../lib/remote-img.js';
import { go } from '../app.js';
import { report } from './marketplace.js';

const KINDS = [
  { id: 'skin', label: 'Skins', icon: 'brush' }, { id: 'background', label: 'Backgrounds', icon: 'image' }, { id: 'crosshair', label: 'Crosshairs', icon: 'crosshair' },
  { id: 'hud', label: 'HUD layouts', icon: 'sliders' }, { id: 'theme', label: 'Themes', icon: 'palette' }, { id: 'workspace', label: 'Workspace layouts', icon: 'grid' }, { id: 'resource', label: 'Resources', icon: 'cube' },
];

const stars = (avg) => h('span.stars.is-static', { title: avg == null ? 'Not rated yet' : `${avg} of 5` }, [1, 2, 3, 4, 5].map((n) => h(`span.star${avg != null && n <= Math.round(avg) ? '.is-on' : ''}`, icon('star', 12))));

export async function render(root, params = {}) {
  let kind = KINDS.some((k) => k.id === params.kind) ? params.kind : 'skin';
  let sort = 'rating';
  const head = h('header.page-head', h('div', h('div.pl-label.page-kicker', 'Community'), h('h1', 'Creator Gallery'),
    h('p', 'The highest rated skins, backgrounds, crosshairs, HUD layouts, themes, workspaces and resources from the community. Rate what you use, favorite what you like, report what breaks the rules.')));
  root.append(head);
  const srv = await refreshServer();
  if (!srv.configured || srv.error) {
    root.append(empty(srv.configured ? 'The Polaris server is not reachable' : 'No Polaris server configured',
      srv.configured ? `${srv.error}.` : 'The gallery is provided by a Polaris community server. Add its address in Settings → Account.',
      button('Open account settings', () => go('settings', { tab: 'account' }), { kind: 'primary' })));
    return;
  }
  head.append(h('div.page-actions',
    select([{ value: 'rating', label: 'Top rated' }, { value: 'popular', label: 'Most favorited' }, { value: 'downloads', label: 'Most downloaded' }, { value: 'new', label: 'Newest' }], sort, (v) => { sort = v; load(); }),
    button('Share from library', () => share(), { kind: 'primary', iconName: 'upload' })));
  const bar = h('div'); const list = h('div');
  root.append(bar, list);

  async function load() {
    clear(bar).append(tabs(KINDS, kind, (id) => { kind = id; load(); }));
    clear(list).append(h('p.muted', 'Loading…'));
    try {
      const r = await api('server:request', 'GET', `/community/items?kind=${kind}&sort=${sort}&limit=36`);
      clear(list);
      if (!r.items.length) { list.append(empty('Nothing shared yet', `Be the first to share a ${kind} — use “Share from library”.`)); return; }
      list.append(h('div.mk-grid', r.items.map((it) => h('button.mk-tile', { type: 'button', on: { click: () => detail(it.id) } },
        h(`div.mk-thumb${it.kind === 'skin' ? '.pixel' : ''}`, it.previewUrl ? remoteImg(it.previewUrl) : h('span.mk-kind', icon((KINDS.find((k) => k.id === it.kind) || {}).icon || 'box', 22))),
        h('div.mk-meta', h('div.mk-title', it.title), h('div.mk-sub.muted.small', it.author ? it.author.username : 'unknown'),
          h('div.mk-stats.mono.small', stars(it.rating && it.rating.average), h('span', `${it.rating ? it.rating.count : 0}`), h('span', icon('heart', 12), ` ${it.likes}`), h('span', icon('download', 12), ` ${it.downloads}`)))))));
    } catch (e) { clear(list).append(h('div.note.note-danger', e.message)); }
  }

  async function detail(id) {
    let it;
    try { it = await api('server:request', 'GET', `/community/items/${id}`); } catch (e) { return fail(e); }
    const rateRow = h('span.stars');
    const drawRate = () => clear(rateRow).append([1, 2, 3, 4, 5].map((n) => h(`button.star${it.rating.mine && n <= it.rating.mine ? '.is-on' : ''}`, { type: 'button', 'aria-label': `Rate ${n} of 5`, disabled: !signedIn(), on: { click: async () => {
      try { it.rating = await api('server:request', 'PUT', `/community/items/${id}/rating`, { stars: n }); drawRate(); avg.textContent = `${it.rating.average ?? '—'} average from ${it.rating.count} rating(s)`; toast('Rating saved', 'ok', 1500); } catch (e) { fail(e); }
    } } }, icon('star', 16))));
    const avg = h('span.small.muted', `${it.rating.average ?? '—'} average from ${it.rating.count} rating(s)`);
    drawRate();
    modal({ title: it.title, wide: true, body: h('div.mk-detail',
      h(`div.mk-detail-img${it.kind === 'skin' ? '.pixel' : ''}`, it.previewUrl ? remoteImg(it.previewUrl) : icon('box', 40)),
      h('div.stack',
        h('div.inline', h('span.badge.badge-muted', it.kind), it.official ? h('span.badge', 'Official') : null, h('span.badge.badge-ok', 'Free')),
        h('p.text2', it.description || 'No description.'),
        h('div.mono.small.muted', `by ${it.author ? it.author.username : 'unknown'} · v${it.version} · ${fmt.bytes(it.size)} · ${fmt.date(it.createdAt)} · ${it.downloads} downloads`),
        h('div.inline', rateRow, avg), signedIn() ? null : h('p.small.muted', 'Sign in to rate, favorite or report.'),
        h('div.inline',
          button('Install', async () => { try { const r = await api('market:install', it.id); if (r.libraryItem && it.kind === 'workspace') { await api('workspace:fromLibrary', r.libraryItem.id); toast('Workspace added — activate it under Workspaces', 'ok'); } else toast(`“${it.title}” installed to your inventory`, 'ok'); } catch (e) { fail(e, 'Install failed: '); } }, { kind: 'primary', iconName: 'download' }),
          signedIn() ? button(it.liked ? 'Remove favorite' : 'Favorite', async () => { try { await api('server:request', it.liked ? 'DELETE' : 'POST', `/community/items/${id}/like`); it.liked = !it.liked; toast(it.liked ? 'Added to favorites' : 'Removed from favorites', 'ok', 1500); } catch (e) { fail(e); } }, { iconName: 'heart', small: true }) : null,
          signedIn() ? button('Report', () => report('item', id), { iconName: 'flag', small: true, kind: 'quiet' }) : null))) });
  }

  async function share() {
    if (!signedIn()) { toast('Sign in first (Settings → Account)', 'warn'); return; }
    const items = (await api('library:list', kind)).filter((i) => i.source !== 'marketplace');
    if (!items.length) { toast(`You have no ${kind} of your own in the library yet`, 'warn'); return; }
    const pickSel = select(items.map((i) => ({ value: i.id, label: i.name })), items[0].id, () => {});
    const title = h('input.input', { maxlength: 80, value: items[0].name });
    pickSel.addEventListener('change', () => { title.value = (items.find((i) => i.id === pickSel.value) || {}).name || ''; });
    const desc = h('textarea.input', { rows: 3, maxlength: 2000, placeholder: 'What is it, and how should it be used?' });
    const tags = h('input.input', { maxlength: 120, placeholder: 'Tags, comma separated' });
    modal({ title: 'Share from library', body: h('div.form', field('Item', pickSel), field('Title', title), field('Description', desc), field('Tags', tags), h('p.small.muted', 'Uploads are reviewed by the Polaris moderators before they appear. Only share your own work.')),
      actions: [{ label: 'Cancel', onClick: () => {} }, { label: 'Upload', kind: 'primary', onClick: async () => {
        try { const r = await api('server:uploadLibraryItem', pickSel.value, { title: title.value.trim(), description: desc.value.trim(), tags: tags.value }); toast(r.status === 'approved' ? 'Published' : 'Uploaded — waiting for review', 'ok'); }
        catch (e) { fail(e); return true; }
      } }] });
  }

  await load();
}
