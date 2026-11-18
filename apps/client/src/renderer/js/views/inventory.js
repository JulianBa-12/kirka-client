import { h, icon, button, clear, tabs, empty, fmt, select } from '../lib/dom.js';
import { api, store, updateSettings, toast, fail, confirmDialog, promptDialog } from '../lib/store.js';
import { go } from '../app.js';

const KINDS = [
  { id: 'all', label: 'All' }, { id: 'skin', label: 'Skins' }, { id: 'background', label: 'Backgrounds' }, { id: 'resource', label: 'Resources' },
  { id: 'crosshair', label: 'Crosshairs' }, { id: 'hud', label: 'HUD layouts' }, { id: 'theme', label: 'Themes' },
];

export async function render(root, params = {}) {
  let kind = KINDS.some((k) => k.id === params.kind) ? params.kind : 'all';
  let q = ''; let sort = 'new'; let favOnly = false;
  const list = h('div');
  const bar = h('div');
  const search = h('input.input', { placeholder: 'Search your items', type: 'search' });
  search.addEventListener('input', () => { q = search.value.toLowerCase(); draw(); });

  async function draw() {
    const all = await api('library:list');
    const counts = Object.fromEntries(KINDS.map((k) => [k.id, k.id === 'all' ? all.length : all.filter((i) => i.kind === k.id).length]));
    clear(bar).appendChild(tabs(KINDS.map((k) => ({ ...k, badge: counts[k.id] ? String(counts[k.id]) : null })), kind, (id) => { kind = id; draw(); }));
    let items = all.filter((i) => (kind === 'all' || i.kind === kind) && (!q || i.name.toLowerCase().includes(q) || (i.tags || []).some((t) => t.toLowerCase().includes(q))) && (!favOnly || i.favorite));
    items.sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'size' ? b.size - a.size : b.createdAt.localeCompare(a.createdAt)));
    clear(list);
    if (!items.length) { list.appendChild(empty(all.length ? 'Nothing matches' : 'Your inventory is empty', all.length ? 'Try another filter.' : 'Items you create in the studios, import from files or install from the marketplace appear here.', h('div.inline', button('Open Skin Studio', () => go('skins')), button('Browse marketplace', () => go('marketplace'))))); return; }
    list.appendChild(h('table.table.inv-table',
      h('thead', h('tr', h('th', ''), h('th', 'Name'), h('th', 'Type'), h('th', 'Source'), h('th.num', 'Size'), h('th', 'Added'), h('th', ''))),
      h('tbody', items.map((it) => h('tr',
        h('td.inv-thumb', preview(it)),
        h('td', h('div.inline', h('span', it.name), it.favorite ? icon('star', 12) : null), it.kind === 'resource' ? h('div.mono.muted.small', `→ ${it.meta.target}`) : null),
        h('td', KINDS.find((k) => k.id === it.kind).label.replace(/s$/, '')),
        h('td', h(`span.badge${it.source === 'marketplace' ? '' : '.badge-muted'}`, it.source)),
        h('td.num', fmt.bytes(it.size)),
        h('td.muted', fmt.date(it.createdAt)),
        h('td.actions',
          use(it),
          button('', async () => { await api('library:update', it.id, { favorite: !it.favorite }); draw(); }, { iconName: 'star', small: true, kind: 'quiet', title: it.favorite ? 'Unfavorite' : 'Favorite' }),
          button('', async () => { const n = await promptDialog('Rename', 'Name', it.name); if (n) { await api('library:update', it.id, { name: n }); draw(); } }, { iconName: 'edit', small: true, kind: 'quiet', title: 'Rename' }),
          button('', async () => { const f = await api('library:export', it.id); if (f) toast(`Exported to ${f}`, 'ok'); }, { iconName: 'download', small: true, kind: 'quiet', title: 'Export' }),
          button('', async () => { if (await confirmDialog('Delete item', `Delete “${it.name}” from your inventory? This removes the file from this computer.`, { danger: true, confirm: 'Delete' })) { await api('library:remove', it.id); store.settings = await api('settings:get'); draw(); } }, { iconName: 'trash', small: true, kind: 'quiet', title: 'Delete' })))))));
  }

  function use(it) {
    const s = store.settings;
    if (it.kind === 'skin') return button('Edit', () => go('skins', { open: it.id }), { small: true });
    if (it.kind === 'background') return button(s.backgrounds.currentId === it.id ? 'In use' : 'Use', () => { updateSettings((st) => { st.backgrounds.currentId = it.id; }); draw(); }, { small: true, disabled: s.backgrounds.currentId === it.id });
    if (it.kind === 'theme') return button(s.appearance.themeItemId === it.id ? 'In use' : 'Use', () => { updateSettings((st) => { st.appearance.themeItemId = it.id; }); draw(); }, { small: true, disabled: s.appearance.themeItemId === it.id });
    if (it.kind === 'crosshair') return button('Apply', () => { updateSettings((st) => { st.game.crosshair = it.meta.content.crosshair; st.game.crosshairPreset = null; }); toast('Crosshair applied', 'ok', 1800); }, { small: true });
    if (it.kind === 'hud') return button('Apply', () => { updateSettings((st) => { st.game.hudCustom = it.meta.content.elements; }); toast('HUD layout applied', 'ok', 1800); }, { small: true });
    if (it.kind === 'resource') return button(it.enabled ? 'Disable' : 'Enable', async () => { await api('library:update', it.id, { enabled: !it.enabled }); draw(); }, { small: true });
    return null;
  }

  root.append(
    h('header.page-head', h('div', h('div.pl-label.page-kicker', 'On this computer'), h('h1', 'Inventory'), h('p', 'Everything Polaris stores locally: skins, backgrounds, resource swaps, crosshairs, HUD layouts and themes.')),
      h('div.page-actions', search,
        select([{ value: 'new', label: 'Newest' }, { value: 'name', label: 'Name' }, { value: 'size', label: 'Size' }], sort, (v) => { sort = v; draw(); }),
        button('Favorites', () => { favOnly = !favOnly; draw(); }, { iconName: 'star' }),
        button('Open folder', () => api('app:openFolder', 'library'), { iconName: 'folder' }))),
    h('div.note', h('b', 'Your official Kirka.io inventory is not shown here. '), 'Kirka.io does not offer an API for third-party clients to read or change skins, items, KC or coins. Items here are local Polaris cosmetics that only change what you see on this computer.'),
    bar, list);
  await draw();
}

function preview(it) {
  if (it.mime.startsWith('image/')) return h(`img.inv-img${it.kind === 'skin' ? '.pixel' : ''}`, { src: it.url, alt: '', loading: 'lazy' });
  if (it.mime.startsWith('video/')) return h('span.inv-ico', icon('film', 16));
  if (it.mime.startsWith('audio/')) return h('span.inv-ico', icon('activity', 16));
  return h('span.inv-ico', icon({ crosshair: 'crosshair', hud: 'sliders', theme: 'palette' }[it.kind] || 'box', 16));
}
