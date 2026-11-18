# Polaris

Polaris is an independent desktop client for [Kirka.io](https://kirka.io), plus a community website and a self-hosted backend. Polaris is not made by or affiliated with Kirka.io.

- **Polaris Client.** An Electron desktop app that runs the official Kirka.io game. Around the game it adds a crosshair studio, HUD editor, skin studio, backgrounds, a resource swapper, a performance center, analytics, replays, profiles, sandboxed plugins and a signed update center. Since 1.1 it also has a command center (Ctrl+K), Smart Setup, workspaces, Visual Lab, a session journal, profile automation, a backup vault, diagnostics, a creator gallery with ratings, live updates over WebSocket and a German interface.
- **Polaris Community Hub.** A static website (GitHub Pages) with downloads, news, changelog, features, guides, documentation, a skin gallery, a resource library, plugins, community, support, bug reports, suggestions and contact. Website: <https://julianba-12.github.io/kirka-client/>
- **Polaris backend.** A Node.js/Express service with SQLite storage. It provides accounts, a community marketplace with ratings, social features, moderation, a realtime hub (WebSocket), and signed remote configuration and release manifests.
- **Polaris Owner.** The project owner's private administration app. It is **not** part of this repository and is not offered as a public download.

## Download

Get the latest release from [GitHub Releases](https://github.com/JulianBa-12/kirka-client/releases/latest):

```bash
chmod +x Polaris-Client-1.1.0.AppImage
./Polaris-Client-1.1.0.AppImage
```

On Debian or Ubuntu you can install the `.deb` package with `sudo apt install ./Polaris-Client-1.1.0.deb` instead. See [docs/INSTALL.md](docs/INSTALL.md) for details.

## Updating from 1.0.0

The release-signing key changed in 1.1.0. Polaris 1.0.0 can't verify the new manifest, so download 1.1.0 manually once. After that, updates are automatic again. See the [release notes](docs/RELEASE_NOTES.md).

## Fair play

Polaris draws overlays and applies styles. It never reads game memory, changes hitboxes or gameplay data, automates input or bypasses anti-cheat. Skins made in Polaris are local cosmetics. Polaris never sells, trades or processes Kirka.io items, KC or coins.

## Repository layout

```
apps/client/          Polaris Client (Electron) → dist/Polaris-Client-1.1.0.AppImage
apps/community-hub/   Community Hub website (static, no framework) → GitHub Pages
backend/              Polaris backend (Node 22, Express 5, node:sqlite)
shared/               Design tokens, icons, fonts, configuration schemas/defaults, signing utilities
examples/plugins/     Example plugin (session clock)
docs/                 Installation, development, architecture, API, plugins, testing, release notes
scripts/              Repository tools (UI smoke test over the DevTools protocol)
```

## Build from source

You need Node.js 22.13 or newer.

```bash
npm install          # installs client, website and backend dependencies
npm run build:linux  # → dist/Polaris-Client-1.1.0.AppImage and dist/Polaris-Client-1.1.0.deb
npm test             # client, backend and website tests
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for details.

## Documentation

- [Installation](docs/INSTALL.md)
- [Development guide](docs/DEVELOPMENT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Backend API](docs/API.md)
- [Owner and server setup](docs/OWNER_SETUP.md)
- [Plugin guide](docs/PLUGINS.md)
- [Testing report](docs/TESTING.md)
- [Release notes 1.1.0](docs/RELEASE_NOTES.md)
- [Changelog](CHANGELOG.md)
- [Security policy](SECURITY.md)

## License

MIT. See [LICENSE](LICENSE). Kirka.io and its assets belong to their respective owners.
