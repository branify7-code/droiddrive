# DroidDrive

A fully interactive **virtual phone interface that runs in your desktop browser** — with your own **Google Drive as the phone's storage** (works with any plan; the quota shown is read live from your Google account, never hardcoded).

Everything you save on the phone (files, photos, camera shots, notes) is stored in a `PhoneStorage` folder inside your real Google Drive, counted against your actual plan quota. Without Drive connected, the phone falls back to a **per-account, session-authenticated** local virtual storage (256 GB cap) backed by SQLite.

> **What this is NOT:** DroidDrive is a web UI simulation. It does not run the Android OS and **installed APK apps do not execute** (a browser tab has no Android system — APKs are parsed, stored and managed, not run). The Phone (dialer) and Messages apps are clearly-labeled simulations — no real cellular calls or SMS. The Camera app uses your real webcam.

## Features

- **Phone-style system UI**: boot animation, swipe-to-unlock lock screen, home screen with widgets, app drawer with search, notification shade with quick settings, brightness control, recents, 3-button navigation, toasts and dialogs
- **11 working apps**:
  - **Files** — folder tree, upload with progress, download, rename, delete, text/image preview, storage quota card. **Tapping an `.apk` opens the installer**
  - **Play Store (simulation)** — APK sideloading pipeline + open-source catalog
  - **Photos** — recursive gallery grid, full-screen viewer, upload/delete
  - **Camera** — live webcam preview (getUserMedia), front/back switch, saves JPEG to `Pictures`; media tracks are released when the app closes
  - **Settings** — Drive connect wizard, local storage account, expired-session recovery, app manager
  - **Notes** — real text files in the `Notes` folder (Drive files, not a proprietary store)
  - **Music** — finds audio files on the phone storage and plays them
  - **Calculator**, **Clock** (analog + stopwatch), **Phone** (simulation), **Messages** (simulation)
- **APK installer & app manager (real parsing, honest execution limits)**:
  - Real Android binary manifest parsing (`AndroidManifest.xml` + `resources.arsc`): app label, package name, `versionName`/`versionCode`, min/target SDK, requested permissions, and the launcher icon — extracted from the actual APK file
  - Installed apps get home-screen/drawer icons with the real icon, an App-info dialog (version, SDK levels, permission list), uninstall (optionally deleting the APK file), and reinstall/upgrade by package name
  - APK blobs are stored like any phone file: a `APKs` folder on the active provider (Drive when connected), referenced by file id in a versioned `droiddrive-installed-apps.json` manifest that follows the storage account
  - Apps persist across reloads and follow the Drive account across browsers, exactly like preferences
  - **Honest limits (shown in the UI)**: installed apps never execute — there is no Android runtime in a browser; and Google Play offers no public download API, so the Store tab catalogs reputable open-source apps (F-Droid links) plus a "Search on Google Play" shortcut, while installation is sideload-only
- **Dual storage backends** behind one abstraction (`StorageProvider`):
  - `drive` — Google Drive REST v3, resumable uploads with progress, full pagination, real quota via `about.get`, trash-based delete, GIS OAuth (interactive + silent reconnect). **Access tokens are kept in memory only.**
  - `local` — Next.js API routes + Prisma/SQLite + on-disk blobs, 256 GB virtual cap. **Every route requires an authenticated session and scopes all rows to the caller's account.**

## Storage behavior & rules

- **Drive mode is primary.** When Drive mode is active and the OAuth token is missing or expired, the app **never silently switches** to server storage: it flags "Google Drive session expired — reconnect to continue.", keeps unsaved notes/inputs on screen, and requires you to reconnect or explicitly switch to local storage in Settings.
- On disconnect or account switch, all account-specific state (token, root folder, email, quota) is cleared and in-flight requests from the previous account are discarded.
- **Preferences persistence**: brightness and quick-settings toggles are saved as a versioned JSON file (`droiddrive-settings.json`) inside `PhoneStorage` (Drive mode) and restored on reconnect or on another browser with the same account. Corrupted files are validated, flagged, and never silently overwritten (Drive mode archives the original before replacing).
- **Local mode is per-account**: on first launch you create the local storage account (bootstrap). Files that existed before auth was introduced are **adopted by the first registered account** — explicitly reported, never migrated silently or deleted.
- Upload limits and name validation are enforced server-side (default 200 MB per file, configurable; path-like/control-character names rejected; parent-folder ownership checked on every create/upload).

## Tech stack

Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · zustand · framer-motion · lucide-react · Prisma + SQLite · bun (documented package manager)

No Firebase and no other hosted database is used or required.

## Getting started

```bash
# 1. install
bun install

# 2. environment (optional — sane defaults are built in)
cp .env.example .env   # adjust DATABASE_URL / LOCAL_STORAGE_DIR if desired

# 3. create the SQLite schema
bunx prisma db push

# 4. run
bun run dev            # http://localhost:3000
```

Other scripts: `bun run build` (production build), `bun run start` (serve the standalone build), `bun run lint`, `bun run typecheck`, `bun test` (regression tests).

## Connect your Google Drive

1. Open [Google Cloud Console](https://console.cloud.google.com/) → create/select a project
2. **APIs & Services → Library** → search **Google Drive API** → **Enable**
3. **APIs & Services → OAuth consent screen** → User type **External** → fill in app name + your email → add your Google account under **Test users**
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID** → Application type: **Web application**
5. Under **Authorized JavaScript origins** add:
   - `http://localhost:3000`
   - your deployed origin (if any)
6. Copy the **Client ID** (ends in `.apps.googleusercontent.com`)
7. On the phone: **Settings → Google Drive** → paste Client ID → **Connect** → sign in with your Google account

A **default Client ID is already baked in** (public identifier for this project), so step 6/7 are usually just “Connect”. You still must add the origin you open the app from (see step 5) to the OAuth client's **Authorized JavaScript origins**, or Google will reject the token request.

A Client ID is a **public identifier** — the app never asks for a client secret or your Google password. The access token stays in memory in your browser session only. All phone files live in a `PhoneStorage` folder in your Drive root and count against your real plan quota.

## Limitations & hosting requirements

- **Server-local SQLite/blob storage needs a persistent disk.** On serverless or ephemeral hosts (Vercel functions, scratch-container PaaS), local mode loses data on restart. Drive mode is unaffected because files live in the user's Google Drive.
- **Resumable uploads are not resumed.** Large Drive uploads use Google's resumable-upload endpoint with progress reporting, but an interrupted upload must be restarted; there is no byte-range recovery.
- **Drive listing depth is capped** at 6 levels for Photos/Music discovery (intentional; the UI shows a notice when the cap is reached). `files.list` itself is fully paginated.
- **OAuth tokens expire** (~1 h). Reconnect via Settings when the session expires; silent reconnect may work without a popup if consent was already granted.
- **First-party quota numbers**: the quota card shows your real Google account usage (all products) and Drive-only usage separately; available space = plan limit − total account usage. Plans without a numeric limit are shown as unlimited instead of a misleading 0-capacity bar.

## Regression tests

```bash
bun test
```

- `tests/api-storage-auth.test.ts` — integration: unauthenticated access rejected, per-user ownership isolation, parent-ownership checks, upload limits, note-update content preservation, orphan-file adoption
- `tests/drive-unit.test.ts` — mocked Drive API: `files.list` pagination, upload-origin URL construction (`updateContent` regression), quota mapping, walk traversal cap
- `tests/prefs.test.ts` — settings JSON validation / corruption handling
- `tests/apps-registry.test.ts` — installed-apps manifest validation, upsert/upgrade semantics, install (APKs folder creation, MIME, progress, existing-file reuse) and uninstall (optional blob delete) against a fake provider
- `tests/apk-parse.test.ts` — **real APK fixture** (KISS Launcher from F-Droid): package/version/SDK/permissions/icon extraction + normalizer rejection cases
- `tests/phone-store.test.ts` — provider selection rules (expired Drive token never falls back to local), account-switch state clearing, baked-in Client ID behavior

## Project layout

```
src/
  app/
    page.tsx                  # desktop stage + auto-scaling phone frame
    api/auth/…                # local storage account: register/login/logout/session
    api/storage/…             # local-mode storage API (list/upload/folder/quota/file)
  components/phone/
    PhoneRoot.tsx             # system UI orchestration (z-layer stack)
    LocalAuthDialog.tsx       # sign-in dialog for the local storage account
    InstalledAppDialog.tsx    # APK app info + uninstall (honest execution notice)
    shell.tsx                 # status bar, nav bar, lock screen, shade, recents…
    HomeScreen.tsx            # launcher + app drawer (system + installed apps)
    apps/                     # Files, Photos, Camera, Settings, Notes, Music, PlayStoreApp, …
  lib/
    auth.ts                   # scrypt passwords, HttpOnly session cookies
    apk.ts                    # APK binary-manifest parsing + normalization
    apps-registry.ts          # installed-apps manifest (Drive + local persistence)
    prefs.ts                  # versioned preferences JSON (Drive + local)
    storage/                  # StorageProvider types + Local/Drive implementations
    phone-store.ts            # zustand store (system UI + storage + app registry state)
prisma/schema.prisma          # VFile tree (per-owner) + LocalUser/LocalSession
```
