import { h, button, clear, fmt, row, toggle, select } from '../lib/dom.js';
import { api, store, toast, fail, confirmDialog, subscribe, updateSettings } from '../lib/store.js';

const md = (text) => { const d = h('div.md'); d.innerHTML = window.PolarisMarkdown.render(text || ''); return d; }; // renderer escapes all HTML

export async function render(root) {
  const body = h('div');
  root.append(h('header.page-head', h('div', h('div.pl-label.page-kicker', `Polaris Client ${store.info.version}`), h('h1', 'Update Center'), h('p', 'Updates come from a signed release manifest. Every download is checked against its signed size and SHA-512 before it can be installed, and nothing is replaced without your confirmation.')),
    h('div.page-actions', button('Check now', async () => { try { st = await api('updates:check'); draw(); } catch (e) { fail(e); } }, { iconName: 'refresh' }))), body);
  let st = await api('updates:status');

  function draw() {
    clear(body);
    const a = st.available;
    const status = h('section.section.upd-status');
    if (st.belowMinimum) status.append(h('div.note.note-danger', `This version is older than the minimum supported version (${st.manifest.minimumVersion}). Please update.`));
    if (st.error) status.append(h('div.note.note-warn', `The release manifest could not be verified or loaded: ${st.error}. Polaris will not offer downloads from an unverified manifest.`));
    if (!a) status.append(h('div.upd-line', h('div', h('h2', st.error || !st.manifest ? 'Update status unknown' : 'You are up to date'), h('p.muted.small', st.lastCheck ? `Checked ${fmt.ago(st.lastCheck)}${st.manifest ? ` · manifest #${st.manifest.sequence}` : ''}` : 'Not checked yet this session.'))));
    else {
      const f = (a.files || []).find((x) => x.platform === st.platform);
      const actions = h('div.inline');
      if (a.held) actions.append(h('span.badge.badge-warn', 'staged rollout — not yet available for this installation'));
      else if (st.progress) {
        const pct = st.progress.total ? Math.round((st.progress.received / st.progress.total) * 100) : null;
        actions.append(h('div.upd-progress', h('div.upd-bar', h('i', { style: `width:${pct || 5}%` })), h('span.mono.small', `${fmt.bytes(st.progress.received)}${st.progress.total ? ` / ${fmt.bytes(st.progress.total)}` : ''}`)));
      } else if (st.downloaded && st.downloaded.version === a.version) {
        const K = {
          appimage: ['Install and restart', `Polaris ${a.version} replaces the current AppImage. The current version is kept as a backup so you can roll back. Restart now?`],
          installer: ['Run installer', `The verified installer for Polaris ${a.version} starts and Polaris closes. Your settings and library are kept. Continue?`],
          dmg: ['Open disk image', `The verified disk image for Polaris ${a.version} opens. Quit Polaris, then drag Polaris Client into Applications to replace this version.`],
          manual: ['Show file', 'This installation can’t be replaced automatically. The verified file will be shown in your file manager so you can install it yourself.'],
        }[st.installKind || 'manual'];
        actions.append(h('span.badge.badge-ok', 'downloaded and verified'), button(K[0], async () => {
          if (!await confirmDialog('Install update', K[1], { confirm: K[0] })) return;
          try { const r = await api('updates:install'); if (r && r.message) toast(r.message, 'info', 8000); } catch (e) { fail(e, 'Install failed: '); }
        }, { kind: 'primary' }));
      } else if (f) actions.append(button(`Download ${fmt.bytes(f.size)}`, async () => { try { st = await api('updates:download'); draw(); toast('Update downloaded and verified', 'ok'); } catch (e) { fail(e, 'Download rejected: '); } }, { kind: 'primary', iconName: 'download' }));
      else actions.append(h('span.muted.small', `This release has no build for your system (${st.platform}).`));
      status.append(h('div.upd-line', h('div', h('div.pl-label.muted', `Available · ${a.channel}`), h('h2', `${a.version}${a.title ? ` — ${a.title}` : ''}`), h('p.muted.small', fmt.date(a.publishedAt))), actions), md(a.notes));
    }
    body.append(status);
    body.append(h('section.section', h('div.section-head', h('h2', 'Settings')), h('div.rows',
      row('Channel', 'Beta builds arrive earlier and may contain bugs.', select([{ value: 'stable', label: 'Stable' }, { value: 'beta', label: 'Beta' }], store.settings.updates.channel, (v) => { updateSettings((s) => { s.updates.channel = v; }, { immediate: true }); setTimeout(async () => { st = await api('updates:status'); draw(); }, 300); })),
      row('Check automatically', 'Look for updates when Polaris starts.', toggle(store.settings.updates.autoCheck, (v) => updateSettings((s) => { s.updates.autoCheck = v; }))),
      row('Download automatically', 'Download and verify in the background. Installing always asks first.', toggle(store.settings.updates.autoDownload, (v) => updateSettings((s) => { s.updates.autoDownload = v; }))),
      row('Roll back', st.canRollback ? 'Restore the version that was running before the last update.' : 'Available after an in-place AppImage update.', button('Restore previous version', async () => { if (await confirmDialog('Roll back', 'Restore the previous Polaris version and restart?', { danger: true, confirm: 'Roll back' })) { try { await api('updates:rollback'); } catch (e) { fail(e); } } }, { small: true, disabled: !st.canRollback })))));
    body.append(h('section.section', h('div.section-head', h('h2', 'Release history')),
      st.history.length ? h('div.upd-history', st.history.map((r) => h('details.upd-rel', h('summary', h('b.mono', r.version), h('span', r.title || ''), h('span.muted.small', `${r.channel} · ${fmt.date(r.publishedAt)}`)), md(r.notes))))
        : h('p.muted.small', 'No release history loaded yet.')));
  }
  draw();
  const off = subscribe('updates', (s) => { st = { ...st, ...s }; draw(); });
  return off;
}
