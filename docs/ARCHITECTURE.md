# Architecture

```
                 ┌──────────────────────────── Polaris backend (self-hosted) ─────────────────────────────┐
                 │ Express 5 · node:sqlite · Ed25519 signing key · uploads in /files (sandbox CSP)         │
                 │ /api/v1/auth  /community  /social  /reports  /cloud  /feedback  /bundles  /owner/*      │
                 └───────▲──────────────────────────▲─────────────────────────────▲───────────────────────┘
       user-scope token  │                          │ owner key → owner session    │ export-static / GitHub publisher
                 ┌───────┴────────┐        ┌────────┴────────┐          ┌────────┴──────────────────────────┐
                 │ Polaris Client │        │  Polaris Owner  │          │ GitHub Pages: Community Hub        │
                 │ (public)       │        │  (private app)  │          │ /kirka-client/ + /data/*.json      │
                 └───────▲────────┘        └─────────────────┘          └────────▲──────────────────────────┘
                         │ signed bundles via mirror (https://…/kirka-client/data)│
                         └────────────────────────────────────────────────────────┘
```

## Polaris Client (`apps/client`)

**Main process** (`src/main`, CommonJS):

| Module | Responsibility |
| --- | --- |
| `main.js` | App lifecycle, single-instance lock, Chromium switches (frame-rate unlock and hardware acceleration only take effect after a restart), custom protocols, frameless window, hotkeys, session/presence tracking |
| `core.js` | Paths under `userData`, a ring-buffered file logger, atomic JSON documents |
| `state.js` | Persistent documents: settings, window state, profiles, library index, analytics, replays, plugins, maps |
| `ipc.js` | Every IPC channel, with argument validation. This is the only API the renderer can reach |
| `game.js` | The Kirka.io `WebContentsView` (persistent partition `persist:kirka`), ad filter, resource swapper, overlay preload, navigation guard |
| `library.js` | Local cosmetics library with magic-byte type detection and size/dimension limits |
| `remote.js` | Fetches signed configuration bundles (server first, then mirror), verifies them against `trust.json`, enforces a monotonic sequence, validates each domain and falls back to defaults |
| `updates.js` | Signed release manifest, staged rollout, SHA-512 + size check, AppImage swap with `.previous` rollback |
| `plugins.js` | Plugin registry, permission ceilings from review, per-plugin storage quota |
| `metrics.js` | CPU/memory per process, GPU info, HTTPS RTT to kirka.io |
| `server.js` | Polaris server client. The session token is encrypted with `safeStorage` when the OS keyring is available |

**Protocols**:

- `polaris-app://shell/` serves the renderer with a strict CSP.
- `polaris-file://` gives read-only access to library files.
- `polaris-plugin://run/<id>/` serves plugin frames with `default-src 'none'`.

**Renderer** (`src/renderer`, ES modules, no framework): `js/app.js` contains the shell, router, rail and status bar. `js/lib/*` holds the DOM builder, store, charts, recorder and plugin host. `js/views/*` has one module per page. `styles/app.css` holds the theme variables and components, and `styles/views.css` holds the page layouts.

**Game view preload** (`src/preload/game.js`, generated from `game-overlay.js` and the shared crosshair renderer): draws the crosshair and HUD overlays and applies sanitized game CSS and visual filters. It measures FPS with `requestAnimationFrame` and detects menu/match state from DOM hints. It cannot read or modify game memory, network messages or input.

### Security model (client)

- `contextIsolation: true`, `nodeIntegration: false` and `sandbox: true` apply to every web contents. Both preloads expose only allow-listed channels.
- The shell CSP disallows inline scripts, remote scripts and remote connections. Remote images from the Polaris server go through the `server:image` proxy, which accepts images only.
- Navigation of the shell is locked to `polaris-app://`. External `https:` links open in the system browser. The game view may only navigate within kirka.io. Sign-in popups (Google, Discord and similar) open in a sandboxed child window that can only navigate to kirka.io or those sign-in hosts.
- Remote configuration is data only. It is a signed JSON envelope that is validated per domain against schemas in `shared/configuration/domains.js`. Owner CSS passes `css-sanitize.js`, which only accepts `.pl-*`/`[data-pl-*]` selectors and rejects `url()`, `@import` and `expression()`. Remote config never contains executable code.
- Plugins run in opaque-origin iframes with no network, no Node.js and no access to the game. Calls go through `postMessage` and are checked against granted permissions. Marketplace plugins can't receive more permissions than the owner approved.

## Backend (`backend`)

- `app.js` builds the context (database, keys, audit, config service, publisher) and the routers.
- `auth/` handles password hashing (scrypt), sessions with `user`/`owner` scopes, TOTP 2FA and recovery codes for community accounts, owner connections (`owner-devices.js`: Ed25519 challenge/response, no owner password) and rate limits.
- `community/` covers items, likes, comments, downloads, categories, friends, blocks, messages, groups, presence and notifications.
- `admin/` contains the owner API: configuration draft/test/publish/rollback, news, announcements, releases, assets, moderation, users, reports, analytics, backups, database browser and audit log.
- `services/config-service.js` handles domain versions and signed envelopes. `services/publishing.js` does static export and GitHub commits.
- Uploaded files are served with `Content-Security-Policy: sandbox` and `nosniff`.

## Community Hub (`apps/community-hub`)

A static site with no runtime dependencies. `scripts/build.js` renders 16 pages from `src/pages`, copies `public/` (including `data/*.json`), adds content hashes and writes `.nojekyll`. When `site-config.json` sets `apiBase`, pages switch to live mode (sign-in, uploads, voting, bug reports). Otherwise they show the published static data and honest empty states.

## Polaris Owner (private)

A separate Electron app (`io.polaris.owner`) that only talks to `/owner/*`. It has no login: it holds the private key of a registered owner connection (encrypted with the OS keyring), signs a one-time challenge from `GET /owner/auth/challenge` and gets an owner session from `POST /owner/auth/connect`. Every privileged request is authorized by the backend: owner scope + owner role + a session bound to a non-revoked connection, with session expiry and the audit log. A public client can't become owner, because it has no registered key and the owner account has no password. The Owner app isn't distributed with the public client.
