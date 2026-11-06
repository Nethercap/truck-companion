package com.trucksimdash.app.ui

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Cabina de noche: fondo casi negro, y el color solo para lo que hay que ver. */
object Paleta {
    val Fondo = Color(0xFF0D0F12) // el de la web y el icono
    val Superficie = Color(0xFF151A20)
    val SuperficieAlta = Color(0xFF1E252D)
    val Borde = Color(0xFF2A323C)
    val Texto = Color(0xFFE8ECF1)
    val TextoSuave = Color(0xFF9AA4B2)
    val TextoApagado = Color(0xFF6B7683)
    val Acento = Color(0xFF3B9EFF) // el azul de la ruta en el mapa
    val Ambar = Color(0xFFFFB020)
    val Rojo = Color(0xFFFF5A5F)
    val Verde = Color(0xFF2AD3A4)
}

private val esquema = darkColorScheme(
    primary = Paleta.Acento,
    onPrimary = Color(0xFF04121F),
    primaryContainer = Color(0xFF12324F),
    onPrimaryContainer = Color(0xFFD3E8FF),
    secondary = Paleta.TextoSuave,
    onSecondary = Paleta.Fondo,
    secondaryContainer = Paleta.SuperficieAlta,
    onSecondaryContainer = Paleta.Texto,
    tertiary = Paleta.Verde,
    background = Paleta.Fondo,
    onBackground = Paleta.Texto,
    surface = Paleta.Fondo,
    onSurface = Paleta.Texto,
    // Distinta de Superficie a proposito: contentColorFor busca el primero que
    // coincida, y con el mismo color todo el texto de una tarjeta salia apagado.
    surfaceVariant = Color(0xFF1A2027),
    onSurfaceVariant = Paleta.TextoSuave,
    surfaceContainerLowest = Paleta.Fondo,
    surfaceContainerLow = Paleta.Superficie,
    surfaceContainer = Paleta.Superficie,
    surfaceContainerHigh = Paleta.SuperficieAlta,
    surfaceContainerHighest = Paleta.SuperficieAlta,
    outline = Paleta.Borde,
    outlineVariant = Paleta.Borde,
    error = Paleta.Rojo,
    onError = Color(0xFF2A0606),
)

private val tipografia = Typography(
    headlineMedium = TextStyle(fontSize = 26.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.3).sp),
    titleLarge = TextStyle(fontSize = 20.sp, fontWeight = FontWeight.SemiBold),
    titleMedium = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 15.sp, lineHeight = 22.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontSize = 12.sp, lineHeight = 16.sp),
    labelLarge = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.Medium),
    labelMedium = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.2.sp),
    labelSmall = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.3.sp),
)

private val formas = Shapes(
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(14.dp),
    large = RoundedCornerShape(18.dp),
)

/** Numeros que no bailan al cambiar: todos los digitos del mismo ancho. */
val NumerosTabulares = TextStyle(fontFeatureSettings = "tnum")

@Composable
fun TemaTruckDash(contenido: @Composable () -> Unit) {
    MaterialTheme(colorScheme = esquema, typography = tipografia, shapes = formas, content = contenido)
}
