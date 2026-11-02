package app.magnus.health

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.AggregateGroupByDurationRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.Duration
import java.time.Instant
import java.time.ZoneId

/**
 * Reads Health Connect and posts it to the Magnus ingest in the same JSON shape the server
 * already takes from HC Webhook. Steps, distance and active calories go as hourly aggregates
 * (Health Connect de-duplicates phone + watch); the server upserts buckets by start time, so
 * re-sending the last few days on every run is safe.
 */
object HealthSync {
    val PERMISSIONS = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(DistanceRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(WeightRecord::class),
        HealthPermission.getReadPermission(BodyFatRecord::class),
    )

    /** Lets the hourly sync read while the app is closed (Android 14+; ignored where unsupported). */
    const val BACKGROUND_PERMISSION = "android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND"

    private val FIRST_SYNC = Duration.ofDays(30)
    private val RESEND = Duration.ofDays(3)

    sealed class Result {
        data class Ok(val steps: Long) : Result()
        data class Failed(val reason: String, val retry: Boolean) : Result()
    }

    suspend fun run(context: Context, now: Instant = Instant.now()): Result {
        val store = SyncStore(context)
        val token = store.token ?: return Result.Failed("not connected", retry = false)
        if (HealthConnectClient.getSdkStatus(context) != HealthConnectClient.SDK_AVAILABLE) {
            return Result.Failed("Health Connect isn't available", retry = false)
        }
        val client = HealthConnectClient.getOrCreate(context)
        val granted = client.permissionController.getGrantedPermissions()
        if (granted.isEmpty()) return Result.Failed("no Health Connect permissions", retry = false)

        val last = store.lastSync
        val from = if (last == null) now.minus(FIRST_SYNC) else minOf(last, now).minus(RESEND)
        val range = TimeRangeFilter.between(from, now)
        val payload = JSONObject()
        var totalSteps = 0L

        val buckets = client.aggregateGroupByDuration(
            AggregateGroupByDurationRequest(
                metrics = setOf(
                    StepsRecord.COUNT_TOTAL,
                    DistanceRecord.DISTANCE_TOTAL,
                    ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL,
                ),
                timeRangeFilter = range,
                timeRangeSlicer = Duration.ofHours(1),
            ),
        )
        val steps = JSONArray()
        val distance = JSONArray()
        val calories = JSONArray()
        for (b in buckets) {
            val start = b.startTime.toString()
            val end = b.endTime.toString()
            b.result[StepsRecord.COUNT_TOTAL]?.let {
                totalSteps += it
                steps.put(JSONObject().put("count", it).put("start_time", start).put("end_time", end))
            }
            b.result[DistanceRecord.DISTANCE_TOTAL]?.let {
                distance.put(JSONObject().put("meters", it.inMeters).put("start_time", start).put("end_time", end))
            }
            b.result[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.let {
                calories.put(JSONObject().put("calories", it.inKilocalories).put("start_time", start).put("end_time", end))
            }
        }
        payload.put("steps", steps).put("distance", distance).put("active_calories", calories)

        val exercise = JSONArray()
        for (s in readAll(client, ExerciseSessionRecord::class, range)) {
            exercise.put(
                JSONObject()
                    .put("type", exerciseName(s.exerciseType))
                    .put("duration_seconds", Duration.between(s.startTime, s.endTime).seconds)
                    .put("start_time", s.startTime.toString())
                    .put("end_time", s.endTime.toString()),
            )
        }
        payload.put("exercise", exercise)

        val weight = JSONArray()
        for (w in readAll(client, WeightRecord::class, range)) {
            weight.put(JSONObject().put("kilograms", w.weight.inKilograms).put("time", w.time.toString()))
        }
        val bodyFat = JSONArray()
        for (f in readAll(client, BodyFatRecord::class, range)) {
            bodyFat.put(JSONObject().put("percentage", f.percentage.value).put("time", f.time.toString()))
        }
        payload.put("weight", weight).put("body_fat", bodyFat)

        val status = post(token, payload)
        return when {
            status in 200..299 -> {
                store.lastSync = now
                store.lastError = null
                Result.Ok(totalSteps)
            }
            status == 401 -> {
                // Token revoked in the app's settings: stop syncing until reconnected.
                store.lastError = "Disconnected. Reconnect from Magnus settings."
                Result.Failed("token revoked", retry = false)
            }
            else -> {
                store.lastError = "Sync failed (HTTP $status). Retrying."
                Result.Failed("http $status", retry = true)
            }
        }
    }

    private suspend fun <T : androidx.health.connect.client.records.Record> readAll(
        client: HealthConnectClient,
        type: kotlin.reflect.KClass<T>,
        range: TimeRangeFilter,
    ): List<T> {
        val out = mutableListOf<T>()
        var page: String? = null
        do {
            val res = try {
                client.readRecords(ReadRecordsRequest(type, range, pageToken = page))
            } catch (e: SecurityException) {
                return out // that permission wasn't granted; send the rest
            }
            out += res.records
            page = res.pageToken
        } while (page != null)
        return out
    }

    /** Only walk-like names matter to the server (they count as walk minutes). */
    private fun exerciseName(type: Int): String = when (type) {
        ExerciseSessionRecord.EXERCISE_TYPE_WALKING -> "walking"
        ExerciseSessionRecord.EXERCISE_TYPE_HIKING -> "hiking"
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING -> "running"
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING -> "biking"
        ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING -> "strength_training"
        ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING -> "weightlifting"
        ExerciseSessionRecord.EXERCISE_TYPE_YOGA -> "yoga"
        else -> "other_$type"
    }

    private fun post(token: String, payload: JSONObject): Int {
        val conn = URL("${BuildConfig.MAGNUS_ORIGIN}/api/health/ingest/health-connect").openConnection() as HttpURLConnection
        return try {
            conn.requestMethod = "POST"
            conn.connectTimeout = 15_000
            conn.readTimeout = 30_000
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("Authorization", "Bearer $token")
            conn.setRequestProperty("x-magnus-timezone", ZoneId.systemDefault().id)
            conn.outputStream.use { it.write(payload.toString().toByteArray()) }
            conn.responseCode
        } catch (e: java.io.IOException) {
            -1
        } finally {
            conn.disconnect()
        }
    }
}
