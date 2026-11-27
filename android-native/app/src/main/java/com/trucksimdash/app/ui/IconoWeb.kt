package com.trucksimdash.app.ui

import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.Dp
import androidx.core.graphics.PathParser

// Los iconos del panel de la web (DASH_ICONS en docs/dash/dash.js): trazos de 24 x 24 con
// stroke 1,9 y puntas redondas, dibujados tal cual para que sean el mismo dibujo en las dos.
internal val ICONOS_WEB = mapOf(
    "beamLow" to """<path d="M3 5h3.5a7 7 0 0 1 0 14H3z"/><path d="M13 7l7 2M13 12l7 2M13 16.5l7 2"/>""",
    "beamHigh" to """<path d="M3 5h3.5a7 7 0 0 1 0 14H3z"/><path d="M13 8h7M13 12h7M13 16h7"/>""",
    "parking" to """<circle cx="12" cy="12" r="3.2"/><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2 2M18 6l-2 2M6 18l2-2M18 18l-2-2"/>""",
    "beacon" to """<path d="M6 20h12"/><path d="M8 16h8l-1.2-4.5a2.9 2.9 0 0 0-5.6 0z"/><path d="M12 3v3M4.5 6.5l2 1.8M19.5 6.5l-2 1.8M2.5 13h2.5M19 13h2.5"/>""",
    "hazards" to """<path d="M12 3 L2 20 h20 Z"/><path d="M12 9v5"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/>""",
    "blinkerLeft" to """<path d="M14 5 L5 12 l9 7z"/>""",
    "blinkerRight" to """<path d="M10 5 L19 12 l-9 7z"/>""",
    "wipers" to """<path d="M3.5 18c1.5-6.5 4-9.5 8.5-9.5s7 3 8.5 9.5z"/><path d="M7 18l7.2-6.2"/><path d="M12.6 10.3l2.7 1.7"/>""",
    "motorBrake" to """<path d="M12 2v6"/><circle cx="12" cy="14" r="6.5"/><path d="M9 14h6"/>""",
    "retarder" to """<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/><path d="M4.5 12H2M22 12h-2.5"/>""",
    "differentialLock" to """<circle cx="12" cy="12" r="3"/><path d="M12 3.2v5.5M12 15.3v5.5M3.2 12h5.5M15.3 12h5.5"/>""",
    "parkingBrake" to """<circle cx="12" cy="12" r="8.5"/><text>P</text>""",
    "liftAxle" to """<path d="M12 2v7M9 6l3-4 3 4"/><circle cx="7" cy="18" r="2.6"/><circle cx="17" cy="18" r="2.6"/><path d="M9.5 18h5"/>""",
    "trailerAttached" to """<path d="M8 6h13v10H8z"/><path d="M8 13H4.2"/><circle cx="2.6" cy="13" r="1.2"/><circle cx="12.5" cy="18" r="1.5"/><circle cx="17.5" cy="18" r="1.5"/>""",
)

/** Un icono armado: los trazos (con si van rellenos) y la letra del freno de mano. */
private class TrazosIcono(val trazos: List<Pair<Path, Boolean>>, val letra: String?)

private val ATRIBUTO = Regex("""([\w-]+)="([^"]*)"""")
private val ELEMENTO = Regex("""<(path|circle|rect|text)([^>]*?)/?>([^<]*)""")
private val armados = HashMap<String, TrazosIcono>()

private fun armar(svg: String): TrazosIcono {
    val trazos = ArrayList<Pair<Path, Boolean>>()
    var letra: String? = null
    for (m in ELEMENTO.findAll(svg)) {
        val a = ATRIBUTO.findAll(m.groupValues[2]).associate { it.groupValues[1] to it.groupValues[2] }
        fun n(k: String) = a[k]?.toFloatOrNull() ?: 0f
        val relleno = a["fill"] == "currentColor"
        when (m.groupValues[1]) {
            "path" -> a["d"]?.let { d -> runCatching { PathParser.createPathFromPathData(d) }.getOrNull()?.let { trazos.add(it to relleno) } }
            "circle" -> trazos.add(Path().apply { addCircle(n("cx"), n("cy"), n("r"), Path.Direction.CW) } to relleno)
            "rect" -> trazos.add(
                Path().apply { addRoundRect(RectF(n("x"), n("y"), n("x") + n("width"), n("y") + n("height")), n("rx"), n("rx"), Path.Direction.CW) } to relleno,
            )
            "text" -> letra = m.groupValues[3].trim().ifBlank { null }
        }
    }
    return TrazosIcono(trazos, letra)
}

private val trazo = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    strokeWidth = 1.9f
    strokeCap = Paint.Cap.ROUND
    strokeJoin = Paint.Join.ROUND
}
private val lleno = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
private val letraP = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    typeface = Typeface.DEFAULT_BOLD
    textSize = 11f
    textAlign = Paint.Align.CENTER
}

/** Un icono de la web de lado lado, del color color. Sin dibujo para esa clave, no dibuja nada. */
@Composable
internal fun IconoWeb(clave: String, color: Color, lado: Dp, modifier: Modifier = Modifier) {
    val ic = ICONOS_WEB[clave]?.let { armados.getOrPut(clave) { armar(it) } } ?: return
    Canvas(modifier.size(lado)) {
        val k = size.minDimension / 24f
        val argb = color.toArgb()
        drawIntoCanvas { c ->
            val nc = c.nativeCanvas
            nc.save()
            nc.scale(k, k)
            trazo.color = argb
            lleno.color = argb
            for ((p, relleno) in ic.trazos) nc.drawPath(p, if (relleno) lleno else trazo)
            ic.letra?.let {
                letraP.color = argb
                nc.drawText(it, 12f, 16.5f, letraP)
            }
            nc.restore()
        }
    }
}
