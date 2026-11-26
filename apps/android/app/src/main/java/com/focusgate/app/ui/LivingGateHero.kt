package com.focusgate.app.ui

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.focusgate.app.ui.theme.FocusGateCrimsonLight
import com.focusgate.app.ui.theme.FocusGateEmerald
import com.focusgate.app.ui.theme.FocusGateEmeraldLight
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

@Composable
fun LivingGateHero(
    planStatus: String?,
    mustDoCompleted: Int,
    mustDoTotal: Int,
    unlocked: Boolean,
    earnedMinutes: Int,
    isVi: Boolean,
    onAddTask: () -> Unit,
    onSync: () -> Unit,
    syncBusy: Boolean,
    themePreset: String = "auto",
    strictMode: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val isOpen = unlocked || planStatus == "completed"
    val haptic = LocalHapticFeedback.current
    val targetProgress = when {
        isOpen -> 1f
        mustDoTotal > 0 -> (mustDoCompleted.toFloat() / mustDoTotal.toFloat()).coerceIn(0f, 1f)
        else -> 0f
    }
    val animatedProgress by animateFloatAsState(
        targetValue = targetProgress,
        animationSpec = tween(durationMillis = 650, easing = FastOutSlowInEasing),
        label = "gate_arch_progress",
    )
    val accentColor = when {
        isOpen -> FocusGateEmeraldLight
        themePreset == "matcha" -> Color(0xFF74C69D)
        themePreset == "nordic" -> Color(0xFF60A5FA)
        else -> FocusGateCrimsonLight
    }
    val bgBrush = when {
        isOpen -> Brush.verticalGradient(listOf(Color(0xFF0E261F), Color(0xFF131A18)))
        themePreset == "matcha" -> Brush.verticalGradient(listOf(Color(0xFF1A2E22), Color(0xFF121E17)))
        themePreset == "nordic" -> Brush.verticalGradient(listOf(Color(0xFF111C33), Color(0xFF0B1221)))
        else -> Brush.verticalGradient(listOf(Color(0xFF281417), Color(0xFF140D0F)))
    }
    val borderColor = if (isOpen) FocusGateEmerald.copy(alpha = 0.55f) else accentColor.copy(alpha = 0.35f)
    val ctaColor = when {
        isOpen -> FocusGateEmerald
        themePreset == "matcha" -> Color(0xFF3F6A49)
        themePreset == "nordic" -> Color(0xFF2563EB)
        else -> Color(0xFFB91C1C)
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp)
            .clip(RoundedCornerShape(24.dp))
            .background(bgBrush)
            .border(1.dp, borderColor, RoundedCornerShape(24.dp))
            .padding(20.dp),
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // FocusGate Arch Canvas
            Box(
                modifier = Modifier.size(104.dp),
                contentAlignment = Alignment.Center,
            ) {
                Canvas(modifier = Modifier.size(104.dp)) {
                    val w = size.width
                    val h = size.height
                    val padX = w * 0.16f
                    val archW = w - padX * 2f
                    val radius = archW / 2f
                    val centerX = w / 2f
                    val archCenterY = h * 0.46f
                    val bottomY = h * 0.88f

                    // Glow
                    drawCircle(
                        color = accentColor.copy(alpha = 0.18f),
                        radius = radius * 1.05f,
                        center = Offset(centerX, archCenterY),
                    )

                    // Outer arch track
                    val trackPath = Path().apply {
                        moveTo(padX, bottomY)
                        lineTo(padX, archCenterY)
                        arcTo(
                            rect = androidx.compose.ui.geometry.Rect(
                                Offset(padX, archCenterY - radius),
                                Size(archW, archW),
                            ),
                            startAngleDegrees = 180f,
                            sweepAngleDegrees = 180f,
                            forceMoveTo = false,
                        )
                        lineTo(w - padX, bottomY)
                    }
                    drawPath(
                        path = trackPath,
                        color = Color.White.copy(alpha = 0.16f),
                        style = Stroke(width = 7f, cap = StrokeCap.Round),
                    )

                    if (animatedProgress > 0.01f) {
                        drawArc(
                            color = accentColor,
                            startAngle = 180f,
                            sweepAngle = 180f * animatedProgress,
                            useCenter = false,
                            topLeft = Offset(padX, archCenterY - radius),
                            size = Size(archW, archW),
                            style = Stroke(width = 7.5f, cap = StrokeCap.Round),
                        )
                    }

                    // Ground threshold
                    drawLine(
                        color = if (isOpen) FocusGateEmeraldLight else Color.White.copy(alpha = 0.35f),
                        start = Offset(w * 0.1f, bottomY),
                        end = Offset(w * 0.9f, bottomY),
                        strokeWidth = 4f,
                        cap = StrokeCap.Round,
                    )

                    // Keystone dot
                    drawCircle(
                        color = accentColor,
                        radius = 5f,
                        center = Offset(centerX, archCenterY - radius * 0.56f),
                    )

                    // Individual Must-do lock pins along upper arch
                    val pinCount = mustDoTotal.coerceIn(0, 8)
                    val litCount = if (mustDoTotal > 0) {
                        ((mustDoCompleted.toFloat() / mustDoTotal.toFloat()) * pinCount).toInt()
                    } else 0
                    for (i in 0 until pinCount) {
                        val t = if (pinCount == 1) 0.5f else i.toFloat() / (pinCount - 1).toFloat()
                        val angleRad = (180.0 - t * 180.0) * PI / 180.0
                        val cx = centerX + (cos(angleRad) * radius).toFloat()
                        val cy = archCenterY - (sin(angleRad) * radius).toFloat()
                        val lit = isOpen || i < litCount
                        drawCircle(
                            color = if (lit) {
                                if (isOpen) FocusGateEmeraldLight else Color(0xFFFBBF24)
                            } else {
                                Color(0xFF3E2225)
                            },
                            radius = if (lit) 5.5f else 4f,
                            center = Offset(cx, cy),
                        )
                    }
                }

                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(top = 18.dp),
                ) {
                    Text(
                        text = if (mustDoTotal > 0) "$mustDoCompleted/$mustDoTotal" else if (isOpen) "✓" else "0",
                        color = Color(0xFFFAF7F5),
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = if (isOpen) {
                            if (isVi) "ĐÃ MỞ" else "OPEN"
                        } else {
                            if (isVi) "BẮT BUỘC" else "MUST-DO"
                        },
                        color = accentColor,
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }

            // Right copy + quick actions
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = if (isOpen) {
                        if (isVi) "Cổng đã mở khóa" else "Gate Unlocked"
                    } else {
                        if (isVi) "Cổng đang bảo vệ" else "Focus Gate Active"
                    },
                    color = accentColor,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    text = if (isOpen) {
                        if (isVi) "Bạn có thể giải trí thoải mái." else "Enjoy your earned freedom."
                    } else if (mustDoTotal > 0) {
                        val left = (mustDoTotal - mustDoCompleted).coerceAtLeast(0)
                        if (isVi) "Còn $left việc Bắt buộc để mở khóa." else "$left Must-do left to unlock."
                    } else {
                        if (isVi) "Thêm việc để dựng cổng hôm nay." else "Add tasks to build today's gate."
                    },
                    color = Color(0xFFFAF7F5),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = if (isVi) "Tích lũy: ${earnedMinutes}p" else "Earned time: ${earnedMinutes}m",
                    color = Color(0xFFB4A3A6),
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
        Spacer(Modifier.height(14.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Button(
                onClick = {
                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    onAddTask()
                },
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.buttonColors(
                    containerColor = ctaColor,
                    contentColor = Color.White,
                ),
            ) {
                Text(
                    if (isVi) "+ Thêm việc" else "+ Add task",
                    maxLines = 1,
                    softWrap = false,
                )
            }
            OutlinedButton(
                onClick = {
                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    onSync()
                },
                enabled = !syncBusy,
                modifier = Modifier.weight(1f),
            ) {
                Text(
                    if (syncBusy) "..." else if (isVi) "Đồng bộ" else "Sync",
                    color = Color(0xFFFAF7F5),
                    maxLines = 1,
                    softWrap = false,
                )
            }
        }
        }
    }
}
