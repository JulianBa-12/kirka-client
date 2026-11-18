import { h, icon, button, clear, row, toggle, select, range, sectionHead, field, empty, fmt } from '../lib/dom.js';
import { api, store, updateSettings, toast, fail, confirmDialog, promptDialog, modal, signedIn } from '../lib/store.js';
import { go } from '../app.js';

const MAX_UNDO = 60;

/* ---------- document model ---------- */
function newLayer(w, hgt, name) { const c = document.createElement('canvas'); c.width = w; c.height = hgt; return { id: Math.random().toString(36).slice(2), name, canvas: c, ctx: c.getContext('2d', { willReadFrequently: true }), visible: true, opacity: 1 }; }

function hexToRgba(hex, a = 255) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a]; }
function rgbaToHex(r, g, b) { return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`; }

async function decodePng(data) {
  const blob = new Blob([data], { type: 'image/png' });
  const bmp = await createImageBitmap(blob);
  return bmp;
}

export async function render(root, params = {}) {
  let doc = null;         // { w, h, layers, active, libId, name }
  let tool = 'pencil'; let colorHex = '#00D9FF'; let alpha = 255; let mirror = false; let showGrid = true; let zoom = 8; let brush = 1;
  const undo = []; const redo = [];
  const recent = ['#00D9FF', '#287BFF', '#914DFF', '#E8EEF6', '#111C32', '#000000', '#FF5A6A', '#FFB547', '#3DDC97', '#8B5A3C'];

  const view = h('canvas.px-view');
  const viewWrap = h('div.px-wrap', view);
  const side = h('aside.px-side');
  const toolbar = h('div.px-tools');
  const library = h('div.px-lib');
  const status = h('div.px-status.mono.muted');

  /* ---------- rendering ---------- */
  const composite = () => {
    const c = document.createElement('canvas'); c.width = doc.w; c.height = doc.h;
    const x = c.getContext('2d');
    for (const l of doc.layers) if (l.visible) { x.globalAlpha = l.opacity; x.drawImage(l.canvas, 0, 0); }
    return c;
  };
  const paint = () => {
    if (!doc) return;
    const W = doc.w * zoom; const Hh = doc.h * zoom;
    view.width = W; view.height = Hh;
    view.style.width = `${W}px`; view.style.height = `${Hh}px`;
    const x = view.getContext('2d');
    x.imageSmoothingEnabled = false;
    // checkerboard
    const cs = Math.max(4, zoom);
    for (let yy = 0; yy < Hh; yy += cs) for (let xx = 0; xx < W; xx += cs) { x.fillStyle = ((xx / cs + yy / cs) & 1) ? '#2a3448' : '#1f2738'; x.fillRect(xx, yy, cs, cs); }
    x.drawImage(composite(), 0, 0, W, Hh);
    if (showGrid && zoom >= 6) {
      x.strokeStyle = 'rgba(255,255,255,.07)'; x.lineWidth = 1; x.beginPath();
      for (let i = 0; i <= doc.w; i++) { x.moveTo(i * zoom + 0.5, 0); x.lineTo(i * zoom + 0.5, Hh); }
      for (let i = 0; i <= doc.h; i++) { x.moveTo(0, i * zoom + 0.5); x.lineTo(W, i * zoom + 0.5); }
      x.stroke();
      x.strokeStyle = 'rgba(0,217,255,.18)'; x.beginPath();
      for (let i = 0; i <= doc.w; i += 8) { x.moveTo(i * zoom + 0.5, 0); x.lineTo(i * zoom + 0.5, Hh); }
      for (let i = 0; i <= doc.h; i += 8) { x.moveTo(0, i * zoom + 0.5); x.lineTo(W, i * zoom + 0.5); }
      x.stroke();
    }
    if (mirror) { x.strokeStyle = 'rgba(255,181,71,.7)'; x.beginPath(); x.moveTo(W / 2 + 0.5, 0); x.lineTo(W / 2 + 0.5, Hh); x.stroke(); }
  };

  /* ---------- history ---------- */
  const layer = () => doc.layers[doc.active];
  const snapshot = () => ({ layers: doc.layers.map((l) => ({ id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, data: l.ctx.getImageData(0, 0, doc.w, doc.h) })), active: doc.active });
  const restore = (snap) => {
    doc.layers = snap.layers.map((s) => { const l = newLayer(doc.w, doc.h, s.name); l.id = s.id; l.visible = s.visible; l.opacity = s.opacity; l.ctx.putImageData(s.data, 0, 0); return l; });
    doc.active = Math.min(snap.active, doc.layers.length - 1);
    paint(); drawSide();
  };
  const commit = () => { undo.push(snapshot()); if (undo.length > MAX_UNDO) undo.shift(); redo.length = 0; doc.dirty = true; drawStatus(); };
  const doUndo = () => { if (undo.length < 2) return; redo.push(undo.pop()); restore(undo[undo.length - 1]); };
  const doRedo = () => { if (!redo.length) return; const s = redo.pop(); undo.push(s); restore(s); };

  /* ---------- tools ---------- */
  const setPx = (l, x, y, erase) => {
    const pts = [[x, y]]; if (mirror) pts.push([doc.w - 1 - x, y]);
    for (const [px, py] of pts) {
      for (let dy = 0; dy < brush; dy++) for (let dx = 0; dx < brush; dx++) {
        const X = px + dx - Math.floor(brush / 2); const Y = py + dy - Math.floor(brush / 2);
        if (X < 0 || Y < 0 || X >= doc.w || Y >= doc.h) continue;
        if (erase) l.ctx.clearRect(X, Y, 1, 1);
        else { const [r, g, b] = hexToRgba(colorHex); l.ctx.clearRect(X, Y, 1, 1); l.ctx.fillStyle = `rgba(${r},${g},${b},${alpha / 255})`; l.ctx.fillRect(X, Y, 1, 1); }
      }
    }
  };
  const line = (l, x0, y0, x1, y1, erase) => {
    const dx = Math.abs(x1 - x0); const dy = -Math.abs(y1 - y0); const sx = x0 < x1 ? 1 : -1; const sy = y0 < y1 ? 1 : -1; let err = dx + dy;
    for (;;) { setPx(l, x0, y0, erase); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  };
  const fill = (l, x, y) => {
    const img = l.ctx.getImageData(0, 0, doc.w, doc.h); const d = img.data;
    const idx = (y * doc.w + x) * 4; const target = [d[idx], d[idx + 1], d[idx + 2], d[idx + 3]];
    const rep = hexToRgba(colorHex, alpha);
    if (target.every((v, i) => v === rep[i])) return;
    const stack = [[x, y]]; const seen = new Uint8Array(doc.w * doc.h);
    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (cx < 0 || cy < 0 || cx >= doc.w || cy >= doc.h) continue;
      const p = cy * doc.w + cx; if (seen[p]) continue; seen[p] = 1;
      const i = p * 4;
      if (d[i] !== target[0] || d[i + 1] !== target[1] || d[i + 2] !== target[2] || d[i + 3] !== target[3]) continue;
      d[i] = rep[0]; d[i + 1] = rep[1]; d[i + 2] = rep[2]; d[i + 3] = rep[3];
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    l.ctx.putImageData(img, 0, 0);
  };
  const pick = (x, y) => {
    const c = composite().getContext('2d').getImageData(x, y, 1, 1).data;
    if (c[3] === 0) return;
    colorHex = rgbaToHex(c[0], c[1], c[2]); alpha = c[3]; drawToolbar();
  };

  let drawing = null;
  const posOf = (e) => { const r = view.getBoundingClientRect(); return [Math.floor(((e.clientX - r.left) / r.width) * doc.w), Math.floor(((e.clientY - r.top) / r.height) * doc.h)]; };
  view.addEventListener('pointerdown', (e) => {
    if (!doc) return;
    const l = layer(); if (!l.visible) { toast('The active layer is hidden', 'warn', 2000); return; }
    const [x, y] = posOf(e);
    const erase = tool === 'eraser' || e.button === 2;
    if (tool === 'picker') { pick(x, y); return; }
    if (tool === 'fill') { fill(l, x, y); paint(); commit(); return; }
    view.setPointerCapture(e.pointerId);
    drawing = { x, y, erase };
    setPx(l, x, y, erase); paint();
  });
  view.addEventListener('pointermove', (e) => {
    if (!doc) return;
    const [x, y] = posOf(e);
    status.dataset.pos = `${x}, ${y}`; drawStatus();
    if (!drawing) return;
    line(layer(), drawing.x, drawing.y, x, y, drawing.erase); drawing.x = x; drawing.y = y; paint();
  });
  view.addEventListener('pointerup', () => { if (drawing) { drawing = null; commit(); } });
  view.addEventListener('contextmenu', (e) => e.preventDefault());
  viewWrap.addEventListener('wheel', (e) => { if (!e.ctrlKey) return; e.preventDefault(); zoom = Math.min(24, Math.max(2, zoom + (e.deltaY < 0 ? 1 : -1))); paint(); drawToolbar(); }, { passive: false });

  const keys = (e) => {
    if (!doc || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (e.ctrlKey && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); }
    else if (e.ctrlKey && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); doRedo(); }
    else if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    else if (!e.ctrlKey) { const map = { b: 'pencil', e: 'eraser', g: 'fill', i: 'picker' }; if (map[e.key]) { tool = map[e.key]; drawToolbar(); } if (e.key === 'm') { mirror = !mirror; paint(); drawToolbar(); } }
  };
  document.addEventListener('keydown', keys);

  /* ---------- panels ---------- */
  const drawToolbar = () => {
    const tb = (id, ic, label, key) => h(`button.px-tool${tool === id ? '.is-active' : ''}`, { type: 'button', title: `${label} (${key})`, on: { click: () => { tool = id; drawToolbar(); } } }, icon(ic, 16));
    const colorIn = h('input.color', { type: 'color', value: colorHex });
    colorIn.addEventListener('input', () => { colorHex = colorIn.value; });
    colorIn.addEventListener('change', () => { if (!recent.includes(colorHex)) { recent.unshift(colorHex); recent.length = Math.min(recent.length, 16); } drawToolbar(); });
    clear(toolbar).append(
      tb('pencil', 'pencil', 'Pencil', 'B'), tb('eraser', 'eraser', 'Eraser', 'E'), tb('fill', 'bucket', 'Fill', 'G'), tb('picker', 'pipette', 'Pick colour', 'I'),
      h('span.px-sep'),
      h('button.px-tool', { type: 'button', title: 'Undo (Ctrl+Z)', disabled: undo.length < 2, on: { click: doUndo } }, icon('undo', 16)),
      h('button.px-tool', { type: 'button', title: 'Redo (Ctrl+Y)', disabled: !redo.length, on: { click: doRedo } }, icon('redo', 16)),
      h('span.px-sep'),
      h(`button.px-tool${mirror ? '.is-active' : ''}`, { type: 'button', title: 'Mirror horizontally (M)', on: { click: () => { mirror = !mirror; paint(); drawToolbar(); } } }, icon('copy', 16)),
      h(`button.px-tool${showGrid ? '.is-active' : ''}`, { type: 'button', title: 'Grid', on: { click: () => { showGrid = !showGrid; paint(); drawToolbar(); } } }, icon('grid', 16)),
      h('span.px-sep'),
      colorIn,
      h('div.px-palette', recent.map((c) => h('button.px-swatch', { type: 'button', title: c, style: { background: c }, on: { click: () => { colorHex = c; drawToolbar(); } } }))),
      h('span.px-sep'),
      h('label.inline.small', 'Alpha', range(alpha, { min: 0, max: 255, step: 1, onInput: (v) => { alpha = v; }, format: (v) => `${Math.round((v / 255) * 100)}%` })),
      h('label.inline.small', 'Brush', select(['1', '2', '3', '4'].map((v) => ({ value: v, label: `${v}px` })), String(brush), (v) => { brush = Number(v); })),
      h('label.inline.small', 'Zoom', select([4, 6, 8, 10, 12, 16, 20].map((v) => ({ value: String(v), label: `${v}×` })), String(zoom), (v) => { zoom = Number(v); paint(); })));
  };

  const drawSide = () => {
    if (!doc) { clear(side); return; }
    const nameIn = h('input.input', { value: doc.name, maxlength: 80 });
    nameIn.addEventListener('change', () => { doc.name = nameIn.value.trim() || 'Untitled skin'; doc.dirty = true; });
    clear(side).append(
      field('Name', nameIn),
      h('div.px-doc-meta.mono.muted', `${doc.w}×${doc.h} px · ${doc.layers.length} layer(s)`),
      h('div.inline', button(doc.libId ? 'Save' : 'Save to library', save, { kind: 'primary', iconName: 'check' }), button('Export PNG', exportPng, { iconName: 'download', small: true })),
      h('hr.hr'),
      sectionHead('Layers', null, h('span.inline', button('', addLayer, { iconName: 'plus', small: true, kind: 'quiet', title: 'Add layer' }), button('', importLayer, { iconName: 'image', small: true, kind: 'quiet', title: 'Import PNG as layer' }))),
      h('ol.px-layers', [...doc.layers].map((l, i) => ({ l, i })).reverse().map(({ l, i }) => h(`li.px-layer${i === doc.active ? '.is-active' : ''}`, { on: { click: () => { doc.active = i; drawSide(); } } },
        h('button.px-eye', { type: 'button', title: l.visible ? 'Hide' : 'Show', on: { click: (e) => { e.stopPropagation(); l.visible = !l.visible; paint(); drawSide(); commit(); } } }, icon(l.visible ? 'eye' : 'minus', 14)),
        h('span.grow', l.name),
        h('span.mono.muted.small', `${Math.round(l.opacity * 100)}%`)))),
      layer() ? h('div.rows',
        row('Opacity', null, range(layer().opacity, { min: 0, max: 1, step: 0.05, onInput: (v) => { layer().opacity = v; paint(); }, format: (v) => `${Math.round(v * 100)}%` })),
        h('div.inline', { style: { paddingTop: '10px' } },
          button('Rename', async () => { const n = await promptDialog('Rename layer', 'Name', layer().name, { maxlength: 30 }); if (n) { layer().name = n; drawSide(); commit(); } }, { small: true }),
          button('Up', () => moveLayer(1), { small: true, disabled: doc.active === doc.layers.length - 1 }),
          button('Down', () => moveLayer(-1), { small: true, disabled: doc.active === 0 }),
          button('Merge down', mergeDown, { small: true, disabled: doc.active === 0 }),
          button('Clear', () => { layer().ctx.clearRect(0, 0, doc.w, doc.h); paint(); commit(); }, { small: true }),
          button('Delete', () => { if (doc.layers.length === 1) return toast('A skin needs at least one layer', 'warn'); doc.layers.splice(doc.active, 1); doc.active = Math.max(0, doc.active - 1); paint(); drawSide(); commit(); }, { small: true, kind: 'danger' }))) : null,
      h('hr.hr'),
      sectionHead('Use and share', null),
      h('div.stack',
        button('Upload to marketplace', upload, { iconName: 'upload', disabled: !doc.libId }),
        button('Use as resource swap', asResource, { iconName: 'cube', disabled: !doc.libId }),
        h('p.muted.small', 'Kirka.io does not let third-party clients change your official skins. A skin made here stays local unless you share it, or you swap a game texture you know the path of (local only — other players see your normal skin).')));
  };
  const drawStatus = () => { if (!doc) { status.textContent = ''; return; } status.textContent = `${tool} · ${status.dataset.pos || '—'} · ${doc.dirty ? 'unsaved changes' : 'saved'} · undo ${Math.max(0, undo.length - 1)}`; };

  const moveLayer = (d) => { const i = doc.active; const j = i + d; [doc.layers[i], doc.layers[j]] = [doc.layers[j], doc.layers[i]]; doc.active = j; paint(); drawSide(); commit(); };
  const mergeDown = () => { const top = layer(); const below = doc.layers[doc.active - 1]; below.ctx.globalAlpha = top.opacity; below.ctx.drawImage(top.canvas, 0, 0); below.ctx.globalAlpha = 1; doc.layers.splice(doc.active, 1); doc.active--; paint(); drawSide(); commit(); };
  const addLayer = () => { doc.layers.splice(doc.active + 1, 0, newLayer(doc.w, doc.h, `Layer ${doc.layers.length + 1}`)); doc.active++; paint(); drawSide(); commit(); };
  const importLayer = async () => {
    const f = await api('dialog:openImage', 'image'); if (!f) return;
    try {
      const bmp = await createImageBitmap(new Blob([f.data], { type: f.type || 'image/png' }));
      const l = newLayer(doc.w, doc.h, f.name.replace(/\.[^.]+$/, '').slice(0, 30));
      l.ctx.imageSmoothingEnabled = false;
      const s = Math.min(doc.w / bmp.width, doc.h / bmp.height);
      l.ctx.drawImage(bmp, 0, 0, Math.round(bmp.width * s), Math.round(bmp.height * s));
      doc.layers.splice(doc.active + 1, 0, l); doc.active++; paint(); drawSide(); commit();
    } catch (e) { fail(e, 'Could not import image: '); }
  };

  const toPngBytes = async () => { const c = composite(); const blob = await new Promise((r) => c.toBlob(r, 'image/png')); return new Uint8Array(await blob.arrayBuffer()); };
  async function save() {
    if (!doc) return;
    try {
      const data = await toPngBytes();
      if (doc.libId) { await api('library:replace', doc.libId, data); await api('library:update', doc.libId, { name: doc.name }); }
      else { const it = await api('library:add', { kind: 'skin', name: doc.name, data, source: 'studio' }); doc.libId = it.id; }
      doc.dirty = false; drawStatus(); drawSide(); drawLibrary(); toast('Skin saved', 'ok', 2000);
    } catch (e) { fail(e, 'Could not save: '); }
  }
  async function exportPng() { const f = await api('dialog:saveData', `${doc.name.replace(/[^\w-]+/g, '-')}.png`, await toPngBytes()); if (f) toast(`Exported to ${f}`, 'ok'); }
  async function upload() {
    if (!signedIn()) { toast('Sign in to a Polaris server account first (Settings → Account)', 'warn', 5000); return; }
    if (doc.dirty) await save();
    const title = h('input.input', { value: doc.name, maxlength: 80 });
    const desc = h('textarea.input', { rows: 3, maxlength: 1000, placeholder: 'Optional description' });
    const tags = h('input.input', { placeholder: 'comma, separated', maxlength: 120 });
    modal({ title: 'Upload skin', body: h('div.form', field('Title', title), field('Description', desc), field('Tags', tags), h('p.muted.small', 'Upload only work you created. Uploads are reviewed before they appear publicly. All marketplace items are free.')),
      actions: [{ label: 'Cancel', onClick: () => {} }, { label: 'Upload', kind: 'primary', onClick: async () => {
        try { const r = await api('server:uploadLibraryItem', doc.libId, { title: title.value.trim() || doc.name, description: desc.value.trim(), tags: tags.value }); toast(r.status === 'approved' ? 'Skin published' : 'Uploaded — waiting for review', 'ok'); }
        catch (e) { fail(e, 'Upload failed: '); return true; }
      } }] });
  }
  async function asResource() {
    const target = await promptDialog('Use as resource swap', 'Game texture path or file name (from the game’s network requests)', '', { placeholder: '/assets/img/skins/example.png', maxlength: 200 });
    if (!target) return;
    try { await api('library:add', { kind: 'resource', name: `${doc.name} (swap)`, data: await toPngBytes(), meta: { target } }); toast('Resource swap created — manage it under Resources', 'ok'); }
    catch (e) { fail(e); }
  }

  const open = async (it) => {
    if (doc && doc.dirty && !(await confirmDialog('Discard changes?', 'The current skin has unsaved changes.', { confirm: 'Discard', danger: true }))) return;
    if (!it) {
      const size = await new Promise((resolve) => {
        let done = false;
        modal({ title: 'New skin', body: h('p.modal-text', 'Choose the template size.'), onClose: () => { if (!done) resolve(null); },
          actions: [{ label: '64 × 64', onClick: () => { done = true; resolve(64); } }, { label: '128 × 128', kind: 'primary', onClick: () => { done = true; resolve(128); } }] });
      });
      if (!size) return;
      doc = { w: size, h: size, layers: [newLayer(size, size, 'Base')], active: 0, libId: null, name: 'Untitled skin', dirty: false };
    } else {
      const data = await api('library:read', it.id);
      const bmp = await decodePng(data);
      const l = newLayer(bmp.width, bmp.height, 'Base'); l.ctx.drawImage(bmp, 0, 0);
      doc = { w: bmp.width, h: bmp.height, layers: [l], active: 0, libId: it.id, name: it.name, dirty: false };
    }
    zoom = Math.max(3, Math.min(12, Math.floor(560 / Math.max(doc.w, doc.h))));
    undo.length = 0; redo.length = 0; undo.push(snapshot());
    paint(); drawToolbar(); drawSide(); drawStatus(); drawLibrary();
    editor.hidden = false; placeholder.hidden = true;
  };

  const drawLibrary = async () => {
    const items = await api('library:list', 'skin');
    clear(library).append(
      sectionHead('Library', `${items.length} skin(s)`, h('span.inline', button('', () => open(null), { iconName: 'plus', small: true, kind: 'quiet', title: 'New skin' }),
        button('', async () => { const r = await api('library:import', 'skin'); if (r.errors.length) toast(r.errors.join('\n'), 'error', 8000); drawLibrary(); }, { iconName: 'upload', small: true, kind: 'quiet', title: 'Import PNG skins' }))),
      items.length ? h('ul.px-items', items.map((it) => h(`li.px-item${doc && doc.libId === it.id ? '.is-active' : ''}`,
        h('button.px-item-open', { type: 'button', on: { click: () => open(it) } }, h('img.px-item-img', { src: `${it.url}?v=${encodeURIComponent(it.updatedAt)}`, alt: '' }), h('span.px-item-text', h('span', it.name), h('span.mono.muted.small', `${it.meta.width}×${it.meta.height}${it.source === 'marketplace' ? ' · marketplace' : ''}`))),
        h('button.px-fav', { type: 'button', title: it.favorite ? 'Unfavorite' : 'Favorite', on: { click: async () => { await api('library:update', it.id, { favorite: !it.favorite }); drawLibrary(); } } }, icon(it.favorite ? 'star' : 'heart', 14)),
        h('button.px-fav', { type: 'button', title: 'Delete', on: { click: async () => { if (await confirmDialog('Delete skin', `Delete “${it.name}”?`, { danger: true, confirm: 'Delete' })) { await api('library:remove', it.id); if (doc && doc.libId === it.id) doc.libId = null; drawLibrary(); } } } }, icon('trash', 14))))) : h('p.muted.small', 'No skins yet.'));
  };

  const placeholder = empty('Start a skin', 'Create a 64×64 or 128×128 skin from scratch, open one from your library, or import a PNG template.', h('div.inline', button('New skin', () => open(null), { kind: 'primary', iconName: 'plus' }), button('Import PNG', async () => { const r = await api('library:import', 'skin'); if (r.errors.length) toast(r.errors.join('\n'), 'error', 8000); await drawLibrary(); if (r.added[0]) open(r.added[0]); }, { iconName: 'upload' })));
  const editor = h('div.px-editor', toolbar, viewWrap, status);
  editor.hidden = true;

  root.classList.add('page-wide');
  root.append(
    h('header.page-head', h('div', h('div.pl-label.page-kicker', 'Local cosmetics'), h('h1', 'Skin Studio'), h('p', 'A pixel editor for 64×64 and 128×128 skin templates with layers, mirroring and full undo history.'))),
    h('div.px-layout', library, h('div.px-main', placeholder, editor), side));
  await drawLibrary();
  if (params.open) { const items = await api('library:list', 'skin'); const it = items.find((x) => x.id === params.open); if (it) open(it); }
  return () => document.removeEventListener('keydown', keys);
}
