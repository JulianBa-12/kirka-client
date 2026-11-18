'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { canonical, signPayload, verifyEnvelope, generateKeyPair, compareVersions } = require('../src/shared/utilities/signing');
const { sanitizeCss } = require('../src/shared/utilities/css-sanitize');
const { validateDomain, DEFAULTS } = require('../src/shared/configuration/domains');
const trust = require('../src/shared/configuration/trust.json');

test('canonical JSON is key-order independent', () => {
  assert.equal(canonical({ b: 1, a: [2, { d: 1, c: 2 }] }), canonical({ a: [2, { c: 2, d: 1 }], b: 1 }));
});

test('signed envelopes verify only with a trusted key and untampered payload', () => {
  const k = generateKeyPair();
  const env = signPayload({ target: 'client', sequence: 3 }, k.privateKey, k.publicKey);
  const keys = [{ keyId: k.keyId, publicKey: k.publicKey }];
  assert.equal(verifyEnvelope(env, keys).sequence, 3);
  assert.throws(() => verifyEnvelope(env, trust.keys), /untrusted signing key/);
  const tampered = { ...env, payload: env.payload.replace('3', '4') };
  assert.throws(() => verifyEnvelope(tampered, keys), /signature verification failed/);
  assert.throws(() => verifyEnvelope({ format: 'x' }, keys), /unknown envelope format/);
});

test('shipped trust store contains a valid Ed25519 public key', () => {
  assert.ok(trust.keys.length >= 1);
  for (const k of trust.keys) { assert.match(k.keyId, /^[0-9a-f]{16}$/); assert.match(k.publicKey, /BEGIN PUBLIC KEY/); }
});

test('version comparison', () => {
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  assert.equal(compareVersions('1.2.0', '1.10.0'), -1);
  assert.equal(compareVersions('2.0.0', '1.9.9'), 1);
});

test('CSS sanitizer rejects script vectors, remote resources and unscoped selectors', () => {
  for (const bad of ['.pl-a{background:url(https://evil.example/x.png)}', '@import "x.css";', '.pl-a{behavior:url(x.htc)}', '.pl-a{width:expression(alert(1))}', '.pl-a{color:red}</style><script>alert(1)</script>', 'body{color:red}', '.pl-a::after{content:attr(data-token)}']) {
    assert.equal(sanitizeCss(bad).ok, false, bad);
  }
  const good = sanitizeCss('.pl-panel { color: #fff; } :root { --pl-accent: #00d9ff; }');
  assert.equal(good.ok, true, JSON.stringify(good.errors));
  assert.match(good.css, /--pl-accent/);
});

test('every default configuration domain passes its own schema', () => {
  for (const [domain, value] of Object.entries(DEFAULTS)) {
    const r = validateDomain(domain, value);
    assert.ok(r.ok, `${domain}: ${JSON.stringify(r.errors && r.errors.slice(0, 3))}`);
  }
});

test('remote configuration cannot smuggle unknown fields or scripts into a domain', () => {
  const bad = JSON.parse(JSON.stringify(DEFAULTS['client.features']));
  bad.flags = { ...bad.flags, evil: { enabled: true, visible: true, label: '<img src=x onerror=alert(1)>', description: '', run: 'require("child_process")' } };
  const r = validateDomain('client.features', bad);
  if (r.ok) assert.ok(!JSON.stringify(r.value).includes('child_process'));
});

test('markdown: pipe tables, h4 and lone pipe lines terminate', () => {
  const md = require('../src/shared/utilities/markdown.js');
  const out = md.render('| a | b |\n|---|:--|\n| `x` | <y> |\n\n| not a table |\nnext line\n#### Deep');
  assert.match(out, /<table><thead><tr><th>a<\/th><th>b<\/th><\/tr><\/thead><tbody><tr><td><code>x<\/code><\/td><td>&lt;y&gt;<\/td><\/tr>/);
  assert.match(out, /<p>\| not a table \| next line<\/p>/);
  assert.match(out, /<h5>Deep<\/h5>/);
});
