# Magnus for Android

A thin native shell around the PWA:

- **The app** is the PWA in a Trusted Web Activity (`MagnusLauncherActivity`), so it's the same
  code as `/app` and every deploy updates it.
- **Health Connect** is read natively, with no token to copy. Signed in to the PWA inside the app,
  one tap (the *Sync steps, sleep and workouts* prompt on Today, or You → Food, connections &
  account → *Connect Health Connect*) creates a token for this phone, revokes the phone's previous
  one, and hands it to `ConnectActivity` (`magnus://connect?token=…`). That shows Android's Health
  Connect permission screen, runs a first sync, and returns to the PWA (`?hc=connected`).
  `SyncWorker` then posts steps, distance, active and total calories (hourly aggregates on whole local hours, de-duplicated by
  Health Connect), exercise sessions, sleep sessions, resting heart rate, HRV, weight, body fat and lean body mass to
  `POST /api/health/ingest/health-connect` every hour and whenever the app opens. Re-sending the
  last 3 days each run is safe: the server upserts samples by start time.
- **Background sync** needs *Access data in the background* (Android 14+). It's requested with the
  rest; if it isn't granted the app says so and syncs on every open instead.
- **Download:** every build on `main` refreshes the `android-latest` release with the
  release-signed `magnus.apk` (`releases/download/android-latest/magnus.apk`), linked from the
  PWA's settings outside the app. Without the signing secrets nothing is published.

## Build

GitHub Actions (`.github/workflows/android.yml`) builds a debug APK on every change under
`android/` and, when the signing secrets are set, a signed release APK and AAB. Only the release
APK is published. Locally: `gradle -p android assembleDebug` with the Android SDK installed
(compileSdk 36, JDK 17). Another deploy: `gradle -p android assembleDebug -PmagnusHost=your.domain`.

Debug builds are signed with the committed `app/magnus-debug.keystore` (password `android`) so
test builds install over each other. That key is public, so it is never published and never
vouched for in assetlinks.

## Full screen (no browser bar)

The TWA shows a URL bar until the site vouches for the app at `/.well-known/assetlinks.json`.
The server vouches for the release key (`BUILT_APK_CERT_SHA256` in `src/healthServer.ts`). For
another key (e.g. Play App Signing: Play Console → App integrity), add its SHA-256 to
`MAGNUS_ANDROID_CERT_SHA256` (comma-separate several; `none` drops the built-in one).

## Signed release

Repo secrets `MAGNUS_KEYSTORE_B64` (base64 of the .jks), `MAGNUS_KEYSTORE_PASSWORD`,
`MAGNUS_KEY_ALIAS`, `MAGNUS_KEY_PASSWORD`. Keep a backup of the keystore outside GitHub: an app
signed with a lost key can never be updated, only reinstalled.
