import { h, icon, button, clear, empty, fmt, row, toggle } from '../lib/dom.js';
import { api, store, toast, fail, confirmDialog, promptDialog, updateSettings, modal, signedIn } from '../lib/store.js';
import { go } from '../app.js';

export async function render(root) {
  const body = h('div');
  root.append(h('header.page-head', h('div', h('div.pl-label.page-kicker', 'Weapon & resource studio'), h('h1', 'Resources'), h('p', 'Replace the images and sounds Kirka.io loads — weapon textures, hit sounds, UI icons — with your own files. Only what you see and hear changes, on this computer.')),
    h('div.page-actions', button('Add swap', () => add(), { kind: 'primary', iconName: 'plus' }), button('Marketplace', () => go('marketplace', { kind: 'resource' }), { iconName: 'store' }))),
  h('div.note', 'Only image and sound files can be swapped. 3D models, maps, collision, hitboxes, scripts and game data are never replaced, so swaps cannot change gameplay. Changes apply when the game reloads the file — usually after reloading the game (F5).'),
  body);

  async function add(target = '') {
    const t = await promptDialog('Swap a game file', 'File in the game to replace (path or file name)', target, { placeholder: '/assets/img/ak47.webp or hit.mp3', maxlength: 200 });
    if (!t) return;
    try { const it = await api('library:importResource', t); if (it) { toast(`Swap for ${it.meta.target} added`, 'ok'); draw(); } }
    catch (e) { fail(e); }
  }

  async function draw() {
    const items = await api('library:list', 'resource');
    clear(body);
    body.append(h('div.rows', row('Resource swapper', 'Master switch for all swaps below.', toggle(store.settings.game.resourceSwapper, (v) => updateSettings((s) => { s.game.resourceSwapper = v; })))));
    if (!items.length) body.append(empty('No swaps yet', 'Add a swap, or open the list of files the game has loaded this session to pick a target.'));
    else body.append(h('table.table', h('thead', h('tr', h('th', ''), h('th', 'Name'), h('th', 'Replaces'), h('th', 'Source'), h('th.num', 'Size'), h('th', 'On'), h('th', ''))),
      h('tbody', items.map((it) => h('tr',
        h('td.inv-thumb', it.mime.startsWith('image/') ? h('img.inv-img', { src: it.url, alt: '' }) : preview(it)),
        h('td', it.name), h('td.mono.small', it.meta.target), h('td', h('span.badge.badge-muted', it.source)), h('td.num', fmt.bytes(it.size)),
        h('td', toggle(it.enabled, async (v) => { await api('library:update', it.id, { enabled: v }); })),
        h('td.actions',
          button('', async () => { const t = await promptDialog('Change target', 'File in the game to replace', it.meta.target, { maxlength: 200 }); if (t) { try { await api('library:update', it.id, { target: t }); draw(); } catch (e) { fail(e); } } }, { small: true, kind: 'quiet', iconName: 'edit', title: 'Change target' }),
          signedIn() ? button('', async () => { const title = await promptDialog('Share on the marketplace', 'Title', it.name, { maxlength: 80 }); if (!title) return; try { await api('server:uploadLibraryItem', it.id, { title, description: `Replaces ${it.meta.target}` }); toast('Uploaded — it appears after moderation', 'ok'); } catch (e) { fail(e); } }, { small: true, kind: 'quiet', iconName: 'upload', title: 'Share' }) : null,
          button('', async () => { if (await confirmDialog('Remove swap', `Remove “${it.name}”?`, { danger: true, confirm: 'Remove' })) { await api('library:remove', it.id); draw(); } }, { small: true, kind: 'quiet', iconName: 'trash', title: 'Remove' })))))));
    const recent = await api('game:recentResources').catch(() => []);
    body.append(h('section.section', h('div.section-head', h('h2', 'Files loaded by the game'), h('span.muted.small', store.game.started ? `${recent.length} images and sounds this session` : 'start the game to fill this list')),
      recent.length ? h('div.res-recent', recent.slice(0, 150).map((r) => h('div.res-row', h('span.mono.small.ellipsis.grow', r.path), h('span.muted.small', r.type),
        button('Swap', () => add(r.path), { small: true })))) : h('p.muted.small', 'Nothing yet.')));
  }
  function preview(it) {
    const a = h('audio', { src: it.url, preload: 'none' });
    return h('button.btn.btn-quiet.btn-sm', { type: 'button', title: 'Play', on: { click: () => { a.currentTime = 0; a.play().catch(() => {}); } } }, icon('play', 14), a);
  }
  await draw();
}
