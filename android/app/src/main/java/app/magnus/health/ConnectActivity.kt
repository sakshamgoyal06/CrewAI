package app.magnus.health

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch

/**
 * Opened by the PWA with magnus://connect?token=mgt_... (one tap, no copy/paste): keeps the token,
 * asks for Health Connect read access, syncs, then returns to the PWA and syncs every hour.
 * The token only ever goes to BuildConfig.MAGNUS_ORIGIN.
 */
class ConnectActivity : ComponentActivity() {
    private lateinit var status: TextView
    private lateinit var action: Button
    private lateinit var secondary: Button

    private val askPermissions = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract(),
    ) { granted -> onPermissions(granted) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (24 * resources.displayMetrics.density).toInt()
        status = TextView(this).apply { textSize = 17f; setTextColor(0xFFF2EFE8.toInt()) }
        action = Button(this)
        secondary = Button(this)
        setContentView(
            LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                setPadding(pad, pad, pad, pad)
                setBackgroundColor(0xFF0C0C0B.toInt())
                addView(status)
                addView(action)
                addView(secondary)
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
            show("Open Magnus and tap Connect Health Connect to link this phone.", "Open Magnus", { backToApp() })
            return
        }
        when (HealthConnectClient.getSdkStatus(this)) {
            HealthConnectClient.SDK_AVAILABLE ->
                requestAccess()
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED ->
                show("Health Connect needs an update first.", "Update Health Connect", { openHealthConnectStore() })
            else ->
                show("Health Connect isn't available on this phone. You can still log steps and weigh-ins in Magnus.", "Back to Magnus", { backToApp() })
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
        SyncStore(this).permissionsAsked = HealthSync.PERMISSIONS_VERSION
        if (granted.none { it in HealthSync.PERMISSIONS }) {
            // After two refusals Android stops showing the prompt, so offer Health Connect itself too.
            show(
                "Magnus needs at least steps access to sync. Tap Try again, or allow it in Health Connect → App permissions → Magnus.",
                "Try again",
                { requestAccess() },
                "Open Health Connect",
                { openHealthConnectSettings() },
            )
            return
        }
        SyncWorker.schedule(this)
        show("Syncing your last 30 days…", null, null)
        val background = HealthSync.BACKGROUND_PERMISSION in granted
        lifecycleScope.launch {
            when (val r = HealthSync.run(this@ConnectActivity)) {
                is HealthSync.Result.Ok ->
                    if (background) {
                        backToApp("connected")
                    } else {
                        show(
                            "Connected. Magnus syncs every time you open it. To also sync every hour while it's closed, allow \"Access data in the background\" for Magnus in Health Connect.",
                            "Back to Magnus",
                            { backToApp("connected") },
                            "Open Health Connect",
                            { openHealthConnectSettings() },
                        )
                    }
                is HealthSync.Result.Failed ->
                    show("Connected, but the first sync failed (${r.reason}). It will retry within the hour.", "Back to Magnus", { backToApp("connected") })
            }
        }
    }

    private fun show(
        text: String,
        button: String?,
        onClick: (() -> Unit)?,
        secondButton: String? = null,
        onSecond: (() -> Unit)? = null,
    ) {
        status.text = text
        action.visibility = if (button == null) View.GONE else View.VISIBLE
        action.text = button ?: ""
        action.setOnClickListener { onClick?.invoke() }
        secondary.visibility = if (secondButton == null) View.GONE else View.VISIBLE
        secondary.text = secondButton ?: ""
        secondary.setOnClickListener { onSecond?.invoke() }
    }

    /** Back into the PWA; `hc` tells it how linking went so it can confirm and refresh. */
    private fun backToApp(hc: String? = null) {
        val launch = Intent(this, MagnusLauncherActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (hc != null) launch.data = Uri.parse("${BuildConfig.MAGNUS_ORIGIN}/app/?src=android&hc=$hc")
        startActivity(launch)
        finish()
    }

    private fun openHealthConnectSettings() {
        try {
            startActivity(Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS))
        } catch (e: android.content.ActivityNotFoundException) {
            openHealthConnectStore()
        }
    }

    private fun openHealthConnectStore() {
        startActivity(
            Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.google.android.apps.healthdata"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}
