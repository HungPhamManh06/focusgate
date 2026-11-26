package com.focusgate.app.ui

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

@Composable
fun BlockOverlayContent(
    appLabel: String,
    allowEmergency: Boolean = true,
    onBackHome: () -> Unit,
    onOpenFocusGate: () -> Unit,
    onEmergency: () -> Unit,
    onQuickFocus15: (() -> Unit)? = null,
    isVi: Boolean = false,
    planSummary: String = "",
    strictFrictionMode: Boolean = false,
    isBedtimeMode: Boolean = false,
    themePreset: String = "auto",
) {
    var confirmEmergency by remember { mutableStateOf(false) }
    var countdownSeconds by remember { mutableIntStateOf(30) }
    var typedPledge by remember { mutableStateOf("") }
    val requiredPledge = if (isVi) "Toi chon xao nhang" else "I choose distraction"
    val pledgeMatched = !strictFrictionMode ||
        typedPledge.trim().equals(requiredPledge, ignoreCase = true)

    val transition = rememberInfiniteTransition(label = "mindful_breath")
    val breathScale by transition.animateFloat(
        initialValue = 0.78f,
        targetValue = 1.08f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 4000),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "breath_scale",
    )

    LaunchedEffect(confirmEmergency) {
        if (confirmEmergency) {
            countdownSeconds = 30
            while (countdownSeconds > 0) {
                delay(1_000L)
                countdownSeconds -= 1
            }
        }
    }

    val overlayBg = when (themePreset) {
        "matcha" -> listOf(Color(0xFF14241B), Color(0xFF0E1913), Color(0xFF08100B))
        "nordic" -> listOf(Color(0xFF0E1A30), Color(0xFF0A1222), Color(0xFF060B15))
        else -> listOf(Color(0xFF1B0E11), Color(0xFF100A0B), Color(0xFF090607))
    }
    val overlayAccent = when (themePreset) {
        "matcha" -> Color(0xFF74C69D)
        "nordic" -> Color(0xFF60A5FA)
        else -> Color(0xFFF87171)
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(colors = overlayBg),
            ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .windowInsetsPadding(WindowInsets.safeDrawing)
                .padding(horizontal = 28.dp, vertical = 36.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.Start,
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Box(
                    modifier = Modifier.size(46.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Box(
                        modifier = Modifier
                            .size(44.dp)
                            .scale(breathScale)
                            .clip(CircleShape)
                            .background(overlayAccent.copy(alpha = 0.2f))
                            .border(1.5.dp, overlayAccent, CircleShape),
                    )
                    Box(
                        modifier = Modifier
                            .size(12.dp)
                            .clip(CircleShape)
                            .background(overlayAccent),
                    )
                }
                Column {
                    Text(
                        text = "FOCUSGATE",
                        color = Color(0xFFF87171),
                        fontSize = 12.sp,
                        letterSpacing = 1.5.sp,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = if (isVi) "Hít thở chậm 4 giây…" else "Take a 4-second breath…",
                        color = Color(0xFFB4A3A6),
                        fontSize = 12.sp,
                    )
                }
            }

            Text(
                text = if (isVi) "Cổng tập trung đang khóa." else "Focus gate is locked.",
                color = Color(0xFFFAF7F5),
                fontSize = 32.sp,
                lineHeight = 38.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(top = 20.dp, bottom = 12.dp),
            )

            Text(
                text = if (isVi) {
                    "“$appLabel” đang tạm nghỉ để bạn hoàn thành cam kết hôm nay."
                } else {
                    "“$appLabel” is paused while you finish today's Must-do commitments."
                },
                color = Color(0xFFD9CBCD),
                style = MaterialTheme.typography.bodyLarge,
                textAlign = TextAlign.Start,
            )

            if (planSummary.isNotBlank()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 16.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(Color(0xFF1F1416))
                        .border(1.dp, Color(0xFF3A2326), RoundedCornerShape(14.dp))
                        .padding(horizontal = 14.dp, vertical = 12.dp),
                ) {
                    Text(
                        text = planSummary,
                        color = Color(0xFFFAF7F5),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }

            Button(
                onClick = onOpenFocusGate,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 24.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFFB91C1C),
                    contentColor = Color.White,
                ),
            ) {
                Text(
                    if (isVi) "Mở FocusGate & làm nốt việc" else "Open FocusGate & finish tasks",
                    fontWeight = FontWeight.SemiBold,
                )
            }

            if (onQuickFocus15 != null) {
                OutlinedButton(
                    onClick = onQuickFocus15,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 10.dp),
                ) {
                    Text(
                        if (isVi) "⚡ Bắt đầu tập trung ngay 15p" else "⚡ Start 15m Focus Sprint now",
                        color = overlayAccent,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }

            OutlinedButton(
                onClick = onBackHome,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 10.dp),
            ) {
                Text(
                    if (isVi) "Về màn hình chính" else "Back to Home screen",
                    color = Color(0xFFD9CBCD),
                )
            }

            if (confirmEmergency) {
                Surface(
                    color = Color(0xFF211618),
                    shape = MaterialTheme.shapes.medium,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 14.dp),
                ) {
                    Column(Modifier.padding(16.dp)) {
                        if (isBedtimeMode) {
                            Text(
                                text = if (isVi) "🌙 Đang trong Giờ Ngủ (Bedtime Gate)" else "🌙 Bedtime Gate Active",
                                color = Color(0xFFFDE68A),
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(bottom = 6.dp),
                            )
                        }
                        Text(
                            text = if (isVi) "Dùng quyền khẩn cấp 10 phút?" else "Use 10-minute emergency access?",
                            color = Color(0xFFFAF7F5),
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            text = if (strictFrictionMode) {
                                if (isVi) {
                                    "Chế độ Nghiêm khắc: chờ hết 30 giây VÀ gõ chính xác câu \"$requiredPledge\" để xác nhận."
                                } else {
                                    "Strict Friction Mode: wait 30s AND type \"$requiredPledge\" to unlock."
                                }
                            } else if (isVi) {
                                "Chỉ dùng khi thật sự khẩn cấp (tối đa 1 lần/ngày). Chờ hết 30 giây để xác nhận."
                            } else {
                                "Use only for urgent access (max 1/day). Wait 30 seconds to confirm."
                            },
                            color = Color(0xFFB4A3A6),
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(top = 6.dp),
                        )
                        if (strictFrictionMode) {
                            OutlinedTextField(
                                value = typedPledge,
                                onValueChange = { typedPledge = it },
                                singleLine = true,
                                placeholder = {
                                    Text(requiredPledge, color = Color(0xFF7A686B))
                                },
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedTextColor = Color(0xFFFAF7F5),
                                    unfocusedTextColor = Color(0xFFFAF7F5),
                                    focusedBorderColor = Color(0xFFF87171),
                                    unfocusedBorderColor = Color(0xFF4A3438),
                                ),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(top = 10.dp),
                            )
                        }
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 10.dp),
                            horizontalArrangement = Arrangement.End,
                        ) {
                            TextButton(onClick = {
                                confirmEmergency = false
                                typedPledge = ""
                            }) {
                                Text(if (isVi) "Hủy" else "Cancel", color = Color(0xFFD9CBCD))
                            }
                            Button(
                                onClick = {
                                    confirmEmergency = false
                                    typedPledge = ""
                                    onEmergency()
                                },
                                enabled = countdownSeconds == 0 && pledgeMatched,
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = Color(0xFFF87171),
                                    contentColor = Color(0xFF120C0D),
                                ),
                            ) {
                                Text(
                                    if (countdownSeconds > 0) {
                                        if (isVi) "Chờ ${countdownSeconds}s" else "Wait ${countdownSeconds}s"
                                    } else {
                                        if (isVi) "Xác nhận mở 10p" else "Allow 10m"
                                    },
                                )
                            }
                        }
                    }
                }
            } else if (allowEmergency) {
                TextButton(
                    onClick = { confirmEmergency = true },
                    modifier = Modifier.padding(top = 8.dp),
                ) {
                    Text(
                        text = if (isVi) "Truy cập khẩn cấp (10 phút)" else "Emergency access (10 min)",
                        color = Color(0xFF9E8D90),
                    )
                }
            } else {
                Text(
                    text = if (isVi) {
                        "Chế độ nghiêm ngặt đang bật (không thể mở khẩn cấp hôm nay)."
                    } else {
                        "Strict mode active (emergency access unavailable today)."
                    },
                    color = Color(0xFF8C7C7F),
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 12.dp),
                )
            }
        }
    }
}
