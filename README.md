<div align="center">

<img src="assets/icon.png" alt="Iro Logo" width="140">

# Iro

### A Manga Reader with InkDex Extension Sources

A clean, offline-capable manga reader built with **Expo and React Native**, featuring a sandboxed InkDex/Paperback extension engine, Material Design 3–inspired theming, and a performant image pipeline. Iro ships with zero built-in sources — every source comes from an extension registry you configure yourself.

![React Native](https://img.shields.io/badge/React_Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Expo](https://img.shields.io/badge/Expo-000020?style=for-the-badge&logo=expo&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-07405E?style=for-the-badge&logo=sqlite&logoColor=white)
![Zustand](https://img.shields.io/badge/Zustand-433E38?style=for-the-badge)

</div>

---

## Overview

Iro is a manga reader that uses **InkDex/Paperback-format extension bundles** — the same format that powers the InkDex registry ecosystem. Every extension is fetched from a registry you choose, downloaded only when you tap Install, and evaluated in a sandboxed runtime so you stay in control of what code runs on your device.

Under the hood, Iro pairs an InkDex-compatible provider interface with a hand-rolled Material Design 3 token system, a WAL-mode SQLite database for offline storage, and a Zustand store to keep the app in sync.

---

## Features

- **Paged reader** — one page per screen with horizontal swipe, supporting both LTR and RTL reading directions
- **Webtoon mode** — continuous vertical scroll powered by FlashList, with per-image aspect ratios measured on load for smooth re-layout
- **Image quality pipeline** — automatic normalization of MangaDex data-saver URLs to full-resolution originals
- **Long-strip tiling** — oversized webtoon pages are safely split into tiles on-device to prevent Android Canvas crashes and GPU texture limits
- **Cloudflare challenge bypass** — automatic detection and solving of Cloudflare interstitials via a hidden WebView bridge
- **Extension sandbox** — real InkDex/Paperback IIFE bundles evaluated in a `new Function` context with injected network, crypto, and URL polyfills
- **Library** — grid view with unread badges, progress bars, categories, and continue-reading banner
- **Downloads** — background chapter download queue with progress tracking and offline reading
- **Backup & restore** — versioned JSON exports covering library, history, progress, and settings (excludes downloaded images)
- **Manga migration** — re-point a library title to the same title on another source, preserving reading progress and history
- **Updates feed** — chronological new-chapter list driven by chapter-cache diffing
- **Reading history** — recently read chapters sorted by last-read time
- **13 built-in themes** — dark, light, and colorful options with automatic dark/light status bar detection
- **Source error classification** — typed error boundaries that distinguish network failures, extension bugs, and invalid responses
- **No default sources** — every extension is user-provided, nothing runs until you install it

---

## Theming

Iro ships with 13 built-in themes — switchable from **Settings > Appearance**:

| Theme | Description |
|---|---|
| **Iro Paper** (default light) | Warm paper tones, coral accent |
| **Iro Ink** (default dark) | Balanced dark, warm coral accent |
| **Ocean** | Deep blue underwater tones |
| **Amethyst** | Rich purple jewel tones |
| **Ember** | Warm ember glow |
| **Arctic** | Crisp cool light theme |
| **Forest** | Earthy green tones |
| **Blossom** | Soft rose light |
| **Coffee** | Warm cozy brown tones |
| **Sage** | Calm muted green tones |
| **Rosewood** | Deep burgundy tones |
| **Parchment** | Warm vintage paper tones |
| **Lemon** | Warm golden yellow tones |

Every UI element reads from a single `THEMES` table with tokens for `background`, `surface`, `surface1-3`, `outline`, `primary`, `text`, `textMuted`, `error`, and more. Reader backgrounds are independent of the app theme.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Expo SDK 57, React Native 0.86, React 19.2 |
| Navigation | Expo Router (file-based) |
| State | Zustand v5 |
| Database | expo-sqlite (WAL mode) |
| Animations | react-native-reanimated v4 |
| Gestures | react-native-gesture-handler v3 |
| Lists | @shopify/flash-list v2 |
| Images | expo-image (Glide/SDWebImage-backed) |
| Image manipulation | expo-image-manipulator (for tiling) |
| Extension engine | Sandboxed `new Function` with injected polyfills |
| Theming | Hand-rolled Material Design 3 token system |

---

## Project Structure

```text
app/
  _layout.tsx                 Root layout — mounts CloudflareWebViewHost, WebViewExecHost
  index.tsx                   Splash / redirect to tabs
  (tabs)/
    _layout.tsx               6-tab bottom nav with M3 pill indicator
    library.tsx               Library grid with filters, categories, continue-reading
    updates.tsx               New-chapter notifications
    history.tsx               Recently read chapters
    browse.tsx                Global search + installed source list
    downloads.tsx             Download manager (hidden from tab bar)
    more.tsx                  Link-out to settings screens
  manga/
    [id].tsx                  Manga details — cover, metadata, chapter list
  reader/
    [chapterId].tsx           Reader — paged RTL/LTR + webtoon modes
  browse/
    [sourceId].tsx            Per-source browse (popular/latest/search)
  sources.tsx                 Extension manager — registry config, install/uninstall
  migrate.tsx                 Manga migration between sources
  settings/
    theme.tsx                 Theme picker
    reader.tsx                Reader settings
    storage.tsx               Storage usage + orphan cleanup
    backup.tsx                Backup & restore
    about.tsx                 App version and info

src/
  components/
    CloudflareWebViewHost.tsx Hidden WebView bridge for CF challenge solving
    WebViewExecHost.tsx       WebView bridge for extension-injected JS
    ReaderPagedView.tsx       FlatList-based paged reader with RTL data-reversal
    ReaderWebtoonView.tsx     FlashList-based continuous vertical scroll reader
    ReaderPageImage.tsx       Single page — measure-before-mount, tiling, retry
    MangaCard.tsx             Grid card for manga tiles
    ChapterRow.tsx            Chapter list row with selection state
    HistoryRow.tsx            History entry row
    UpdateRow.tsx             Update notification row
    ContinueReading.tsx       Continue reading banner
    SelectionBar.tsx          Multi-select action bar
    BottomSheet.tsx           Reusable animated bottom sheet
    ChapterManageSheet.tsx    Chapter management actions
    MangaActionsSheet.tsx     Manga actions (library, categories, migrate)
    SettingsRow.tsx            Settings row component
    ui/
      MD3.tsx                 Material Design 3 primitives
      Ripple.tsx              Native android_ripple wrapper
      Cover.tsx               Memoized image cover with themed fallback
  constants/
    storage.ts                Canonical on-device directory names
  db/
    client.ts                 SQLite schema, migrations, getDb()
    repositories/             CRUD for library, history, progress, downloads,
                              updates, manga cache, categories, migration
  domain/
    models.ts                 All domain types — SourceInfo, MangaTile, ChapterInfo, etc.
  extensions/
    registry.ts               Registry URL parsing, bundle/icon URL derivation
    extensionStore.ts         Zustand store for installed extensions (persist to disk)
  providers/
    InkDexProvider.ts         Provider interface + CloudflareError
    sandbox/
      SandboxInkDexProvider.ts  Evaluates extension IIFEs, adapts to InkDexProvider
      network.ts               Application runtime — scheduleRequest, cookies, resolveImageUri
      crypto.ts                Sandbox crypto polyfills (atob, btoa, md5)
      url.ts                   Sandbox URL/URLSearchParams polyfills
  services/
    providerRegistry.ts       Maps sourceId -> InkDexProvider, rebuilds on install changes
    SearchService.ts          Cross-source search
    ReaderService.ts          Page fetching with local-download fallback
    LibraryService.ts         Library CRUD operations
    LibraryUpdateService.ts   Background library update checks
    DownloadService.ts        Chapter download queue with progress
    BackupService.ts          Versioned JSON backup export/import
    MigrateService.ts         Manga migration between sources
  state/
    settingsStore.ts          App settings (registry URL, theme, reader prefs)
    readerSettingsStore.ts    Reader-specific settings (mode, background, keep-screen-on)
    updatesStore.ts           Update notifications state
  theme/
    theme.ts                  13 themes, design tokens (RADIUS, SPACING, TYPE, TOUCH)
    useAppTheme.ts            Hook providing the active theme
  utils/
    cloudflareRetry.ts        Cloudflare challenge retry wrapper
    sourceErrors.ts           SourceError classification and diagnostics
    imageTiling.ts            Android-safe vertical tiling for oversized pages
    imageQuality.ts           Image URL normalization (MangaDex data-saver -> original)
    sanitize.ts               Input sanitization for extension data
    dateTime.ts               Date/time formatting helpers
    time.ts                   Relative time formatting
```

---

## Architecture

```text
UI Screens (app/)
    |  (never imports a provider directly)
    v
Domain Services (src/services/*)
    |  owns Cloudflare-retry policy, combines provider + SQLite
    v
InkDexProvider interface (src/providers/InkDexProvider.ts)
    |
    +-- SandboxInkDexProvider (src/providers/sandbox/)
                                    ^-- real InkDex extension bundles
```

Screens never import a provider directly — they always go through `src/services/*`, which combines the provider with Cloudflare retry logic, error classification, and database persistence.

---

## Extension System

### Registry & Installation

Iro starts empty: there is no default extension registry. The user must configure their own InkDex registry URL in the Sources screen.

The registry is a `versioning.json` file listing available extensions. Each extension has:
- A compiled IIFE bundle (`{id}/index.js`)
- An optional icon (`{id}/static/{icon}`)

Installed bundles are downloaded once and persisted to `document/iro-extensions/`, surviving app restarts.

### Sandbox

Extension bundles are evaluated inside a `new Function` context with injected globals:

| Global | Purpose |
|---|---|
| `Application` | Network requests, cookie management, image URL resolution |
| `atob` / `btoa` | Base64 encoding/decoding |
| `md5` | MD5 hashing |
| `crypto` | Web Crypto API subset |
| `URL` / `URLSearchParams` | URL parsing |
| `console` | Logging |

The `Application` runtime centralizes all network I/O, including cookie/header injection and Cloudflare clearance. Extensions never touch `fetch` or the DOM directly.

### Cloudflare Bypass

When a source returns a Cloudflare interstitial (detected via 503 status + `cloudflare` server header), the `withCloudflareRetry` wrapper triggers a hidden WebView to load the challenged URL, wait for the JS challenge to clear, extract `cf_clearance`, and retry the original request.

---

## Image Pipeline

### Quality Normalization

InkDex extensions often return compressed or thumbnail URLs. Iro normalizes known patterns (e.g., MangaDex's `data-saver/` path segment to the full `data/` variant) to ensure the highest-quality source image is always rendered.

### Measure Before Mount

React Native's image views decode a bitmap sized to the view's bounds at first layout. If the container size doesn't match the image's true resolution, the decoded bitmap is stretched. Iro measures real image dimensions via `Image.getSize`/`getSizeWithHeaders` before mounting the actual `<Image>`, ensuring the decode targets the correct resolution.

### Long-Strip Tiling

Android's hardware-accelerated Canvas refuses to draw bitmaps over ~25M pixels, and GPU textures are commonly capped at 4096px. Webtoon long-strip segments can legitimately be 800x20000+. Iro detects oversized pages and splits them into safe vertical tiles via `expo-image-manipulator`, saved as maximum-quality JPEG for minimal re-encode loss.

---

## Storage & Data

- **SQLite database** — `expo-sqlite` with WAL mode; tables for library, history, chapter progress, downloads, chapter cache, manga cache, and categories
- **Zustand stores** — user preferences (theme, reader settings, registry URL) persisted to app documents
- **Extension files** — installed bundles and icons under `document/iro-extensions/`
- **Download files** — downloaded chapter images under `document/iro-downloads/`
- **Tile cache** — generated page tiles under the OS cache directory (reclaimable under storage pressure)

---

## Settings

| Screen | What it does |
|---|---|
| Appearance | Pick one of 13 color themes |
| Reader | Reading mode (LTR, RTL, Webtoon), keep-screen-on, background color |
| Storage | Database and file usage stats, orphaned download cleanup |
| Backup & Restore | Export/import JSON backups (library, history, progress, settings) |
| About | App version, registry info, installed source count |

---

## Getting Started

```bash
git clone https://github.com/user/iro.git
cd iro
npm install
npx expo prebuild
npx expo run:android
```

Open the **Sources** tab, configure a registry URL, and install an extension to start browsing.

---

## Known Limitations

- **Extension sandbox uses `new Function`** — a production deployment should evaluate bundles in a dedicated secondary runtime (e.g., a separate Hermes/QuickJS instance) rather than the main JS thread.
- **Cloudflare detection uses title heuristics** (`!/just a moment/i`) — this is what most WebView-based CF bypasses use, but could break with future Cloudflare UI changes.
- **AES decryption stub** — `sandboxSubtle.decrypt` throws with a message pointing at wiring a native AES-CBC library, since `expo-crypto` doesn't expose raw AES primitives.
- **No background notifications** — library update checks run in the foreground only.
- **No iOS testing** — primarily developed and tested on Android.

---

## Credits

### InkDex / Paperback

Iro supports the **InkDex/Paperback-compatible extension ecosystem**. The extension manifest format, the sandboxed runtime API surface, and the `Application` network pipeline are modeled on the patterns established by the InkDex and Paperback projects.

### Expo

Built with the [Expo](https://expo.dev) platform and its open-source SDK.

---

<div align="center">

*"Every page deserves a good reader."*

</div>
