package app.magnus.app.auth

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import app.magnus.app.BuildConfig
import app.magnus.app.data.AuthConfig
import app.magnus.app.data.ConfigResponse
import app.magnus.app.data.HttpClient
import app.magnus.app.data.MagnusJson
import app.magnus.app.data.text
import app.magnus.app.data.ApiException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.security.MessageDigest
import java.security.SecureRandom

@Serializable
private data class TokenResponse(
    val access_token: String,
    val refresh_token: String? = null,
    val expires_in: Long = 3600,
)

/**
 * Sign-in and the bearer for every API call. Google sign-in uses Android's account picker, then
 * trades Google's ID token for a Supabase session, the same account the PWA's Google sign-in makes.
 */
class AuthRepository(context: Context) {
    private val store = SessionStore(context)
    private val configPrefs = context.getSharedPreferences("magnus-config", Context.MODE_PRIVATE)
    private val _session = MutableStateFlow(store.load())
    val session: StateFlow<Session?> = _session
    private val refreshLock = Mutex()

    suspend fun config(): AuthConfig {
        return try {
            val body = HttpClient.text(Request.Builder().url("${BuildConfig.MAGNUS_ORIGIN}/api/health/config").build())
            configPrefs.edit().putString("auth", body).apply()
            MagnusJson.decodeFromString(ConfigResponse.serializer(), body).auth
        } catch (e: Exception) {
            configPrefs.getString("auth", null)?.let { MagnusJson.decodeFromString(ConfigResponse.serializer(), it).auth }
                ?: throw e
        }
    }

    /** Opens Android's Google account picker. `activityContext` must be an Activity. */
    suspend fun signInWithGoogle(activityContext: Context) {
        val cfg = config()
        val url = cfg.supabaseUrl
        val key = cfg.supabaseKey
        val clientId = cfg.googleClientId
        if (!cfg.google || url == null || key == null) throw SignInException("Google sign-in isn't set up on the server yet.")
        if (clientId.isNullOrBlank()) throw SignInException("Google sign-in for the app isn't set up yet (MAGNUS_GOOGLE_WEB_CLIENT_ID).")

        // Google signs a hash of the nonce; Supabase checks the raw one against it, so a token
        // can't be replayed into another session.
        val rawNonce = ByteArray(24).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }
        val hashed = MessageDigest.getInstance("SHA-256").digest(rawNonce.toByteArray()).joinToString("") { "%02x".format(it) }
        val option = GetSignInWithGoogleOption.Builder(clientId).setNonce(hashed).build()
        val result = CredentialManager.create(activityContext)
            .getCredential(activityContext, GetCredentialRequest.Builder().addCredentialOption(option).build())
        val cred = result.credential
        if (cred !is CustomCredential || cred.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
            throw SignInException("That account didn't return a Google sign-in.")
        }
        val idToken = GoogleIdTokenCredential.createFrom(cred.data).idToken

        val body = buildJsonObject {
            put("provider", "google")
            put("id_token", idToken)
            put("nonce", rawNonce)
        }.toString()
        val text = try {
            HttpClient.text(
                Request.Builder()
                    .url("$url/auth/v1/token?grant_type=id_token")
                    .header("apikey", key)
                    .post(body.toRequestBody(JSON))
                    .build(),
            )
        } catch (e: ApiException) {
            throw SignInException("Sign-in was refused (${e.status}). Try again.")
        }
        val t = MagnusJson.decodeFromString(TokenResponse.serializer(), text)
        set(Session.Google(t.access_token, t.refresh_token ?: "", System.currentTimeMillis() + t.expires_in * 1000))
    }

    fun signInWithToken(token: String) = set(Session.Token(token.trim()))

    fun signOut() {
        val s = _session.value
        set(null)
        if (s is Session.Google) {
            // Best effort: the refresh token stops working on the server too.
            Thread {
                runCatching {
                    val cfg = configPrefs.getString("auth", null)?.let { MagnusJson.decodeFromString(ConfigResponse.serializer(), it).auth }
                    if (cfg?.supabaseUrl != null && cfg.supabaseKey != null) {
                        HttpClient.newCall(
                            Request.Builder().url("${cfg.supabaseUrl}/auth/v1/logout")
                                .header("apikey", cfg.supabaseKey).header("authorization", "Bearer ${s.accessToken}")
                                .post(ByteArray(0).toRequestBody(null)).build(),
                        ).execute().close()
                    }
                }
            }.start()
        }
    }

    private fun set(s: Session?) {
        store.save(s)
        _session.value = s
    }

    /** The bearer for the next call, refreshing a Google session a minute before it runs out. */
    suspend fun bearer(force: Boolean = false): String? {
        val s = _session.value ?: return null
        if (s is Session.Token) return s.token
        s as Session.Google
        if (!force && s.expiresAt - System.currentTimeMillis() > 60_000) return s.accessToken
        return refreshLock.withLock {
            val now = _session.value as? Session.Google ?: return@withLock null
            if (now !== s && !force) return@withLock now.accessToken // another call refreshed it
            refresh(now)?.accessToken
        }
    }

    private suspend fun refresh(s: Session.Google): Session.Google? {
        val cfg = try { config() } catch (_: Exception) { return s }
        val url = cfg.supabaseUrl ?: return s
        val key = cfg.supabaseKey ?: return s
        return try {
            val text = HttpClient.text(
                Request.Builder().url("$url/auth/v1/token?grant_type=refresh_token").header("apikey", key)
                    .post(buildJsonObject { put("refresh_token", s.refreshToken) }.toString().toRequestBody(JSON)).build(),
            )
            val t = MagnusJson.decodeFromString(TokenResponse.serializer(), text)
            Session.Google(t.access_token, t.refresh_token ?: s.refreshToken, System.currentTimeMillis() + t.expires_in * 1000)
                .also { set(it) }
        } catch (e: ApiException) {
            // A revoked or already-used refresh token: the person has to sign in again.
            if (e.status == 400 || e.status == 401) { set(null); null } else s
        } catch (_: Exception) {
            s // offline: keep the old token, the call will fail and retry later
        }
    }

    companion object {
        private val JSON = "application/json".toMediaType()
    }
}

class SignInException(message: String) : Exception(message)
