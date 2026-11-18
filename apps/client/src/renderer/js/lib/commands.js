/* Command Center — one searchable list of every destination, action, setting, workspace and
 * profile. Opened with the palette key (default Ctrl+K, also from inside the game) and used for
 * the title-bar Quick Access menu. Commands only operate Polaris itself, never the game. */
import { h, icon, clear } from './dom.js';
import { api, store, flag, toast, fail, updateSettings, t } from './store.js';

let deps = { go: () => {}, toggleRecord: async () => {}, visible: () => true };
export function initCommands(d) { deps = { ...deps, ...d }; }

const SETTING_ENTRIES = [
  ['Language', 'general', 'sprache deutsch english'], ['Start page', 'general', 'start view startseite'], ['Confirm before quitting', 'general', 'quit close'],
  ['Theme and UI scale', 'appearance', 'scale zoom density theme motion animations'], ['Shell background', 'appearance', 'wallpaper hintergrund'],
  ['FPS unlock', 'performance', 'fps frame rate vsync unlock'], ['Hardware acceleration', 'performance', 'gpu acceleration'], ['Background throttling', 'performance', 'throttle'],
  ['Keybinds', 'game', 'hotkey shortcut keys tasten'], ['Game CSS', 'game', 'css style'],
  ['Usage statistics', 'privacy', 'telemetry crash reports datenschutz'], ['Delete my data', 'privacy', 'gdpr delete export'],
  ['Server and account', 'account', 'login sign in server konto'],
  ['Realtime connection', 'advanced', 'websocket live realtime echtzeit'], ['Logs', 'advanced', 'log files debug'], ['Command palette key', 'advanced', 'palette ctrl k shortcut'], ['Reset Polaris', 'advanced', 'reset factory'],
];

/** Builds the full command list (cheap; called each time the palette opens). */
export async function allCommands() {
  const cmds = [];
  for (const d of store.info.destinations) {
    if (!deps.visible(d.id)) continue;
    cmds.push({ id: `go:${d.id}`, group: 'Go to', label: t(d.label), icon: d.icon, keywords: `${d.id} ${d.description || ''}`, run: () => deps.go(d.id) });
  }
  const act = (id, label, ic, run, keywords = '') => cmds.push({ id: `do:${id}`, group: 'Actions', label, icon: ic, keywords, run });
  act('play', store.game.started ? 'Return to game' : 'Play Kirka.io', 'play', () => api('game:start'), 'start game spielen');
  act('fullscreen', 'Toggle fullscreen', 'external', () => api('win:fullscreen'), 'vollbild');
  if (flag('replays').enabled) act('record', 'Start or stop recording', 'record', () => deps.toggleRecord(), 'replay video aufnahme');
  act('crosshair', store.settings.game.crosshairEnabled ? 'Hide custom crosshair' : 'Show custom crosshair', 'crosshair', () => updateSettings((s) => { s.game.crosshairEnabled = !s.game.crosshairEnabled; }), 'fadenkreuz');
  act('filter', store.settings.game.visualFilter && store.settings.game.visualFilter.enabled ? 'Turn visual filter off' : 'Turn visual filter on', 'eye', () => updateSettings((s) => { s.game.visualFilter.enabled = !s.game.visualFilter.enabled; }), 'brightness contrast saturation');
  act('language', store.settings.general.language === 'de' ? 'Switch to English' : 'Auf Deutsch umstellen', 'globe', () => updateSettings((s) => { s.general.language = s.general.language === 'de' ? 'en' : 'de'; }), 'language sprache');
  act('updates', 'Check for updates', 'download', async () => { try { const r = await api('updates:check'); toast(r && r.available ? `Update ${r.available.version} available — open the Update Center` : 'Polaris is up to date', 'ok'); } catch (e) { fail(e); } }, 'update version');
  act('config', 'Refresh configuration', 'refresh', async () => { try { await api('config:refresh'); toast('Configuration refreshed', 'ok', 1500); } catch (e) { fail(e); } }, 'sync config reload');
  if (flag('backupVault').enabled) act('backup', 'Create backup now', 'archive', async () => { try { const b = await api('backups:create', 'Command Center'); toast(`Backup created (${b.sections.length} sections)`, 'ok'); } catch (e) { fail(e); } }, 'sicherung vault');
  if (flag('diagnostics').enabled) act('diagnostics', 'Run diagnostics', 'activity', () => deps.go('diagnostics', { run: true }), 'check health troubleshoot');
  act('logs', 'Open logs folder', 'folder', () => api('app:openFolder', 'logs'), 'debug');
  act('screenshots', 'Open screenshots folder', 'image', () => api('app:openFolder', 'screenshots'), 'pictures');
  for (const [label, tab, kw] of SETTING_ENTRIES) cmds.push({ id: `set:${tab}:${label}`, group: 'Settings', label: t(label), icon: 'gear', keywords: `${tab} ${kw}`, run: () => deps.go('settings', { tab }) });
  try {
    if (flag('workspaces').enabled) for (const w of (await api('workspace:list')).items) cmds.push({ id: `ws:${w.id}`, group: 'Workspaces', label: `Activate workspace “${w.name}”`, icon: 'grid', keywords: 'workspace layout', run: async () => { const { applyWorkspaceResult } = await import('../app.js'); applyWorkspaceResult(await api('workspace:activate', w.id)); toast(`Workspace “${w.name}” active`, 'ok', 1500); } });
    const pr = await api('profiles:list');
    for (const p of [...pr.official, ...pr.items]) cmds.push({ id: `pr:${p.id}`, group: 'Profiles', label: `Apply profile “${p.name}”`, icon: 'layers', keywords: 'profile smart', run: async () => { try { await api('profiles:apply', p.id); toast(`Profile “${p.name}” applied`, 'ok', 1500); } catch (e) { fail(e); } } });
  } catch {}
  return cmds;
}

/** Commands that can be pinned to Quick Access (destinations + actions). */
export function quickAccessCommands() {
  const list = store.info.destinations.filter((d) => deps.visible(d.id)).map((d) => ({ id: `go:${d.id}`, label: d.label, icon: d.icon }));
  return list.concat([
    { id: 'do:play', label: 'Play / return to game', icon: 'play' }, { id: 'do:fullscreen', label: 'Toggle fullscreen', icon: 'external' },
    { id: 'do:record', label: 'Recording', icon: 'record' }, { id: 'do:crosshair', label: 'Toggle crosshair', icon: 'crosshair' },
    { id: 'do:filter', label: 'Toggle visual filter', icon: 'eye' }, { id: 'do:backup', label: 'Create backup', icon: 'archive' }, { id: 'do:config', label: 'Refresh configuration', icon: 'refresh' },
  ]);
}

function score(cmd, q) {
  if (!q) return 1;
  const label = cmd.label.toLowerCase(); const hay = `${label} ${cmd.keywords || ''} ${cmd.group}`.toLowerCase();
  if (label.startsWith(q)) return 100;
  if (label.includes(q)) return 70;
  if (q.split(/\s+/).every((w) => hay.includes(w))) return 40;
  // initials match, e.g. "hud ed" or "cs" → Crosshair Studio
  const initials = label.split(/[\s/–-]+/).map((w) => w[0]).join('');
  return q.length >= 2 && initials.startsWith(q.replace(/\s+/g, '')) ? 25 : 0;
}

export async function runCommand(cmd) {
  updateSettings((s) => { s.commands.usage[cmd.id] = (s.commands.usage[cmd.id] || 0) + 1; });
  try { await cmd.run(); } catch (e) { fail(e); }
}

export async function runById(id) {
  const cmd = (await allCommands()).find((c) => c.id === id);
  if (!cmd) { toast('That command is not available right now', 'warn'); return; }
  await runCommand(cmd);
}

/* ---------- palette ---------- */
let open = null;
export async function openPalette(initial = '') {
  if (!flag('commandCenter').enabled) return;
  if (open) { open.input.focus(); return; }
  const cmds = await allCommands();
  const usage = store.settings.commands.usage || {};
  const shortcuts = store.settings.commands.shortcuts || {};
  const keyFor = (id) => Object.keys(shortcuts).find((k) => shortcuts[k] === id);
  const input = h('input.palette-input', { type: 'search', placeholder: 'Search pages, actions, settings, workspaces…', 'aria-label': 'Search commands', value: initial, autocomplete: 'off', spellcheck: false });
  const list = h('div.palette-list', { role: 'listbox' });
  const foot = h('div.palette-foot.small.muted', h('span', h('kbd', '↑↓'), ' ', t('select'), '  ', h('kbd', 'Enter'), ' ', t('run'), '  ', h('kbd', 'Alt+Enter'), ' ', t('assign shortcut'), '  ', h('kbd', 'Esc'), ' ', t('close')));
  const box = h('div.palette', { role: 'dialog', 'aria-label': 'Command Center' }, h('div.palette-head', icon('search', 16), input), list, foot);
  const overlay = h('div.palette-overlay', { on: { mousedown: (e) => { if (e.target === overlay) close(); } } }, box);
  let shown = []; let sel = 0;
  function close() { overlay.remove(); open = null; }
  function draw() {
    const q = input.value.trim().toLowerCase();
    let ranked = cmds.map((c) => ({ c, s: score(c, q) })).filter((x) => x.s > 0);
    ranked.forEach((x) => { x.s += Math.min(30, (usage[x.c.id] || 0) * 3); });
    ranked.sort((a, b) => b.s - a.s);
    clear(list);
    if (!q) {
      const freq = cmds.filter((c) => usage[c.id]).sort((a, b) => usage[b.id] - usage[a.id]).slice(0, 5);
      shown = freq.concat(cmds.filter((c) => c.group === 'Go to' && !freq.includes(c)).slice(0, 20));
      if (freq.length) list.append(h('div.palette-group.pl-label', t('Frequently used')));
    } else shown = ranked.slice(0, 40).map((x) => x.c);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    let lastGroup = !q && shown.length && usage[shown[0].id] ? 'freq' : null;
    shown.forEach((c, i) => {
      const g = !q && usage[c.id] ? 'freq' : c.group;
      if (!q && g !== lastGroup) { list.append(h('div.palette-group.pl-label', t(c.group))); lastGroup = g; }
      const k = keyFor(c.id);
      list.append(h(`button.palette-item${i === sel ? '.is-sel' : ''}`, { type: 'button', role: 'option', 'aria-selected': String(i === sel), on: { click: () => { close(); runCommand(c); }, mousemove: () => { if (sel !== i) { sel = i; mark(); } } } },
        icon(c.icon || 'chevron-right', 15), h('span.palette-label', c.label), k ? h('kbd', k) : null, q ? h('span.palette-kind.small', t(c.group)) : null));
    });
    if (!shown.length) list.append(h('div.palette-empty.muted', t('No matching command')));
  }
  function mark() { [...list.querySelectorAll('.palette-item')].forEach((el, i) => { el.classList.toggle('is-sel', i === sel); if (i === sel) el.scrollIntoView({ block: 'nearest' }); }); }
  input.addEventListener('input', () => { sel = 0; draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
    else if (e.key === 'Enter' && e.altKey) { e.preventDefault(); const c = shown[sel]; if (c) { close(); assignShortcut(c); } }
    else if (e.key === 'Enter') { e.preventDefault(); const c = shown[sel]; if (c) { close(); runCommand(c); } }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  document.body.append(overlay);
  open = { input };
  draw(); input.focus(); input.select();
}

/* ---------- custom shortcuts ---------- */
const RESERVED = () => new Set(Object.values(store.settings.game.keybinds).concat([store.settings.commands.paletteKey, 'Escape']));
export function comboOf(e) {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  return [e.ctrlKey && 'Ctrl', e.shiftKey && 'Shift', e.altKey && 'Alt', key].filter(Boolean).join('+');
}

export function assignShortcut(cmd) {
  const hint = h('p.text2', t('Press the key combination for'), ' “', cmd.label, '”. ', t('Use a modifier (Ctrl, Alt or Shift) or a function key. Esc cancels, Backspace removes the shortcut.'));
  const shown = h('div.palette-capture.mono', '…');
  const overlay = h('div.palette-overlay', h('div.palette.palette-small', { role: 'dialog' }, h('div.stack', h('h2.section-title', t('Assign shortcut')), hint, shown)));
  const done = () => { window.removeEventListener('keydown', onKey, true); overlay.remove(); };
  function onKey(e) {
    e.preventDefault(); e.stopPropagation();
    if (e.key === 'Escape') return done();
    if (e.key === 'Backspace') { updateSettings((s) => { for (const k of Object.keys(s.commands.shortcuts)) if (s.commands.shortcuts[k] === cmd.id) delete s.commands.shortcuts[k]; }); toast('Shortcut removed', 'ok', 1500); return done(); }
    const combo = comboOf(e);
    if (!combo) return;
    if (!/^(Ctrl|Alt|Shift)\+|^F\d{1,2}$/.test(combo)) { shown.textContent = `${combo} — ${t('needs a modifier')}`; return; }
    if (RESERVED().has(combo)) { shown.textContent = `${combo} — ${t('already used by Polaris')}`; return; }
    updateSettings((s) => { for (const k of Object.keys(s.commands.shortcuts)) if (s.commands.shortcuts[k] === cmd.id) delete s.commands.shortcuts[k]; s.commands.shortcuts[combo] = cmd.id; });
    toast(`${combo} → ${cmd.label}`, 'ok'); done();
  }
  window.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
}

/* ---------- quick access menu ---------- */
export function openQuickAccess(anchor) {
  const existing = document.querySelector('.quick-menu');
  if (existing) { existing.remove(); return; }
  const all = quickAccessCommands();
  const ids = store.settings.layout.quickAccess || [];
  const items = ids.map((id) => all.find((c) => c.id === id)).filter(Boolean);
  const r = anchor.getBoundingClientRect();
  const menu = h('div.quick-menu', { role: 'menu', style: { top: `${r.bottom + 4}px`, left: `${Math.max(8, r.left - 180)}px` } },
    items.length ? items.map((c) => h('button.quick-item', { type: 'button', role: 'menuitem', on: { click: () => { menu.remove(); runById(c.id); } } }, icon(c.icon, 14), h('span', t(c.label))))
      : h('div.quick-empty.small.muted', t('No shortcuts pinned yet.')),
    h('div.quick-foot', h('button.quick-item', { type: 'button', on: { click: () => { menu.remove(); deps.go('workspace'); } } }, icon('sliders', 14), h('span', t('Edit quick access')))));
  const off = (e) => { if (!menu.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) { menu.remove(); document.removeEventListener('mousedown', off); } };
  document.addEventListener('mousedown', off);
  document.body.append(menu);
}
