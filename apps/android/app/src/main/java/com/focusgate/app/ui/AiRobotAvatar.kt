package com.focusgate.app.ui

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
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

enum class RobotMood {
    IDLE,
    LISTENING,
    THINKING,
    SUCCESS,
}

/**
 * FocusGate 17.0: GateBot — Friendly Companion Robot Avatar in Jetpack Compose.
 * Matches Web's ceramic arch-head + obsidian visor + blinking/mood animations 1:1.
 */
@Composable
fun AiRobotAvatar(
    size: Dp = 32.dp,
    mood: RobotMood = RobotMood.IDLE,
    modifier: Modifier = Modifier,
) {
    val primaryColor = MaterialTheme.colorScheme.primary
    val transition = rememberInfiniteTransition(label = "gatebot")
    val blinkPhase by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 4200),
            repeatMode = RepeatMode.Restart,
        ),
        label = "blink",
    )
    val pulsePhase by transition.animateFloat(
        initialValue = 0.6f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 850),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "pulse",
    )

    val eyeScaleY = if (mood == RobotMood.IDLE && blinkPhase > 0.93f && blinkPhase < 0.98f) 0.16f else 1f
    val antennaColor = when (mood) {
        RobotMood.SUCCESS -> Color(0xFF34D399)
        RobotMood.LISTENING -> Color(0xFFF43F5E)
        RobotMood.THINKING -> Color(0xFFF59E0B)
        RobotMood.IDLE -> primaryColor
    }
    val eyeColor = when (mood) {
        RobotMood.SUCCESS -> Color(0xFF6EE7B7)
        RobotMood.LISTENING -> Color(0xFFFDA4AF)
        RobotMood.THINKING -> Color(0xFFFDE68A)
        RobotMood.IDLE -> Color(0xFFFEF2F2)
    }

    Canvas(modifier = modifier.size(size)) {
        val w = this.size.width
        val h = this.size.height
        val s = minOf(w, h) / 64f

        // Listening side soundwaves
        if (mood == RobotMood.LISTENING) {
            val waveAlpha = pulsePhase
            drawLine(
                color = antennaColor.copy(alpha = waveAlpha),
                start = Offset(5f * s, 31f * s),
                end = Offset(5f * s, 39f * s),
                strokeWidth = 2.4f * s,
                cap = StrokeCap.Round,
            )
            drawLine(
                color = antennaColor.copy(alpha = waveAlpha),
                start = Offset(59f * s, 31f * s),
                end = Offset(59f * s, 39f * s),
                strokeWidth = 2.4f * s,
                cap = StrokeCap.Round,
            )
        }

        // Thinking sparkles above head
        if (mood == RobotMood.THINKING) {
            drawCircle(
                color = Color(0xFFF59E0B).copy(alpha = pulsePhase),
                radius = 2.2f * s,
                center = Offset(15f * s, 11f * s),
            )
            drawCircle(
                color = Color(0xFFF59E0B).copy(alpha = 1.4f - pulsePhase),
                radius = 2f * s,
                center = Offset(49f * s, 11f * s),
            )
        }

        // Antenna stem & glowing bulb
        drawLine(
            color = Color(0xFFB8A8A3),
            start = Offset(32f * s, 10f * s),
            end = Offset(32f * s, 17f * s),
            strokeWidth = 2.4f * s,
            cap = StrokeCap.Round,
        )
        drawCircle(
            color = antennaColor.copy(alpha = if (mood == RobotMood.IDLE) 1f else pulsePhase),
            radius = 3.8f * s,
            center = Offset(32f * s, 8.5f * s),
        )
        drawCircle(
            color = Color.White.copy(alpha = 0.7f),
            radius = 1.1f * s,
            center = Offset(30.8f * s, 7.3f * s),
        )

        // Cute rounded ears
        drawRoundRect(
            color = Color(0xFFD8CBC7),
            topLeft = Offset(7f * s, 29f * s),
            size = Size(5.5f * s, 13f * s),
            cornerRadius = CornerRadius(2.75f * s, 2.75f * s),
        )
        drawRoundRect(
            color = Color(0xFFD8CBC7),
            topLeft = Offset(51.5f * s, 29f * s),
            size = Size(5.5f * s, 13f * s),
            cornerRadius = CornerRadius(2.75f * s, 2.75f * s),
        )

        // Ceramic rounded head
        drawRoundRect(
            brush = Brush.linearGradient(
                colors = listOf(Color(0xFFFFFAF8), Color(0xFFF2E9E6), Color(0xFFDCD0CC)),
                start = Offset(12f * s, 16f * s),
                end = Offset(52f * s, 56f * s),
            ),
            topLeft = Offset(11.5f * s, 16.5f * s),
            size = Size(41f * s, 38f * s),
            cornerRadius = CornerRadius(16.5f * s, 16.5f * s),
        )
        drawRoundRect(
            color = Color(0xFFC9BBB7),
            topLeft = Offset(11.5f * s, 16.5f * s),
            size = Size(41f * s, 38f * s),
            cornerRadius = CornerRadius(16.5f * s, 16.5f * s),
            style = Stroke(width = 1.5f * s),
        )

        // Subtle FocusGate arch on forehead
        val archPath = Path().apply {
            moveTo(25f * s, 22.5f * s)
            cubicTo(25f * s, 19.8f * s, 39f * s, 19.8f * s, 39f * s, 22.5f * s)
        }
        drawPath(
            path = archPath,
            color = antennaColor.copy(alpha = 0.55f),
            style = Stroke(width = 1.6f * s, cap = StrokeCap.Round),
        )

        // Obsidian glass visor
        drawRoundRect(
            brush = Brush.verticalGradient(
                colors = listOf(Color(0xFF261D21), Color(0xFF0F0B0D)),
                startY = 25f * s,
                endY = 47f * s,
            ),
            topLeft = Offset(16f * s, 25f * s),
            size = Size(32f * s, 21.5f * s),
            cornerRadius = CornerRadius(9.5f * s, 9.5f * s),
        )

        // Glass sheen
        drawLine(
            color = Color.White.copy(alpha = 0.18f),
            start = Offset(21f * s, 27.5f * s),
            end = Offset(33f * s, 27.5f * s),
            strokeWidth = 1.4f * s,
            cap = StrokeCap.Round,
        )

        // Expressive eyes & mouth
        if (mood == RobotMood.SUCCESS) {
            val leftEye = Path().apply {
                moveTo(21.5f * s, 35.5f * s)
                quadraticBezierTo(25f * s, 30.8f * s, 28.5f * s, 35.5f * s)
            }
            val rightEye = Path().apply {
                moveTo(35.5f * s, 35.5f * s)
                quadraticBezierTo(39f * s, 30.8f * s, 42.5f * s, 35.5f * s)
            }
            drawPath(leftEye, color = eyeColor, style = Stroke(width = 2.6f * s, cap = StrokeCap.Round))
            drawPath(rightEye, color = eyeColor, style = Stroke(width = 2.6f * s, cap = StrokeCap.Round))
        } else {
            val eyeH = 6.4f * s * eyeScaleY
            val eyeTop = 34.5f * s - eyeH / 2f
            drawRoundRect(
                color = eyeColor,
                topLeft = Offset(22.3f * s, eyeTop),
                size = Size(5.4f * s, eyeH),
                cornerRadius = CornerRadius(2.7f * s, 2.7f * s),
            )
            drawRoundRect(
                color = eyeColor,
                topLeft = Offset(36.3f * s, eyeTop),
                size = Size(5.4f * s, eyeH),
                cornerRadius = CornerRadius(2.7f * s, 2.7f * s),
            )
            if (eyeScaleY > 0.5f) {
                drawCircle(color = Color.White.copy(alpha = 0.88f), radius = 1.0f * s, center = Offset(24f * s, 33f * s))
                drawCircle(color = Color.White.copy(alpha = 0.88f), radius = 1.0f * s, center = Offset(38f * s, 33f * s))
            }
        }

        // Warm smile
        val smile = Path().apply {
            moveTo(28.8f * s, 40.8f * s)
            quadraticBezierTo(32f * s, 43.5f * s, 35.2f * s, 40.8f * s)
        }
        drawPath(
            path = smile,
            color = eyeColor.copy(alpha = 0.92f),
            style = Stroke(width = 1.9f * s, cap = StrokeCap.Round),
        )

        // Rosy cheeks
        drawCircle(color = Color(0xFFFDA4AF).copy(alpha = 0.45f), radius = 1.6f * s, center = Offset(19.5f * s, 39.5f * s))
        drawCircle(color = Color(0xFFFDA4AF).copy(alpha = 0.45f), radius = 1.6f * s, center = Offset(44.5f * s, 39.5f * s))
    }
}
