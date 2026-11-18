# Owner setup

This guide walks you from a fresh backend to an owner account protected by
two-factor authentication. It also covers backups and GitHub Pages
publishing. Every step happens in **Polaris Owner** (`apps/owner`) or on the
backend host. No owner credentials exist anywhere in the repository.

## 1. Start the backend

```bash
cd backend
npm install
npm start                       # listens on http://127.0.0.1:8787 by default
```

Relevant environment variables (also read from `backend/.env`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `POLARIS_DATA_DIR` | `./data` | Database, uploads, backups, signing keys, setup token |
| `POLARIS_PORT` / `POLARIS_HOST` | `8787` / `127.0.0.1` | Listen address |
| `POLARIS_PUBLIC_URL` | `http://127.0.0.1:<port>` | Public base URL used in file links |
| `POLARIS_CORS_ORIGINS` | GitHub Pages + local dev origins | Allowed browser origins (website) |
| `POLARIS_TRUST_PROXY` | `0` | Set `1` behind a reverse proxy |
| `POLARIS_SIGNING_KEY_FILE` | — | Use an existing Ed25519 key instead of `data/keys` |

## 2. Get the one-time setup token

While no owner account exists, the backend creates a random setup token. It
prints the token to the console on every start:

```
    OWNER SETUP TOKEN: 3o0W…
```

The token is also stored in `data/owner-setup-token` (mode 0600). To print it
again, or to rotate it if it may have leaked:

```bash
cd backend
npm run owner:setup-token              # print the current token
npm run owner:setup-token -- --rotate  # generate a new one (old one stops working)
```

The token works once. After a successful claim the backend deletes the file,
and the `/owner/auth/claim` endpoint returns `409` from then on. If the host
is not on your machine, copy the token over a secure channel (for example an
SSH session). Do not paste it into chats or tickets.

## 3. Claim the backend

1. Start Polaris Owner (`dist/Polaris-Owner-1.0.0.AppImage`, or `npm start`
   in `apps/owner`).
2. Enter the backend URL without `/api/v1`, e.g. `https://api.example.org`.
   Use **Test connection** to check it.
3. The app detects that the backend is unclaimed and shows **Claim this
   backend**. Enter:
   - the setup token,
   - an owner username (3–20 letters, digits, underscore; it must not be
     taken by a community account),
   - a password with **at least 14 characters** that does not contain the
     username. The strength meter must reach at least "Fair". A long passphrase
     works best.
4. The backend answers `201`, creates the owner and signs you in. The app
   then opens **Settings** so you can enable 2FA right away.

## 4. Enable two-factor authentication (do this immediately)

Settings → Account & 2FA → **Set up 2FA**:

1. Scan the QR code with an authenticator app (Aegis, 2FAS, 1Password,
   Google Authenticator …). The app generates the QR code locally, so the
   secret never leaves your machine through a third-party service. You can
   also type the secret by hand or expand the `otpauth://` URL.
2. Enter the current 6-digit code → **Verify and enable**. A wrong code
   returns `422` and nothing changes.
3. Store the 8 **recovery codes** offline (Copy all / Save as file…). Each
   code works once in place of an authenticator code at sign-in. You can type
   them with or without the dash. They are shown only once.

From now on, signing in needs your username, password and an authenticator
or recovery code. Optionally, enable **Require owner 2FA** in Backend
Management. After that, 2FA can no longer be disabled from the app.

If you lose both your authenticator and your recovery codes, you can only
recover access on the backend host by restoring a backup or editing the
database directly. Keep the recovery codes safe.

## 5. Day-to-day security

- **Sessions:** Settings → Sessions (and Security) list every owner session
  with IP, client and expiry. Revoke anything you don't recognise. Owner
  sessions last 12 hours by default (Backend Management → *Owner session*,
  1–72 h).
- **Sign-in history:** Settings → Sign-in history (your own) and Security →
  Sign-in history (all users, including failed and non-owner attempts at the
  owner scope).
- **Password change:** Settings → Change password. This signs out your other
  sessions.
- **Token storage:** the app encrypts the session token with the OS keyring
  (`safeStorage`). Without a keyring the token is kept in memory only, and
  you sign in after every restart. It is never written in plaintext.

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
