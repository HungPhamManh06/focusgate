package com.focusgate.app.ui

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.focusgate.app.R
import com.focusgate.app.util.AgentPreferences

/**
 * FocusGate 7.0: Compact 2x2 Streak & 1-Tap Focus Home Screen Widget.
 */
class FocusGateStreakWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        for (appWidgetId in appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId)
        }
    }

    companion object {
        fun updateAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context) ?: return
            val ids = manager.getAppWidgetIds(
                ComponentName(context, FocusGateStreakWidgetProvider::class.java),
            )
            for (id in ids) {
                updateWidget(context, manager, id)
            }
        }

        private fun updateWidget(
            context: Context,
            manager: AppWidgetManager,
            appWidgetId: Int,
        ) {
            val views = RemoteViews(context.packageName, R.layout.widget_focusgate_streak)
            val isVi = AgentPreferences.getLanguage(context) == "vi"
            val unlocked = AgentPreferences.isPlanUnlocked(context)
            val focusing = AgentPreferences.isActiveFocusRunning(context)

            val badge = when {
                focusing -> if (isVi) "Đang tập trung" else "Focusing"
                unlocked -> if (isVi) "Cổng đã mở" else "Gate Open"
                else -> if (isVi) "Cổng đang khóa" else "Gate Locked"
            }
            views.setTextViewText(R.id.streak_widget_badge, badge)
            views.setTextViewText(R.id.streak_widget_summary, AgentPreferences.getPlanSummaryText(context))
            views.setTextViewText(
                R.id.streak_widget_cta,
                if (focusing) {
                    if (isVi) "Mở phiên" else "Open Sprint"
                } else {
                    if (isVi) "⚡ Focus 25p" else "⚡ 25m Focus"
                },
            )

            val launchIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val pendingIntent = PendingIntent.getActivity(
                context,
                102,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.streak_widget_root, pendingIntent)
            views.setOnClickPendingIntent(R.id.streak_widget_cta, pendingIntent)

            manager.updateAppWidget(appWidgetId, views)
        }
    }
}
