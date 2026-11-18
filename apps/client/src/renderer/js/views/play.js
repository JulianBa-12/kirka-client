import { h, icon, button, fmt, clear, row, toggle, sectionHead } from '../lib/dom.js';
import { api, store, flag, subscribe, updateSettings, toast } from '../lib/store.js';
import { go } from '../app.js';

export async function render(root) {
  const s = store.settings;
  const status = h('div.play-status');
  const drawStatus = async () => {
    const g = await api('game:status');
    const m = store.metrics || {};
    clear(status).append(
      h('div.readouts',
        h('div.readout', h('div.pl-label.readout-label', 'Game view'), h('div.readout-value', g.started ? (store.game.inMatch ? 'In match' : 'Running') : 'Idle'), h('div.readout-sub', g.url ? new URL(g.url).host : 'not loaded')),
        h('div.readout', h('div.pl-label.readout-label', 'Frame rate'), h('div.readout-value', m.fps == null ? '—' : Math.round(m.fps), h('small', 'fps')), h('div.readout-sub', m.low1 == null ? 'measured in game view' : `1% low ${Math.round(m.low1)}`)),
        h('div.readout', h('div.pl-label.readout-label', 'Network RTT'), h('div.readout-value', m.rtt == null ? '—' : Math.round(m.rtt), h('small', 'ms')), h('div.readout-sub', 'HTTPS to kirka.io')),
        h('div.readout', h('div.pl-label.readout-label', 'Ads blocked'), h('div.readout-value', g.blocked), h('div.readout-sub', `${g.swapped} resource swaps`))));
  };
  await drawStatus();

  const quick = [
    ['crosshairEnabled', 'Polaris crosshair', 'Draws your crosshair from Crosshair Studio on top of the game.', 'crosshairStudio'],
    ['hideGameCrosshair', 'Hide Kirka crosshair', 'Hides the built-in static crosshair while the Polaris crosshair is on.', 'crosshairStudio'],
    ['adblock', 'Ad filtering', 'Blocks third-party ad networks and hides ad slots. Kirka.io’s own requests are never blocked.', 'adblock'],
    ['resourceSwapper', 'Resource swapper', 'Replaces cosmetic images and sounds with files from your library.', 'resourceSwapper'],
    ['menuBackground', 'Menu background', 'Shows your current Polaris background behind Kirka’s main menu (best effort — depends on the game’s page layout).', 'backgroundStudio'],
  ].filter((q) => flag(q[3]).visible);

  root.append(
    h('header.page-head',
      h('div', h('div.pl-label.page-kicker', 'Kirka.io'), h('h1', 'Play'), h('p', 'Polaris loads the official Kirka.io website in an isolated game view. Your Kirka account, inventory and progress stay on Kirka’s servers.')),
      h('div.page-actions',
        button('Reload', () => api('game:reload'), { iconName: 'refresh', disabled: !store.game.started }),
        button('Stop', async () => { await api('game:stop'); store.game.started = false; drawStatus(); }, { iconName: 'pause', disabled: !store.game.started }),
        button(store.game.started ? 'Return to game' : 'Launch', () => api('game:start'), { kind: 'primary', iconName: 'play' }))),
    h('section.section', status),
    h('div.split',
      h('div',
        h('section.section', sectionHead('In-game', 'Quick toggles'), h('div.rows', quick.map(([k, title, desc, f]) => row(title, desc, toggle(s.game[k], (v) => updateSettings((st) => { st.game[k] = v; }), { disabled: !flag(f).enabled })))) ),
        h('section.section', sectionHead('Shortcuts', 'Keyboard'),
          h('div.rows', Object.entries({ toggleShell: 'Switch between game and Polaris', fullscreen: 'Fullscreen', reloadGame: 'Reload the game view', record: 'Start / stop recording', bookmark: 'Bookmark the current recording', screenshot: 'Screenshot' })
            .map(([k, label]) => row(label, null, h('span.kbd', s.game.keybinds[k] || '—')))),
          h('p.muted.small', 'Shortcuts only work while the Polaris window is focused. Change them in Settings → Game.'))),
      h('aside.stack',
        h('div.frame.panel-pad.stack',
          h('div.pl-label.muted', 'Fair play'),
          h('p.text2.small', 'Polaris only draws overlays and styles the page. It never reads game memory, changes hitboxes, automates input or bypasses anti-cheat.'),
          h('p.text2.small', 'If Kirka.io shows a sign-in window from Google or Discord, it opens in a separate isolated popup.')),
        h('div.frame.panel-pad.stack',
          h('div.pl-label.muted', 'Game data'),
          h('p.text2.small', 'Cookies and game storage live in a separate profile. Clearing it signs you out of Kirka.io inside Polaris.'),
          h('div.inline', button('Clear cache', async () => { await api('app:clearCache'); toast('Game cache cleared', 'ok'); }, { small: true }),
            button('Clear game data', async () => { await api('app:clearGameData'); toast('Game data cleared', 'ok'); }, { small: true, kind: 'danger' }))),
        button('Open Performance Center', () => go('performance'), { iconName: 'gauge' }))));

  const offs = [subscribe('metrics', () => drawStatus()), subscribe('game', () => drawStatus())];
  return () => offs.forEach((o) => o());
}
