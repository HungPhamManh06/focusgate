package com.focusgate.app.util

import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.net.Uri
import android.provider.AlarmClock
import org.json.JSONObject

/**
 * Safe native Android executor for FocusGate AI Omni-Controller commands.
 * Executes launcher apps, browser URLs, media volume controls, alarms/timers, and Focus Sanctuary.
 */
object AndroidCommandExecutor {
    data class ExecutionResult(val ok: Boolean, val message: String)

    fun execute(
        context: Context,
        commandJson: String?,
        onOpenSanctuary: () -> Unit = {},
    ): ExecutionResult {
        if (commandJson.isNullOrBlank()) return ExecutionResult(false, "Empty command.")
        val cmd = runCatching { JSONObject(commandJson) }.getOrNull()
            ?: return ExecutionResult(false, "Malformed command JSON.")

        val target = cmd.optString("targetPlatform", "any")
        if (target == "windows") {
            return ExecutionResult(true, "Queued for Windows PC.")
        }

        return when (cmd.optString("type")) {
            "open_url_in_browser" -> openUrl(context, cmd.optString("url"))
            "launch_app" -> launchAppByName(context, cmd.optString("appName"))
            "media_control" -> handleMediaControl(context, cmd.optString("action"))
            "system_action" -> handleSystemAction(context, cmd, onOpenSanctuary)
            else -> ExecutionResult(false, "Unsupported Android command.")
        }
    }

    private fun openUrl(context: Context, url: String): ExecutionResult {
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            return ExecutionResult(false, "Invalid URL.")
        }
        return runCatching {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            ExecutionResult(true, "Opened $url")
        }.getOrElse {
            ExecutionResult(false, "Could not open URL: ${it.message}")
        }
    }

    private fun launchAppByName(context: Context, rawName: String): ExecutionResult {
        val needle = rawName.trim().lowercase()
        if (needle.isEmpty()) return ExecutionResult(false, "Missing app name.")

        val pm = context.packageManager
        val launcherIntent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val activities = pm.queryIntentActivities(launcherIntent, 0)

        val match = activities.firstOrNull { info ->
            val label = info.loadLabel(pm)?.toString()?.lowercase().orEmpty()
            val pkg = info.activityInfo.packageName.lowercase()
            label == needle || label.contains(needle) || pkg.contains(needle)
        } ?: return ExecutionResult(false, "App '$rawName' not found on this phone.")

        val pkgName = match.activityInfo.packageName
        val launch = pm.getLaunchIntentForPackage(pkgName)
            ?: return ExecutionResult(false, "Cannot launch '$rawName'.")
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return runCatching {
            context.startActivity(launch)
            ExecutionResult(true, "Launched ${match.loadLabel(pm)}")
        }.getOrElse {
            ExecutionResult(false, "Failed to launch '$rawName': ${it.message}")
        }
    }

    private fun handleMediaControl(context: Context, action: String): ExecutionResult {
        val audio = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
            ?: return ExecutionResult(false, "Audio service unavailable.")
        return when (action) {
            "volume_up" -> {
                audio.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_RAISE, AudioManager.FLAG_SHOW_UI)
                ExecutionResult(true, "Volume raised.")
            }
            "volume_down" -> {
                audio.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_LOWER, AudioManager.FLAG_SHOW_UI)
                ExecutionResult(true, "Volume lowered.")
            }
            "mute" -> {
                audio.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_TOGGLE_MUTE, AudioManager.FLAG_SHOW_UI)
                ExecutionResult(true, "Toggled mute.")
            }
            else -> ExecutionResult(false, "Unsupported media control: $action")
        }
    }

    private fun handleSystemAction(
        context: Context,
        cmd: JSONObject,
        onOpenSanctuary: () -> Unit,
    ): ExecutionResult {
        return when (cmd.optString("action")) {
            "open_sanctuary" -> {
                onOpenSanctuary()
                ExecutionResult(true, "Opened Focus Sanctuary.")
            }
            "set_alarm" -> runCatching {
                val hour = cmd.optInt("hour", 7)
                val minute = cmd.optInt("minute", 0)
                val intent = Intent(AlarmClock.ACTION_SET_ALARM).apply {
                    putExtra(AlarmClock.EXTRA_HOUR, hour)
                    putExtra(AlarmClock.EXTRA_MINUTES, minute)
                    putExtra(AlarmClock.EXTRA_MESSAGE, "FocusGate AI")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
                ExecutionResult(true, "Opened alarm for $hour:$minute.")
            }.getOrElse { ExecutionResult(false, "Could not set alarm: ${it.message}") }
            "set_timer" -> runCatching {
                val minutes = cmd.optInt("minutes", 10).coerceAtLeast(1)
                val intent = Intent(AlarmClock.ACTION_SET_TIMER).apply {
                    putExtra(AlarmClock.EXTRA_LENGTH, minutes * 60)
                    putExtra(AlarmClock.EXTRA_MESSAGE, "FocusGate AI")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
                ExecutionResult(true, "Started ${minutes}m timer.")
            }.getOrElse { ExecutionResult(false, "Could not set timer: ${it.message}") }
            else -> ExecutionResult(false, "Unsupported system action.")
        }
    }
}
