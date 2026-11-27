package com.focusgate.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
 * FocusGate 16.0: Bedtime & Quiet Hours Visual Arc Card on Android GUARD tab.
 * Arc radius is strictly bounded by both canvas width and height so it never
 * overflows or overlaps the 23:00 / 06:00 labels below.
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
                Column(modifier = Modifier.weight(1f).padding(end = 12.dp)) {
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

            Spacer(Modifier.height(14.dp))

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(92.dp),
                contentAlignment = Alignment.BottomCenter,
            ) {
                Canvas(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(88.dp),
                ) {
                    val strokePx = 9.dp.toPx()
                    val stroke = Stroke(width = strokePx, cap = StrokeCap.Round)
                    val maxRadius = minOf(
                        (size.width - strokePx * 2f) * 0.40f,
                        size.height - strokePx * 1.2f,
                    ).coerceAtLeast(24f)
                    val diameter = maxRadius * 2f
                    val left = (size.width - diameter) / 2f
                    val top = size.height - maxRadius - strokePx * 0.5f
                    val arcSize = Size(diameter, diameter)

                    drawArc(
                        color = trackColor,
                        startAngle = 180f,
                        sweepAngle = 180f,
                        useCenter = false,
                        topLeft = Offset(left, top),
                        size = arcSize,
                        style = stroke,
                    )
                    drawArc(
                        color = if (enabled) activeColor else trackColor,
                        startAngle = 192f,
                        sweepAngle = 156f,
                        useCenter = false,
                        topLeft = Offset(left, top),
                        size = arcSize,
                        style = stroke,
                    )
                }

                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(bottom = 6.dp),
                ) {
                    Text(
                        text = "23:00 – 06:00",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = if (enabled) activeColor else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = if (enabled) {
                            if (isVi) "Đang bảo vệ" else "Protected"
                        } else {
                            if (isVi) "Đang tắt" else "Off"
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            Spacer(Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = if (isVi) "🌙 23:00 Khóa" else "🌙 23:00 Lock",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                )
                Text(
                    text = if (isVi) "☀️ 06:00 Mở" else "☀️ 06:00 Wake",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                )
            }
        }
    }
}
