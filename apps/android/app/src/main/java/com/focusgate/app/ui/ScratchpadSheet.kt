package com.focusgate.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * FocusGate 9.0: Quick Scratchpad Sheet for capturing stray thoughts without leaving Focus.
 */
@Composable
fun ScratchpadSheetContent(
    initialText: String,
    isVi: Boolean,
    onSave: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var draft by remember(initialText) { mutableStateOf(initialText) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 14.dp),
    ) {
        Text(
            text = if (isVi) "Sổ nháp nhanh (Scratchpad)" else "Quick Focus Scratchpad",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = if (isVi) {
                "Ghi nhanh ý tưởng lóe lên trong đầu để không bị phân tâm rời phiên tập trung."
            } else {
                "Park stray thoughts here so you stay anchored to your current sprint."
            },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 2.dp),
        )

        Spacer(Modifier.height(12.dp))

        OutlinedTextField(
            value = draft,
            onValueChange = { draft = it },
            minLines = 4,
            maxLines = 8,
            placeholder = {
                Text(
                    if (isVi) "Ghi chú nhanh…" else "Jot down a quick note…",
                )
            },
            modifier = Modifier.fillMaxWidth(),
        )

        Spacer(Modifier.height(12.dp))

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            TextButton(onClick = {
                draft = ""
                onSave("")
            }) {
                Text(if (isVi) "Xóa nháp" else "Clear")
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = onDismiss) {
                    Text(if (isVi) "Đóng" else "Close")
                }
                Button(onClick = {
                    onSave(draft)
                    onDismiss()
                }) {
                    Text(if (isVi) "Lưu nháp" else "Save")
                }
            }
        }
    }
}
