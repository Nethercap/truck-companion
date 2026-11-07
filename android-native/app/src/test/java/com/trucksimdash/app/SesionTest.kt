package com.trucksimdash.app

import com.trucksimdash.app.telemetria.MapaLocal
import com.trucksimdash.app.telemetria.AvisoSesion
import com.trucksimdash.app.telemetria.CODIGO_DESCONOCIDO
import com.trucksimdash.app.telemetria.DEMORA_BASE_MS
import com.trucksimdash.app.telemetria.DEMORA_MAX_MS
import com.trucksimdash.app.telemetria.EstadoSesion
import com.trucksimdash.app.telemetria.Fase
import com.trucksimdash.app.telemetria.INTENTOS_CODIGO_GUARDADO
import com.trucksimdash.app.telemetria.MensajeRelay
import com.trucksimdash.app.telemetria.PuntoRastro
import com.trucksimdash.app.telemetria.TMP_VENCE_MS
import com.trucksimdash.app.telemetria.TrasCierre
import com.trucksimdash.app.telemetria.aplicar
import com.trucksimdash.app.telemetria.avisosDe
import com.trucksimdash.app.telemetria.decidirTrasCierre
import com.trucksimdash.app.telemetria.interpretarMensaje
import com.trucksimdash.app.telemetria.mantenerMods
import com.trucksimdash.app.telemetria.parsearTelemetria
import com.trucksimdash.app.telemetria.sumarAlRastro
import com.trucksimdash.app.core.parsearObjeto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SesionTest {
    private fun aplicar(e: EstadoSesion, json: String, ahora: Long = 0): EstadoSesion =
        e.aplicar(interpretarMensaje(json)!!, ahora)

    @Test
    fun `un mensaje sin type es telemetria y uno con un type desconocido no`() {
        assertTrue(interpretarMensaje("""{"speedKmh":10}""") is MensajeRelay.DatosTelemetria)
        // route_plan, convoy_*, voice_device: esta version no los usa todavia.
        assertEquals(MensajeRelay.Otro, interpretarMensaje("""{"type":"route_plan","rev":1}"""))
        assertEquals(MensajeRelay.Otro, interpretarMensaje("""{"type":"algo_que_no_existe"}"""))
    }

    @Test
    fun `un texto que no es JSON se ignora`() {
        assertNull(interpretarMensaje("no soy json"))
        assertNull(interpretarMensaje("[1,2]"))
    }

    @Test
    fun `la telemetria deja la sesion en vivo`() {
        val e = aplicar(EstadoSesion(fase = Fase.Abierta), """{"game":"ats","position":{"x":100,"z":200},"speedKmh":10}""")
        assertTrue(e.enVivo)
        assertTrue(e.codigoValidado)
        assertEquals("ats", e.telemetria!!.juego)
        assertEquals(listOf(PuntoRastro(100.0, 200.0)), e.rastro)
    }

    @Test
    fun `se cae el cliente de la PC y deja de estar en vivo`() {
        val vivo = aplicar(EstadoSesion(), """{"game":"ats"}""")
        val sinPc = aplicar(vivo, """{"type":"session_state","client_connected":false}""")
        assertFalse(sinPc.pcConectada)
        assertFalse(sinPc.enVivo)
    }

    @Test
    fun `el cliente sale de live y deja de estar en vivo`() {
        val vivo = aplicar(EstadoSesion(), """{"game":"ats"}""")
        val e = aplicar(vivo, """{"type":"client_status","status":"waiting_game","detail":"Abri el juego"}""")
        assertEquals("waiting_game", e.estadoPc)
        assertEquals("Abri el juego", e.detallePc)
        assertTrue(e.pcConectada)
        assertFalse(e.enVivo)
    }

    @Test
    fun `una pestana que abre despues se entera por session_state`() {
        val e = aplicar(
            EstadoSesion(),
            """{"type":"session_state","client_connected":true,"client_status":
               {"type":"client_status","status":"live","mapMods":{"ats":{"c2c":true,"reforma":false},"ets2":null}}}""",
        )
        assertTrue(e.pcConectada)
        assertEquals("live", e.estadoPc)
        assertEquals(setOf("c2c"), e.mods?.get("ats"))
        assertNull(e.mods?.get("ets2"))
    }

    @Test
    fun `lo que dijo el relay de compartir no lo pisa un session_state sin esa clave`() {
        val e = aplicar(EstadoSesion(), """{"type":"live_share_state","enabled":true}""")
        assertEquals(true, e.compartiendo)
        val despues = aplicar(e, """{"type":"session_state","client_connected":true}""")
        assertEquals(true, despues.compartiendo)
        val porLan = aplicar(e, """{"type":"session_state","client_connected":true,"liveShare":false}""")
        assertEquals(false, porLan.compartiendo)
    }

    @Test
    fun `mientras el cliente relee el log no se pierden los mods que ya se sabian`() {
        val previo = mapOf("ats" to setOf("c2c"), "ets2" to null)
        val nuevo = mapOf("ats" to null, "ets2" to setOf("promods"))
        assertEquals(mapOf("ats" to setOf("c2c"), "ets2" to setOf("promods")), mantenerMods(previo, nuevo))
        assertEquals(previo, mantenerMods(previo, null))
    }

    @Test
    fun `el 4404 de un codigo tipeado avisa enseguida`() {
        assertEquals(TrasCierre.CodigoInvalido, decidirTrasCierre(CODIGO_DESCONOCIDO, false, false, 1))
    }

    @Test
    fun `el 4404 de un codigo guardado espera un rato a que abran el cliente`() {
        assertEquals(TrasCierre.Reintentar(DEMORA_BASE_MS), decidirTrasCierre(CODIGO_DESCONOCIDO, false, true, 1))
        assertEquals(TrasCierre.CodigoInvalido, decidirTrasCierre(CODIGO_DESCONOCIDO, false, true, INTENTOS_CODIGO_GUARDADO))
    }

    @Test
    fun `el 4404 de un codigo que ya anduvo es un redeploy y se sigue intentando`() {
        assertTrue(decidirTrasCierre(CODIGO_DESCONOCIDO, true, false, 1) is TrasCierre.Reintentar)
        assertTrue(decidirTrasCierre(CODIGO_DESCONOCIDO, true, false, 50) is TrasCierre.Reintentar)
    }

    @Test
    fun `una red caida reintenta cada vez mas espaciado, con tope`() {
        assertEquals(TrasCierre.Reintentar(3000), decidirTrasCierre(1006, false, false, 1))
        assertEquals(TrasCierre.Reintentar(6000), decidirTrasCierre(1006, false, false, 2))
        assertEquals(TrasCierre.Reintentar(12000), decidirTrasCierre(1006, false, false, 3))
        assertEquals(TrasCierre.Reintentar(DEMORA_MAX_MS), decidirTrasCierre(1006, false, false, 4))
        assertEquals(TrasCierre.Reintentar(DEMORA_MAX_MS), decidirTrasCierre(1006, false, false, 40))
    }

    @Test
    fun `el rastro anota cada tanto y empieza de nuevo despues de un salto`() {
        var r = sumarAlRastro(emptyList(), 0.0, 0.0)
        r = sumarAlRastro(r, 10.0, 0.0) // muy cerca: no se anota
        assertEquals(1, r.size)
        r = sumarAlRastro(r, 50.0, 0.0)
        assertEquals(2, r.size)
        r = sumarAlRastro(r, 50000.0, 0.0) // un ferry
        assertEquals(listOf(PuntoRastro(50000.0, 0.0)), r)
    }

    @Test
    fun `el rastro no crece sin limite`() {
        var r = emptyList<PuntoRastro>()
        for (i in 0 until 2000) r = sumarAlRastro(r, i * 100.0, 0.0)
        assertTrue(r.size <= 1500)
        assertEquals(199900.0, r.last().x, 0.0)
    }

    @Test
    fun `los jugadores de TMP vencen a los 5 segundos de la ultima lista`() {
        val e = aplicar(EstadoSesion(), """{"tmpPlayers":[{"id":1,"x":1,"z":1}]}""", ahora = 1000)
        assertEquals(1, e.jugadoresTmp.size)
        assertEquals(1000 + TMP_VENCE_MS, e.tmpHastaMs)
        // Un dato sin la lista no la borra ni estira el vencimiento.
        val sin = aplicar(e, """{"speedKmh":10}""", ahora = 2000)
        assertEquals(1, sin.jugadoresTmp.size)
        assertEquals(1000 + TMP_VENCE_MS, sin.tmpHastaMs)
    }

    @Test
    fun `los mapas armados en la PC se leen del estado del cliente`() {
        val m = interpretarMensaje(
            """{"type":"client_status","status":"live","localMapPort":27765,"localMaps":{
              "ats":{"variant":"local_ats","fingerprint":"abc","companyIcons":12},
              "ets2":{"variant":"local_ets2","fingerprint":"def"}}}""",
        ) as MensajeRelay.EstadoCliente
        assertEquals(27765, m.estado.puertoMapas)
        assertEquals(MapaLocal("local_ats", "abc", true), m.estado.mapasLocales["ats"])
        assertEquals(MapaLocal("local_ets2", "def", false), m.estado.mapasLocales["ets2"])
        // Un cliente viejo no los manda: nada, sin romperse.
        val viejo = interpretarMensaje("""{"type":"client_status","status":"live"}""") as MensajeRelay.EstadoCliente
        assertTrue(viejo.estado.mapasLocales.isEmpty())
    }

    @Test
    fun `una multa da un aviso, la entrega la muestra la web`() {
        val t = parsearTelemetria(parsearObjeto("""{"event":{"fined":true,"fineAmount":300,"jobDelivered":true,"jobDeliveredRevenue":9000}}""")!!)
        assertEquals(listOf(AvisoSesion.Multa(300.0)), avisosDe(t))
        assertTrue(avisosDe(parsearTelemetria(parsearObjeto("{}")!!)).isEmpty())
    }

    @Test
    fun `el resultado de un comando y los jugadores cerca se leen`() {
        assertEquals(
            MensajeRelay.ResultadoComando(false, "no_key"),
            interpretarMensaje("""{"type":"command_result","action":"x","ok":false,"reason":"no_key"}"""),
        )
        val e = aplicar(EstadoSesion(), """{"type":"live_players","players":[{"id":"a","x":1,"z":2},{"id":"sin-z","x":1}]}""")
        assertEquals(listOf("a"), e.otros.map { it.id })
    }
}
