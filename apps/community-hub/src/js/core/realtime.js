/**
 * Live updates for the Community Hub (WebSocket /api/v1/realtime?channel=website).
 * Only active when the site is connected to a backend (data/site-config.json → apiBase).
 * The socket is a notification channel: on "config.updated" the page re-reads the published
 * website bundle through the normal path; nothing in the message itself is rendered as config.
 */
import { config, status } from './api.js';

let started = false;

export async function startRealtime(handlers) {
  if (started || typeof WebSocket === 'undefined') return;
  started = true;
  const c = await config();
  const s = await status();
  if (!c.apiRoot || (s.state !== 'online' && s.state !== 'maintenance')) { handlers.onStatus && handlers.onStatus('off'); return; }
  const url = `${c.apiRoot.replace(/^http/, 'ws')}/realtime?channel=website`;
  let backoff = 2000; let seq = null;
  const open = () => {
    let ws;
    try { ws = new WebSocket(url); } catch { return; }
    ws.addEventListener('open', () => { backoff = 2000; handlers.onStatus && handlers.onStatus('live'); });
    ws.addEventListener('message', (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type === 'hello') {
        if (m.maintenance) handlers.onMaintenance(m.maintenance);
        const ws2 = m.bundles && m.bundles.website;
        if (ws2 && typeof ws2.sequence === 'number') { if (seq !== null && ws2.sequence > seq) handlers.onConfig(); seq = ws2.sequence; }
        return;
      }
      if (m.type === 'ping') { try { ws.send(JSON.stringify({ type: 'pong' })); } catch { /* ignore */ } return; }
      if (m.type !== 'event') return;
      const d = m.data || {};
      if (m.event === 'config.updated' && (!d.target || d.target === 'website')) { seq = typeof d.sequence === 'number' ? d.sequence : seq; handlers.onConfig(); }
      else if (m.event === 'announcements.changed') handlers.onAnnouncements();
      else if (m.event === 'maintenance') handlers.onMaintenance(d);
      handlers.onEvent && handlers.onEvent({ event: m.event, data: d });
    });
    ws.addEventListener('close', () => {
      handlers.onStatus && handlers.onStatus('reconnecting');
      setTimeout(open, backoff); backoff = Math.min(60000, backoff * 2);
    });
  };
  open();
}
