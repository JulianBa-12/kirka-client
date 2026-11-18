/* Backup Vault — automatic and manual snapshots of all Polaris data with integrity checks. */
import { h, button, clear, row, toggle, select, empty, fmt } from '../lib/dom.js';
import { api, store, toast, fail, confirmDialog, promptDialog, modal, updateSettings } from '../lib/store.js';

const REASON = { manual: 'Manual', auto: 'Automatic', 'pre-restore': 'Before restore' };

export async function render(root) {
  const head = h('header.page-head', h('div', h('div.pl-label.page-kicker', 'Safety'), h('h1', 'Backup Vault'),
    h('p', 'Snapshots of your settings, profiles, workspaces, automation rules, journal, analytics, map notes, plugins and library index. Each snapshot carries a SHA-256 checksum; damaged snapshots are never restored.')));
  const actions = h('div.page-actions');
  head.append(actions);
  const body = h('div.stack');
  root.append(head, body);

  async function draw() {
    let data;
    try { data = await api('backups:list'); } catch (e) { clear(body).append(h('div.note.note-danger', e.message)); return; }
    clear(actions).append(
      button('Import backup', async () => { try { const r = await api('backups:import'); if (r) { toast('Backup imported and verified', 'ok'); draw(); } } catch (e) { fail(e); } }, { iconName: 'upload' }),
      button('Create backup', async () => { const label = await promptDialog('Create backup', 'Label (optional)', '', { maxlength: 60 }); if (label === null) return; try { await api('backups:create', label); toast('Backup created', 'ok'); draw(); } catch (e) { fail(e); } }, { kind: 'primary', iconName: 'archive' }));
    const s = store.settings.backups;
    clear(body).append(
      h('div.rows',
        row('Automatic daily backup', 'Polaris takes one snapshot per day while it is running.', toggle(s.auto, (v) => updateSettings((st) => { st.backups.auto = v; }), { label: 'Automatic daily backup' })),
        row('Keep automatic backups', 'Older automatic snapshots are deleted. Manual backups are never deleted automatically.', select([5, 10, 20, 50, 100].map((n) => ({ value: String(n), label: `${n} snapshots` })), String(s.keep), (v) => updateSettings((st) => { st.backups.keep = Number(v); })))),
      h('div.note', h('b', 'What is not included: '), 'image, video and sound files of your library (only their index), recordings, and your Polaris server password or session. Keep a copy of the library folder if you need the files themselves.'));
    if (!data.items.length) { body.append(empty('No backups yet', 'Create the first one now, or wait for the automatic daily backup.')); return; }
    body.append(h('table.table',
      h('thead', h('tr', h('th', 'Created'), h('th', 'Type'), h('th', 'Label'), h('th', 'Contents'), h('th', 'Integrity'), h('th.num', 'Size'), h('th', ''))),
      h('tbody', data.items.map((b) => h('tr',
        h('td.mono', b.createdAt ? fmt.datetime(b.createdAt) : '—'),
        h('td', REASON[b.reason] || b.reason || '—'),
        h('td', b.label || h('span.muted', '—')),
        h('td.small.muted', b.counts ? `${b.counts.profiles || 0} profiles · ${b.counts.workspaces || 0} workspaces · ${b.counts.sessions || 0} sessions · ${b.counts.libraryItems || 0} library items` : ''),
        h('td', b.intact ? h('span.badge.badge-ok', 'Intact') : h('span.badge.badge-danger', { title: b.error || 'Checksum mismatch' }, 'Damaged')),
        h('td.num.mono', fmt.bytes(b.size)),
        h('td.actions',
          button('Restore', () => restoreDialog(b, data.sections), { small: true, disabled: !b.intact }),
          button('', async () => { try { const f = await api('backups:export', b.id); if (f) toast(`Saved to ${f}`, 'ok'); } catch (e) { fail(e); } }, { small: true, iconName: 'download', title: 'Export', kind: 'quiet' }),
          button('', async () => { if (await confirmDialog('Delete backup', `Delete the backup from ${fmt.datetime(b.createdAt)}?`, { danger: true, confirm: 'Delete' })) { await api('backups:delete', b.id).catch(fail); draw(); } }, { small: true, iconName: 'trash', title: 'Delete', kind: 'quiet' })))))));
  }

  function restoreDialog(b, sections) {
    const picked = new Set(b.sections);
    const list = h('div.rows', sections.filter((s) => b.sections.includes(s.id)).map((s) => row(s.label, null, toggle(true, (v) => { if (v) picked.add(s.id); else picked.delete(s.id); }, { label: s.label }))));
    modal({
      title: 'Restore backup', wide: true,
      body: h('div.stack', h('p.text2', `Backup from ${fmt.datetime(b.createdAt)} (Polaris ${b.appVersion}). A safety backup of the current state is created first, so this can be undone.`), h('div.mono.small.muted', `SHA-256 ${b.sha256}`), list),
      actions: [{ label: 'Cancel', onClick: () => {} }, { label: 'Restore selected', kind: 'primary', onClick: async () => {
        if (!picked.size) { toast('Select at least one section', 'warn'); return true; }
        try { const r = await api('backups:restore', b.id, [...picked]); toast(`Restored: ${r.restored.join(', ')}`, 'ok'); store.settings = await api('settings:get'); draw(); }
        catch (e) { fail(e); return true; }
      } }],
    });
  }

  await draw();
}
