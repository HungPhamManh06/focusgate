package com.focusgate.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * FocusGate AI — Concept 1: Keystone Spark
 * Double discipline arch crowned by a glowing crimson 4-point AI star.
 */
@Composable
fun AiKeystoneLogo(
    size: Dp = 28.dp,
    modifier: Modifier = Modifier,
) {
    Canvas(modifier = modifier.size(size)) {
        val w = this.size.width
        val h = this.size.height
        val s = minOf(w, h) / 64f

        // Dark espresso squircle background
        drawRoundRect(
            brush = Brush.linearGradient(
                colors = listOf(Color(0xFF261515), Color(0xFF141212), Color(0xFF2D1010)),
                start = Offset(0f, 0f),
                end = Offset(w, h),
            ),
            cornerRadius = CornerRadius(16f * s, 16f * s),
            size = Size(w, h),
        )

        // Subtle border
        drawRoundRect(
            color = Color(0xFF3F2A2A),
            cornerRadius = CornerRadius(16f * s, 16f * s),
            size = Size(w, h),
            style = Stroke(width = 1.5f * s),
        )

        // Crimson apex aura
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(Color(0x88EF4444), Color(0x28DC2626), Color.Transparent),
                center = Offset(32f * s, 18f * s),
                radius = 22f * s,
            ),
            radius = 22f * s,
            center = Offset(32f * s, 18f * s),
        )

        // Outer FocusGate arch
        val outerArch = Path().apply {
            moveTo(17f * s, 49f * s)
            lineTo(17f * s, 32f * s)
            cubicTo(17f * s, 23.7f * s, 23.7f * s, 17f * s, 32f * s, 17f * s)
            cubicTo(40.3f * s, 17f * s, 47f * s, 23.7f * s, 47f * s, 32f * s)
            lineTo(47f * s, 49f * s)
        }
        drawPath(
            path = outerArch,
            color = Color(0xFFFAF7F5),
            style = Stroke(width = 3.2f * s, cap = StrokeCap.Round),
        )

        // Inner FocusGate arch
        val innerArch = Path().apply {
            moveTo(24f * s, 49f * s)
            lineTo(24f * s, 33f * s)
            cubicTo(24f * s, 28.6f * s, 27.6f * s, 25f * s, 32f * s, 25f * s)
            cubicTo(36.4f * s, 25f * s, 40f * s, 28.6f * s, 40f * s, 33f * s)
            lineTo(40f * s, 49f * s)
        }
        drawPath(
            path = innerArch,
            color = Color(0xB8FAF7F5),
            style = Stroke(width = 2.4f * s, cap = StrokeCap.Round),
        )

        // Center crimson pillar
        drawLine(
            color = Color(0xB3DC2626),
            start = Offset(32f * s, 34f * s),
            end = Offset(32f * s, 49f * s),
            strokeWidth = 2f * s,
            cap = StrokeCap.Round,
        )

        // 4-point Keystone AI spark
        val spark = Path().apply {
            moveTo(32f * s, 7.5f * s)
            cubicTo(32.85f * s, 13.6f * s, 34.4f * s, 15.15f * s, 40.5f * s, 16f * s)
            cubicTo(34.4f * s, 16.85f * s, 32.85f * s, 18.4f * s, 32f * s, 24.5f * s)
            cubicTo(31.15f * s, 18.4f * s, 29.6f * s, 16.85f * s, 23.5f * s, 16f * s)
            cubicTo(29.6f * s, 15.15f * s, 31.15f * s, 13.6f * s, 32f * s, 7.5f * s)
            close()
        }
        drawPath(
            path = spark,
            brush = Brush.verticalGradient(
                colors = listOf(Color(0xFFFFF1F2), Color(0xFFFCA5A5), Color(0xFFDC2626)),
                startY = 8f * s,
                endY = 25f * s,
            ),
        )
    }
}
