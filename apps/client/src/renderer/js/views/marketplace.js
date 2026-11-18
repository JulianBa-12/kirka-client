import { h, icon, button, clear, tabs, empty, fmt, select, field } from '../lib/dom.js';
import { api, store, toast, fail, modal, signedIn, refreshServer } from '../lib/store.js';
import { remoteImg } from '../lib/remote-img.js';
import { go } from '../app.js';
import { confirmPluginInstall } from './plugins.js';

const KINDS = [{ id: '', label: 'Everything' }, { id: 'skin', label: 'Skins' }, { id: 'background', label: 'Backgrounds' }, { id: 'resource', label: 'Resources' }, { id: 'crosshair', label: 'Crosshairs' }, { id: 'hud', label: 'HUD' }, { id: 'theme', label: 'Themes' }, { id: 'plugin', label: 'Plugins' }];

export async function render(root, params = {}) {
  let kind = KINDS.some((k) => k.id === params.kind) ? params.kind : '';
  let sort = 'popular'; let q = ''; let offset = 0; let category = ''; let featured = false;
  const head = h('header.page-head', h('div', h('div.pl-label.page-kicker', 'Community'), h('h1', 'Marketplace'), h('p', 'Free cosmetics, resources and plugins made by the community and reviewed by the Polaris team.')));
  root.append(head);
  const srv = await refreshServer();
  if (!srv.configured || srv.error) {
    root.append(empty(srv.configured ? 'The Polaris server is not reachable' : 'No Polaris server configured',
      srv.configured ? `${srv.error}. The marketplace needs a connection to the community server.` : 'The marketplace, social features and uploads are provided by a Polaris community server. Add its address in Settings → Account.',
      button('Open account settings', () => go('settings', { tab: 'account' }), { kind: 'primary' })));
    return;
  }
  const rules = (await api('server:request', 'GET', '/community/categories').catch(() => null)) || { categories: {}, rules: '' };
  const bar = h('div'); const list = h('div'); const more = h('div.inline');
  const search = h('input.input', { type: 'search', placeholder: 'Search the marketplace' });
  search.addEventListener('change', () => { q = search.value.trim(); offset = 0; load(); });
  head.appendChild(h('div.page-actions', search,
    select([{ value: 'popular', label: 'Popular' }, { value: 'new', label: 'Newest' }, { value: 'downloads', label: 'Most downloaded' }], sort, (v) => { sort = v; offset = 0; load(); }),
    button('Featured', () => { featured = !featured; offset = 0; load(); }, { iconName: 'star' }),
    button('My uploads', () => myUploads(), { iconName: 'upload' })));
  root.append(h('div.note', h('b', 'Everything here is free. '), rules.rules || 'Polaris does not sell, trade or process Kirka.io items, KC, coins or any official game currency.'), bar, list, more);

  async function load(append = false) {
    clear(bar).append(tabs(KINDS, kind, (id) => { kind = id; category = ''; offset = 0; load(); }));
    const cats = kind && rules.categories[kind];
    if (cats && cats.length) bar.append(h('div.chips', [h(`button.chip${!category ? '.is-active' : ''}`, { type: 'button', on: { click: () => { category = ''; load(); } } }, 'All'), ...cats.map((c) => h(`button.chip${category === c ? '.is-active' : ''}`, { type: 'button', on: { click: () => { category = c; offset = 0; load(); } } }, c))]));
    const qs = new URLSearchParams({ sort, limit: '36', offset: String(offset) });
    if (kind) qs.set('kind', kind); if (q) qs.set('q', q); if (category) qs.set('category', category); if (featured) qs.set('featured', '1');
    if (!append) clear(list).append(h('p.muted', 'Loading…'));
    try {
      const r = await api('server:request', 'GET', `/community/items?${qs}`);
      if (!append) clear(list);
      if (!r.items.length && !append) { list.append(empty('Nothing here yet', q ? 'No items match your search.' : 'Be the first to share something — upload from Skin Studio or your Inventory.')); clear(more); return; }
      let grid = list.querySelector('.mk-grid');
      if (!grid) { grid = h('div.mk-grid'); list.append(grid); }
      for (const it of r.items) grid.append(tile(it));
      clear(more);
      if (offset + r.items.length < r.total) more.append(button(`Load more (${r.total - offset - r.items.length} left)`, () => { offset += 36; load(true); }));
    } catch (e) { clear(list).append(h('div.note.note-danger', e.message)); }
  }

  function tile(it) {
    return h('button.mk-tile', { type: 'button', on: { click: () => detail(it.id) } },
      h(`div.mk-thumb${it.kind === 'skin' ? '.pixel' : ''}`, it.previewUrl ? remoteImg(it.previewUrl) : h('span.mk-kind', icon({ plugin: 'plug', crosshair: 'crosshair', hud: 'sliders', theme: 'palette', resource: 'cube' }[it.kind] || 'box', 22))),
      h('div.mk-meta', h('div.mk-title', it.title), h('div.mk-sub.muted.small', `${it.kind} · ${it.author ? it.author.username : 'unknown'}`),
        h('div.mk-stats.mono.small', h('span', icon('download', 12), ` ${it.downloads}`), h('span', icon('heart', 12), ` ${it.likes}`), it.official ? h('span.badge', 'Official') : null, it.featured ? h('span.badge.badge-warn', 'Featured') : null)));
  }

  async function detail(id) {
    let it;
    try { it = await api('server:request', 'GET', `/community/items/${id}`); } catch (e) { return fail(e); }
    const comments = h('div.mk-comments');
    const loadComments = async () => {
      const r = await api('server:request', 'GET', `/community/items/${id}/comments`).catch(() => ({ items: [] }));
      clear(comments).append(r.items.length ? r.items.map((c) => h('div.mk-comment', h('div.small', h('b', c.user.username), h('span.muted', ` · ${fmt.ago(c.createdAt)}`)), h('div.text2', c.body))) : h('p.muted.small', 'No comments yet.'));
    };
    loadComments();
    const commentIn = h('textarea.input', { rows: 2, maxlength: 1000, placeholder: signedIn() ? 'Write a comment' : 'Sign in to comment', disabled: !signedIn() });
    const plugin = it.kind === 'plugin' ? it.metadata || {} : null;
    const body = h('div.mk-detail',
      h(`div.mk-detail-img${it.kind === 'skin' ? '.pixel' : ''}`, it.previewUrl ? remoteImg(it.previewUrl) : icon('box', 40)),
      h('div.stack',
        h('div.inline', h('span.badge.badge-muted', it.kind), it.category ? h('span.badge.badge-muted', it.category) : null, it.official ? h('span.badge', 'Official') : null, h('span.badge.badge-ok', it.price ? it.price.label : 'Free')),
        h('p.text2', it.description || 'No description.'),
        h('div.mono.small.muted', `by ${it.author ? it.author.username : 'unknown'} · v${it.version} · ${fmt.bytes(it.size)} · ${fmt.date(it.createdAt)} · ${it.downloads} downloads`),
        it.kind === 'resource' && it.metadata && it.metadata.target ? h('div.mono.small', `Replaces ${it.metadata.target}`) : null,
        plugin ? h('div.note', h('b', `Compatibility: ${plugin.compatibility || 'untested'}. `), `Approved permissions: ${(plugin.approvedPermissions || []).join(', ') || 'none'}.`) : null,
        h('div.inline',
          button('Install', async () => install(it), { kind: 'primary', iconName: 'download', disabled: plugin && plugin.compatibility === 'incompatible' }),
          signedIn() ? button(it.liked ? 'Liked' : 'Like', async () => { try { await api('server:request', it.liked ? 'DELETE' : 'POST', `/community/items/${id}/like`); it.liked = !it.liked; toast(it.liked ? 'Liked' : 'Like removed', 'ok', 1500); } catch (e) { fail(e); } }, { iconName: 'heart', small: true }) : null,
          signedIn() ? button('Report', () => report('item', id), { iconName: 'flag', small: true, kind: 'quiet' }) : null),
        h('hr.hr'), h('div.pl-label.muted', `Comments (${it.comments || 0})`), comments,
        signedIn() ? h('div.inline', commentIn, button('Post', async () => { if (!commentIn.value.trim()) return; try { await api('server:request', 'POST', `/community/items/${id}/comments`, { body: commentIn.value.trim() }); commentIn.value = ''; loadComments(); } catch (e) { fail(e); } }, { small: true })) : null));
    modal({ title: it.title, wide: true, body });
  }

  async function install(it) {
    try {
      const r = await api('market:install', it.id);
      if (r.plugin) { await confirmPluginInstall(r.plugin); return; }
      toast(`“${it.title}” installed to your inventory`, 'ok');
      if (it.kind === 'resource') toast('Resource swaps from the marketplace start disabled — enable them under Resources.', 'info', 6000);
    } catch (e) { fail(e, 'Install failed: '); }
  }

  async function myUploads() {
    if (!signedIn()) { toast('Sign in first (Settings → Account)', 'warn'); return; }
    const r = await api('server:request', 'GET', `/community/items?author=${encodeURIComponent(store.server.user.username)}&mine=1&limit=100`).catch((e) => { fail(e); return null; });
    if (!r) return;
    modal({ title: 'My uploads', wide: true, body: r.items.length ? h('table.table', h('thead', h('tr', h('th', 'Title'), h('th', 'Kind'), h('th', 'Status'), h('th.num', 'Downloads'), h('th', ''))),
      h('tbody', r.items.map((it) => h('tr', h('td', it.title), h('td', it.kind), h('td', h(`span.badge${it.status === 'approved' ? '.badge-ok' : it.status === 'rejected' ? '.badge-danger' : '.badge-warn'}`, it.status)), h('td.num', it.downloads),
        h('td.actions', button('Delete', async () => { try { await api('server:request', 'DELETE', `/community/items/${it.id}`); toast('Deleted', 'ok'); } catch (e) { fail(e); } }, { small: true, kind: 'danger' })))))) : h('p.muted', 'You have not uploaded anything yet. Use “Upload” in Skin Studio, or the upload button in Inventory.') });
  }

  await load();
}

export function report(targetType, targetId) {
  const reason = h('select.input', ['spam', 'abuse', 'cheating', 'copyright', 'inappropriate', 'other'].map((r) => h('option', { value: r }, r[0].toUpperCase() + r.slice(1))));
  const details = h('textarea.input', { rows: 3, maxlength: 1000, placeholder: 'What happened? (optional)' });
  modal({ title: 'Report', body: h('div.form', field('Reason', reason), field('Details', details)), actions: [{ label: 'Cancel', onClick: () => {} }, { label: 'Send report', kind: 'primary', onClick: async () => {
    try { await api('server:request', 'POST', '/reports', { targetType, targetId: Number(targetId), reason: reason.value, details: details.value.trim() || undefined }); toast('Report sent to the moderators', 'ok'); } catch (e) { fail(e); return true; }
  } }] });
}
