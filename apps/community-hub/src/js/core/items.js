/**
 * Community items (skins, backgrounds, resources, crosshairs, HUDs, themes, plugins):
 * tiles, catalog listing with filters & paging, detail dialog (like, comments, download, report),
 * and the upload dialog. All item fields are user content → textContent only.
 */
import { h, clear, icon, img, dialog, toast, qparam, setParam, $ } from './dom.js';
import { api, config, status, me, errorText, ApiError } from './api.js';
import * as fmt from './format.js';
import { backendState, emptyState, errorState, loading } from './states.js';

export const KIND_LABEL = { skin: 'Skin', background: 'Background', resource: 'Resource', crosshair: 'Crosshair', hud: 'HUD layout', theme: 'Theme', plugin: 'Plugin' };
const KIND_PLURAL = { skin: 'skins', background: 'backgrounds', resource: 'resources', crosshair: 'crosshairs', hud: 'HUD layouts', theme: 'themes', plugin: 'plugins' };
const ACCEPT = {
  skin: 'image/png,image/webp,image/jpeg', background: 'image/png,image/webp,image/jpeg,image/gif',
  resource: 'image/png,image/webp,image/jpeg,audio/ogg,audio/wav,audio/mpeg,application/json,.glb,.gltf',
  crosshair: 'application/json,.json', hud: 'application/json,.json', theme: 'application/json,.json', plugin: '.zip,.js,.json,application/zip',
};
const IMAGE = /^image\/(png|jpeg|webp|gif)$/;

export function previewOf(item) {
  if (item.previewUrl) return item.previewUrl;
  if (IMAGE.test(item.mime || '')) return item.fileUrl;
  return null;
}

let apiRootCache = '';
config().then((c) => { apiRootCache = c.apiRoot; });
export function downloadUrl(item) { return apiRootCache ? `${apiRootCache}/community/items/${encodeURIComponent(item.id)}/download` : null; }

const authorName = (u) => (u ? (u.displayName || u.username) : 'Unknown');

export function avatar(user, lg = false) {
  const el = h('span', { class: `avatar${lg ? ' avatar--lg' : ''}`, 'aria-hidden': 'true' });
  const im = user && user.avatarUrl ? img(user.avatarUrl, '', { w: lg ? 72 : 32, hgt: lg ? 72 : 32 }) : null;
  if (im) el.append(im); else el.textContent = fmt.initials(user);
  return el;
}

export function byline(user) {
  return h('span', { class: 'byline' }, avatar(user), h('span', { class: 'byline__name' }, authorName(user)));
}

/** Square tile for image-like items (contact sheet). */
export function skinTile(item, { href, onOpen } = {}) {
  const prev = previewOf(item);
  const frame = h('span', { class: 'tile__img' }, prev ? img(prev, `${item.title} preview`, { w: 256, hgt: 256, pixel: item.kind === 'skin' }) : h('span', { class: 'tile__none pl-label' }, KIND_LABEL[item.kind] || item.kind));
  const a = h('a', { class: 'tile', href: href || `#item-${item.id}` },
    frame,
    h('span', { class: 'tile__cap' },
      h('span', { class: 'tile__title' }, item.title),
      h('span', { class: 'tile__meta meta' }, authorName(item.author), h('span', { class: 'meta-sep' }, '·'), `${fmt.number(item.likes)} likes`)),
    item.featured || item.official ? h('span', { class: 'tile__flag pl-label' }, item.official ? 'Official' : 'Featured') : null);
  if (onOpen) a.addEventListener('click', (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); onOpen(item); });
  return a;
}

function compatTag(c) {
  if (c === 'compatible') return h('span', { class: 'tag tag--ok' }, 'Compatible');
  if (c === 'incompatible') return h('span', { class: 'tag tag--danger' }, 'Incompatible');
  return h('span', { class: 'tag tag--warn' }, 'Untested');
}
const permsOf = (item) => {
  const m = item.metadata || {};
  const approved = Array.isArray(m.approvedPermissions) ? m.approvedPermissions : null;
  const declared = m.manifest && Array.isArray(m.manifest.permissions) ? m.manifest.permissions : [];
  return { approved, declared };
};

// ------------------------------------------------------------------ detail dialog
export async function openItem(itemOrId, { onChange } = {}) {
  const d = dialog('Item', { label: 'Community item' });
  d.open();
  clear(d.body, loading('Loading item'));
  let item;
  try { item = await api(`/community/items/${encodeURIComponent(typeof itemOrId === 'object' ? itemOrId.id : itemOrId)}`); }
  catch (e) { clear(d.body, errorState(e.status === 404 ? 'This item is not available' : 'Could not load this item', e.status === 404 ? 'It may have been removed or is still waiting for review.' : errorText(e))); return d; }
  d.heading.textContent = `${KIND_LABEL[item.kind] || 'Item'} #${item.id}`;
  const user = await me();
  setParam('item', item.id);
  d.dialog.addEventListener('close', () => setParam('item', null));

  const prev = previewOf(item);
  const likeBtn = h('button', { type: 'button', class: 'btn', 'aria-pressed': String(!!item.liked) }, icon('heart', 16), h('span', null, `${fmt.number(item.likes)}`), h('span', { class: 'pl-sr' }, ' likes'));
  likeBtn.addEventListener('click', async () => {
    if (!user) { toast('Sign in on the Community page to like items.'); return; }
    likeBtn.disabled = true;
    try {
      await api(`/community/items/${item.id}/like`, { method: item.liked ? 'DELETE' : 'POST', auth: 'required' });
      item.liked = !item.liked; item.likes += item.liked ? 1 : -1;
      likeBtn.setAttribute('aria-pressed', String(item.liked)); likeBtn.children[1].textContent = fmt.number(item.likes);
      onChange && onChange(item);
    } catch (e) { toast(errorText(e), 'error'); } finally { likeBtn.disabled = false; }
  });
  const dl = downloadUrl(item);
  const { approved, declared } = permsOf(item);

  const desc = h('p', { class: 'item__desc' }, item.description || 'No description.');
  const info = h('div', { class: 'item__info' },
    h('div', { class: 'tag-list' }, h('span', { class: 'tag' }, KIND_LABEL[item.kind] || item.kind), item.official ? h('span', { class: 'tag tag--accent' }, 'Official') : null, item.featured ? h('span', { class: 'tag tag--accent' }, 'Featured') : null, item.status !== 'approved' ? h('span', { class: 'tag tag--warn' }, item.status) : null),
    h('h3', { class: 'item__title' }, item.title),
    h('p', { class: 'item__by' }, 'by ', h('a', { href: `community.html?u=${encodeURIComponent(item.author ? item.author.username : '')}` }, authorName(item.author))),
    desc,
    h('dl', { class: 'spec item__spec' },
      h('dt', { class: 'pl-label' }, 'Category'), h('dd', null, item.category || '—'),
      h('dt', { class: 'pl-label' }, 'Version'), h('dd', null, item.version || '—'),
      h('dt', { class: 'pl-label' }, 'File'), h('dd', null, `${fmt.bytes(item.size)} · ${item.mime || 'unknown'}`),
      h('dt', { class: 'pl-label' }, 'Downloads'), h('dd', null, fmt.number(item.downloads)),
      h('dt', { class: 'pl-label' }, 'Updated'), h('dd', null, fmt.date(item.updatedAt || item.createdAt)),
      h('dt', { class: 'pl-label' }, 'Price'), h('dd', null, (item.price && item.price.label) || 'Free')),
    item.kind === 'plugin' ? h('div', { class: 'item__perms' },
      h('p', { class: 'pl-label' }, 'Permissions'),
      h('div', { class: 'tag-list' }, compatTag(item.metadata && item.metadata.compatibility),
        (approved || declared).length ? (approved || declared).map((p) => h('span', { class: 'tag' }, p)) : h('span', { class: 'meta' }, 'No permissions requested')),
      approved ? h('p', { class: 'field__hint' }, 'Permissions approved by the Polaris reviewers. The client only grants these.') : h('p', { class: 'field__hint' }, 'Declared by the author; not yet reviewed.')) : null,
    (item.tags || []).length ? h('ul', { class: 'tag-list' }, item.tags.map((t) => h('li', { class: 'tag' }, `#${t}`))) : null,
    h('div', { class: 'btn-row item__actions' },
      dl ? h('a', { class: 'btn btn--primary pl-chamfer', href: dl, rel: 'noopener noreferrer' }, icon('download', 16), 'Download') : null,
      likeBtn,
      h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onclick: () => openReport('item', item.id, user) }, 'Report')));

  const comments = h('section', { class: 'item__comments', 'aria-label': 'Comments' });
  clear(d.body, h('div', { class: 'item' }, h('div', { class: 'item__preview' }, prev ? img(prev, `${item.title} preview`, { w: 512, hgt: 512, pixel: item.kind === 'skin' }) : h('span', { class: 'tile__none pl-label' }, 'No preview')), info), comments);
  renderComments(comments, item, user);
  return d;
}

async function renderComments(host, item, user) {
  const list = h('ol', { class: 'comments' });
  const head = h('p', { class: 'sec-label pl-label' }, h('span', { class: 'sec-label__num' }, fmt.number(item.comments || 0)), 'Comments');
  clear(host, head, list);
  const load = async () => {
    try {
      const r = await api(`/community/items/${item.id}/comments`);
      head.firstChild.textContent = fmt.number(r.items.length);
      clear(list, r.items.length ? r.items.map((c) => h('li', { class: 'comment' },
        h('p', { class: 'comment__head' }, byline(c.user), h('time', { class: 'meta', datetime: c.createdAt }, fmt.relative(c.createdAt))),
        h('p', { class: 'comment__body' }, c.body))) : h('li', { class: 'meta' }, 'No comments yet.'));
    } catch (e) { clear(list, h('li', { class: 'meta' }, errorText(e))); }
  };
  await load();
  if (!user) { host.append(h('p', { class: 'meta comments__signin' }, h('a', { href: 'community.html#account' }, 'Sign in'), ' to comment.')); return; }
  const ta = h('textarea', { class: 'textarea', id: `c-${item.id}`, name: 'body', maxlength: '1000', required: true, rows: '3' });
  const st = h('p', { class: 'form__status', role: 'status' });
  const form = h('form', { class: 'form comments__form', novalidate: true },
    h('div', { class: 'field' }, h('label', { class: 'field__label', for: ta.id }, 'Add a comment', h('span', { class: 'opt' }, 'max 1000')), ta),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn btn--sm', type: 'submit' }, 'Post comment')), st);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = ta.value.trim();
    if (!body) { st.dataset.tone = 'error'; st.textContent = 'Write something first.'; return; }
    form.querySelector('button').disabled = true;
    try { await api(`/community/items/${item.id}/comments`, { method: 'POST', body: { body }, auth: 'required' }); ta.value = ''; st.textContent = ''; await load(); }
    catch (err) { st.dataset.tone = 'error'; st.textContent = errorText(err); }
    finally { form.querySelector('button').disabled = false; }
  });
  host.append(form);
}

export function openReport(targetType, targetId, user) {
  if (!user) { toast('Sign in on the Community page to report content.'); return; }
  const d = dialog('Report', { narrow: true, label: 'Report content' });
  const reason = h('select', { class: 'select', id: 'rep-reason', name: 'reason' }, ['spam', 'abuse', 'cheating', 'copyright', 'inappropriate', 'other'].map((r) => h('option', { value: r }, r[0].toUpperCase() + r.slice(1))));
  const details = h('textarea', { class: 'textarea', id: 'rep-details', name: 'details', maxlength: '1000', rows: '4' });
  const st = h('p', { class: 'form__status', role: 'status' });
  const form = h('form', { class: 'form' },
    h('p', { class: 'field__hint' }, 'Reports go to the Polaris moderators. Include what is wrong and where.'),
    h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'rep-reason' }, 'Reason'), reason),
    h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'rep-details' }, 'Details', h('span', { class: 'opt' }, 'optional')), details),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn btn--primary pl-chamfer', type: 'submit' }, 'Send report')), st);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/reports', { method: 'POST', auth: 'required', body: { targetType, targetId, reason: reason.value, details: details.value.trim() || undefined } }); d.close(); toast('Report sent. Thank you.'); }
    catch (err) { st.dataset.tone = 'error'; st.textContent = errorText(err); }
  });
  d.body.append(form); d.open();
}

// ------------------------------------------------------------------ upload
export function canUpload(kind, user, community) {
  const perm = (community.uploadPermissions || {})[kind] || 'user';
  if (perm === 'nobody') return { ok: false, reason: `Uploads of ${KIND_PLURAL[kind]} are closed right now.` };
  if (!user) return { ok: false, reason: 'signin' };
  const rank = { user: 0, moderator: 1, admin: 2, owner: 3 };
  if ((rank[user.role] ?? 0) < (rank[perm] ?? 0)) return { ok: false, reason: `Only ${perm}s can upload ${KIND_PLURAL[kind]}.` };
  if (user.restrictions && user.restrictions.upload) return { ok: false, reason: 'Uploading is restricted on your account.' };
  return { ok: true };
}

export function openUpload(kind, community, { onDone } = {}) {
  const d = dialog('Upload', { label: `Upload a ${(KIND_LABEL[kind] || kind).toLowerCase()}` });
  const cats = (community.categories || {})[kind] || [];
  const f = (id, label, input, { hint, optional } = {}) => h('div', { class: 'field' },
    h('label', { class: 'field__label', for: id }, label, optional ? h('span', { class: 'opt' }, 'optional') : null), input,
    hint ? h('p', { class: 'field__hint' }, hint) : null, h('p', { class: 'field__error', id: `${id}-err` }));
  const file = h('input', { class: 'input', type: 'file', id: 'up-file', name: 'file', accept: ACCEPT[kind] || '', required: true });
  const preview = h('input', { class: 'input', type: 'file', id: 'up-preview', name: 'preview', accept: 'image/png,image/jpeg,image/webp' });
  const title = h('input', { class: 'input', id: 'up-title', name: 'title', maxlength: '80', required: true, autocomplete: 'off' });
  const desc = h('textarea', { class: 'textarea', id: 'up-desc', name: 'description', maxlength: '2000', rows: '4' });
  const cat = h('select', { class: 'select', id: 'up-cat', name: 'category' }, cats.map((c) => h('option', { value: c }, c)));
  const tags = h('input', { class: 'input', id: 'up-tags', name: 'tags', maxlength: '200', placeholder: 'pixel, blue, minimal', autocomplete: 'off' });
  const manifest = kind === 'plugin' ? h('textarea', { class: 'textarea', id: 'up-manifest', name: 'manifest', rows: '6', spellcheck: 'false', placeholder: '{ "id": "my-plugin", "name": "My plugin", "version": "1.0.0", "entry": "main.js", "permissions": [], "minClientVersion": "1.0.0" }' }) : null;
  const st = h('p', { class: 'form__status', role: 'status' });
  const submit = h('button', { class: 'btn btn--primary pl-chamfer', type: 'submit' }, icon('upload', 16), 'Upload');
  const form = h('form', { class: 'form', novalidate: true },
    community.marketplaceRules ? h('p', { class: 'upload__rules' }, community.marketplaceRules) : null,
    f('up-file', 'File', file, { hint: kind === 'skin' ? 'PNG skin texture made from a Polaris Skin Studio template.' : ['crosshair', 'hud', 'theme'].includes(kind) ? 'JSON exported from the matching Polaris editor.' : null }),
    kind === 'skin' || kind === 'background' ? null : f('up-preview', 'Preview image', preview, { optional: true, hint: 'PNG, JPEG or WebP shown in the listing.' }),
    f('up-title', 'Title', title, { hint: '3 to 80 characters.' }),
    f('up-desc', 'Description', desc, { optional: true }),
    h('div', { class: 'form__row' }, cats.length ? f('up-cat', 'Category', cat) : null, f('up-tags', 'Tags', tags, { optional: true, hint: 'Comma separated.' })),
    manifest ? f('up-manifest', 'Plugin manifest (JSON)', manifest, { hint: 'Must match the manifest inside your plugin. Permissions are reviewed before approval.' }) : null,
    community.requireApproval ? h('p', { class: 'field__hint' }, 'Uploads are reviewed by moderators before they appear publicly.') : null,
    h('div', { class: 'btn-row' }, submit), st);

  const setErr = (input, msg) => { input.setAttribute('aria-invalid', msg ? 'true' : 'false'); const e = $(`#${input.id}-err`, form); if (e) e.textContent = msg || ''; if (msg) input.setAttribute('aria-describedby', `${input.id}-err`); };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    let bad = false;
    const fl = file.files[0];
    setErr(file, !fl ? 'Choose a file.' : (kind === 'skin' || kind === 'background') && !/^image\//.test(fl.type) ? 'This must be an image.' : ''); bad ||= !fl;
    const t = title.value.trim();
    setErr(title, t.length < 3 ? 'At least 3 characters.' : ''); bad ||= t.length < 3;
    let meta;
    if (manifest) {
      try { const m = JSON.parse(manifest.value || 'null'); if (!m || typeof m !== 'object' || !m.id || !m.version) throw new Error(); meta = { manifest: m }; setErr(manifest, ''); }
      catch { setErr(manifest, 'Valid JSON with at least "id" and "version".'); bad = true; }
    }
    if (bad) { form.querySelector('[aria-invalid="true"]')?.focus(); return; }
    const fd = new FormData();
    fd.append('kind', kind); fd.append('title', t); fd.append('description', desc.value.trim());
    if (cats.length) fd.append('category', cat.value);
    fd.append('tags', tags.value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 10).join(','));
    if (meta) fd.append('metadata', JSON.stringify(meta));
    fd.append('file', fl);
    if (preview.files[0]) fd.append('preview', preview.files[0]);
    submit.disabled = true; st.dataset.tone = ''; st.textContent = 'Uploading…';
    try {
      const item = await api('/community/items', { method: 'POST', form: fd, auth: 'required', timeout: 60000 });
      st.dataset.tone = 'ok';
      st.textContent = item.status === 'approved' ? 'Published.' : 'Uploaded. It will appear once a moderator approves it.';
      form.reset();
      onDone && onDone(item);
    } catch (err) {
      st.dataset.tone = 'error';
      st.textContent = err instanceof ApiError ? errorText(err) : 'Upload failed.';
    } finally { submit.disabled = false; }
  });
  d.body.append(form); d.open();
  return d;
}

// ------------------------------------------------------------------ catalog
/**
 * Mounts a full catalog into `root`.
 * opts: { kinds: ['skin'], view: 'sheet'|'table'|'plugins', community, pageSize, noun }
 */
export async function catalog(root, opts) {
  const { kinds, view, community } = opts;
  const pageSize = opts.pageSize || 24;
  const s = await status();
  if (s.state !== 'online') { clear(root, backendState(s, `The ${opts.noun || 'catalog'}`)); return; }

  const user = await me();
  const st = {
    kind: kinds.includes(qparam('kind')) ? qparam('kind') : kinds[0],
    q: qparam('q') || '', category: qparam('category') || '', sort: ['new', 'popular', 'downloads'].includes(qparam('sort')) ? qparam('sort') : 'popular',
    offset: Math.max(0, Number(qparam('page') || 1) - 1) * pageSize, featured: qparam('featured') === '1',
  };

  const kindSeg = kinds.length > 1 ? h('div', { class: 'seg', role: 'group', 'aria-label': 'Type' }, kinds.map((k) => h('button', { type: 'button', 'aria-pressed': String(k === st.kind), dataset: { kind: k } }, KIND_PLURAL[k]))) : null;
  const search = h('input', { class: 'input', type: 'search', id: 'cat-q', name: 'q', placeholder: `Search ${KIND_PLURAL[st.kind]}`, value: st.q, autocomplete: 'off' });
  const catSel = h('select', { class: 'select', id: 'cat-cat', name: 'category', 'aria-label': 'Category' });
  const sortSel = h('select', { class: 'select', id: 'cat-sort', name: 'sort', 'aria-label': 'Sort' },
    [['popular', 'Most liked'], ['new', 'Newest'], ['downloads', 'Most downloaded']].map(([v, l]) => h('option', { value: v, selected: v === st.sort }, l)));
  const featuredBtn = h('button', { type: 'button', class: 'btn btn--sm', 'aria-pressed': String(st.featured) }, 'Featured only');
  const count = h('p', { class: 'meta toolbar__count', 'aria-live': 'polite' });
  const uploadBtn = h('button', { type: 'button', class: 'btn btn--sm btn--primary pl-chamfer' }, icon('upload', 14), 'Upload');
  const results = h('div', { class: 'catalog__results' });
  const pager = h('nav', { class: 'pager', 'aria-label': 'Pages' });

  const fillCats = () => {
    const cats = (community.categories || {})[st.kind] || [];
    if (!cats.includes(st.category)) st.category = '';
    clear(catSel, h('option', { value: '' }, 'All categories'), cats.map((c) => h('option', { value: c, selected: c === st.category }, c)));
    catSel.hidden = !cats.length;
    search.placeholder = `Search ${KIND_PLURAL[st.kind]}`;
    uploadBtn.lastChild.textContent = `Upload ${(KIND_LABEL[st.kind] || '').toLowerCase()}`;
  };

  clear(root,
    h('div', { class: 'toolbar catalog__toolbar' }, kindSeg,
      h('div', { class: 'toolbar__grow' }, h('label', { class: 'pl-sr', for: 'cat-q' }, 'Search'), search),
      catSel, sortSel, featuredBtn, uploadBtn),
    h('div', { class: 'catalog__summary' }, count),
    results, pager);
  fillCats();

  const syncUrl = () => { setParam('kind', kinds.length > 1 ? st.kind : null); setParam('q', st.q || null); setParam('category', st.category || null); setParam('sort', st.sort === 'popular' ? null : st.sort); setParam('page', st.offset ? st.offset / pageSize + 1 : null); setParam('featured', st.featured ? '1' : null); };

  let seq = 0;
  const load = async () => {
    const my = ++seq;
    syncUrl();
    results.setAttribute('aria-busy', 'true');
    if (!results.childElementCount) results.append(loading(`Loading ${KIND_PLURAL[st.kind]}`));
    try {
      const r = await api('/community/items', { query: { kind: st.kind, q: st.q, category: st.category, sort: st.sort, featured: st.featured ? 1 : '', limit: pageSize, offset: st.offset } });
      if (my !== seq) return;
      const total = r.total ?? r.items.length;
      count.textContent = total ? `${fmt.number(Math.min(total, st.offset + 1))}–${fmt.number(Math.min(total, st.offset + r.items.length))} of ${fmt.number(total)} ${KIND_PLURAL[st.kind]}` : '';
      if (!r.items.length) {
        const filtered = st.q || st.category || st.featured;
        clear(results, emptyState(filtered ? 'No matches' : `No ${KIND_PLURAL[st.kind]} shared yet`, filtered ? 'Try a different search or category.' : 'Approved community uploads appear here. Be the first to share one.', null, true));
      } else {
        clear(results, renderList(view, r.items, (it) => openItem(it, { onChange: () => load() })));
      }
      clear(pager,
        h('button', { type: 'button', class: 'btn btn--sm', disabled: st.offset === 0, onclick: () => { st.offset = Math.max(0, st.offset - pageSize); load(); root.scrollIntoView({ block: 'start' }); } }, '← Previous'),
        h('span', { class: 'meta' }, total ? `Page ${st.offset / pageSize + 1} of ${Math.max(1, Math.ceil(total / pageSize))}` : ''),
        h('button', { type: 'button', class: 'btn btn--sm', disabled: st.offset + pageSize >= total, onclick: () => { st.offset += pageSize; load(); root.scrollIntoView({ block: 'start' }); } }, 'Next →'));
      pager.hidden = total <= pageSize;
    } catch (e) {
      if (my !== seq) return;
      clear(results, e.code === 'network' || e.status >= 500 ? backendState({ state: e.status === 503 ? 'maintenance' : 'offline' }, `The ${opts.noun || 'catalog'}`) : errorState('Could not load items', errorText(e)));
      pager.hidden = true;
    } finally { results.removeAttribute('aria-busy'); }
  };

  let timer;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { st.q = search.value.trim(); st.offset = 0; load(); }, 300); });
  catSel.addEventListener('change', () => { st.category = catSel.value; st.offset = 0; load(); });
  sortSel.addEventListener('change', () => { st.sort = sortSel.value; st.offset = 0; load(); });
  featuredBtn.addEventListener('click', () => { st.featured = !st.featured; featuredBtn.setAttribute('aria-pressed', String(st.featured)); st.offset = 0; load(); });
  kindSeg && kindSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-kind]'); if (!b) return;
    st.kind = b.dataset.kind; st.offset = 0;
    for (const x of kindSeg.children) x.setAttribute('aria-pressed', String(x === b));
    fillCats(); clear(results); load();
  });
  uploadBtn.addEventListener('click', () => {
    const c = canUpload(st.kind, user, community);
    if (c.ok) openUpload(st.kind, community, { onDone: () => load() });
    else if (c.reason === 'signin') { location.href = 'community.html#account'; }
    else toast(c.reason, 'error');
  });

  await load();
  const deep = qparam('item');
  if (deep && /^\d+$/.test(deep)) openItem(deep, { onChange: () => load() });
}

function renderList(view, items, open) {
  if (view === 'sheet') return h('ul', { class: 'contact-sheet' }, items.map((it) => h('li', null, skinTile(it, { href: `?item=${it.id}`, onOpen: open }))));
  if (view === 'plugins') {
    return h('ol', { class: 'plugin-list' }, items.map((it) => {
      const { approved, declared } = permsOf(it);
      const m = (it.metadata && it.metadata.manifest) || {};
      const btn = h('button', { type: 'button', class: 'plugin-row__open' }, it.title);
      btn.addEventListener('click', () => open(it));
      return h('li', { class: 'plugin-row' },
        h('div', { class: 'plugin-row__main' },
          h('h3', { class: 'plugin-row__title' }, btn, h('span', { class: 'plugin-row__ver pl-mono' }, `v${it.version || m.version || '?'}`)),
          h('p', { class: 'plugin-row__desc' }, it.description || ''),
          h('p', { class: 'meta' }, authorName(it.author), h('span', { class: 'meta-sep' }, '·'), `${fmt.number(it.downloads)} downloads`, m.minClientVersion ? [h('span', { class: 'meta-sep' }, '·'), `client ≥ ${m.minClientVersion}`] : null)),
        h('div', { class: 'plugin-row__side' },
          compatTag(it.metadata && it.metadata.compatibility),
          h('ul', { class: 'tag-list', 'aria-label': 'Permissions' }, (approved || declared).length ? (approved || declared).map((p) => h('li', { class: 'tag' }, p)) : h('li', { class: 'meta' }, 'no permissions')),
          it.official ? h('span', { class: 'tag tag--accent' }, 'Official') : null));
    }));
  }
  // table
  return h('div', { class: 'table-wrap' }, h('table', { class: 'table resource-table' },
    h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Item'), h('th', { scope: 'col', class: 'col-cat' }, 'Category'), h('th', { scope: 'col', class: 'col-author' }, 'Author'), h('th', { scope: 'col', class: 'num col-size' }, 'Size'), h('th', { scope: 'col', class: 'num' }, 'Downloads'), h('th', { scope: 'col', class: 'num col-date' }, 'Updated'))),
    h('tbody', null, items.map((it) => {
      const prev = previewOf(it);
      const btn = h('button', { type: 'button', class: 'resource-table__open' }, it.title);
      btn.addEventListener('click', () => open(it));
      return h('tr', null,
        h('td', null, h('div', { class: 'resource-table__item' }, h('span', { class: 'resource-table__thumb' }, prev ? img(prev, '', { w: 48, hgt: 48 }) : h('span', { class: 'pl-label' }, (KIND_LABEL[it.kind] || '?').slice(0, 3))), h('span', null, btn, it.official ? h('span', { class: 'tag tag--accent' }, 'Official') : null))),
        h('td', { class: 'col-cat' }, it.category || '—'),
        h('td', { class: 'col-author' }, authorName(it.author)),
        h('td', { class: 'num col-size' }, fmt.bytes(it.size)),
        h('td', { class: 'num' }, fmt.number(it.downloads)),
        h('td', { class: 'num col-date' }, fmt.date(it.updatedAt || it.createdAt)));
    }))));
}
