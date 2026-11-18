import { h, button, clear, empty, fmt, toggle } from '../lib/dom.js';
import { api, store, toast, fail, confirmDialog, modal } from '../lib/store.js';
import * as pluginHost from '../lib/plugin-host.js';
import { go } from '../app.js';

/** Permission confirmation for a staged plugin install (local file or marketplace). Resolves to the installed plugin or null. */
export function confirmPluginInstall(staged) {
  return new Promise((resolve) => {
    let done = false;
    const checks = staged.permissions.map((p) => {
      const input = h('input', { type: 'checkbox', checked: p.allowed, disabled: !p.allowed });
      return { p, input, el: h('label.perm', input, h('span', h('b.mono', p.id), h('span.muted', ` — ${p.description}`), !p.allowed ? h('span.badge.badge-danger', 'not approved by reviewers') : null)) };
    });
    const m = staged.manifest;
    modal({
      title: `Install “${m.name}”`,
      body: h('div.stack',
        h('div.mono.small.muted', `${m.id} · v${m.version} · by ${m.author || 'unknown'} · ${fmt.bytes(staged.codeBytes)} of code`),
        m.description ? h('p.text2', m.description) : null,
        staged.reviewed ? h('div.note', 'This plugin comes from the marketplace and was reviewed by moderators. Only permissions they approved can be granted.')
          : h('div.note.note-warn', h('b', 'Unreviewed local plugin. '), 'Only install plugins from people you trust. Plugins run in an isolated sandbox without access to your files, the internet or the game page, but they can show content and use the permissions you grant.'),
        h('div.pl-label.muted', 'Permissions'),
        checks.length ? h('div.perms', checks.map((c) => c.el)) : h('p.muted.small', 'This plugin requests no permissions.')),
      onClose: () => { if (!done) resolve(null); },
      actions: [{ label: 'Cancel', onClick: () => {} }, { label: 'Install', kind: 'primary', onClick: async () => {
        try {
          const p = await api('plugins:confirm', staged.token, checks.filter((c) => c.input.checked).map((c) => c.p.id));
          done = true; await pluginHost.reload(); toast(`“${p.manifest.name}” installed`, 'ok'); resolve(p);
        } catch (e) { fail(e); done = true; resolve(null); }
      } }],
    });
  });
}

export async function render(root, params = {}) {
  const body = h('div');
  const info = store.info;
  root.append(h('header.page-head', h('div', h('div.pl-label.page-kicker', 'Extensions'), h('h1', 'Plugins'), h('p', 'Plugins add panels, overlays and small tools. Each one runs in a locked-down sandbox and only gets the permissions you grant.')),
    h('div.page-actions', button('Install from file', async () => {
      try { const staged = await api('plugins:inspectLocal'); if (staged) { await confirmPluginInstall(staged); draw(); } } catch (e) { fail(e, 'Cannot install: '); }
    }, { kind: 'primary', iconName: 'upload' }), button('Marketplace', () => go('marketplace', { kind: 'plugin' }), { iconName: 'store' }))),
  body);

  let openPanel = params.panel || null;
  async function draw() {
    pluginHost.hidePanel();
    const list = await api('plugins:list');
    clear(body);
    if (!list.length) {
      body.append(empty('No plugins installed', 'Install reviewed plugins from the marketplace, or a .polaris-plugin.json file you trust.'),
        h('section.section', h('div.section-head', h('h3', 'What plugins can and cannot do')), h('ul.plain.text2.small',
          h('li', 'They run in a sandboxed frame with no Node.js, no network access and no access to the Kirka.io page or your files.'),
          h('li', 'They talk to Polaris only through a small message API limited by their permissions.'),
          h('li', 'They can never read keys, aim, move or automate anything in the game.'),
          h('li', 'The developer guide in the repository documents the format.'))));
      return;
    }
    for (const p of list) {
      const m = p.manifest;
      const perms = h('div.perms', p.requestedPermissions.map((id) => {
        const allowed = (p.allowedPermissions || p.requestedPermissions).includes(id);
        return h('label.perm', toggle(p.grantedPermissions.includes(id), async (v) => {
          const next = v ? [...p.grantedPermissions, id] : p.grantedPermissions.filter((x) => x !== id);
          try { await api('plugins:setPermissions', p.id, next); await pluginHost.reload(); draw(); } catch (e) { fail(e); }
        }, { disabled: !allowed, label: id }), h('span', h('b.mono', id), h('span.muted', ` — ${(info.pluginPermissions.find((x) => x.id === id) || {}).description || ''}`), !allowed ? h('span.badge.badge-danger', 'not approved') : null));
      }));
      const panelSlot = h('div.plugin-slot');
      const card = h('section.section.plugin-entry',
        h('div.section-head', h('div', h('h2', m.name, ' ', h('span.mono.small.muted', `v${m.version}`)), h('div.muted.small', `${m.id} · by ${m.author || 'unknown'} · installed ${fmt.date(p.installedAt)} · ${fmt.bytes(p.codeBytes)}`)),
          h('div.inline', p.reviewed ? h('span.badge.badge-ok', 'reviewed') : h('span.badge.badge-warn', 'unreviewed'),
            toggle(p.enabled, async (v) => { await api('plugins:setEnabled', p.id, v); await pluginHost.reload(); draw(); }, { label: 'Enabled' }))),
        m.description ? h('p.text2', m.description) : null,
        p.requestedPermissions.length ? perms : h('p.muted.small', 'No permissions requested.'),
        h('div.inline',
          p.enabled && p.grantedPermissions.includes('ui.panel') ? button(openPanel === p.id ? 'Hide panel' : 'Open panel', () => { openPanel = openPanel === p.id ? null : p.id; draw(); }, { small: true }) : null,
          button('Remove', async () => { if (await confirmDialog('Remove plugin', `Remove “${m.name}” and its stored data?`, { danger: true, confirm: 'Remove' })) { await api('plugins:remove', p.id); await pluginHost.reload(); if (openPanel === p.id) openPanel = null; draw(); } }, { small: true, kind: 'danger' })),
        openPanel === p.id ? panelSlot : null);
      body.append(card);
      if (openPanel === p.id) requestAnimationFrame(() => { if (!pluginHost.showPanel(p.id, panelSlot)) panelSlot.append(h('p.muted.small', 'The plugin is not running. Check that it is enabled.')); });
    }
  }
  await draw();
  return () => pluginHost.hidePanel();
}
