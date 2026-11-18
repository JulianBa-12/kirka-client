# Polaris Backend API — v1

Base URL: `${POLARIS_PUBLIC_URL}/api/v1` (default dev: `http://127.0.0.1:8787/api/v1`).
All bodies are JSON (`Content-Type: application/json`) except uploads (`multipart/form-data`).

## Conventions

- **Auth**: `Authorization: Bearer <token>`. Tokens are opaque 256-bit random strings; the server stores only their SHA-256.
- **Scopes**: a session has scope `user` (client/website login) or `owner` (Owner app connection). `/owner/*` requires scope `owner`, role `owner` **and** a session bound to a non-revoked owner connection. The owner account has no password, so `/auth/login` refuses it.
- **Errors**: non-2xx with `{ "error": { "code": "snake_case", "message": "Human readable", "details": [...] } }`.
  Common codes: `unauthorized` 401, `forbidden` 403, `not_found` 404, `validation_failed` 422 (details = `[{path, message}]`), `rate_limited` 429, `maintenance` 503, `conflict` 409, `totp_required` 401, `payload_too_large` 413.
- **Lists**: `?limit=` (default 20, max 100) and `?offset=`. Response `{ items: [...], total }`.
- **Timestamps**: ISO-8601 strings (UTC).
- **Users (public shape)** `PublicUser`: `{ id, username, displayName, avatarUrl|null, role, bio, createdAt, online?: bool, status?: 'online'|'in-game'|'away'|'offline' }`.
- **Files**: uploaded files are served from `${POLARIS_PUBLIC_URL}/files/<storageName>` with `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox; default-src 'none'`. Response objects expose absolute `url`s.
- **Rate limits** (defaults, owner-configurable): auth 10/min/IP, API 240/min/IP, uploads 20/hour/user.
- **Maintenance mode**: all non-owner, non-public-read endpoints return 503 `maintenance` (public bundles, health, news and owner API keep working).

## Signed envelopes

Configuration and release data that a client *acts on* is delivered in signed envelopes:

```json
{ "format": "polaris-envelope/1", "keyId": "16 hex chars", "signature": "base64 ed25519", "payload": "<canonical JSON string>" }
```

Payload of a **config bundle**:
```json
{ "format": "polaris-bundle/1", "target": "client" | "website", "sequence": 12, "issuedAt": "…", "preview": false,
  "minClientVersion": "1.0.0",
  "domains": { "client.theme": { "version": 3, "publishedAt": "…", "data": { … } }, … },
  "announcements": [ Announcement ], "assetsBase": "https://…/files/" }
```
Payload of the **release manifest** (`target: "releases"`):
```json
{ "format": "polaris-releases/1", "target": "releases", "sequence": 4, "issuedAt": "…",
  "channels": { "stable": Release|null, "beta": Release|null }, "minimumVersion": "1.0.0", "history": [ Release ] }
```
`Release` = `{ id, version, channel, title, notes (markdown), publishedAt, rollout (0-100), minimumVersion,
  files: [{ platform: 'linux-appimage'|'linux-deb', name, url, size, sha512 (base64) }] }`

Clients verify the signature with the embedded public key (`shared/configuration/trust.json`), reject unknown `keyId`s, reject a `sequence` lower than the cached one, and validate every domain with `shared/configuration/domains.js` before applying it. The static mirror on GitHub Pages serves the same envelopes at `/data/client-bundle.json`, `/data/website-bundle.json`, `/data/releases.json`, and plain (unsigned, display-only) `/data/news.json`.

Domains and their default data: see `shared/configuration/defaults.js`. Bundle membership: `BUNDLE_TARGETS` in the same file.

---

## Public

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{ status:'ok', version, time, database:'ok'|'error', maintenance:bool, maintenanceMessage, registrationOpen }` |
| GET | `/keys` | `{ keys: [{ keyId, publicKey (PEM), algorithm:'ed25519' }] }` |
| GET | `/bundles/client` | signed envelope (published config) |
| GET | `/bundles/website` | signed envelope |
| GET | `/bundles/releases` | signed release manifest |
| GET | `/news?limit&offset&tag` | `{ items: [NewsPost], total }` published only, pinned first, newest first |
| GET | `/news/:slug` | `NewsPost` |
| GET | `/changelog` | `{ items: [Release] }` all visible published releases, newest first |
| GET | `/announcements?target=client|website` | `{ items: [Announcement] }` active (between startsAt/endsAt) |
| GET | `/stats` | `{ users, skins, resources, plugins, downloads, items }` |
| GET | `/assets/:id` | published asset metadata `{ id, name, category, mime, url, size, width?, height? }` |

`NewsPost` = `{ id, slug, title, excerpt, body (markdown), coverUrl|null, tags:[string], pinned, publishedAt, author: PublicUser }`
`Announcement` = `{ id, title, body, level:'info'|'warning'|'critical', target:'client'|'website'|'both', startsAt|null, endsAt|null, publishedAt }`

Markdown subset used for `body` fields: paragraphs, `#`–`###` headings, `**bold**`, `*em*`, `` `code` ``, fenced code, `- ` lists, `1. ` lists, `[text](https://…)`, `> quote`. Renderers must escape HTML first.

## Authentication — `/auth`

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/auth/register` | `{ username (3-20, [a-zA-Z0-9_]), password (≥10), email? , client:'client'|'website' }` | 201 `{ token, expiresAt, user: Me }` |
| POST | `/auth/login` | `{ username, password, totp?, client }` | `{ token, expiresAt, user: Me }` — 401 `totp_required` if 2FA on and no/invalid code |
| POST | `/auth/logout` | – | `{ ok:true }` (revokes current session) |
| GET | `/auth/me` | – | `{ user: Me }` |
| PATCH | `/auth/me` | `{ displayName?, bio?, avatarUrl?, privacy?: { profile:'public'|'friends'|'private', onlineStatus:bool, allowMessages:'everyone'|'friends'|'nobody', allowFriendRequests:bool } }` | `{ user: Me }` |
| POST | `/auth/avatar` | multipart `file` (png/jpg/webp ≤ 1 MB) | `{ user: Me }` |
| POST | `/auth/password` | `{ current, next }` | `{ ok:true }` (revokes other sessions) |
| GET | `/auth/sessions` | – | `{ items: [{ id, scope, client, ip, userAgent, createdAt, lastSeenAt, expiresAt, current }] }` |
| DELETE | `/auth/sessions/:id` | – | `{ ok:true }` |
| GET | `/auth/login-history` | – | `{ items: [{ at, ip, userAgent, success, reason, scope }] }` |
| POST | `/auth/2fa/setup` | – | `{ secret (base32), otpauthUrl }` (pending until enabled) |
| POST | `/auth/2fa/enable` | `{ code }` | `{ ok:true, recoveryCodes:[8 codes] }` |
| POST | `/auth/2fa/disable` | `{ code, password }` | `{ ok:true }` |
| GET | `/auth/export` | – | JSON download of all personal data |
| DELETE | `/auth/me` | `{ password }` | `{ ok:true }` (deletes account) |

`Me` = PublicUser + `{ email|null, twoFactorEnabled, privacy, createdAt, restrictions: { chat:bool, upload:bool, until|null } }`

## Users & social (auth required)

| Method | Path | Notes |
|---|---|---|
| GET | `/users/search?q=` | `{ items: [PublicUser] }` (min 2 chars, max 20 results, excludes blocked) |
| GET | `/users/:username` | `{ user: PublicUser, friendship:'none'|'friends'|'outgoing'|'incoming'|'blocked', items: [CommunityItem] (their approved uploads) }` — honours privacy |
| POST | `/presence` | `{ status:'online'|'in-game'|'away', activity?: string(60) }` heartbeat; online = seen < 120 s |
| GET | `/social/friends` | `{ friends:[{ user, since }], incoming:[{ id, user, createdAt }], outgoing:[{ id, user, createdAt }] }` |
| POST | `/social/friends/requests` | `{ username }` → `{ request }` (auto-accepts if the other side already requested) |
| POST | `/social/friends/requests/:id/accept` | |
| POST | `/social/friends/requests/:id/decline` | (also cancels own outgoing) |
| DELETE | `/social/friends/:userId` | unfriend |
| GET | `/social/blocks` | `{ items:[PublicUser] }` |
| POST | `/social/blocks` | `{ username }` (also removes friendship) |
| DELETE | `/social/blocks/:userId` | |
| GET | `/social/conversations` | `{ items:[{ user, lastMessage:{ body, at, fromMe }, unread }] }` |
| GET | `/social/messages/:username?after=<id>` | `{ items:[{ id, from:userId, to:userId, body, createdAt, read }] }` oldest→newest, max 100 |
| POST | `/social/messages/:username` | `{ body (1-1000) }` → `{ message }` — respects blocks & privacy & chat restriction |
| GET | `/social/groups` | `{ items:[Group], joined:[groupId] }` — `Group = { id, slug, name, description, visibility:'public'|'private', official, members, createdAt, owner: PublicUser }`. `lobby` always exists (community chat). |
| POST | `/social/groups` | `{ name, description, visibility }` |
| POST | `/social/groups/:id/join` / `/leave` | |
| GET | `/social/groups/:id/messages?after=` | `{ items:[{ id, user:PublicUser, body, createdAt }] }` (public groups readable by any logged-in user) |
| POST | `/social/groups/:id/messages` | `{ body }` (members only; lobby auto-joins) |
| GET | `/notifications?unread=1` | `{ items:[{ id, type, title, body, link|null, read, createdAt }], unread }` |
| POST | `/notifications/read` | `{ ids:[…] }` or `{ all:true }` |
| POST | `/reports` | `{ targetType:'user'|'message'|'group_message'|'item'|'comment', targetId, reason:'spam'|'abuse'|'cheating'|'copyright'|'inappropriate'|'other', details? }` |

## Community content (`CommunityItem`)

Kinds: `skin`, `background`, `resource`, `crosshair`, `hud`, `theme`, `plugin`.

`CommunityItem` = `{ id, kind, title, description, category, tags:[], status:'pending'|'approved'|'rejected'|'hidden', featured, official,
  fileUrl, previewUrl|null, mime, size, metadata:{…}, version, downloads, likes, liked?, comments, author: PublicUser, createdAt, updatedAt, price: { amount:0, currency:'none', label:'Free' } }`

Plugin metadata: `{ manifest: { id, name, version, entry, permissions:[…], minClientVersion }, compatibility:'compatible'|'untested'|'incompatible', approvedPermissions:[…] }` — see docs/PLUGINS.md.
Crosshair / hud / theme items: the uploaded file is a JSON document (validated against the matching schema).

| Method | Path | Notes |
|---|---|---|
| GET | `/community/items?kind&q&category&sort=new|popular|downloads&featured=1&author=username&limit&offset` | approved only (authors also see own pending with `mine=1`) |
| GET | `/community/items/:id` | |
| POST | `/community/items` | multipart: `file` (required), `preview` (optional image), fields `kind,title,description,category,tags (comma list),metadata (JSON string)` → 201 item (status pending unless approval disabled) |
| PATCH | `/community/items/:id` | author: `{ title, description, category, tags }` (re-enters review if approval required) |
| DELETE | `/community/items/:id` | author or owner |
| POST/DELETE | `/community/items/:id/like` | |
| GET | `/community/items/:id/comments` | `{ items:[{ id, user, body, createdAt }] }` |
| POST | `/community/items/:id/comments` | `{ body (1-1000) }` |
| GET | `/community/items/:id/download` | 302 to file URL, counts download |
| GET | `/community/categories` | `{ categories:{ kind:[…] }, rules }` |

## Feedback (bug reports & suggestions)

| Method | Path | Notes |
|---|---|---|
| GET | `/feedback?type=suggestion|bug&sort=top|new&status` | public list `{ items:[Feedback], total }` |
| POST | `/feedback` | `{ type, title (5-120), body (10-5000), version?, os?, contact? }` — auth optional (anonymous: 3/hour/IP) |
| POST/DELETE | `/feedback/:id/vote` | auth |

`Feedback` = `{ id, type, title, body, status:'open'|'planned'|'in-progress'|'done'|'wontfix'|'duplicate', votes, voted?, response|null, version, os, createdAt, author: PublicUser|null }`

## Cloud sync (auth)

| GET | `/cloud` | `{ items:[{ key, updatedAt, size }] }` |
| GET | `/cloud/:key` | `{ key, data, updatedAt }` |
| PUT | `/cloud/:key` | `{ data, baseUpdatedAt? }` — 409 `conflict` if server copy is newer than `baseUpdatedAt`. Max 512 KB, keys `[a-z0-9-]{1,40}`, max 20 keys |
| DELETE | `/cloud/:key` | |

## Telemetry (only sent after explicit opt-in)

| POST | `/telemetry/heartbeat` | `{ installId (uuid), version, channel, platform }` |
| POST | `/telemetry/crash` | `{ installId, version, message (≤500), stack (≤8000), context? }` |
| POST | `/telemetry/download` | `{ releaseId, platform }` (website download clicks) |

---

## Owner API — `/owner` (scope `owner`, role `owner`)

### Owner authentication
| Method | Path | Notes |
|---|---|---|
| GET | `/owner/auth/status` | public: `{ claimed: bool, method: 'device-key' }` |
| GET | `/owner/auth/challenge` | public, rate-limited: `{ nonce, expiresAt }` (single use, 2 min) |
| POST | `/owner/auth/connect` | public, rate-limited: `{ deviceId, nonce, signature }`. `signature` = base64 Ed25519 signature of `polaris-owner-device/1\|connect\|<nonce>\|<deviceId>` with the connection's private key → `{ token, expiresAt, user, device:{ id, name } }` (scope owner, default TTL 12 h). Errors: 403 `device_not_registered` / `device_revoked`, 401 `device_signature` / `device_challenge`. |
| GET | `/owner/devices` | `{ items: [{ id, name, createdAt, lastUsedAt, lastIp, revokedAt, current }] }` |
| POST | `/owner/devices` | `{ publicKey (base64 SPKI DER, Ed25519), name }` → 201 `{ id }`. Used by *Add another computer*; 409 if the key is already registered |
| PATCH | `/owner/devices/:id` | `{ name }` |
| DELETE | `/owner/devices/:id` | revokes the connection and ends its sessions; 409 for the last active connection |

There is no owner password login and no claim endpoint. The first connection is created by the backend on first start (`data/owner-connection.json`), more with `npm run owner:connection` on the server.

`/auth/me`, `/auth/sessions` and `/auth/login-history` also accept owner tokens.

### Overview
`GET /owner/overview` →
```
{ users:{ total, active7d, online, new7d }, version:{ server, latestStable, latestBeta },
  status:{ api:'ok', database:'ok', signing:'ok'|'missing', github:'configured'|'not_configured', maintenance },
  pending:{ items, feedback, reports }, recentAudit:[AuditEntry], recentErrors:[LogEntry],
  updates:{ heartbeats7d, versions:[{ version, installs }] }, bundles:{ client:{ sequence, issuedAt }, website:{…}, releases:{…} } }
```

### Configuration (draft → preview → publish → rollback)
| Method | Path | Notes |
|---|---|---|
| GET | `/owner/config` | `{ items:[{ domain, publishedVersion, publishedAt, hasDraft, draftUpdatedAt }] }` |
| GET | `/owner/config/:domain` | `{ domain, defaults, published:{ version, data, publishedAt, note }|null, draft:{ data, updatedAt, note }|null }` |
| PUT | `/owner/config/:domain/draft` | `{ data, note? }` → validated (422 with details) → `{ draft }` |
| POST | `/owner/config/:domain/validate` | `{ data }` → `{ ok, errors, normalized }` |
| DELETE | `/owner/config/:domain/draft` | discard draft |
| POST | `/owner/config/:domain/publish` | `{ note? }` publishes current draft → `{ version }`; rebuilds & re-signs affected bundles |
| GET | `/owner/config/:domain/history` | `{ items:[{ version, note, publishedAt, publishedBy, status:'published'|'superseded' , data }] }` |
| POST | `/owner/config/:domain/rollback` | `{ version }` → republishes that revision's data as a new version |
| GET | `/owner/bundles/:target/preview` | signed envelope with `preview:true`, built from drafts (falling back to published). Clients only accept preview bundles in explicit test mode. |
| GET | `/owner/bundles` | `{ client:{ sequence, issuedAt, keyId }, website:{…}, releases:{…} }` |

### News, announcements, releases
| GET/POST | `/owner/news` | list all (any status) / create `{ slug?, title, excerpt, body, coverUrl?, tags, pinned, status:'draft'|'published' }` |
| PATCH/DELETE | `/owner/news/:id` | |
| GET/POST | `/owner/announcements` | `{ title, body, level, target, startsAt?, endsAt?, status:'draft'|'published' }` |
| PATCH/DELETE | `/owner/announcements/:id` | publishing rebuilds bundles |
| GET/POST | `/owner/releases` | create `{ version, channel, title, notes, files:[…], rollout, minimumVersion, visible }` (status draft) |
| PATCH/DELETE | `/owner/releases/:id` | |
| POST | `/owner/releases/:id/publish` | `{ }` → status published, rebuilds release manifest |
| POST | `/owner/releases/:id/unpublish` | |
| POST | `/owner/releases/:id/verify` | server downloads each file URL, recomputes sha512 & size → `{ results:[{ name, ok, sha512, size, error? }] }` |

### Assets
| GET | `/owner/assets?category&q&limit&offset` | `{ items:[Asset], total }` |
| POST | `/owner/assets` | multipart `file`, fields `name, category` (`image|icon|logo|background|skin-template|weapon|ui|sound|font|plugin|cosmetic|model|data`) |
| PATCH | `/owner/assets/:id` | `{ name, category, published }` |
| POST | `/owner/assets/:id/replace` | multipart `file` → new version |
| GET | `/owner/assets/:id/versions` | `{ items:[{ version, url, size, mime, createdAt }] }` |
| POST | `/owner/assets/:id/rollback` | `{ version }` |
| DELETE | `/owner/assets/:id` | |

`Asset` = `{ id, name, category, mime, size, width|null, height|null, url, version, published, createdAt, updatedAt }`.
Accepted: PNG, JPEG, WebP, GIF, SVG (sanitized; scripts/handlers/foreignObject/external refs rejected), OGG, WAV, MP3, WOFF2, JSON, GLB, GLTF. Content is sniffed by magic bytes; the declared MIME type is ignored.

### Community administration
| GET | `/owner/community/items?status&kind&q&limit&offset` | all items |
| PATCH | `/owner/community/items/:id` | `{ status, featured, official, title, description, category, tags, metadata }` (plugin: `metadata.approvedPermissions`, `metadata.compatibility`) |
| DELETE | `/owner/community/items/:id` | |
| POST | `/owner/community/items` | multipart — publish official item directly (status approved, official) |
| GET | `/owner/community/groups` · DELETE `/owner/community/groups/:id` | |
| DELETE | `/owner/community/messages/:kind/:id` | kind `direct|group` |
| DELETE | `/owner/community/comments/:id` | |
| GET | `/owner/reports?status=open|resolved|dismissed` | `{ items:[{ id, reporter, targetType, targetId, target (resolved preview), reason, details, status, resolution, createdAt }] }` |
| PATCH | `/owner/reports/:id` | `{ status, resolution }` |
| GET | `/owner/feedback?type&status` · PATCH `/owner/feedback/:id` `{ status, response }` · DELETE | |

### Users
| GET | `/owner/users?q&role&status&limit&offset` | `{ items:[AdminUser], total }` |
| GET | `/owner/users/:id` | `{ user: AdminUser, sessions:[…], loginHistory:[…], reports:[…], items:[…], activity:{ messages, items, comments, lastSeenAt } }` |
| PATCH | `/owner/users/:id` | `{ displayName?, bio?, role?:'user'|'moderator'|'admin', status?:'active'|'disabled', restrictions?:{ chat, upload, until } }` (the owner role cannot be assigned or removed here) |
| POST | `/owner/users/:id/revoke-sessions` | |
| DELETE | `/owner/users/:id` | |

`AdminUser` = Me + `{ status, lastSeenAt, sessions: n, reportsAgainst: n }`

### System, security, data
| GET | `/owner/system` | `{ settings, runtime:{ node, uptime, memory, platform, pid }, env:{ publicUrl, corsOrigins, githubPublishing, dataDir } }` |
| PATCH | `/owner/system/settings` | `{ maintenance, maintenanceMessage, registrationOpen, rateLimits:{ auth, api, upload }, uploadLimits:{ maxBytes, maxAvatarBytes }, sessionTtlHours:{ user, owner }, communityChat:bool }` |
| GET | `/owner/security` | `{ owner:{ username }, ownerSessions:[…], failedLogins24h, recentFailures:[…], signingKey:{ keyId, createdAt } }` |
| GET | `/owner/audit?actor&action&limit&offset` | `{ items:[{ id, at, actor, action, target, details, ip }], total }` |
| GET | `/owner/logs?level=info|warn|error&limit` | `{ items:[{ at, level, msg, meta }] }` (in-memory ring buffer of the last 2000 entries) |
| GET | `/owner/analytics?days=30` | `{ daily:[{ date, activeUsers, registrations, heartbeats, downloads, uploads, messages }], versions:[{ version, installs }], platforms:[…], content:{ byKind:{…} }, totals:{…} }` |
| GET | `/owner/database` | `{ engine:'sqlite', path, sizeBytes, schemaVersion, tables:[{ name, rows }] }` |
| GET | `/owner/database/tables/:name?limit&offset` | read-only rows; secret columns are redacted |
| POST | `/owner/database/vacuum` · `/owner/database/integrity` | |
| GET/POST | `/owner/backups` | list / create `{ items:[{ name, size, createdAt }] }` |
| GET | `/owner/backups/:name/download` | binary |
| POST | `/owner/backups/:name/restore` | stages restore → applied on next server start |
| DELETE | `/owner/backups/:name` | |
| GET | `/owner/integrations/github` | `{ configured, repo, branch, path, lastPublish:{ at, commit, ok, error }|null }` |
| POST | `/owner/integrations/github/publish` | writes signed bundles + news + changelog JSON into the Pages repo (token stays server-side) |

Every mutating owner request is written to the audit log with actor, IP, target and a diff summary.
