package com.trucksimdash.app

import com.trucksimdash.app.core.ESCALA_BLOQUE_MAX
import com.trucksimdash.app.core.ESCALA_BLOQUE_MIN
import com.trucksimdash.app.core.PosBloque
import com.trucksimdash.app.core.anclaDe
import com.trucksimdash.app.core.escalaPara
import com.trucksimdash.app.core.escribirDisposicion
import com.trucksimdash.app.core.esquinaDe
import com.trucksimdash.app.core.leerDisposicion
import com.trucksimdash.app.core.parsearObjeto
import com.trucksimdash.app.mapa.CapasMapa
import com.trucksimdash.app.mapa.LngLat
import com.trucksimdash.app.mapa.VarianteMapa
import com.trucksimdash.app.mapa.estiloDe
import com.trucksimdash.app.nav.Maniobra
import com.trucksimdash.app.nav.Pedazos
import com.trucksimdash.app.nav.parsearBusqueda
import com.trucksimdash.app.nav.parsearEntrega
import com.trucksimdash.app.nav.parsearNavegacion
import com.trucksimdash.app.nav.parsearTablero
import okhttp3.OkHttpClient
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** Lo que la web agrego a fines de noviembre y la app dibuja con lo que le da el motor. */
class ParidadWebTest {
    @Test
    fun `la proxima parada, la del bus, el aviso de F5 y lo que puede ser el GPS del juego`() {
        val n = parsearNavegacion(
            """{"parada":{"nombre":"Next stop: Ely","eta":"12 mi · 7:40 PM","saltear":"Skip"},
               "paradaBus":{"texto":"Next stop (1/2): Provo","hora":"due 14:05","tarde":true},
               "avisoGuardar":"Save in the game with F5 to follow its new GPS destination.",
               "adivinanzas":["Coastline Mining (Salt Lake City)"],"textoAdivinanzas":"At that distance it could be:"}""",
        )!!
        assertEquals("Next stop: Ely", n.parada!!.nombre)
        assertEquals("12 mi · 7:40 PM", n.parada!!.eta)
        assertEquals("Skip", n.parada!!.saltear)
        assertTrue(n.paradaBus!!.tarde)
        assertEquals("due 14:05", n.paradaBus!!.hora)
        assertTrue(n.avisoGuardar!!.contains("F5"))
        assertEquals(listOf("Coastline Mining (Salt Lake City)"), n.adivinanzas)
        // Sin nada de eso, nada.
        val vacio = parsearNavegacion("{}")!!
        assertNull(vacio.parada)
        assertNull(vacio.paradaBus)
        assertNull(vacio.avisoGuardar)
        assertTrue(vacio.adivinanzas.isEmpty())
    }

    @Test
    fun `el ferry y el tren tienen su icono, y sin puerto todavia es el barco`() {
        fun maniobra(info: String) = parsearNavegacion("""{"giro":{"text":"⛴ Take the ferry","info":$info}}""")!!.giro!!.maniobra
        assertEquals(Maniobra.Ferry, maniobra("""{"kind":"ferry","port":"Dover","train":false}"""))
        assertEquals(Maniobra.Tren, maniobra("""{"kind":"ferry","port":"Folkestone","train":true}"""))
        assertEquals(Maniobra.Ferry, maniobra("""{"kind":"ferry","port":null}"""))
    }

    @Test
    fun `las paradas de un bus en la tarjeta de entrega`() {
        val e = parsearEntrega(
            parsearObjeto(
                """{"titulo":"Delivered","filas":[["Passengers","25"]],"cerrar":"Close","tituloParadas":"Stops",
                   "paradas":[{"nombre":"Salt Lake City","hora":"8:02 AM","tarde":"+2 min late"},{"nombre":"Provo","hora":"8:30 AM","tarde":null}]}""",
            )!!,
        )
        assertEquals("Stops", e.tituloParadas)
        assertEquals(2, e.paradas.size)
        assertEquals("+2 min late", e.paradas[0].tarde)
        assertNull(e.paradas[1].tarde)
        assertTrue(parsearEntrega(parsearObjeto("""{"titulo":"x"}""")!!).paradas.isEmpty())
    }

    @Test
    fun `el buscador sabe si la variante trae el Atlas o las terminales de bus`() {
        assertEquals(setOf("b"), parsearBusqueda("""{"hay":{"a":false,"b":true},"lista":[]}""").extras)
        assertEquals(setOf("a"), parsearBusqueda("""{"hay":{"a":true,"b":false},"lista":[]}""").extras)
        assertTrue(parsearBusqueda("""{"lista":[]}""").extras.isEmpty())
    }

    @Test
    fun `las terminales de bus van en el estilo, con su fuente y sus dos iconos`() {
        val estilo = estiloDe(VarianteMapa("ets2", "ETS2", "ets2", "ets2", "20261110", null, LngLat(10.0, 50.0)), 50.0)
        val o = parsearObjeto(estilo)!!
        assertTrue(o["sources"].toString().contains("\"${CapasMapa.FUENTE_BUSES}\""))
        assertTrue(estilo.contains("\"id\":\"bus-stop\""))
        assertTrue(estilo.contains(CapasMapa.IMAGEN_BUS_LINEA) && estilo.contains(CapasMapa.IMAGEN_BUS_TURISMO))
    }

    @Test
    fun `un pedazo del mapa bajado sale del archivo, y nada fuera de lo razonable`() {
        val archivo = File.createTempFile("mapa", ".pmtiles")
        try {
            val datos = ByteArray(1000) { (it % 251).toByte() }
            archivo.writeBytes(datos)
            val http = OkHttpClient()
            assertEquals("bytes=100-149", Pedazos.rango(100, 50))
            assertArrayEquals(datos.copyOfRange(100, 150), Pedazos.leer("https://ejemplo.invalid/x", 100, 50, archivo, http))
            // Al final del archivo viene lo que hay, como un 206 de verdad.
            assertArrayEquals(datos.copyOfRange(990, 1000), Pedazos.leer("https://ejemplo.invalid/x", 990, 50, archivo, http))
            assertNull(Pedazos.leer("https://ejemplo.invalid/x", 2000, 50, archivo, http))
            assertNull(Pedazos.leer("https://ejemplo.invalid/x", -1, 50, archivo, http))
            assertNull(Pedazos.leer("https://ejemplo.invalid/x", 0, Pedazos.TOPE_BYTES + 1, archivo, http))
        } finally {
            archivo.delete()
        }
    }

    @Test
    fun `un bloque movido queda contra el borde mas cercano, como layoutAnchor`() {
        // Arriba a la izquierda: desde la izquierda y desde arriba.
        assertEquals(PosBloque(x = 10f, y = 5f), anclaDe(100f, 100f, 200f, 100f, 1000f, 2000f, 1f))
        // Abajo a la derecha: desde la derecha y desde abajo, y con su escala.
        val abajo = anclaDe(700f, 1700f, 200f, 100f, 1000f, 2000f, 1.5f)
        assertEquals(PosBloque(r = 10f, b = 10f, s = 1.5f), abajo)
        assertTrue(abajo.derecha && abajo.abajo)
        // Y vuelve al mismo lugar: la esquina sin escalar de una caja de 200 x 100.
        assertEquals(100 to 100, esquinaDe(PosBloque(x = 10f, y = 5f), 200, 100, 1000, 2000))
        assertEquals(700 to 1700, esquinaDe(PosBloque(r = 10f, b = 10f), 200, 100, 1000, 2000))
        // Otra pantalla: pegado abajo sigue abajo (lo que pidio Gargamosch en la web).
        assertEquals(700 to 2600, esquinaDe(PosBloque(r = 10f, b = 10f), 200, 100, 1000, 3000))
    }

    @Test
    fun `la esquina agranda hasta lo que entra, como layoutScaleFor`() {
        assertEquals(1.5f, escalaPara(1f, 200f, 100f, 100f, 0f, 1000f, 1000f), 1e-6f)
        // Para abajo tambien agranda: sigue a la direccion que mas se movio.
        assertEquals(2f, escalaPara(1f, 200f, 100f, 0f, 100f, 1000f, 1000f), 1e-6f)
        assertEquals(ESCALA_BLOQUE_MAX, escalaPara(1f, 200f, 100f, 5000f, 0f, 10000f, 10000f), 1e-6f)
        assertEquals(ESCALA_BLOQUE_MIN, escalaPara(1f, 200f, 100f, -190f, -90f, 1000f, 1000f), 1e-6f)
        // No mas de lo que entra hasta el borde: 300 px de ancho para una caja de 200.
        assertEquals(1.5f, escalaPara(1f, 200f, 100f, 400f, 0f, 300f, 1000f), 1e-6f)
    }

    @Test
    fun `lo acomodado se guarda y se lee, y lo roto se ignora`() {
        val d = mapOf("botones" to PosBloque(r = 3f, b = 12.5f, s = 1.2f), "giro" to PosBloque(x = 0f, y = 2f))
        assertEquals(d, leerDisposicion(escribirDisposicion(d)))
        assertTrue(leerDisposicion("""{"giro":{"x":5}}""").isEmpty())
        assertTrue(leerDisposicion("no es json").isEmpty())
        assertEquals(ESCALA_BLOQUE_MAX, leerDisposicion("""{"giro":{"x":1,"y":1,"s":9}}""")["giro"]!!.s, 1e-6f)
    }

    @Test
    fun `el panel Moderno se lee como lo arma el motor, y sin la conduccion no hay panel`() {
        val t = parsearTablero(
            parsearObjeto(
                """{"cinta":{"desde":"Salt Lake City","desdeSub":"Coastline Mining","falta":"422 mi","faltaSub":"remaining · 0:21 real",
                   "hasta":"Las Vegas","hastaSub":"Bitumen · arrival 6:16 PM","hecho":0.38,
                   "descanso":{"izq":82,"ancho":12,"etiqueta":"rest here"},"carga":null},
                   "conduccion":{"vel":"57","unidad":"mph","limite":"65","exceso":false,"marcha":"9","crucero":"56","rpm":0.54,"rpmAlta":false,
                   "testigos":[["beamLow",true,"Low beam"],["blinkerLeft",false,"Blinkers"]],"retarder":null},
                   "llegada":{"titular":"Arriving 1 h 51 min early","estado":"bien","linea":"due in 9 h 00 min","pago":"$61,158 · $56 per km"},
                   "combustible":{"titular":"Enough fuel to Las Vegas","titularEstado":"bien","descanso":"No sleep needed before arriving",
                   "descansoEstado":"bien","linea":"400 l · 67 %","bajo":"AdBlue 50 %","bajoAlerta":false},
                   "camion":{"titular":"Wheels at 31 %","titularEstado":"mal","piezas":[["Engine","3 %","bien",false],["Wheels","14 %","medio",true]],
                   "linea":"Volvo VNL","lineaAlerta":false,"medidores":[["90 °C","Oil",false],["132 psi","Air",true]]},
                   "franja":{"carga":"Bulldozer","cargaSub":"18.2 t","metricas":[["1 km","driven"],["$0","net"]],"reiniciar":"Reset","desde":null}}""",
            ),
        )!!
        val c = t.cinta!!
        assertEquals("Las Vegas", c.hasta)
        assertEquals(0.38, c.hecho, 0.0)
        assertEquals("rest here", c.descanso!!.etiqueta)
        assertNull(c.carga)
        assertEquals("57", t.conduccion.vel)
        assertEquals(listOf("beamLow" to true, "blinkerLeft" to false), t.conduccion.testigos.map { it.clave to it.prendido })
        assertNull(t.conduccion.retarder)
        assertEquals("bien", t.llegada!!.estado)
        assertEquals("Enough fuel to Las Vegas", t.combustible.titular)
        assertEquals("mal", t.camion.titularEstado)
        assertTrue(t.camion.piezas[1].remolque)
        assertEquals("medio", t.camion.piezas[1].nivel)
        assertTrue(t.camion.medidores[1].alerta)
        assertEquals(listOf("1 km" to "driven", "$0" to "net"), t.franja.metricas)
        // Sin trabajo: sin cinta ni llegada.
        val libre = parsearTablero(parsearObjeto("""{"cinta":null,"conduccion":{"vel":"0","marcha":"N","testigos":[]},"llegada":null}"""))!!
        assertNull(libre.cinta)
        assertNull(libre.llegada)
        assertNull(libre.combustible.titular)
        assertTrue(libre.camion.piezas.isEmpty())
        assertNull(parsearTablero(parsearObjeto("""{"cinta":null}""")))
    }
}
