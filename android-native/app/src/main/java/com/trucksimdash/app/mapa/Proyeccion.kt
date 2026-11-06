package com.trucksimdash.app.mapa

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.sign
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tan

data class LngLat(val lng: Double, val lat: Double)
data class PuntoJuego(val x: Double, val z: Double)

// De coordenadas del juego (x, z) a lng/lat de verdad: Lambert Conica Conforme
// sobre una esfera, el mismo algoritmo con que truckermudgeon/maps genera los
// tiles, asi el camion cae donde corresponde. Portado de atsToLngLat y
// ets2ToLngLatImpl de docs/app/app.js. El test compara contra esas funciones
// corriendo con el proj4 de la web (tools/generar_golden.js).

private const val RADIO_TIERRA_M = 6370997.0
internal const val LARGO_DE_GRADO = (RADIO_TIERRA_M * PI) / 180

private fun rad(g: Double) = g * PI / 180
private fun grados(r: Double) = r * 180 / PI

private class Lcc(lat1: Double, lat2: Double, lat0: Double, private val lon0: Double) {
    private val f1 = rad(lat1)
    private val f2 = rad(lat2)
    private val n = ln(cos(f1) / cos(f2)) / ln(tan(PI / 4 + f2 / 2) / tan(PI / 4 + f1 / 2))
    private val f = cos(f1) * tan(PI / 4 + f1 / 2).pow(n) / n
    private val rho0 = RADIO_TIERRA_M * f / tan(PI / 4 + rad(lat0) / 2).pow(n)

    fun adelante(lng: Double, lat: Double): Pair<Double, Double> {
        val rho = RADIO_TIERRA_M * f / tan(PI / 4 + rad(lat) / 2).pow(n)
        val tita = n * rad(lng - lon0)
        return rho * sin(tita) to rho0 - rho * cos(tita)
    }

    fun inversa(x: Double, y: Double): LngLat {
        val s = sign(n)
        val rho = s * sqrt(x * x + (rho0 - y) * (rho0 - y))
        val tita = atan2(s * x, s * (rho0 - y))
        val lat = 2 * atan((RADIO_TIERRA_M * f / rho).pow(1 / n)) - PI / 2
        return LngLat(lon0 + grados(tita / n), grados(lat))
    }
}

interface Proyeccion {
    fun aLngLat(x: Double, z: Double): LngLat
    fun desdeLngLat(lng: Double, lat: Double): PuntoJuego

    /** Metros de mapa por metro del juego, para el ancho de las calles. */
    val metrosPorMetroDeJuego: Double
}

private object ProyeccionAts : Proyeccion {
    private const val FACTOR_Z = -0.00017706234
    private const val FACTOR_X = 0.000176689948
    private val lcc = Lcc(33.0, 45.0, 39.0, -96.0)

    override fun aLngLat(x: Double, z: Double) = lcc.inversa(x * FACTOR_X * LARGO_DE_GRADO, z * FACTOR_Z * LARGO_DE_GRADO)

    override fun desdeLngLat(lng: Double, lat: Double): PuntoJuego {
        val (lx, ly) = lcc.adelante(lng, lat)
        return PuntoJuego(lx / (FACTOR_X * LARGO_DE_GRADO), ly / (FACTOR_Z * LARGO_DE_GRADO))
    }

    override val metrosPorMetroDeJuego = abs(FACTOR_X) * LARGO_DE_GRADO
}

/**
 * ETS2. El contenido del Reino Unido esta hecho a una escala un poco mas grande
 * y lo que cae arriba a la izquierda del sector de Calais se trata como UK; el
 * mismo truco que usa truckermudgeon/maps, no hay otra forma de detectarlo. Grand
 * Utopia es un mapa aparte que cae en esa zona y va sin el truco ([truco] false).
 */
private class ProyeccionEts2(private val truco: Boolean) : Proyeccion {
    private val lcc = Lcc(37.0, 65.0, 50.0, 15.0)

    private fun esUk(sx: Double, sz: Double) = truco && sx <= -8 && sz <= -2 && !(sx == -8.0 && sz == -2.0)

    override fun aLngLat(x: Double, z: Double): LngLat {
        val sx = floor(x / 4000)
        val sz = floor(z / 4000)
        var px = x - OFFSET_X
        var pz = z - OFFSET_Z
        if (esUk(sx, sz)) {
            px = (px + CALAIS_X / 2) * ESCALA_UK
            pz = (pz + CALAIS_Z / 2) * ESCALA_UK
        }
        return lcc.inversa(px * FACTOR_X * LARGO_DE_GRADO, pz * FACTOR_Z * LARGO_DE_GRADO)
    }

    override fun desdeLngLat(lng: Double, lat: Double): PuntoJuego {
        val (lx, ly) = lcc.adelante(lng, lat)
        fun probar(asumeUk: Boolean): PuntoJuego {
            var x = lx / (FACTOR_X * LARGO_DE_GRADO)
            var z = ly / (FACTOR_Z * LARGO_DE_GRADO)
            if (asumeUk) {
                x = x / ESCALA_UK - CALAIS_X / 2
                z = z / ESCALA_UK - CALAIS_Z / 2
            }
            return PuntoJuego(x + OFFSET_X, z + OFFSET_Z)
        }
        // Si es UK depende del sector antes de la escala, que es lo que se esta
        // por calcular: primero se asume que no y se mira donde cae.
        val comun = probar(false)
        return if (esUk(floor(comun.x / 4000), floor(comun.z / 4000))) probar(true) else comun
    }

    override val metrosPorMetroDeJuego = abs(FACTOR_X) * LARGO_DE_GRADO

    private companion object {
        const val FACTOR_Z = -0.000171570875
        const val FACTOR_X = 0.0001729241463
        const val OFFSET_X = 16660.0
        const val OFFSET_Z = 4150.0
        const val ESCALA_UK = 0.75
        const val CALAIS_X = -31100.0
        const val CALAIS_Z = -5500.0
    }
}

object Proyecciones {
    private val ets2 = ProyeccionEts2(truco = true)
    private val gu = ProyeccionEts2(truco = false)

    /** Por el nombre del manifest: "ats", "ets2" o "gu". */
    fun de(nombre: String): Proyeccion = when (nombre) {
        "ats" -> ProyeccionAts
        "gu" -> gu
        else -> ets2
    }
}

/** geoBearingDeg en pure.js. */
fun rumboGeografico(lng1: Double, lat1: Double, lng2: Double, lat2: Double): Double {
    val dLng = rad(lng2 - lng1)
    val y = sin(dLng) * cos(rad(lat2))
    val x = cos(rad(lat1)) * sin(rad(lat2)) - sin(rad(lat1)) * cos(rad(lat2)) * cos(dLng)
    return (grados(atan2(y, x)) + 360) % 360
}

private fun metrosEntre(a: LngLat, b: LngLat): Double {
    val kx = 111320 * cos(rad((a.lat + b.lat) / 2))
    return hypot((b.lng - a.lng) * kx, (b.lat - a.lat) * 110540)
}

/**
 * Rumbo del juego (brujula sobre la grilla) a rumbo geografico: en los bordes de
 * la proyeccion difieren. Port de `gridHeadingToGeo`; cerca del borde del truco de
 * UK un paso salta de escala y se mide desde atras.
 */
fun rumboDeGrillaAGeo(rumbo: Double, x: Double, z: Double, p: Proyeccion, pasoM: Double = 10.0): Double {
    if (!rumbo.isFinite()) return rumbo
    val r = rad(rumbo)
    val dx = sin(r) * pasoM
    val dz = -cos(r) * pasoM
    val aca = p.aLngLat(x, z)
    val adelante = p.aLngLat(x + dx, z + dz)
    if (metrosEntre(aca, adelante) < pasoM * 3) {
        return rumboGeografico(aca.lng, aca.lat, adelante.lng, adelante.lat)
    }
    val atras = p.aLngLat(x - dx, z - dz)
    return rumboGeografico(atras.lng, atras.lat, aca.lng, aca.lat)
}

// roadLineWidth en pure.js: de lejos el ancho de siempre y de cerca el del juego
// (9 m por 0,8), en pixeles segun la latitud del centro. Base 2: entre dos zooms
// enteros el ancho real se duplica, igual que el mapa.
private const val CALLE_JUEGO_M = 9.0
private const val CALLE_PARTE = 0.8
private const val CALLE_ZOOM_MIN = 5
private const val CALLE_ZOOM_MAX = 22
private const val CIRCUNFERENCIA_MERCATOR_M = 40075016.686

internal fun anchoDeCalle(base: List<Double>, metrosPorMetroDeJuego: Double, lat: Double): List<Double> {
    if (metrosPorMetroDeJuego <= 0 || !lat.isFinite()) return base
    fun deLejos(z: Double): Double {
        if (z <= base[0]) return base[1]
        var i = 2
        while (i < base.size) {
            if (z <= base[i]) {
                val z0 = base[i - 2]
                val w0 = base[i - 1]
                return w0 + (base[i + 1] - w0) * (z - z0) / (base[i] - z0)
            }
            i += 2
        }
        return base.last()
    }
    // Mas alla de los 78 grados (ninguna variante llega) no crece sin limite.
    val coseno = max(0.2, cos(rad(lat)))
    return buildList {
        for (z in CALLE_ZOOM_MIN..CALLE_ZOOM_MAX) {
            val real = CALLE_PARTE * CALLE_JUEGO_M * metrosPorMetroDeJuego * 512 * 2.0.pow(z) /
                (CIRCUNFERENCIA_MERCATOR_M * coseno)
            add(z.toDouble())
            add(kotlin.math.round(max(deLejos(z.toDouble()), real) * 100) / 100)
        }
    }
}
