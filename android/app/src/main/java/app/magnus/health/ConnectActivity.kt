package app.magnus.health

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch

/**
 * Opened by the PWA with magnus://connect?token=mgt_...: keeps the token, asks for Health Connect
 * read access, then syncs now and every hour. The token only ever goes to BuildConfig.MAGNUS_ORIGIN.
 */
class ConnectActivity : ComponentActivity() {
    private lateinit var status: TextView
    private lateinit var action: Button

    private val askPermissions = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract(),
    ) { granted -> onPermissions(granted) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (24 * resources.displayMetrics.density).toInt()
        status = TextView(this).apply { textSize = 17f; setTextColor(0xFFF2EFE8.toInt()) }
        action = Button(this)
        setContentView(
            LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                setPadding(pad, pad, pad, pad)
                setBackgroundColor(0xFF0C0C0B.toInt())
                addView(status)
                addView(action)
            },
        )
        handle(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }

    private fun handle(intent: Intent?) {
        val token = intent?.data?.getQueryParameter("token")
        if (token != null && token.startsWith("mgt_") && token.length in 20..200) {
            SyncStore(this).token = token
        }
        if (SyncStore(this).token == null) {
            show("Open Magnus settings and tap Connect Health Connect to link this phone.", "Open Magnus") { backToApp() }
            return
        }
        when (HealthConnectClient.getSdkStatus(this)) {
            HealthConnectClient.SDK_AVAILABLE ->
                requestAccess()
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED ->
                show("Health Connect needs an update first.", "Update Health Connect") { openHealthConnectStore() }
            else ->
                show("Health Connect isn't available on this phone. You can still log steps and weigh-ins in Magnus.", "Back to Magnus") { backToApp() }
        }
    }

    /** Background read is newer than the rest; fall back to foreground-only where it's unknown. */
    private fun requestAccess() {
        try {
            askPermissions.launch(HealthSync.PERMISSIONS + HealthSync.BACKGROUND_PERMISSION)
        } catch (e: RuntimeException) {
            askPermissions.launch(HealthSync.PERMISSIONS)
        }
    }

    private fun onPermissions(granted: Set<String>) {
        if (granted.none { it in HealthSync.PERMISSIONS }) {
            show("Magnus needs at least steps access to sync. You can grant it any time.", "Try again") {
                requestAccess()
            }
            return
        }
        SyncWorker.schedule(this)
        show("Syncing your last 30 days…", null, null)
        lifecycleScope.launch {
            val msg = when (val r = HealthSync.run(this@ConnectActivity)) {
                is HealthSync.Result.Ok -> "Connected. Steps, walks and weigh-ins now sync every hour."
                is HealthSync.Result.Failed -> "Connected, but the first sync failed (${r.reason}). It will retry within the hour."
            }
            show(msg, "Back to Magnus") { backToApp() }
        }
    }

    private fun show(text: String, button: String?, onClick: (() -> Unit)?) {
        status.text = text
        action.visibility = if (button == null) android.view.View.GONE else android.view.View.VISIBLE
        action.text = button ?: ""
        action.setOnClickListener { onClick?.invoke() }
    }

    private fun backToApp() {
        startActivity(Intent(this, MagnusLauncherActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        finish()
    }

    private fun openHealthConnectStore() {
        startActivity(
            Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.google.android.apps.healthdata"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}
