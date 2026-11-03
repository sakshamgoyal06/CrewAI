# Magnus for Android

A thin native shell around the PWA:

- **The app** is the PWA in a Trusted Web Activity (`MagnusLauncherActivity`), so it's the same
  code as `/app` and every deploy updates it.
- **Health Connect** is read natively, with no token to copy. Signed in to the PWA inside the app,
  one tap (the *Sync steps, sleep and workouts* prompt on Today, or You → Food, connections &
  account → *Connect Health Connect*) creates a token for this phone, revokes the phone's previous
  one, and hands it to `ConnectActivity` (`magnus://connect?token=…`). That shows Android's Health
  Connect permission screen, runs a first sync, and returns to the PWA (`?hc=connected`).
  `SyncWorker` then posts steps, distance and active calories (hourly aggregates, de-duplicated by
  Health Connect), exercise sessions, sleep sessions, resting heart rate, weight and body fat to
  `POST /api/health/ingest/health-connect` every hour and whenever the app opens. Re-sending the
  last 3 days each run is safe: the server upserts samples by start time.
- **Background sync** needs *Access data in the background* (Android 14+). It's requested with the
  rest; if it isn't granted the app says so and syncs on every open instead.
- **Download:** every build on `main` refreshes the `android-latest` release with `magnus.apk`
  (`releases/download/android-latest/magnus.apk`), linked from the PWA's settings outside the app.

## Build

GitHub Actions (`.github/workflows/android.yml`) builds a debug APK on every change under
`android/` and uploads it as the `magnus-android` artifact. Locally: `gradle -p android assembleDebug`
with the Android SDK installed (compileSdk 36, JDK 17).

Another deploy: `gradle -p android assembleDebug -PmagnusHost=your.domain`.

Debug builds are signed with the committed `app/magnus-debug.keystore` (password `android`) so each
build installs over the previous one and keeps its Health Connect access. Its SHA-256 is
`8E:67:88:10:B2:47:88:B6:F5:97:DD:93:6B:AD:00:FB:C5:5D:8B:25:B7:FF:39:D2:6A:08:A0:94:67:37:8C:D2`.

## Full screen (no browser bar)

The TWA shows a URL bar until the site vouches for the app:

1. Get the signing certificate's SHA-256 (`keytool -list -v -keystore magnus.jks`, or Play
   Console → App integrity for Play-signed builds; the debug key works for sideloaded debug APKs).
2. Set `MAGNUS_ANDROID_CERT_SHA256` on the server (comma-separate several). The server then serves
   it at `/.well-known/assetlinks.json`.

## Signed release

Add repo secrets `MAGNUS_KEYSTORE_B64` (base64 of the .jks), `MAGNUS_KEYSTORE_PASSWORD`,
`MAGNUS_KEY_ALIAS`, `MAGNUS_KEY_PASSWORD`; the workflow then also builds a signed APK and AAB.
