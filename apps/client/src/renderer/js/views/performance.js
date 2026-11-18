import { h, button, clear, fmt, select, row, toggle } from '../lib/dom.js';
import { api, store, cfg, toast, fail, confirmDialog, subscribe, updateSettings, reloadSettings } from '../lib/store.js';
import { lineChart } from '../lib/charts.js';
import { go } from '../app.js';

const cssv = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const v1 = (v, u = '') => (v == null ? '—' : `${v >= 100 ? Math.round(v) : Math.round(v * 10) / 10}${u}`);

/* Benchmark runs survive view changes (the game view covers the shell while it runs). */
let bench = null;
function startBenchmark(seconds, label) {
  if (bench) return;
  const samples = [];
  bench = { seconds, label, startedAt: Date.now(), samples, outside: 0 };
  const off = subscribe('metrics', (m) => {
    if (m.fps == null) return;
    if (!store.game.inMatch) bench.outside++;
    samples.push(m);
  });
  api('shell:mode', 'play');
  toast(`Benchmark running for ${seconds}s — play normally and keep the game visible`, 'info', 4000);
  bench.timer = setTimeout(async () => {
    off();
    const b = bench; bench = null;
    const fps = samples.map((s) => s.fps);
    const avg = (arr) => (arr.length ? arr.reduce((a, x) => a + x, 0) / arr.length : null);
    const ft = samples.map((s) => s.frameTime).filter((x) => x != null);
    const lows = samples.map((s) => s.low1).filter((x) => x != null);
    try {
      const r = await api('analytics:saveBenchmark', { label: b.label, profile: store.settings.performance.profile, durationSec: seconds, samples: samples.length,
        fpsAvg: avg(fps), fpsMin: fps.length ? Math.min(...fps) : null, low1: avg(lows), frameTimeAvg: avg(ft), cpuAvg: avg(samples.map((s) => s.cpuPercent)), memAvg: avg(samples.map((s) => s.memoryMB)), inMatch: b.outside === 0 && samples.length > 0 });
      toast(`Benchmark saved: ${v1(r.fpsAvg)} FPS average, ${v1(r.low1)} 1% low (${r.samples} samples)`, 'ok', 8000);
    } catch (e) { fail(e); }
  }, seconds * 1000);
}

export async function render(root) {
  const sys = await api('metrics:system').catch(() => null);
  const info = store.info;
  const profiles = cfg('client.performance').profiles;
  const live = h('div.readouts.perf-live');
  const charts = { fps: h('canvas.chart'), ft: h('canvas.chart'), cpu: h('canvas.chart'), mem: h('canvas.chart'), rtt: h('canvas.chart') };
  const procs = h('tbody');
  const benchBox = h('div');
  const flagsChanged = () => info.startupFlags.fpsUnlock !== store.settings.performance.fpsUnlock || info.startupFlags.hardwareAcceleration !== store.settings.performance.hardwareAcceleration;
  const restartNote = h('div');
  const drawRestart = () => clear(restartNote).append(flagsChanged() ? h('div.note.note-warn', 'Frame-rate unlock or hardware acceleration changed. These are Chromium startup switches and apply after a restart. ', button('Restart now', () => api('app:relaunch'), { small: true, kind: 'primary' })) : '');

  root.append(
    h('header.page-head', h('div', h('div.pl-label.page-kicker', 'Measured live'), h('h1', 'Performance Center'), h('p', 'Every value is measured on this computer. FPS appears only while the game view is on screen.')),
      h('div.page-actions', button('Play', () => go('play'), { kind: 'primary', iconName: 'play' }))),
    live,
    h('section.section', h('div.section-head', h('h2', 'Profiles'), h('span.muted.small', 'Changes interface effects and Chromium options. Polaris does not claim an FPS gain until you measure one.')),
      h('div.perf-profiles', profiles.map((p) => h(`button.perf-profile${store.settings.performance.profile === p.id ? '.is-active' : ''}`, { type: 'button', on: { click: async (e) => {
        try {
          const r = await api('profiles:applyPerformance', p.id); await reloadSettings();
          root.querySelectorAll('.perf-profile').forEach((b) => b.classList.toggle('is-active', b === e.currentTarget));
          if (r.restartRequired && await confirmDialog('Restart required', `The ${p.name} profile changes Chromium startup options (frame-rate unlock or hardware acceleration). Restart Polaris now?`, { confirm: 'Restart' })) api('app:relaunch');
          else { toast(`${p.name} profile applied`, 'ok', 2000); drawRestart(); }
        } catch (err) { fail(err); }
      } } }, h('div.perf-profile-name', p.name), h('div.muted.small', p.description)))),
      (drawRestart(), restartNote),
      h('div.rows',
        row('Unlock frame rate', 'Disables VSync and the frame rate limit. Can raise FPS on capable hardware; can increase heat and tearing. Needs restart.', toggle(store.settings.performance.fpsUnlock, (v) => { updateSettings((s) => { s.performance.fpsUnlock = v; }, { immediate: true }); setTimeout(drawRestart, 300); })),
        row('Hardware acceleration', 'Turn off only if the game shows a black screen or graphics glitches. Needs restart.', toggle(store.settings.performance.hardwareAcceleration, (v) => { updateSettings((s) => { s.performance.hardwareAcceleration = v; }, { immediate: true }); setTimeout(drawRestart, 300); })),
        row('Throttle in background', 'Lets Chromium slow timers when the window is hidden. Saves battery.', toggle(store.settings.performance.backgroundThrottling, (v) => updateSettings((s) => { s.performance.backgroundThrottling = v; }))),
        row('Interface animations', 'Transitions in the Polaris interface.', toggle(store.settings.appearance.motion, (v) => updateSettings((s) => { s.appearance.motion = v; }))),
        row('Decorative effects', 'Background images and fine visual details in the shell.', toggle(store.settings.appearance.decorativeEffects, (v) => updateSettings((s) => { s.appearance.decorativeEffects = v; }))),
        row('Animated backgrounds', 'Allow video backgrounds. Uses GPU and CPU while the shell is open.', toggle(store.settings.performance.animatedBackgrounds, (v) => updateSettings((s) => { s.performance.animatedBackgrounds = v; }))))),
    h('div.split.perf-charts',
      h('section.section', h('div.section-head', h('h3', 'Frames per second'), h('span.muted.small', 'average and 1% low')), charts.fps),
      h('section.section', h('div.section-head', h('h3', 'Frame time'), h('span.muted.small', 'ms per frame')), charts.ft)),
    h('div.split.perf-charts',
      h('section.section', h('div.section-head', h('h3', 'CPU'), h('span.muted.small', 'all Polaris processes, % of total')), charts.cpu),
      h('section.section', h('div.section-head', h('h3', 'Memory'), h('span.muted.small', 'MB, all processes and GPU process')), charts.mem)),
    h('section.section', h('div.section-head', h('h3', 'Network latency'), h('span.muted.small', 'HTTP round trip to kirka.io every 10 s — not the in-game server ping')), charts.rtt),
    h('section.section', h('div.section-head', h('h2', 'Benchmark')), benchBox),
    h('div.split',
      h('section.section', h('div.section-head', h('h3', 'This computer')), sys ? h('dl.kv',
        h('dt', 'CPU'), h('dd', `${sys.cpuModel} · ${sys.cores} threads`), h('dt', 'Memory'), h('dd', fmt.bytes(sys.totalMemoryMB * 1048576)), h('dt', 'System'), h('dd', sys.platform),
        h('dt', 'GPU'), h('dd', sys.gpuRenderer || (sys.gpuDevice ? `vendor 0x${sys.gpuDevice.vendorId.toString(16)} device 0x${sys.gpuDevice.deviceId.toString(16)}` : 'unknown')),
        h('dt', 'WebGL'), h('dd', sys.gpuFeatureStatus.webgl || '—'), h('dt', 'Rasterization'), h('dd', sys.gpuFeatureStatus.rasterization || '—'),
        h('dt', 'Electron'), h('dd', `${sys.electron} (Chromium ${sys.chrome})`), h('dt', 'Started with'), h('dd.mono', `fpsUnlock=${info.startupFlags.fpsUnlock} hwAccel=${info.startupFlags.hardwareAcceleration}`)) : h('p.muted', 'Unavailable')),
      h('section.section', h('div.section-head', h('h3', 'Processes')), h('table.table.table-compact', h('thead', h('tr', h('th', 'Process'), h('th.num', 'CPU %'), h('th.num', 'Memory'))), procs))),
    h('p.muted.small', 'GPU utilisation is not shown because Chromium does not expose it to applications. GPU process memory and CPU time are shown instead.'));

  function drawBench() {
    clear(benchBox);
    if (bench) { const left = Math.max(0, Math.ceil(bench.seconds - (Date.now() - bench.startedAt) / 1000)); benchBox.append(h('p', `Running — ${left}s left, ${bench.samples.length} samples so far.`)); return; }
    const label = h('input.input', { value: `${profiles.find((p) => p.id === store.settings.performance.profile)?.name || 'Custom'} run`, maxlength: 60 });
    let secs = 60;
    benchBox.append(h('p.muted.small', 'Join a match first. The benchmark switches to the game view and records FPS, frame time, CPU and memory for the chosen time. Compare results under the same map and conditions.'),
      h('div.inline', label, select([{ value: '30', label: '30 seconds' }, { value: '60', label: '60 seconds' }, { value: '120', label: '2 minutes' }], '60', (v) => { secs = Number(v); }),
        button('Run benchmark', () => { if (!store.game.started) { toast('Start the game and join a match first', 'warn'); return; } startBenchmark(secs, label.value.trim() || 'Benchmark'); drawBench(); }, { kind: 'primary', iconName: 'gauge' }),
        button('Results', () => go('analytics', { tab: 'benchmarks' }), { kind: 'quiet' })));
  }
  drawBench();

  const ro = (label, value, sub) => h('div.readout', h('div.readout-label', label), h('div.readout-value', value), sub ? h('div.readout-sub.muted.small', sub) : null);
  function drawLive(m) {
    clear(live).append(
      ro('FPS', v1(m && m.fps), m && m.fps == null ? 'game not visible' : `1% low ${v1(m && m.low1)}`),
      ro('Frame time', v1(m && m.frameTime, ' ms'), m && m.frameTimeP99 != null ? `p99 ${v1(m.frameTimeP99, ' ms')}` : null),
      ro('CPU', v1(m && m.cpuPercent, '%'), m ? `${v1(m.cpuPercentOneCore, '%')} of one core` : null),
      ro('Memory', m ? `${fmt.num(Math.round(m.memoryMB))} MB` : '—', m && m.gpuMemoryMB != null ? `GPU process ${fmt.num(Math.round(m.gpuMemoryMB))} MB` : null),
      ro('Latency', v1(m && m.rttMs, ' ms'), 'HTTP to kirka.io'));
    if (m) clear(procs).append(...m.processes.slice().sort((a, b) => b.memoryMB - a.memoryMB).slice(0, 8).map((p) => h('tr', h('td', p.type === 'Tab' ? p.name : p.type), h('td.num', v1(p.cpu)), h('td.num', `${fmt.num(p.memoryMB)} MB`))));
  }
  async function drawCharts() {
    const hst = await api('metrics:history');
    const a = cssv('--c-accent'); const b = cssv('--c-accent2'); const c = cssv('--c-accent3');
    lineChart(charts.fps, { series: [{ values: hst.fps, color: a }, { values: hst.low1, color: c }] });
    lineChart(charts.ft, { series: [{ values: hst.frameTime, color: b }], unit: '' });
    lineChart(charts.cpu, { series: [{ values: hst.cpu, color: a }], max: 100 });
    lineChart(charts.mem, { series: [{ values: hst.memory, color: b }, { values: hst.gpuMemory, color: c }] });
    lineChart(charts.rtt, { series: [{ values: hst.rtt, color: a }] });
  }
  drawLive(store.metrics); drawCharts();
  let tick = 0;
  const off = subscribe('metrics', (m) => { drawLive(m); if (++tick % 2 === 0) drawCharts(); if (bench) drawBench(); });
  const onResize = () => drawCharts();
  window.addEventListener('resize', onResize);
  return () => { off(); window.removeEventListener('resize', onResize); };
}
