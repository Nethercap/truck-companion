package com.trucksimdash.app

import com.trucksimdash.app.core.parsearObjeto
import com.trucksimdash.app.telemetria.parsearTelemetria
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TelemetriaTest {
    private fun t(json: String) = parsearTelemetria(parsearObjeto(json)!!)

    /** Sale de build_payload del cliente de verdad (tools/generar_telemetria.py). */
    @Test
    fun `lee el mensaje que arma el cliente de la PC`() {
        val texto = javaClass.classLoader!!.getResource("telemetria-cliente.json")!!.readText()
        val d = parsearTelemetria(parsearObjeto(texto)!!)
        assertEquals("ats", d.juego)
        assertEquals(-48320.5, d.x!!, 1e-9)
        assertEquals(-6177.25, d.z!!, 1e-9)
        assertEquals(90.0, d.velocidadKmh, 0.01)
        assertEquals(99.0, d.limiteKmh, 0.01)
        assertEquals(9, d.marcha)
        assertEquals(150.0, d.rutaKm, 1e-9)
        assertEquals(7200.0, d.rutaSegundos!!, 1e-9)
        assertEquals(300.0, d.descansoMinutos!!, 1e-9)
        assertEquals(600 * 60.0, d.plazoSegundos!!, 1e-9)
        assertEquals("Madera", d.carga)
        assertEquals("Denver", d.ciudadOrigen)
        assertEquals("Salt Lake City", d.ciudadDestino)
        assertEquals("Kenworth", d.marca)
        assertEquals(35.0, d.consumoLitrosCada100!!, 1e-9)
        assertEquals(0.5, d.fraccionCombustible!!, 1e-9)
        assertEquals(0.05, d.desgaste.motor!!, 1e-9)
        assertTrue(d.luces.bajas)
        assertTrue(d.luces.baliza)
        assertTrue(d.luces.giroIzquierda)
        assertFalse(d.luces.altas)
        assertTrue(d.crucero)
        assertEquals(90.0, d.cruceroKmh, 0.01)
        assertTrue(d.limpiaparabrisas)
        assertTrue(d.motorEncendido)
        assertTrue(d.ejeElevado)
        assertEquals(2, d.retarder)
        assertTrue(d.remolqueEnganchado)
        assertTrue(d.alertas.aire)
        assertFalse(d.alertas.combustible)
        assertTrue(d.evento.multa)
        assertEquals(500.0, d.evento.montoMulta!!, 1e-9)
        assertTrue(d.enTrabajo)
    }

    @Test
    fun `un cliente viejo sin los campos nuevos no rompe nada`() {
        val d = t("""{"game":"ets2","position":{"x":1,"z":2},"speedKmh":50}""")
        assertEquals(50.0, d.velocidadKmh, 0.0)
        assertNull(d.combustible)
        assertNull(d.fraccionCombustible)
        assertNull(d.jugadoresTmp)
        assertFalse(d.alertas.alguna)
        assertEquals(0, d.retarder)
    }

    @Test
    fun `un mensaje vacio o con tipos raros da una telemetria sin datos`() {
        val d = t("""{"speedKmh":"mucho","gear":null,"position":"aca","lights":[]}""")
        assertEquals(0.0, d.velocidadKmh, 0.0)
        assertNull(d.marcha)
        assertFalse(d.tienePosicion)
        assertFalse(d.luces.bajas)
    }

    @Test
    fun `el camion en 0,0 exacto es un dato sin posicion`() {
        val d = t("""{"position":{"x":0,"z":0},"speedKmh":80}""")
        assertNull(d.x)
        assertNull(d.z)
        assertFalse(d.tienePosicion)
        // Sobre un solo eje es un lugar como cualquier otro.
        assertEquals(0.0, t("""{"position":{"x":0,"z":5}}""").x!!, 0.0)
    }

    @Test
    fun `restStopSeconds es el nombre viejo de los mismos minutos`() {
        assertEquals(120.0, t("""{"restStopSeconds":120}""").descansoMinutos!!, 0.0)
    }

    @Test
    fun `se pasa del limite recien con un margen`() {
        assertFalse(t("""{"speedKmh":80.5,"speedLimitKmh":80}""").excedido)
        assertTrue(t("""{"speedKmh":82,"speedLimitKmh":80}""").excedido)
        // Sin limite conocido no hay exceso.
        assertFalse(t("""{"speedKmh":120,"speedLimitKmh":0}""").excedido)
    }

    @Test
    fun `los jugadores de TruckersMP sin coordenadas o repetidos se descartan`() {
        val d = t(
            """{"tmpPlayers":[
                {"id":7,"name":"A","x":1,"z":2,"heading":90},
                {"id":7,"name":"A otra vez","x":1,"z":2},
                {"id":8,"name":"Sin z","x":1},
                {"id":9,"x":3,"z":4}
            ]}""",
        )
        assertEquals(listOf("7", "9"), d.jugadoresTmp!!.map { it.id })
        assertEquals("", d.jugadoresTmp?.get(1)?.nombre)
        assertEquals(0.0, d.jugadoresTmp?.get(1)?.rumbo ?: -1.0, 0.0)
    }
}
