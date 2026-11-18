'use strict';
/**
 * Ordered, append-only schema migrations. Never edit a shipped migration;
 * add a new one. Types are chosen to map 1:1 onto PostgreSQL
 * (INTEGER PRIMARY KEY → BIGSERIAL, TEXT → TEXT, JSON stored as TEXT/JSONB).
 */
const MIGRATIONS = [
  {
    version: 1,
    name: 'initial schema',
    sql: `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  email TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  bio TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  privacy TEXT NOT NULL DEFAULT '{}',
  restrictions TEXT NOT NULL DEFAULT '{}',
  totp_secret TEXT,
  totp_pending TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  recovery_codes TEXT NOT NULL DEFAULT '[]',
  presence_status TEXT,
  presence_activity TEXT,
  last_seen_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_users_role ON users(role);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL,
  client TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE TABLE login_history (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  username TEXT,
  at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  success INTEGER NOT NULL,
  reason TEXT,
  scope TEXT
);
CREATE INDEX idx_login_history_at ON login_history(at);
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  actor_id INTEGER,
  actor_name TEXT,
  action TEXT NOT NULL,
  target TEXT,
  details TEXT,
  ip TEXT
);
CREATE INDEX idx_audit_at ON audit_log(at);
CREATE TABLE config_revisions (
  id INTEGER PRIMARY KEY,
  domain TEXT NOT NULL,
  version INTEGER NOT NULL,
  data TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL,
  published_by TEXT,
  published_at TEXT NOT NULL,
  UNIQUE(domain, version)
);
CREATE TABLE config_drafts (
  domain TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  note TEXT,
  updated_by TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE bundles (
  target TEXT PRIMARY KEY,
  sequence INTEGER NOT NULL,
  envelope TEXT NOT NULL,
  issued_at TEXT NOT NULL
);
CREATE TABLE news (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  cover_url TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  pinned INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT
);
CREATE TABLE announcements (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL DEFAULT 'info',
  target TEXT NOT NULL DEFAULT 'both',
  starts_at TEXT,
  ends_at TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT
);
CREATE TABLE releases (
  id INTEGER PRIMARY KEY,
  version TEXT NOT NULL,
  channel TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  files TEXT NOT NULL DEFAULT '[]',
  rollout INTEGER NOT NULL DEFAULT 100,
  minimum_version TEXT NOT NULL DEFAULT '1.0.0',
  visible INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  UNIQUE(version, channel)
);
CREATE TABLE assets (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  storage_name TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  published INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE asset_versions (
  id INTEGER PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  storage_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(asset_id, version)
);
CREATE TABLE items (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending',
  featured INTEGER NOT NULL DEFAULT 0,
  official INTEGER NOT NULL DEFAULT 0,
  storage_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  preview_name TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  downloads INTEGER NOT NULL DEFAULT 0,
  review_note TEXT,
  author_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_items_kind_status ON items(kind, status);
CREATE TABLE item_versions (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  storage_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE TABLE item_likes (
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (item_id, user_id)
);
CREATE TABLE comments (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE friendships (
  user_a INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_a, user_b)
);
CREATE TABLE friend_requests (
  id INTEGER PRIMARY KEY,
  from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE(from_id, to_id)
);
CREATE TABLE blocks (
  blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);
CREATE TABLE messages (
  id INTEGER PRIMARY KEY,
  from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX idx_messages_pair ON messages(from_id, to_id, id);
CREATE TABLE community_groups (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'public',
  official INTEGER NOT NULL DEFAULT 0,
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE group_members (
  group_id INTEGER NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TEXT NOT NULL,
  PRIMARY KEY (group_id, user_id)
);
CREATE TABLE group_messages (
  id INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_group_messages ON group_messages(group_id, id);
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read);
CREATE TABLE reports (
  id INTEGER PRIMARY KEY,
  reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  resolution TEXT,
  resolved_by INTEGER,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE TABLE feedback (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  response TEXT,
  version TEXT,
  os TEXT,
  contact TEXT,
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE feedback_votes (
  feedback_id INTEGER NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (feedback_id, user_id)
);
CREATE TABLE cloud (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  data TEXT NOT NULL,
  size INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);
CREATE TABLE telemetry_heartbeats (
  install_id TEXT NOT NULL,
  date TEXT NOT NULL,
  version TEXT,
  channel TEXT,
  platform TEXT,
  PRIMARY KEY (install_id, date)
);
CREATE TABLE telemetry_crashes (
  id INTEGER PRIMARY KEY,
  install_id TEXT,
  version TEXT,
  message TEXT,
  stack TEXT,
  context TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE downloads (
  id INTEGER PRIMARY KEY,
  release_id INTEGER,
  platform TEXT,
  date TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE daily_activity (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  PRIMARY KEY (user_id, date)
);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`,
  },
  {
    version: 2,
    name: 'owner connections (device keys)',
    sql: `
CREATE TABLE owner_devices (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  public_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  last_ip TEXT,
  revoked_at TEXT
);
CREATE INDEX idx_owner_devices_user ON owner_devices(user_id);
ALTER TABLE sessions ADD COLUMN device_id TEXT;
`,
  },
  {
    version: 3,
    name: 'item ratings',
    sql: `
CREATE TABLE item_ratings (
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (item_id, user_id)
);
CREATE INDEX idx_item_ratings_item ON item_ratings(item_id);
`,
  },
];

function migrate(db, log) {
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');
  const row = db.get("SELECT value FROM meta WHERE key = 'schema_version'");
  let current = row ? parseInt(row.value, 10) : 0;
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    db.tx(() => {
      db.exec(m.sql.replace('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);', ''));
      db.run("INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", String(m.version));
    });
    current = m.version;
    log && log.info(`database migrated to schema ${m.version} (${m.name})`);
  }
  return current;
}

module.exports = { migrate, MIGRATIONS, latest: MIGRATIONS[MIGRATIONS.length - 1].version };
