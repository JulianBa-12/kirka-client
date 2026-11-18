# Changelog

All notable changes to Polaris Client are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/), and versions follow [Semantic Versioning](https://semver.org/).

## [1.1.0] — 2026-11-18

See [docs/RELEASE_NOTES.md](docs/RELEASE_NOTES.md).

### Added — Polaris Client
- **Command Center** (Ctrl+K by default, also works while the game is focused): search every destination, action, setting, workspace and profile. Results are ranked by match quality and how often you use them; Alt+Enter assigns a custom shortcut to any command. A **Quick Access** menu in the title bar holds your most used commands.
- **Smart Setup**: a four-step first-run wizard (language, system-based recommendations that you accept or decline one by one, import of settings or a backup, summary). Nothing is applied before you finish. It can be run again from Settings.
- **Workspaces**: personal menu order, hidden destinations, home widgets, quick-access commands and an optional linked profile; switching is instant.
- **Visual Lab**: compare two visual setups (crosshair, colour filter, backdrop) side by side and preview either one in the running game before keeping it.
- **Session Journal**: every measured session with notes, tags, rating and favourites. The numbers come only from the local session tracker.
- **Profile Automation**: local “when … then …” rules that switch Polaris profiles, performance presets or workspaces or show a notice. Rules never send input to the game.
- **Backup Vault**: automatic and manual snapshots of all Polaris data with SHA-256 integrity checks, export/import and restore (a safety snapshot is taken before every restore).
- **Diagnostics**: real checks (GPU, memory, disk space, data folder, Kirka.io and server reachability, mirror signature, configuration, live updates, version, session errors) with the observed value and a fix suggestion.
- **Creator Gallery**: community skins, backgrounds, crosshairs, HUD layouts, themes, workspaces and resources with 1–5 star ratings, favourites, reports, install and “share from library”.
- **Realtime connection** to a Polaris server (WebSocket): published configuration, announcements, maintenance notices and personal notifications arrive within seconds. The socket only triggers a download of the signed bundle; nothing it carries is trusted as configuration. Changes that need a restart show a “restart to apply” banner.
- **German interface** (Deutsch) next to English, switchable in Settings and in Smart Setup.
- Collapsible “Tools” group in the navigation for destinations that are not pinned in the main menu.

### Added — Polaris Owner
- **Live** section: realtime connections by channel (client, Community Hub, owner), the owner event stream (audit entries, reports, feedback, broadcasts) and a “resync all clients” action.
- Live/offline badge in the title bar driven by the owner realtime channel; moderation counts refresh instantly when reports or feedback arrive.
- Configuration publishing shows for every domain whether it is applied **live** or needs a **client restart**.
- Item ratings in marketplace moderation; contact messages as a filter in Community Management.

### Added — Community Hub
- **Documentation** page that renders the repository documents (install, plugins, architecture, API, development, testing, self-hosting) with a document list and in-page contents.
- **Contact** page with a private message form (stored as owner-only feedback) and routing to bug reports, suggestions and security advisories.
- Live mode: when the site is connected to a backend, theme, navigation, announcements and maintenance notices update without reloading.
- Markdown renderer: pipe tables and fourth-level headings.

### Added — Backend
- Realtime hub at `/api/v1/realtime` (channels `client`, `website`, `owner`); `GET /owner/realtime`, `POST /owner/realtime/resync`.
- Ratings: `PUT /community/items/:id/rating`, `DELETE /community/items/:id/rating`, `sort=rating|popular|downloads|new` on item listings; `workspace` and `theme` item kinds.
- Feedback type `contact` (never listed publicly).

### Changed
- New release-signing key `d3d1bf42ccbcdfe3`. Polaris 1.0.0 only trusts the previous key, so **1.0.0 installs must be updated manually once** by downloading 1.1.0; from 1.1.0 on, updates verify against the new key.
- Older published configurations no longer turn off features introduced later: default feature flags are merged below the published flags.
- Fixed: a line that starts and ends with `|` but is not a table no longer hangs the Markdown renderer.
- Polaris Owner no longer has a login. It opens the Owner Dashboard directly and authenticates silently with an owner connection: an Ed25519 key registered on the backend and stored encrypted on the owner's computer. The setup token, owner claim, owner password login and owner 2FA were removed. The owner account has no password; `/auth/login` refuses it.
- New backend endpoints `GET /owner/auth/challenge`, `POST /owner/auth/connect` and `/owner/devices` (list, add, rename, revoke). New server command `npm run owner:connection`. The first connection is written to `data/owner-connection.json` on first start.

## [1.0.0] — 2026-11-18

First public release. See [docs/RELEASE_NOTES.md](docs/RELEASE_NOTES.md).

### Added
- Desktop client for Kirka.io with a custom window, title bar, fullscreen, remembered window bounds and an F1 shell/game toggle.
- Crosshair Studio, HUD Editor, Skin Studio (pixel editor with layers), backgrounds with a rotation queue, theme editor and game style options.
- Resource swapper for images and sounds, plus visual map filters and map notes.
- Performance Center with live measurements, profiles and benchmarks.
- Analytics for sessions, time in matches and FPS, with a manual match log.
- Replays: window recording with bookmarks.
- Smart Profiles (official and user-defined).
- Marketplace, Social (friends, messages, community chat, notifications), Inventory and cloud sync through a Polaris server.
- Sandboxed plugin system with permissions.
- Update Center with a signed release manifest, SHA-512 verification and rollback.
- Settings with seven categories, keybinds, import/export and privacy controls (telemetry is off by default).
- Community Hub website and self-hosted backend.
