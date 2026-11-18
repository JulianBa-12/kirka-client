/* Hosts enabled plugins in sandboxed iframes and brokers their postMessage API. */
import { h, clear } from './dom.js';
import { api, store, cfg, flag, toast } from './store.js';

const frames = new Map();   // id -> { el, plugin, lastNotify }
let dock = null; let panelFor = null; let observer = null;

const PERM = { 'storage.get': 'storage', 'storage.set': 'storage', notify: 'notifications', 'hud.set': 'hud.overlay', 'theme.get': 'theme.read', info: null };

export async function init() {
  dock = document.getElementById('plugin-dock');
  window.addEventListener('message', onMessage);
  await reload();
}

export async function reload() {
  if (!flag('plugins').enabled) { for (const f of frames.values()) f.el.remove(); frames.clear(); return []; }
  const list = await api('plugins:list');
  const wanted = new Map(list.filter((p) => p.enabled).map((p) => [p.id, p]));
  for (const [id, f] of frames) {
    if (!wanted.has(id) || wanted.get(id).sha256 !== f.plugin.sha256) { f.el.remove(); frames.delete(id); }
    else f.plugin = wanted.get(id); // permission changes apply immediately
  }
  for (const [id, p] of wanted) {
    if (frames.has(id)) continue;
    const el = h('iframe', { sandbox: 'allow-scripts', src: `polaris-plugin://run/${encodeURIComponent(id)}/index.html`, title: `Plugin ${p.manifest.name}`, referrerpolicy: 'no-referrer' });
    frames.set(id, { el, plugin: p, lastNotify: 0 });
    dock.appendChild(el);
  }
  return list;
}

function reply(f, id, result, error) { f.el.contentWindow.postMessage({ __polaris: 1, reply: id, result, error }, '*'); }

async function onMessage(e) {
  const d = e.data;
  if (!d || d.__polaris !== 1 || !d.method) return;
  let f = null;
  for (const x of frames.values()) if (x.el.contentWindow === e.source) f = x;
  if (!f) return; // not one of our plugin frames
  const p = f.plugin;
  const need = PERM[d.method];
  if (need === undefined) return reply(f, d.id, null, `Unknown method ${d.method}`);
  if (need && !p.grantedPermissions.includes(need)) return reply(f, d.id, null, `Permission "${need}" was not granted`);
  const args = Array.isArray(d.args) ? d.args : [];
  try {
    let result = null;
    switch (d.method) {
      case 'info': result = { id: p.id, name: p.manifest.name, version: p.manifest.version, permissions: p.grantedPermissions.slice(), client: store.info.version }; break;
      case 'storage.get': { const all = await api('plugins:storageGet', p.id); result = typeof args[0] === 'string' ? (all[args[0]] ?? null) : all; break; }
      case 'storage.set': await api('plugins:storageSet', p.id, String(args[0]), args[1] === undefined ? null : JSON.parse(JSON.stringify(args[1]))); break;
      case 'notify': {
        if (Date.now() - f.lastNotify < 3000) throw new Error('Notifications are limited to one every 3 seconds');
        f.lastNotify = Date.now();
        toast(`${p.manifest.name}: ${String(args[0] || '').slice(0, 160)}`, 'info');
        break;
      }
      case 'hud.set': await api('game:pluginOverlay', p.id, args[0] == null ? null : String(args[0]).slice(0, 80)); break;
      case 'theme.get': result = { ...cfg('client.theme').colors }; break;
      default: break;
    }
    reply(f, d.id, result, null);
  } catch (err) { reply(f, d.id, null, err.message); }
}

/** Push an event to every plugin allowed to receive it. */
export function broadcast(event, data) {
  const need = event === 'theme' ? 'theme.read' : 'game.events';
  for (const f of frames.values()) {
    if (!f.plugin.grantedPermissions.includes(need) || !f.el.contentWindow) continue;
    f.el.contentWindow.postMessage({ __polaris: 1, event, data }, '*');
  }
}

/** Show a plugin's panel over a placeholder element (iframes are never re-parented, so they keep running). */
export function showPanel(id, placeholder) {
  hidePanel();
  const f = frames.get(id);
  if (!f || !f.plugin.grantedPermissions.includes('ui.panel')) return false;
  panelFor = id;
  const place = () => {
    const r = placeholder.getBoundingClientRect();
    Object.assign(dock.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    const viewRect = document.getElementById('view').getBoundingClientRect();
    dock.style.clipPath = `inset(${Math.max(0, viewRect.top - r.top)}px 0 ${Math.max(0, r.bottom - viewRect.bottom)}px 0)`;
  };
  place();
  observer = new ResizeObserver(place); observer.observe(placeholder);
  document.getElementById('view').addEventListener('scroll', place, { passive: true });
  window.addEventListener('resize', place);
  dock._place = place;
  dock.classList.add('is-visible');
  for (const [fid, x] of frames) x.el.classList.toggle('is-shown', fid === id);
  return true;
}
export function hidePanel() {
  if (!dock) return;
  dock.classList.remove('is-visible');
  for (const x of frames.values()) x.el.classList.remove('is-shown');
  if (observer) { observer.disconnect(); observer = null; }
  if (dock._place) { document.getElementById('view').removeEventListener('scroll', dock._place); window.removeEventListener('resize', dock._place); dock._place = null; }
  panelFor = null;
}
export const running = () => [...frames.keys()];
