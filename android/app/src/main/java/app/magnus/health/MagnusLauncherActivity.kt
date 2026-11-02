package app.magnus.health

import android.os.Bundle
import com.google.androidbrowserhelper.trusted.LauncherActivity

/** Opens the PWA, and syncs Health Connect each time the app is opened (if connected). */
class MagnusLauncherActivity : LauncherActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (SyncStore(this).token != null) SyncWorker.runNow(this)
    }
}
