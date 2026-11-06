package com.trucksimdash.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.TurnLeft
import androidx.compose.material.icons.filled.TurnRight
import androidx.compose.material.icons.filled.ForkLeft
import androidx.compose.material.icons.filled.ForkRight
import androidx.compose.material.icons.filled.RoundaboutLeft
import androidx.compose.material.icons.filled.RoundaboutRight
import androidx.compose.material.icons.filled.Straight
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.trucksimdash.app.nav.CarrilNav
import com.trucksimdash.app.nav.EstadoNav
import com.trucksimdash.app.nav.GiroNav
import com.trucksimdash.app.nav.Maniobra
import com.trucksimdash.app.nav.TrazoCarril

internal fun iconoDe(m: Maniobra): ImageVector = when (m) {
    Maniobra.Derecho -> Icons.Filled.Straight
    Maniobra.GiroIzquierda -> Icons.Filled.TurnLeft
    Maniobra.GiroDerecha -> Icons.Filled.TurnRight
    Maniobra.ForkIzquierda -> Icons.Filled.ForkLeft
    Maniobra.ForkDerecha -> Icons.Filled.ForkRight
    Maniobra.RotondaHoraria -> Icons.Filled.RoundaboutRight
    Maniobra.RotondaAntihoraria -> Icons.Filled.RoundaboutLeft
}

/**
 * Las flechas de carril, con los dibujos de la web (LANE_PATHS). Las que sirven, con fondo; en
 * esas, la direccion del giro en blanco y las demas apagadas (lanesHtml en pure.js). Es un apoyo
 * al texto, que ya lo dice: el lector de pantalla no lo lee, igual que en la web.
 */
@Composable
fun FilaCarriles(carriles: List<CarrilNav>, trazos: Map<String, TrazoCarril>, modifier: Modifier = Modifier) {
    if (carriles.isEmpty() || trazos.isEmpty()) return
    val caminos = remember(trazos) {
        trazos.mapValues { (_, t) ->
            val punta = Path().apply {
                t.punta.forEachIndexed { i, (x, y) -> if (i == 0) moveTo(x, y) else lineTo(x, y) }
                close()
            }
            PathParser().parsePathString(t.camino).toPath() to punta
        }
    }
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        carriles.forEach { carril ->
            Canvas(
                Modifier
                    .size(26.dp, 32.dp)
                    .clip(RoundedCornerShape(5.dp))
                    .background(if (carril.sirve) Color(0xFF2B3A4A) else Color.Transparent),
            ) {
                val escala = minOf(size.width / 24f, size.height / 30f)
                val desdeX = (size.width - 24f * escala) / 2
                val desdeY = (size.height - 30f * escala) / 2
                // La del giro al final, para que quede arriba de las otras.
                val orden = carril.direcciones.sortedBy { it == carril.direccionGiro }
                scale(escala, escala, pivot = Offset.Zero) {
                    translate(desdeX / escala, desdeY / escala) {
                        for (d in orden) {
                            val (linea, punta) = caminos[d] ?: continue
                            val color = when {
                                !carril.sirve -> Color(0xFF4D545E)
                                d == carril.direccionGiro -> Color.White
                                else -> Color(0xFF8A93A0)
                            }
                            drawPath(linea, color, style = Stroke(2.6f, cap = StrokeCap.Round, join = StrokeJoin.Round))
                            drawPath(punta, color)
                        }
                    }
                }
            }
        }
    }
}

/** La indicacion: lo mas grande de la pantalla mientras se maneja. */
@Composable
fun PanelGiro(
    giro: GiroNav,
    carriles: List<CarrilNav>,
    trazos: Map<String, TrazoCarril>,
    proximaCiudad: String?,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large,
        color = Paleta.Fondo.copy(alpha = 0.94f),
        border = BorderStroke(1.dp, Paleta.Borde),
    ) {
        Row(Modifier.padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(
                iconoDe(giro.maniobra),
                null,
                tint = if (giro.maniobra == Maniobra.Derecho) Paleta.TextoSuave else Paleta.Acento,
                modifier = Modifier.size(44.dp),
            )
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    giro.texto,
                    style = MaterialTheme.typography.titleLarge.merge(NumerosTabulares),
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                if (carriles.isNotEmpty()) {
                    Spacer(Modifier.height(6.dp))
                    FilaCarriles(carriles, trazos)
                }
                if (!proximaCiudad.isNullOrBlank()) {
                    Text(
                        proximaCiudad,
                        style = MaterialTheme.typography.bodySmall,
                        color = Paleta.TextoSuave,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }
            }
        }
    }
}

/** En el tablero: el giro de un vistazo, sin cambiar de pantalla. */
@Composable
fun TarjetaNav(nav: EstadoNav, trazos: Map<String, TrazoCarril>, modifier: Modifier = Modifier) {
    val giro = nav.giro ?: return
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PanelGiro(giro, nav.carriles, trazos, null)
        nav.resumen?.let { r ->
            if (r.falta != null) {
                Tarjeta {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(r.falta, style = MaterialTheme.typography.titleMedium.merge(NumerosTabulares))
                        r.duracion?.let { Text(it, style = MaterialTheme.typography.titleMedium.merge(NumerosTabulares)) }
                        r.llegada?.let { Text(it, style = MaterialTheme.typography.titleMedium.merge(NumerosTabulares)) }
                    }
                    Spacer(Modifier.height(6.dp))
                    BarraNivel((r.porcentaje / 100).toFloat(), Paleta.Acento, alto = 4)
                }
            }
        }
    }
}
