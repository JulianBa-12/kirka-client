'use strict';
require('./electron-stub');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const library = require('../src/main/library');
const plugins = require('../src/main/plugins');
const remote = require('../src/main/remote');
const { signPayload, generateKeyPair } = require('../src/shared/utilities/signing');
const { DEFAULTS } = require('../src/shared/configuration/domains');

const zlib = require('node:zlib');
function png(w, h) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const PNG_1x1 = png(64, 64);

test('file type is detected from magic bytes, not the name', () => {
  assert.equal(library.sniff(PNG_1x1).mime, 'image/png');
  assert.equal(library.sniff(Buffer.from('GIF89a......')).mime, 'image/gif');
  assert.equal(library.sniff(Buffer.from('#!/bin/sh\nrm -rf /')), null);
  assert.equal(library.sniff(Buffer.from('{"a":1}')).mime, 'application/json');
});

test('library accepts a PNG skin and rejects disguised or wrong-kind files', () => {
  const it = library.add({ kind: 'skin', name: 'Test skin', data: PNG_1x1 });
  assert.equal(it.kind, 'skin');
  assert.ok(library.list('skin').some((x) => x.id === it.id));
  assert.ok(library.read(it.id).equals(PNG_1x1));
  assert.throws(() => library.add({ kind: 'skin', name: 'fake', data: Buffer.from('MZ\x90\x00not a png') }));
  assert.throws(() => library.add({ kind: 'nope', name: 'x', data: PNG_1x1 }), /Unknown library kind/);
  assert.throws(() => library.add({ kind: 'skin', name: 'tiny', data: png(1, 1) }), /64×64 or 128×128/);
  library.remove(it.id);
  assert.equal(library.get(it.id), null);
});

const pluginPackage = (over = {}) => JSON.stringify({
  format: 'polaris-plugin/1',
  manifest: { id: 'test-clock', name: 'Test clock', version: '1.0.0', author: 'tests', description: 'Shows the time', permissions: ['ui.panel'], minClientVersion: '1.0.0', ...over },
  code: 'polaris.root.textContent = "hi"',
});

test('plugin packages are validated before installation', () => {
  assert.throws(() => plugins.parsePackage('not json'), /not valid JSON/);
  assert.throws(() => plugins.parsePackage(JSON.stringify({ format: 'polaris-plugin/1', manifest: {}, code: '' })), /Invalid plugin package/);
  assert.throws(() => plugins.parsePackage(pluginPackage({ minClientVersion: '9.0.0' })), /needs Polaris 9\.0\.0/);
  assert.throws(() => plugins.parsePackage(pluginPackage({ permissions: ['fs.write'] })), /Invalid plugin package/);
  const p = plugins.parsePackage(pluginPackage());
  assert.equal(p.manifest.id, 'test-clock');
});

test('remote bundles signed by an unknown key are rejected', () => {
  const k = generateKeyPair();
  const env = signPayload({ target: 'client', sequence: 1, domains: {} }, k.privateKey, k.publicKey);
  assert.throws(() => remote.accept(env, 'client'), /untrusted signing key/);
});

test('effective configuration falls back to defaults for invalid domains', () => {
  const good = JSON.parse(JSON.stringify(DEFAULTS['client.home']));
  const eff = remote.effective({ domains: { 'client.home': { data: good }, 'client.features': { data: { flags: 'nope' } }, 'not.a.domain': { data: {} } } });
  assert.deepEqual(eff.config['client.home'], good);
  assert.deepEqual(eff.config['client.features'], DEFAULTS['client.features']);
  assert.equal(eff.rejected.length, 1);
  assert.equal(eff.config['not.a.domain'], undefined);
});

test('sha256 helper sanity (used for marketplace integrity checks)', () => {
  assert.equal(crypto.createHash('sha256').update(PNG_1x1).digest('hex').length, 64);
});
