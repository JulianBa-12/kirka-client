'use strict';
const path = require('path');
const fs = require('fs');

/** Minimal .env loader (no dependency). Real environment variables win. */
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadDotEnv(path.join(__dirname, '.env'));

const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const dataDir = path.resolve(__dirname, env('POLARIS_DATA_DIR', './data'));
const port = parseInt(env('POLARIS_PORT', env('PORT', '8787')), 10);

module.exports = {
  version: require('./package.json').version,
  port,
  host: env('POLARIS_HOST', '127.0.0.1'),
  publicUrl: env('POLARIS_PUBLIC_URL', `http://127.0.0.1:${port}`).replace(/\/+$/, ''),
  dataDir,
  dbFile: path.join(dataDir, 'polaris.db'),
  uploadsDir: path.join(dataDir, 'uploads'),
  backupsDir: path.join(dataDir, 'backups'),
  keysDir: path.join(dataDir, 'keys'),
  logsDir: path.join(dataDir, 'logs'),
  corsOrigins: env('POLARIS_CORS_ORIGINS', 'https://julianba-12.github.io,http://localhost:5173,http://127.0.0.1:5173,http://127.0.0.1:4173,http://localhost:4173')
    .split(',').map((s) => s.trim()).filter(Boolean),
  trustProxy: env('POLARIS_TRUST_PROXY', '0') === '1',
  signingKeyFile: env('POLARIS_SIGNING_KEY_FILE', ''),
  github: {
    token: env('POLARIS_GITHUB_TOKEN', ''),
    repo: env('POLARIS_GITHUB_REPO', ''),
    branch: env('POLARIS_GITHUB_BRANCH', 'main'),
    path: env('POLARIS_GITHUB_PATH', 'apps/community-hub/public/data').replace(/^\/+|\/+$/g, ''),
  },
};
