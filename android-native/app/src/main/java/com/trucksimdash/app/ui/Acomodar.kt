package com.trucksimdash.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.trucksimdash.app.core.PosBloque
import com.trucksimdash.app.core.anclaDe
import com.trucksimdash.app.core.escalaPara
import com.trucksimdash.app.core.esquinaDe
import androidx.compose.foundation.layout.offset

/**
 * Un bloque del mapa que se puede mover y agrandar ("Mover los botones", el modo acomodar de la
 * web). Sin posicion guardada va donde siempre (porDefecto); con una, contra los bordes que dice.
 * Acomodando: arrastrarlo lo mueve y la esquina de abajo a la derecha le cambia el tamano. Lo
 * nuevo se guarda al soltar (alCambiar); mientras tanto se ve sin escribir nada.
 */
@Composable
internal fun BoxScope.Acomodable(
    pos: PosBloque?,
    area: IntSize,
    acomodando: Boolean,
    porDefecto: Modifier,
    movido: Modifier = Modifier,
    alCambiar: (PosBloque) -> Unit,
    contenido: @Composable () -> Unit,
) {
    var tam by remember { mutableStateOf(IntSize.Zero) }
    // Lo que se esta arrastrando, antes de guardarlo: rehacer las preferencias en cada cuadro no.
    var enCurso by remember { mutableStateOf<PosBloque?>(null) }
    val actual = enCurso ?: pos
    val tamActual by rememberUpdatedState(tam)
    val areaActual by rememberUpdatedState(area)
    val posActual by rememberUpdatedState(actual)
    val alCambiarActual by rememberUpdatedState(alCambiar)

    // La caja que se ve, en pixeles del mapa: sin posicion guardada se mide de donde quedo.
    var cajaPorDefecto by remember { mutableStateOf(Offset.Zero) }
    fun cajaVisible(p: PosBloque?): Triple<Offset, Float, Float> {
        val s = p?.s ?: 1f
        val w = tamActual.width * s
        val h = tamActual.height * s
        if (p == null) return Triple(cajaPorDefecto, w, h)
        val (izq, arr) = esquinaDe(p, tamActual.width, tamActual.height, areaActual.width, areaActual.height)
        val x = if (p.derecha) izq + tamActual.width - w else izq.toFloat()
        val y = if (p.abajo) arr + tamActual.height - h else arr.toFloat()
        return Triple(Offset(x, y), w, h)
    }

    val ubicacion = if (actual == null) {
        porDefecto
    } else {
        Modifier
            .align(Alignment.TopStart)
            .offset {
                val (x, y) = esquinaDe(actual, tam.width, tam.height, area.width, area.height)
                IntOffset(x, y)
            }
            .graphicsLayer {
                scaleX = actual.s
                scaleY = actual.s
                transformOrigin = TransformOrigin(if (actual.derecha) 1f else 0f, if (actual.abajo) 1f else 0f)
            }
            .then(movido)
    }
    Box(
        ubicacion
            .onSizeChanged { tam = it }
            .then(
                // Donde quedo en su lugar de siempre: de ahi se empieza a mover.
                if (actual == null) Modifier.onGloballyPositioned { cajaPorDefecto = it.positionInParent() } else Modifier,
            )
            .then(if (acomodando) Modifier.border(BorderStroke(2.dp, Paleta.Acento), RoundedCornerShape(8.dp)) else Modifier),
    ) {
        contenido()
        if (acomodando) {
            // Encima de todo: mientras se acomoda, un toque no aprieta los botones de abajo, mueve.
            Box(
                Modifier
                    .matchParentSize()
                    .pointerInput(Unit) {
                        var desde = Offset.Zero
                        var total = Offset.Zero
                        var ancho = 0f
                        var alto = 0f
                        detectDragGestures(
                            onDragStart = {
                                val (o, w, h) = cajaVisible(posActual)
                                desde = o
                                ancho = w
                                alto = h
                                total = Offset.Zero
                            },
                            onDragEnd = {
                                enCurso?.let { alCambiarActual(it) }
                                enCurso = null
                            },
                            onDragCancel = { enCurso = null },
                        ) { cambio, arrastre ->
                            cambio.consume()
                            // Adentro del bloque escalado el dedo se mide sin escala.
                            total += arrastre * (posActual?.s ?: 1f)
                            val a = areaActual
                            val x = (desde.x + total.x).coerceIn(0f, (a.width - ancho).coerceAtLeast(0f))
                            val y = (desde.y + total.y).coerceIn(0f, (a.height - alto).coerceAtLeast(0f))
                            enCurso = anclaDe(x, y, ancho, alto, a.width.toFloat(), a.height.toFloat(), posActual?.s ?: 1f)
                        }
                    }
            )
            // La manija del tamano, abajo a la derecha (layoutResizeCornerPx).
            Surface(
                shape = RoundedCornerShape(topStart = 8.dp, bottomEnd = 8.dp),
                color = Paleta.Acento,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .size(22.dp)
                    .pointerInput(Unit) {
                        var desde: PosBloque? = null
                        var o = Offset.Zero
                        var ancho = 0f
                        var alto = 0f
                        var total = Offset.Zero
                        detectDragGestures(
                            onDragStart = {
                                val (caja, w, h) = cajaVisible(posActual)
                                o = caja
                                ancho = w
                                alto = h
                                total = Offset.Zero
                                desde = posActual ?: anclaDe(caja.x, caja.y, w, h, areaActual.width.toFloat(), areaActual.height.toFloat(), 1f)
                            },
                            onDragEnd = {
                                enCurso?.let { alCambiarActual(it) }
                                enCurso = null
                            },
                            onDragCancel = { enCurso = null },
                        ) { cambio, arrastre ->
                            cambio.consume()
                            val inicio = desde ?: return@detectDragGestures
                            total += arrastre * inicio.s
                            val a = areaActual
                            // Crece hacia adentro desde la esquina anclada: lo que entra hasta el borde de ese lado.
                            val anchoMax = if (inicio.derecha) o.x + ancho else a.width - o.x
                            val altoMax = if (inicio.abajo) o.y + alto else a.height - o.y
                            val dx = if (inicio.derecha) -total.x else total.x
                            val dy = if (inicio.abajo) -total.y else total.y
                            val s = escalaPara(inicio.s, ancho, alto, dx, dy, anchoMax, altoMax)
                            // La esquina anclada queda donde estaba: se rehace la posicion con el tamano nuevo.
                            val w = ancho / inicio.s * s
                            val h = alto / inicio.s * s
                            val x = if (inicio.derecha) o.x + ancho - w else o.x
                            val y = if (inicio.abajo) o.y + alto - h else o.y
                            enCurso = anclaDe(x, y, w, h, a.width.toFloat(), a.height.toFloat(), s)
                        }
                    },
            ) {}
        }
    }
}
