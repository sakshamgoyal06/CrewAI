package app.magnus.app.data

import app.magnus.app.BuildConfig
import app.magnus.app.auth.AuthRepository
import kotlinx.serialization.DeserializationStrategy
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.time.ZoneId
import java.util.UUID

/** The JSON API at /api/health, with the signed-in bearer on every call. */
class Api(private val auth: AuthRepository) {
    private val sessionId = UUID.randomUUID().toString()

    private suspend fun request(path: String, force: Boolean, method: String = "GET", body: String? = null): Request {
        val bearer = auth.bearer(force) ?: throw ApiException(401, "signed_out")
        return Request.Builder()
            .url("${BuildConfig.MAGNUS_ORIGIN}/api/health$path")
            .method(method, body?.toRequestBody(JSON))
            .header("authorization", "Bearer $bearer")
            .header("x-magnus-timezone", ZoneId.systemDefault().id)
            .header("x-magnus-session", sessionId)
            .header("x-magnus-client", "android-native/${BuildConfig.VERSION_NAME}")
            .build()
    }

    suspend fun getText(path: String): String = call(path, "GET", null)

    /** Set by AppGraph: where logs made offline wait. */
    var outbox: Outbox? = null

    /**
     * POST/PUT/DELETE with a JSON body; returns the answer's text. A log the outbox can hold is kept
     * on the phone when there's no connection, and answers [Outbox.QUEUED_ANSWER].
     */
    suspend fun send(method: String, path: String, json: String = "{}"): String = try {
        call(path, method, json)
    } catch (e: java.io.IOException) {
        val box = outbox
        if (e is ApiException || box == null || !Outbox.queueable(method, path)) throw e
        box.add(path, json)
        Outbox.QUEUED_ANSWER
    }

    /** Sends once with no queueing, for the outbox itself. */
    suspend fun sendNow(method: String, path: String, json: String): String = call(path, method, json)

    private suspend fun call(path: String, method: String, body: String?): String = try {
        HttpClient.text(request(path, force = false, method, body))
    } catch (e: ApiException) {
        // An access token that expired early: refresh once, then give up and sign out.
        if (e.status != 401 || e.code == "signed_out") throw e
        try {
            HttpClient.text(request(path, force = true, method, body))
        } catch (again: ApiException) {
            if (again.status == 401) auth.signOut()
            throw again
        }
    }

    /**
     * An open streamed answer (the caller reads and closes it), for /chat/stream. Not-OK answers
     * are thrown as ApiException with the server's error code.
     */
    suspend fun openStream(path: String, json: String): Response {
        var res = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            StreamClient.newCall(request(path, force = false, "POST", json)).execute()
        }
        if (res.code == 401) {
            res.close()
            res = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                StreamClient.newCall(request(path, force = true, "POST", json)).execute()
            }
            if (res.code == 401) auth.signOut()
        }
        if (!res.isSuccessful) res.use { it.bodyOrThrow() }
        return res
    }

    companion object {
        private val JSON = "application/json".toMediaType()
    }

    suspend fun <T> get(path: String, de: DeserializationStrategy<T>): T = MagnusJson.decodeFromString(de, getText(path))
}
