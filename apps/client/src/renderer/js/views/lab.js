/* Visual Lab — compare two visual setups side by side (crosshair, colour filter, backdrop)
 * and preview either one live in the running game before keeping it. */
import { h, button, clear, select, range, toggle, field } from '../lib/dom.js';
import { api, store, cfg, updateSettings, toast } from '../lib/store.js';

const clone = (v) => JSON.parse(JSON.stringify(v));
const xhBox = (c) => Math.ceil(2 * (c.size * 1.6 + c.gap + c.thickness + (c.outline ? c.outlineThickness : 0) + c.dotSize) + 8);

export async function render(root) {
  const s = store.settings;
  const original = { crosshair: clone(s.game.crosshair), crosshairPreset: s.game.crosshairPreset, visualFilter: clone(s.game.visualFilter) };
  const variants = {
    A: { label: 'Variant A', source: 'current', crosshair: clone(s.game.crosshair), filter: clone(s.game.visualFilter) },
    B: { label: 'Variant B', source: 'current', crosshair: clone(s.game.crosshair), filter: { ...clone(s.game.visualFilter), enabled: true } },
  };
  let previewing = null; let backdrop = 'scene'; let bgImage = null; let raf = 0;

  const head = h('header.page-head', h('div', h('div.pl-label.page-kicker', 'Try before you keep'), h('h1', 'Visual Lab'),
    h('p', 'Build two variants of your crosshair and colour filter, compare them on the same backdrop and preview one in the running game. Nothing is saved until you choose “Use A” or “Use B”.')));
  const presets = cfg('client.crosshairs').presets;
  const saved = await api('library:list', 'crosshair');
  const backgrounds = (await api('library:list', 'background')).filter((b) => b.mime.startsWith('image/'));
  const sourceOpts = [{ value: 'current', label: 'My current crosshair' }, ...presets.map((p) => ({ value: `preset:${p.id}`, label: p.name })), ...saved.map((i) => ({ value: `lib:${i.id}`, label: `${i.name} (saved)` }))];
  const canvases = { A: h('canvas.lab-canvas'), B: h('canvas.lab-canvas') };
  const panels = { A: h('div.lab-controls'), B: h('div.lab-controls') };
  const status = h('div.small.muted');

  function pick(v, value) {
    v.source = value;
    if (value === 'current') v.crosshair = clone(original.crosshair);
    else if (value.startsWith('preset:')) v.crosshair = clone(presets.find((p) => `preset:${p.id}` === value).crosshair);
    else { const it = saved.find((i) => `lib:${i.id}` === value); if (it && it.meta && it.meta.content) v.crosshair = clone(it.meta.content.crosshair); }
  }

  function paint() {
    cancelAnimationFrame(raf);
    let animated = false;
    for (const k of ['A', 'B']) {
      const cv = canvases[k]; const v = variants[k];
      const w = cv.clientWidth || 420; const hh = cv.clientHeight || 260; const dpr = window.devicePixelRatio || 1;
      cv.width = w * dpr; cv.height = hh * dpr;
      const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const f = v.filter.enabled ? v.filter : { brightness: 1, contrast: 1, saturation: 1 };
      ctx.filter = `brightness(${f.brightness}) contrast(${f.contrast}) saturate(${f.saturation})`;
      if (bgImage) { const r = Math.max(w / bgImage.width, hh / bgImage.height); ctx.drawImage(bgImage, (w - bgImage.width * r) / 2, (hh - bgImage.height * r) / 2, bgImage.width * r, bgImage.height * r); }
      else if (backdrop === 'scene') { ctx.fillStyle = '#86a9c6'; ctx.fillRect(0, 0, w, hh * 0.55); ctx.fillStyle = '#6b6d5d'; ctx.fillRect(0, hh * 0.55, w, hh); ctx.fillStyle = '#8b5a3c'; ctx.fillRect(w * 0.58, hh * 0.3, w * 0.12, hh * 0.26); ctx.fillStyle = '#4f7a46'; ctx.fillRect(w * 0.12, hh * 0.38, w * 0.18, hh * 0.18); }
      else { ctx.fillStyle = { dark: '#0b0f18', light: '#d9dee6' }[backdrop]; ctx.fillRect(0, 0, w, hh); }
      ctx.filter = 'none';
      const box = xhBox(v.crosshair);
      const off = document.createElement('canvas'); window.PolarisCrosshair.sizeCanvas(off, box, box);
      window.PolarisCrosshair.draw(off.getContext('2d'), v.crosshair, performance.now());
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(off, w / 2 - box, hh / 2 - box, box * 2, box * 2);
      if (window.PolarisCrosshair.isAnimated(v.crosshair)) animated = true;
    }
    if (animated && document.documentElement.dataset.motion !== 'off') raf = requestAnimationFrame(paint);
  }

  function controls(k) {
    const v = variants[k];
    const set = (key, val) => { v.filter[key] = val; paint(); if (previewing === k) push(k); };
    clear(panels[k]).append(
      field('Crosshair', select(sourceOpts, v.source, (val) => { pick(v, val); paint(); if (previewing === k) push(k); })),
      h('div.rows', h('div.row', h('div.row-text', h('div.row-title', 'Visual filter')), h('div.row-control', toggle(v.filter.enabled, (val) => set('enabled', val), { label: `Filter ${k}` })))),
      field('Brightness', range(v.filter.brightness, { min: 0.5, max: 1.6, step: 0.02, onInput: (x) => set('brightness', x), format: (x) => x.toFixed(2) })),
      field('Contrast', range(v.filter.contrast, { min: 0.5, max: 1.6, step: 0.02, onInput: (x) => set('contrast', x), format: (x) => x.toFixed(2) })),
      field('Saturation', range(v.filter.saturation, { min: 0, max: 2, step: 0.02, onInput: (x) => set('saturation', x), format: (x) => x.toFixed(2) })),
      field('Size', range(v.crosshair.size, { min: 1, max: 40, step: 1, onInput: (x) => { v.crosshair.size = x; paint(); if (previewing === k) push(k); } })),
      field('Gap', range(v.crosshair.gap, { min: 0, max: 30, step: 1, onInput: (x) => { v.crosshair.gap = x; paint(); if (previewing === k) push(k); } })));
  }

  // Live preview: writes the variant into the active settings so the game overlay updates
  // immediately; leaving the page restores the original unless a variant was kept.
  function push(k) { const v = variants[k]; updateSettings((st) => { st.game.crosshair = clone(v.crosshair); st.game.crosshairPreset = null; st.game.visualFilter = clone(v.filter); }); }
  function restore() { updateSettings((st) => { st.game.crosshair = clone(original.crosshair); st.game.crosshairPreset = original.crosshairPreset; st.game.visualFilter = clone(original.visualFilter); }); }
  function setPreview(k) {
    previewing = previewing === k ? null : k;
    if (previewing) push(previewing); else restore();
    status.textContent = previewing ? `Variant ${previewing} is live in the game overlay (not saved yet).` : 'Preview off — the game shows your saved setup.';
    drawHeads();
  }
  function keep(k) {
    const v = variants[k];
    Object.assign(original, { crosshair: clone(v.crosshair), crosshairPreset: null, visualFilter: clone(v.filter) });
    previewing = null; push(k);
    updateSettings(() => {}, { immediate: true });
    toast(`Variant ${k} is now your setup`, 'ok');
    drawHeads();
  }
  const headA = h('div.lab-head'); const headB = h('div.lab-head');
  function drawHeads() {
    for (const [k, el] of [['A', headA], ['B', headB]]) clear(el).append(h('b', `Variant ${k}`), previewing === k ? h('span.badge.badge-ok', 'Live') : null,
      h('span.grow'), button(previewing === k ? 'Stop preview' : 'Preview in game', () => setPreview(k), { small: true }), button(`Use ${k}`, () => keep(k), { small: true, kind: 'primary' }));
  }

  head.append(h('div.page-actions',
    select([{ value: 'scene', label: 'Backdrop: outdoor scene' }, { value: 'dark', label: 'Backdrop: dark' }, { value: 'light', label: 'Backdrop: light' }, ...backgrounds.map((b) => ({ value: `bg:${b.id}`, label: `Backdrop: ${b.name}` }))], backdrop, (v) => {
      backdrop = v; bgImage = null;
      if (v.startsWith('bg:')) { const b = backgrounds.find((x) => `bg:${x.id}` === v); const img = new Image(); img.onload = () => { bgImage = img; paint(); }; img.src = b.url; }
      paint();
    }),
    button('Swap A and B', () => { [variants.A, variants.B] = [variants.B, variants.A]; controls('A'); controls('B'); paint(); if (previewing) push(previewing); }, { iconName: 'refresh' })));
  root.append(head, h('div.lab-grid',
    h('div.lab-col', headA, canvases.A, panels.A),
    h('div.lab-col', headB, canvases.B, panels.B)), status);
  drawHeads(); controls('A'); controls('B');
  status.textContent = 'Preview off — the game shows your saved setup.';
  requestAnimationFrame(paint);
  const onResize = () => paint();
  window.addEventListener('resize', onResize);
  return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); if (previewing) restore(); };
}
