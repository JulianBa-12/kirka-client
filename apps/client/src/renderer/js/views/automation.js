/* Profile Automation — local "when … then …" rules. Rules only change Polaris settings
 * (profiles, performance presets, workspaces) or show a notice. They never send input to the
 * game, never press keys and never act on the match itself. */
import { h, button, clear, toggle, select, empty, field, fmt } from '../lib/dom.js';
import { api, cfg, toast, fail, confirmDialog, modal } from '../lib/store.js';

const TRIGGER_LABEL = { startup: 'Polaris starts', gameStart: 'The game has loaded', matchStart: 'A match starts', matchEnd: 'A match ends', battery: 'Running on battery', ac: 'Connected to power', smallDisplay: 'Display narrower than 1600 px', largeDisplay: 'Display 1600 px or wider', schedule: 'Every day at' };
const ACTION_LABEL = { profile: 'Apply profile', performance: 'Apply performance preset', workspace: 'Activate workspace', notify: 'Show a notice' };

export async function render(root) {
  const head = h('header.page-head', h('div', h('div.pl-label.page-kicker', 'Local rules'), h('h1', 'Automation'),
    h('p', 'Switch profiles, performance presets or workspaces automatically. Rules run only inside Polaris and only change Polaris settings — they never control the game or send any input.')));
  const actions = h('div.page-actions');
  head.append(actions);
  const body = h('div.stack');
  root.append(head, body);
  let data; let profiles; let workspaces;

  const valueOptions = (type) => {
    if (type === 'profile') return [...profiles.items.map((p) => ({ value: p.id, label: p.name })), ...profiles.official.map((p) => ({ value: `official:${p.id}`, label: `${p.name} (official)` }))];
    if (type === 'performance') return cfg('client.performance').profiles.map((p) => ({ value: p.id, label: p.name }));
    if (type === 'workspace') return workspaces.items.map((w) => ({ value: w.id, label: w.name }));
    return null;
  };
  const describe = (r) => {
    const opts = valueOptions(r.action.type);
    const v = opts ? (opts.find((o) => o.value === r.action.value) || { label: `${r.action.value} (missing)` }).label : `“${r.action.value}”`;
    return `${TRIGGER_LABEL[r.trigger]}${r.trigger === 'schedule' ? ` ${r.time}` : ''} → ${ACTION_LABEL[r.action.type]}: ${v}`;
  };

  function editRule(rule) {
    const r = rule ? JSON.parse(JSON.stringify(rule)) : { name: '', enabled: true, trigger: 'startup', time: '18:00', action: { type: 'performance', value: '' } };
    const form = h('div.form');
    const drawForm = () => {
      const opts = valueOptions(r.action.type);
      if (opts && !opts.some((o) => o.value === r.action.value)) r.action.value = opts[0] ? opts[0].value : '';
      const name = h('input.input', { value: r.name, maxlength: 60, placeholder: 'e.g. Laptop on battery' }); name.addEventListener('input', () => { r.name = name.value; });
      const time = h('input.input', { type: 'time', value: r.time || '18:00' }); time.addEventListener('change', () => { r.time = time.value; });
      const text = h('input.input', { value: opts ? '' : r.action.value, maxlength: 200, placeholder: 'Notice text' }); text.addEventListener('input', () => { r.action.value = text.value; });
      clear(form).append(field('Name', name),
        field('When', select(Object.entries(TRIGGER_LABEL).map(([value, label]) => ({ value, label })), r.trigger, (v) => { r.trigger = v; drawForm(); })),
        r.trigger === 'schedule' ? field('Time', time) : null,
        field('Then', select(Object.entries(ACTION_LABEL).map(([value, label]) => ({ value, label })), r.action.type, (v) => { r.action.type = v; r.action.value = ''; drawForm(); })),
        opts ? (opts.length ? field('Target', select(opts, r.action.value, (v) => { r.action.value = v; })) : h('div.note.note-warn', r.action.type === 'workspace' ? 'Create a workspace first.' : 'Create a profile first.')) : field('Text', text));
    };
    drawForm();
    modal({ title: rule ? 'Edit rule' : 'New rule', body: form, actions: [{ label: 'Cancel', onClick: () => {} }, { label: 'Save', kind: 'primary', onClick: async () => {
      if (!r.action.value) { toast('Choose a target', 'warn'); return true; }
      try { await api('automation:save', r); toast('Rule saved', 'ok'); draw(); } catch (e) { fail(e); return true; }
    } }] });
  }

  async function draw() {
    try { [data, profiles, workspaces] = await Promise.all([api('automation:get'), api('profiles:list'), api('workspace:list')]); } catch (e) { clear(body).append(h('div.note.note-danger', e.message)); return; }
    clear(actions).append(button('New rule', () => editRule(null), { kind: 'primary', iconName: 'plus' }));
    clear(body);
    if (!data.rules.length) body.append(empty('No rules yet', 'Example: when Polaris runs on battery, apply the “Performance” preset; when connected to power, switch back.', button('New rule', () => editRule(null), { kind: 'primary' })));
    else body.append(h('div.rows', data.rules.map((r) => h('div.row',
      h('div.row-text', h('div.row-title', r.name), h('div.row-desc', describe(r))),
      h('div.row-control.inline',
        button('Test', async () => { try { const d = await api('automation:test', r.id); toast(`Ran “${r.name}”: ${d}`, 'ok'); draw(); } catch (e) { fail(e); } }, { small: true }),
        button('', () => editRule(r), { small: true, kind: 'quiet', iconName: 'edit', title: 'Edit' }),
        button('', async () => { if (await confirmDialog('Delete rule', `Delete “${r.name}”?`, { danger: true, confirm: 'Delete' })) { await api('automation:delete', r.id).catch(fail); draw(); } }, { small: true, kind: 'quiet', iconName: 'trash', title: 'Delete' }),
        toggle(r.enabled, async (v) => { try { await api('automation:save', { ...r, enabled: v }); } catch (e) { fail(e); } }, { label: `Enable ${r.name}` }))))));
    body.append(h('div.section', h('div.section-head', h('div', h('div.pl-label.section-kicker', 'Run log')), data.log.length ? h('div.section-aside', button('Clear', async () => { await api('automation:clearLog'); draw(); }, { small: true, kind: 'quiet' })) : null),
      data.log.length ? h('table.table', h('tbody', data.log.map((l) => h('tr', h('td.mono', fmt.datetime(l.at)), h('td', l.name), h('td.muted', TRIGGER_LABEL[l.trigger] || l.trigger), h('td', l.ok ? h('span.badge.badge-ok', 'OK') : h('span.badge.badge-danger', 'Failed')), h('td.small.muted', l.detail))))) : h('p.muted.small', 'Rules that ran are listed here.')));
  }
  await draw();
}
