# MuseKnot

**Capture a moment. Continue the story. Connect the threads.**

[中文说明](README.md)

MuseKnot is a self-hosted note-taking PWA built around a simple writing habit: new thoughts should not erase earlier ones. Continue a note in independent entries, retain edit history, arrange notes into ordered threads, and export saved content as long images.

![Record library with custom names](docs/screenshots/library.png)

## Features

- Optional custom names; notes, images, prose, journals, characters and dreams.
- Independent continuations, per-entry edit history and version restoration.
- Ordered threads referencing existing notes without merging their content.
- Long-image export for a note or an entire thread; automatic splitting, optional timestamps, and pictures.
- Installable PWA, mobile layout, connection notices and file sharing where supported.
- Invite-only registration, recovery codes, persistent sessions and account data isolation.
- A single Node.js service with built-in SQLite and an online backup script.

## Run locally

Requires Node.js 22.23.2+ or 24.x and npm.

```bash
npm ci
npm run setup
npm run build
npm start
```

Setup creates a local `.env` and prints a private local invitation link. It never overwrites an existing `.env`. Open the printed link to register, or visit <http://127.0.0.1:4173/museknot/>. Passwords require at least 12 characters.

With the server running, execute `npm run demo` in another terminal for synthetic local data. Sign in as `demo@example.test` with `demo-only-password-2026`. The seeding script is restricted to local development and does not overwrite existing demo records.

```bash
npm test
```

## Scope and tradeoffs

This release requires a network connection to read and submit records. The service worker supplies a generic offline page, stores no private responses, and does not force a refresh during editing. Full offline editing and synchronization are future work.

Production installation needs valid HTTPS. Installability and file-sharing behavior depend on the device and browser. Notes are stored as plaintext on the server; this is not end-to-end encrypted storage.

See [self-hosting](docs/SELF_HOSTING.md), [architecture](docs/ARCHITECTURE.md), [security](SECURITY.md) and [contributing](CONTRIBUTING.md).

## License and assets

MIT. The public edition uses an original SVG illustration and synthetic screenshots. The private deployment's unverified third-party photograph and all real notes, databases, secrets and server details are excluded. Dependencies keep their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md).

### Personal backgrounds

Open Account → 首页背景 to choose PNG, JPEG or WebP (up to 8 MB) or restore the default. Uploaded backgrounds are stored behind the same account authentication as note images, and never become repository assets. Only upload images you have the right to use. Reset removes the setting; previously uploaded images remain in the private database and existing backups.
