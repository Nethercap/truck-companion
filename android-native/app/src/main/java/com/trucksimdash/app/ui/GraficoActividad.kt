package com.trucksimdash.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.Arrangement
import com.trucksimdash.app.R
import com.trucksimdash.app.core.distancia
import com.trucksimdash.app.core.fechaCorta
import com.trucksimdash.app.cuenta.BarraDia
import kotlin.math.ceil
import kotlin.math.max

/**
 * Lo manejado por dia. Una sola serie: barras finas de un color, ancladas abajo, con la
 * punta redondeada y 2 dp de aire entre ellas. Sin leyenda (el titulo la nombra) y sin un
 * numero en cada barra: tocar una muestra su dia.
 */
@Composable
fun GraficoActividad(barras: List<BarraDia>, millas: Boolean, modifier: Modifier = Modifier) {
    var tocada by remember(barras) { mutableStateOf<Int?>(null) }
    val maximo = max(1.0, barras.maxOfOrNull { it.km } ?: 1.0)
    val total = barras.sumOf { it.km }
    val resumen = distancia(total, millas)

    Column(modifier) {
        val elegida = tocada?.let(barras::getOrNull)
        Text(
            if (elegida != null) fechaCorta(elegida.fecha) + " · " + distancia(elegida.km, millas) else resumen,
            style = MaterialTheme.typography.titleMedium.merge(NumerosTabulares),
        )
        Text(
            if (elegida != null) {
                pluralStringResource(R.plurals.stats_entregas_dia, elegida.viajes, elegida.viajes)
            } else {
                pluralStringResource(R.plurals.stats_ultimos_dias, barras.size, barras.size)
            },
            style = MaterialTheme.typography.bodySmall,
            color = Paleta.TextoSuave,
        )
        Spacer(Modifier.height(10.dp))
        val descripcion = pluralStringResource(R.plurals.stats_ultimos_dias, barras.size, barras.size) + ": " + resumen
        Canvas(
            Modifier
                .fillMaxWidth()
                .height(110.dp)
                .semantics { contentDescription = descripcion }
                .pointerInput(barras) {
                    detectTapGestures { p ->
                        val i = (p.x / size.width * barras.size).toInt().coerceIn(0, barras.lastIndex)
                        tocada = if (tocada == i) null else i
                    }
                },
        ) {
            val separacion = 2.dp.toPx()
            val anchoBarra = (size.width - separacion * (barras.size - 1)) / barras.size
            val radio = minOf(anchoBarra / 2, 4.dp.toPx())
            // Rejilla apenas visible: arriba y a la mitad, y la base.
            for (f in listOf(0f, 0.5f, 1f)) {
                drawLine(Paleta.Borde, Offset(0f, size.height * f), Offset(size.width, size.height * f), strokeWidth = 1f)
            }
            barras.forEachIndexed { i, b ->
                if (b.km <= 0) return@forEachIndexed
                val alto = max(radio, (b.km / maximo * size.height).toFloat())
                val x = i * (anchoBarra + separacion)
                val y = size.height - alto
                val forma = Path().apply {
                    addRoundRect(
                        RoundRect(
                            left = x,
                            top = y,
                            right = x + anchoBarra,
                            bottom = size.height,
                            topLeftCornerRadius = CornerRadius(radio),
                            topRightCornerRadius = CornerRadius(radio),
                        ),
                    )
                }
                val hayOtra = tocada != null && tocada != i
                drawPath(forma, if (hayOtra) Paleta.Acento.copy(alpha = 0.35f) else Paleta.Acento)
            }
            val t = tocada
            if (t != null) {
                val x = t * (anchoBarra + separacion) + anchoBarra / 2
                drawLine(Paleta.TextoApagado, Offset(x, 0f), Offset(x, size.height), strokeWidth = 1f)
            }
        }
        Spacer(Modifier.height(4.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(barras.firstOrNull()?.let { fechaCorta(it.fecha) } ?: "", style = MaterialTheme.typography.labelSmall, color = Paleta.TextoApagado)
            Text(
                distancia(ceil(maximo), millas) + " max",
                style = MaterialTheme.typography.labelSmall.merge(NumerosTabulares),
                color = Paleta.TextoApagado,
            )
            Text(barras.lastOrNull()?.let { fechaCorta(it.fecha) } ?: "", style = MaterialTheme.typography.labelSmall, color = Paleta.TextoApagado)
        }
    }
}
