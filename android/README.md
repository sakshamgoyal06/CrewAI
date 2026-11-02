# Magnus for Android

A thin native shell around the PWA:

- **The app** is the PWA in a Trusted Web Activity (`MagnusLauncherActivity`), so it's the same
  code as `/app` and every deploy updates it.
- **Health Connect** is read natively. In the app, Settings → Health Connect → *Connect Health
  Connect* creates a personal token and hands it to `ConnectActivity` (`magnus://connect?token=…`).
  That asks for read access, then `SyncWorker` posts steps, distance and active calories (hourly
  aggregates, de-duplicated by Health Connect), exercise sessions, weight and body fat to
  `POST /api/health/ingest/health-connect` every hour and whenever the app opens. Re-sending the
  last 3 days each run is safe: the server upserts buckets by start time.

## Build

GitHub Actions (`.github/workflows/android.yml`) builds a debug APK on every change under
`android/` and uploads it as the `magnus-android` artifact. Locally: `gradle -p android assembleDebug`
with the Android SDK installed (compileSdk 35, JDK 17).

Another deploy: `gradle -p android assembleDebug -PmagnusHost=your.domain`.

## Full screen (no browser bar)

The TWA shows a URL bar until the site vouches for the app:

1. Get the signing certificate's SHA-256 (`keytool -list -v -keystore magnus.jks`, or Play
   Console → App integrity for Play-signed builds; the debug key works for sideloaded debug APKs).
2. Set `MAGNUS_ANDROID_CERT_SHA256` on the server (comma-separate several). The server then serves
   it at `/.well-known/assetlinks.json`.

## Signed release

Add repo secrets `MAGNUS_KEYSTORE_B64` (base64 of the .jks), `MAGNUS_KEYSTORE_PASSWORD`,
`MAGNUS_KEY_ALIAS`, `MAGNUS_KEY_PASSWORD`; the workflow then also builds a signed APK and AAB.
