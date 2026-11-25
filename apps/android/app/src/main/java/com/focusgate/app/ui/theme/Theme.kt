package com.focusgate.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val FocusGateCrimson = Color(0xFFB91C1C)
val FocusGateCrimsonLight = Color(0xFFF87171)
val FocusGateEmerald = Color(0xFF0D7A58)
val FocusGateEmeraldLight = Color(0xFF34D399)
val FocusGateGold = Color(0xFFD97706)
val FocusGateEspresso = Color(0xFF181113)

private val LightColors = lightColorScheme(
    primary = FocusGateCrimson,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFDEAEA),
    onPrimaryContainer = Color(0xFF5C0E0E),
    secondary = FocusGateEmerald,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFE2F3EC),
    onSecondaryContainer = Color(0xFF06422F),
    tertiary = FocusGateGold,
    background = Color(0xFFF7F3F3),
    onBackground = Color(0xFF181213),
    surface = Color.White,
    onSurface = Color(0xFF181213),
    surfaceVariant = Color(0xFFF1E9E9),
    onSurfaceVariant = Color(0xFF625355),
    outline = Color(0xFFE8DEDE),
)

private val DarkColors = darkColorScheme(
    primary = FocusGateCrimsonLight,
    onPrimary = Color(0xFF28090B),
    primaryContainer = Color(0xFF3A1619),
    onPrimaryContainer = Color(0xFFFEE2E2),
    secondary = FocusGateEmeraldLight,
    onSecondary = Color(0xFF05291E),
    secondaryContainer = Color(0xFF102A22),
    onSecondaryContainer = Color(0xFFA7F3D0),
    tertiary = Color(0xFFE2A552),
    background = Color(0xFF100B0C),
    onBackground = Color(0xFFF5EEEE),
    surface = Color(0xFF181113),
    onSurface = Color(0xFFF5EEEE),
    surfaceVariant = Color(0xFF241A1C),
    onSurfaceVariant = Color(0xFFB4A3A6),
    outline = Color(0xFF352629),
)

@Composable
fun FocusGateTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (isSystemInDarkTheme()) DarkColors else LightColors,
        content = content,
    )
}
