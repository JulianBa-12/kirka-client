# Security policy

## Reporting a vulnerability

Please report security problems privately. Use GitHub's **Report a vulnerability** button (Security → Advisories) in this repository instead of opening a public issue. Include steps to reproduce and the affected version. You will get an answer within 7 days.

## Scope

- Polaris Client (the main process, IPC bridge, protocols, update verification, plugin sandbox)
- The Polaris backend (authentication, owner API authorization, uploads, signed configuration)
- The Community Hub website

Reports about cheating in Kirka.io itself belong to the Kirka.io developers.

## Design principles

- The client never executes remotely delivered code. Remote configuration is signed, schema-validated data.
- Updates are only installed after the signed manifest, the SHA-512 and the size have been verified, and only after the user confirms.
- No credentials, tokens or keys are stored in this repository. Backend secrets live in environment variables or `backend/.env`. The signing key lives in `backend/data/keys/`, which is never committed.
