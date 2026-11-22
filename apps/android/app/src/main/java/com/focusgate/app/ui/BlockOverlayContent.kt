package com.focusgate.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.focusgate.app.R

@Composable
fun BlockOverlayContent(
    appLabel: String,
    onBackHome: () -> Unit,
    onOpenFocusGate: () -> Unit,
    onEmergency: () -> Unit,
) {
    var confirmEmergency by remember { mutableStateOf(false) }

    Surface(color = Color(0xFF0F1117), modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .windowInsetsPadding(WindowInsets.safeDrawing)
                .padding(horizontal = 28.dp, vertical = 40.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.Start,
        ) {
            Text(
                text = "FOCUSGATE",
                color = Color(0xFF7AA2F7),
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
            )

            Text(
                text = stringResource(R.string.blocked_title),
                color = Color(0xFFEDEFF4),
                fontSize = 34.sp,
                lineHeight = 40.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(top = 18.dp, bottom = 14.dp),
            )

            Text(
                text = stringResource(R.string.blocked_body, appLabel),
                color = Color(0xFFB6BFCE),
                style = MaterialTheme.typography.bodyLarge,
                textAlign = TextAlign.Start,
            )

            Button(
                onClick = onBackHome,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 28.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFF7AA2F7),
                    contentColor = Color(0xFF0F1117),
                ),
            ) {
                Text(stringResource(R.string.blocked_back_home), fontWeight = FontWeight.SemiBold)
            }

            if (confirmEmergency) {
                Surface(
                    color = Color(0xFF1B2029),
                    shape = MaterialTheme.shapes.medium,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 14.dp),
                ) {
                    Column(Modifier.padding(16.dp)) {
                        Text(
                            text = stringResource(R.string.blocked_emergency_confirm_title),
                            color = Color(0xFFEDEFF4),
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            text = stringResource(R.string.blocked_emergency_confirm_body),
                            color = Color(0xFFB6BFCE),
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(top = 6.dp),
                        )
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 10.dp),
                            horizontalArrangement = Arrangement.End,
                        ) {
                            TextButton(onClick = { confirmEmergency = false }) {
                                Text(stringResource(R.string.blocked_cancel))
                            }
                            Button(
                                onClick = {
                                    confirmEmergency = false
                                    onEmergency()
                                },
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = Color(0xFF7AA2F7),
                                    contentColor = Color(0xFF0F1117),
                                ),
                            ) {
                                Text(stringResource(R.string.blocked_emergency_confirm_action))
                            }
                        }
                    }
                }
            } else {
                OutlinedButton(
                    onClick = { confirmEmergency = true },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 10.dp),
                ) {
                    Text(
                        text = stringResource(R.string.blocked_emergency),
                        color = Color(0xFFB6BFCE),
                    )
                }
            }

            TextButton(
                onClick = onOpenFocusGate,
                modifier = Modifier.padding(top = 2.dp),
            ) {
                Text(
                    text = stringResource(R.string.blocked_open_focusgate),
                    color = Color(0xFF8C94A5),
                )
            }

            Text(
                text = stringResource(R.string.blocked_honesty_note),
                color = Color(0xFF6C7484),
                fontSize = 12.sp,
                modifier = Modifier.padding(top = 22.dp),
            )
        }
    }
}
