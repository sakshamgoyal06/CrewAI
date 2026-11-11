package app.magnus.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.TimeUnit

val HttpClient: OkHttpClient = OkHttpClient.Builder()
    .connectTimeout(15, TimeUnit.SECONDS)
    .readTimeout(60, TimeUnit.SECONDS)
    .build()

/** A non-2xx answer. `code` is the server's `{ "error": "…" }` when it sent one. */
class ApiException(val status: Int, val code: String?) : IOException("HTTP $status${code?.let { " $it" } ?: ""}")

/** Runs a request off the main thread and returns the body text, or throws ApiException / IOException. */
suspend fun OkHttpClient.text(request: Request): String = withContext(Dispatchers.IO) {
    newCall(request).execute().use { res -> res.bodyOrThrow() }
}

fun Response.bodyOrThrow(): String {
    val body = body?.string().orEmpty()
    if (!isSuccessful) throw ApiException(code, errorCode(body))
    return body
}

private fun errorCode(body: String): String? = try {
    (MagnusJson.parseToJsonElement(body) as? JsonObject)?.get("error")?.jsonPrimitive?.contentOrNull
} catch (_: Exception) {
    null
}
