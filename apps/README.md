# Tavern Knights: store builds (iOS, Android, Steam)

The game itself stays in the repo root (`index.html`, `art/`, `audio/`, `sfx/`) and keeps deploying to
https://tavern-knights.pages.dev. This folder wraps that same game for the stores:

| Store | Wrapper | Folder |
|---|---|---|
| App Store (iPhone/iPad) | Capacitor 8 | `ios/` |
| Google Play | Capacitor 8 | `android/` |
| Steam (Windows/macOS/Linux) | Electron | `electron/` |

`scripts/build-web.mjs` copies the game into `www/` (git-ignored) and, for the app copy only:
uses the bundled fonts in `fonts/` (so it works offline), strips Google Analytics (`KEEP_ANALYTICS=1` keeps it),
and sets `window.TK_APP` to `ios`, `android`, `desktop` or `web`.

## Setup

```bash
cd apps
npm install
```

Needs Node 22+. Android needs Android Studio (JDK 21). iOS needs a Mac with Xcode 16+.

## Everyday commands

```bash
npm run desktop       # play the Steam/desktop build in a window (add -- --windowed to start windowed)
npm run android       # copy the game in, open Android Studio (Run ▶ on a phone or emulator)
npm run ios           # copy the game in, open Xcode (Mac only)
npm run steam:win     # Windows build in dist/win-unpacked   (also steam:mac, steam:linux)
```

After changing the game in the repo root, run `npm run cap:sync` (mobile) or any `steam:*`/`desktop` script;
they all copy the latest game first.

## What the native projects already do

- Landscape only, full screen (Android hides the system bars, iOS hides the status bar).
- App id `dev.rochano.tavernknights`, version 1.0.1. Change the id before the first upload if you want another one;
  it can't be changed after.
- iOS `ITSAppUsesNonExemptEncryption = false` (skips the export-compliance question).
- Desktop: starts full screen, F11 or Alt+Enter toggles, links open in the normal browser,
  files are served over `app://` so audio loads like on the website.

## Icons, splash and store art

- Sources: `assets/icon-only.png`, `icon-foreground.png`, `icon-background.png`, `splash.png`
  (built by `scripts/make-graphics.py` from the title art, the G10 tavern and the E1-E3 knight sheets).
- Regenerate all native sizes: `npx capacitor-assets generate --ios --android --iconBackgroundColor '#1a1210' --splashBackgroundColor '#1a1210'`
- Store art (Steam capsules, Play feature graphic): `store/graphics/`.
- Screenshots from the real game: `npm run web && node scripts/screenshots.cjs` → `store/screenshots/` (git-ignored, large).
- Listing text in Thai and English: `store/listing.md`. Privacy policy: `/privacy.html` on the site.

## CI

`.github/workflows/app-builds.yml` (Actions tab → App builds → Run workflow) builds the Android APK/AAB,
the Steam folders for all three systems, and an unsigned iOS compile check.
To get a signed Play upload, add repo secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

## Release steps

**Google Play**
1. Create an upload key once (keep it safe, losing it is painful):
   `keytool -genkey -v -keystore upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload`
2. Android Studio → Build → Generate Signed App Bundle, or use the CI secrets above.
3. Play Console → create app → Internal testing → upload the `.aab`. New personal accounts must run a
   closed test with at least 12 testers for 14 days before production.

**App Store**
1. On a Mac: `npm run ios`, in Xcode pick your Team under Signing & Capabilities.
2. Product → Archive → Distribute App → App Store Connect. Test with TestFlight, then submit for review.

**Steam**
1. Steamworks → create the app, fill the store page with `store/listing.md` and `store/graphics/`.
2. `npm run steam:win` (and mac/linux), then upload `dist/*-unpacked` with SteamPipe (steamcmd or SteamPipe GUI).
   Launch option: `Tavern Knights.exe` (Windows), `tavern-knights` (Linux).
3. Optional next steps: gamepad support (needed for Steam Deck Verified) and achievements via `steamworks.js`.
