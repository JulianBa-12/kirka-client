import { h, button, clear, empty, range, row, toggle, field } from '../lib/dom.js';
import { api, store, toast, fail, confirmDialog, promptDialog, updateSettings } from '../lib/store.js';

export async function render(root) {
  const body = h('div');
  root.append(h('header.page-head', h('div', h('div.pl-label.page-kicker', 'Visual only'), h('h1', 'Maps'), h('p', 'Per-map notes and visual filter presets. Filters adjust brightness, contrast and saturation of the whole game view.'))),
    h('div.note', 'Polaris never changes map geometry, collision, hitboxes, spawn points, lighting data or anything else that affects competitive play. Filters are a colour adjustment applied on top of the rendered picture, like a monitor setting.'),
    body);

  async function draw() {
    const m = await api('maps:get');
    const vf = store.settings.game.visualFilter;
    clear(body);
    const set = (k, v) => updateSettings((s) => { s.game.visualFilter[k] = v; });
    const fmtPct = (v) => `${Math.round(v * 100)}%`;
    body.append(h('section.section', h('div.section-head', h('h2', 'Visual filter'), h('span.muted.small', 'applies live while the game is open')),
      h('div.rows',
        row('Enabled', null, toggle(vf.enabled, (v) => set('enabled', v))),
        row('Brightness', null, range(vf.brightness, { min: 0.5, max: 1.6, step: 0.02, format: fmtPct, onInput: (v) => set('brightness', v) })),
        row('Contrast', null, range(vf.contrast, { min: 0.5, max: 1.6, step: 0.02, format: fmtPct, onInput: (v) => set('contrast', v) })),
        row('Saturation', null, range(vf.saturation, { min: 0, max: 2, step: 0.02, format: fmtPct, onInput: (v) => set('saturation', v) }))),
      h('div.inline', button('Save as preset', async () => {
        const name = await promptDialog('Save filter preset', 'Name', '', { maxlength: 40 }); if (!name) return;
        const map = await promptDialog('Map (optional)', 'Map this preset is for', '', { maxlength: 40 });
        await api('maps:savePreset', { name, map: map || '', filter: vf }); draw();
      }, { small: true, iconName: 'plus' }), button('Reset', () => { updateSettings((s) => { s.game.visualFilter = { enabled: false, brightness: 1, contrast: 1, saturation: 1 }; }); setTimeout(draw, 50); }, { small: true, kind: 'quiet' }))));

    body.append(h('section.section', h('div.section-head', h('h2', 'Presets')),
      m.presets.length ? h('div.rows', m.presets.map((p) => h('div.row', h('div.row-text', h('div.row-title', p.name, p.map ? h('span.badge.badge-muted', p.map) : null),
        h('div.row-desc.mono', `brightness ${Math.round(p.filter.brightness * 100)}% · contrast ${Math.round(p.filter.contrast * 100)}% · saturation ${Math.round(p.filter.saturation * 100)}%`)),
        h('div.row-control.inline', button('Apply', () => { updateSettings((s) => { s.game.visualFilter = { ...p.filter, enabled: true }; }); toast(`“${p.name}” applied`, 'ok', 1500); setTimeout(draw, 50); }, { small: true, kind: 'primary' }),
          button('', async () => { if (await confirmDialog('Delete preset', `Delete “${p.name}”?`, { danger: true, confirm: 'Delete' })) { await api('maps:deletePreset', p.id); draw(); } }, { small: true, kind: 'quiet', iconName: 'trash', title: 'Delete' })))))
        : h('p.muted.small', 'No presets yet. Adjust the filter and save it, for example a brighter preset for a dark map.')));

    const mapIn = h('input.input', { placeholder: 'Map name', maxlength: 40 });
    const noteIn = h('textarea.input', { rows: 3, maxlength: 2000, placeholder: 'Callouts, spawn notes, strategies…' });
    const names = Object.keys(m.notes).sort();
    body.append(h('section.section', h('div.section-head', h('h2', 'Map notes'), h('span.muted.small', 'private, stored on this computer')),
      h('div.form', field('Map', mapIn), field('Note', noteIn), h('div.inline', button('Save note', async () => { if (!mapIn.value.trim()) { toast('Enter a map name', 'warn'); return; } await api('maps:note', mapIn.value.trim(), noteIn.value.trim()); draw(); }, { small: true, kind: 'primary' }))),
      names.length ? h('div.rows', names.map((n) => h('div.row', h('div.row-text', h('div.row-title', n), h('div.row-desc.prewrap', m.notes[n])),
        h('div.row-control.inline', button('', () => { mapIn.value = n; noteIn.value = m.notes[n]; noteIn.focus(); }, { small: true, kind: 'quiet', iconName: 'edit', title: 'Edit' }),
          button('', async () => { await api('maps:note', n, ''); draw(); }, { small: true, kind: 'quiet', iconName: 'trash', title: 'Delete' }))))) : empty('No notes yet', null)));
  }
  await draw();
}
