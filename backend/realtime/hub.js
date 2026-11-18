'use strict';
/**
 * Realtime hub (WebSocket, path /api/v1/realtime).
 *
 * Channels
 *   client   Polaris Client installs   — config/announcement/maintenance/release/news events,
 *                                        personal notifications after {type:'auth', token}
 *   website  Community Hub pages        — website config, news, announcements, maintenance
 *   owner    Polaris Owner              — everything above plus the live audit trail, reports
 *                                        and connection statistics. Requires an owner session
 *                                        bound to an active owner connection (same rule as /owner/*).
 *
 * The socket only carries notifications. Configuration itself is still delivered as signed
 * bundles over HTTPS, so a client that receives `config.updated` re-fetches and verifies the
 * envelope before anything changes. A forged realtime message can at most trigger a refetch.
 */
const express = require('express');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { BUNDLE_TARGETS, applyMode } = require('../../shared/configuration/domains');

const CHANNELS = ['client', 'website', 'owner'];
const MAX_PER_IP = 24;
const MAX_TOTAL = 10000;
const MSG_WINDOW_MS = 10000;
const MSG_LIMIT = 30;
const HEARTBEAT_MS = 30000;

function createRealtime(ctx) {
  const { log, events } = ctx;
  const clients = new Set();
  const recent = []; // last broadcast events (owner diagnostics)
  let wss = null; let heartbeat = null; let statsTimer = null; let lastStats = '';

  const stats = () => {
    const by = { client: 0, website: 0, owner: 0 };
    let users = 0;
    for (const c of clients) { by[c.channel]++; if (c.userId) users++; }
    return { total: clients.size, byChannel: by, signedIn: users, startedAt: startedAt, events: recent.length };
  };
  const startedAt = new Date().toISOString();

  function send(c, msg) {
    if (c.ws.readyState !== 1) return;
    try { c.ws.send(JSON.stringify(msg)); } catch (e) { log.warn('realtime send failed', { error: e.message }); }
  }

  /** Broadcast an event to channels. Owners receive every public event as well. */
  function broadcast(event, data, channels) {
    const msg = { type: 'event', event, data, at: new Date().toISOString(), id: crypto.randomUUID() };
    recent.unshift({ event, at: msg.at, channels, summary: summarize(event, data) });
    recent.length = Math.min(recent.length, 100);
    for (const c of clients) {
      if (channels.includes(c.channel) || (c.channel === 'owner' && c.owner)) {
        if (c.channel === 'owner' && !c.owner) continue;
        send(c, msg);
      }
    }
    return msg;
  }
  function toUser(userId, event, data) {
    const msg = { type: 'event', event, data, at: new Date().toISOString(), id: crypto.randomUUID() };
    for (const c of clients) if (c.userId === userId) send(c, msg);
  }
  function toOwners(event, data) {
    const msg = { type: 'event', event, data, at: new Date().toISOString(), id: crypto.randomUUID() };
    for (const c of clients) if (c.channel === 'owner' && c.owner) send(c, msg);
  }
  const summarize = (event, d) => {
    if (event === 'config.updated') return `${d.target} bundle seq ${d.sequence} (${(d.domains || []).map((x) => x.domain).join(', ') || 'rebuild'})`;
    if (event === 'maintenance') return d.active ? 'maintenance on' : 'maintenance off';
    if (event === 'announcements.changed') return `${(d.items || []).length} active`;
    if (event === 'releases.changed') return `releases seq ${d.sequence}`;
    return '';
  };

  /* ---------- state snapshots ---------- */
  const bundleInfo = () => ctx.configService.bundleInfo();
  const maintenance = () => { const s = ctx.settings.get(); return { active: !!s.maintenance, message: s.maintenance ? s.maintenanceMessage : '' }; };
  const announcements = (channel) => ctx.configService.activeAnnouncements(channel === 'website' ? 'website' : 'client');

  function hello(c) {
    send(c, {
      type: 'hello', channel: c.channel, server: ctx.cfg.version, bundles: bundleInfo(), maintenance: maintenance(),
      announcements: c.channel === 'owner' ? [] : announcements(c.channel), heartbeatMs: HEARTBEAT_MS,
    });
  }

  /* ---------- domain events → realtime events ---------- */
  function onAudit(entry) {
    const { action, target, details } = entry;
    try {
      if (action === 'config.published' || action === 'config.rolled_back') {
        const domain = String(target);
        const info = bundleInfo();
        for (const [t, domains] of Object.entries(BUNDLE_TARGETS)) {
          if (!domains.includes(domain)) continue;
          const apply = applyMode(domain);
          broadcast('config.updated', {
            target: t, sequence: info[t] && info[t].sequence, domains: [{ domain, version: details && (details.version || details.newVersion), apply }],
            restartRequired: apply === 'restart', reason: action === 'config.rolled_back' ? 'rollback' : 'publish',
          }, t === 'website' ? ['website'] : ['client']);
        }
      } else if (action === 'bundle.rebuilt') {
        const info = bundleInfo(); const t = String(target);
        if (t === 'releases') broadcast('releases.changed', { sequence: info.releases && info.releases.sequence }, ['client', 'website']);
        else broadcast('config.updated', { target: t, sequence: info[t] && info[t].sequence, domains: [], restartRequired: false, reason: 'rebuild' }, t === 'website' ? ['website'] : ['client']);
      } else if (/^release\.(published|unpublished|updated|deleted)$/.test(action)) {
        const info = bundleInfo();
        broadcast('releases.changed', { sequence: info.releases && info.releases.sequence, action }, ['client', 'website']);
      } else if (/^announcement\./.test(action)) {
        for (const ch of ['client', 'website']) {
          const msg = { type: 'event', event: 'announcements.changed', data: { items: announcements(ch) }, at: new Date().toISOString(), id: crypto.randomUUID() };
          for (const c of clients) if (c.channel === ch) send(c, msg);
        }
        recent.unshift({ event: 'announcements.changed', at: new Date().toISOString(), channels: ['client', 'website'], summary: action });
        toOwners('announcements.changed', { items: announcements('client') });
      } else if (/^news\./.test(action)) {
        broadcast('news.changed', { action, id: target }, ['client', 'website']);
      } else if (action === 'system.settings_updated') {
        broadcast('maintenance', maintenance(), ['client', 'website']);
      }
    } catch (e) { log.warn('realtime mapping failed', { action, error: e.message }); }
    toOwners('audit', { at: entry.at, actor: entry.actor, action, target, details: details || null });
  }
  events.on('audit', onAudit);
  events.on('notification', (n) => toUser(n.userId, 'notification', { type: n.type, title: n.title, body: n.body, link: n.link }));
  events.on('report', (r) => toOwners('report.created', r));
  events.on('feedback', (f) => toOwners('feedback.created', f));

  /* ---------- connections ---------- */
  function authenticate(c, token) {
    if (typeof token !== 'string' || token.length > 200) return send(c, { type: 'auth', ok: false, error: 'invalid token' });
    const r = ctx.sessions.resolve(token);
    if (!r) return send(c, { type: 'auth', ok: false, error: 'session not valid' });
    if (c.channel === 'owner') {
      const ok = r.session.scope === 'owner' && r.user.role === 'owner' && ctx.ownerDevices && ctx.ownerDevices.sessionDeviceActive(r.session, r.user.id);
      if (!ok) { send(c, { type: 'auth', ok: false, error: 'owner session required' }); return c.ws.close(4403, 'owner session required'); }
      c.owner = true; c.userId = null; c.sessionId = r.session.id;
      send(c, { type: 'auth', ok: true, role: 'owner' });
      send(c, { type: 'stats', data: stats() });
      send(c, { type: 'recent', data: recent.slice(0, 50) });
      return;
    }
    if (r.session.scope !== 'user') return send(c, { type: 'auth', ok: false, error: 'user session required' });
    c.userId = r.user.id; c.sessionId = r.session.id;
    send(c, { type: 'auth', ok: true, role: r.user.role, username: r.user.username });
  }

  function onConnection(ws, req, channel) {
    const ip = req.socket.remoteAddress || '?';
    const c = { ws, channel, ip, owner: false, userId: null, alive: true, msgs: [], connectedAt: Date.now(), agent: String(req.headers['user-agent'] || '').slice(0, 120) };
    clients.add(c);
    ws.on('pong', () => { c.alive = true; });
    ws.on('message', (raw) => {
      const t = Date.now();
      c.msgs = c.msgs.filter((x) => t - x < MSG_WINDOW_MS); c.msgs.push(t);
      if (c.msgs.length > MSG_LIMIT) return ws.close(4429, 'too many messages');
      let m; try { m = JSON.parse(String(raw)); } catch { return send(c, { type: 'error', error: 'malformed message' }); }
      if (!m || typeof m.type !== 'string') return;
      if (m.type === 'ping') return send(c, { type: 'pong', at: new Date().toISOString() });
      if (m.type === 'auth') return authenticate(c, m.token);
      if (m.type === 'sync') return hello(c);
      if (m.type === 'stats' && c.owner) return send(c, { type: 'stats', data: stats() });
      send(c, { type: 'error', error: `unknown message type ${m.type}` });
    });
    ws.on('close', () => { clients.delete(c); });
    ws.on('error', () => { clients.delete(c); });
    hello(c);
    if (channel === 'owner') send(c, { type: 'auth-required' });
  }

  function attach(server) {
    wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024, perMessageDeflate: false });
    server.on('upgrade', (req, socket, head) => {
      let url;
      try { url = new URL(req.url, 'http://x'); } catch { return socket.destroy(); }
      if (url.pathname !== '/api/v1/realtime') return socket.destroy();
      const channel = url.searchParams.get('channel') || 'client';
      const ip = req.socket.remoteAddress || '?';
      let fromIp = 0; for (const c of clients) if (c.ip === ip) fromIp++;
      if (!CHANNELS.includes(channel) || fromIp >= MAX_PER_IP || clients.size >= MAX_TOTAL) {
        socket.write('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n'); return socket.destroy();
      }
      const origin = req.headers.origin;
      if (channel === 'owner' && origin) { socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return socket.destroy(); } // owner app connects from the main process (no Origin)
      wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, req, channel));
    });
    heartbeat = setInterval(() => {
      for (const c of clients) {
        if (!c.alive) { try { c.ws.terminate(); } catch {} clients.delete(c); continue; }
        c.alive = false; try { c.ws.ping(); } catch {}
        // owner sessions can be revoked while connected
        if (c.owner && c.sessionId) {
          const s = ctx.db.get('SELECT revoked_at, expires_at FROM sessions WHERE id = ?', c.sessionId);
          if (!s || s.revoked_at || s.expires_at < new Date().toISOString()) c.ws.close(4401, 'owner session ended');
        }
      }
    }, HEARTBEAT_MS);
    heartbeat.unref();
    statsTimer = setInterval(() => {
      const st = JSON.stringify(stats().byChannel);
      if (st !== lastStats) { lastStats = st; toOwners('stats', stats()); }
    }, 5000);
    statsTimer.unref();
    log.info('realtime hub attached at /api/v1/realtime');
  }

  function close() {
    clearInterval(heartbeat); clearInterval(statsTimer);
    for (const c of clients) { try { c.ws.close(1001, 'server shutting down'); } catch {} }
    clients.clear();
    if (wss) wss.close();
  }

  /** Owner REST surface: GET /owner/realtime, POST /owner/realtime/resync */
  function ownerRoutes() {
    const r = express.Router();
    r.get('/realtime', (_req, res) => res.json({
      ...stats(), recent: recent.slice(0, 50),
      connections: [...clients].slice(0, 200).map((c) => ({ channel: c.channel, owner: c.owner, signedIn: !!c.userId, connectedAt: new Date(c.connectedAt).toISOString(), agent: c.agent })),
    }));
    r.post('/realtime/resync', (req, res) => {
      const info = bundleInfo();
      broadcast('config.updated', { target: 'client', sequence: info.client && info.client.sequence, domains: [], restartRequired: false, reason: 'resync' }, ['client']);
      broadcast('config.updated', { target: 'website', sequence: info.website && info.website.sequence, domains: [], restartRequired: false, reason: 'resync' }, ['website']);
      ctx.audit(req, 'realtime.resync', null, { clients: stats().byChannel });
      res.json({ ok: true, notified: stats().byChannel });
    });
    return r;
  }

  return { attach, close, broadcast, toUser, toOwners, stats, ownerRoutes, recent };
}

module.exports = { createRealtime };
