/* Small DOM helpers. All text goes through textContent / escaping — never raw HTML from data. */

export function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** h('div.cls#id', { attrs, on: { click } }, ...children) */
// Views compose DOM with nested arrays and optional (null/false) parts. The native
// ParentNode.append would stringify those ("null", "[object HTMLElement]"), so append/prepend are
// normalised once for the whole shell: arrays are flattened and null/false/undefined are skipped.
for (const proto of [Element.prototype, DocumentFragment.prototype]) {
  for (const name of ['append', 'prepend']) {
    const native = proto[name];
    proto[name] = function (...nodes) { return native.apply(this, nodes.flat(Infinity).filter((n) => n != null && n !== false)); };
  }
}

export function h(sel, props, ...children) {
  if (props == null || typeof props !== 'object' || props instanceof Node || Array.isArray(props)) { if (props != null) children.unshift(props); props = {}; }
  const m = sel.match(/^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement((m && m[1]) || 'div');
  if (m && m[2]) for (const part of m[2].match(/[.#][\w-]+/g)) { if (part[0] === '.') el.classList.add(part.slice(1)); else el.id = part.slice(1); }
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'on') { for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn); }
    else if (k === 'class') el.className += ` ${v}`;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v; // only used with trusted, locally built markup (icons)
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && !['list', 'form', 'type'].includes(k) && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function icon(name, size = 16) {
  const span = document.createElement('span');
  span.className = 'ico';
  span.innerHTML = window.PolarisIcons.icon(name, { size });
  return span;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------- formatting ---------- */
export const fmt = {
  num: (v, d = 0) => (v == null || !Number.isFinite(v) ? '—' : Number(v).toFixed(d)),
  bytes(n) { if (n == null) return '—'; const u = ['B', 'KB', 'MB', 'GB']; let i = 0; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; } return `${n.toFixed(i ? 1 : 0)} ${u[i]}`; },
  dur(sec) { if (sec == null) return '—'; sec = Math.round(sec); const hh = Math.floor(sec / 3600); const mm = Math.floor((sec % 3600) / 60); const ss = sec % 60; return hh ? `${hh}h ${String(mm).padStart(2, '0')}m` : `${mm}:${String(ss).padStart(2, '0')}`; },
  date: (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—'),
  datetime: (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'),
  ago(iso) {
    if (!iso) return '—';
    const s = (Date.now() - Date.parse(iso)) / 1000;
    if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return fmt.date(iso);
  },
};

/* ---------- form controls ---------- */
export function field(label, control, hint) {
  return h('label.field', h('span.field-label', label), control, hint ? h('span.field-hint', hint) : null);
}

export function toggle(value, onChange, { disabled = false, label = '' } = {}) {
  const input = h('input', { type: 'checkbox', checked: !!value, disabled, 'aria-label': label });
  input.addEventListener('change', () => onChange(input.checked));
  return h('span.switch', input, h('span.switch-track'));
}

export function row(title, desc, control, opts = {}) {
  return h(`div.row${opts.danger ? '.row-danger' : ''}`, h('div.row-text', h('div.row-title', title, opts.badge ? h('span.badge', opts.badge) : null), desc ? h('div.row-desc', desc) : null), h('div.row-control', control));
}

export function select(options, value, onChange) {
  const el = h('select.input', ...options.map((o) => { const opt = typeof o === 'string' ? { value: o, label: o } : o; return h('option', { value: opt.value, selected: opt.value === value }, opt.label); }));
  el.addEventListener('change', () => onChange(el.value));
  return el;
}

export function range(value, { min, max, step = 1, onInput, format = (v) => v }) {
  const out = h('span.range-val.pl-mono', format(value));
  const input = h('input.range', { type: 'range', min, max, step, value });
  input.addEventListener('input', () => { out.textContent = format(Number(input.value)); onInput(Number(input.value)); });
  return h('span.range-wrap', input, out);
}

export function color(value, onInput) {
  const isHex = /^#[0-9a-f]{6}$/i.test(value);
  const input = h('input.color', { type: 'color', value: isHex ? value : '#000000' });
  const text = h('input.input.input-sm.pl-mono', { value, spellcheck: false, maxlength: 32 });
  input.addEventListener('input', () => { text.value = input.value; onInput(input.value); });
  text.addEventListener('change', () => { if (/^(#[0-9a-f]{3,8}|rgba?\([\d\s.,]+\)|transparent)$/i.test(text.value.trim())) { onInput(text.value.trim()); if (/^#[0-9a-f]{6}$/i.test(text.value.trim())) input.value = text.value.trim(); } else text.value = value; });
  return h('span.color-wrap', input, text);
}

export function button(label, onClick, { kind = 'ghost', iconName = null, disabled = false, title = null, small = false } = {}) {
  const b = h(`button.btn.btn-${kind}${small ? '.btn-sm' : ''}`, { type: 'button', disabled, title }, iconName ? icon(iconName, small ? 14 : 16) : null, label ? h('span', label) : null);
  if (onClick) b.addEventListener('click', async (e) => {
    if (b.dataset.busy) return;
    b.dataset.busy = '1'; b.classList.add('is-busy');
    try { await onClick(e); } finally { delete b.dataset.busy; b.classList.remove('is-busy'); }
  });
  return b;
}

export function tabs(items, active, onSelect) {
  const bar = h('div.tabs', { role: 'tablist' });
  for (const it of items) {
    const t = h(`button.tab${it.id === active ? '.is-active' : ''}`, { type: 'button', role: 'tab', 'aria-selected': it.id === active }, it.label, it.badge ? h('span.badge', it.badge) : null);
    t.addEventListener('click', () => onSelect(it.id));
    bar.appendChild(t);
  }
  return bar;
}

export function empty(title, body, action) {
  return h('div.empty', h('div.empty-title', title), body ? h('p.empty-body', body) : null, action || null);
}

export function sectionHead(label, title, aside) {
  return h('header.section-head', h('div', h('div.pl-label.section-kicker', label), title ? h('h2.section-title', title) : null), aside ? h('div.section-aside', aside) : null);
}

export function debounce(fn, ms = 250) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
