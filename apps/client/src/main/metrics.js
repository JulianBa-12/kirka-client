'use strict';
/**
 * Performance Center data. Every number here is measured, never estimated:
 *  - FPS / frame time / 1% low: requestAnimationFrame timing inside the game view.
 *  - CPU / memory: Electron's per-process metrics (app.getAppMetrics), summed.
 *  - GPU: the GPU process' own CPU and memory plus Chromium's feature status. Chromium
 *    does not expose GPU utilisation, so Polaris does not show a GPU load percentage.
 *  - Latency: HTTP round-trip time to kirka.io. This is NOT the in-game server ping,
 *    which the game does not expose to clients; the UI labels it accordingly.
 */
const { app } = require('electron');
const os = require('os');

const HISTORY = 300; // seconds
const series = { fps: [], frameTime: [], low1: [], cpu: [], memory: [], gpuMemory: [], rtt: [] };
let lastGame = null; let rtt = null; let rttTimer = null; let sampleTimer = null;
const listeners = [];

function push(key, v) { const a = series[key]; a.push(v == null ? null : Math.round(v * 10) / 10); if (a.length > HISTORY) a.shift(); }

function sample() {
  const metrics = app.getAppMetrics();
  let cpu = 0; let mem = 0; let gpuMem = null; let gpuCpu = null;
  const procs = metrics.map((m) => {
    cpu += m.cpu.percentCPUUsage; mem += m.memory.workingSetSize;
    if (m.type === 'GPU') { gpuMem = m.memory.workingSetSize; gpuCpu = m.cpu.percentCPUUsage; }
    return { pid: m.pid, type: m.type, name: m.name || m.serviceName || m.type, cpu: Math.round(m.cpu.percentCPUUsage * 10) / 10, memoryMB: Math.round(m.memory.workingSetSize / 1024) };
  });
  const fresh = lastGame && Date.now() - lastGame.at < 2500 ? lastGame : null;
  push('fps', fresh ? fresh.fps : null);
  push('frameTime', fresh ? fresh.frameTime : null);
  push('low1', fresh ? fresh.low1 : null);
  push('cpu', cpu / Math.max(1, os.cpus().length));
  push('memory', mem / 1024);
  push('gpuMemory', gpuMem == null ? null : gpuMem / 1024);
  push('rtt', rtt);
  const snap = {
    at: Date.now(),
    fps: fresh ? fresh.fps : null, frameTime: fresh ? fresh.frameTime : null, frameTimeP99: fresh ? fresh.frameTimeP99 : null, low1: fresh ? fresh.low1 : null,
    cpuPercent: cpu / Math.max(1, os.cpus().length), cpuPercentOneCore: cpu, memoryMB: mem / 1024, gpuMemoryMB: gpuMem == null ? null : gpuMem / 1024, gpuCpuPercent: gpuCpu,
    rttMs: rtt, processes: procs,
  };
  for (const fn of listeners) fn(snap);
}

async function measureRtt() {
  const t0 = performance.now();
  try {
    await fetch('https://kirka.io/favicon.ico', { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(5000) });
    rtt = performance.now() - t0;
  } catch { rtt = null; }
  for (const fn of rttListeners) fn(rtt);
}
const rttListeners = [];

function start() {
  if (sampleTimer) return;
  sampleTimer = setInterval(sample, 1000);
  measureRtt(); rttTimer = setInterval(measureRtt, 10000);
}
function stop() { clearInterval(sampleTimer); clearInterval(rttTimer); sampleTimer = rttTimer = null; }

async function systemInfo() {
  let gpu = null;
  try { gpu = await app.getGPUInfo('basic'); } catch {}
  const dev = gpu && gpu.gpuDevice ? gpu.gpuDevice.filter((d) => d.active).concat(gpu.gpuDevice).slice(0, 1)[0] : null;
  return {
    cpuModel: (os.cpus()[0] || {}).model || 'unknown', cores: os.cpus().length, totalMemoryMB: Math.round(os.totalmem() / 1048576),
    platform: `${os.type()} ${os.release()} (${process.arch})`,
    electron: process.versions.electron, chrome: process.versions.chrome,
    gpuFeatureStatus: app.getGPUFeatureStatus(),
    gpuDevice: dev ? { vendorId: dev.vendorId, deviceId: dev.deviceId, driver: dev.driverVendor || null } : null,
    gpuRenderer: gpu && gpu.auxAttributes ? gpu.auxAttributes.glRenderer || null : null,
  };
}

module.exports = {
  start, stop, systemInfo,
  onSample: (fn) => listeners.push(fn), onRtt: (fn) => rttListeners.push(fn),
  setGameMetrics: (m) => { lastGame = m; },
  history: () => series,
};
