# Testing report — Polaris 1.0.0

Tested on 18 November 2026 on Linux x86_64 (Debian-based sandbox, Xvfb display at 1440×900, Node 22, Electron 33.4.11). Every result below comes from an actual run. Where something could not be tested, it is listed under Limits.

## Automated tests

| Suite | Command | Result |
| --- | --- | --- |
| Backend API (auth, 2FA, recovery codes, owner claim, owner scope enforcement, config draft → publish → rollback, signature verification, uploads, social, moderation) | `npm --prefix backend test` | 14 / 14 passed |
| Client unit tests (signed envelopes and trust store, schema validation, CSS sanitizer, magic-byte file detection, library and plugin package validation, fallback to defaults, using an Electron stub) | `npm --prefix apps/client test` | 13 / 13 passed |
| Client static check (syntax of every main, preload and renderer file) | `npm --prefix apps/client run check` | 47 / 47 files OK |
| Community Hub build and smoke test (16 pages, internal links, module imports, data shapes) | `npm --prefix apps/community-hub test` | passed |
| Owner static check | `npm --prefix apps/owner run check` | 49 / 49 files OK |

`npm test` at the repository root runs the first four suites. CI (`.github/workflows/ci.yml`) runs them on every push.

## Client UI tests (Chrome DevTools Protocol)

`scripts/smoke-ui.js` launches the app with `--remote-debugging-port`, opens every view, records uncaught exceptions and console errors, and saves a screenshot of each view.

| Run | Result |
| --- | --- |
| Development build (`electron .`), all 17 views | 0 errors |
| Development build signed in to a local backend with two test accounts on a throwaway database: friend request sent and accepted, conversation opened, message delivered, pixels drawn and saved in Skin Studio | all worked, 0 errors |
| Packaged `Polaris-Client-1.0.0.AppImage` (final build), all 17 views | 0 errors. The log confirms `appImage: true` |

The screenshots were reviewed by hand. Defects found during review were fixed before the final build: text that wasn't wrapping, a hidden recording indicator, an invisible logo, `null` rendered as text, and an Update Center that said "up to date" when nothing had been verified.

## Owner application

The Owner AppImage was built and started against a local backend. On a test database, these steps were exercised end to end: claim with the setup token, sign in, enable 2FA, edit the configuration draft, test it, publish it, roll it back, manage news and releases, moderate content, browse the database and read the audit log. Requests to `/owner/*` without an owner-scope session are rejected by the backend (also covered by the backend tests).

## Packaging

| Artifact | Size | Check |
| --- | --- | --- |
| `dist/Polaris-Client-1.0.0.AppImage` | 108.4 MB | Started under Xvfb, UI test passed |
| `dist/Polaris-Client-1.0.0.deb` | 75.0 MB | Built by electron-builder. Contents not installed system-wide in the sandbox |
| `dist/Polaris-Owner-1.0.0.AppImage` | 108.7 MB | Started and tested against a local backend |

## Limits (not tested or not testable here)

- **Gameplay inside Kirka.io.** The sandbox has no GPU and no human player. The game page loads in the game view, but match detection, in-match FPS and HUD restyling were not checked during a real match. Selectors for the game's interface can be overridden in Settings → Advanced if Kirka.io changes its layout.
- **Measured performance gains.** No benchmark comparison against the browser was made, so Polaris makes no claims about higher FPS.
- **Recording.** The Replays view was opened without errors, but a full recording was not made in the headless sandbox. On Linux, Electron window capture records video without system audio.
- **In-place AppImage update.** The update flow (signed manifest, SHA-512, swap, `.previous` rollback) uses the same Ed25519 envelope verification that the unit tests cover. The download, hash and swap steps can only be tested live once a second release exists, so a live swap from 1.0.0 to a newer release has not been tested yet.
