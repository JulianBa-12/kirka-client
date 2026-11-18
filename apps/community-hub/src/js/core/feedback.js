/** Bug reports & suggestions (POST /feedback, voting). */
import { h, clear, toast, qparam, setParam } from './dom.js';
import { api, status, me, errorText } from './api.js';
import * as fmt from './format.js';
import { backendState, emptyState, errorState, loading } from './states.js';

export const STATUS = {
  open: ['Open', ''], planned: ['Planned', 'tag--accent'], 'in-progress': ['In progress', 'tag--warn'],
  done: ['Done', 'tag--ok'], wontfix: ['Won’t fix', ''], duplicate: ['Duplicate', ''],
};
export const statusTag = (s) => { const [l, c] = STATUS[s] || [s, '']; return h('span', { class: `tag ${c}` }, l); };

function field(id, label, input, { hint, optional } = {}) {
  return h('div', { class: 'field' }, h('label', { class: 'field__label', for: id }, label, optional ? h('span', { class: 'opt' }, 'optional') : null), input,
    hint ? h('p', { class: 'field__hint', id: `${id}-hint` }, hint) : null, h('p', { class: 'field__error', id: `${id}-err` }));
}
function setErr(form, input, msg) {
  input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  const e = form.querySelector(`#${input.id}-err`); if (e) e.textContent = msg || '';
  if (msg) input.setAttribute('aria-describedby', `${input.id}-err`); else if (form.querySelector(`#${input.id}-hint`)) input.setAttribute('aria-describedby', `${input.id}-hint`);
  return !!msg;
}

function guessOs() {
  const ua = navigator.userAgent;
  if (/Ubuntu/i.test(ua)) return 'Ubuntu';
  if (/Fedora/i.test(ua)) return 'Fedora';
  if (/Linux/i.test(ua)) return 'Linux';
  return '';
}

/** Submission form. type: 'bug' | 'suggestion' */
export function feedbackForm(type, { onDone, latestVersion } = {}) {
  const bug = type === 'bug';
  const p = bug ? 'bug' : 'sug';
  const title = h('input', { class: 'input', id: `${p}-title`, name: 'title', minlength: '5', maxlength: '120', required: true, autocomplete: 'off' });
  const body = h('textarea', { class: 'textarea', id: `${p}-body`, name: 'body', minlength: '10', maxlength: '5000', required: true, rows: bug ? '8' : '6' });
  body.placeholder = bug ? 'What did you do?\nWhat did you expect?\nWhat happened instead?' : 'What problem would this solve, and how would you like it to work?';
  const version = bug ? h('input', { class: 'input', id: 'bug-version', name: 'version', maxlength: '20', placeholder: latestVersion || '1.0.0', autocomplete: 'off', spellcheck: 'false' }) : null;
  const os = bug ? h('input', { class: 'input', id: 'bug-os', name: 'os', maxlength: '60', value: guessOs(), placeholder: 'Ubuntu 24.04', autocomplete: 'off' }) : null;
  const contact = h('input', { class: 'input', id: `${p}-contact`, name: 'contact', maxlength: '120', autocomplete: 'off', placeholder: 'Discord name or email' });
  const st = h('p', { class: 'form__status', role: 'status' });
  const submit = h('button', { class: 'btn btn--primary pl-chamfer', type: 'submit' }, bug ? 'Send bug report' : 'Post suggestion');
  const form = h('form', { class: 'form', novalidate: true },
    field(title.id, bug ? 'Summary' : 'Idea', title, { hint: '5–120 characters.' }),
    field(body.id, bug ? 'Steps and details' : 'Details', body, { hint: bug ? 'Steps to reproduce help most. The log is under Settings → Advanced → Logs in the client.' : '10–5000 characters, plain text.' }),
    bug ? h('div', { class: 'form__row' }, field('bug-version', 'Client version', version, { optional: true }), field('bug-os', 'Operating system', os, { optional: true })) : null,
    field(contact.id, 'Contact', contact, { optional: true, hint: 'Only visible to the team, never published.' }),
    h('div', { class: 'btn-row' }, submit), st);
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); st.textContent = ''; st.dataset.tone = '';
    const t = title.value.trim(); const b = body.value.trim();
    const bad = [
      setErr(form, title, t.length < 5 ? 'At least 5 characters.' : ''),
      setErr(form, body, b.length < 10 ? 'At least 10 characters.' : ''),
      version ? setErr(form, version, version.value.trim() && !/^\d+\.\d+\.\d+([-.][0-9A-Za-z.]+)?$/.test(version.value.trim()) ? 'Use the version from Settings → About, e.g. 1.0.0.' : '') : false,
    ].some(Boolean);
    if (bad) { form.querySelector('[aria-invalid="true"]').focus(); return; }
    submit.disabled = true;
    try {
      const item = await api('/feedback', { method: 'POST', body: { type, title: t, body: b, version: version && version.value.trim() ? version.value.trim() : undefined, os: os && os.value.trim() ? os.value.trim() : undefined, contact: contact.value.trim() || undefined } });
      form.reset(); if (os) os.value = guessOs();
      st.dataset.tone = 'ok'; st.textContent = bug ? `Thanks — filed as #${item.id}.` : `Posted as #${item.id}.`;
      onDone && onDone(item);
    } catch (err) {
      st.dataset.tone = 'error';
      st.textContent = err.status === 429 ? 'You have sent several reports in the last hour. Sign in or try again later.' : errorText(err);
    } finally { submit.disabled = false; }
  });
  return form;
}

/**
 * Mount list + form. opts: { type, listHost, formHost, renderItem(item, ctx), filters: [...statuses] }
 */
export async function mountFeedback({ type, listHost, formHost, renderItem, defaultSort = 'top', latestVersion }) {
  const s = await status();
  if (s.state !== 'online') {
    const what = type === 'bug' ? 'Bug reporting' : 'Suggestions and voting';
    clear(listHost, backendState(s, what));
    clear(formHost, h('p', { class: 'meta' }, 'The form is available when the community backend is reachable.', type === 'bug' ? [' Meanwhile you can report issues on ', h('a', { href: 'https://github.com/JulianBa-12/kirka-client/issues', rel: 'noopener noreferrer', target: '_blank' }, 'GitHub'), '.'] : null));
    return;
  }
  const user = await me();
  let sort = ['top', 'new'].includes(qparam('sort')) ? qparam('sort') : defaultSort;
  let st = Object.keys(STATUS).includes(qparam('status')) ? qparam('status') : '';
  let offset = 0; const PAGE = 25;

  const sortSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Sort' }, [['top', 'Most votes'], ['new', 'Newest']].map(([v, l]) => h('button', { type: 'button', 'aria-pressed': String(v === sort), dataset: { v } }, l)));
  const statusSel = h('select', { class: 'select', 'aria-label': 'Status', id: `${type}-status` }, h('option', { value: '' }, 'Any status'), Object.entries(STATUS).map(([k, [l]]) => h('option', { value: k, selected: k === st }, l)));
  const count = h('p', { class: 'meta toolbar__count', 'aria-live': 'polite' });
  const list = h('div');
  const more = h('button', { type: 'button', class: 'btn', hidden: true }, 'Load more');
  clear(listHost, h('div', { class: 'toolbar' }, sortSeg, statusSel, count), list, h('div', { class: 'pager' }, more));

  const ctx = { user, vote: null };
  ctx.vote = async (item, btn, countEl) => {
    if (!user) { toast('Sign in on the Community page to vote.'); return; }
    btn.disabled = true;
    try {
      const r = await api(`/feedback/${item.id}/vote`, { method: item.voted ? 'DELETE' : 'POST', auth: 'required' });
      item.voted = r.voted; item.votes = r.votes;
      btn.setAttribute('aria-pressed', String(!!r.voted)); countEl.textContent = fmt.number(r.votes);
      btn.setAttribute('aria-label', `${r.voted ? 'Remove vote' : 'Vote'} for “${item.title}” (${r.votes} votes)`);
    } catch (e) { toast(errorText(e), 'error'); } finally { btn.disabled = false; }
  };

  let container = null;
  const load = async (reset) => {
    if (reset) { offset = 0; clear(list, loading('Loading')); }
    setParam('sort', sort === defaultSort ? null : sort); setParam('status', st || null);
    try {
      const r = await api('/feedback', { query: { type, sort, status: st, limit: PAGE, offset } });
      if (reset) {
        clear(list);
        if (!r.items.length) { list.append(emptyState(st ? 'Nothing with this status' : type === 'bug' ? 'No bug reports yet' : 'No suggestions yet', st ? 'Try another status filter.' : type === 'bug' ? 'Found something broken? Use the form to file the first report.' : 'Have an idea for Polaris? Post the first one.', null, true)); }
        container = h('ol', { class: `fb-list fb-list--${type}` }); list.append(container);
      }
      for (const it of r.items) container.append(renderItem(it, ctx));
      offset += r.items.length;
      count.textContent = r.total ? `${fmt.number(r.total)} ${type === 'bug' ? (r.total === 1 ? 'report' : 'reports') : (r.total === 1 ? 'suggestion' : 'suggestions')}` : '';
      more.hidden = offset >= r.total;
    } catch (e) { clear(list, errorState('Could not load the list', errorText(e))); }
  };
  sortSeg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; sort = b.dataset.v; for (const x of sortSeg.children) x.setAttribute('aria-pressed', String(x === b)); load(true); });
  statusSel.addEventListener('change', () => { st = statusSel.value; load(true); });
  more.addEventListener('click', () => load(false));

  clear(formHost, user ? null : h('p', { class: 'field__hint fb-anon' }, 'You can post without an account (3 per hour). ', h('a', { href: 'community.html#account' }, 'Sign in'), type === 'suggestion' ? ' to vote and to be credited.' : ' to be credited and follow up.'),
    feedbackForm(type, { latestVersion, onDone: () => { sort = 'new'; for (const x of sortSeg.children) x.setAttribute('aria-pressed', String(x.dataset.v === 'new')); load(true); } }));
  await load(true);
}
