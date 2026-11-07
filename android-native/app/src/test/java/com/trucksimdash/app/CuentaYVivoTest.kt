package com.trucksimdash.app

import com.trucksimdash.app.core.Unidades
import com.trucksimdash.app.core.distancia
import com.trucksimdash.app.core.duracionMinutos
import com.trucksimdash.app.core.marcha
import com.trucksimdash.app.core.parsearObjeto
import com.trucksimdash.app.core.porcentajeTexto
import com.trucksimdash.app.core.relojDelJuego
import com.trucksimdash.app.core.usaMillas
import com.trucksimdash.app.cuenta.DiaActividad
import com.trucksimdash.app.cuenta.parsearLogros
import com.trucksimdash.app.cuenta.parsearResumenes
import com.trucksimdash.app.cuenta.parsearTotales
import com.trucksimdash.app.cuenta.parsearUsuario
import com.trucksimdash.app.cuenta.parsearViajes
import com.trucksimdash.app.cuenta.serieActividad
import com.trucksimdash.app.vivo.EstadoMapaVivo
import com.trucksimdash.app.vivo.MensajeVivo
import com.trucksimdash.app.vivo.aplicar
import com.trucksimdash.app.vivo.interpretarVivo
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

class CuentaYVivoTest {
    @Test
    fun `el resumen de stats se lee con la forma que da la API`() {
        val d = parsearObjeto(
            """{"stats":[{"game":"ets2","trips":12,"delivered":10,"on_time":8,"late":2,"unfinished":2,"modded":1,
            "distance_km":5400.5,"real_hours":70.25,"game_hours":900,"fuel_used":2000,"max_speed":110,"damage_avg":0.01,
            "money":[{"currency":"EUR","revenue":100000,"tolls":500,"fines":200,"ferries":0,"penalties":50}],
            "countries":["DE","FR"],"longest":{"id":"t1","city_src":"Berlin","city_dst":"Madrid","distance_km":2300},
            "top":{"trucks":[{"name":"Volvo FH","trips":7,"distance_km":3000}],"cargo":[{"name":"Madera","trips":3}],
                   "companies":[],"cities":[{"name":"Berlin","trips":4}]},
            "records":{"best_pay":{"id":"t2","city_src":"A","city_dst":"B","value":30000,"currency":"EUR"},
                       "heaviest":{"id":"t3","value":40000,"cargo":"Acero"}},
            "fuel_by_truck":[{"name":"Volvo FH","l_per_100km":31.5,"distance_km":3000}]},
            {"game":"ats","trips":0}]}""",
        )
        val r = parsearResumenes(d)
        assertEquals(listOf("ets2", "ats"), r.map { it.juego })
        val e = r[0]
        assertEquals(10, e.entregados)
        assertEquals(5400.5, e.km, 0.0)
        assertEquals("EUR", e.plata[0].moneda)
        assertEquals(50.0, e.plata[0].penalidades, 0.0)
        assertEquals("Madrid", e.masLargoDestino)
        assertEquals("Volvo FH", e.camiones[0].nombre)
        assertEquals(30000.0, e.mejorPago!!.valor, 0.0)
        assertEquals("Acero", e.masPesado!!.carga)
        assertNull(e.mejorPromedio)
        assertEquals(31.5, e.consumoPorCamion[0].litrosCada100, 0.0)
        // Un juego casi vacio tampoco rompe nada.
        assertEquals(0, r[1].entregados)
        assertTrue(r[1].plata.isEmpty())
    }

    @Test
    fun `la API sin respuesta da listas vacias, no una excepcion`() {
        assertTrue(parsearResumenes(null).isEmpty())
        assertTrue(parsearTotales(parsearObjeto("{}")).isEmpty())
        assertTrue(parsearLogros(null).isEmpty())
        assertEquals(0, parsearViajes(null).second)
    }

    @Test
    fun `un token que no es de nadie da usuario nulo`() {
        assertNull(parsearUsuario(parsearObjeto("""{"usuario":null}""")))
        assertEquals("tomi", parsearUsuario(parsearObjeto("""{"usuario":{"id":"1","username":"tomi","is_public":true}}"""))!!.nombre)
    }

    @Test
    fun `de un viaje vale la distancia del juego y si no la medida`() {
        val (lista, total) = parsearViajes(
            parsearObjeto(
                """{"trips":[{"id":"a","distance_game_km":100,"distance_tracked_km":90,"truck_brand":"Volvo","truck_name":"FH","modded":true},
                {"id":"b","distance_tracked_km":50},{"sin":"id"}],"total":238}""",
            ),
        )
        assertEquals(238, total)
        assertEquals(listOf("a", "b"), lista.map { it.id })
        assertEquals(100.0, lista[0].km!!, 0.0)
        assertEquals(50.0, lista[1].km!!, 0.0)
        assertEquals("Volvo FH", lista[0].camion)
        assertTrue(lista[0].modeado)
    }

    @Test
    fun `los logros traen fecha o progreso`() {
        val l = parsearLogros(
            parsearObjeto(
                """{"achievements":[{"id":"deliveries_1","unlocked_at":"2026-10-03T17:00:00Z","progress":{"value":1,"goal":1}},
                {"id":"ferry","unlocked_at":null}]}""",
            ),
        )
        assertEquals("2026-10-03T17:00:00Z", l[0].desbloqueado)
        assertEquals(1.0, l[0].meta!!, 0.0)
        assertNull(l[1].desbloqueado)
        assertNull(l[1].meta)
    }

    @Test
    fun `la serie de actividad cuenta cada dia, tambien los vacios, y solo ese juego`() {
        val hoy = Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply { set(2026, Calendar.MARCH, 2) }
        val s = serieActividad(
            listOf(
                DiaActividad("2026-03-02", "ets2", 100.0, 1.0, 2),
                DiaActividad("2026-02-28", "ets2", 50.0, 1.0, 0),
                DiaActividad("2026-03-02", "ats", 999.0, 1.0, 9),
                DiaActividad("2026-01-01", "ets2", 999.0, 1.0, 9),
            ),
            "ets2",
            4,
            hoy,
        )
        assertEquals(listOf("2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"), s.map { it.fecha })
        assertEquals(listOf(0.0, 50.0, 0.0, 100.0), s.map { it.km })
        assertEquals(2, s.last().viajes)
    }

    @Test
    fun `las unidades automaticas siguen al juego`() {
        assertTrue(usaMillas(Unidades.Auto, "ats"))
        assertTrue(!usaMillas(Unidades.Auto, "ets2"))
        assertTrue(!usaMillas(Unidades.Auto, null))
        assertTrue(usaMillas(Unidades.Millas, "ets2"))
        assertTrue(!usaMillas(Unidades.Kilometros, "ats"))
    }

    @Test
    fun `los formatos no se rompen con los bordes`() {
        Locale.setDefault(Locale.ROOT)
        assertEquals("N", marcha(0))
        assertEquals("R", marcha(-1))
        assertEquals("R2", marcha(-2))
        assertEquals("12", marcha(12))
        assertEquals("-", marcha(null))
        assertEquals("12.5 km", distancia(12.5, false))
        assertEquals("1,000 km", distancia(1000.0, false))
        assertEquals("62.1 mi", distancia(100.0, true))
        assertEquals("1 h 05 min", duracionMinutos(65.0))
        assertEquals("45 min", duracionMinutos(45.0))
        assertEquals("0 min", duracionMinutos(-10.0))
        assertEquals("-", porcentajeTexto(1, 0))
        assertEquals("50 %", porcentajeTexto(1, 2))
        assertEquals(1 to "00:30", relojDelJuego(1440.0 + 30))
        assertEquals(1 to "12:30 AM", relojDelJuego(1440.0 + 30, hora12 = true))
        assertEquals(0 to "1:05 PM", relojDelJuego(13 * 60.0 + 5, hora12 = true))
    }

    @Test
    fun `el mapa en vivo lee conductores y rutas`() {
        val m = interpretarVivo(
            """{"type":"live_players","variant":"ats","players":[
                {"id":"a","x":1.5,"z":2.5,"heading":90,"speedKmh":80,"paused":false,"truck":"Volvo","cargo":"Madera",
                 "citySrc":"A","cityDst":"B","distanceKm":10,"nick":"Tomi","routeRev":3},
                {"id":"b","heading":null,"routeRev":0},{"x":1}]}""",
        ) as MensajeVivo.Jugadores
        assertEquals(listOf("a", "b"), m.lista.map { it.id })
        assertEquals("Tomi", m.lista[0].apodo)
        assertEquals(3, m.lista[0].revRuta)
        // Sin posicion sigue en la lista (esta en un mapa que no conocemos).
        assertNull(m.lista[1].x)
        assertEquals(0.0, m.lista[1].rumbo, 0.0)
        assertNull(interpretarVivo("""{"type":"otra_cosa"}"""))
    }

    @Test
    fun `una ruta se borra si su dueno se va o deja de compartirla`() {
        var e = EstadoMapaVivo()
        e = e.aplicar(interpretarVivo("""{"type":"live_route","id":"a","rev":1,"points":[[1,2],[3,4]]}""")!!)
        e = e.aplicar(interpretarVivo("""{"type":"live_route","id":"b","rev":1,"points":[[1,2],[3,4]]}""")!!)
        e = e.aplicar(interpretarVivo("""{"type":"live_route","id":"c","rev":1,"points":[[1,2],[3,4]]}""")!!)
        assertEquals(setOf("a", "b", "c"), e.rutas.keys)
        // Vacia: dejo de compartirla.
        e = e.aplicar(interpretarVivo("""{"type":"live_route","id":"c","rev":2,"points":[]}""")!!)
        assertEquals(setOf("a", "b"), e.rutas.keys)
        // a sigue con ruta, b la saco (routeRev 0) y otro se fue.
        e = e.aplicar(interpretarVivo("""{"type":"live_players","players":[{"id":"a","x":1,"z":1,"routeRev":1},{"id":"b","x":1,"z":1,"routeRev":0}]}""")!!)
        assertEquals(setOf("a"), e.rutas.keys)
    }
}
