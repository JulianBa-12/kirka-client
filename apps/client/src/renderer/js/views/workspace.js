/* Workspaces — personal menu order, hidden destinations, home widgets, quick access and an
 * optional linked profile. Switching a workspace changes the shell instantly. */
import { h, button, clear, row, toggle, select, empty, field, icon } from '../lib/dom.js';
import { api, store, cfg, toast, fail, confirmDialog, promptDialog, updateSettings, modal } from '../lib/store.js';
import { go, renderRail, quickAccessCommands, applyWorkspaceResult, navDestinations } from '../app.js';

export async function render(root) {
  const head = h('header.page-head', h('div', h('div.pl-label.page-kicker', 'Your layout'), h('h1', 'Workspaces'),
    h('p', 'Arrange the menu, hide what you never use, choose the home widgets and quick-access buttons, then save the result as a workspace. Automation rules can switch workspaces for you.')));
  const actions = h('div.page-actions');
  head.append(actions);
  const editor = h('div'); const list = h('div');
  root.append(head, editor, list);

  const navItems = () => navDestinations();
  const label = (d) => (store.info.destinations.find((x) => x.id === d) || { label: d }).label;

  function drawEditor() {
    const order = navItems();
    const hidden = new Set(store.settings.layout.navHidden);
    const move = (i, dir) => {
      const o = order.slice(); const j = i + dir; if (j < 0 || j >= o.length) return;
      [o[i], o[j]] = [o[j], o[i]];
      updateSettings((s) => { s.layout.navOrder = o; s.activeWorkspaceId = null; }).then(() => { renderRail(); drawEditor(); });
    };
    const navRows = order.map((d, i) => h('div.ws-row', h('span.ws-handle', icon((store.info.destinations.find((x) => x.id === d) || {}).icon || 'grid', 14)), h('span.ws-name', label(d)),
      h('span.inline', button('', () => move(i, -1), { small: true, kind: 'quiet', iconName: 'chevron-up', title: 'Up', disabled: i === 0 }), button('', () => move(i, 1), { small: true, kind: 'quiet', iconName: 'chevron-down', title: 'Down', disabled: i === order.length - 1 }),
        ['home', 'settings'].includes(d) ? h('span.small.muted.ws-fixed', 'always shown') : toggle(!hidden.has(d), (v) => updateSettings((s) => { s.layout.navHidden = v ? s.layout.navHidden.filter((x) => x !== d) : [...s.layout.navHidden, d]; s.activeWorkspaceId = null; }).then(renderRail), { label: `Show ${label(d)} in menu` }))));
    const commands = quickAccessCommands();
    const qa = store.settings.layout.quickAccess;
    const qaRow = h('div.chips', commands.map((c) => h(`button.chip${qa.includes(c.id) ? '.is-active' : ''}`, { type: 'button', on: { click: () => {
      updateSettings((s) => { s.layout.quickAccess = qa.includes(c.id) ? qa.filter((x) => x !== c.id) : [...qa, c.id].slice(0, 8); s.activeWorkspaceId = null; }).then(() => { drawEditor(); window.dispatchEvent(new Event('polaris:quickaccess')); });
    } } }, c.label)));
    clear(editor).append(h('div.split',
      h('div.section', h('div.pl-label.section-kicker', 'Current layout'), h('h2.section-title', 'Menu order'), h('div.ws-list', navRows),
        h('div.inline', button('Reset menu order', () => updateSettings((s) => { s.layout.navOrder = []; s.layout.navHidden = []; s.activeWorkspaceId = null; }).then(() => { renderRail(); drawEditor(); }), { small: true }))),
      h('div.section', h('div.pl-label.section-kicker', 'Quick access'), h('p.small.muted', 'Up to 8 shortcuts in the title bar menu (the bolt button).'), qaRow,
        h('div.rows', row('Tools group open', 'Expand the Tools group in the menu by default.', toggle(store.settings.layout.toolsOpen, (v) => updateSettings((s) => { s.layout.toolsOpen = v; }).then(renderRail), { label: 'Tools group open' })),
          row('Start on', null, select(store.info.destinations.filter((d) => !['play'].includes(d.id)).map((d) => ({ value: d.id, label: d.label })), store.settings.general.startView, (v) => updateSettings((s) => { s.general.startView = v; })))),
        h('p.small.muted', 'Home widgets are arranged on the Home page with “Customize home”.'))));
  }

  async function drawList() {
    let data; let profiles;
    try { [data, profiles] = await Promise.all([api('workspace:list'), api('profiles:list')]); } catch (e) { clear(list).append(h('div.note.note-danger', e.message)); return; }
    const profileOpts = [{ value: '', label: 'No profile' }, ...profiles.items.map((p) => ({ value: p.id, label: p.name })), ...profiles.official.map((p) => ({ value: `official:${p.id}`, label: `${p.name} (official)` }))];
    clear(actions).append(
      button('Import', async () => { try { const w = await api('workspace:import'); if (w) { toast(`Imported “${w.name}”`, 'ok'); drawList(); } } catch (e) { fail(e); } }, { iconName: 'upload' }),
      button('Save current layout', async () => {
        const name = await promptDialog('New workspace', 'Name', '', { maxlength: 40, placeholder: 'e.g. Ranked, Creating, Streaming' });
        if (!name) return;
        try { const w = await api('workspace:save', { fromCurrent: true, name }); await updateSettings((s) => { s.activeWorkspaceId = w.id; }, { immediate: true }); toast('Workspace saved', 'ok'); drawList(); } catch (e) { fail(e); }
      }, { kind: 'primary', iconName: 'plus' }));
    clear(list).append(h('div.pl-label.section-kicker', 'Saved workspaces'));
    if (!data.items.length) { list.append(empty('No workspaces yet', 'Arrange the menu above, then press “Save current layout”.')); return; }
    list.append(h('div.ws-cards', data.items.map((w) => {
      const active = data.active === w.id;
      return h(`div.ws-card${active ? '.is-active' : ''}`,
        h('div.ws-card-head', h('b', w.name), active ? h('span.badge.badge-ok', 'Active') : null),
        h('div.small.muted', `${w.nav.order.length ? `${w.nav.order.length} ordered` : 'default order'} · ${w.nav.hidden.length} hidden · ${w.quickAccess.length} quick access${w.startView ? ` · starts on ${label(w.startView)}` : ''}`),
        field('Linked profile', select(profileOpts, w.profileId || '', async (v) => { try { await api('workspace:save', { ...w, profileId: v || null }); drawList(); } catch (e) { fail(e); } })),
        h('div.inline',
          button(active ? 'Re-apply' : 'Activate', async () => { try { applyWorkspaceResult(await api('workspace:activate', w.id)); toast(`Workspace “${w.name}” active`, 'ok'); drawEditor(); drawList(); } catch (e) { fail(e); } }, { small: true, kind: active ? 'ghost' : 'primary' }),
          button('Update from current', async () => { try { await api('workspace:save', { ...w, fromCurrent: true, id: w.id, name: w.name, profileId: w.profileId }); toast('Workspace updated', 'ok'); drawList(); } catch (e) { fail(e); } }, { small: true }),
          button('', async () => { const n = await promptDialog('Rename', 'Name', w.name, { maxlength: 40 }); if (n) { await api('workspace:save', { ...w, name: n }).catch(fail); drawList(); } }, { small: true, kind: 'quiet', iconName: 'edit', title: 'Rename' }),
          button('', async () => { try { const f = await api('workspace:export', w.id); if (f) toast(`Saved to ${f}`, 'ok'); } catch (e) { fail(e); } }, { small: true, kind: 'quiet', iconName: 'download', title: 'Export' }),
          button('', async () => { try { await api('workspace:toLibrary', w.id); toast('Saved to your library — share it from Inventory', 'ok'); } catch (e) { fail(e); } }, { small: true, kind: 'quiet', iconName: 'box', title: 'Save to library' }),
          button('', async () => { if (await confirmDialog('Delete workspace', `Delete “${w.name}”?`, { danger: true, confirm: 'Delete' })) { await api('workspace:delete', w.id).catch(fail); drawList(); } }, { small: true, kind: 'quiet', iconName: 'trash', title: 'Delete' })));
    })));
  }

  drawEditor();
  await drawList();
}
