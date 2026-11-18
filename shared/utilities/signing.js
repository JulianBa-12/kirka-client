'use strict';
/**
 * Signed bundle envelopes (Ed25519).
 *
 * Envelope: { format: 'polaris-envelope/1', keyId, signature (base64), payload (string) }
 * `payload` is the canonical JSON of the bundle; the signature covers its UTF-8 bytes.
 * Only the backend holds the private key. Clients ship the public key.
 */
const crypto = require('crypto');

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}

function keyIdFromPublicPem(pem) {
  return crypto.createHash('sha256').update(pem.trim()).digest('hex').slice(0, 16);
}

function signPayload(obj, privateKeyPem, publicKeyPem) {
  const payload = canonical(obj);
  const signature = crypto.sign(null, Buffer.from(payload, 'utf8'), crypto.createPrivateKey(privateKeyPem)).toString('base64');
  return { format: 'polaris-envelope/1', keyId: keyIdFromPublicPem(publicKeyPem), signature, payload };
}

/** Returns the parsed payload or throws. `trusted` = [{ keyId, publicKey (PEM) }] */
function verifyEnvelope(envelope, trusted) {
  if (!envelope || envelope.format !== 'polaris-envelope/1') throw new Error('unknown envelope format');
  if (typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string') throw new Error('malformed envelope');
  if (envelope.payload.length > 4 * 1024 * 1024) throw new Error('envelope too large');
  const key = trusted.find((k) => k.keyId === envelope.keyId);
  if (!key) throw new Error(`untrusted signing key ${envelope.keyId}`);
  const ok = crypto.verify(null, Buffer.from(envelope.payload, 'utf8'), crypto.createPublicKey(key.publicKey), Buffer.from(envelope.signature, 'base64'));
  if (!ok) throw new Error('signature verification failed');
  return JSON.parse(envelope.payload);
}

function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey, privateKey, keyId: keyIdFromPublicPem(publicKey) };
}

function compareVersions(a, b) {
  const pa = String(a).split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1; }
  return 0;
}

module.exports = { canonical, signPayload, verifyEnvelope, generateKeyPair, keyIdFromPublicPem, compareVersions };
