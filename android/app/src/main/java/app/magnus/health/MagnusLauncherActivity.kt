package app.magnus.health

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
}
