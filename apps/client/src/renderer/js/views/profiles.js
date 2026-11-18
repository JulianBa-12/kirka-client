import { h, button, clear, empty, fmt, select } from '../lib/dom.js';
import { api, store, toast, fail, confirmDialog, promptDialog, reloadSettings } from '../lib/store.js';

const DESCRIBE = { performanceProfile: 'performance', hudPreset: 'HUD', hudCustom: 'custom HUD', crosshairPreset: 'crosshair preset', crosshair: 'crosshair', visualFilter: 'visual filter', gameCss: 'game CSS', themeItemId: 'theme', backgroundId: 'background' };

export async function render(root) {
  const body = h('div');
  root.append(h('header.page-head', h('div', h('div.pl-label.page-kicker', 'One click setups'), h('h1', 'Smart Profiles'), h('p', 'A profile stores your performance profile, HUD, crosshair, visual filter, theme and background together. Switch between them, or let Polaris switch when you plug in or unplug.')),
    h('div.page-actions',
      button('Save current setup', async () => { const name = await promptDialog('New profile', 'Name', 'My setup', { maxlength: 40 }); if (!name) return; try { await api('profiles:save', { name, fromCurrent: true }); draw(); toast('Profile saved', 'ok'); } catch (e) { fail(e); } }, { kind: 'primary', iconName: 'plus' }),
      button('Import', async () => { try { const p = await api('profiles:import'); if (p) { toast(`Imported “${p.name}”`, 'ok'); draw(); } } catch (e) { fail(e); } }, { iconName: 'upload' }))), body);

  async function apply(id, name) {
    try {
      const r = await api('profiles:apply', id); await reloadSettings();
      if (r.restartRequired && await confirmDialog('Restart required', `“${name}” changes frame-rate unlock or hardware acceleration, which apply after a restart. Restart now?`, { confirm: 'Restart' })) api('app:relaunch');
      else toast(`“${name}” applied`, 'ok', 2000);
      draw();
    } catch (e) { fail(e); }
  }
  const summary = (data) => Object.keys(data || {}).map((k) => DESCRIBE[k]).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · ') || 'empty';

  async function draw() {
    const d = await api('profiles:list');
    clear(body);
    const active = d.active;
    body.append(h('section.section', h('div.section-head', h('h2', 'Official'), h('span.muted.small', 'Maintained by the Polaris team')),
      h('div.rows', d.official.map((p) => h(`div.row${active === `official:${p.id}` ? '.is-current' : ''}`, h('div.row-text', h('div.row-title', p.name, active === `official:${p.id}` ? h('span.badge.badge-ok', 'active') : null), h('div.row-desc', p.description)),
        h('div.row-control', button(active === `official:${p.id}` ? 'Re-apply' : 'Apply', () => apply(`official:${p.id}`, p.name), { small: true })))))));
    body.append(h('section.section', h('div.section-head', h('h2', 'Yours'), h('span.muted.small.mono', String(d.items.length))),
      d.items.length ? h('div.rows', d.items.map((p) => h(`div.row${active === p.id ? '.is-current' : ''}`,
        h('div.row-text', h('div.row-title', p.name, active === p.id ? h('span.badge.badge-ok', 'active') : null), h('div.row-desc', `${summary(p.data)} · updated ${fmt.ago(p.updatedAt)}`)),
        h('div.row-control.inline',
          button(active === p.id ? 'Re-apply' : 'Apply', () => apply(p.id, p.name), { small: true, kind: 'primary' }),
          button('', async () => { if (await confirmDialog('Update profile', `Replace “${p.name}” with your current setup?`, { confirm: 'Update' })) { await api('profiles:save', { id: p.id, name: p.name, fromCurrent: true }); draw(); } }, { small: true, kind: 'quiet', iconName: 'refresh', title: 'Update from current setup' }),
          button('', async () => { const n = await promptDialog('Rename profile', 'Name', p.name, { maxlength: 40 }); if (n) { await api('profiles:save', { id: p.id, name: n }); draw(); } }, { small: true, kind: 'quiet', iconName: 'edit', title: 'Rename' }),
          button('', async () => { const f = await api('profiles:export', p.id); if (f) toast(`Saved ${f}`, 'ok'); }, { small: true, kind: 'quiet', iconName: 'download', title: 'Export' }),
          button('', async () => { if (await confirmDialog('Delete profile', `Delete “${p.name}”?`, { danger: true, confirm: 'Delete' })) { await api('profiles:delete', p.id); draw(); } }, { small: true, kind: 'quiet', iconName: 'trash', title: 'Delete' })))))
        : empty('No profiles yet', 'Set up your crosshair, HUD and performance options, then save them as a profile.')));
    const opts = [{ value: '', label: 'Do nothing' }, ...d.official.map((p) => ({ value: `official:${p.id}`, label: `${p.name} (official)` })), ...d.items.map((p) => ({ value: p.id, label: p.name }))];
    const rules = { ...d.rules };
    const save = async () => { await api('profiles:rules', { onBattery: rules.onBattery || null, onAC: rules.onAC || null }); toast('Rules saved', 'ok', 1500); };
    body.append(h('section.section', h('div.section-head', h('h2', 'Automatic switching'), h('span.muted.small', 'Uses the power state reported by your system')),
      h('div.rows',
        h('div.row', h('div.row-text', h('div.row-title', 'When running on battery')), h('div.row-control', select(opts, rules.onBattery || '', (v) => { rules.onBattery = v; save(); }))),
        h('div.row', h('div.row-text', h('div.row-title', 'When plugged in')), h('div.row-control', select(opts, rules.onAC || '', (v) => { rules.onAC = v; save(); }))))));
  }
  await draw();
}
