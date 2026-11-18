'use strict';
/**
 * Polaris 1.1 features in the main process:
 *   Workspaces, Session Journal, Profile Automation, Backup Vault, Diagnostics, Realtime status.
 * All handlers register on the shared IPC registry from ipc.js and validate their input.
 */
const fs = require('fs');
const crypto = require('crypto');
const { app, screen } = require('electron');
const { log, clone } = require('./core');
const state = require('./state');
const remote = require('./remote');
const game = require('./game');
const library = require('./library');
const backups = require('./backups');
const diagnostics = require('./diagnostics');
const realtime = require('./realtime');
const ipc = require('./ipc');
const { validate } = require('../shared/utilities/schema');
const { ITEM_SCHEMAS } = require('../shared/configuration/domains');
const { CLIENT_DESTINATIONS, HOME_WIDGETS } = require('../shared/configuration/defaults');

const { handle } = ipc;
const UUID = /^[0-9a-f-]{36}$/;
const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
const DESTS = new Set(CLIENT_DESTINATIONS.map((d) => d.id));
const WIDGETS = new Set(HOME_WIDGETS.map((w) => w.id));
const list = (v, set, n = 40) => (Array.isArray(v) ? [...new Set(v.filter((x) => set.has(x)))].slice(0, n) : []);
const send = (ch, data) => { const c = ipc.getCtx(); if (c) c.send(ch, data); };

/* ======================= Workspaces ======================= */
function cleanWorkspace(w, prev) {
  return {
    id: prev ? prev.id : crypto.randomUUID(),
    name: str(w.name, 40).trim() || 'Workspace', description: str(w.description, 200),
    nav: { order: list(w.nav && w.nav.order, DESTS), hidden: list(w.nav && w.nav.hidden, DESTS).filter((d) => !['home', 'settings'].includes(d)) },
    home: { order: list(w.home && w.home.order, WIDGETS, 20), hidden: list(w.home && w.home.hidden, WIDGETS, 20) },
    quickAccess: Array.isArray(w.quickAccess) ? w.quickAccess.filter((x) => typeof x === 'string' && /^[a-z0-9:._-]{1,48}$/i.test(x)).slice(0, 8) : [],
    toolsOpen: w.toolsOpen !== false,
    startView: DESTS.has(w.startView) ? w.startView : null,
    profileId: typeof w.profileId === 'string' && w.profileId.length <= 80 ? w.profileId : null,
    createdAt: prev ? prev.createdAt : new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}
function currentLayout() {
  const s = state.settings.get();
  return { nav: { order: s.layout.navOrder, hidden: s.layout.navHidden }, home: { order: s.home.order, hidden: s.home.hidden }, quickAccess: s.layout.quickAccess, toolsOpen: s.layout.toolsOpen, startView: s.general.startView };
}
function activateWorkspace(id) {
  const w = state.workspaces.get().items.find((x) => x.id === id);
  if (!w) throw new Error('Workspace not found');
  const s = clone(state.settings.get());
  s.layout.navOrder = w.nav.order; s.layout.navHidden = w.nav.hidden; s.layout.quickAccess = w.quickAccess; s.layout.toolsOpen = w.toolsOpen;
  s.home.order = w.home.order; s.home.hidden = w.home.hidden;
  if (w.startView) s.general.startView = w.startView;
  s.activeWorkspaceId = w.id;
  let result = { settings: ipc.saveSettings(s), restartRequired: false, workspace: w };
  if (w.profileId) { try { const r = ipc.applyProfile(w.profileId); result = { ...result, settings: r.settings, restartRequired: r.restartRequired }; } catch (e) { result.profileError = e.message; } }
  const after = clone(state.settings.get()); after.activeWorkspaceId = w.id; result.settings = ipc.saveSettings(after);
  return result;
}
const toFileFormat = (w) => ({ format: 'polaris-workspace/1', name: w.name, workspace: { nav: w.nav, home: w.home, quickAccess: w.quickAccess, toolsOpen: w.toolsOpen } });

handle('workspace:list', () => ({ items: state.workspaces.get().items, active: state.settings.get().activeWorkspaceId, current: currentLayout() }));
handle('workspace:save', (w) => {
  if (!w || typeof w !== 'object') throw new Error('Invalid workspace');
  let out;
  state.workspaces.update((d) => {
    const prev = UUID.test(w.id || '') ? d.items.find((x) => x.id === w.id) : null;
    if (!prev && d.items.length >= 30) throw new Error('You can keep up to 30 workspaces');
    out = cleanWorkspace(w.fromCurrent ? { ...currentLayout(), name: w.name, description: w.description, profileId: w.profileId } : w, prev);
    d.items = prev ? d.items.map((x) => (x.id === prev.id ? out : x)) : [...d.items, out];
    return d;
  });
  return out;
});
handle('workspace:delete', (id) => {
  state.workspaces.update((d) => { d.items = d.items.filter((x) => x.id !== id); return d; });
  if (state.settings.get().activeWorkspaceId === id) state.settings.update((s) => { s.activeWorkspaceId = null; return s; });
  return state.workspaces.get().items;
});
handle('workspace:activate', (id) => activateWorkspace(str(id, 40)));
handle('workspace:export', async (id) => {
  const w = state.workspaces.get().items.find((x) => x.id === id);
  if (!w) throw new Error('Workspace not found');
  const file = await ipc.pickSave(`${w.name.replace(/[^\w-]+/g, '-')}.polaris-workspace.json`, 'json');
  if (!file) return null;
  fs.writeFileSync(file, JSON.stringify(toFileFormat(w), null, 2));
  return file;
});
handle('workspace:import', async () => {
  const [file] = await ipc.pickFiles('json');
  if (!file) return null;
  const r = validate(ITEM_SCHEMAS.workspace, JSON.parse(ipc.readSmall(file, 64 << 10).toString('utf8')));
  if (!r.ok) throw new Error(`Not a valid Polaris workspace: ${r.errors.slice(0, 2).map((e) => `${e.path} ${e.message}`).join('; ')}`);
  const w = cleanWorkspace({ name: r.value.name, ...r.value.workspace });
  state.workspaces.update((d) => { d.items.push(w); return d; });
  return w;
});
handle('workspace:toLibrary', (id) => {
  const w = state.workspaces.get().items.find((x) => x.id === id);
  if (!w) throw new Error('Workspace not found');
  return library.add({ kind: 'workspace', name: w.name, data: Buffer.from(JSON.stringify(toFileFormat(w))), source: 'studio' });
});
handle('workspace:fromLibrary', (libId) => {
  const it = library.get(libId);
  if (!it || it.kind !== 'workspace' || !it.meta || !it.meta.content) throw new Error('Library item is not a workspace');
  const c = it.meta.content;
  const w = cleanWorkspace({ name: c.name, ...c.workspace });
  state.workspaces.update((d) => { d.items.push(w); return d; });
  return w;
});

/* ======================= Session Journal ======================= */
const JOURNAL_KEY = /^(session|match):[0-9a-f-]{36}$/;
handle('journal:get', () => state.journal.get());
handle('journal:set', (key, entry) => {
  if (!JOURNAL_KEY.test(key || '')) throw new Error('Invalid journal key');
  return state.journal.update((j) => {
    const e = entry && typeof entry === 'object' ? entry : null;
    if (!e || (!e.note && !e.favorite && !(e.tags && e.tags.length) && !e.rating)) { delete j.entries[key]; return j; }
    j.entries[key] = {
      note: str(e.note, 4000), favorite: !!e.favorite,
      tags: Array.isArray(e.tags) ? [...new Set(e.tags.map((t) => str(t, 24).trim()).filter(Boolean))].slice(0, 8) : [],
      rating: [1, 2, 3, 4, 5].includes(e.rating) ? e.rating : null,
      updatedAt: new Date().toISOString(),
    };
    if (Object.keys(j.entries).length > 5000) { const oldest = Object.entries(j.entries).sort((a, b) => a[1].updatedAt.localeCompare(b[1].updatedAt))[0]; delete j.entries[oldest[0]]; }
    return j;
  }).entries[key] || null;
});
handle('journal:export', async () => {
  const a = state.analytics.get(); const j = state.journal.get();
  const file = await ipc.pickSave(`polaris-journal-${new Date().toISOString().slice(0, 10)}.md`, null);
  if (!file) return null;
  const lines = ['# Polaris session journal', ''];
  for (const sess of [...a.sessions].reverse()) {
    const e = j.entries[`session:${sess.id}`];
    if (!e) continue;
    lines.push(`## ${sess.start.slice(0, 16).replace('T', ' ')}${e.favorite ? ' ★' : ''}`, `Duration ${Math.round(sess.durationSec / 60)} min · in match ${Math.round(sess.inMatchSec / 60)} min · matches entered ${sess.matchesEntered}${sess.fpsAvg != null ? ` · avg ${sess.fpsAvg} fps` : ''}`);
    if (e.tags.length) lines.push(`Tags: ${e.tags.join(', ')}`);
    if (e.note) lines.push('', e.note);
    lines.push('');
  }
  fs.writeFileSync(file, lines.join('\n'));
  return file;
});

/* ======================= Profile Automation ======================= */
// Automation only changes Polaris settings (profiles, performance presets, workspaces) or shows a
// notice. It never sends input to the game and never runs while it would affect a match unfairly.
const TRIGGERS = ['startup', 'gameStart', 'matchStart', 'matchEnd', 'battery', 'ac', 'smallDisplay', 'largeDisplay', 'schedule'];
const ACTIONS = ['profile', 'performance', 'workspace', 'notify'];
function cleanRule(r, prev) {
  if (!TRIGGERS.includes(r.trigger)) throw new Error('Unknown trigger');
  if (!r.action || !ACTIONS.includes(r.action.type)) throw new Error('Unknown action');
  const time = r.trigger === 'schedule' ? (/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time || '') ? r.time : null) : null;
  if (r.trigger === 'schedule' && !time) throw new Error('Schedule rules need a time (HH:MM)');
  return {
    id: prev ? prev.id : crypto.randomUUID(), name: str(r.name, 60).trim() || 'Rule', enabled: r.enabled !== false,
    trigger: r.trigger, time, action: { type: r.action.type, value: str(r.action.value, r.action.type === 'notify' ? 200 : 80) },
    createdAt: prev ? prev.createdAt : new Date().toISOString(),
  };
}
const lastRun = new Map();
function runAction(rule, ctxInfo) {
  const a = rule.action;
  let detail = '';
  if (a.type === 'profile') { const r = ipc.applyProfile(a.value); detail = r.restartRequired ? 'profile applied (restart needed for some settings)' : 'profile applied'; }
  else if (a.type === 'performance') { const s = clone(state.settings.get()); ipc.applyPerformanceProfile(s, a.value); ipc.saveSettings(s); detail = `performance profile ${a.value}`; }
  else if (a.type === 'workspace') { activateWorkspace(a.value); detail = 'workspace activated'; }
  else if (a.type === 'notify') detail = 'notice shown';
  send('settings:changed');
  send('toast', { text: a.type === 'notify' ? a.value : `Automation "${rule.name}": ${detail}`, level: 'info' });
  return detail;
}
function fire(trigger, info = {}) {
  const rules = state.automation.get().rules.filter((r) => r.enabled && r.trigger === trigger);
  for (const r of rules) {
    const last = lastRun.get(r.id) || 0;
    if (Date.now() - last < 10000) continue; // never loop or flap
    lastRun.set(r.id, Date.now());
    let ok = true; let detail = '';
    try { detail = runAction(r, info); } catch (e) { ok = false; detail = e.message; log.warn('automation failed', { rule: r.id, error: e.message }); }
    state.automation.update((d) => { d.log.unshift({ at: new Date().toISOString(), ruleId: r.id, name: r.name, trigger, ok, detail }); d.log = d.log.slice(0, 50); return d; });
  }
}
handle('automation:get', () => ({ ...state.automation.get(), triggers: TRIGGERS, actions: ACTIONS }));
handle('automation:save', (r) => {
  if (!r || typeof r !== 'object') throw new Error('Invalid rule');
  let out;
  state.automation.update((d) => {
    const prev = UUID.test(r.id || '') ? d.rules.find((x) => x.id === r.id) : null;
    if (!prev && d.rules.length >= 40) throw new Error('You can keep up to 40 rules');
    out = cleanRule(r, prev);
    d.rules = prev ? d.rules.map((x) => (x.id === prev.id ? out : x)) : [...d.rules, out];
    return d;
  });
  return out;
});
handle('automation:delete', (id) => state.automation.update((d) => { d.rules = d.rules.filter((x) => x.id !== id); return d; }).rules);
handle('automation:test', (id) => {
  const r = state.automation.get().rules.find((x) => x.id === id);
  if (!r) throw new Error('Rule not found');
  lastRun.delete(r.id);
  return runAction(r, { test: true });
});
handle('automation:clearLog', () => state.automation.update((d) => { d.log = []; return d; }).log);

let lastDisplayClass = null;
function displayCheck() {
  try {
    const d = screen.getPrimaryDisplay();
    const cls = d.size.width < 1600 ? 'smallDisplay' : 'largeDisplay';
    if (cls !== lastDisplayClass) { lastDisplayClass = cls; fire(cls, { width: d.size.width }); }
  } catch {}
}
let lastMinute = null;
function scheduleTick() {
  const now = new Date();
  const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (hm === lastMinute) return; lastMinute = hm;
  for (const r of state.automation.get().rules) if (r.enabled && r.trigger === 'schedule' && r.time === hm) fire('schedule');
}

/* ======================= Backup Vault ======================= */
handle('backups:list', () => ({ items: backups.list(), sections: Object.entries(backups.SECTIONS).map(([id, s]) => ({ id, label: s.label })), settings: state.settings.get().backups }));
handle('backups:create', (label) => backups.create({ reason: 'manual', label: str(label, 60) }));
handle('backups:delete', (id) => backups.remove(str(id, 40)));
handle('backups:restore', (id, sections) => { const r = backups.restore(str(id, 40), sections, { saveSettings: ipc.saveSettings }); send('settings:changed'); return r; });
handle('backups:inspect', (id) => { const { doc, size } = backups.read(str(id, 40)); const s = backups.list().find((x) => x.id === doc.id); return { ...s, size, sha256Actual: backups.hash(doc.payload) }; });
handle('backups:export', async (id) => {
  const { doc } = backups.read(str(id, 40));
  const file = await ipc.pickSave(`polaris-backup-${doc.id}.json`, 'json');
  if (!file) return null;
  fs.writeFileSync(file, JSON.stringify(doc));
  return file;
});
handle('backups:import', async () => {
  const [file] = await ipc.pickFiles('json');
  if (!file) return null;
  return backups.importFile(ipc.readSmall(file, 32 << 20).toString('utf8'));
});

/* ======================= Diagnostics ======================= */
let lastDiag = null;
handle('diagnostics:run', async () => { lastDiag = await diagnostics.run({ realtime, game }); return lastDiag; });
handle('diagnostics:report', async () => { if (!lastDiag) lastDiag = await diagnostics.run({ realtime, game }); return diagnostics.report(lastDiag); });
handle('diagnostics:export', async () => {
  if (!lastDiag) lastDiag = await diagnostics.run({ realtime, game });
  const file = await ipc.pickSave(`polaris-diagnostics-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`, null);
  if (!file) return null;
  fs.writeFileSync(file, diagnostics.report(lastDiag));
  return file;
});

/* ======================= Realtime ======================= */
handle('realtime:status', () => realtime.status());
handle('realtime:reconnect', () => realtime.reconnect());

/* ======================= lifecycle ======================= */
function start({ onConfig }) {
  realtime.start({ send, onConfig });
  setTimeout(() => backups.autoBackup(), 15000).unref();
  setInterval(() => backups.autoBackup(), 3 * 3600 * 1000).unref();
  setTimeout(() => { fire('startup'); displayCheck(); }, 2500).unref();
  try { screen.on('display-metrics-changed', displayCheck); screen.on('display-added', displayCheck); screen.on('display-removed', displayCheck); } catch {}
  setInterval(scheduleTick, 20000).unref();
}

module.exports = { start, fire, activateWorkspace, realtime, TRIGGERS, ACTIONS };
