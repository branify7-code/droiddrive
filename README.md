# DroidDrive

A fully interactive **virtual Android phone that runs in your desktop browser** — with your own **Google Drive (works great with 5TB plans) as the phone's storage**.

Everything you save on the phone (files, photos, camera shots, notes) is stored in a `PhoneStorage` folder inside your real Google Drive, counted against your actual plan quota. Without Drive connected, the phone falls back to a local virtual storage (256 GB cap) backed by SQLite.

## Features

- **Android-style system UI**: boot animation, swipe-to-unlock lock screen, home screen with widgets, app drawer with search, notification shade with quick settings, brightness control, recents, 3-button navigation, toasts and dialogs
- **10 working apps**:
  - **Files** — folder tree, upload with progress, download, rename, delete, text/image preview, storage quota bar
  - **Photos** — recursive gallery grid, full-screen viewer, upload/delete
  - **Camera** — live getUserMedia preview, front/back switch, saves JPEG to `Pictures`
  - **Settings** — Google Drive connect wizard with step-by-step Client ID guide
  - **Notes** — notes saved as `.txt` files in the `Notes` folder
  - **Music** — finds audio files on the phone storage and plays them
  - **Calculator**, **Clock** (analog + stopwatch), **Dialer**, **Messages**
- **Dual storage backends** behind one abstraction (`StorageProvider`):
  - `drive` — Google Drive REST v3, resumable uploads with progress, quota via `about.get`, trash-based delete, GIS OAuth (interactive + silent reconnect)
  - `local` — Next.js API routes + Prisma/SQLite + on-disk blobs, 256 GB virtual cap

## Tech stack

Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · zustand · framer-motion · lucide-react · Prisma + SQLite

## Getting started

```bash
bun install
# set your local database path
cp .env.example .env
# create the SQLite database
bunx prisma db push
# run
bun run dev
```

Open http://localhost:3000 — boot the phone, swipe up to unlock.

## Connect your Google Drive (5TB ready)

1. Open [Google Cloud Console](https://console.cloud.google.com/) → create/select a project
2. **APIs & Services → Library** → search **Google Drive API** → **Enable**
3. **APIs & Services → OAuth consent screen** → User type **External** → fill in app name + your email → add your Google account under **Test users**
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID** → Application type: **Web application**
5. Under **Authorized JavaScript origins** add:
   - `http://localhost:3000`
   - your deployed origin (if any)
6. Copy the **Client ID** (ends in `.apps.googleusercontent.com`)
7. On the phone: **Settings → Google Drive** → paste Client ID → **Connect** → sign in with the account that owns your Drive plan

All phone files then live in a `PhoneStorage` folder in your Drive root. Only an OAuth **Client ID** is required — no API key, no client secret. The access token stays in your browser session.

## Project layout

```
src/
  app/
    page.tsx                  # desktop stage + auto-scaling phone frame
    api/storage/…             # local-mode storage API (list/upload/folder/quota/file)
  components/phone/
    PhoneRoot.tsx             # system UI orchestration (z-layer stack)
    shell.tsx                 # status bar, nav bar, lock screen, shade, recents…
    HomeScreen.tsx            # launcher + app drawer
    apps/                     # Files, Photos, Camera, Settings, Notes, Music, …
  lib/
    storage/                  # StorageProvider types + Local/Drive implementations
    phone-store.ts            # zustand store (system UI + storage state)
prisma/schema.prisma          # VFile tree for local fallback storage
```
