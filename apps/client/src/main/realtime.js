'use strict';
/**
 * Live connection to the Polaris server (WebSocket, /api/v1/realtime?channel=client).
 *
 * Only used when a Polaris server is configured in Settings → Account and the owner has not
 * disabled the "liveUpdates" feature. The socket is a notification channel only: when the
 * server says "config.updated", the client downloads the signed bundle through the normal
 * verified path (remote.refresh). Nothing received over the socket is trusted as configuration.
 * Without a server, the client keeps polling the signed GitHub Pages mirror every 30 minutes.
 */
const WebSocket = require('ws');
const { app } = require('electron');
const { log } = require('./core');
const state = require('./state');
const remote = require('./remote');
const server = require('./server');

const MAX_BACKOFF = 60000;
let ws = null; let send = () => {}; let onConfig = () => {};
let backoff = 2000; let retryTimer = null; let watchTimer = null; let connectedKey = null; let authedAs = null;
const status = { state: 'off', reason: 'No Polaris server configured', url: null, connectedAt: null, lastEventAt: null, lastEvent: null, events: 0, reconnects: 0, maintenance: null, authenticated: false };

function enabled() {
  const s = state.settings.get();
  const flagOn = (() => { const f = remote.current.config['client.features'].flags.liveUpdates; return !f || f.enabled; })();
  if (!server.base()) return { ok: false, reason: 'No Polaris server configured' };
  if (!s.realtime.enabled) return { ok: false, reason: 'Turned off in Settings → Advanced' };
  if (!flagOn) return { ok: false, reason: 'Live updates are turned off by the Polaris team' };
  return { ok: true };
}

const keyNow = () => `${server.base()}|${server.authToken() ? 'auth' : 'anon'}|${state.settings.get().realtime.enabled}`;

function emitStatus() { send('realtime:status', { ...status }); }

function close(reason) {
  clearTimeout(retryTimer); retryTimer = null;
  if (ws) { try { ws.removeAllListeners(); ws.on('error', () => {}); ws.close(); } catch {} }
  ws = null; connectedKey = null; authedAs = null;
  Object.assign(status, { state: 'off', reason, authenticated: false });
  emitStatus();
}

function schedule() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(connect, backoff);
  backoff = Math.min(MAX_BACKOFF, backoff * 2);
}

async function handleEvent(m) {
  status.lastEventAt = new Date().toISOString(); status.lastEvent = m.event; status.events++;
  const d = m.data || {};
  switch (m.event) {
    case 'config.updated': {
      if (d.target && d.target !== 'client') break;
      if (typeof d.sequence === 'number' && d.sequence <= (remote.current.sequence || 0) && d.reason !== 'resync') break;
      const cur = await remote.refresh('client');
      onConfig(cur);
      send('config:changed', { live: true, sequence: cur.sequence, restartRequired: !!d.restartRequired, domains: d.domains || [] });
      break;
    }
    case 'releases.changed': send('realtime:event', { event: 'releases.changed', data: d }); break;
    case 'announcements.changed': case 'news.changed': case 'notification': send('realtime:event', { event: m.event, data: d }); break;
    case 'maintenance': status.maintenance = d; send('realtime:event', { event: 'maintenance', data: d }); break;
    default: break;
  }
  emitStatus();
}

function connect() {
  clearTimeout(retryTimer); retryTimer = null;
  const en = enabled();
  if (!en.ok) { close(en.reason); return; }
  if (ws && connectedKey === keyNow()) return;
  if (ws) { try { ws.removeAllListeners(); ws.on('error', () => {}); ws.close(); } catch {} ws = null; }
  const url = `${server.base().replace(/^http/, 'ws')}/api/v1/realtime?channel=client`;
  Object.assign(status, { state: 'connecting', reason: null, url });
  emitStatus();
  connectedKey = keyNow();
  let sock;
  try { sock = new WebSocket(url, { headers: { 'User-Agent': `PolarisClient/${app.getVersion()}` }, handshakeTimeout: 10000, maxPayload: 256 * 1024 }); }
  catch (e) { Object.assign(status, { state: 'error', reason: e.message }); emitStatus(); schedule(); return; }
  ws = sock;
  sock.on('open', () => {
    backoff = 2000;
    Object.assign(status, { state: 'connected', connectedAt: new Date().toISOString() });
    const t = server.authToken();
    if (t) sock.send(JSON.stringify({ type: 'auth', token: t }));
    emitStatus();
  });
  sock.on('message', (raw) => {
    let m; try { m = JSON.parse(String(raw)); } catch { return; }
    if (m.type === 'hello') {
      status.maintenance = m.maintenance || null;
      if (m.maintenance && m.maintenance.active) send('realtime:event', { event: 'maintenance', data: m.maintenance });
      // Catch up on anything published while we were offline.
      const seq = m.bundles && m.bundles.client && m.bundles.client.sequence;
      if (typeof seq === 'number' && seq > (remote.current.sequence || 0)) handleEvent({ event: 'config.updated', data: { target: 'client', sequence: seq, reason: 'catch-up' } }).catch(() => {});
      emitStatus();
    } else if (m.type === 'auth') { status.authenticated = !!m.ok; authedAs = m.ok ? m.username || null : null; emitStatus(); }
    else if (m.type === 'event') handleEvent(m).catch((e) => log.warn('realtime event failed', { event: m.event, error: e.message }));
    else if (m.type === 'ping') sock.send(JSON.stringify({ type: 'pong' }));
  });
  sock.on('close', (code) => {
    if (ws !== sock) return;
    ws = null; connectedKey = null; status.authenticated = false;
    Object.assign(status, { state: 'disconnected', reason: `Connection closed (${code})` });
    status.reconnects++; emitStatus(); schedule();
  });
  sock.on('error', (e) => { Object.assign(status, { state: 'error', reason: e.message }); emitStatus(); });
}

function start({ send: s, onConfig: oc }) {
  send = s; onConfig = oc || (() => {});
  connect();
  // Re-evaluate when the server URL, login state or the owner flag changes.
  clearInterval(watchTimer);
  watchTimer = setInterval(() => {
    const en = enabled();
    if (!en.ok) { if (status.state !== 'off' || status.reason !== en.reason) close(en.reason); return; }
    if (!ws && !retryTimer) connect();
    else if (ws && connectedKey !== keyNow()) connect();
  }, 5000);
  watchTimer.unref();
}

function stop() { clearInterval(watchTimer); close('Stopped'); }

module.exports = { start, stop, reconnect: () => { backoff = 2000; connectedKey = null; connect(); return { ...status }; }, status: () => ({ ...status, user: authedAs }) };
