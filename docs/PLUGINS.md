# Writing Polaris plugins

Plugins add small panels, overlays and tools to Polaris Client. Each one runs in a locked-down frame:

- It has an opaque origin with CSP `default-src 'none'`. It can't make network requests, load remote scripts or images, or use Node.js or Electron APIs.
- It has no access to the Kirka.io page, its memory, input or network traffic. A plugin can't aim, move, read keys or automate anything.
- It talks to Polaris only through `window.polaris`, which sends `postMessage` calls to the host. The host checks every call against the permissions the user granted.

## Package format

A plugin is a single JSON file (`*.polaris-plugin.json`):

```json
{
  "format": "polaris-plugin/1",
  "manifest": {
    "id": "session-clock",
    "name": "Session clock",
    "version": "1.0.0",
    "author": "You",
    "description": "What it does, in one sentence.",
    "permissions": ["ui.panel", "storage"],
    "minClientVersion": "1.0.0"
  },
  "code": "polaris.root.textContent = 'Hello';"
}
```

`id` must be 3–48 characters long and use only lowercase letters, digits, `.` and `-`. `code` can be up to 200 KB. It runs as a classic script inside `(function(){'use strict'; … })()`.

## Permissions

| Permission | Grants |
| --- | --- |
| `ui.panel` | Show the plugin's panel on the Plugins page (`polaris.root`) |
| `storage` | `polaris.storage.get(key)` / `polaris.storage.set(key, value)`, up to 256 KB per plugin |
| `notifications` | `polaris.notify(text)` shows a short toast in Polaris |
| `hud.overlay` | `polaris.hud.set(text)` / `polaris.hud.clear()` shows one line (max 80 chars) on the in-game overlay |
| `game.events` | `polaris.on('match', ({ started }) => …)` and `polaris.on('metrics', ({ fps, frameTime }) => …)` |
| `theme.read` | `polaris.theme.get()` and `polaris.on('theme', colors => …)` |

`polaris.info()` returns `{ id, name, version, permissions, client }` and needs no permission.

At install time the user decides which of the requested permissions to grant, and can change that later on the Plugins page. For marketplace plugins, the owner's review sets an upper limit. A plugin can never get more than the reviewed permissions.

## Example

[`examples/plugins/session-clock.src.js`](../examples/plugins/session-clock.src.js) is a complete plugin. It shows the session length and FPS, stores the best FPS, and mirrors the time on the overlay. To build the installable file, run:

```bash
node examples/plugins/build.js   # → examples/plugins/session-clock.polaris-plugin.json
```

Install it with Plugins → Install from file.

## Publishing

Upload the `.polaris-plugin.json` file on the Marketplace (Plugins category) or on the Community Hub's Plugins page. The backend derives the manifest and SHA-256 from the file. The owner reviews the code and approves permissions. Only approved versions are listed, and the client checks the SHA-256 before it installs a plugin.
