package app.magnus.health

/**
 * Lets Chrome hand the PWA's web push notifications to this app, so they show as "Magnus" with
 * the app's icon instead of "Chrome · site". The base class also asks for Android 13+'s
 * notification permission on the PWA's behalf.
 */
class DelegationService : com.google.androidbrowserhelper.trusted.DelegationService()
