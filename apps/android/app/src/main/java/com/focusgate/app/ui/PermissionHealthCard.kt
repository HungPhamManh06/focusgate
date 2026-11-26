package com.focusgate.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * FocusGate 9.0: Interactive Permission Health Checklist Card on Android GUARD tab.
 */
@Composable
fun PermissionHealthCard(
    usageGranted: Boolean,
    overlayGranted: Boolean,
    notificationsGranted: Boolean,
    isVi: Boolean,
    onOpenSetup: () -> Unit,
) {
    val items = listOf(
        (if (isVi) "Quyền theo dõi ứng dụng (Usage Access)" else "Usage Access") to usageGranted,
        (if (isVi) "Quyền hiển thị màn hình khóa (Overlay)" else "Display over other apps") to overlayGranted,
        (if (isVi) "Quyền thông báo trực tiếp (Notifications)" else "Live Notifications") to notificationsGranted,
    )
    val readyCount = items.count { it.second }
    val progress = readyCount.toFloat() / items.size.toFloat()

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = if (isVi) "Sức khỏe Quyền Bảo vệ ($readyCount/3)" else "Protection Health ($readyCount/3)",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                if (readyCount < items.size) {
                    TextButton(onClick = onOpenSetup) {
                        Text(if (isVi) "Cấp quyền" else "Fix now")
                    }
                }
            }

            Spacer(Modifier.height(6.dp))

            LinearProgressIndicator(
                progress = { progress },
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(Modifier.height(10.dp))

            items.forEach { (label, ok) ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 2.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        text = label,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = if (ok) "✓" else "•",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = if (ok) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                    )
                }
            }
        }
    }
}
