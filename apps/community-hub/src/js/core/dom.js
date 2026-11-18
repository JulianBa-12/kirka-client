/**
 * DOM helpers. Untrusted strings only ever reach the DOM through textContent / setAttribute
 * (after URL checks) or through PolarisMarkdown.render (escape-first renderer).
 * `html:` is reserved for trusted, static markup (icons, renderer output).
 */

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = String(v);
      else if (k === 'html') el.innerHTML = v; // trusted only
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'href') { const safe = safeHref(v); if (safe) el.setAttribute('href', safe); }
      else if (k === 'src') { const safe = safeMediaUrl(v); if (safe) el.setAttribute('src', safe); }
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, kids);
  return el;
}

export function append(el, kids) {
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export function clear(el, ...kids) { el.replaceChildren(); return append(el, kids); }
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Trusted icon markup from the shared icon set. */
export function icon(name, size = 16) {
  const span = document.createElement('span');
  span.className = 'ico';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = window.PolarisIcons ? window.PolarisIcons.icon(name, { size }) : '';
  return span.firstElementChild || span;
}

/** Render markdown (escape-first) into an element. */
export function md(el, text) {
  el.innerHTML = window.PolarisMarkdown ? window.PolarisMarkdown.render(text || '') : '';
  for (const a of el.querySelectorAll('a[href]')) {
    if (!safeHref(a.getAttribute('href'))) a.removeAttribute('href');
  }
  return el;
}

/** Plain-text excerpt from markdown. */
export function plain(text, max = 220) {
  const s = String(text || '').replace(/```[\s\S]*?```/g, ' ').replace(/[#>*`_\-]+/g, ' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : s;
}

let allowedHttpOrigins = new Set();
/** Allow http:// media from a configured dev backend (e.g. http://127.0.0.1:8787). */
export function allowOrigin(origin) { if (origin) allowedHttpOrigins.add(origin); }

/** Links: https URLs, same-site relative .html pages, in-page anchors, mailto. */
export function safeHref(href) {
  if (href == null) return null;
  const s = String(href).trim();
  if (!s) return null;
  if (/^#[\w-]*$/.test(s)) return s;
  if (/^[a-z0-9_-]+\.html(?:[?#][^\s"'<>]*)?$/i.test(s)) return s;
  if (/^(?:assets|data)\/[\w./-]+$/i.test(s) && !s.includes('..')) return s;
  if (/^mailto:[^\s"'<>]+$/i.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.protocol === 'https:') return u.href;
    if (u.protocol === 'http:' && allowedHttpOrigins.has(u.origin)) return u.href;
  } catch { /* not absolute */ }
  return null;
}

export function safeMediaUrl(src) {
  if (!src) return null;
  const s = String(src).trim();
  if (/^assets\/[\w./-]+$/i.test(s) && !s.includes('..')) return s;
  if (/^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.protocol === 'https:') return u.href;
    if (u.protocol === 'http:' && allowedHttpOrigins.has(u.origin)) return u.href;
  } catch { /* ignore */ }
  return null;
}

export function isExternal(href) { return /^https?:\/\//i.test(href || ''); }

/** <a> for remote data with external-link hygiene. */
export function link(href, label, cls) {
  const safe = safeHref(href);
  if (!safe) return h('span', { class: cls }, label);
  const ext = isExternal(safe);
  return h('a', { class: cls, href: safe, rel: ext ? 'noopener noreferrer' : null, target: ext ? '_blank' : null }, label);
}

/** Copy-to-clipboard button. */
export function copyButton(getText, label = 'Copy') {
  const btn = h('button', { type: 'button', class: 'copy-btn' }, label);
  btn.setAttribute('aria-label', `${label} to clipboard`);
  btn.addEventListener('click', async () => {
    const text = typeof getText === 'function' ? getText() : getText;
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch {
      const ta = h('textarea', { class: 'pl-sr', readonly: true }); ta.value = text; document.body.append(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
    }
    btn.textContent = ok ? 'Copied' : 'Press Ctrl+C';
    btn.dataset.state = ok ? 'done' : 'fail';
    setTimeout(() => { btn.textContent = label; delete btn.dataset.state; }, 1800);
  });
  return btn;
}

export function codeBlock(lines, { copy = true } = {}) {
  const text = lines.join('\n');
  const pre = h('pre', null, h('code', null, ...lines.map((l, i) => [i ? '\n' : '', l.startsWith('#') ? h('span', { class: 'prompt' }, l) : [h('span', { class: 'prompt' }, '$ '), l]])));
  return h('div', { class: 'codeblock' }, pre, copy ? copyButton(text) : null);
}

let toastRegion;
export function toast(message, tone = 'info') {
  if (!toastRegion) { toastRegion = h('div', { class: 'toast-region', role: 'status', 'aria-live': 'polite' }); document.body.append(toastRegion); }
  const t = h('div', { class: 'toast', dataset: { tone } }, message);
  toastRegion.append(t);
  setTimeout(() => t.remove(), 4200);
}

export function qparam(name) { return new URLSearchParams(location.search).get(name); }

export function setParam(name, value) {
  const u = new URL(location.href);
  if (value == null || value === '') u.searchParams.delete(name); else u.searchParams.set(name, value);
  history.replaceState(null, '', u.pathname.split('/').pop() + u.search + u.hash);
}

/** Lazy image with explicit dimensions. */
export function img(src, alt, { w, hgt, cls, pixel } = {}) {
  const safe = safeMediaUrl(src);
  if (!safe) return null;
  const el = h('img', { src: safe, alt: alt || '', loading: 'lazy', decoding: 'async', width: w, height: hgt, class: cls, referrerpolicy: 'no-referrer' });
  if (pixel) el.classList.add('is-pixel');
  return el;
}

/** Simple <dialog> builder; returns { dialog, body, open, close }. */
export function dialog(title, { narrow = false, label } = {}) {
  const heading = h('h2', { class: 'pl-label', id: `dlg-${Math.random().toString(36).slice(2, 8)}` }, label || title);
  const close = h('button', { type: 'button', class: 'dialog__close', 'aria-label': 'Close' }, icon('close', 16));
  const body = h('div', { class: 'dialog__body' });
  const d = h('dialog', { class: `dialog${narrow ? ' dialog--narrow' : ''}`, 'aria-labelledby': heading.id }, h('div', { class: 'dialog__head' }, heading, close), body);
  close.addEventListener('click', () => d.close());
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  d.addEventListener('close', () => d.remove());
  document.body.append(d);
  return { dialog: d, body, heading, open: () => d.showModal(), close: () => d.close() };
}
