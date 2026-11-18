/* Application state shared by all views. */
import { h, clear, button, debounce } from './dom.js';

export const api = (ch, ...args) => window.polaris.invoke(ch, ...args);
export const on = (ev, fn) => window.polaris.on(ev, fn);

export const store = {
  info: null,        // app:info
  settings: null,    // settings:get
  remote: null,      // config:get
  metrics: null,     // last metrics sample
  win: { maximized: false, fullscreen: false, mode: 'shell' },
  game: { started: false, inMatch: false, loaded: false },
  server: { configured: false, user: null },
  listeners: new Map(),
};

export function cfg(domain) { return store.remote.config[domain]; }
export function flag(name) { const f = cfg('client.features').flags[name]; return f || { enabled: false, visible: false, label: name, description: '' }; }

export function emit(event, data) { for (const fn of store.listeners.get(event) || []) { try { fn(data); } catch (e) { console.error(e); } } }
export function subscribe(event, fn) {
  if (!store.listeners.has(event)) store.listeners.set(event, new Set());
  store.listeners.get(event).add(fn);
  return () => store.listeners.get(event).delete(fn);
}

/* ---------- settings: optimistic update + debounced persist ---------- */
const persist = debounce(async () => {
  try { store.settings = await api('settings:set', store.settings); emit('settings', store.settings); }
  catch (e) { toast(`Could not save settings: ${e.message}`, 'error'); }
}, 200);

/** mutate(fn) — fn receives the settings object and changes it in place. */
export function updateSettings(fn, { immediate = false } = {}) {
  fn(store.settings);
  emit('settings', store.settings);
  if (immediate) return api('settings:set', store.settings).then((s) => { store.settings = s; emit('settings', s); return s; });
  persist();
  return Promise.resolve(store.settings);
}

export async function reloadSettings() { store.settings = await api('settings:get'); emit('settings', store.settings); }
export async function reloadRemote() { store.remote = await api('config:get'); emit('remote', store.remote); }

/* ---------- toasts ---------- */
export function toast(text, level = 'info', ms = 4200) {
  const root = document.getElementById('toasts');
  const t = h(`div.toast.toast-${level}`, { role: level === 'error' ? 'alert' : 'status' }, h('span', text));
  root.appendChild(t);
  setTimeout(() => { t.classList.add('is-leaving'); setTimeout(() => t.remove(), 200); }, ms);
}
export function fail(e, prefix = '') { toast(`${prefix}${e && e.message ? e.message : e}`, 'error', 6000); }

/* ---------- modal ---------- */
export function modal({ title, body, actions = [], wide = false, onClose }) {
  const root = document.getElementById('modal-root');
  const close = () => { root.classList.remove('is-open'); clear(root); document.removeEventListener('keydown', esc); if (onClose) onClose(); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  const dialog = h(`div.modal${wide ? '.modal-wide' : ''}`, { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('header.modal-head', h('h3', title), button('', close, { iconName: 'close', small: true, title: 'Close' })),
    h('div.modal-body', body),
    actions.length ? h('footer.modal-foot', ...actions.map((a) => button(a.label, async () => { const keep = await a.onClick(close); if (keep !== true) close(); }, { kind: a.kind || 'ghost', iconName: a.icon }))) : null);
  clear(root).appendChild(h('div.modal-backdrop', { on: { click: (e) => { if (e.target === e.currentTarget) close(); } } }, dialog));
  root.classList.add('is-open');
  document.addEventListener('keydown', esc);
  const first = dialog.querySelector('input, select, textarea');
  if (first) setTimeout(() => first.focus(), 30);
  return close;
}

export function confirmDialog(title, message, { confirm = 'Confirm', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    modal({ title, body: h('p.modal-text', message), onClose: () => { if (!done) resolve(false); },
      actions: [{ label: 'Cancel', onClick: () => {} }, { label: confirm, kind: danger ? 'danger' : 'primary', onClick: () => { done = true; resolve(true); } }] });
  });
}

export function promptDialog(title, label, value = '', { placeholder = '', maxlength = 80 } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const input = h('input.input', { value, placeholder, maxlength });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { done = true; resolve(input.value.trim()); document.querySelector('.modal-backdrop').click(); } });
    modal({ title, body: h('label.field', h('span.field-label', label), input), onClose: () => { if (!done) resolve(null); },
      actions: [{ label: 'Cancel', onClick: () => {} }, { label: 'OK', kind: 'primary', onClick: () => { done = true; resolve(input.value.trim()); } }] });
  });
}

/* ---------- server helpers ---------- */
export async function refreshServer() {
  try { store.server = await api('server:status'); } catch (e) { store.server = { configured: false, error: e.message }; }
  emit('server', store.server);
  return store.server;
}
export const signedIn = () => !!(store.server && store.server.user);
