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

private val CrimsonLightColors = lightColorScheme(
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
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color(0xFFFAF6F6),
    surfaceContainer = Color(0xFFF3ECEC),
    surfaceContainerHigh = Color(0xFFEEE5E5),
    surfaceContainerHighest = Color(0xFFEBE1E1),
    outline = Color(0xFFE8DEDE),
)

private val EspressoDarkColors = darkColorScheme(
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
    surfaceContainerLowest = Color(0xFF0C0809),
    surfaceContainerLow = Color(0xFF171012),
    surfaceContainer = Color(0xFF1E1517),
    surfaceContainerHigh = Color(0xFF251B1D),
    surfaceContainerHighest = Color(0xFF2C2023),
    outline = Color(0xFF352629),
)

private val KyotoMatchaColors = lightColorScheme(
    primary = Color(0xFF3F6A49),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE1EFE4),
    onPrimaryContainer = Color(0xFF1B3A23),
    secondary = Color(0xFF2F6F4E),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFDDF0E5),
    onSecondaryContainer = Color(0xFF0F3B26),
    tertiary = Color(0xFFB07524),
    background = Color(0xFFF4F3EC),
    onBackground = Color(0xFF1C241D),
    surface = Color(0xFFFAF9F4),
    onSurface = Color(0xFF1C241D),
    surfaceVariant = Color(0xFFEBECE2),
    onSurfaceVariant = Color(0xFF58665A),
    surfaceContainerLowest = Color(0xFFFCFBF7),
    surfaceContainerLow = Color(0xFFF5F4ED),
    surfaceContainer = Color(0xFFEFEEE5),
    surfaceContainerHigh = Color(0xFFE9E9DF),
    surfaceContainerHighest = Color(0xFFE4E6DA),
    outline = Color(0xFFDCE0D5),
)

private val NordicSlateColors = darkColorScheme(
    primary = Color(0xFF60A5FA),
    onPrimary = Color(0xFF0B1628),
    primaryContainer = Color(0xFF1E3252),
    onPrimaryContainer = Color(0xFFDBEAFE),
    secondary = Color(0xFF34D399),
    onSecondary = Color(0xFF05291E),
    secondaryContainer = Color(0xFF0F2D24),
    onSecondaryContainer = Color(0xFFA7F3D0),
    tertiary = Color(0xFFFBBF24),
    background = Color(0xFF0B1120),
    onBackground = Color(0xFFF1F5F9),
    surface = Color(0xFF11192C),
    onSurface = Color(0xFFF1F5F9),
    surfaceVariant = Color(0xFF1A2540),
    onSurfaceVariant = Color(0xFF94A3B8),
    surfaceContainerLowest = Color(0xFF080D19),
    surfaceContainerLow = Color(0xFF10182A),
    surfaceContainer = Color(0xFF162036),
    surfaceContainerHigh = Color(0xFF1C2843),
    surfaceContainerHighest = Color(0xFF223050),
    outline = Color(0xFF273452),
)

@Composable
fun FocusGateTheme(
    preset: String = "auto",
    content: @Composable () -> Unit,
) {
    val scheme = when (preset) {
        "crimson" -> CrimsonLightColors
        "espresso" -> EspressoDarkColors
        "matcha" -> KyotoMatchaColors
        "nordic" -> NordicSlateColors
        else -> if (isSystemInDarkTheme()) EspressoDarkColors else CrimsonLightColors
    }
    MaterialTheme(
        colorScheme = scheme,
        content = content,
    )
}
