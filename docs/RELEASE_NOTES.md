# Polaris Client 1.0.0

The first public release of Polaris, an independent desktop client for Kirka.io. Polaris is not made by or affiliated with Kirka.io.

## Downloads

| File | For |
| --- | --- |
| `Polaris-Client-1.0.0.AppImage` | Any x86-64 Linux distribution. Make it executable and run it. |
| `Polaris-Client-1.0.0.deb` | Debian, Ubuntu and derivatives. |

Every file is listed with its size and SHA-512 in the signed release manifest. The built-in Update Center checks both before it installs anything.

## What's included

- **Game window.** Kirka.io runs in an isolated game view with its own session storage. Polaris has its own title bar and window controls, remembers window size and position, and supports fullscreen. F1 switches between the game and the Polaris interface.
- **Crosshair Studio.** Cross, dot, circle and T shapes with outline, centre dot, rotation, opacity and a pulse animation. Includes presets, share codes and import/export. The crosshair is drawn as an overlay above the game.
- **HUD Editor.** Drag-and-drop layout for the Polaris overlays (FPS, latency, session timer, clock). Supports anchors, scaling, colours and fonts, plus best-effort styling of Kirka's own kill feed, scoreboard and weapon info.
- **Skin Studio.** Pixel editor for 64×64 and 128×128 skin templates. Includes layers, mirroring, fill, eyedropper, undo/redo and a skin library. Skins are local cosmetics only, so other players don't see them.
- **Backgrounds.** Image and video backgrounds with a rotation queue of up to 50 items.
- **Resource swapper.** Replaces images and sounds the game loads with your own files. Models, maps, collision, hitboxes and scripts can't be swapped.
- **Maps.** Visual brightness, contrast and saturation filters, plus per-map notes. Map geometry and gameplay data are never changed.
- **Performance Center.** Live FPS, frame time, CPU, memory and HTTP latency to kirka.io. Includes three performance profiles and a benchmark that records real measurements. Polaris never claims a gain it hasn't measured.
- **Analytics.** Session time, time in matches, FPS history and a manual match log. Kirka.io doesn't share match results with third-party clients, so Polaris shows no invented statistics.
- **Replays.** Records the game window to WebM (video only on Linux). Includes bookmarks and a library.
- **Smart Profiles.** One-click setups (Competitive, Casual, Minimal, Performance, Practice) plus your own profiles.
- **Marketplace, Social and Inventory.** These features need a Polaris community server. Everything on the marketplace is free. Polaris never sells, trades or processes Kirka.io items, KC or coins.
- **Plugins (beta).** Sandboxed plugins with explicit permissions. They have no Node.js, network or game access.
- **Update Center.** Verifies the signed manifest and SHA-512. Downloads always ask before installing, and you can roll back.
- **Settings.** General, Appearance, Performance, Game, Privacy, Account and Advanced. Includes settings import/export, keybinds, reduced motion and the option to turn off decorative effects.

## Known limitations

- Kirka.io has no public API for stats, inventory, replays or skins. Polaris doesn't pretend to have one.
- Latency is the HTTPS round trip to kirka.io, not the in-game server ping.
- Chromium doesn't expose GPU utilisation to apps, so it isn't shown.
- Screen recording on Linux captures video without game audio.
- Discord Rich Presence isn't included in 1.0.0.
- Marketplace, social features and cloud sync only work when a Polaris server is configured under Settings → Account.

## Fair play

Polaris contains no cheats, aimbots, wallhacks, input automation or anti-cheat bypasses. It doesn't read game memory or change gameplay data.
