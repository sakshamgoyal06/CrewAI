package app.magnus.health

import android.net.Uri
import android.os.Bundle
import com.google.androidbrowserhelper.trusted.LauncherActivity

/** Opens the PWA, and syncs Health Connect each time the app is opened (if connected). */
class MagnusLauncherActivity : LauncherActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (SyncStore(this).token != null) {
            SyncWorker.schedule(this) // keeps the hourly sync alive (KEEP: never resets its timer)
            SyncWorker.runNow(this)
        }
    }

    /**
     * After an update that reads new Health Connect types, open the PWA with ?hc=upgrade so it can
     * offer one tap to allow them (Android only asks from a visible screen of this app).
     */
    override fun getLaunchingUrl(): Uri {
        val url = super.getLaunchingUrl()
        val store = SyncStore(this)
        if (store.token == null || store.permissionsAsked >= HealthSync.PERMISSIONS_VERSION) return url
        if (url.getQueryParameter("hc") != null) return url
        return url.buildUpon().appendQueryParameter("hc", "upgrade").build()
    }
}
