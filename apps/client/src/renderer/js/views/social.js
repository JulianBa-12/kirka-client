import { h, icon, button, clear, tabs, empty, fmt } from '../lib/dom.js';
import { api, store, toast, fail, confirmDialog, signedIn, refreshServer } from '../lib/store.js';
import { remoteImg } from '../lib/remote-img.js';
import { go } from '../app.js';
import { report } from './marketplace.js';

const req = (m, p, b) => api('server:request', m, p, b);

function avatar(u, size = 28) {
  const el = h('span.av', { style: `width:${size}px;height:${size}px` });
  if (u && u.avatarUrl) el.append(remoteImg(u.avatarUrl));
  else el.append(h('span', (u && (u.displayName || u.username) || '?')[0].toUpperCase()));
  if (u && u.online !== undefined) el.append(h(`i.av-dot.is-${u.status || 'offline'}`));
  return el;
}
const uname = (u) => h('span.uname', h('b', u.displayName || u.username), u.displayName && u.displayName !== u.username ? h('span.muted', ` @${u.username}`) : null, u.role && u.role !== 'user' ? h('span.badge.badge-muted', u.role) : null);

export async function render(root, params = {}) {
  root.append(h('header.page-head', h('div', h('div.pl-label.page-kicker', 'Polaris community'), h('h1', 'Social'), h('p', 'Friends, direct messages and community chat on your Polaris server. This is separate from Kirka.io accounts and in-game chat.'))));
  const srv = await refreshServer();
  if (!srv.configured || srv.error || !signedIn()) {
    root.append(empty(!srv.configured ? 'No Polaris server configured' : srv.error ? 'The Polaris server is not reachable' : 'Sign in to use social features',
      srv.error || 'Social features need a Polaris community account. It is not your Kirka.io account and Polaris never asks for your Kirka password.',
      button(srv.configured && !srv.error ? 'Sign in' : 'Open account settings', () => go('settings', { tab: 'account' }), { kind: 'primary' })));
    return;
  }
  const me = store.server.user;
  let tab = ['friends', 'messages', 'groups', 'notifications', 'find'].includes(params.tab) ? params.tab : 'friends';
  const bar = h('div'); const body = h('div');
  root.append(bar, body);
  let timer = null; const stop = () => { if (timer) clearInterval(timer); timer = null; };
  const poll = (fn, ms) => { stop(); timer = setInterval(() => { if (!document.hidden) fn().catch(() => {}); }, ms); };

  async function show() {
    stop();
    let unread = 0;
    try { unread = (await req('GET', '/notifications?unread=1')).unread; } catch { /* ignore */ }
    clear(bar).append(tabs([{ id: 'friends', label: 'Friends' }, { id: 'messages', label: 'Messages' }, { id: 'groups', label: 'Community chat' }, { id: 'notifications', label: 'Notifications', badge: unread ? String(unread) : null }, { id: 'find', label: 'Find people' }], tab, (id) => { tab = id; params = {}; show(); }));
    clear(body);
    try { await ({ friends, messages, groups, notifications, find })[tab](); } catch (e) { body.append(h('div.note.note-danger', e.message)); }
  }

  async function friends() {
    const r = await req('GET', '/social/friends');
    const sec = (title, rows, emptyText) => h('section.section', h('div.section-head', h('h2', title), h('span.muted.mono.small', String(rows.length))), rows.length ? h('div.rows', rows) : h('p.muted.small', emptyText));
    body.append(
      r.incoming.length ? sec('Requests', r.incoming.map((q) => h('div.row', avatar(q.user), h('div.grow', uname(q.user), h('div.muted.small', fmt.ago(q.createdAt))),
        button('Accept', async () => { await req('POST', `/social/friends/requests/${q.id}/accept`); show(); }, { kind: 'primary', small: true }),
        button('Decline', async () => { await req('POST', `/social/friends/requests/${q.id}/decline`); show(); }, { small: true }))), '') : null,
      sec('Friends', r.friends.map(({ user: u, since }) => h('div.row', avatar(u), h('div.grow', uname(u), h('div.muted.small', u.online ? (u.activity || u.status) : u.status === 'offline' ? 'Offline' : `Friends since ${fmt.date(since)}`)),
        button('Message', () => { tab = 'messages'; params = { with: u.username }; show(); }, { small: true, iconName: 'message' }),
        button('', () => profile(u.username), { small: true, kind: 'quiet', iconName: 'users', title: 'Profile' }),
        button('', async () => { if (await confirmDialog('Remove friend', `Remove ${u.username} from your friends?`, { danger: true, confirm: 'Remove' })) { await req('DELETE', `/social/friends/${u.id}`); show(); } }, { small: true, kind: 'quiet', iconName: 'close', title: 'Remove' }))),
      'No friends yet. Use “Find people” to send a request.'),
      r.outgoing.length ? sec('Sent requests', r.outgoing.map((q) => h('div.row', avatar(q.user), h('div.grow', uname(q.user), h('div.muted.small', `Sent ${fmt.ago(q.createdAt)}`)),
        button('Cancel', async () => { await req('POST', `/social/friends/requests/${q.id}/decline`); show(); }, { small: true }))), '') : null);
  }

  async function messages() {
    const layout = h('div.chat-layout'); const listEl = h('div.chat-list'); const pane = h('div.chat-pane');
    layout.append(listEl, pane); body.append(layout);
    let active = params.with || null;
    async function loadList() {
      const r = await req('GET', '/social/conversations');
      const items = r.items.slice();
      if (active && !items.some((c) => c.user.username === active)) items.unshift({ user: { username: active }, lastMessage: null, unread: 0 });
      clear(listEl).append(items.length ? items.map((c) => h(`button.chat-conv${c.user.username === active ? '.is-active' : ''}`, { type: 'button', on: { click: () => { active = c.user.username; loadList(); openConv(); } } },
        avatar(c.user, 26), h('div.grow', h('div.inline', h('b', c.user.displayName || c.user.username), c.unread ? h('span.badge', String(c.unread)) : null),
          h('div.muted.small.ellipsis', c.lastMessage ? `${c.lastMessage.fromMe ? 'You: ' : ''}${c.lastMessage.body}` : 'New conversation')))) : h('p.muted.small', 'No conversations yet.'));
    }
    let lastId = 0;
    async function openConv() {
      clear(pane); lastId = 0;
      if (!active) { pane.append(h('p.muted', 'Pick a conversation.')); return; }
      const log = h('div.chat-log'); const input = h('input.input', { maxlength: 1000, placeholder: `Message ${active}` });
      const send = async () => { const v = input.value.trim(); if (!v) return; try { await req('POST', `/social/messages/${encodeURIComponent(active)}`, { body: v }); input.value = ''; await pull(); } catch (e) { fail(e); } };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
      pane.append(h('div.chat-head', h('b', active), h('span.grow'), button('Profile', () => profile(active), { small: true, kind: 'quiet' })), log, h('div.chat-input', input, button('Send', send, { kind: 'primary' })));
      const pull = async () => {
        const r = await req('GET', `/social/messages/${encodeURIComponent(active)}${lastId ? `?after=${lastId}` : ''}`);
        for (const m of r.items) {
          lastId = Math.max(lastId, m.id);
          const mine = m.from === me.id;
          log.append(h(`div.msg${mine ? '.is-mine' : ''}`, h('div.msg-body', m.body), h('div.msg-meta.muted', fmt.datetime(m.createdAt), !mine ? h('button.linklike', { type: 'button', on: { click: () => report('message', m.id) } }, ' · report') : null)));
        }
        if (r.items.length) log.scrollTop = log.scrollHeight;
      };
      await pull();
      poll(async () => { await pull(); }, 4000);
      input.focus();
    }
    await loadList(); await openConv();
  }

  async function groups() {
    const r = await req('GET', '/social/groups');
    const layout = h('div.chat-layout'); const listEl = h('div.chat-list'); const pane = h('div.chat-pane');
    layout.append(listEl, pane); body.append(layout);
    let active = r.items.find((g) => g.slug === 'lobby') || r.items[0];
    const drawList = () => clear(listEl).append(...r.items.map((g) => h(`button.chat-conv${active && g.id === active.id ? '.is-active' : ''}`, { type: 'button', on: { click: () => { active = g; drawList(); open(); } } },
      h('span.av', h('span', '#')), h('div.grow', h('div.inline', h('b', g.name), g.official ? h('span.badge.badge-muted', 'official') : null), h('div.muted.small', `${g.members} members${r.joined.includes(g.id) ? ' · joined' : ''}`)))),
      button('New group', createGroup, { small: true, iconName: 'plus' }));
    async function createGroup() {
      const name = h('input.input', { maxlength: 40 }); const desc = h('input.input', { maxlength: 300 });
      const { modal } = await import('../lib/store.js');
      modal({ title: 'New group', body: h('div.form', h('label.field', h('span', 'Name'), name), h('label.field', h('span', 'Description'), desc)), actions: [{ label: 'Cancel', onClick: () => {} }, { label: 'Create', kind: 'primary', onClick: async () => { try { await req('POST', '/social/groups', { name: name.value.trim(), description: desc.value.trim() }); show(); } catch (e) { fail(e); return true; } } }] });
    }
    let lastId = 0;
    async function open() {
      clear(pane); lastId = 0; stop();
      if (!active) { pane.append(h('p.muted', 'No groups exist yet.')); return; }
      const joined = r.joined.includes(active.id) || active.slug === 'lobby';
      const log = h('div.chat-log'); const input = h('input.input', { maxlength: 1000, placeholder: joined ? `Message #${active.name}` : 'Join the group to post', disabled: !joined });
      const send = async () => { const v = input.value.trim(); if (!v) return; try { await req('POST', `/social/groups/${active.id}/messages`, { body: v }); input.value = ''; await pull(); } catch (e) { fail(e); } };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
      pane.append(h('div.chat-head', h('div', h('b', active.name), h('div.muted.small', active.description || '')), h('span.grow'),
        r.joined.includes(active.id) ? button('Leave', async () => { await req('POST', `/social/groups/${active.id}/leave`); show(); }, { small: true }) : button('Join', async () => { await req('POST', `/social/groups/${active.id}/join`); show(); }, { small: true, kind: 'primary' })),
      log, h('div.chat-input', input, button('Send', send, { kind: 'primary', disabled: !joined })));
      const pull = async () => {
        const res = await req('GET', `/social/groups/${active.id}/messages${lastId ? `?after=${lastId}` : ''}`);
        for (const m of res.items) {
          lastId = Math.max(lastId, m.id);
          const mine = m.user && m.user.id === me.id;
          log.append(h(`div.gmsg${mine ? '.is-mine' : ''}`, h('div.small', h('b', m.user ? m.user.username : 'deleted'), h('span.muted', ` · ${fmt.datetime(m.createdAt)}`), !mine ? h('button.linklike', { type: 'button', on: { click: () => report('group_message', m.id) } }, ' · report') : null), h('div.text2', m.body)));
        }
        if (res.items.length) log.scrollTop = log.scrollHeight;
      };
      await pull();
      poll(pull, 5000);
    }
    drawList(); await open();
  }

  async function notifications() {
    const r = await req('GET', '/notifications');
    body.append(h('div.page-actions', button('Mark all read', async () => { await req('POST', '/notifications/read', { all: true }); show(); }, { small: true, disabled: !r.unread })),
      r.items.length ? h('div.rows', r.items.map((n) => h(`div.row${n.read ? '.is-read' : ''}`, h('span.dot', { class: n.read ? '' : 'is-on' }),
        h('div.grow', h('b', n.title), n.body ? h('div.text2.small', n.body) : null, h('div.muted.small', fmt.ago(n.createdAt))),
        n.link ? button('Open', () => openLink(n.link), { small: true }) : null))) : empty('No notifications', 'Friend requests, replies and moderation updates appear here.'));
    if (r.unread) req('POST', '/notifications/read', { ids: r.items.filter((n) => !n.read).map((n) => n.id).slice(0, 100) }).catch(() => {});
  }
  function openLink(link) {
    const m = /^polaris:\/\/([a-z]+)(?:\/([a-z]+))?(?:\/([\w.-]+))?/.exec(link);
    if (!m) return;
    if (m[1] === 'social') { if (m[2] === 'profile' && m[3]) profile(m[3]); else { tab = m[2] === 'requests' ? 'friends' : 'messages'; show(); } }
    else if (m[1] === 'marketplace') go('marketplace');
  }

  async function find() {
    const input = h('input.input', { type: 'search', placeholder: 'Username or display name (2+ characters)' });
    const out = h('div.rows');
    const run = async () => {
      const r = await req('GET', `/users/search?q=${encodeURIComponent(input.value.trim())}`);
      clear(out).append(...(r.items.length ? r.items.map((u) => h('div.row', avatar(u), h('div.grow', uname(u), u.bio ? h('div.muted.small.ellipsis', u.bio) : null),
        button('Profile', () => profile(u.username), { small: true }),
        button('Add friend', async () => { try { const x = await req('POST', '/social/friends/requests', { username: u.username }); toast(x.friends ? `You and ${u.username} are now friends` : 'Request sent', 'ok'); } catch (e) { fail(e); } }, { small: true, kind: 'primary' }))) : [h('p.muted.small', input.value.trim().length < 2 ? 'Type at least two characters.' : 'No one found.')]));
    };
    input.addEventListener('change', run);
    body.append(h('div.inline', input, button('Search', run, { iconName: 'search' })), out);
    input.focus();
  }

  async function profile(username) {
    try {
      const r = await req('GET', `/users/${encodeURIComponent(username)}`);
      const u = r.user;
      const { modal } = await import('../lib/store.js');
      const acts = []; let closeModal = () => {};
      if (r.friendship === 'none') acts.push(button('Add friend', async () => { try { await req('POST', '/social/friends/requests', { username }); toast('Request sent', 'ok'); } catch (e) { fail(e); } }, { kind: 'primary', small: true }));
      if (r.friendship !== 'self') {
        acts.push(button('Message', () => { tab = 'messages'; params = { with: username }; closeModal(); show(); }, { small: true }));
        acts.push(button('Block', async () => { if (await confirmDialog('Block user', `${username} will no longer be able to message you or send requests.`, { danger: true, confirm: 'Block' })) { try { await req('POST', '/social/blocks', { username }); toast('Blocked', 'ok'); show(); } catch (e) { fail(e); } } }, { small: true, kind: 'quiet' }));
        acts.push(button('Report', () => report('user', u.id), { small: true, kind: 'quiet' }));
      }
      closeModal = modal({ title: u.displayName || u.username, body: h('div.stack', h('div.inline', avatar(u, 56), h('div', uname(u), h('div.muted.small', `Member since ${fmt.date(u.createdAt)} · ${r.friendship}`))),
        u.private ? h('p.muted', 'This profile is private.') : h('p.text2', u.bio || 'No bio.'),
        r.items && r.items.length ? h('div.small', h('div.pl-label.muted', 'Shared items'), h('ul.plain', r.items.slice(0, 12).map((it) => h('li', `${it.title} · ${it.kind}`)))) : null,
        h('div.inline', acts)) });
    } catch (e) { fail(e); }
  }

  await show();
  return stop;
}
