'use strict';
/** Prints (or with --rotate, regenerates) the one-time owner setup token. Only works while no owner exists. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg = require('../config');
const { Database } = require('../database/db');
const { migrate } = require('../database/migrations');
fs.mkdirSync(cfg.dataDir, { recursive: true, mode: 0o700 });
const db = new Database(cfg.dbFile);
migrate(db, { info() {}, warn() {} });
if (db.get("SELECT id FROM users WHERE role = 'owner'")) { console.error('An owner account already exists. Setup tokens are disabled.'); process.exit(1); }
const file = path.join(cfg.dataDir, 'owner-setup-token');
if (process.argv.includes('--rotate') || !fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(24).toString('base64url') + '\n', { mode: 0o600 });
console.log(fs.readFileSync(file, 'utf8').trim());
