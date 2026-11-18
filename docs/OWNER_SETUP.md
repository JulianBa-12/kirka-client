# Owner setup

This guide takes you from a fresh backend to a working Polaris Owner. Polaris
Owner has **no login**: no username, no password, no sign-in screen. When you
start it, it opens the Owner Dashboard directly. It also covers backups and
GitHub Pages publishing. No owner credentials exist anywhere in the repository.

## How owner access works

- On its first start the backend creates the owner account and an **owner
  connection**: an Ed25519 key pair. The backend stores only the public key.
  The private key goes into `data/owner-connection.json` (mode 0600), together
  with the backend URL.
- Polaris Owner imports this file once and stores it in its config folder
  (`~/.config/Polaris Owner/`), encrypted with the OS keyring (`safeStorage`).
  Without a keyring it uses a file readable only by your user (mode 0600).
- On every start, and whenever a session expires, the app silently fetches a
  one-time challenge from the backend, signs it with the private key and
  receives an owner session (`POST /owner/auth/connect`). You never type
  anything.
- The backend gives owner rights only to a valid signature from a registered,
  non-revoked connection. The public Polaris Client never gets owner rights,
  even if it claims to be an owner. The owner account has no password, so
  `/auth/login` refuses it. A hidden button or a local flag does nothing.
- **Anyone who has the connection file has owner access.** Treat it like an
  SSH private key.

## 1. Start the backend

```bash
cd backend
npm install
npm start                       # listens on http://127.0.0.1:8787 by default
```

Set `POLARIS_PUBLIC_URL` to the address at which the Owner computer reaches the
backend (for example `https://api.example.org`). That address is written into
the connection file.

| Variable | Default | Purpose |
| --- | --- | --- |
| `POLARIS_DATA_DIR` | `./data` | Database, uploads, backups, signing keys, first owner connection |
| `POLARIS_PORT` / `POLARIS_HOST` | `8787` / `127.0.0.1` | Listen address |
| `POLARIS_PUBLIC_URL` | `http://127.0.0.1:<port>` | Public base URL (file links, owner connection) |
| `POLARIS_CORS_ORIGINS` | GitHub Pages + local dev origins | Allowed browser origins (website) |
| `POLARIS_TRUST_PROXY` | `0` | Set `1` behind a reverse proxy |
| `POLARIS_SIGNING_KEY_FILE` | — | Use an existing Ed25519 key instead of `data/keys` |

On the first start the log shows:

```
WARN Owner connection created: /…/backend/data/owner-connection.json
```

## 2. Connect Polaris Owner (once)

Use one of these:

- **Same computer:** copy the file to `~/.config/Polaris Owner/owner-connection.json`
  and start Polaris Owner. The app moves it into its encrypted store and deletes
  that copy.
- **Next to the AppImage:** put `owner-connection.json` in the folder of
  `Polaris-Owner-1.0.0.AppImage`. The app imports it on start. Delete the file
  afterwards (Security shows a warning while it still exists).
- **Open it by hand:** if the app has no connection yet, it shows *Connect
  this computer* → **Open connection file…**.
- **Servers / scripts:** `POLARIS_OWNER_CONNECTION=/path/to/file` always wins.
  In this case the file stays where it is.

Copy the file from a remote server over a secure channel (`scp`), never by
chat or e-mail. Then delete the copy on the server: `rm backend/data/owner-connection.json`.
The backend reminds you in its log on each start while the file exists.

From now on Polaris Owner opens the dashboard directly. If the backend is not
reachable, the app shows *Backend not reachable* and retries every 5 seconds.
Under *Change address* you can enter a new server address.

## 3. More computers, lost computers, recovery

- **Add another computer:** Security → Owner connections → **Add another
  computer…**. The new key pair is created on your computer and only the
  public key is sent to the backend. Save the file, move it to the other
  computer (USB stick, `scp`) and import it there as in step 2.
- **Remove a computer:** Security → Owner connections → **Remove**. Its
  sessions end immediately and it cannot reconnect. The last connection
  cannot be removed from the app, so you cannot lock yourself out.
- **On the server** (recovery, e.g. if every Owner computer is gone):

```bash
cd backend
npm run owner:connection -- --name "Laptop"                    # writes data/owner-connection.json
npm run owner:connection -- --url https://api.example.org --out /tmp/owner.json
npm run owner:connection -- --revoke-all --name "New laptop"   # remove all others first (key leaked)
```

The command works while the backend is running.

## 4. Day-to-day security

- **Security** lists every owner connection (computer, ID, last used, last
  IP), every owner session, and every rejected attempt (unknown key, wrong
  signature, replayed challenge, revoked connection).
- **Owner sessions** last 12 hours by default (Backend Management → *Owner
  session*, 1–72 h). The app renews them silently.
- **Session token storage:** encrypted with the OS keyring. Without a keyring
  it is kept in memory only (a new session is created silently on the next
  start). It is never written in plaintext.
- Back up `data/` (database incl. the public keys of the connections) as
  described below. The private keys exist only on the Owner computers.

## 6. Signing key and trust.json

The backend signs every client, website and release bundle with an Ed25519
key in `data/keys/` (or `POLARIS_SIGNING_KEY_FILE`). Clients accept only
bundles signed by a key listed in `shared/configuration/trust.json`. After
the first start, or after a key rotation:

```bash
cd backend
npm run keys:export-trust      # adds the current key to shared/configuration/trust.json
```

Then rebuild and release the client. **Back up `data/keys/`**: if you lose
the private key, every installed client will reject new configuration until
it is updated with a new trust.json. Configuration Management → *Verify*
warns when the live signing key is missing from the trust.json that ships
with the apps.

## 7. Backups

Backups → **Create backup** writes a consistent SQLite snapshot
(`VACUUM INTO`) to `data/backups/polaris-<timestamp>.db`. It includes users,
content metadata, configuration with full revision history, sessions and the
audit log.

- **Download** saves a copy to your machine through the owner API.
- **Restore** requires typing `restore`. The backup is *staged* as
  `data/restore-pending.db` and applied the next time the backend starts.
  Before swapping, the current database is saved as
  `polaris-<timestamp>-prerestore.db`. Restart the backend to finish.
- **Not included:** `data/uploads/` (asset and community files), `data/keys/`
  and `.env`. Back these up separately, e.g.

```bash
tar czf polaris-files-$(date +%F).tgz -C backend/data uploads keys
```

Recommended routine: create a backup before every large publish or import,
download one weekly, and keep uploads + keys in your regular server backups.

## 8. GitHub Pages publishing (website data)

The Community Hub website can be served as static files from GitHub Pages.
When publishing is configured, the backend writes the public website data
(site, theme, news, releases, featured items …) as JSON into the Pages
repository in a single commit. Content changes trigger an automatic publish
about 5 seconds later. You can also publish manually under Website
Management → GitHub publishing.

Set these on the **backend** (environment or `backend/.env`), then restart it:

| Variable | Required | Default | Meaning |
| --- | --- | --- | --- |
| `POLARIS_GITHUB_TOKEN` | yes | — | Fine-grained personal access token with **Contents: Read and write** on the Pages repository only |
| `POLARIS_GITHUB_REPO` | yes | — | `owner/repository`, e.g. `JulianBa-12/kirka-client` |
| `POLARIS_GITHUB_BRANCH` | no | `main` | Branch that GitHub Pages builds from |
| `POLARIS_GITHUB_PATH` | no | `apps/community-hub/public/data` | Folder inside the repository for the JSON files |

```bash
# backend/.env  (keep this file out of git; chmod 600)
POLARIS_GITHUB_TOKEN=github_pat_…
POLARIS_GITHUB_REPO=JulianBa-12/kirka-client
POLARIS_GITHUB_BRANCH=main
POLARIS_GITHUB_PATH=apps/community-hub/public/data
```

The token stays on the backend. The Owner app and the website never see it.
The app only shows whether publishing is configured, the target repository,
branch and path, and the last commit or error. If the token is missing, the
Overview and Website Management show **NOT_CONFIGURED**.
