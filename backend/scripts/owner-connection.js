'use strict';
/**
 * Creates an owner connection file for Polaris Owner (no login; the file holds a
 * private device key). Run on the server.
 *
 *   npm run owner:connection -- [--url https://polaris.example.org] [--name "Laptop"] [--out path]
 *   npm run owner:connection -- --revoke-all ...   # remove every existing connection first
 *
 * Defaults: --url = POLARIS_PUBLIC_URL, --out = <data>/owner-connection.json (mode 0600).
 * Anyone with this file has owner access. Move it to the Owner computer and delete the copy.
 */
const fs = require('fs');
const path = require('path');
const cfg = require('../config');
const { Database, now } = require('../database/db');
const { migrate } = require('../database/migrations');
const { hashPassword } = require('../auth/crypto');
const { createConnection, writeConnectionFile } = require('../auth/owner-devices');

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const url = arg('--url') || cfg.publicUrl;
const out = path.resolve(arg('--out') || path.join(cfg.dataDir, 'owner-connection.json'));
if (!/^https?:\/\/[^\s]+$/.test(url)) { console.error('--url must be an http(s) address'); process.exit(1); }

fs.mkdirSync(cfg.dataDir, { recursive: true, mode: 0o700 });
const db = new Database(cfg.dbFile);
migrate(db, { info() {}, warn() {} });
const audit = (action, target, details) => db.run('INSERT INTO audit_log (at, actor_id, actor_name, action, target, details, ip) VALUES (?,?,?,?,?,?,?)', now(), null, 'server-cli', action, target, details ? JSON.stringify(details) : null, null);

if (process.argv.includes('--revoke-all')) {
  db.tx(() => {
    db.run('UPDATE owner_devices SET revoked_at = ? WHERE revoked_at IS NULL', now());
    db.run("UPDATE sessions SET revoked_at = ? WHERE scope = 'owner' AND revoked_at IS NULL", now());
  });
  audit('owner.device.revoked_all', null, null);
  console.log('All existing owner connections were removed and owner sessions ended.');
}
const conn = createConnection(db, hashPassword, { backendUrl: url, name: arg('--name') || 'Owner connection' });
writeConnectionFile(out, conn);
audit('owner.device.added', conn.deviceId, { name: conn.name, via: 'server-cli' });
console.log(`Owner connection ${conn.deviceId} for ${conn.backendUrl}`);
console.log(`Written to ${out} (mode 0600).`);
console.log('Copy it to ~/.config/Polaris Owner/owner-connection.json on the Owner computer (or next to the AppImage), start Polaris Owner, then delete this copy.');
