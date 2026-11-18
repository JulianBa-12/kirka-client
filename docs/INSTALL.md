# Installing Polaris Client

Polaris 1.0.0 is available for 64-bit Linux (x86-64).

## AppImage (any distribution)

1. Download `Polaris-Client-1.0.0.AppImage` from the [latest release](https://github.com/JulianBa-12/kirka-client/releases/latest).
2. Optional: check the file against the SHA-512 listed in the release notes:
   `sha512sum Polaris-Client-1.0.0.AppImage`. (The release manifest stores the hash in base64. Run `openssl dgst -sha512 -binary FILE | base64` to compare.)
3. Make it executable and start it:

   ```bash
   chmod +x Polaris-Client-1.0.0.AppImage
   ./Polaris-Client-1.0.0.AppImage
   ```

AppImages need FUSE 2. If you get `dlopen(): error loading libfuse.so.2`, do one of the following:

- Install it (`sudo apt install libfuse2`, or `libfuse2t64` on Ubuntu 24.04).
- Run the AppImage with `APPIMAGE_EXTRACT_AND_RUN=1 ./Polaris-Client-1.0.0.AppImage`.

Inside containers or VMs without user namespaces, add `--no-sandbox`.

To add Polaris to your application menu, use a tool such as AppImageLauncher or Gear Lever. You can also install the `.deb` package instead.

## Debian / Ubuntu package

```bash
sudo apt install ./Polaris-Client-1.0.0.deb
polaris-client
```

To remove it: `sudo apt remove polaris-client`.

## Where Polaris keeps your data

| What | Path |
| --- | --- |
| Settings, profiles, analytics, plugin data | `~/.config/Polaris Client/data/` |
| Skins, backgrounds, resources, crosshairs, HUD layouts, themes | `~/.config/Polaris Client/library/` |
| Recordings | `~/.config/Polaris Client/replays/` |
| Logs | `~/.config/Polaris Client/logs/polaris-client.log` |
| Kirka.io session (cookies, storage) | inside `~/.config/Polaris Client/Partitions/` |

The Export and Import buttons at the top of Settings save and restore all of your settings, profiles and plugins. Settings → Advanced has a reset option.

## Updates

The Update Center (sidebar → Updates) downloads a signed release manifest. A download is only accepted when both its size and SHA-512 match the manifest. Polaris always asks before it replaces the AppImage and keeps the previous file next to it (`*.AppImage.previous`) so you can roll back. When Polaris doesn't run as an AppImage (for example from the `.deb`), it doesn't touch system files. It shows the verified download in your file manager so you can install it yourself.

## Community features

The Marketplace, Social, cloud sync and uploads are provided by a Polaris server. Enter its address under Settings → Account and create a Polaris account there. This account is separate from your Kirka.io account, so never enter your Kirka.io password in Polaris. Everything else works without a server and offline.

## Uninstall

Delete the AppImage, or remove the `.deb` package. Then delete `~/.config/Polaris Client/` to remove all local data.
