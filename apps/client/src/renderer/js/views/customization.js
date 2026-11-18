import { h, icon, button, clear, row, toggle, select, range, color, tabs, sectionHead, field, empty, fmt, debounce } from '../lib/dom.js';
import { api, store, cfg, flag, updateSettings, toast, fail, confirmDialog, promptDialog, modal as m } from '../lib/store.js';
import { go } from '../app.js';

const clone = (v) => JSON.parse(JSON.stringify(v));

export async function render(root, params = {}) {
  const TABS = [
    { id: 'crosshair', label: 'Crosshair', flag: 'crosshairStudio' },
    { id: 'hud', label: 'HUD Editor', flag: 'hudEditor' },
    { id: 'backgrounds', label: 'Backgrounds', flag: 'backgroundStudio' },
    { id: 'themes', label: 'Themes' },
    { id: 'gamecss', label: 'Game style' },
  ].filter((t) => !t.flag || flag(t.flag).visible);
  let tab = TABS.some((t) => t.id === params.tab) ? params.tab : TABS[0].id;
  let cleanupTab = null;
  const body = h('div');
  const head = h('header.page-head', h('div', h('div.pl-label.page-kicker', 'Look and feel'), h('h1', 'Customization'), h('p', 'Overlays and styles Polaris adds around Kirka.io. Nothing here changes gameplay, hit registration or what other players see.')));
  const bar = h('div');
  const draw = async () => {
    if (cleanupTab) { cleanupTab(); cleanupTab = null; }
    clear(bar).appendChild(tabs(TABS.map((t) => ({ ...t, badge: t.flag && !flag(t.flag).enabled ? 'Off' : null })), tab, (id) => { tab = id; draw(); }));
    clear(body);
    const t = TABS.find((x) => x.id === tab);
    if (t.flag && !flag(t.flag).enabled) { body.appendChild(h('div.note.note-warn', `${flag(t.flag).label} is turned off by the Polaris team right now.`)); return; }
    cleanupTab = (await PANES[tab](body)) || null;
  };
  root.append(head, bar, body);
  await draw();
  return () => { if (cleanupTab) cleanupTab(); };
}

/* ================= Crosshair Studio ================= */
async function crosshairPane(root) {
  const presets = cfg('client.crosshairs').presets;
  const saved = await api('library:list', 'crosshair');
  let c = clone(store.settings.game.crosshair);
  const preview = h('canvas.xh-canvas');
  const bgSel = { value: 'scene' };
  let raf = 0;
  const paint = () => {
    const ctx = preview.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = preview.clientWidth; const hh = preview.clientHeight;
    preview.width = w * dpr; preview.height = hh * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bgs = { scene: null, dark: '#0b0f18', light: '#d9dee6', green: '#3e5f3a' };
    if (bgs[bgSel.value]) { ctx.fillStyle = bgs[bgSel.value]; ctx.fillRect(0, 0, w, hh); }
    else { const g = ctx.createLinearGradient(0, 0, 0, hh); g.addColorStop(0, '#7fa7c9'); g.addColorStop(0.55, '#c9d6df'); g.addColorStop(0.56, '#6d6f5f'); g.addColorStop(1, '#3d3f36'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, hh); ctx.fillStyle = '#8b5a3c'; ctx.fillRect(w * 0.58, hh * 0.3, w * 0.12, hh * 0.26); }
    ctx.save(); ctx.translate(w / 2, hh / 2); ctx.scale(2, 2);
    const box = xhBox(c);
    const off = document.createElement('canvas'); window.PolarisCrosshair.sizeCanvas(off, box, box); window.PolarisCrosshair.draw(off.getContext('2d'), c, performance.now() / 1000);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, -box / 2, -box / 2, box, box);
    ctx.restore();
    if (window.PolarisCrosshair.isAnimated(c) && document.documentElement.dataset.motion !== 'off') raf = requestAnimationFrame(paint);
  };
  const save = debounce(() => updateSettings((s) => { s.game.crosshair = clone(c); s.game.crosshairPreset = null; }), 150);
  const set = (k, v) => { c[k] = v; cancelAnimationFrame(raf); paint(); save(); };

  const controls = h('div.rows');
  const drawControls = () => {
    clear(controls).append(
      row('Shape', null, select(['cross', 'dot', 'circle', 'square', 'star', 'chevron', 'x'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })), c.shape, (v) => set('shape', v))),
      row('Color', null, color(c.color, (v) => set('color', v))),
      row('Size', null, range(c.size, { min: 1, max: 64, step: 1, onInput: (v) => set('size', v) })),
      row('Thickness', null, range(c.thickness, { min: 0.5, max: 16, step: 0.5, onInput: (v) => set('thickness', v) })),
      row('Gap', null, range(c.gap, { min: 0, max: 40, step: 1, onInput: (v) => set('gap', v) })),
      row('Opacity', null, range(c.opacity, { min: 0, max: 1, step: 0.05, onInput: (v) => set('opacity', v), format: (v) => `${Math.round(v * 100)}%` })),
      row('Rotation', null, range(c.rotation, { min: 0, max: 360, step: 5, onInput: (v) => set('rotation', v), format: (v) => `${v}°` })),
      row('T-style', 'Removes the top arm (cross shape).', toggle(c.tStyle, (v) => set('tStyle', v))),
      row('Outline', null, h('span.inline', toggle(c.outline, (v) => set('outline', v)), color(c.outlineColor, (v) => set('outlineColor', v)), range(c.outlineThickness, { min: 0, max: 6, step: 0.5, onInput: (v) => set('outlineThickness', v) }))),
      row('Center dot', null, h('span.inline', toggle(c.dot, (v) => set('dot', v)), color(c.dotColor, (v) => set('dotColor', v)), range(c.dotSize, { min: 0.5, max: 16, step: 0.5, onInput: (v) => set('dotSize', v) }))),
      row('Animation', 'Animated crosshairs respect the “reduce motion” setting.', h('span.inline', select([{ value: 'none', label: 'None' }, { value: 'pulse', label: 'Pulse' }, { value: 'spin', label: 'Spin' }, { value: 'breathe', label: 'Breathe' }], c.animation, (v) => { c.style = v === 'none' ? 'static' : 'animated'; set('animation', v); }),
        range(c.animationSpeed, { min: 0.1, max: 5, step: 0.1, onInput: (v) => set('animationSpeed', v), format: (v) => `${v.toFixed(1)}×` }))));
  };
  drawControls();
  const load = (x) => { c = clone(x); drawControls(); cancelAnimationFrame(raf); paint(); save(); };

  const presetList = h('div.preset-list',
    presets.map((p) => h(`button.preset${store.settings.game.crosshairPreset === p.id ? '.is-active' : ''}`, { type: 'button', on: { click: () => { load(p.crosshair); updateSettings((s) => { s.game.crosshairPreset = p.id; }); } } }, miniCrosshair(p.crosshair), h('span', p.name))),
    saved.map((it) => h('div.preset-wrap', h('button.preset', { type: 'button', on: { click: () => load(it.meta.content.crosshair) } }, miniCrosshair(it.meta.content.crosshair), h('span', it.name)),
      button('', async () => { if (await confirmDialog('Delete crosshair', `Delete “${it.name}”?`, { danger: true, confirm: 'Delete' })) { await api('library:remove', it.id); go('customization', { tab: 'crosshair' }); } }, { iconName: 'trash', small: true, kind: 'quiet', title: 'Delete' }))));

  root.append(h('div.split',
    h('div',
      h('div.xh-stage.frame', preview, h('div.xh-bg', select([{ value: 'scene', label: 'Scene' }, { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'green', label: 'Foliage' }], 'scene', (v) => { bgSel.value = v; paint(); }))),
      h('div.inline.xh-actions',
        h('span.inline', toggle(store.settings.game.crosshairEnabled, (v) => updateSettings((s) => { s.game.crosshairEnabled = v; })), h('span', 'Show in game')),
        h('span.grow'),
        button('Save as…', async () => {
          const name = await promptDialog('Save crosshair', 'Name', 'My crosshair', { maxlength: 40 });
          if (!name) return;
          const doc = { format: 'polaris-crosshair/1', name, crosshair: c };
          try { await api('library:add', { kind: 'crosshair', name, data: new TextEncoder().encode(JSON.stringify(doc)), source: 'studio' }); toast('Crosshair saved to your library', 'ok'); go('customization', { tab: 'crosshair' }); } catch (e) { fail(e); }
        }, { iconName: 'plus', small: true }),
        button('Import', async () => { try { const r = await api('library:import', 'crosshair'); if (r.errors.length) toast(r.errors.join('\n'), 'error'); if (r.added.length) go('customization', { tab: 'crosshair' }); } catch (e) { fail(e); } }, { iconName: 'upload', small: true }),
        button('Export', async () => { const f = await api('dialog:saveData', 'crosshair.polaris-crosshair.json', JSON.stringify({ format: 'polaris-crosshair/1', name: 'Exported crosshair', crosshair: c }, null, 2)); if (f) toast(`Exported to ${f}`, 'ok'); }, { iconName: 'download', small: true }),
        button('Copy code', async () => { await api('app:copy', btoa(JSON.stringify(c))); toast('Crosshair code copied', 'ok'); }, { iconName: 'copy', small: true }),
        button('Paste code', async () => {
          const code = await promptDialog('Paste crosshair code', 'Code', '', { maxlength: 4000 });
          if (!code) return;
          try { const x = JSON.parse(atob(code)); load({ ...store.settings.game.crosshair, ...x }); } catch { toast('That is not a valid crosshair code', 'error'); }
        }, { small: true })),
      h('section.section', sectionHead('Presets', null), presetList)),
    h('aside', controls)));
  requestAnimationFrame(paint);
  return () => cancelAnimationFrame(raf);
}

const xhBox = (c) => Math.ceil(2 * (c.size * 1.6 + c.gap + c.thickness + (c.outline ? c.outlineThickness : 0) + c.dotSize) + 8);

function miniCrosshair(cx) {
  const cv = document.createElement('canvas');
  cv.className = 'mini-xh';
  try { const c2 = { ...cx, size: Math.min(cx.size, 12), gap: Math.min(cx.gap, 6) }; window.PolarisCrosshair.sizeCanvas(cv, 40, 40); window.PolarisCrosshair.draw(cv.getContext('2d'), c2, 0); } catch {}
  return cv;
}

/* ================= HUD Editor ================= */
async function hudPane(root) {
  const presets = cfg('client.hud').presets;
  const saved = await api('library:list', 'hud');
  const base = () => (presets.find((p) => p.id === store.settings.game.hudPreset) || presets[0]).elements;
  let els = clone(store.settings.game.hudCustom || base());
  let selected = Object.keys(els)[0];
  const stage = h('div.hud-stage.frame', h('div.hud-stage-hint.muted', 'Drag elements to position them. Positions are percentages of the game view.'));
  const inspector = h('div');
  const save = debounce(() => updateSettings((s) => { s.game.hudCustom = clone(els); }), 200);

  const sample = { fps: '144 FPS', ping: '38 ms', timer: '12:04', clock: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), killfeed: 'Player ✕ Player', scoreboard: 'Scoreboard', weapon: '30 / 90' };
  const ANCHOR = { 'top-left': [0, 0], 'top-center': [-50, 0], 'top-right': [-100, 0], 'center-left': [0, -50], center: [-50, -50], 'center-right': [-100, -50], 'bottom-left': [0, -100], 'bottom-center': [-50, -100], 'bottom-right': [-100, -100] };

  const drawStage = () => {
    for (const n of [...stage.querySelectorAll('.hud-el')]) n.remove();
    for (const [k, e] of Object.entries(els)) {
      const [tx, ty] = ANCHOR[e.anchor] || [0, 0];
      const el = h(`div.hud-el${k === selected ? '.is-selected' : ''}${e.visible ? '' : '.is-hidden'}${e.gameSelector ? '.is-game' : ''}`, {
        style: { left: `${e.x}%`, top: `${e.y}%`, transform: `translate(${tx}%, ${ty}%) scale(${e.scale})`, color: e.color, background: e.background, opacity: e.visible ? e.opacity : 0.25, fontSize: `${e.fontSize}px`, fontFamily: `'${e.font}', sans-serif`, padding: `${e.padding}px`, border: `${e.borderWidth}px solid ${e.borderColor}`, textAlign: e.align },
        dataset: { k },
      }, sample[k] || e.label);
      el.addEventListener('pointerdown', (ev) => startDrag(ev, k, el));
      stage.appendChild(el);
    }
  };
  const startDrag = (ev, k, el) => {
    selected = k; drawInspector();
    for (const n of stage.querySelectorAll('.hud-el')) n.classList.toggle('is-selected', n.dataset.k === k);
    const rect = stage.getBoundingClientRect();
    el.setPointerCapture(ev.pointerId);
    const move = (e) => {
      const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
      const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
      els[k].x = Math.round(x * 10) / 10; els[k].y = Math.round(y * 10) / 10;
      el.style.left = `${els[k].x}%`; el.style.top = `${els[k].y}%`;
    };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); save(); drawInspector(); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
  };
  const drawInspector = () => {
    const e = els[selected];
    if (!e) { clear(inspector); return; }
    const set = (k, v) => { e[k] = v; drawStage(); save(); };
    clear(inspector).append(
      h('div.pl-label.muted', 'Element'),
      h('div.hud-el-list', Object.entries(els).map(([k, x]) => h(`button.chip${k === selected ? '.is-active' : ''}`, { type: 'button', on: { click: () => { selected = k; drawStage(); drawInspector(); } } }, x.label || k))),
      e.gameSelector ? h('p.muted.small', 'This element restyles part of Kirka’s own interface. It only works if the game still uses the expected page structure.') : null,
      h('div.rows',
        row('Visible', null, toggle(e.visible, (v) => set('visible', v))),
        row('Position', null, h('span.mono.muted', `${e.x}% · ${e.y}%`)),
        row('Anchor', null, select(Object.keys(ANCHOR), e.anchor, (v) => set('anchor', v))),
        row('Scale', null, range(e.scale, { min: 0.25, max: 4, step: 0.05, onInput: (v) => set('scale', v), format: (v) => `${v.toFixed(2)}×` })),
        row('Opacity', null, range(e.opacity, { min: 0, max: 1, step: 0.05, onInput: (v) => set('opacity', v), format: (v) => `${Math.round(v * 100)}%` })),
        row('Text', null, color(e.color, (v) => set('color', v))),
        row('Background', null, color(e.background, (v) => set('background', v))),
        row('Border', null, h('span.inline', color(e.borderColor, (v) => set('borderColor', v)), range(e.borderWidth, { min: 0, max: 6, step: 1, onInput: (v) => set('borderWidth', v) }))),
        row('Font', null, select(['JetBrains Mono', 'Satoshi', 'system-ui', 'Arial'], e.font, (v) => set('font', v))),
        row('Size', null, range(e.fontSize, { min: 8, max: 48, step: 1, onInput: (v) => set('fontSize', v), format: (v) => `${v}px` })),
        row('Padding', null, range(e.padding, { min: 0, max: 40, step: 1, onInput: (v) => set('padding', v) })),
        row('Align', null, select(['left', 'center', 'right'], e.align, (v) => set('align', v)))));
  };
  drawStage(); drawInspector();

  const presetBar = h('div.inline',
    h('span.pl-label.muted', 'Preset'),
    select([...presets.map((p) => ({ value: `p:${p.id}`, label: p.name })), ...saved.map((s) => ({ value: `s:${s.id}`, label: `${s.name} (saved)` }))], store.settings.game.hudCustom ? '' : `p:${store.settings.game.hudPreset}`, (v) => {
      if (v.startsWith('p:')) { const id = v.slice(2); els = clone(presets.find((p) => p.id === id).elements); updateSettings((s) => { s.game.hudPreset = id; s.game.hudCustom = null; }); }
      else { const it = saved.find((s) => s.id === v.slice(2)); els = clone(it.meta.content.elements); save(); }
      selected = Object.keys(els)[0]; drawStage(); drawInspector();
    }),
    h('span.grow'),
    button('Reset to preset', () => { els = clone(base()); updateSettings((s) => { s.game.hudCustom = null; }); drawStage(); drawInspector(); }, { small: true, iconName: 'undo' }),
    button('Save as…', async () => {
      const name = await promptDialog('Save HUD layout', 'Name', 'My HUD', { maxlength: 40 });
      if (!name) return;
      try { await api('library:add', { kind: 'hud', name, data: new TextEncoder().encode(JSON.stringify({ format: 'polaris-hud/1', name, elements: els })), source: 'studio' }); toast('HUD layout saved', 'ok'); go('customization', { tab: 'hud' }); } catch (e) { fail(e); }
    }, { small: true, iconName: 'plus' }),
    button('Import', async () => { const r = await api('library:import', 'hud'); if (r.errors.length) toast(r.errors.join('\n'), 'error'); if (r.added.length) go('customization', { tab: 'hud' }); }, { small: true, iconName: 'upload' }),
    button('Export', async () => { const f = await api('dialog:saveData', 'hud.polaris-hud.json', JSON.stringify({ format: 'polaris-hud/1', name: 'Exported HUD', elements: els }, null, 2)); if (f) toast(`Exported to ${f}`, 'ok'); }, { small: true, iconName: 'download' }));

  root.append(presetBar, h('div.split.hud-split', stage, h('aside', inspector)));
}

/* ================= Background Studio ================= */
async function backgroundsPane(root) {
  const limit = Math.min(50, cfg('client.backgrounds').queueLimit || 50);
  const draw = async () => {
    const items = await api('library:list', 'background');
    const s = store.settings;
    clear(root);
    const queue = s.backgrounds.queue;
    root.append(
      h('div.note', h('b', 'Backgrounds are shown behind the Polaris interface'), ' and, if enabled on the Play page, behind Kirka’s main menu. Animated backgrounds (GIF, WebM, MP4) only play when “Animated backgrounds” is on in Settings → Performance.'),
      h('div.inline',
        button('Add images or videos', async () => { const r = await api('library:import', 'background'); if (r.errors.length) toast(r.errors.join('\n'), 'error', 8000); if (r.added.length) toast(`${r.added.length} background(s) added`, 'ok'); draw(); }, { kind: 'primary', iconName: 'plus' }),
        h('span.grow'),
        h('span.inline', toggle(s.appearance.shellBackground, (v) => updateSettings((st) => { st.appearance.shellBackground = v; })), h('span.small', 'Show behind interface')),
        h('span.inline', toggle(s.backgrounds.rotation.enabled, (v) => updateSettings((st) => { st.backgrounds.rotation.enabled = v; })), h('span.small', 'Rotate queue')),
        select([1, 5, 10, 15, 30, 60, 120].map((m) => ({ value: String(m), label: `every ${m} min` })), String(s.backgrounds.rotation.intervalMinutes), (v) => updateSettings((st) => { st.backgrounds.rotation.intervalMinutes = Number(v); })),
        select([{ value: 'random', label: 'Random order' }, { value: 'seq', label: 'In order' }], s.backgrounds.rotation.random ? 'random' : 'seq', (v) => updateSettings((st) => { st.backgrounds.rotation.random = v === 'random'; }))),
      h('section.section', sectionHead('Queue', `${queue.length} of ${limit}`, queue.length ? button('Clear queue', () => { updateSettings((st) => { st.backgrounds.queue = []; }); draw(); }, { small: true, kind: 'quiet' }) : null),
        queue.length ? h('ol.bg-queue', queue.map((id, i) => {
          const it = items.find((x) => x.id === id);
          if (!it) return null;
          return h('li.bg-qitem', h('span.mono.muted', String(i + 1).padStart(2, '0')), thumb(it), h('span.grow', it.name),
            button('', () => { updateSettings((st) => { const q = st.backgrounds.queue; if (i > 0) [q[i - 1], q[i]] = [q[i], q[i - 1]]; }); draw(); }, { iconName: 'rotate', small: true, kind: 'quiet', title: 'Move up', disabled: i === 0 }),
            button('', () => { updateSettings((st) => { st.backgrounds.queue = st.backgrounds.queue.filter((x) => x !== id); }); draw(); }, { iconName: 'minus', small: true, kind: 'quiet', title: 'Remove from queue' }));
        })) : h('p.muted.small', 'Add backgrounds to the queue to rotate between them.')),
      h('section.section', sectionHead('Library', `${items.length} item(s)`),
        items.length ? h('div.bg-grid', items.map((it) => h(`figure.bg-item${s.backgrounds.currentId === it.id ? '.is-current' : ''}`,
          h('button.bg-preview', { type: 'button', title: 'Use now', on: { click: () => { updateSettings((st) => { st.backgrounds.currentId = it.id; }); draw(); } } }, thumb(it, true)),
          h('figcaption', h('span.bg-name', it.name), h('span.muted.mono.small', `${it.mime.split('/')[1]} · ${fmt.bytes(it.size)}`)),
          h('div.bg-actions',
            button(queue.includes(it.id) ? 'Queued' : 'Queue', () => {
              if (queue.includes(it.id)) return;
              if (queue.length >= limit) { toast(`The queue holds at most ${limit} backgrounds`, 'warn'); return; }
              updateSettings((st) => { st.backgrounds.queue = [...st.backgrounds.queue, it.id]; }); draw();
            }, { small: true, disabled: queue.includes(it.id) }),
            button('', async () => { if (await confirmDialog('Delete background', `Delete “${it.name}” from your library?`, { danger: true, confirm: 'Delete' })) { await api('library:remove', it.id); await refreshSettings(); draw(); } }, { iconName: 'trash', small: true, kind: 'quiet', title: 'Delete' }))))) : empty('No backgrounds yet', 'Add PNG, JPEG, WebP, GIF, WebM or MP4 files (up to 40 MB each).')),
      s.backgrounds.currentId ? button('Stop using a background', () => { updateSettings((st) => { st.backgrounds.currentId = null; }); draw(); }, { kind: 'quiet', small: true }) : null);
  };
  await draw();
}
async function refreshSettings() { store.settings = await api('settings:get'); }
function thumb(it, large = false) {
  if (it.mime.startsWith('video/')) return h('video.bg-thumb', { src: it.url, muted: true, preload: 'metadata' });
  return h(`img.bg-thumb${large ? '.bg-thumb-l' : ''}`, { src: it.url, alt: '', loading: 'lazy' });
}

/* ================= Themes ================= */
async function themesPane(root) {
  const draw = async () => {
    const items = await api('library:list', 'theme');
    const official = cfg('client.theme');
    const active = store.settings.appearance.themeItemId;
    clear(root);
    const sw = (colors) => h('span.swatches', ['bg', 'panel', 'panel2', 'accent', 'accent2', 'accent3', 'text'].map((k) => h('i', { style: { background: colors[k] } })));
    root.append(
      h('p.text2', 'The default theme is set by the Polaris team and may change with updates. A local theme overrides it on this computer only.'),
      h('div.rows',
        h('div.row', h('div.row-text', h('div.row-title', official.name, h('span.badge', 'Official')), h('div.row-desc', 'Published by the Polaris team')), h('div.row-control', sw(official.colors), button(active ? 'Use' : 'In use', () => { updateSettings((s) => { s.appearance.themeItemId = null; }); draw(); }, { small: true, disabled: !active }))),
        items.map((it) => h('div.row', h('div.row-text', h('div.row-title', it.name, it.source === 'marketplace' ? h('span.badge.badge-muted', 'Marketplace') : null), h('div.row-desc', `Added ${fmt.date(it.createdAt)}`)),
          h('div.row-control', sw(it.meta.content.theme.colors),
            button(active === it.id ? 'In use' : 'Use', () => { updateSettings((s) => { s.appearance.themeItemId = it.id; }); draw(); }, { small: true, disabled: active === it.id }),
            button('', async () => { const f = await api('library:export', it.id); if (f) toast(`Exported to ${f}`, 'ok'); }, { iconName: 'download', small: true, kind: 'quiet', title: 'Export' }),
            button('', async () => { if (await confirmDialog('Delete theme', `Delete “${it.name}”?`, { danger: true, confirm: 'Delete' })) { if (active === it.id) await updateSettings((s) => { s.appearance.themeItemId = null; }, { immediate: true }); await api('library:remove', it.id); draw(); } }, { iconName: 'trash', small: true, kind: 'quiet', title: 'Delete' }))))),
      h('div.inline', { style: { marginTop: '16px' } },
        button('Create from current', () => themeEditor(clone(store.themeItem && active ? store.themeItem.meta.content.theme : official), draw), { iconName: 'palette' }),
        button('Import theme', async () => { const r = await api('library:import', 'theme'); if (r.errors.length) toast(r.errors.join('\n'), 'error'); draw(); }, { iconName: 'upload' }),
        button('Browse marketplace', () => go('marketplace', { kind: 'theme' }), { kind: 'quiet' })));
  };
  await draw();
}

function themeEditor(theme, done) {
  {
    const LABELS = { bg: 'Background', panel: 'Panel', panel2: 'Raised panel', line: 'Lines', text: 'Text', text2: 'Secondary text', text3: 'Muted text', accent: 'Accent', accent2: 'Accent 2', accent3: 'Accent 3', ok: 'Success', warn: 'Warning', danger: 'Danger', titlebar: 'Title bar', sidebar: 'Sidebar', buttonBg: 'Button', buttonText: 'Button text', buttonHover: 'Button hover', buttonActive: 'Button pressed' };
    const name = h('input.input', { value: `${theme.name} (custom)`.slice(0, 60), maxlength: 60 });
    theme.name = name.value;
    name.addEventListener('input', () => { theme.name = name.value; });
    const body = h('div.stack', field('Name', name),
      h('div.theme-grid', Object.keys(LABELS).map((k) => h('div.theme-color', h('span.small', LABELS[k]), color(theme.colors[k], (v) => { theme.colors[k] = v; })))),
      h('div.rows',
        row('Corner radius', null, range(theme.shape.radius, { min: 0, max: 16, onInput: (v) => { theme.shape.radius = v; }, format: (v) => `${v}px` })),
        row('Chamfer', 'Cut corner on primary buttons', range(theme.shape.chamfer, { min: 0, max: 20, onInput: (v) => { theme.shape.chamfer = v; }, format: (v) => `${v}px` })),
        row('Interface font', null, select(['Satoshi', 'system-ui', 'Inter', 'Arial', 'Georgia'], theme.typography.ui, (v) => { theme.typography.ui = v; theme.typography.display = v; })),
        row('Base size', null, range(theme.typography.baseSize, { min: 11, max: 20, onInput: (v) => { theme.typography.baseSize = v; }, format: (v) => `${v}px` })),
        row('Animations', null, toggle(theme.effects.animations, (v) => { theme.effects.animations = v; }))));
    m({ title: 'Theme editor', wide: true, body, actions: [{ label: 'Cancel', onClick: () => {} }, { label: 'Save and use', kind: 'primary', onClick: async () => {
      try {
        const it = await api('library:add', { kind: 'theme', name: theme.name || 'Custom theme', data: new TextEncoder().encode(JSON.stringify({ format: 'polaris-theme/1', theme })), source: 'studio' });
        await updateSettings((s) => { s.appearance.themeItemId = it.id; }, { immediate: true });
        toast('Theme saved', 'ok'); done();
      } catch (e) { fail(e); return true; }
    } }] });
  }
}

/* ================= Game style (CSS + visual filter) ================= */
async function gameCssPane(root) {
  const s = store.settings;
  const area = h('textarea.input.code', { rows: 14, spellcheck: false, placeholder: '/* CSS applied to the Kirka.io page, e.g. */\n.chat { opacity: .6; }', maxlength: 100000 }, s.game.gameCss);
  const saveCss = debounce(() => updateSettings((st) => { st.game.gameCss = area.value; }), 400);
  area.addEventListener('input', saveCss);
  const vf = clone(s.game.visualFilter);
  const setVf = (k, v) => { vf[k] = v; updateSettings((st) => { st.game.visualFilter = clone(vf); }); };
  root.append(
    h('section.section', sectionHead('Visual filter', 'Brightness, contrast and saturation'),
      h('p.text2.small', 'Applied to the game canvas as a CSS filter for comfort and visibility on your monitor — the same effect as adjusting your display. It does not reveal anything the game hides.'),
      h('div.rows',
        row('Enabled', null, toggle(vf.enabled, (v) => setVf('enabled', v))),
        row('Brightness', null, range(vf.brightness, { min: 0.5, max: 1.5, step: 0.05, onInput: (v) => setVf('brightness', v), format: (v) => `${Math.round(v * 100)}%` })),
        row('Contrast', null, range(vf.contrast, { min: 0.5, max: 1.5, step: 0.05, onInput: (v) => setVf('contrast', v), format: (v) => `${Math.round(v * 100)}%` })),
        row('Saturation', null, range(vf.saturation, { min: 0.2, max: 2, step: 0.05, onInput: (v) => setVf('saturation', v), format: (v) => `${Math.round(v * 100)}%` })))),
    h('section.section', sectionHead('Custom CSS', 'Style the Kirka.io page', h('span.inline', toggle(s.game.gameCssEnabled, (v) => updateSettings((st) => { st.game.gameCssEnabled = v; })), h('span.small', 'Enabled'))),
      h('p.text2.small', 'Your CSS is injected into the game page as a style sheet. It cannot run scripts. Kirka.io can change its page structure at any time, which may break selectors.'),
      area));
}

const PANES = { crosshair: crosshairPane, hud: hudPane, backgrounds: backgroundsPane, themes: themesPane, gamecss: gameCssPane };
