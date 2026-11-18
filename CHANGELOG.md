# Changelog

All notable changes to Polaris Client are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed
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
