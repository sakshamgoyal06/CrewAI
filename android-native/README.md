# Magnus native app (Beta)

The Kotlin + Jetpack Compose rewrite of the Magnus app (plan: "Magnus native Android app: how it
will work", 11 Nov 2026). It is a thin client: every rule stays on the server, and the app shows
and caches what `/api/health` returns.

- **Package:** `app.magnus.health.beta` ("Magnus Beta"), so it installs next to the TWA app in
  `android/`. At the swap it is built with `-PmagnusAppId=app.magnus.health` and the same release
  key, and installs over the TWA as an update.
- **Download:** every build of `main` refreshes the `android-beta` release
  (`releases/download/android-beta/magnus-beta.apk`), release-signed. PR builds are debug-signed
  and only kept as workflow artifacts.
- **Sign-in:** Google through Android's account picker (Credential Manager). Google's ID token is
  traded for a Supabase session (`/auth/v1/token?grant_type=id_token`), the same account the PWA's
  Google sign-in makes. Needs `MAGNUS_GOOGLE_WEB_CLIENT_ID` on the server (served by
  `/api/health/config`) and an Android OAuth client in the same Google Cloud project for
  `app.magnus.health.beta` with the release key's SHA-1. An app token works as a fallback.
- **Build:** `gradle -p android-native assembleDebug` (compileSdk 36, JDK 17). Another deploy:
  `-PmagnusHost=your.domain`.

Lato is bundled under the SIL Open Font License (`LATO_OFL.txt`), converted from `pwa/fonts`.
