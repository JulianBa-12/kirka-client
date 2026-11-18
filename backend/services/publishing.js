'use strict';
/**
 * Static publishing + backups.
 *
 * exportStatic(): the signed bundles, release manifest, news and changelog as files
 * (what the Community Hub and the client's offline mirror read).
 *
 * GitHub publisher: commits those files into the Pages repository in ONE commit
 * using the Git Data API. The token lives only in the server environment.
 */
const fs = require('fs');
const path = require('path');
const { serializeNews } = require('../api/public');
const { now } = require('../database/db');
const { E } = require('./core');

function staticFiles(ctx) {
  const { db, configService } = ctx;
  const news = db.all("SELECT * FROM news WHERE status = 'published' ORDER BY pinned DESC, published_at DESC LIMIT 100").map((n) => serializeNews(n, db));
  return {
    'client-bundle.json': configService.envelope('client'),
    'website-bundle.json': configService.envelope('website'),
    'releases.json': configService.envelope('releases'),
    'news.json': { generatedAt: now(), items: news },
    'changelog.json': { generatedAt: now(), items: configService.buildReleasesPayload().history },
    'public-keys.json': { keys: [{ keyId: ctx.keys.keyId, publicKey: ctx.keys.publicKey, algorithm: 'ed25519' }] },
  };
}

function exportStatic(ctx, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const files = staticFiles(ctx);
  for (const [name, data] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2) + '\n');
  return Object.keys(files);
}

function createPublisher(ctx) {
  const { cfg, log, db } = ctx;
  const gh = cfg.github;
  const configured = !!(gh.token && gh.repo);
  let timer = null; let last = null; let running = null;

  async function api(method, url, body) {
    const res = await fetch(`https://api.github.com/repos/${gh.repo}${url}`, {
      method, headers: { Authorization: `Bearer ${gh.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'polaris-backend' },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`GitHub ${method} ${url} → ${res.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  }

  async function publishNow(actor = 'system') {
    if (!configured) throw new Error('GitHub publishing is not configured (POLARIS_GITHUB_TOKEN / POLARIS_GITHUB_REPO)');
    if (running) return running;
    running = (async () => {
      try {
        const ref = await api('GET', `/git/ref/heads/${encodeURIComponent(gh.branch)}`);
        const baseCommit = await api('GET', `/git/commits/${ref.object.sha}`);
        const files = staticFiles(ctx);
        const tree = [];
        for (const [name, data] of Object.entries(files)) {
          const blob = await api('POST', '/git/blobs', { content: JSON.stringify(data, null, 2) + '\n', encoding: 'utf-8' });
          tree.push({ path: `${gh.path}/${name}`, mode: '100644', type: 'blob', sha: blob.sha });
        }
        const newTree = await api('POST', '/git/trees', { base_tree: baseCommit.tree.sha, tree });
        if (newTree.sha === baseCommit.tree.sha) { last = { at: now(), commit: ref.object.sha, ok: true, unchanged: true }; return last; }
        const commit = await api('POST', '/git/commits', { message: `content: publish Polaris data (${actor})`, tree: newTree.sha, parents: [ref.object.sha] });
        await api('PATCH', `/git/refs/heads/${encodeURIComponent(gh.branch)}`, { sha: commit.sha });
        last = { at: now(), commit: commit.sha, ok: true };
        log.info('published static data to GitHub', { commit: commit.sha });
        return last;
      } catch (e) {
        last = { at: now(), ok: false, error: e.message };
        log.error('GitHub publish failed', { error: e.message });
        throw e;
      } finally { running = null; }
    })();
    return running;
  }

  /** Debounced automatic publish after content changes (only when configured). */
  function schedule() {
    if (!configured) return;
    clearTimeout(timer);
    timer = setTimeout(() => publishNow('auto').catch(() => {}), 5000);
    timer.unref && timer.unref();
  }

  return { configured, publishNow, schedule, status: () => ({ configured, repo: gh.repo || null, branch: gh.branch, path: gh.path, lastPublish: last }) };
}

/* ---------------- backups ---------------- */
function createBackups(ctx) {
  const { cfg, db, log } = ctx;
  fs.mkdirSync(cfg.backupsDir, { recursive: true });
  const safe = (name) => { if (!/^polaris-[0-9TZ-]+(-[a-z]+)?\.db$/.test(name)) throw E.badRequest('Invalid backup name'); return path.join(cfg.backupsDir, name); };
  return {
    list: () => fs.readdirSync(cfg.backupsDir).filter((f) => f.endsWith('.db')).map((f) => { const st = fs.statSync(path.join(cfg.backupsDir, f)); return { name: f, size: st.size, createdAt: st.mtime.toISOString() }; }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    create(tag = '') {
      const name = `polaris-${new Date().toISOString().replace(/[:.]/g, '-')}${tag ? '-' + tag : ''}.db`;
      const file = path.join(cfg.backupsDir, name);
      db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
      log.info('database backup created', { name });
      return { name, size: fs.statSync(file).size, createdAt: now() };
    },
    path: safe,
    remove: (name) => fs.unlinkSync(safe(name)),
    stageRestore(name) { fs.copyFileSync(safe(name), path.join(cfg.dataDir, 'restore-pending.db')); },
  };
}

/** Called at startup before the database is opened. */
function applyPendingRestore(cfg, log) {
  const pending = path.join(cfg.dataDir, 'restore-pending.db');
  if (!fs.existsSync(pending)) return;
  fs.mkdirSync(cfg.backupsDir, { recursive: true });
  if (fs.existsSync(cfg.dbFile)) fs.copyFileSync(cfg.dbFile, path.join(cfg.backupsDir, `polaris-${new Date().toISOString().replace(/[:.]/g, '-')}-prerestore.db`));
  for (const ext of ['-wal', '-shm']) { try { fs.unlinkSync(cfg.dbFile + ext); } catch {} }
  fs.renameSync(pending, cfg.dbFile);
  log.warn('restored database from staged backup');
}

module.exports = { exportStatic, staticFiles, createPublisher, createBackups, applyPendingRestore };
