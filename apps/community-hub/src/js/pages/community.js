import { boot } from '../core/chrome.js';
import { h, clear, $, qparam, toast } from '../core/dom.js';
import { api, status, me, login, register, logout, setMe, errorText, ApiError } from '../core/api.js';
import * as fmt from '../core/format.js';
import { backendState, emptyState, errorState, loading } from '../core/states.js';
import { avatar, KIND_LABEL, skinTile } from '../core/items.js';

await boot('community');
const body = $('[data-bind="body"]');
const s = await status();

const itemHref = (it) => (it.kind === 'skin' ? `skins.html?item=${it.id}` : it.kind === 'plugin' ? `plugins.html?item=${it.id}` : `resources.html?kind=${it.kind}&item=${it.id}`);
const sec = (num, title, id) => h('p', { class: 'sec-label pl-label', id }, h('span', { class: 'sec-label__num' }, num), title);

if (s.state !== 'online') {
  clear(body, h('div', { class: 'community__offline' }, backendState(s, 'Accounts, profiles, uploads and groups'),
    h('p', { class: 'community__offline-note' }, 'Nothing on this page is cached or simulated: when the backend is unreachable there are no profiles or activity to show. ', h('a', { href: 'news.html' }, 'News'), ', ', h('a', { href: 'changelog.html' }, 'the changelog'), ' and ', h('a', { href: 'downloads.html' }, 'downloads'), ' are unaffected.')));
} else {
  renderStats();
  await render();
  window.addEventListener('polaris:session', () => render());
}

async function renderStats() {
  try {
    const st = await api('/stats', { auth: 'none' });
    clear($('[data-bind="stats"]'), h('dl', { class: 'spec community__stats' },
      [['Members', st.users], ['Skins', st.skins], ['Resources', st.resources], ['Plugins', st.plugins], ['Downloads', st.downloads]]
        .map(([k, v]) => [h('dt', { class: 'pl-label' }, k), h('dd', null, fmt.number(v))])));
  } catch { /* stats are optional */ }
}

async function render() {
  const user = await me({ refresh: true });
  const aside = h('aside', { class: 'community__aside', id: user ? 'profile' : 'account', 'aria-labelledby': 'acct-h' });
  const main = h('div', { class: 'community__main' });
  clear(body, aside, main);
  if (user) profilePanel(aside, user); else authPanel(aside);

  const viewName = qparam('u');
  if (viewName) await publicProfile(main, viewName, user);
  activity(main);
  if (user) myUploads(main, user);
  groups(main, user);
  if (location.hash === '#account' || location.hash === '#profile') aside.scrollIntoView({ block: 'start' });
}

// ------------------------------------------------------------------ auth
function field(id, label, input, hint) {
  return h('div', { class: 'field' }, h('label', { class: 'field__label', for: id }, label), input, hint ? h('p', { class: 'field__hint', id: `${id}-hint` }, hint) : null, h('p', { class: 'field__error', id: `${id}-err` }));
}
function setErr(form, input, msg) {
  input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  const e = form.querySelector(`#${input.id}-err`); if (e) e.textContent = msg || '';
  const ids = [form.querySelector(`#${input.id}-hint`) ? `${input.id}-hint` : '', msg ? `${input.id}-err` : ''].filter(Boolean).join(' ');
  if (ids) input.setAttribute('aria-describedby', ids); else input.removeAttribute('aria-describedby');
  return !!msg;
}

function authPanel(host) {
  const regOpen = !(s.health && s.health.registrationOpen === false);
  let mode = location.hash === '#register' && regOpen ? 'register' : 'login';
  const tabs = h('div', { class: 'seg auth__tabs', role: 'group', 'aria-label': 'Account' },
    h('button', { type: 'button', dataset: { m: 'login' } }, 'Sign in'),
    h('button', { type: 'button', dataset: { m: 'register' }, disabled: !regOpen }, 'Create account'));
  const formHost = h('div');
  clear(host, h('h2', { class: 'community__h', id: 'acct-h' }, 'Your account'), tabs, formHost,
    regOpen ? null : h('p', { class: 'field__hint' }, 'Registration is closed at the moment.'));

  const draw = () => {
    for (const b of tabs.children) b.setAttribute('aria-pressed', String(b.dataset.m === mode));
    clear(formHost, mode === 'login' ? loginForm() : registerForm());
  };
  tabs.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || b.disabled) return; mode = b.dataset.m; draw(); formHost.querySelector('input')?.focus(); });
  draw();
}

function loginForm() {
  const u = h('input', { class: 'input', id: 'li-user', name: 'username', autocomplete: 'username', required: true, maxlength: '20', autocapitalize: 'none', spellcheck: 'false' });
  const p = h('input', { class: 'input', id: 'li-pass', name: 'password', type: 'password', autocomplete: 'current-password', required: true });
  const totp = h('input', { class: 'input', id: 'li-totp', name: 'totp', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '12' });
  const totpField = field('li-totp', 'Two-factor code', totp, 'Six digits from your authenticator app, or a recovery code.'); totpField.hidden = true;
  const st = h('p', { class: 'form__status', role: 'status' });
  const btn = h('button', { class: 'btn btn--primary pl-chamfer', type: 'submit' }, 'Sign in');
  const form = h('form', { class: 'form auth__form', novalidate: true }, field('li-user', 'Username', u), field('li-pass', 'Password', p), totpField, h('div', { class: 'btn-row' }, btn), st);
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); st.textContent = '';
    const bad = [setErr(form, u, u.value.trim() ? '' : 'Enter your username.'), setErr(form, p, p.value ? '' : 'Enter your password.')].some(Boolean);
    if (bad) { form.querySelector('[aria-invalid="true"]').focus(); return; }
    btn.disabled = true;
    try {
      const user = await login(u.value.trim(), p.value, totp.value.trim());
      toast(`Signed in as @${user.username}.`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'totp_required') { totpField.hidden = false; totp.focus(); st.dataset.tone = ''; st.textContent = totp.value ? 'That code was not accepted.' : 'This account uses two-factor authentication.'; }
      else { st.dataset.tone = 'error'; st.textContent = errorText(err); }
    } finally { btn.disabled = false; }
  });
  return form;
}

function registerForm() {
  const u = h('input', { class: 'input', id: 're-user', name: 'username', autocomplete: 'username', required: true, minlength: '3', maxlength: '20', pattern: '[A-Za-z0-9_]{3,20}', autocapitalize: 'none', spellcheck: 'false' });
  const em = h('input', { class: 'input', id: 're-email', name: 'email', type: 'email', autocomplete: 'email', maxlength: '254' });
  const p = h('input', { class: 'input', id: 're-pass', name: 'password', type: 'password', autocomplete: 'new-password', required: true, minlength: '10' });
  const p2 = h('input', { class: 'input', id: 're-pass2', name: 'password2', type: 'password', autocomplete: 'new-password', required: true });
  const agree = h('input', { type: 'checkbox', id: 're-agree', name: 'agree', required: true });
  const st = h('p', { class: 'form__status', role: 'status' });
  const btn = h('button', { class: 'btn btn--primary pl-chamfer', type: 'submit' }, 'Create account');
  const form = h('form', { class: 'form auth__form', novalidate: true },
    field('re-user', 'Username', u, '3–20 characters: letters, numbers and underscores.'),
    field('re-email', 'Email (optional)', em, 'Only used for account recovery.'),
    field('re-pass', 'Password', p, 'At least 10 characters.'),
    field('re-pass2', 'Repeat password', p2),
    h('div', { class: 'check' }, agree, h('label', { for: 're-agree' }, 'I will only share work I made or may share, and I understand Polaris is not affiliated with Kirka.io.')),
    h('p', { class: 'field__error', id: 're-agree-err' }),
    h('div', { class: 'btn-row' }, btn), st);
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); st.textContent = '';
    const bad = [
      setErr(form, u, /^[A-Za-z0-9_]{3,20}$/.test(u.value.trim()) ? '' : '3–20 letters, numbers or underscores.'),
      setErr(form, em, !em.value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em.value.trim()) ? '' : 'That does not look like an email address.'),
      setErr(form, p, p.value.length >= 10 ? '' : 'Use at least 10 characters.'),
      setErr(form, p2, p2.value === p.value ? '' : 'Passwords do not match.'),
      setErr(form, agree, agree.checked ? '' : 'Please confirm.'),
    ].some(Boolean);
    if (bad) { form.querySelector('[aria-invalid="true"]').focus(); return; }
    btn.disabled = true;
    try { const user = await register(u.value.trim(), p.value, em.value.trim()); toast(`Welcome, @${user.username}.`); }
    catch (err) { st.dataset.tone = 'error'; st.textContent = errorText(err); }
    finally { btn.disabled = false; }
  });
  return form;
}

// ------------------------------------------------------------------ own profile
function profilePanel(host, user) {
  const dn = h('input', { class: 'input', id: 'pf-name', name: 'displayName', maxlength: '32', value: user.displayName || '' });
  const bio = h('textarea', { class: 'textarea', id: 'pf-bio', name: 'bio', maxlength: '300', rows: '4' }); bio.value = user.bio || '';
  const priv = (user.privacy && user.privacy.profile) || 'public';
  const vis = h('select', { class: 'select', id: 'pf-vis', name: 'profile' }, [['public', 'Public'], ['friends', 'Friends only'], ['private', 'Private']].map(([v, l]) => h('option', { value: v, selected: v === priv }, l)));
  const st = h('p', { class: 'form__status', role: 'status' });
  const form = h('form', { class: 'form', novalidate: true },
    field('pf-name', 'Display name', dn), field('pf-bio', 'Bio', bio, 'Up to 300 characters, plain text.'), field('pf-vis', 'Profile visibility', vis),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn btn--sm', type: 'submit' }, 'Save profile')), st);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (setErr(form, dn, dn.value.trim().length > 32 ? 'At most 32 characters.' : '')) return;
    try {
      const r = await api('/auth/me', { method: 'PATCH', auth: 'required', body: { displayName: dn.value.trim(), bio: bio.value.trim(), privacy: { ...(user.privacy || {}), profile: vis.value } } });
      st.dataset.tone = 'ok'; st.textContent = 'Saved.'; setMe(r.user);
    } catch (err) { st.dataset.tone = 'error'; st.textContent = errorText(err); }
  });
  const out = h('button', { type: 'button', class: 'btn btn--sm btn--ghost' }, 'Sign out');
  out.addEventListener('click', async () => { await logout(); toast('Signed out.'); });

  clear(host,
    h('h2', { class: 'community__h', id: 'acct-h' }, 'Your profile'),
    h('div', { class: 'profile-card' }, avatar(user, true),
      h('div', null, h('p', { class: 'profile-card__name' }, user.displayName || user.username), h('p', { class: 'meta' }, `@${user.username}`))),
    h('dl', { class: 'spec' },
      h('dt', { class: 'pl-label' }, 'Role'), h('dd', null, user.role || 'user'),
      h('dt', { class: 'pl-label' }, 'Member since'), h('dd', null, fmt.date(user.createdAt)),
      h('dt', { class: 'pl-label' }, 'Two-factor'), h('dd', null, user.twoFactorEnabled ? 'on' : 'off'),
      user.restrictions && (user.restrictions.upload || user.restrictions.chat) ? [h('dt', { class: 'pl-label' }, 'Restrictions'), h('dd', null, [user.restrictions.upload ? 'uploads' : '', user.restrictions.chat ? 'chat' : ''].filter(Boolean).join(', '))] : null),
    h('details', { class: 'profile-edit' }, h('summary', { class: 'pl-label' }, 'Edit profile'), form),
    h('p', { class: 'field__hint' }, 'Security settings (password, two-factor, sessions, data export) are in the client under Settings → Account.'),
    h('div', { class: 'btn-row' }, out));
}

// ------------------------------------------------------------------ public profile (?u=)
async function publicProfile(main, username, user) {
  const box = h('section', { class: 'community__block', 'aria-labelledby': 'pp-h' }, sec('@', `Profile · ${username}`, 'pp-h'), loading('Loading profile'));
  main.append(box);
  if (!user) { clear(box, sec('@', `Profile · ${username}`, 'pp-h'), emptyState('Sign in to view profiles', 'Profiles are only visible to signed-in members, to respect privacy settings.', null, true)); return; }
  try {
    const r = await api(`/users/${encodeURIComponent(username)}`, { auth: 'required' });
    const u = r.user;
    const statusLabel = u.status && u.status !== 'offline' ? u.status : null;
    clear(box, sec('@', 'Profile', 'pp-h'),
      h('div', { class: 'pub-profile' },
        avatar(u, true),
        h('div', { class: 'pub-profile__main' },
          h('h2', { class: 'pub-profile__name' }, u.displayName || u.username),
          h('p', { class: 'meta' }, `@${u.username}`, h('span', { class: 'meta-sep' }, '·'), u.role, h('span', { class: 'meta-sep' }, '·'), `joined ${fmt.date(u.createdAt)}`, statusLabel ? [h('span', { class: 'meta-sep' }, '·'), h('span', { class: 'dot dot--ok' }), statusLabel] : null),
          u.bio ? h('p', { class: 'pub-profile__bio' }, u.bio) : null,
          r.friendship && r.friendship !== 'none' ? h('p', { class: 'tag' }, r.friendship) : null)),
      r.items && r.items.length
        ? h('ul', { class: 'contact-sheet contact-sheet--strip' }, r.items.slice(0, 12).map((it) => h('li', null, skinTile(it, { href: itemHref(it) }))))
        : h('p', { class: 'meta' }, 'No public uploads.'));
  } catch (e) {
    clear(box, sec('@', `Profile · ${username}`, 'pp-h'), errorState(e.status === 404 ? 'No such member' : e.status === 403 ? 'This profile is private' : 'Could not load profile', e.status === 404 ? `Nobody is called @${username}.` : errorText(e)));
  }
}

// ------------------------------------------------------------------ activity
async function activity(main) {
  const list = h('div', null, loading('Loading recent uploads'));
  main.append(h('section', { class: 'community__block', 'aria-labelledby': 'act-h' }, sec('01', 'Recent activity', 'act-h'), h('h2', { class: 'community__h' }, 'Latest community uploads'), list));
  try {
    const r = await api('/community/items', { query: { sort: 'new', limit: 12 } });
    if (!r.items.length) { clear(list, emptyState('No uploads yet', 'Approved skins, resources and plugins will be listed here as they are shared.', [h('a', { class: 'btn btn--sm', href: 'skins.html' }, 'Share a skin')], true)); return; }
    clear(list, h('ol', { class: 'activity' }, r.items.map((it) => h('li', { class: 'activity__row' },
      h('time', { class: 'meta activity__time', datetime: it.createdAt }, fmt.relative(it.createdAt)),
      h('span', { class: 'tag activity__kind' }, KIND_LABEL[it.kind] || it.kind),
      h('a', { class: 'activity__title', href: itemHref(it) }, it.title),
      h('a', { class: 'activity__author meta', href: `community.html?u=${encodeURIComponent(it.author ? it.author.username : '')}` }, it.author ? `@${it.author.username}` : '')))));
  } catch (e) { clear(list, errorState('Could not load activity', errorText(e))); }
}

async function myUploads(main, user) {
  const list = h('div', null, loading('Loading your uploads'));
  main.append(h('section', { class: 'community__block', 'aria-labelledby': 'mine-h' }, sec('02', 'Your uploads', 'mine-h'), list));
  try {
    const r = await api('/community/items', { auth: 'required', query: { author: user.username, mine: 1, sort: 'new', limit: 50 } });
    if (!r.items.length) { clear(list, h('p', { class: 'meta' }, 'You have not uploaded anything yet. Use the Upload button in the ', h('a', { href: 'skins.html' }, 'skin gallery'), ', ', h('a', { href: 'resources.html' }, 'resource library'), ' or ', h('a', { href: 'plugins.html' }, 'plugin directory'), '.')); return; }
    clear(list, h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Title'), h('th', { scope: 'col' }, 'Type'), h('th', { scope: 'col' }, 'Status'), h('th', { scope: 'col', class: 'num' }, 'Downloads'))),
      h('tbody', null, r.items.map((it) => h('tr', null,
        h('td', null, it.status === 'approved' ? h('a', { href: itemHref(it) }, it.title) : it.title),
        h('td', null, KIND_LABEL[it.kind] || it.kind),
        h('td', null, h('span', { class: `tag ${it.status === 'approved' ? 'tag--ok' : it.status === 'rejected' ? 'tag--danger' : 'tag--warn'}` }, it.status)),
        h('td', { class: 'num' }, fmt.number(it.downloads))))))));
  } catch (e) { clear(list, errorState('Could not load your uploads', errorText(e))); }
}

// ------------------------------------------------------------------ groups
async function groups(main, user) {
  const list = h('div', null);
  main.append(h('section', { class: 'community__block', 'aria-labelledby': 'grp-h' }, sec(user ? '03' : '02', 'Groups', 'grp-h'), h('h2', { class: 'community__h' }, 'Groups'), list));
  if (!user) { clear(list, emptyState('Sign in to see groups', 'Groups and the community lobby are available to members. Chat happens in the Polaris Client under Social.', null, true)); return; }
  clear(list, loading('Loading groups'));
  const load = async () => {
    try {
      const r = await api('/social/groups', { auth: 'required' });
      const joined = new Set(r.joined || []);
      if (!r.items.length) { clear(list, h('p', { class: 'meta' }, 'No groups yet.')); return; }
      clear(list, h('ol', { class: 'groups' }, r.items.map((g) => {
        const isIn = joined.has(g.id);
        const btn = h('button', { type: 'button', class: `btn btn--sm${isIn ? '' : ' btn--primary pl-chamfer'}` }, isIn ? 'Leave' : 'Join');
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try { await api(`/social/groups/${g.id}/${isIn ? 'leave' : 'join'}`, { method: 'POST', auth: 'required' }); await load(); }
          catch (e) { toast(errorText(e), 'error'); btn.disabled = false; }
        });
        return h('li', { class: 'group' },
          h('div', { class: 'group__main' },
            h('h3', { class: 'group__name' }, g.name, g.official ? h('span', { class: 'tag tag--accent' }, 'Official') : null, g.visibility === 'private' ? h('span', { class: 'tag' }, 'Private') : null),
            g.description ? h('p', { class: 'group__desc' }, g.description) : null,
            h('p', { class: 'meta' }, `${fmt.number(g.members)} ${g.members === 1 ? 'member' : 'members'}`, g.owner ? [h('span', { class: 'meta-sep' }, '·'), `by @${g.owner.username}`] : null)),
          g.slug === 'lobby' && isIn ? h('span', { class: 'meta' }, 'Joined') : btn);
      })), h('p', { class: 'field__hint groups__hint' }, 'Group chat runs in the Polaris Client (Social → Groups).'));
    } catch (e) { clear(list, errorState('Could not load groups', errorText(e))); }
  };
  await load();
}
