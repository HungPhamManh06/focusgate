package com.focusgate.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

private data class ThemeOption(
    val id: String,
    val titleEn: String,
    val titleVi: String,
    val swatchBg: Color,
    val swatchAccent: Color,
)

private val THEME_OPTIONS = listOf(
    ThemeOption("crimson", "Crimson Editorial", "Giấy Ấm & Đỏ Thẫm", Color(0xFFF7F3F3), Color(0xFFB91C1C)),
    ThemeOption("espresso", "Midnight Espresso", "Espresso Đêm Đỏ", Color(0xFF140D0E), Color(0xFFF87171)),
    ThemeOption("matcha", "Kyoto Matcha", "Trà Đạo Kyoto", Color(0xFFF3F5F0), Color(0xFF2D6A4F)),
    ThemeOption("nordic", "Nordic Slate", "Bắc Âu Tối Giản", Color(0xFFF3F6FA), Color(0xFF2563EB)),
)

/**
 * FocusGate 10.0: Visual 4-Theme Picker BottomSheet for Android.
 */
@Composable
fun ThemePickerSheetContent(
    currentPreset: String,
    isVi: Boolean,
    onSelect: (String) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 14.dp),
    ) {
        Text(
            text = if (isVi) "Chọn Bảng màu FocusGate" else "Choose FocusGate Theme",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = if (isVi) {
                "Đồng bộ giao diện toàn bộ ứng dụng, thẻ nhiệm vụ và màn hình khóa."
            } else {
                "Applies across Home, tasks, Sanctuary, and lock overlays."
            },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 2.dp),
        )

        Spacer(Modifier.height(14.dp))

        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            THEME_OPTIONS.forEach { opt ->
                val selected = currentPreset == opt.id
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        .background(MaterialTheme.colorScheme.surfaceContainerHighest)
                        .border(
                            width = if (selected) 2.dp else 1.dp,
                            color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
                            shape = RoundedCornerShape(16.dp),
                        )
                        .clickable { onSelect(opt.id) }
                        .padding(horizontal = 14.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(34.dp)
                                .clip(CircleShape)
                                .background(opt.swatchBg)
                                .border(2.dp, opt.swatchAccent, CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(12.dp)
                                    .clip(CircleShape)
                                    .background(opt.swatchAccent),
                            )
                        }
                        Text(
                            text = if (isVi) opt.titleVi else opt.titleEn,
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                        )
                    }
                    if (selected) {
                        Text(
                            text = "✓",
                            color = MaterialTheme.colorScheme.primary,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }
        }
        Spacer(Modifier.height(18.dp))
    }
}
