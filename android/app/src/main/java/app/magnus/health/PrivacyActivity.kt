package app.magnus.health

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle

/** Health Connect's "why does this app need access" link: the privacy page, in the browser. */
class PrivacyActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("${BuildConfig.MAGNUS_ORIGIN}/app/privacy.html")))
        finish()
    }
}
