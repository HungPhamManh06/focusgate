package com.focusgate.app.util

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import com.focusgate.app.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

data class AppUpdateInfo(
    val versionCode: Int,
    val versionName: String,
    val downloadUrl: String,
    val releaseNotes: String,
)

object AppUpdater {
    private const val RELEASES_LATEST_URL =
        "https://api.github.com/repos/HungPhamManh06/focusgate/releases/latest"

    /** Pure helper for unit testing tag parsing (`android-v0.1.64` -> 64). */
    fun parseVersionCodeFromTag(tag: String): Int? {
        val trimmed = tag.trim()
        val match = Regex("""(\d+)$""").find(trimmed) ?: return null
        return match.groupValues[1].toIntOrNull()
    }

    suspend fun checkForUpdate(): AppUpdateInfo? = withContext(Dispatchers.IO) {
        val conn = (URL(RELEASES_LATEST_URL).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 8_000
            readTimeout = 8_000
            setRequestProperty("Accept", "application/vnd.github+json")
            setRequestProperty("User-Agent", "FocusGate-Android/${BuildConfig.VERSION_NAME}")
        }
        try {
            if (conn.responseCode !in 200..299) return@withContext null
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            val json = JSONObject(body)
            val tag = json.optString("tag_name", "")
            val remoteCode = parseVersionCodeFromTag(tag) ?: return@withContext null
            if (remoteCode <= BuildConfig.VERSION_CODE) return@withContext null

            val assets = json.optJSONArray("assets") ?: return@withContext null
            var apkUrl: String? = null
            for (i in 0 until assets.length()) {
                val asset = assets.optJSONObject(i) ?: continue
                val name = asset.optString("name", "")
                if (name.endsWith(".apk", ignoreCase = true)) {
                    apkUrl = asset.optString("browser_download_url", "").takeIf { it.isNotBlank() }
                    break
                }
            }
            if (apkUrl == null) return@withContext null
            AppUpdateInfo(
                versionCode = remoteCode,
                versionName = tag.removePrefix("android-"),
                downloadUrl = apkUrl,
                releaseNotes = json.optString("body", ""),
            )
        } catch (_: Throwable) {
            null
        } finally {
            conn.disconnect()
        }
    }

    suspend fun downloadAndInstall(context: Context, update: AppUpdateInfo): Result<Unit> =
        withContext(Dispatchers.IO) {
            runCatching {
                val updatesDir = File(context.cacheDir, "updates").apply { mkdirs() }
                val apkFile = File(updatesDir, "focusgate-${update.versionCode}.apk")

                val conn = (URL(update.downloadUrl).openConnection() as HttpURLConnection).apply {
                    instanceFollowRedirects = true
                    connectTimeout = 15_000
                    readTimeout = 60_000
                    setRequestProperty("User-Agent", "FocusGate-Android/${BuildConfig.VERSION_NAME}")
                }
                try {
                    if (conn.responseCode !in 200..299) {
                        error("HTTP ${conn.responseCode} downloading update")
                    }
                    conn.inputStream.use { input ->
                        FileOutputStream(apkFile).use { output ->
                            input.copyTo(output)
                        }
                    }
                } finally {
                    conn.disconnect()
                }

                val uri = FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.fileprovider",
                    apkFile,
                )
                val installIntent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(installIntent)
            }
        }
}
