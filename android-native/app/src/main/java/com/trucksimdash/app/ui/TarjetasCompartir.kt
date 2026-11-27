package com.trucksimdash.app.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import androidx.core.content.ContextCompat
import com.trucksimdash.app.R
import com.trucksimdash.app.core.distancia
import com.trucksimdash.app.core.fechaCorta
import com.trucksimdash.app.core.enteroLocal
import com.trucksimdash.app.core.plata
import com.trucksimdash.app.cuenta.MapaRecorrido
import com.trucksimdash.app.cuenta.ResumenAno
import com.trucksimdash.app.cuenta.Viaje
import kotlin.math.PI
import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.tan

// Las tarjetas para compartir de la cuenta en la web (tarjetaDeViaje y tarjetaDelAno de
// account.js): el mismo tamano, los mismos colores y el mismo lugar para cada cosa, para que
// una imagen sacada del telefono se vea igual que una sacada de la pagina.

internal const val TARJETA_W = 1080
internal const val TARJETA_H = 1350
private const val MARGEN = 60f
private const val ANCHO = TARJETA_W - 2 * MARGEN

/** Un hueco mas largo que esto en el recorrido es un salto (ferry, partida cargada): punteado. */
private const val SALTO_MAXIMO_M = 1500.0
private const val VUELTA_AL_MUNDO_KM = 40075.0

private val NARANJA = Color.parseColor("#FF8A3D")
private val AZUL = Color.parseColor("#3B9EFF")
private val VERDE = Color.parseColor("#4CAF50")
private val TEXTO = Color.parseColor("#F2F3F5")
private val SUAVE = Color.parseColor("#9AA4B2")
private val CAJA = Color.parseColor("#14171C")
private val FONDO_OSCURO = Color.parseColor("#0B0D10")

private fun fuente(peso: Int): Typeface = when {
    peso >= 700 -> Typeface.create("sans-serif", Typeface.BOLD)
    peso >= 500 -> Typeface.create("sans-serif-medium", Typeface.NORMAL)
    else -> Typeface.create("sans-serif", Typeface.NORMAL)
}

private class Lienzo(private val contexto: Context) {
    val bitmap: Bitmap = Bitmap.createBitmap(TARJETA_W, TARJETA_H, Bitmap.Config.ARGB_8888)
    val c = Canvas(bitmap)
    val p = Paint(Paint.ANTI_ALIAS_FLAG)

    fun fondo(desde: Int, diagonal: Boolean) {
        p.shader = LinearGradient(0f, 0f, if (diagonal) TARJETA_W.toFloat() else 0f, TARJETA_H.toFloat(), desde, FONDO_OSCURO, Shader.TileMode.CLAMP)
        c.drawRect(0f, 0f, TARJETA_W.toFloat(), TARJETA_H.toFloat(), p)
        p.shader = null
    }

    fun redondeado(x: Float, y: Float, w: Float, h: Float, r: Float, color: Int) {
        p.style = Paint.Style.FILL
        p.color = color
        c.drawRoundRect(RectF(x, y, x + w, y + h), r, r, p)
    }

    /** El logo, "Truck Dash" y un chip a la derecha (el juego o el ano). */
    fun encabezado(chip: String?, colorChip: Int, fondoChip: Int) {
        ContextCompat.getDrawable(contexto, R.mipmap.ic_launcher)?.let { d ->
            d.setBounds(MARGEN.toInt(), 52, MARGEN.toInt() + 52, 104)
            d.draw(c)
        }
        p.typeface = fuente(700)
        p.textSize = 38f
        p.textAlign = Paint.Align.LEFT
        val medio = 79f - (p.descent() + p.ascent()) / 2
        p.color = TEXTO
        c.drawText("Truck", MARGEN + 66, medio, p)
        p.color = AZUL
        c.drawText("Dash", MARGEN + 66 + p.measureText("Truck "), medio, p)
        if (chip.isNullOrBlank()) return
        p.typeface = fuente(800)
        p.textSize = 30f
        val w = p.measureText(chip) + 34
        redondeado(TARJETA_W - MARGEN - w, 56f, w, 48f, 11f, fondoChip)
        p.color = colorChip
        p.textAlign = Paint.Align.CENTER
        c.drawText(chip, TARJETA_W - MARGEN - w / 2, 80f - (p.descent() + p.ascent()) / 2, p)
        p.textAlign = Paint.Align.LEFT
    }

    /** textoAjustado: el tamano mas grande que entra en el ancho, o cortado con puntos suspensivos. */
    fun texto(texto: String, ancho: Float, tam: Float, minimo: Float, peso: Int, color: Int, x: Float, y: Float) {
        p.typeface = fuente(peso)
        p.style = Paint.Style.FILL
        var n = tam
        p.textSize = n
        while (n > minimo && p.measureText(texto) > ancho) {
            n -= 2
            p.textSize = n
        }
        var salida = texto
        if (p.measureText(salida) > ancho) {
            while (salida.length > 1 && p.measureText("$salida…") > ancho) salida = salida.dropLast(1)
            salida += "…"
        }
        p.color = color
        c.drawText(salida, x, y, p)
    }

    /** Seis datos en dos filas de tres, como los de las dos tarjetas de la web. */
    fun seisDatos(datos: List<Triple<String, String, Int>>, y0: Float) {
        val colW = ANCHO / 3
        datos.forEachIndexed { i, (etiqueta, valor, color) ->
            val x = MARGEN + (i % 3) * colW
            val y = y0 + (i / 3) * 120
            texto(etiqueta.uppercase(), colW - 24, 24f, 16f, 600, SUAVE, x, y)
            texto(valor, colW - 24, 40f, 22f, 700, color, x, y + 48)
        }
    }

    fun pie(izquierda: String?) {
        p.typeface = fuente(500)
        p.textSize = 28f
        p.color = SUAVE
        p.textAlign = Paint.Align.LEFT
        if (!izquierda.isNullOrBlank()) c.drawText(izquierda, MARGEN, TARJETA_H - 60f, p)
        p.typeface = fuente(700)
        p.textSize = 30f
        p.color = AZUL
        p.textAlign = Paint.Align.RIGHT
        c.drawText("trucksim-dash.com", TARJETA_W - MARGEN, TARJETA_H - 60f, p)
        p.textAlign = Paint.Align.LEFT
    }
}

/** cortarSaltos de la web: un tramo se parte donde dos puntos seguidos quedan muy lejos. */
internal fun cortarSaltos(tramos: List<List<DoubleArray>>): List<List<DoubleArray>> {
    val salida = ArrayList<List<DoubleArray>>()
    for (tramo in tramos) {
        var actual = ArrayList<DoubleArray>()
        for (punto in tramo) {
            val previo = actual.lastOrNull()
            if (previo != null && hypot(punto[0] - previo[0], punto[1] - previo[1]) > SALTO_MAXIMO_M) {
                if (actual.size > 1) salida.add(actual)
                actual = ArrayList()
            }
            actual.add(punto)
        }
        if (actual.isNotEmpty()) salida.add(actual)
    }
    return salida
}

/** topeDeVelocidad: el percentil 95 de lo que se anduvo, no menos de 30 km/h. Null sin velocidades. */
internal fun topeDeVelocidad(tramos: List<List<DoubleArray>>): Double? {
    val v = tramos.flatMap { t -> t.mapNotNull { p -> p.getOrNull(2) } }.sorted()
    if (v.size < 2) return null
    return max(30.0, v[floor(0.95 * (v.size - 1)).toInt()])
}

/** colorDeVelocidad: de verde (parado) a rojo (al tope), en HSL como la web. */
internal fun colorDeVelocidad(kmh: Double, tope: Double): Int {
    val f = (kmh / tope).coerceIn(0.0, 1.0)
    return Color.HSVToColor(hslAHsv((120 - 120 * f).toFloat(), 0.8f, 0.5f))
}

private fun hslAHsv(h: Float, s: Float, l: Float): FloatArray {
    val v = l + s * min(l, 1 - l)
    return floatArrayOf(h, if (v == 0f) 0f else 2 * (1 - l / v), v)
}

/** "Delivered" o "Late" o lo que sea, como textoEstadoViaje. */
private fun estadoDeViaje(contexto: Context, v: Viaje): String = contexto.getString(
    when (v.estado) {
        "delivered" -> if (v.aTiempo == false) R.string.viaje_tarde else R.string.viaje_entregado
        "in_progress" -> R.string.viaje_en_curso
        "cancelled" -> R.string.viaje_cancelado
        else -> R.string.viaje_sin_terminar
    },
)

private fun unDecimal(valor: Double): String =
    java.text.NumberFormat.getNumberInstance(java.util.Locale.getDefault()).run {
        minimumFractionDigits = 1
        maximumFractionDigits = 1
        format(valor)
    }

/** duracion de la web: "45 min", "9 h", "4 h 05". */
internal fun duracionCorta(horas: Double): String {
    val minutos = (horas * 60).roundToInt()
    if (minutos < 60) return "$minutos min"
    if (minutos % 60 == 0) return "${minutos / 60} h"
    return "${minutos / 60} h ${(minutos % 60).toString().padStart(2, '0')}"
}

/**
 * La tarjeta de un viaje (tarjetaDeViaje): de donde a donde, las empresas, el recorrido con el
 * color de su velocidad y seis numeros. tramos: el recorrido de /trips/{id}, en coordenadas del juego.
 */
internal fun tarjetaDeViaje(contexto: Context, v: Viaje, tramos: List<List<DoubleArray>>, usuario: String?, millas: Boolean): Bitmap {
    val l = Lienzo(contexto)
    l.fondo(Color.parseColor("#141922"), diagonal = false)
    val ats = v.juego == "ats"
    l.encabezado(v.juego?.uppercase(), if (ats) NARANJA else AZUL, if (ats) Color.argb(46, 255, 138, 61) else Color.argb(46, 59, 158, 255))

    val titulo = listOfNotNull(v.ciudadOrigen, v.ciudadDestino).joinToString(" → ").ifBlank { contexto.getString(R.string.compartir) }
    l.texto(titulo, ANCHO, 68f, 36f, 800, Color.WHITE, MARGEN, 196f)
    val empresas = listOfNotNull(v.empresaOrigen, v.empresaDestino).joinToString(" → ")
    if (empresas.isNotBlank()) l.texto(empresas, ANCHO, 32f, 22f, 500, SUAVE, MARGEN, 244f)

    val caja = RectF(MARGEN, 280f, MARGEN + ANCHO, 980f)
    l.redondeado(caja.left, caja.top, caja.width(), caja.height(), 24f, CAJA)
    dibujarRecorrido(l, caja, cortarSaltos(tramos), listOf(v.ciudadOrigen, v.ciudadDestino), contexto.getString(R.string.tarjeta_sin_recorrido))

    val sinCobrar = v.estado == "cancelled" || v.estado == "abandoned"
    val km = v.kmJuego?.let { distancia(it, millas) }
        ?: v.kmMedidos?.let { contexto.getString(R.string.tarjeta_medida, distancia(it, millas)) }
    val vehiculo = when (v.tipoTrabajo) {
        "bus" -> R.string.tarjeta_bus
        "car" -> R.string.tarjeta_vehiculo
        else -> R.string.camion
    }
    val colorEstado = when {
        v.aTiempo == true -> VERDE
        v.aTiempo == false || sinCobrar -> NARANJA
        else -> TEXTO
    }
    l.seisDatos(
        listOf(
            Triple(contexto.getString(R.string.tarjeta_distancia), km ?: "-", TEXTO),
            Triple(contexto.getString(R.string.carga), v.carga ?: "-", TEXTO),
            Triple(contexto.getString(vehiculo), v.camion ?: "-", TEXTO),
            Triple(contexto.getString(R.string.tarjeta_tiempo), v.horasReales?.takeIf { it > 0 }?.let(::duracionCorta) ?: "-", TEXTO),
            Triple(
                contexto.getString(R.string.pago),
                if (sinCobrar || v.modeado || v.pago == null || v.pago <= 0) "-" else plata(v.pago, v.moneda),
                TEXTO,
            ),
            Triple(contexto.getString(R.string.tarjeta_estado), estadoDeViaje(contexto, v), colorEstado),
        ),
        1050f,
    )
    val cuando = v.entregado ?: v.empezado
    l.pie(listOfNotNull(usuario?.let { "@$it" }, cuando?.let(::fechaCorta)).joinToString(" · "))
    return l.bitmap
}

/** dibujarEnTarjeta: norte arriba, todo el recorrido adentro de la caja, y las ciudades en las puntas. */
private fun dibujarRecorrido(l: Lienzo, caja: RectF, tramos: List<List<DoubleArray>>, nombres: List<String?>, sinRecorrido: String) {
    val puntos = tramos.flatten()
    val p = l.p
    if (puntos.size < 2) {
        p.typeface = fuente(500)
        p.textSize = 30f
        p.color = Color.parseColor("#5C6470")
        p.textAlign = Paint.Align.CENTER
        l.c.drawText(sinRecorrido, caja.centerX(), caja.centerY(), p)
        p.textAlign = Paint.Align.LEFT
        return
    }
    val minX = puntos.minOf { it[0] }
    val maxX = puntos.maxOf { it[0] }
    val minY = puntos.minOf { it[1] }
    val maxY = puntos.maxOf { it[1] }
    val aire = 90f
    val escala = min((caja.width() - 2 * aire) / max(maxX - minX, 1.0), (caja.height() - 2 * aire) / max(maxY - minY, 1.0))
    val ox = caja.centerX() - ((minX + maxX) / 2) * escala
    val oy = caja.centerY() - ((minY + maxY) / 2) * escala
    fun x(q: DoubleArray) = (ox + q[0] * escala).toFloat()
    fun y(q: DoubleArray) = (oy + q[1] * escala).toFloat()
    val tope = topeDeVelocidad(tramos)
    p.style = Paint.Style.STROKE
    p.strokeCap = Paint.Cap.ROUND
    p.strokeJoin = Paint.Join.ROUND
    tramos.forEachIndexed { i, tramo ->
        val previo = tramos.getOrNull(i - 1)
        if (previo != null && previo.isNotEmpty() && tramo.isNotEmpty()) {
            p.pathEffect = DashPathEffect(floatArrayOf(14f, 14f), 0f)
            p.color = Color.argb(153, 154, 164, 178)
            p.strokeWidth = 6f
            l.c.drawLine(x(previo.last()), y(previo.last()), x(tramo[0]), y(tramo[0]), p)
            p.pathEffect = null
        }
        if (tramo.size < 2) return@forEachIndexed
        p.strokeWidth = 10f
        if (tope != null && tramo.all { it.size > 2 }) {
            for (k in 1 until tramo.size) {
                p.color = colorDeVelocidad((tramo[k - 1][2] + tramo[k][2]) / 2, tope)
                l.c.drawLine(x(tramo[k - 1]), y(tramo[k - 1]), x(tramo[k]), y(tramo[k]), p)
            }
        } else {
            p.color = AZUL
            val camino = Path()
            tramo.forEachIndexed { k, q -> if (k == 0) camino.moveTo(x(q), y(q)) else camino.lineTo(x(q), y(q)) }
            l.c.drawPath(camino, p)
        }
    }
    val puntas = listOf(puntos.first(), puntos.last())
    puntas.forEachIndexed { i, q ->
        p.style = Paint.Style.FILL
        p.color = if (i == 1) NARANJA else Color.WHITE
        l.c.drawCircle(x(q), y(q), 14f, p)
        p.style = Paint.Style.STROKE
        p.strokeWidth = 5f
        p.color = FONDO_OSCURO
        l.c.drawCircle(x(q), y(q), 14f, p)
    }
    // Los nombres al lado de cada punta, hacia adentro de la caja.
    p.style = Paint.Style.FILL
    p.typeface = fuente(700)
    p.textSize = 30f
    nombres.forEachIndexed { i, nombre ->
        if (nombre.isNullOrBlank() || (i == 1 && nombre == nombres[0])) return@forEachIndexed
        val q = puntas[i]
        val w = p.measureText(nombre)
        val haciaIzquierda = x(q) > caja.centerX()
        val tx = (if (haciaIzquierda) x(q) - 26 - w else x(q) + 26).coerceIn(caja.left + 16, caja.right - 16 - w)
        val ty = (y(q) - (p.descent() + p.ascent()) / 2).coerceIn(caja.top + 40, caja.bottom - 20)
        p.color = Color.argb(200, 11, 13, 16)
        l.c.drawRoundRect(RectF(tx - 10, ty + p.ascent() - 6, tx + w + 10, ty + p.descent() + 6), 10f, 10f, p)
        p.color = TEXTO
        l.c.drawText(nombre, tx, ty, p)
    }
    p.style = Paint.Style.FILL
}

/**
 * La tarjeta del ano (tarjetaDelAno): lo manejado, las vueltas al mundo, el mapa de todo lo
 * manejado del juego principal y seis numeros. mapas: /trips/map de cada juego de ese ano.
 */
internal fun tarjetaDelAno(contexto: Context, d: ResumenAno, mapas: Map<String, MapaRecorrido>, usuario: String?, millas: Boolean): Bitmap {
    val l = Lienzo(contexto)
    l.fondo(Color.parseColor("#1A2130"), diagonal = true)
    l.encabezado(d.ano.toString(), NARANJA, Color.argb(51, 255, 138, 61))

    val km = d.totales.sumOf { it.km }
    val horas = d.totales.sumOf { it.horasReales }
    val entregas = d.resumenes.sumOf { it.entregados }
    l.texto(contexto.getString(R.string.tarjeta_ano_titulo, d.ano), ANCHO, 60f, 34f, 800, Color.WHITE, MARGEN, 190f)
    l.texto(distancia(km, millas), ANCHO, 120f, 60f, 800, NARANJA, MARGEN, 320f)
    val vueltas = km / VUELTA_AL_MUNDO_KM
    val lineaKm = listOfNotNull(
        contexto.getString(R.string.tarjeta_manejado),
        if (vueltas >= 0.1) contexto.getString(R.string.tarjeta_vueltas, unDecimal(vueltas)) else null,
    ).joinToString(" · ")
    l.texto(lineaKm, ANCHO, 32f, 22f, 500, SUAVE, MARGEN, 372f)

    // El mapa del juego con mas manejado (el primero de las stats), como la web.
    val principal = d.resumenes.firstOrNull()
    val juegoMapa = principal?.juego?.takeIf { it in mapas } ?: mapas.keys.firstOrNull()
    val caja = RectF(MARGEN, 410f, MARGEN + ANCHO, 930f)
    val mapa = juegoMapa?.let { mapas[it] }
    if (mapa != null && mapa.lineas.isNotEmpty()) dibujarMapaAno(l, caja, mapa, 5f)
    else l.redondeado(caja.left, caja.top, caja.width(), caja.height(), 24f, CAJA)

    val r = contexto.resources
    val regiones = mapa?.cuantasRegiones?.takeIf { it > 0 }?.let { n ->
        r.getQuantityString(if (juegoMapa == "ats") R.plurals.tarjeta_estados else R.plurals.tarjeta_paises, n, n)
    }
    val camion = principal?.camiones?.firstOrNull()?.nombre
    l.seisDatos(
        listOf(
            Triple(contexto.getString(R.string.tarjeta_al_volante), if (horas > 0) duracionCorta(horas) else "-", TEXTO),
            Triple(contexto.getString(R.string.tarjeta_entregas), enteroLocal(entregas), TEXTO),
            Triple(contexto.getString(R.string.tarjeta_dias_manejados), enteroLocal(d.diasManejados), TEXTO),
            Triple(
                contexto.getString(R.string.tarjeta_racha),
                if (d.rachaMasLarga > 0) r.getQuantityString(R.plurals.tarjeta_dias, d.rachaMasLarga, d.rachaMasLarga) else "-",
                TEXTO,
            ),
            Triple(contexto.getString(R.string.tarjeta_recorriste), regiones ?: "-", TEXTO),
            Triple(contexto.getString(R.string.camion), camion ?: "-", TEXTO),
        ),
        1000f,
    )
    l.pie(usuario?.let { "@$it" })
    return l.bitmap
}

/** dibujarMapaAno: los recorridos en Mercator, sin el mapa del juego, y las ciudades mas visitadas. */
private fun dibujarMapaAno(l: Lienzo, caja: RectF, mapa: MapaRecorrido, grosor: Float) {
    val c = l.c
    val p = l.p
    c.save()
    val recorte = Path().apply { addRoundRect(caja, 24f, 24f, Path.Direction.CW) }
    l.redondeado(caja.left, caja.top, caja.width(), caja.height(), 24f, CAJA)
    c.clipPath(recorte)
    fun merc(lng: Double, lat: Double) = doubleArrayOf(lng, -ln(tan(PI / 4 + lat * PI / 360)) * 180 / PI)
    val lineas = mapa.lineas.map { linea -> linea.map { (lng, lat) -> merc(lng, lat) } }
    val ciudades = mapa.listaCiudades.map { Triple(merc(it.lng, it.lat), it.visitas, it.nombre) }
    val todos = lineas.flatten() + ciudades.map { it.first }
    if (todos.isEmpty()) {
        c.restore()
        return
    }
    val minX = todos.minOf { it[0] }
    val maxX = todos.maxOf { it[0] }
    val minY = todos.minOf { it[1] }
    val maxY = todos.maxOf { it[1] }
    val aire = caja.width() * 0.07f
    val escala = min((caja.width() - 2 * aire) / max(maxX - minX, 1e-9), (caja.height() - 2 * aire) / max(maxY - minY, 1e-9))
    val ox = caja.centerX() - ((minX + maxX) / 2) * escala
    val oy = caja.centerY() - ((minY + maxY) / 2) * escala
    fun x(q: DoubleArray) = (ox + q[0] * escala).toFloat()
    fun y(q: DoubleArray) = (oy + q[1] * escala).toFloat()
    p.style = Paint.Style.STROKE
    p.strokeCap = Paint.Cap.ROUND
    p.strokeJoin = Paint.Join.ROUND
    p.color = Color.argb(230, 255, 138, 61)
    p.strokeWidth = grosor
    for (linea in lineas) {
        if (linea.size < 2) continue
        val camino = Path()
        linea.forEachIndexed { k, q -> if (k == 0) camino.moveTo(x(q), y(q)) else camino.lineTo(x(q), y(q)) }
        c.drawPath(camino, p)
    }
    // Las ciudades, y el nombre de las cinco mas visitadas.
    ciudades.forEachIndexed { i, (q, visitas, nombre) ->
        val radio = grosor * 1.6f + min(visitas, 20) * grosor * 0.12f
        p.style = Paint.Style.FILL
        p.color = Color.WHITE
        c.drawCircle(x(q), y(q), radio, p)
        p.style = Paint.Style.STROKE
        p.strokeWidth = grosor * 0.6f
        p.color = NARANJA
        c.drawCircle(x(q), y(q), radio, p)
        if (i < 5 && nombre.isNotBlank()) {
            p.style = Paint.Style.FILL
            p.typeface = fuente(600)
            p.textSize = (grosor * 5.5f).roundToInt().toFloat()
            p.color = Color.parseColor("#C6CCD4")
            c.drawText(nombre, x(q) + radio + grosor * 2, y(q) - (p.descent() + p.ascent()) / 2, p)
        }
    }
    p.style = Paint.Style.FILL
    c.restore()
}
