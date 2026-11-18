'use strict';
/** Writes the backend's public signing key into shared/configuration/trust.json (embedded in the client). */
const fs = require('fs');
const path = require('path');
const cfg = require('../config');
const { loadSigningKey } = require('../services/config-service');
const keys = loadSigningKey(cfg, { warn: console.warn, info: console.log });
const file = path.resolve(__dirname, '../../shared/configuration/trust.json');
let trust = { keys: [] };
if (fs.existsSync(file)) { try { trust = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {} }
if (process.argv.includes('--replace')) trust.keys = [];
if (!trust.keys.some((k) => k.keyId === keys.keyId)) trust.keys.push({ keyId: keys.keyId, publicKey: keys.publicKey, algorithm: 'ed25519', addedAt: new Date().toISOString() });
fs.writeFileSync(file, JSON.stringify(trust, null, 2) + '\n');
console.log(`trust.json now trusts: ${trust.keys.map((k) => k.keyId).join(', ')}`);
