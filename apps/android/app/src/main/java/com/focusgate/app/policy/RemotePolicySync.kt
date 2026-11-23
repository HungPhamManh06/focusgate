package com.focusgate.app.policy

import com.focusgate.app.data.UsageEvent
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

data class RemotePolicySnapshot(
    val pulledAtUtc: String,
    val lockActive: Boolean,
    val blockedPackages: Set<String>,
    val allowedPackages: Set<String>,
)

data class RemoteDeviceRegistration(
    val deviceId: String,
    val name: String,
    val platform: String,
    val status: String,
)

data class SupabaseAuthSession(
    val accessToken: String,
    val refreshToken: String,
    val email: String,
)

data class RemotePlanTask(
    val planTaskId: String,
    val taskId: String,
    val title: String,
    val kind: String,
    val status: String,
    val requiredFocusMinutes: Int,
    val focusDone: Int,
)

data class RemoteDailyPlan(
    val id: String,
    val planDate: String,
    val status: String,
    val allTasksTotal: Int,
    val allTasksCompleted: Int,
    val allCompleted: Boolean,
    val tasks: List<RemotePlanTask>,
)

data class RemotePlanSnapshot(
    val plan: RemoteDailyPlan?,
    val activeGrantMinutes: Int,
    val unlocked: Boolean,
)

class UnauthorizedApiException : IOException("Unauthorized")

/**
 * Pure parser and policy reconciler for FocusGate `/api/agent/policy` JSON responses.
 * Uses pure Kotlin parsing (no Android `org.json` stub dependency in JVM unit tests).
 * Essential Android packages and explicit allowlisted packages always win over block rules.
 */
object RemotePolicySync {

    fun parsePolicyJson(rawJson: String): RemotePolicySnapshot {
        val obj = parseJsonObject(rawJson)
        val pulledAtUtc = (obj["pulledAtUtc"] as? String).orEmpty()
        val lockActive = (obj["lockActive"] as? Boolean) ?: false
        val blocked = (obj["blockedProcesses"] as? List<*>)
            ?.mapNotNull { (it as? String)?.trim()?.takeIf(String::isNotEmpty) }
            ?.toSet()
            ?: emptySet()
        val allowed = (obj["allowedProcesses"] as? List<*>)
            ?.mapNotNull { (it as? String)?.trim()?.takeIf(String::isNotEmpty) }
            ?.toSet()
            ?: emptySet()

        return RemotePolicySnapshot(
            pulledAtUtc = pulledAtUtc,
            lockActive = lockActive,
            blockedPackages = blocked,
            allowedPackages = allowed,
        )
    }

    fun toEffectiveBlockedPackages(snapshot: RemotePolicySnapshot): Set<String> {
        if (!snapshot.lockActive) return emptySet()
        return snapshot.blockedPackages
            .asSequence()
            .filter { pkg ->
                pkg.isNotBlank() &&
                    !snapshot.allowedPackages.contains(pkg) &&
                    !PolicyEvaluator.isEssential(pkg)
            }
            .toSet()
    }

    internal fun parseJsonObject(rawJson: String): Map<String, Any?> {
        val parser = MiniJsonParser(rawJson)
        val value = parser.parseValue()
        @Suppress("UNCHECKED_CAST")
        return value as? Map<String, Any?> ?: throw IllegalArgumentException("Expected JSON object")
    }

    private class MiniJsonParser(private val input: String) {
        private var pos = 0

        fun parseValue(): Any? {
            skipWhitespace()
            if (pos >= input.length) throw IllegalArgumentException("Unexpected end of JSON")
            return when (val ch = input[pos]) {
                '{' -> parseObject()
                '[' -> parseArray()
                '"' -> parseString()
                't', 'f' -> parseBoolean()
                'n' -> parseNull()
                else -> if (ch == '-' || ch.isDigit()) parseNumber() else throw IllegalArgumentException("Unexpected char: $ch")
            }
        }

        private fun parseObject(): Map<String, Any?> {
            expect('{')
            val map = linkedMapOf<String, Any?>()
            skipWhitespace()
            if (peek('}')) {
                pos++
                return map
            }
            while (true) {
                skipWhitespace()
                val key = parseString()
                skipWhitespace()
                expect(':')
                val value = parseValue()
                map[key] = value
                skipWhitespace()
                if (peek(',')) {
                    pos++
                } else {
                    expect('}')
                    return map
                }
            }
        }

        private fun parseArray(): List<Any?> {
            expect('[')
            val list = mutableListOf<Any?>()
            skipWhitespace()
            if (peek(']')) {
                pos++
                return list
            }
            while (true) {
                list.add(parseValue())
                skipWhitespace()
                if (peek(',')) {
                    pos++
                } else {
                    expect(']')
                    return list
                }
            }
        }

        private fun parseString(): String {
            expect('"')
            val sb = StringBuilder()
            while (pos < input.length) {
                val ch = input[pos++]
                if (ch == '"') return sb.toString()
                if (ch == '\\' && pos < input.length) {
                    when (val esc = input[pos++]) {
                        '"', '\\', '/' -> sb.append(esc)
                        'b' -> sb.append('\b')
                        'f' -> sb.append('\u000C')
                        'n' -> sb.append('\n')
                        'r' -> sb.append('\r')
                        't' -> sb.append('\t')
                        'u' -> {
                            val hex = input.substring(pos, pos + 4)
                            pos += 4
                            sb.append(hex.toInt(16).toChar())
                        }
                        else -> sb.append(esc)
                    }
                } else {
                    sb.append(ch)
                }
            }
            throw IllegalArgumentException("Unterminated JSON string")
        }

        private fun parseBoolean(): Boolean {
            return if (input.startsWith("true", pos)) {
                pos += 4
                true
            } else if (input.startsWith("false", pos)) {
                pos += 5
                false
            } else {
                throw IllegalArgumentException("Invalid boolean at $pos")
            }
        }

        private fun parseNull(): Any? {
            if (!input.startsWith("null", pos)) throw IllegalArgumentException("Invalid null at $pos")
            pos += 4
            return null
        }

        private fun parseNumber(): Double {
            val start = pos
            if (input[pos] == '-') pos++
            while (pos < input.length && (input[pos].isDigit() || input[pos] == '.' || input[pos] == 'e' || input[pos] == 'E' || input[pos] == '+' || input[pos] == '-')) {
                pos++
            }
            return input.substring(start, pos).toDouble()
        }

        private fun skipWhitespace() {
            while (pos < input.length && input[pos].isWhitespace()) pos++
        }

        private fun peek(expected: Char): Boolean = pos < input.length && input[pos] == expected

        private fun expect(expected: Char) {
            if (pos >= input.length || input[pos] != expected) {
                throw IllegalArgumentException("Expected '$expected' at $pos")
            }
            pos++
        }
    }
}

/**
 * Zero-dependency HTTP client for registering this Android device and pulling
 * `/api/agent/policy` snapshots from the FocusGate web API.
 */
class RemoteAgentSyncClient(
    private val connectTimeoutMs: Int = 10_000,
    private val readTimeoutMs: Int = 15_000,
) {
    fun registerDevice(
        apiBaseUrl: String,
        accessToken: String,
        deviceName: String,
        appVersion: String,
    ): RemoteDeviceRegistration {
        val base = apiBaseUrl.trimEnd('/')
        val conn = (URL("$base/api/devices/register").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = connectTimeoutMs
            readTimeout = readTimeoutMs
            doOutput = true
            setRequestProperty("Authorization", "Bearer $accessToken")
            setRequestProperty("Content-Type", "application/json")
        }

        val payload = """{"name":${quoteJson(deviceName)},"platform":"android","appVersion":${quoteJson(appVersion)}}"""
        conn.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }
        val code = conn.responseCode
        val body = readResponseBody(conn, code)
        if (code !in 200..299) {
            throw IOException("Device registration failed ($code): $body")
        }

        val obj = RemotePolicySync.parseJsonObject(body)
        return RemoteDeviceRegistration(
            deviceId = obj["deviceId"] as? String ?: throw IOException("Missing deviceId"),
            name = obj["name"] as? String ?: deviceName,
            platform = obj["platform"] as? String ?: "android",
            status = obj["status"] as? String ?: "active",
        )
    }

    fun pullPolicy(
        apiBaseUrl: String,
        accessToken: String,
        deviceId: String,
    ): RemotePolicySnapshot {
        val base = apiBaseUrl.trimEnd('/')
        val conn = (URL("$base/api/agent/policy?deviceId=$deviceId").openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = connectTimeoutMs
            readTimeout = readTimeoutMs
            setRequestProperty("Authorization", "Bearer $accessToken")
        }

        val code = conn.responseCode
        val body = readResponseBody(conn, code)
        if (code !in 200..299) {
            throw IOException("Policy pull failed ($code): $body")
        }
        return RemotePolicySync.parsePolicyJson(body)
    }

    fun signInWithPassword(
        supabaseUrl: String,
        anonKey: String,
        email: String,
        password: String,
    ): SupabaseAuthSession {
        val base = supabaseUrl.trimEnd('/')
        val conn = (URL("$base/auth/v1/token?grant_type=password").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = connectTimeoutMs
            readTimeout = readTimeoutMs
            doOutput = true
            setRequestProperty("apikey", anonKey)
            setRequestProperty("Content-Type", "application/json")
        }
        val payload = """{"email":${quoteJson(email)},"password":${quoteJson(password)}}"""
        conn.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }
        val code = conn.responseCode
        val body = readResponseBody(conn, code)
        if (code !in 200..299) {
            throw IOException(parseErrorMessage(body, "Sign in failed ($code)"))
        }
        return parseAuthSession(body, email)
    }

    fun refreshSession(
        supabaseUrl: String,
        anonKey: String,
        refreshToken: String,
        fallbackEmail: String,
    ): SupabaseAuthSession {
        val base = supabaseUrl.trimEnd('/')
        val conn = (URL("$base/auth/v1/token?grant_type=refresh_token").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = connectTimeoutMs
            readTimeout = readTimeoutMs
            doOutput = true
            setRequestProperty("apikey", anonKey)
            setRequestProperty("Content-Type", "application/json")
        }
        val payload = """{"refresh_token":${quoteJson(refreshToken)}}"""
        conn.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }
        val code = conn.responseCode
        val body = readResponseBody(conn, code)
        if (code !in 200..299) {
            throw IOException("Session expired ($code)")
        }
        return parseAuthSession(body, fallbackEmail)
    }

    fun fetchTodayPlan(
        apiBaseUrl: String,
        accessToken: String,
    ): RemotePlanSnapshot {
        val base = apiBaseUrl.trimEnd('/')
        val conn = (URL("$base/api/agent/plan").openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = connectTimeoutMs
            readTimeout = readTimeoutMs
            setRequestProperty("Authorization", "Bearer $accessToken")
        }
        val code = conn.responseCode
        val body = readResponseBody(conn, code)
        if (code == 401) throw UnauthorizedApiException()
        if (code !in 200..299) {
            throw IOException(parseErrorMessage(body, "Plan sync failed ($code)"))
        }
        return parsePlanSnapshot(body)
    }

    fun completePlanTask(
        apiBaseUrl: String,
        accessToken: String,
        planTaskId: String,
        deviceId: String?,
    ): RemotePlanSnapshot {
        val base = apiBaseUrl.trimEnd('/')
        val conn = (URL("$base/api/agent/plan/complete").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = connectTimeoutMs
            readTimeout = readTimeoutMs
            doOutput = true
            setRequestProperty("Authorization", "Bearer $accessToken")
            setRequestProperty("Content-Type", "application/json")
        }
        val deviceField = if (deviceId != null) ""","deviceId":${quoteJson(deviceId)}""" else ""
        val payload = """{"planTaskId":${quoteJson(planTaskId)}$deviceField}"""
        conn.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }
        val code = conn.responseCode
        val body = readResponseBody(conn, code)
        if (code == 401) throw UnauthorizedApiException()
        if (code !in 200..299) {
            throw IOException(parseErrorMessage(body, "Could not complete task ($code)"))
        }
        return parsePlanSnapshot(body)
    }

    fun pushUsageBatch(
        apiBaseUrl: String,
        accessToken: String,
        deviceId: String,
        events: List<UsageEvent>,
        labelLookup: (String) -> String?,
    ) {
        if (events.isEmpty()) return
        val base = apiBaseUrl.trimEnd('/')
        val conn = (URL("$base/api/agent/usage").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = connectTimeoutMs
            readTimeout = readTimeoutMs
            doOutput = true
            setRequestProperty("Authorization", "Bearer $accessToken")
            setRequestProperty("Content-Type", "application/json")
        }

        val itemsJson = events.joinToString(",") { evt ->
            val endedAt = evt.endedAt ?: evt.startedAt
            val durationSeconds = ((endedAt - evt.startedAt) / 1000L).coerceIn(0L, 86_400L)
            val clientEventId = "android-${deviceId.take(8)}-${evt.id}"
            val label = labelLookup(evt.packageName) ?: evt.packageName
            """{"clientEventId":${quoteJson(clientEventId)},"identifier":${quoteJson(evt.packageName)},"displayName":${quoteJson(label)},"startedAt":${quoteJson(formatIsoUtc(evt.startedAt))},"endedAt":${quoteJson(formatIsoUtc(endedAt))},"durationSeconds":$durationSeconds,"wasBlocked":${evt.blocked}}"""
        }
        val payload = """{"deviceId":${quoteJson(deviceId)},"events":[$itemsJson]}"""
        conn.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }
        val code = conn.responseCode
        val body = readResponseBody(conn, code)
        if (code == 401) throw UnauthorizedApiException()
        if (code !in 200..299) {
            throw IOException(parseErrorMessage(body, "Usage sync failed ($code)"))
        }
    }

    fun pushBlockRules(
        apiBaseUrl: String,
        accessToken: String,
        deviceId: String,
        rules: List<Pair<String, String>>,
    ) {
        val base = apiBaseUrl.trimEnd('/')
        val conn = (URL("$base/api/agent/rules").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = connectTimeoutMs
            readTimeout = readTimeoutMs
            doOutput = true
            setRequestProperty("Authorization", "Bearer $accessToken")
            setRequestProperty("Content-Type", "application/json")
        }

        val itemsJson = rules.joinToString(",") { (pkg, label) ->
            """{"identifier":${quoteJson(pkg)},"displayName":${quoteJson(label)}}"""
        }
        val payload = """{"deviceId":${quoteJson(deviceId)},"rules":[$itemsJson]}"""
        conn.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }
        val code = conn.responseCode
        val body = readResponseBody(conn, code)
        if (code == 401) throw UnauthorizedApiException()
        if (code !in 200..299) {
            throw IOException(parseErrorMessage(body, "Rules sync failed ($code)"))
        }
    }

    private fun formatIsoUtc(epochMs: Long): String {
        val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        fmt.timeZone = TimeZone.getTimeZone("UTC")
        return fmt.format(Date(epochMs))
    }

    private fun parseAuthSession(body: String, fallbackEmail: String): SupabaseAuthSession {
        val obj = RemotePolicySync.parseJsonObject(body)
        val accessToken = obj["access_token"] as? String
            ?: throw IOException("Missing access_token")
        val refreshToken = obj["refresh_token"] as? String
            ?: throw IOException("Missing refresh_token")
        val userObj = obj["user"] as? Map<*, *>
        val email = (userObj?.get("email") as? String)?.takeIf { it.isNotBlank() } ?: fallbackEmail
        return SupabaseAuthSession(
            accessToken = accessToken,
            refreshToken = refreshToken,
            email = email,
        )
    }

    private fun parsePlanSnapshot(body: String): RemotePlanSnapshot {
        val obj = RemotePolicySync.parseJsonObject(body)
        val activeGrantMinutes = (obj["activeGrantMinutes"] as? Number)?.toInt() ?: 0
        val unlocked = obj["unlocked"] as? Boolean ?: false
        val planObj = obj["plan"] as? Map<*, *>
        if (planObj == null) {
            return RemotePlanSnapshot(
                plan = null,
                activeGrantMinutes = activeGrantMinutes,
                unlocked = unlocked,
            )
        }

        val rawTasks = (planObj["tasks"] as? List<*>)?.mapNotNull { entry ->
            val t = entry as? Map<*, *> ?: return@mapNotNull null
            RemotePlanTask(
                planTaskId = t["planTaskId"] as? String ?: return@mapNotNull null,
                taskId = t["taskId"] as? String ?: "",
                title = t["title"] as? String ?: "Untitled task",
                kind = t["kind"] as? String ?: "must_do",
                status = t["status"] as? String ?: "todo",
                requiredFocusMinutes = (t["requiredFocusMinutes"] as? Number)?.toInt() ?: 0,
                focusDone = (t["focusDone"] as? Number)?.toInt() ?: 0,
            )
        }.orEmpty()

        return RemotePlanSnapshot(
            plan = RemoteDailyPlan(
                id = planObj["id"] as? String ?: "",
                planDate = planObj["planDate"] as? String ?: "",
                status = planObj["status"] as? String ?: "draft",
                allTasksTotal = (planObj["allTasksTotal"] as? Number)?.toInt() ?: rawTasks.size,
                allTasksCompleted = (planObj["allTasksCompleted"] as? Number)?.toInt()
                    ?: rawTasks.count { it.status == "completed" },
                allCompleted = planObj["allCompleted"] as? Boolean ?: false,
                tasks = rawTasks,
            ),
            activeGrantMinutes = activeGrantMinutes,
            unlocked = unlocked,
        )
    }

    private fun parseErrorMessage(body: String, fallback: String): String {
        return try {
            val obj = RemotePolicySync.parseJsonObject(body)
            (obj["error_description"] as? String)
                ?: (obj["msg"] as? String)
                ?: (obj["error"] as? String)
                ?: fallback
        } catch (_: Exception) {
            fallback
        }
    }

    private fun readResponseBody(conn: HttpURLConnection, code: Int): String {
        val stream = if (code in 200..299) conn.inputStream else (conn.errorStream ?: conn.inputStream)
        return stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
    }

    private fun quoteJson(value: String): String =
        buildString {
            append('"')
            for (ch in value) {
                when (ch) {
                    '"' -> append("\\\"")
                    '\\' -> append("\\\\")
                    '\n' -> append("\\n")
                    '\r' -> append("\\r")
                    '\t' -> append("\\t")
                    else -> append(ch)
                }
            }
            append('"')
        }
}
