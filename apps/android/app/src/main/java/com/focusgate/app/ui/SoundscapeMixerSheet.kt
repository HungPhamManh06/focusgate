package com.focusgate.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.focusgate.app.util.SoundscapeMode

/**
 * FocusGate 8.0: Ambient Soundscape Mini-Mixer Sheet for Android.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SoundscapeMixerSheetContent(
    isPlaying: Boolean,
    activeMode: SoundscapeMode,
    isVi: Boolean,
    onSelectMode: (SoundscapeMode) -> Unit,
    onTogglePlay: () -> Unit,
) {
    val haptic = LocalHapticFeedback.current

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 14.dp),
    ) {
        Text(
            text = if (isVi) "Bộ trộn Âm thanh Tập trung" else "Ambient Soundscape Mixer",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = if (isVi) {
                "Chọn âm thanh nền giúp giữ nhịp tập trung sâu không gián đoạn."
            } else {
                "Choose a calm acoustic backdrop to sustain deep focus."
            },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 2.dp),
        )

        Spacer(Modifier.height(14.dp))

        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            SoundscapeMode.entries.forEach { mode ->
                FilterChip(
                    selected = activeMode == mode,
                    onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        onSelectMode(mode)
                    },
                    label = { Text(if (isVi) mode.labelVi else mode.labelEn) },
                )
            }
        }

        Spacer(Modifier.height(18.dp))

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (isPlaying) {
                OutlinedButton(
                    onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        onTogglePlay()
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(if (isVi) "Dừng phát âm thanh" else "Stop Soundscape")
                }
            } else {
                Button(
                    onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        onTogglePlay()
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        if (isVi) "▶ Phát ${activeMode.labelVi}" else "▶ Play ${activeMode.labelEn}",
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
    }
}
