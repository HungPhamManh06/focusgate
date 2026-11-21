package com.focusgate.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightColors = lightColorScheme(
    primary = Color(0xFF2F6FED),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFDDE7FF),
    onPrimaryContainer = Color(0xFF0B1B3A),
    background = Color(0xFFF7F8FA),
    surface = Color.White,
    onSurface = Color(0xFF14181F),
    surfaceVariant = Color(0xFFEEF1F6),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF7AA2F7),
    onPrimary = Color(0xFF0B1220),
    primaryContainer = Color(0xFF1E2B47),
    onPrimaryContainer = Color(0xFFDCE6FF),
    background = Color(0xFF0F1117),
    surface = Color(0xFF171A21),
    onSurface = Color(0xFFEDEFF4),
    surfaceVariant = Color(0xFF232833),
)

@Composable
fun FocusGateTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (isSystemInDarkTheme()) DarkColors else LightColors,
        content = content,
    )
}
