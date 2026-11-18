/* Polaris game preload (body). Built into game.js together with src/common/crosshair.js
 * by scripts/sync-shared.js — edit this file, not game.js.
 *
 * Runs in Electron's isolated world on kirka.io. It only:
 *   - draws overlays (crosshair, HUD readouts, toasts) in a closed shadow root,
 *   - applies CSS (user game CSS, ad slots, optional restyle of supported game UI),
 *   - measures frame pacing with requestAnimationFrame,
 *   - reports whether the game interface is on screen.
 * It never touches game scripts, memory, input, WebSockets, physics or hitboxes.
 */
'use strict';
const { ipcRenderer } = require('electron');
const XH = (typeof PolarisCrosshair !== 'undefined') ? PolarisCrosshair : null;

let cfg = null;
let shadow = null; let hostEl = null; let pageStyle = null;
const els = {};
let ping = null;
const sessionStart = Date.now();

const AD_CSS = '.ad-left,.ad-right,.ad-bottom,.ad-change-weapon,#ad-left,#ad-right,#ad-bottom,#ad-change-weapon,[id^="kirka-io_"],[class*="venatus"],[id*="venatus"]{display:none!important}';
const IN_MATCH_SELECTOR = '.game-interface, .desktop-game-interface';

function mount() {
  if (hostEl && document.documentElement.contains(hostEl)) return;
  hostEl = document.createElement('polaris-overlay');
  hostEl.setAttribute('style', 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483646;contain:strict;');
  shadow = hostEl.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `<style>
    :host{all:initial}
    .x{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)}
    .hud{position:absolute;white-space:nowrap;line-height:1.15;font-variant-numeric:tabular-nums;box-sizing:border-box}
    .hud small{opacity:.6;font-size:.72em;letter-spacing:.08em;margin-left:.35em;text-transform:uppercase}
    .toasts{position:absolute;left:16px;bottom:16px;display:flex;flex-direction:column;gap:6px}
    .toast{font:500 13px/1.3 Satoshi,system-ui,sans-serif;color:#E8EEF6;background:rgba(6,10,19,.88);border-left:2px solid #00D9FF;padding:8px 12px;max-width:360px}
    .toast.warn{border-color:#FFB547}.toast.error{border-color:#FF5A6A}.toast.ok{border-color:#3DDC97}
    .plug{position:absolute;left:16px;top:44px;display:flex;flex-direction:column;gap:3px;font:500 12px/1.2 "JetBrains Mono",monospace;color:#E8EEF6}
    .plug div{background:rgba(6,10,19,.55);padding:3px 6px}
  </style>
  <canvas class="x"></canvas>
  <div class="hud" data-k="fps"></div><div class="hud" data-k="ping"></div><div class="hud" data-k="timer"></div><div class="hud" data-k="clock"></div>
  <div class="plug"></div><div class="toasts"></div>`;
  els.canvas = shadow.querySelector('canvas');
  for (const n of shadow.querySelectorAll('.hud')) els[n.dataset.k] = n;
  els.plug = shadow.querySelector('.plug');
  els.toasts = shadow.querySelector('.toasts');
  document.documentElement.appendChild(hostEl);
  pageStyle = document.getElementById('polaris-game-style') || document.createElement('style');
  pageStyle.id = 'polaris-game-style';
  (document.head || document.documentElement).appendChild(pageStyle);
  apply();
}

const ANCHOR = {
  'top-left': [0, 0], 'top-center': [-50, 0], 'top-right': [-100, 0],
  'center-left': [0, -50], center: [-50, -50], 'center-right': [-100, -50],
  'bottom-left': [0, -100], 'bottom-center': [-50, -100], 'bottom-right': [-100, -100],
};
const fontStack = (f) => (f === 'JetBrains Mono' ? '"JetBrains Mono",ui-monospace,monospace' : `${f === 'system-ui' ? 'system-ui' : `"${f}"`},system-ui,sans-serif`);

function styleHud(node, e) {
  if (!node) return;
  if (!e || !e.visible) { node.style.display = 'none'; return; }
  const [ax, ay] = ANCHOR[e.anchor] || ANCHOR['top-left'];
  Object.assign(node.style, {
    display: 'block', left: `${e.x}%`, top: `${e.y}%`, transform: `translate(${ax}%,${ay}%) scale(${e.scale})`, transformOrigin: `${-ax}% ${-ay}%`,
    opacity: String(e.opacity), color: e.color, background: e.background, font: `600 ${e.fontSize}px/1.15 ${fontStack(e.font)}`,
    textAlign: e.align, padding: `${Math.round(e.padding * 0.6)}px ${e.padding}px`, border: e.borderWidth ? `${e.borderWidth}px solid ${e.borderColor}` : 'none',
  });
}

function gameUiCss(hud) {
  let css = '';
  for (const e of Object.values(hud || {})) {
    if (!e.gameSelector) continue;
    const sel = e.gameSelector;
    if (!e.visible) { css += `${sel}{display:none!important}`; continue; }
    css += `${sel}{opacity:${e.opacity}!important;${e.scale !== 1 ? `zoom:${e.scale}!important;` : ''}${e.color && e.color !== '#FFFFFF' ? `color:${e.color}!important;` : ''}}`;
  }
  return css;
}

function apply() {
  if (!cfg || !shadow) return;
  // page CSS
  let css = '';
  if (cfg.adblockCss) css += AD_CSS;
  if (cfg.hideGameCrosshair) css += '#crosshair-static,.crosshair-static{visibility:hidden!important}';
  const vf = cfg.visualFilter;
  if (vf && vf.enabled) css += `canvas{filter:brightness(${vf.brightness}) contrast(${vf.contrast}) saturate(${vf.saturation})!important}`;
  if (cfg.menuBackground) css += `#app>.background,#app .interface>.background,.home-background{background-image:url("${cfg.menuBackground}")!important;background-size:cover!important;background-position:center!important}`;
  css += gameUiCss(cfg.hud);
  css += `\n/* user game CSS */\n${cfg.css || ''}`;
  if (pageStyle.textContent !== css) pageStyle.textContent = css;
  // HUD
  for (const k of ['fps', 'ping', 'timer', 'clock']) styleHud(els[k], cfg.hud && cfg.hud[k]);
  // plugins
  const lines = Object.values(cfg.plugins || {});
  els.plug.replaceChildren(...lines.map((t) => { const d = document.createElement('div'); d.textContent = t; return d; }));
  // crosshair
  if (XH && cfg.crosshair && cfg.crosshair.enabled) {
    const box = Math.ceil((cfg.crosshair.size + cfg.crosshair.gap + cfg.crosshair.outlineThickness + 6) * 2.6);
    XH.sizeCanvas(els.canvas, box, box);
    els.canvas.style.display = 'block';
    XH.draw(els.canvas.getContext('2d'), cfg.crosshair, performance.now());
  } else if (els.canvas) els.canvas.style.display = 'none';
}

/* ---------------- frame pacing ---------------- */
const deltas = new Float32Array(2000); let di = 0; let dn = 0;
let frames = 0; let windowStart = performance.now(); let last = 0;
function frame(t) {
  if (last) { const d = t - last; deltas[di] = d; di = (di + 1) % deltas.length; dn = Math.min(dn + 1, deltas.length); }
  last = t; frames++;
  if (cfg && cfg.crosshair && XH && XH.isAnimated(cfg.crosshair) && els.canvas) XH.draw(els.canvas.getContext('2d'), cfg.crosshair, t);
  if (t - windowStart >= 1000) {
    const fps = (frames * 1000) / (t - windowStart);
    frames = 0; windowStart = t;
    report(fps);
  }
  requestAnimationFrame(frame);
}
function report(fps) {
  let sum = 0; const arr = Array.from(deltas.subarray(0, dn));
  for (const d of arr) sum += d;
  arr.sort((a, b) => a - b);
  const p99 = arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * 0.99))] : null;
  const m = { fps, frameTime: arr.length ? sum / arr.length : null, frameTimeP99: p99, low1: p99 ? 1000 / p99 : null };
  if (!document.hidden) ipcRenderer.send('game:metrics', m);
  if (els.fps && cfg && cfg.hud && cfg.hud.fps && cfg.hud.fps.visible) els.fps.innerHTML = `${Math.round(fps)}<small>fps</small>`;
}

/* ---------------- clocks, game state ---------------- */
let inMatch = null;
function tick() {
  if (!cfg) return;
  const now = new Date();
  if (els.clock && cfg.hud.clock && cfg.hud.clock.visible) els.clock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (els.timer && cfg.hud.timer && cfg.hud.timer.visible) {
    const s = Math.floor((Date.now() - sessionStart) / 1000);
    els.timer.textContent = `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }
  if (els.ping && cfg.hud.ping && cfg.hud.ping.visible) els.ping.innerHTML = ping == null ? '—<small>rtt</small>' : `${Math.round(ping)}<small>ms rtt</small>`;
  const m = !!document.querySelector(IN_MATCH_SELECTOR);
  if (m !== inMatch) { inMatch = m; ipcRenderer.send('game:state', { inMatch: m, menu: !m }); }
  if (hostEl && !document.documentElement.contains(hostEl)) mount();
}

function toast({ text, level }) {
  if (!els.toasts) return;
  const d = document.createElement('div');
  d.className = `toast ${level || ''}`; d.textContent = text;
  els.toasts.appendChild(d);
  setTimeout(() => d.remove(), 4200);
  while (els.toasts.children.length > 4) els.toasts.firstChild.remove();
}

ipcRenderer.on('game:config', (_e, c) => { cfg = c; apply(); });
ipcRenderer.on('game:toast', (_e, t) => toast(t));
ipcRenderer.on('game:ping', (_e, ms) => { ping = typeof ms === 'number' ? ms : null; });

function boot() {
  mount();
  ipcRenderer.invoke('game:config').then((c) => { cfg = c; apply(); }).catch(() => {});
  requestAnimationFrame(frame);
  setInterval(tick, 1000);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
