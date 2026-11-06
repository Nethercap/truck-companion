package com.trucksimdash.app

import com.trucksimdash.app.core.JsonLaxo
import com.trucksimdash.app.mapa.CatalogoMapas
import com.trucksimdash.app.mapa.LineaRuta
import com.trucksimdash.app.mapa.LngLat
import com.trucksimdash.app.mapa.MarcaJugador
import com.trucksimdash.app.mapa.VarianteMapa
import com.trucksimdash.app.mapa.cajaDesdeCiudades
import com.trucksimdash.app.mapa.diferenciaAngular
import com.trucksimdash.app.mapa.estiloDe
import com.trucksimdash.app.mapa.geojsonJugadores
import com.trucksimdash.app.mapa.geojsonLinea
import com.trucksimdash.app.mapa.geojsonPunto
import com.trucksimdash.app.mapa.geojsonRutas
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class MapaTest {
    private val manifest = File("../../docs/data/map-manifest.json").readText()
    private val catalogo = CatalogoMapas.desdeManifest(manifest)!!

    @Test
    fun `el manifest de la web se lee entero`() {
        assertTrue(catalogo.variantes.size >= 10)
        val ats = catalogo.variantes.getValue("ats")
        assertEquals("ats", ats.juego)
        assertEquals("ats", ats.proyeccion)
        assertEquals(-96.0, ats.centro.lng, 0.0)
        assertTrue(ats.urlTiles.startsWith("pmtiles://https://maps.trucksim-dash.com/vector/ats.pmtiles?v="))
        assertNotNull(ats.mapaBase)
    }

    @Test
    fun `Grand Utopia va con su proyeccion y sin mapa base`() {
        val gu = catalogo.variantes["ets2_gu"] ?: return
        assertEquals("gu", gu.proyeccion)
        assertNull(gu.mapaBase)
    }

    @Test
    fun `una variante sin mapDataVersion no esta en R2 y no se ofrece`() {
        val c = CatalogoMapas.desdeManifest(
            """{"variants":{"ats":{"game":"ats","mapDataVersion":"1"},"ats_nueva":{"game":"ats"}}}""",
        )!!
        assertEquals(setOf("ats"), c.variantes.keys)
    }

    @Test
    fun `un manifest roto no reemplaza a lo que hay`() {
        assertNull(CatalogoMapas.desdeManifest("<html>"))
        assertNull(CatalogoMapas.desdeManifest("""{"variants":{}}"""))
    }

    @Test
    fun `quien juega la version anterior aparece en el mapa de la actual`() {
        assertEquals("ats", catalogo.varianteCompartida("ats_161"))
        assertEquals("ets2", catalogo.varianteCompartida("ets2_161"))
        assertEquals("ats_c2c", catalogo.varianteCompartida("ats_c2c"))
        assertTrue(catalogo.paraMapaEnVivo.none { it.id == "ats_161" })
    }

    @Test
    fun `lo elegido a mano gana a lo detectado, si es de ese juego`() {
        val mods = mapOf("ats" to setOf("c2c"))
        assertEquals("ats_c2c", catalogo.resolver("ats", mods, null))
        assertEquals("ats_161", catalogo.resolver("ats", mods, "ats_161"))
        // Una eleccion de otro juego o de un mapa que ya no esta no rompe nada.
        assertEquals("ats_c2c", catalogo.resolver("ats", mods, "ets2"))
        assertEquals("ats_c2c", catalogo.resolver("ats", mods, "no_existe"))
    }

    @Test
    fun `el estilo es JSON valido y dibuja cada capa de la web`() {
        for (v in catalogo.variantes.values) {
            val estilo = JsonLaxo.parseToJsonElement(estiloDe(v, 45.0)).jsonObject
            val ids = estilo.getValue("layers").jsonArray.map { it.jsonObject.getValue("id").jsonPrimitive.content }
            for (capa in listOf("mapArea", "prefab", "ferry-line", "road-local", "road-divided", "road-freeway", "company", "poi", "ferry-poi", "exit-label", "country-label", "city-label")) {
                assertTrue("${v.id} sin $capa", capa in ids)
            }
            // Lo propio arriba de todo, el camion ultimo.
            assertEquals("camion-sym", ids.last())
            val capaVec = estilo.getValue("layers").jsonArray.first { it.jsonObject["id"]?.jsonPrimitive?.content == "mapArea" }
            assertEquals(v.juego, capaVec.jsonObject.getValue("source-layer").jsonPrimitive.content)
        }
    }

    @Test
    fun `sin mapa base no hay fuente ni capas de base`() {
        val v = VarianteMapa("x", "x", "ets2", "gu", "1", null, LngLat(0.0, 0.0))
        val estilo = JsonLaxo.parseToJsonElement(estiloDe(v, 45.0)).jsonObject
        assertNull(estilo.getValue("sources").jsonObject["base"])
        assertTrue(estilo.getValue("layers").jsonArray.none { it.jsonObject["id"]!!.jsonPrimitive.content.startsWith("base-") })
    }

    @Test
    fun `el geojson que va a las fuentes es valido, con nombres raros incluidos`() {
        val raro = "Nombre \"con\" comillas \\ y ñ"
        JsonLaxo.parseToJsonElement(geojsonPunto(LngLat(1.5, -2.5), 90.0))
        JsonLaxo.parseToJsonElement(geojsonLinea(listOf(LngLat(0.0, 0.0), LngLat(1.0, 1.0))))
        val jugadores = JsonLaxo.parseToJsonElement(
            geojsonJugadores(listOf(MarcaJugador(raro, LngLat(0.0, 0.0), 1.0, "#fff", raro, pausado = true, seguido = false))),
        ).jsonObject
        val props = jugadores.getValue("features").jsonArray[0].jsonObject.getValue("properties").jsonObject
        assertEquals(raro, props.getValue("nombre").jsonPrimitive.content)
        assertEquals("1", props.getValue("pausado").jsonPrimitive.content)
        JsonLaxo.parseToJsonElement(geojsonRutas(listOf(LineaRuta(listOf(LngLat(0.0, 0.0), LngLat(1.0, 1.0)), "#fff", true))))
    }

    @Test
    fun `la caja del mapa sale de las ciudades con su margen`() {
        val caja = cajaDesdeCiudades(
            """[{"Name":"A","X":0,"Y":0},{"Name":"B","X":100,"Y":200},{"Name":"sin coordenadas"}]""",
        )!!
        assertEquals(-15.0, caja.minX, 1e-9)
        assertEquals(115.0, caja.maxX, 1e-9)
        assertEquals(230.0, caja.maxZ, 1e-9)
        assertTrue(caja.contiene(110.0, 225.0))
        assertTrue(!caja.contiene(120.0, 0.0))
    }

    @Test
    fun `sin ciudades suficientes no hay caja`() {
        assertNull(cajaDesdeCiudades("[]"))
        assertNull(cajaDesdeCiudades("""[{"X":1,"Y":1}]"""))
        assertNull(cajaDesdeCiudades("""[{"X":1,"Y":1},{"X":1,"Y":1}]"""))
        assertNull(cajaDesdeCiudades("<html>"))
    }

    @Test
    fun `el camion gira por el camino corto`() {
        assertEquals(20.0, diferenciaAngular(10.0, 350.0), 1e-9)
        assertEquals(-20.0, diferenciaAngular(350.0, 10.0), 1e-9)
        assertEquals(0.0, diferenciaAngular(90.0, 90.0), 1e-9)
    }
}
