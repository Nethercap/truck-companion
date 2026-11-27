package com.trucksimdash.app.core

import androidx.compose.runtime.Immutable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Donde quedo un bloque del mapa movido a mano ("Mover los botones", btnLayout en la web): en cada
 * eje contra el borde mas cercano, en porcentaje del mapa (x o r, y o b), y su escala. Asi un
 * bloque pegado abajo sigue abajo de costado o con otra pantalla (layoutAnchor en pure.js).
 */
@Immutable
data class PosBloque(val x: Float? = null, val r: Float? = null, val y: Float? = null, val b: Float? = null, val s: Float = 1f) {
    val derecha: Boolean get() = r != null && x == null
    val abajo: Boolean get() = b != null && y == null
}

/** LAYOUT_SCALE_MIN y LAYOUT_SCALE_MAX de la web. */
const val ESCALA_BLOQUE_MIN = 0.6f
const val ESCALA_BLOQUE_MAX = 2.5f

/**
 * layoutAnchor: la caja que se ve (con la escala), en pixeles del mapa, como porcentajes desde los
 * bordes mas cercanos, con un decimal.
 */
fun anclaDe(izquierda: Float, arriba: Float, ancho: Float, alto: Float, areaAncho: Float, areaAlto: Float, escala: Float): PosBloque {
    fun pct(v: Float, total: Float) = (max(0f, v) / total * 1000).roundToInt() / 10f
    val derecha = izquierda + ancho / 2 > areaAncho / 2
    val abajo = arriba + alto / 2 > areaAlto / 2
    return PosBloque(
        x = if (derecha) null else pct(izquierda, areaAncho),
        r = if (derecha) pct(areaAncho - izquierda - ancho, areaAncho) else null,
        y = if (abajo) null else pct(arriba, areaAlto),
        b = if (abajo) pct(areaAlto - arriba - alto, areaAlto) else null,
        s = escala,
    )
}

/**
 * Donde va la esquina de arriba a la izquierda de la caja SIN escalar, en pixeles: la escala se
 * aplica desde la esquina anclada, asi que agrandado crece hacia adentro del mapa (layoutCss).
 */
fun esquinaDe(pos: PosBloque, ancho: Int, alto: Int, areaAncho: Int, areaAlto: Int): Pair<Int, Int> {
    val izquierda = if (pos.derecha) areaAncho - (pos.r!! / 100f * areaAncho) - ancho else (pos.x ?: 0f) / 100f * areaAncho
    val arriba = if (pos.abajo) areaAlto - (pos.b!! / 100f * areaAlto) - alto else (pos.y ?: 0f) / 100f * areaAlto
    return izquierda.roundToInt() to arriba.roundToInt()
}

/**
 * layoutScaleFor: la escala nueva segun cuanto se arrastro la esquina, siguiendo al dedo en la
 * direccion que mas se movio, sin pasar lo que entra hasta el borde del mapa.
 */
fun escalaPara(escalaInicial: Float, anchoInicial: Float, altoInicial: Float, dx: Float, dy: Float, anchoMax: Float, altoMax: Float): Float {
    if (escalaInicial <= 0f || anchoInicial <= 0f || altoInicial <= 0f) return escalaInicial.takeIf { it > 0f } ?: 1f
    val factor = max((anchoInicial + dx) / anchoInicial, (altoInicial + dy) / altoInicial)
    val entra = escalaInicial * min(anchoMax / anchoInicial, altoMax / altoInicial)
    val s = (escalaInicial * factor).coerceAtMost(min(ESCALA_BLOQUE_MAX, entra)).coerceAtLeast(ESCALA_BLOQUE_MIN)
    return (s * 1000).roundToInt() / 1000f
}

fun leerDisposicion(texto: String?): Map<String, PosBloque> {
    val o = texto?.let(::parsearObjeto) ?: return emptyMap()
    return o.mapNotNull { (clave, valor) ->
        val p = valor as? JsonObject ?: return@mapNotNull null
        val pos = PosBloque(
            x = p.numero("x")?.toFloat(),
            r = p.numero("r")?.toFloat(),
            y = p.numero("y")?.toFloat(),
            b = p.numero("b")?.toFloat(),
            s = (p.numero("s")?.toFloat() ?: 1f).coerceIn(ESCALA_BLOQUE_MIN, ESCALA_BLOQUE_MAX),
        )
        // Sin un eje no se sabe donde va: mejor donde estaba siempre.
        if ((pos.x == null && pos.r == null) || (pos.y == null && pos.b == null)) null else clave to pos
    }.toMap()
}

fun escribirDisposicion(d: Map<String, PosBloque>): String = buildJsonObject {
    for ((clave, p) in d) {
        put(
            clave,
            buildJsonObject {
                p.x?.let { put("x", it) }
                p.r?.let { put("r", it) }
                p.y?.let { put("y", it) }
                p.b?.let { put("b", it) }
                put("s", p.s)
            },
        )
    }
}.toString()
