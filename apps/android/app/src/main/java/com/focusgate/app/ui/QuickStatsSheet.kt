package com.focusgate.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun QuickStatsSheetContent(
    completedToday: Int,
    totalToday: Int,
    blockedCount: Int,
    weeklyBars: List<Pair<String, Int>>,
    isVi: Boolean,
) {
    val primaryColor = MaterialTheme.colorScheme.primary
    val trackColor = MaterialTheme.colorScheme.surfaceVariant
    val maxVal = (weeklyBars.maxOfOrNull { it.second } ?: 1).coerceAtLeast(1)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 12.dp),
    ) {
        Text(
            text = if (isVi) "Thống kê Nhanh & Chuỗi tập trung" else "Quick Stats & Focus Rhythm",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = if (isVi) {
                "Tổng hợp tiến độ hôm nay và nhịp kỷ luật 7 ngày trên thiết bị."
            } else {
                "Today's progress and 7-day on-device discipline rhythm."
            },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 2.dp),
        )

        Spacer(Modifier.height(14.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            StatPillBox(
                label = if (isVi) "Hoàn thành" else "Completed",
                value = "$completedToday/$totalToday",
                modifier = Modifier.weight(1f),
            )
            StatPillBox(
                label = if (isVi) "Lần Cổng chặn" else "Gate Blocks",
                value = blockedCount.toString(),
                modifier = Modifier.weight(1f),
            )
            StatPillBox(
                label = if (isVi) "Tỷ lệ ngày" else "Day Rate",
                value = if (totalToday > 0) "${(completedToday * 100) / totalToday}%" else "—",
                modifier = Modifier.weight(1f),
            )
        }

        Spacer(Modifier.height(18.dp))

        Text(
            text = if (isVi) "Biểu đồ hoạt động 7 ngày" else "7-Day Activity Bars",
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
        )

        Spacer(Modifier.height(10.dp))

        Canvas(
            modifier = Modifier
                .fillMaxWidth()
                .height(110.dp),
        ) {
            val count = weeklyBars.size.coerceAtLeast(1)
            val gap = 12.dp.toPx()
            val barWidth = ((size.width - gap * (count - 1)) / count).coerceAtLeast(8f)
            weeklyBars.forEachIndexed { idx, (_, value) ->
                val x = idx * (barWidth + gap)
                val barH = (size.height * (value.toFloat() / maxVal.toFloat())).coerceAtLeast(8f)
                drawRoundRect(
                    color = trackColor,
                    topLeft = Offset(x, 0f),
                    size = Size(barWidth, size.height),
                    cornerRadius = CornerRadius(14f, 14f),
                )
                drawRoundRect(
                    color = primaryColor,
                    topLeft = Offset(x, size.height - barH),
                    size = Size(barWidth, barH),
                    cornerRadius = CornerRadius(14f, 14f),
                )
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 6.dp, bottom = 18.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            weeklyBars.forEach { (dayLabel, _) ->
                Text(
                    text = dayLabel,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun StatPillBox(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerHighest)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        horizontalAlignment = Alignment.Start,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(top = 2.dp),
        )
    }
}
