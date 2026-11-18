# Testing report — Polaris 1.0.0

Tested on 18 November 2026 on Linux x86_64 (Debian-based sandbox, Xvfb display at 1440×900, Node 22, Electron 33.4.11). Every result below comes from an actual run. Where something could not be tested, it is listed under Limits.

## Automated tests

| Suite | Command | Result |
| --- | --- | --- |
| Backend API (auth, 2FA and recovery codes for community accounts, owner connections: first-start connection file, challenge/response, forged / replayed / unknown / revoked keys, add and revoke computers, last-connection guard, server CLI; owner scope enforcement, config draft → publish → rollback, signature verification, uploads, social, moderation) | `npm --prefix backend test` | 14 / 14 passed |
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

Polaris Owner has no login. These checks ran against a fresh local backend on a throwaway database. Each one was driven over the DevTools protocol, with screenshots reviewed by hand:

| Check | Result |
| --- | --- |
| First backend start creates `data/owner-connection.json` (mode 0600) | yes |
| `GET /owner/overview` without a session, and the old `POST /owner/auth/login` | 401 |
| Development build, connection file in the config folder: start opens the Overview directly, no password field anywhere; the file is moved into the store and deleted | passed |
| Feature change: draft → publish → public `/bundles/client` shows the new value (sequence 2) | passed |
| All owner sessions revoked in the database while the app runs: next action reconnects silently, no screen change | passed |
| Second computer (`npm run owner:connection`, `POLARIS_OWNER_CONNECTION`) opens the dashboard; removed from the first app under Security; the second app shows *Connection not accepted* on its next request | passed |
| Restart: dashboard opens again without input | passed |
| Empty profile: *Connect this computer*; file dropped in, *Check again* → dashboard | passed |
| Backend stopped: *Backend not reachable* with countdown; backend started → dashboard opens by itself | passed |
| Packaged `Polaris-Owner-1.0.0.AppImage`, connection file next to the AppImage, empty profile: dashboard opens directly; publish → live bundle sequence 3; Security warns about the leftover file | passed |

The sandbox has no OS keyring, so the tests used the file fallback (mode 0600) for the key. The encrypted `safeStorage` path is the same code with `encryptString`/`decryptString`, but it was not run here.

## Packaging

| Artifact | Size | Check |
| --- | --- | --- |
| `dist/Polaris-Client-1.0.0.AppImage` | 108.4 MB | Started under Xvfb, UI test passed |
| `dist/Polaris-Client-1.0.0.deb` | 75.0 MB | Built by electron-builder. Contents not installed system-wide in the sandbox |
| `dist/Polaris-Owner-1.0.0.AppImage` | 108.7 MB | Started (extract-and-run, no FUSE in the sandbox) and tested against a local backend |

## Limits (not tested or not testable here)

- **Gameplay inside Kirka.io.** The sandbox has no GPU and no human player. The game page loads in the game view, but match detection, in-match FPS and HUD restyling were not checked during a real match. Selectors for the game's interface can be overridden in Settings → Advanced if Kirka.io changes its layout.
- **Measured performance gains.** No benchmark comparison against the browser was made, so Polaris makes no claims about higher FPS.
- **Recording.** The Replays view was opened without errors, but a full recording was not made in the headless sandbox. On Linux, Electron window capture records video without system audio.
- **In-place AppImage update.** The update flow (signed manifest, SHA-512, swap, `.previous` rollback) uses the same Ed25519 envelope verification that the unit tests cover. The download, hash and swap steps can only be tested live once a second release exists, so a live swap from 1.0.0 to a newer release has not been tested yet.

## Deployment verification (18 November 2026)

- GitHub Actions on `main`: **Tests** passed and **Deploy Community Hub** passed.
- https://julianba-12.github.io/kirka-client/ and its pages (downloads, news, changelog, skins, support) return HTTP 200. `data/client-bundle.json`, `data/releases.json` and `data/website-bundle.json` are served and signed with key `6906d93966a1b517`. Fixture data is not published (`/fixtures/` returns 404).
- The download links point to the v1.0.0 release assets. The SHA-512 shown on the downloads page matches the uploaded AppImage (`f03920f73cbfe049…`).
- The AppImage downloaded from the GitHub release was started and logged `accepted client bundle {"source":"mirror","sequence":2}` and `accepted releases bundle {"source":"mirror","sequence":2}`. So the shipped trust key verifies the live configuration.
- The public release contains only the client AppImage, the client .deb and SHA256SUMS.txt. The Owner build is only in the private repository `JulianBa-12/polaris-owner`.
