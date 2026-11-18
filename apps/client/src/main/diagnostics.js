'use strict';
/**
 * Diagnostics — real checks of the things that commonly go wrong. Every check reports
 * ok / warn / fail / skip with the observed value; nothing is assumed.
 */
const fs = require('fs');
const { app } = require('electron');
const { P, log } = require('./core');
const state = require('./state');
const remote = require('./remote');
const server = require('./server');
const metrics = require('./metrics');
const { verifyEnvelope } = require('../shared/utilities/signing');

const semver = (v) => String(v || '0.0.0').split('.').map((x) => parseInt(x, 10) || 0);
const lt = (a, b) => { const x = semver(a); const y = semver(b); for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] < y[i]; } return false; };

async function timed(url, timeoutMs = 8000) {
  const t0 = Date.now();
  const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(timeoutMs), headers: { 'Cache-Control': 'no-cache', 'User-Agent': `PolarisClient/${app.getVersion()}` } });
  return { status: res.status, ms: Date.now() - t0, res };
}

async function run({ realtime, game } = {}) {
  const out = [];
  const add = (id, group, label, status, detail, fix = null) => out.push({ id, group, label, status, detail, fix });
  const s = state.settings.get();

  // ---- network
  try { const r = await timed('https://kirka.io/'); add('kirka', 'Network', 'Kirka.io reachable', r.status < 500 ? 'ok' : 'warn', `HTTP ${r.status} in ${r.ms} ms`); }
  catch (e) { add('kirka', 'Network', 'Kirka.io reachable', 'fail', e.cause ? e.cause.code || e.message : e.message, 'Check your internet connection or firewall.'); }

  const mirror = (s.advanced.mirrorUrl || '').replace(/\/+$/, '');
  if (mirror) {
    try {
      const r = await timed(`${mirror}/client-bundle.json`);
      if (r.status !== 200) add('mirror', 'Network', 'Configuration mirror', 'fail', `HTTP ${r.status} from ${mirror}`);
      else {
        const env = await r.res.json();
        try { const p = verifyEnvelope(env, remote.TRUST); add('mirror', 'Network', 'Configuration mirror', 'ok', `Signed bundle #${p.sequence} (key ${env.keyId}) in ${r.ms} ms`); }
        catch (e) { add('mirror', 'Network', 'Configuration mirror', 'fail', `Signature check failed: ${e.message}`, 'Update Polaris — the mirror is signed with a key this version does not trust.'); }
      }
    } catch (e) { add('mirror', 'Network', 'Configuration mirror', 'fail', e.message); }
  } else add('mirror', 'Network', 'Configuration mirror', 'skip', 'No mirror URL set (Settings → Advanced)');

  if (server.base()) {
    try {
      const r = await timed(`${server.base()}/api/v1/health`);
      const j = await r.res.json().catch(() => ({}));
      add('server', 'Network', 'Polaris server', r.status === 200 ? 'ok' : 'fail', `HTTP ${r.status} in ${r.ms} ms${j.version ? ` · server ${j.version}` : ''}`);
    } catch (e) { add('server', 'Network', 'Polaris server', 'fail', e.message, 'Check the server URL in Settings → Account.'); }
    add('session', 'Network', 'Signed in', server.signedIn ? 'ok' : 'warn', server.signedIn ? `as ${(server.me && server.me.username) || s.account.username || 'user'}` : 'Not signed in — social, cloud and uploads are unavailable');
  } else {
    add('server', 'Network', 'Polaris server', 'skip', 'No server configured — community features are off, configuration comes from the signed mirror');
  }
  if (realtime) {
    const st = realtime.status();
    add('realtime', 'Network', 'Live updates', st.state === 'connected' ? 'ok' : st.state === 'off' ? 'skip' : 'warn', st.state === 'connected' ? `Connected to ${st.url}${st.authenticated ? ' (signed in)' : ''} · ${st.events} events` : `${st.state}${st.reason ? ` — ${st.reason}` : ''}`);
  }

  // ---- configuration
  const cur = remote.current;
  add('config', 'Configuration', 'Active configuration', cur.source === 'defaults' ? 'warn' : 'ok', `${cur.source} · sequence ${cur.sequence}${cur.issuedAt ? ` · issued ${cur.issuedAt}` : ''}`, cur.source === 'defaults' ? 'The client has never received a signed configuration. Check the network checks above.' : null);
  if (cur.rejected && cur.rejected.length) add('config-rejected', 'Configuration', 'Rejected sections', 'warn', cur.rejected.map((r) => r.domain).join(', '));
  const rs = remote.status.client;
  if (rs && !rs.ok) add('config-refresh', 'Configuration', 'Last refresh', 'warn', (rs.errors || []).join(' · ') || 'failed');

  // ---- version
  try {
    const upd = remote.current.config['client.updates'];
    const min = upd && upd.minimumVersion;
    if (min) add('version', 'Updates', 'Minimum version', lt(app.getVersion(), min) ? 'fail' : 'ok', `This is ${app.getVersion()}, minimum required ${min}`, lt(app.getVersion(), min) ? 'Open Updates and install the latest version.' : null);
    else add('version', 'Updates', 'Installed version', 'ok', `${app.getVersion()}${process.env.APPIMAGE ? ' (AppImage)' : app.isPackaged ? '' : ' (development)'}`);
  } catch (e) { add('version', 'Updates', 'Version', 'warn', e.message); }

  // ---- system
  try {
    const sys = await metrics.systemInfo();
    const g = sys.gpuFeatureStatus || {};
    const accel = g.webgl === 'enabled' || g.webgl2 === 'enabled' || /enabled/.test(String(g.gpu_compositing));
    add('gpu', 'System', 'GPU acceleration', accel ? 'ok' : 'warn', `WebGL: ${g.webgl || '?'} · WebGL2: ${g.webgl2 || '?'} · compositing: ${g.gpu_compositing || '?'}${sys.gpuRenderer ? ` · ${sys.gpuRenderer}` : ''}`, accel ? null : 'Enable hardware acceleration in Performance and restart. On Linux, check your GPU driver.');
    add('memory', 'System', 'Memory', sys.totalMemoryMB < 4096 ? 'warn' : 'ok', `${sys.totalMemoryMB} MB total · ${sys.cores} CPU threads`, sys.totalMemoryMB < 4096 ? 'Use the "Low-end" performance profile.' : null);
    const flags = s.performance;
    add('fps', 'System', 'Frame limiter', flags.fpsUnlock ? 'ok' : 'warn', flags.fpsUnlock ? 'Unlocked (vsync off)' : 'Locked to display refresh rate');
  } catch (e) { add('gpu', 'System', 'GPU', 'warn', e.message); }

  // ---- storage
  try {
    const st = fs.statfsSync ? fs.statfsSync(P.root) : null;
    if (st) { const freeMB = Math.round((st.bavail * st.bsize) / 1048576); add('disk', 'Storage', 'Free disk space', freeMB < 1024 ? 'warn' : 'ok', `${freeMB} MB free in ${P.root}`, freeMB < 1024 ? 'Replays need disk space. Delete old recordings in Replay Studio.' : null); }
    fs.accessSync(P.data, fs.constants.W_OK);
    add('data', 'Storage', 'Data folder writable', 'ok', P.data);
  } catch (e) { add('data', 'Storage', 'Data folder writable', 'fail', e.message); }

  // ---- game
  if (game) {
    const g = game.stats ? game.stats() : {};
    add('game', 'Game', 'Game view', game.isStarted() ? 'ok' : 'skip', game.isStarted() ? `Running${g.swapped != null ? ` · ${g.swapped} resource swaps` : ''}${g.blocked != null ? ` · ${g.blocked} requests blocked` : ''}` : 'Not started in this session');
  }

  // ---- logs
  const errors = log.entries(1000).filter((e) => e.level === 'error');
  add('logs', 'Logs', 'Errors in this session', errors.length ? 'warn' : 'ok', errors.length ? `${errors.length} error(s) — latest: ${errors[0].msg}` : 'No errors logged');

  const summary = { ok: out.filter((c) => c.status === 'ok').length, warn: out.filter((c) => c.status === 'warn').length, fail: out.filter((c) => c.status === 'fail').length, skip: out.filter((c) => c.status === 'skip').length };
  return { at: new Date().toISOString(), version: app.getVersion(), checks: out, summary };
}

/** A plain-text report that the user can attach to a bug report. No tokens or install id. */
function report(result) {
  const lines = [`Polaris Client diagnostics — ${result.at}`, `Version ${result.version} · Electron ${process.versions.electron} · ${process.platform}/${process.arch}`, ''];
  let group = null;
  for (const c of result.checks) {
    if (c.group !== group) { group = c.group; lines.push(`## ${group}`); }
    lines.push(`[${c.status.toUpperCase().padEnd(4)}] ${c.label}: ${c.detail}${c.fix ? `\n       → ${c.fix}` : ''}`);
  }
  lines.push('', '## Recent log (last 80 entries)');
  for (const e of log.entries(80).reverse()) lines.push(`${e.at} ${e.level.toUpperCase()} ${e.msg}${e.meta ? ` ${JSON.stringify(e.meta).slice(0, 300)}` : ''}`);
  return lines.join('\n').replace(/Bearer [\w.-]+/g, 'Bearer ***');
}

module.exports = { run, report, lt };
