package app.magnus.app.auth

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Who this phone is signed in as, kept encrypted on the device. Two kinds, as in pwa/session.js:
 * a Google session through Supabase (access + refresh token), or a pasted app token.
 */
sealed interface Session {
    data class Google(val accessToken: String, val refreshToken: String, val expiresAt: Long) : Session
    data class Token(val token: String) : Session
}

class SessionStore(context: Context) {
    private val prefs: SharedPreferences = try {
        EncryptedSharedPreferences.create(
            context,
            "magnus-session",
            MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    } catch (_: Exception) {
        // A keystore that can't be opened (rare, after a restore): start signed out rather than crash.
        context.deleteSharedPreferences("magnus-session")
        context.getSharedPreferences("magnus-session-fallback", Context.MODE_PRIVATE)
    }

    fun load(): Session? = when (prefs.getString("kind", null)) {
        "google" -> {
            val a = prefs.getString("access", null)
            val r = prefs.getString("refresh", null)
            if (a != null && r != null) Session.Google(a, r, prefs.getLong("expiresAt", 0)) else null
        }
        "token" -> prefs.getString("token", null)?.let { Session.Token(it) }
        else -> null
    }

    fun save(s: Session?) {
        val e = prefs.edit().clear()
        when (s) {
            is Session.Google -> e.putString("kind", "google").putString("access", s.accessToken)
                .putString("refresh", s.refreshToken).putLong("expiresAt", s.expiresAt)
            is Session.Token -> e.putString("kind", "token").putString("token", s.token)
            null -> Unit
        }
        e.apply()
    }
}
