'use strict';
require('./electron-stub');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const state = require('../src/main/state');
const backups = require('../src/main/backups');
const { lt } = require('../src/main/diagnostics');
const { validate } = require('../src/shared/utilities/schema');
const { ITEM_SCHEMAS } = require('../src/shared/configuration/domains');

test('backup vault: create, verify, detect tampering, restore selected sections', () => {
  state.settings.update((s) => { s.general.language = 'de'; return s; });
  state.workspaces.set({ items: [{ id: '00000000-0000-4000-8000-000000000001', name: 'Ranked', nav: { order: [], hidden: [] }, home: { order: [], hidden: [] }, quickAccess: [], toolsOpen: true }] });
  const b = backups.create({ label: 'test' });
  assert.equal(b.intact, true);
  assert.equal(b.counts.workspaces, 1);
  assert.ok(backups.list().some((x) => x.id === b.id && x.intact));

  // change state, then restore only workspaces
  state.workspaces.set({ items: [] });
  state.settings.update((s) => { s.general.language = 'en'; return s; });
  let saved = null;
  const r = backups.restore(b.id, ['workspaces'], { saveSettings: (s) => { saved = s; } });
  assert.deepEqual(r.restored, ['workspaces']);
  assert.ok(r.safetyBackup, 'a safety backup is created before restoring');
  assert.equal(state.workspaces.get().items.length, 1);
  assert.equal(saved, null, 'settings were not part of the selection');
  assert.equal(state.settings.get().general.language, 'en');

  // settings restore goes through the sanitizing writer
  backups.restore(b.id, ['settings'], { saveSettings: (s) => { saved = s; } });
  assert.equal(saved.general.language, 'de');

  // tampering is detected and blocks restore
  const file = path.join(backups.dir(), `${b.id}.json`);
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  doc.payload.settings.general.language = 'xx';
  fs.writeFileSync(file, JSON.stringify(doc));
  assert.equal(backups.list().find((x) => x.id === b.id).intact, false);
  assert.throws(() => backups.restore(b.id, null, { saveSettings: () => {} }), /damaged/);
  assert.throws(() => backups.importFile(JSON.stringify(doc)), /checksum/);
  assert.throws(() => backups.read('../../etc/passwd'), /Invalid backup id/);
});

test('install id is never written into a backup', () => {
  const b = backups.create({});
  const { doc } = backups.read(b.id);
  assert.equal(doc.payload.settings.privacy.installId, undefined);
});

test('version comparison used by diagnostics', () => {
  assert.equal(lt('1.0.0', '1.1.0'), true);
  assert.equal(lt('1.1.0', '1.1.0'), false);
  assert.equal(lt('1.10.0', '1.9.3'), false);
});

test('workspace files are validated by the shared schema', () => {
  const ok = validate(ITEM_SCHEMAS.workspace, { format: 'polaris-workspace/1', name: 'Clean', workspace: { nav: { order: ['home', 'play'], hidden: ['marketplace'] }, home: { order: [], hidden: [] }, quickAccess: ['crosshair'], toolsOpen: false } });
  assert.equal(ok.ok, true);
  const bad = validate(ITEM_SCHEMAS.workspace, { format: 'polaris-workspace/1', name: 'X', workspace: { nav: { order: ['<script>'], hidden: [] }, home: { order: [], hidden: [] }, quickAccess: [] } });
  assert.equal(bad.ok, false);
});
