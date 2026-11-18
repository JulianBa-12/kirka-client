'use strict';
// Packs session-clock.src.js into an installable .polaris-plugin.json file.
const fs = require('fs');
const path = require('path');
const pkg = {
  format: 'polaris-plugin/1',
  manifest: {
    id: 'session-clock', name: 'Session clock', version: '1.0.0', author: 'Polaris',
    description: 'Shows the session length and measured FPS, and mirrors the time on the in-game overlay.',
    permissions: ['ui.panel', 'storage', 'hud.overlay', 'game.events'], minClientVersion: '1.0.0',
  },
  code: fs.readFileSync(path.join(__dirname, 'session-clock.src.js'), 'utf8'),
};
fs.writeFileSync(path.join(__dirname, 'session-clock.polaris-plugin.json'), JSON.stringify(pkg, null, 2) + '\n');
console.log('wrote session-clock.polaris-plugin.json');
