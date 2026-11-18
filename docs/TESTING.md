# Testing report — Polaris 1.1.0

Tested on 18 November 2026 on Linux x86_64 (Debian-based sandbox, Xvfb display at 1440×900, Node 22, Electron 33.4.11). Every result below comes from an actual run. Anything that wasn't or couldn't be tested is listed under Limits. The 1.0.0 report is in the Git history of this file.

## Automated tests

| Suite | Command | Result |
| --- | --- | --- |
| Backend API: auth, 2FA and recovery codes, owner connections (challenge/response, forged/replayed/revoked keys), owner scope enforcement, config draft → publish → rollback, signatures, uploads, social, moderation. New in 1.1: contact messages are stored privately, and the realtime hub is covered (hello with bundle sequences, the owner channel requires an owner session, a published feature change reaches clients instantly with its apply mode, announcements and maintenance pushes, personal notifications only for the signed-in user, owner REST view and resync) | `npm --prefix backend test` | 21 / 21 passed |
| Client unit tests: signed envelopes and trust store, schema validation, CSS sanitizer, magic-byte detection, library and plugin packages, defaults fallback. New in 1.1: workspace validation, Backup Vault (create, verify, detect tampering, selective restore, install ID never written to a backup), Markdown tables (including a single `\|…\|` line, which used to hang) | `npm --prefix apps/client test` | 18 / 18 passed |
| Client static check (every main, preload and renderer file) | `npm --prefix apps/client run check` | 64 / 64 files OK |
| Community Hub build and smoke test (18 pages, internal links, module imports, data shapes) | `npm --prefix apps/community-hub test` | passed |
| Owner static check | `npm --prefix apps/owner run check` (private repo) | 51 / 51 files OK |

## Client UI tests

`scripts/smoke-ui.js` launches the app with `--remote-debugging-port`, opens every view, records uncaught exceptions and console errors, and saves a screenshot of each view. All screenshots were reviewed by hand.

| Run | Result |
| --- | --- |
| Development build, all 27 views (17 main views plus Themes & Style, Visual Lab, Creator Gallery, Session Journal, Profiles, Workspaces, Automation, Backup Vault, Diagnostics, Resources, Updates) | 0 errors |
| Development build signed in to a local backend: Creator Gallery detail with star rating (rated 5, average shown), install, favourite, report | all worked, 0 errors |
| Settings → Advanced: realtime state *Connected*, signed in, event count increases | passed |
| Owner turns maintenance on and posts an announcement: the client shows the maintenance banner and the announcement toast/widget without a restart; maintenance off removes the banner | passed |
| Packaged `Polaris-Client-1.1.0.AppImage`, all 27 views | 0 errors. Log: `appImage: true`, `accepted client bundle {"source":"server","sequence":3}` |
| Packaged AppImage: maintenance switched on from the owner side arrives live | passed (banner *Server maintenance until 18:00*) |
| Packaged AppImage: Command Center search, Quick Access menu, Smart Setup system step with Accept/Decline for each recommendation, interface switched to German | passed |
| Diagnostics before the static mirror was re-signed | reported *Signature check failed: untrusted signing key 6906d93966a1b517* as a failure instead of hiding it, which is correct |

## Owner application

| Check | Result |
| --- | --- |
| Development build: Live section, title-bar Live badge, connection list (Polaris Client / Polaris Owner), event stream | passed |
| Owner realtime connection runs in the main process without an `Origin` header and is authenticated with the owner session. Revoked sessions are renewed with the owner key | passed |
| Configuration table shows *Live* or *Restart* for every domain (`client.performance` = Restart). The publish dialog says which applies | passed |
| Community items: rating column and detail. Feedback: *Contact messages* filter shows Hub contact form posts | passed |
| Packaged `Polaris-Owner-1.1.0.AppImage`, empty profile plus a fresh connection file: dashboard opens directly with no login; all 26 sections opened | 0 errors |

## Community Hub

Built with `apiBase` pointing at a local backend and served locally:

| Check | Result |
| --- | --- |
| Contact form → *Sent. Reference #1*, stored as private feedback of type `contact` | passed |
| Maintenance on/off from the owner side: banner appears and disappears without a reload | passed |
| Documentation page renders the repository docs (7 tables on the API page), no horizontal overflow at 375 px | passed |
| Offline (no `apiBase`): contact page shows the GitHub fallback, other pages use the signed static data | passed |
| Console errors on all pages | none |

## Packaging

| Artifact | Size | SHA-256 |
| --- | --- | --- |
| `Polaris-Client-1.1.0.AppImage` | 108.5 MB | `05ab1333711d7b0185bfb9901d7e63efda59575ada136f6550c5df221c1640b4` |
| `Polaris-Client-1.1.0.deb` | 75.1 MB | `2edee3840893ce230a87df9fb0197a900dc1902dac99985b1d72aa135a8ca308` |
| `Polaris-Owner-1.1.0.AppImage` (private repo only) | 108.8 MB | `d0b5b2a61ac6719c956c29218a0c3350f65dac79a24cf5ae2de49f66f54f1963` |

The .deb files were built but not installed system-wide in the sandbox.

## Signing key rotation

The private key used for 1.0.0 (`6906d93966a1b517`) was not available on the build machine. 1.1.0 ships a new key (`d3d1bf42ccbcdfe3`) in `shared/configuration/trust.json`, and the static mirror was re-signed with it. As a result, 1.0.0 installations can't verify the new update manifest and have to download 1.1.0 manually once. This was confirmed on purpose: a client that only trusts the old key rejects the new mirror with *untrusted signing key*.

## Limits (not tested or not testable here)

- **Gameplay inside Kirka.io.** The sandbox has no GPU and no human player. The game page loads, but match detection, in-match FPS and HUD styling were not checked during a real match.
- **Performance gains.** No benchmark against the browser was made, so Polaris makes no FPS claims.
- **Recording.** A full recording wasn't made in the headless sandbox.
- **In-place AppImage update.** Download, hash and swap need a second release signed with the same key. The first such pair is 1.1.0 → 1.1.x, so the live swap is still untested.
- **Public backend.** No backend is hosted publicly. Realtime, sign-in and community features need a self-hosted backend (see OWNER_SETUP.md). Without one, the client and the Hub use the signed static mirror on GitHub Pages.
- **Translations.** German covers the dictionary strings (navigation, shell, settings, common actions). Some dynamic texts are still English.
