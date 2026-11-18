# Development guide

## Requirements

- Node.js **22.13 or newer**. The backend uses the built-in `node:sqlite` module.
- Linux x86-64 for packaging. `electron-builder` downloads its AppImage and fpm tooling on first use.
- For headless testing: `xvfb-run`.

## First run

```bash
npm install                       # root: installs apps/client, apps/community-hub and backend
cd backend && npm start           # http://127.0.0.1:8787 (data in backend/data)
cd apps/client && npm start       # syncs shared/ into src/shared, then starts Electron
cd apps/community-hub && npm run dev   # builds to dist/ and serves on http://127.0.0.1:4173
```

Point the client at your local backend under Settings → Account → Polaris server (`http://127.0.0.1:8787`). On the website, set `apiBase` in `apps/community-hub/public/data/site-config.json`.

Useful environment variables:

| Variable | App | Effect |
| --- | --- | --- |
| `POLARIS_USER_DATA` | client | Use a different profile directory, for example a throwaway profile for tests |
| `POLARIS_DEVTOOLS=1` | client | Allow DevTools in packaged builds |
| `POLARIS_PORT`, `POLARIS_HOST`, `POLARIS_DATA_DIR`, `POLARIS_PUBLIC_URL`, `POLARIS_CORS_ORIGINS` | backend | Listen address, data location, public URL and allowed web origins |
| `POLARIS_GITHUB_TOKEN`, `POLARIS_GITHUB_REPO`, `POLARIS_GITHUB_BRANCH`, `POLARIS_GITHUB_PATH` | backend | Lets the backend commit published data to the website repository |

Secrets belong in environment variables or `backend/.env`, which is ignored by git. Never commit `backend/data/`. It contains the database, uploads and the signing key.

## Shared code

`shared/` is the single source for design tokens (`design/base.css`), icons, fonts, brand marks, configuration schemas and defaults (`configuration/`), the trust store (`configuration/trust.json`) and utilities (signing, schema validation, CSS sanitizer, markdown). Each app runs `scripts/sync-shared.js` before it starts or builds. The script copies what the app needs into `src/shared/` so that electron-builder packages only the app folder. `src/shared/` is generated, so never edit it.

## Builds

```bash
npm run build:linux                     # client AppImage + deb → dist/
cd apps/community-hub && npm run build  # website → apps/community-hub/dist
```

`node scripts/build.js --data <dir>` overlays exported data files onto the website build.

## Publishing data for the website and the client

The backend signs every configuration bundle and release manifest with Ed25519. The client trusts only the public keys in `shared/configuration/trust.json`.

```bash
cd backend
npm run keys:export-trust                   # writes the backend's public key into shared/configuration/trust.json
node scripts/publish-release.js --version 1.0.0 --notes ../docs/RELEASE_NOTES.md \
  --base-url https://github.com/JulianBa-12/kirka-client/releases/download/v1.0.0 \
  ../dist/Polaris-Client-1.0.0.AppImage ../dist/Polaris-Client-1.0.0.deb --news
npm run export:static                       # → apps/community-hub/public/data/*.json
```

Commit `apps/community-hub/public/data/`. The Pages workflow then rebuilds the site, and the client picks up the bundles through its mirror URL (`https://julianba-12.github.io/kirka-client/data`). The Owner app can also do this automatically through the backend's GitHub publisher.

If you rotate the signing key, update `trust.json` first and ship a client release with the new key. Older clients reject bundles signed by keys they don't know.

## Code style

- Plain JavaScript (CommonJS in main processes and the backend, ES modules in renderers). No framework and no bundler.
- Renderer DOM is built with `h()` from `lib/dom.js`. Data is always inserted as text, never as HTML.
- CSS uses the design tokens from `shared/design/base.css` and the theme variables in `apps/client/src/renderer/styles/app.css`. View layouts live in `views.css`.
- Every IPC channel is declared in `apps/client/src/main/ipc.js`, validates its arguments and is the only bridge to the main process (`preload/shell.js` exposes `invoke`/`on` for an allow-list).

## Tests

```bash
npm test                            # all of the below
cd apps/client && npm test && npm run check
cd backend && npm test
cd apps/community-hub && npm test
node scripts/smoke-ui.js <port> <outDir> [views…]   # drives a running client (started with --remote-debugging-port)
SMOKE_MODULE=./app.js SMOKE_FN=navigate node scripts/smoke-ui.js 9334 out overview live   # same for Polaris Owner (navigate via its app module)
```

See [TESTING.md](TESTING.md) for the latest results.
