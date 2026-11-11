package app.magnus.app.data

import app.magnus.app.BuildConfig
import app.magnus.app.auth.AuthRepository
import kotlinx.serialization.DeserializationStrategy
import okhttp3.Request
import java.time.ZoneId
import java.util.UUID

/** The JSON API at /api/health, with the signed-in bearer on every call. */
class Api(private val auth: AuthRepository) {
    private val sessionId = UUID.randomUUID().toString()

    private suspend fun request(path: String, force: Boolean): Request {
        val bearer = auth.bearer(force) ?: throw ApiException(401, "signed_out")
        return Request.Builder()
            .url("${BuildConfig.MAGNUS_ORIGIN}/api/health$path")
            .header("authorization", "Bearer $bearer")
            .header("x-magnus-timezone", ZoneId.systemDefault().id)
            .header("x-magnus-session", sessionId)
            .header("x-magnus-client", "android-native/${BuildConfig.VERSION_NAME}")
            .build()
    }

    suspend fun getText(path: String): String = try {
        HttpClient.text(request(path, force = false))
    } catch (e: ApiException) {
        // An access token that expired early: refresh once, then give up and sign out.
        if (e.status != 401 || e.code == "signed_out") throw e
        try {
            HttpClient.text(request(path, force = true))
        } catch (again: ApiException) {
            if (again.status == 401) auth.signOut()
            throw again
        }
    }

    suspend fun <T> get(path: String, de: DeserializationStrategy<T>): T = MagnusJson.decodeFromString(de, getText(path))
}
