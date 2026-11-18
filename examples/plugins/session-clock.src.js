// Session clock — example Polaris plugin.
// Shows how long the current session has lasted, the measured FPS, and mirrors a short
// line on the in-game overlay. Uses only: ui.panel, storage, hud.overlay, game.events.
const root = polaris.root;
const started = Date.now();
let fps = null;
let best = 0;

const title = document.createElement('div');
title.style.cssText = 'font-weight:600;margin-bottom:6px';
title.textContent = 'Session clock';
const line = document.createElement('div');
line.style.cssText = 'font:22px/1.2 ui-monospace,monospace';
const sub = document.createElement('div');
sub.style.cssText = 'opacity:.65;margin-top:4px';
root.append(title, line, sub);

polaris.storage.get('bestFps').then((v) => { if (typeof v === 'number') best = v; });

polaris.on('metrics', (m) => {
  fps = m && typeof m.fps === 'number' ? m.fps : null;
  if (fps && fps > best) { best = Math.round(fps); polaris.storage.set('bestFps', best); }
});
polaris.on('match', (m) => { if (m && m.started) polaris.notify('Match started — good luck'); });

function tick() {
  const s = Math.floor((Date.now() - started) / 1000);
  const t = `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  line.textContent = t;
  sub.textContent = `${fps == null ? 'FPS not measured yet' : `${Math.round(fps)} fps now`} · best ${best || '—'}`;
  polaris.hud.set(`⏱ ${t}`);
}
tick();
setInterval(tick, 1000);
