package com.focusgate.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * FocusGate 8.0: Bedtime & Quiet Hours Visual Arc Card on Android GUARD tab.
 */
@Composable
fun BedtimeArcCard(
    enabled: Boolean,
    onToggle: (Boolean) -> Unit,
    isVi: Boolean,
) {
    val activeColor = MaterialTheme.colorScheme.primary
    val trackColor = MaterialTheme.colorScheme.surfaceVariant

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = if (isVi) "Cổng Giờ Ngủ (23:00 → 06:00)" else "Bedtime Quiet Arc (23:00 → 06:00)",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = if (enabled) {
                            if (isVi) "Tự động khóa ứng dụng giải trí ban đêm." else "Automatically locks leisure apps overnight."
                        } else {
                            if (isVi) "Bật để bảo vệ giấc ngủ và tránh lướt khuya." else "Enable to protect sleep and stop late scrolling."
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Switch(checked = enabled, onCheckedChange = onToggle)
            }

            Spacer(Modifier.height(12.dp))

            Canvas(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(64.dp),
            ) {
                val stroke = Stroke(width = 10.dp.toPx(), cap = StrokeCap.Round)
                val arcW = size.width * 0.72f
                val left = (size.width - arcW) / 2f
                val arcSize = Size(arcW, arcW)
                drawArc(
                    color = trackColor,
                    startAngle = 180f,
                    sweepAngle = 180f,
                    useCenter = false,
                    topLeft = Offset(left, 8.dp.toPx()),
                    size = arcSize,
                    style = stroke,
                )
                drawArc(
                    color = if (enabled) activeColor else trackColor,
                    startAngle = 195f,
                    sweepAngle = 150f,
                    useCenter = false,
                    topLeft = Offset(left, 8.dp.toPx()),
                    size = arcSize,
                    style = stroke,
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = if (isVi) "🌙 23:00 Khóa" else "🌙 23:00 Lock",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = if (isVi) "☀️ 06:00 Mở" else "☀️ 06:00 Wake",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
