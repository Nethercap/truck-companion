package com.trucksimdash.app

import android.graphics.Bitmap
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.trucksimdash.app.core.parsearObjeto
import com.trucksimdash.app.cuenta.Viaje
import com.trucksimdash.app.cuenta.parsearAno
import com.trucksimdash.app.cuenta.parsearMapa
import com.trucksimdash.app.ui.TARJETA_H
import com.trucksimdash.app.ui.TARJETA_W
import com.trucksimdash.app.ui.tarjetaDeViaje
import com.trucksimdash.app.ui.tarjetaDelAno
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import kotlin.math.cos
import kotlin.math.sin

/**
 * Las tarjetas para compartir (las de la cuenta en la web) se dibujan enteras, con Canvas de
 * Android: deja los PNG en los archivos de la app para mirarlos (adb pull).
 */
@RunWith(AndroidJUnit4::class)
class TarjetasCompartirTest {
    private val contexto = InstrumentationRegistry.getInstrumentation().targetContext

    private fun guardar(b: Bitmap, nombre: String): File {
        val f = File(contexto.getExternalFilesDir(null), nombre)
        f.outputStream().use { b.compress(Bitmap.CompressFormat.PNG, 100, it) }
        return f
    }

    /** Que no sea un fondo liso: algo se dibujo. */
    private fun colores(b: Bitmap): Int {
        val vistos = HashSet<Int>()
        for (y in 0 until b.height step 23) for (x in 0 until b.width step 23) vistos.add(b.getPixel(x, y))
        return vistos.size
    }

    @Test
    fun laTarjetaDeUnViaje() {
        val v = Viaje(
            id = "1", juego = "ets2", estado = "delivered", ciudadOrigen = "Calais", ciudadDestino = "Dover",
            empresaOrigen = "Tradeaux", empresaDestino = "Posped", carga = "Madera", cargaKg = 18000.0, pago = 5230.0,
            moneda = "EUR", modeado = false, camion = "Scania S", kmJuego = 312.0, kmMedidos = 315.0,
            empezado = "2026-11-20T10:00:00Z", aTiempo = true, combustible = 98.0, velocidadMedia = 71.0, dano = null,
            multas = null, horasReales = 4.1, entregado = "2026-11-20T14:06:00Z",
        )
        // Una curva con velocidades, y un salto (el ferry) que se dibuja punteado.
        val tramo1 = (0..60).map { i -> doubleArrayOf(i * 120.0, 400 * sin(i / 9.0), 40.0 + i) }
        val tramo2 = (0..40).map { i -> doubleArrayOf(9500.0 + i * 100, 300 * cos(i / 7.0) - 2000, 80.0 - i) }
        val b = tarjetaDeViaje(contexto, v, listOf(tramo1, tramo2), "probador", millas = false)
        assertEquals(TARJETA_W, b.width)
        assertEquals(TARJETA_H, b.height)
        assertTrue("tarjeta casi vacia", colores(b) > 40)
        guardar(b, "tarjeta-viaje.png")
        // Sin recorrido: el aviso en la caja, y todo lo demas igual.
        guardar(tarjetaDeViaje(contexto, v.copy(estado = "cancelled", aTiempo = null), emptyList(), null, millas = true), "tarjeta-viaje-sin.png")
    }

    @Test
    fun laTarjetaDelAnoConElMapa() {
        val ano = parsearAno(
            parsearObjeto(
                """{"year":2026,"stats":[{"game":"ets2","trips":40,"delivered":38,"top":{"trucks":[{"name":"Scania S","trips":20}]}}],
                   "totals":[{"game":"ets2","distance_km":18500,"real_hours":210.5}],"days_driven":120,"longest_streak":9}""",
            ),
        )!!
        val mapa = parsearMapa(
            parsearObjeto(
                """{"map":{"trips":38,"lines":[[[2.35,48.85],[4.35,50.85],[6.95,50.94],[8.68,50.11]],[[2.35,48.85],[1.85,50.95],[1.31,51.12],[-0.12,51.5]]],
                   "cities":[{"name":"Paris","visits":12,"lnglat":[2.35,48.85]},{"name":"Brussel","visits":7,"lnglat":[4.35,50.85]},{"name":"London","visits":5,"lnglat":[-0.12,51.5]}],
                   "regions":[{"name":"France","trips":12},{"name":"Belgium","trips":7},{"name":"UK","trips":5},{"name":"Germany","trips":4}]}}""",
            ),
        )!!
        val b = tarjetaDelAno(contexto, ano, mapOf("ets2" to mapa), "probador", millas = false)
        assertEquals(TARJETA_W, b.width)
        assertTrue("tarjeta casi vacia", colores(b) > 40)
        guardar(b, "tarjeta-ano.png")
    }
}
