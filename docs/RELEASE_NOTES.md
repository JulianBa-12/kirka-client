# Polaris Client 1.1.0

Polaris 1.1 adds a command center, guided setup, workspaces and a set of tools for comparing, tracking and backing up your setup. It also adds live updates from a Polaris server and a German interface. Polaris is an independent client and is not made by or affiliated with Kirka.io.

## Downloads

| File | For |
| --- | --- |
| `Polaris-Client-1.1.0.AppImage` | Any x86-64 Linux distribution. Make it executable and run it. |
| `Polaris-Client-1.1.0.deb` | Debian, Ubuntu and derivatives. |

Every file is listed with its size and SHA-512 in the signed release manifest. The SHA-256 checksums are also on the [downloads page](https://julianba-12.github.io/kirka-client/downloads.html).

## Updating from 1.0.0 — one manual step

The release-signing key was replaced (new key ID `d3d1bf42ccbcdfe3`). Polaris 1.0.0 only trusts the old key, so its Update Center reports that it **cannot verify the release manifest**. That is the intended, safe behaviour. Download 1.1.0 once by hand from the downloads page or GitHub Releases. Your settings and library stay where they are. From 1.1.0 on, updates verify automatically again.

## What's new

- **Command Center.** Press Ctrl+K anywhere, even while the game is focused. Search every page, action, setting, workspace and profile. Typing “crosshair” opens Crosshair Studio. Commands you use often rank higher. Alt+Enter gives any command its own shortcut. The Quick Access menu in the title bar holds your most used commands.
- **Smart Setup.** A short first-run wizard covers language, recommendations based on your system, and importing settings or a backup. You accept or decline each recommendation, and nothing changes until you finish. You can run it again from Settings.
- **Workspaces.** Save your menu order, hidden pages, home widgets, quick-access commands and an optional linked profile. Switching workspaces takes effect instantly.
- **Visual Lab.** Compare two visual setups (crosshair, colour filter, backdrop) side by side. You can try either one in the running game before you keep it.
- **Session Journal.** Every measured session, with your notes, tags, rating and favourites. The numbers come only from Polaris' own session tracker. Polaris doesn't invent match results.
- **Profile Automation.** Local “when … then …” rules, for example “when a match starts, switch to the Competitive profile”. Rules only change Polaris settings or show a notice. They never send input to the game.
- **Backup Vault.** Automatic and manual snapshots of all your Polaris data, each with a SHA-256 integrity check. You can export, import and restore them. Polaris takes a safety snapshot before every restore, and a damaged backup can never be restored.
- **Diagnostics.** Real checks of the GPU, memory, disk space, data folder, network, configuration signature, live updates and recent errors. Each check shows the measured value and how to fix a problem. You can copy or export the report for a bug report.
- **Creator Gallery.** Community skins, backgrounds, crosshairs, HUD layouts, themes, workspaces and resources. You can rate items with 1–5 stars, favourite, report, install with one click and share items from your library.
- **Live updates.** When a Polaris server is configured, changes the team publishes arrive within seconds: configuration, announcements, maintenance notices and personal notifications. If a change needs a restart, Polaris tells you. The connection status is in the title bar and in Settings → Advanced.
- **Deutsch.** The interface is available in German. Switch it in Settings → General or in Smart Setup.

## Known limitations

- Live updates, the Creator Gallery, ratings, the marketplace, social features and cloud sync need a Polaris server (Settings → Account). Without one, Polaris checks the signed configuration mirror on GitHub Pages every 30 minutes.
- The German translation covers the interface texts. Some dynamic messages (server errors, diagnostics details) are still in English.
- Custom command shortcuts work in the Polaris interface. While the game is focused, only the Command Center key (Ctrl+K) and F1 are captured.
- Kirka.io has no public API for stats, inventory, replays or skins. Polaris doesn't pretend to have one.
- Latency is the HTTPS round trip to kirka.io, not the in-game server ping. Screen recording on Linux captures video without game audio.

## Fair play

Polaris contains no cheats, aimbots, wallhacks, input automation or anti-cheat bypasses. It doesn't read game memory or change gameplay data. Profile automation and commands only change Polaris itself.

---

Release notes for 1.0.0 are in the [changelog](../CHANGELOG.md).
