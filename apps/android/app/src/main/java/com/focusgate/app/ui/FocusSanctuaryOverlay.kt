package com.focusgate.app.ui

import android.app.Activity
import android.view.WindowManager
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.delay

@Composable
fun FocusSanctuaryOverlay(
    taskTitle: String,
    endsAtEpochMs: Long,
    totalDurationMs: Long = 25 * 60_000L,
    themePreset: String = "espresso",
    isVi: Boolean = false,
    onComplete: () -> Unit,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val haptic = LocalHapticFeedback.current
    var nowMs by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var breathingMode by remember { mutableStateOf(false) }

    DisposableEffect(Unit) {
        val window = (context as? Activity)?.window
        window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        onDispose {
            window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    LaunchedEffect(endsAtEpochMs) {
        while (true) {
            nowMs = System.currentTimeMillis()
            delay(1_000L)
        }
    }

    val remainingMs = (endsAtEpochMs - nowMs).coerceAtLeast(0L)
    val totalSec = (remainingMs / 1000L).toInt()
    val mm = totalSec / 60
    val ss = totalSec % 60
    val progress = if (totalDurationMs > 0L) {
        (1f - remainingMs.toFloat() / totalDurationMs.toFloat()).coerceIn(0f, 1f)
    } else {
        0f
    }

    val bgStops = when (themePreset) {
        "matcha" -> listOf(Color(0xFF102218), Color(0xFF0A1610), Color(0xFF060D09))
        "nordic" -> listOf(Color(0xFF0C182D), Color(0xFF08101E), Color(0xFF040812))
        else -> listOf(Color(0xFF1C0E11), Color(0xFF110A0C), Color(0xFF080506))
    }
    val accent = when (themePreset) {
        "matcha" -> Color(0xFF74C69D)
        "nordic" -> Color(0xFF60A5FA)
        else -> Color(0xFFF87171)
    }

    val infiniteTransition = rememberInfiniteTransition(label = "sanctuary_breath")
    val breathScale by infiniteTransition.animateFloat(
        initialValue = 0.72f,
        targetValue = 1.12f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 4000),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "sanctuary_breath_scale",
    )

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = false,
        ),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Brush.verticalGradient(bgStops))
                .windowInsetsPadding(WindowInsets.safeDrawing)
                .padding(horizontal = 24.dp, vertical = 20.dp),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .align(Alignment.TopCenter),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = if (isVi) "BUỒNG LÁI TẬP TRUNG" else "FOCUS SANCTUARY",
                    color = accent,
                    fontSize = 11.sp,
                    letterSpacing = 1.6.sp,
                    fontWeight = FontWeight.Bold,
                )
                TextButton(onClick = onDismiss) {
                    Text(if (isVi) "Thu nhỏ" else "Minimize", color = Color(0xFFD9CBCD))
                }
            }

            Column(
                modifier = Modifier.align(Alignment.Center),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(
                    modifier = Modifier.size(240.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    if (breathingMode) {
                        Box(
                            modifier = Modifier
                                .size(190.dp)
                                .scale(breathScale)
                                .clip(CircleShape)
                                .background(accent.copy(alpha = 0.18f))
                                .border(2.dp, accent.copy(alpha = 0.7f), CircleShape),
                        )
                    }
                    Canvas(modifier = Modifier.fillMaxSize()) {
                        val stroke = Stroke(width = 12.dp.toPx(), cap = StrokeCap.Round)
                        drawArc(
                            color = Color.White.copy(alpha = 0.12f),
                            startAngle = -90f,
                            sweepAngle = 360f,
                            useCenter = false,
                            style = stroke,
                        )
                        drawArc(
                            color = accent,
                            startAngle = -90f,
                            sweepAngle = 360f * progress,
                            useCenter = false,
                            style = stroke,
                        )
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = "%02d:%02d".format(mm, ss),
                            color = Color(0xFFFAF7F5),
                            fontSize = 52.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = (-1).sp,
                        )
                        Text(
                            text = if (breathingMode) {
                                if (isVi) "Hít vào 4s · Thở ra 4s" else "Inhale 4s · Exhale 4s"
                            } else {
                                if (isVi) "Màn hình luôn sáng" else "Screen stays awake"
                            },
                            color = Color(0xFFB4A3A6),
                            fontSize = 12.sp,
                        )
                    }
                }

                Spacer(Modifier.height(24.dp))

                Text(
                    text = taskTitle,
                    color = Color(0xFFFAF7F5),
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(horizontal = 12.dp),
                )

                Spacer(Modifier.height(28.dp))

                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    OutlinedButton(
                        onClick = {
                            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                            breathingMode = !breathingMode
                        },
                        shape = RoundedCornerShape(999.dp),
                    ) {
                        Text(
                            text = if (breathingMode) {
                                if (isVi) "Tắt nhịp thở" else "Stop Breathing"
                            } else {
                                if (isVi) "Nhịp thở 4-4-4" else "4-4-4 Breath"
                            },
                            color = Color(0xFFFAF7F5),
                        )
                    }
                    Button(
                        onClick = {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            onComplete()
                        },
                        shape = RoundedCornerShape(999.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = accent,
                            contentColor = Color(0xFF120C0D),
                        ),
                    ) {
                        Text(
                            text = if (isVi) "Hoàn thành phiên" else "Complete Sprint",
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }
        }
    }
}
