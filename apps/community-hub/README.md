# Polaris Community Hub

The public website for Polaris Client: downloads, news, changelog, features, guides, plus the community parts (accounts, skin gallery, resources, plugins, suggestions, bug reports). It's built with plain HTML, CSS and ES modules. There's no framework, no CDN and no runtime dependencies. It runs from static files on GitHub Pages under `/kirka-client/`, and switches on the live community features when a backend is configured.

> Unofficial. Polaris is not affiliated with Kirka.io.

## Build

```bash
npm run build                      # → dist/
node scripts/build.js --data <dir> # overlay real data files (or POLARIS_HUB_DATA=<dir>)
node scripts/build.js --base /kirka-client/   # <base> used only by 404.html (default)
npm run serve                      # http://127.0.0.1:4173/kirka-client/ (404 fallback like Pages)
npm test                           # build + static smoke test (links, CSP, imports, data shapes)
```

Node ≥ 18. The build:

- renders `src/pages/*.html` into `src/partials/{head,header,footer}.html`. Each page begins with `<!--@page {json} -->` (`title`, `description`, `css[]`, `js`, `nav`, `base`, `bodyClass`).
- bundles `src/css/{tokens,base,layout,components}.css` → `assets/css/site.css`, and copies page CSS to `assets/css/pages/`.
- copies `src/js` → `assets/js`, and creates `assets/js/defaults.js` from `shared/configuration/defaults.js` (`website.site`, `website.theme`, `website.css`, `community.settings`).
- copies these shared assets: fonts, `shared/design/base.css`, `icons.js`, `markdown.js` and brand files. The client icon and mark are copied; the owner icon never is.
- copies `public/` (data, robots.txt), then the `--data` overlay. It writes `.nojekyll` and adds a content-hash `?v=` to every asset.

All links and asset paths are relative, so the site works under any sub-path. The only exception is `404.html`, which GitHub Pages serves at arbitrary depths and so gets `<base href="/kirka-client/">`.

## Structure

```
src/pages/        one file per page (16)
src/partials/     head, header (nav, announcements host), footer (disclaimer)
src/css/          tokens · base · layout (12-col grid, header, page head) · components · pages/*
src/js/core/      dom (safe element builder), format, api, data, chrome (theme/nav/footer), states, items, feedback
src/js/pages/     page controllers
public/data/      baseline data shipped by default (honest: no release, no news, apiBase "")
fixtures/sample/  development fixtures with placeholder checksums. Never deploy.
scripts/          build.js, seed.js (regenerates public/data; --sample → fixtures/sample), serve.js
test/             smoke.js (static), shots.js (Playwright screenshots/overflow/console), live.js (live E2E)
```

## Data files (`data/`)

| File | Shape | Used by |
|---|---|---|
| `site-config.json` | `{ "apiBase": "" }`, either an origin or a URL ending in `/api/v1` | all pages |
| `website-bundle.json` | signed envelope; `payload` is a JSON string `{ website.site, website.theme, website.css, community.settings, … }` | theme, nav, footer, hero, sections, page copy |
| `releases.json` | signed envelope; payload `{ channels: { stable, beta }, releases: [...] }` | downloads, home, changelog |
| `news.json` | `{ items: [...] }` | home, news |
| `changelog.json` | `{ items: [...] }` | changelog |

The exporter is `node backend/scripts/export-static.js <dir>`. Run it, then build with `--data <dir>` (or write its output into `public/data`). Any missing file falls back to the defaults or an empty state. Nothing is invented.

Rules for downloads: only `linux-appimage` and `linux-deb` files are shown, and anything matching `/owner/i` in its name or URL is dropped. The DEB only appears when `website.site.downloads.showDeb` is set. With no stable release, the page shows "First release pending".

## Live mode

Set `apiBase` in `data/site-config.json` to switch on the live mode. The site checks `GET /health` once per page:

- **online**: accounts (register/login/2FA code, profile edit, public profiles `?u=`), groups, the gallery and catalogs (list, search, upload, like, comment, report, download), suggestions with voting, bug reports, announcements and live news/releases/bundle (preferred over static).
- **maintenance**: shows the backend's message. Static content keeps working.
- **offline / not configured**: interactive sections show a clear "Community backend offline / not configured" panel. The site never shows fake users or fake numbers.

The session token is stored in `localStorage["polaris.hub.token"]`. Requests use `Authorization: Bearer` with `credentials: 'omit'`, so CORS must allow the Pages origin. When online, download clicks send `POST /telemetry/download` (no personal data).

## Security

- Strict CSP meta tag on every page. No inline scripts and no inline styles. `website.css` overrides go through a constructable stylesheet. Theme values are applied as CSS custom properties.
- Remote text is only inserted with `textContent` or `PolarisMarkdown.render` (which escapes). URLs pass through `safeHref`/`safeMediaUrl` (only http(s), relative, or the API origin).
- Forms are checked in the browser before they are sent, and the backend checks them again.
- `connect-src`/`img-src` allow `http://127.0.0.1:*` and `http://localhost:*` for local development only.

## Testing

```bash
npm test
node test/shots.js --widths 1440,1024,768,375,360   # needs the server on :4173
node test/live.js --api http://127.0.0.1:8789/api/v1 --owner-token <token>   # THROWAWAY backend only
```

`live.js` registers an account, edits the profile, uploads a PNG skin, approves it (only if an owner token for the throwaway instance is given), likes and comments, posts a suggestion and votes on it, files a bug report, opens the public profile, and signs out and back in.
