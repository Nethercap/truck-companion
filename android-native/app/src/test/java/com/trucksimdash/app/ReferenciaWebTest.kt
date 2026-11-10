package com.trucksimdash.app

import com.trucksimdash.app.core.parsearObjeto
import com.trucksimdash.app.mapa.CatalogoMapas
import com.trucksimdash.app.mapa.LngLat
import com.trucksimdash.app.mapa.Proyecciones
import com.trucksimdash.app.mapa.REV_LOGOS_EMPRESA
import com.trucksimdash.app.mapa.VERSION_MAPA_BASE
import com.trucksimdash.app.mapa.VarianteMapa
import com.trucksimdash.app.mapa.anchoDeCalle
import com.trucksimdash.app.mapa.colorDeConductor
import com.trucksimdash.app.mapa.fondoDelMapa
import com.trucksimdash.app.mapa.rumboDeGrillaAGeo
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test
import kotlin.math.abs

/**
 * Lo portado de la web contra el resultado de la web misma: el golden sale de correr
 * docs/app/app.js, pure.js y proj4 (tools/generar_golden.js, que CI corre con --check).
 */
class ReferenciaWebTest {
    private val golden: JsonObject = parsearObjeto(
        javaClass.classLoader!!.getResource("golden.json")!!.readText(),
    )!!

    private fun catalogoCon(ids: List<String>) = CatalogoMapas(
        ids.associateWith {
            VarianteMapa(it, it, if (it.startsWith("ats")) "ats" else "ets2", "ats", "1", null, LngLat(0.0, 0.0))
        },
    )

    private fun cerca(esperado: Double, real: Double, tolerancia: Double, que: String) {
        assert(abs(esperado - real) <= tolerancia) { "$que: esperaba $esperado, dio $real" }
    }

    @Test
    fun `las proyecciones dan lo mismo que proj4 en la web`() {
        for ((nombre, puntos) in golden.getValue("proyeccion").jsonObject) {
            val p = Proyecciones.de(nombre)
            for (fila in puntos.jsonArray) {
                val o = fila.jsonObject
                val x = o.getValue("x").jsonPrimitive.double
                val z = o.getValue("z").jsonPrimitive.double
                val ll = p.aLngLat(x, z)
                // 1e-7 grados son un centimetro: mas que la precision del golden.
                cerca(o.getValue("lng").jsonPrimitive.double, ll.lng, 1e-7, "$nombre lng ($x,$z)")
                cerca(o.getValue("lat").jsonPrimitive.double, ll.lat, 1e-7, "$nombre lat ($x,$z)")
            }
        }
    }

    @Test
    fun `la inversa da lo mismo que la web, truco de UK incluido`() {
        for ((nombre, puntos) in golden.getValue("proyeccion").jsonObject) {
            val p = Proyecciones.de(nombre)
            for (fila in puntos.jsonArray) {
                val o = fila.jsonObject
                val vuelta = p.desdeLngLat(o.getValue("lng").jsonPrimitive.double, o.getValue("lat").jsonPrimitive.double)
                cerca(o.getValue("vueltaX").jsonPrimitive.double, vuelta.x, 0.01, "$nombre vueltaX")
                cerca(o.getValue("vueltaZ").jsonPrimitive.double, vuelta.z, 0.01, "$nombre vueltaZ")
            }
        }
    }

    @Test
    fun `el rumbo de la grilla a geografico da lo mismo que gridHeadingToGeo`() {
        for ((nombre, puntos) in golden.getValue("proyeccion").jsonObject) {
            val p = Proyecciones.de(nombre)
            for (fila in puntos.jsonArray) {
                val o = fila.jsonObject
                val x = o.getValue("x").jsonPrimitive.double
                val z = o.getValue("z").jsonPrimitive.double
                for (par in o.getValue("rumbos").jsonArray) {
                    val (rumbo, esperado) = par.jsonArray.map { it.jsonPrimitive.double }
                    cerca(esperado, rumboDeGrillaAGeo(rumbo, x, z, p), 1e-6, "$nombre rumbo $rumbo en ($x,$z)")
                }
            }
        }
    }

    @Test
    fun `cada combinacion de mods elige la misma variante que la web`() {
        val todas = catalogoCon(golden.getValue("todas").jsonArray.map { it.jsonPrimitive.content })
        val sinOpcionales = catalogoCon(golden.getValue("sinOpcionales").jsonArray.map { it.jsonPrimitive.content })
        val filas = golden.getValue("variantes").jsonArray
        assert(filas.size > 100) { "el golden deberia traer todas las combinaciones" }
        for (fila in filas) {
            val o = fila.jsonObject
            val c = if (o.getValue("publicadas").jsonPrimitive.content == "todas") todas else sinOpcionales
            val activos = o.getValue("activos")
            val mods = if (activos is JsonNull) null else (activos as JsonArray).map { it.jsonPrimitive.content }.toSet()
            val juego = o.getValue("juego").jsonPrimitive.content
            assertEquals(
                "$juego con $mods (${o.getValue("publicadas").jsonPrimitive.content})",
                o.getValue("esperado").jsonPrimitive.content,
                c.resolverPorMods(juego, mods),
            )
        }
    }

    @Test
    fun `el ancho de las calles da lo mismo que roadLineWidth`() {
        for (fila in golden.getValue("anchos").jsonArray) {
            val o = fila.jsonObject
            val base = o.getValue("base").jsonArray.map { it.jsonPrimitive.double }
            val lat = o.getValue("lat").jsonPrimitive.double
            val p = Proyecciones.de(o.getValue("juego").jsonPrimitive.content)
            val esperado = o.getValue("paradas").jsonArray.map { it.jsonPrimitive.double }
            val real = anchoDeCalle(base, p.metrosPorMetroDeJuego, lat)
            assertEquals(esperado.size, real.size)
            esperado.zip(real).forEach { (e, r) -> cerca(e, r, 1e-9, "ancho en lat $lat") }
        }
    }

    @Test
    fun `cada conductor tiene el mismo color que en la web`() {
        for (fila in golden.getValue("colores").jsonArray) {
            val o = fila.jsonObject
            assertEquals(o.getValue("color").jsonPrimitive.content, colorDeConductor(o.getValue("id").jsonPrimitive.content))
        }
    }

    @Test
    fun `las constantes copiadas de app js siguen iguales`() {
        val c = golden.getValue("constantes").jsonObject
        assertEquals(c.getValue("BASEMAP_VERSION").jsonPrimitive.content, VERSION_MAPA_BASE)
        assertEquals(c.getValue("COMPANY_ICONS_REV").jsonPrimitive.content, REV_LOGOS_EMPRESA)
    }

    @Test
    fun `cada variante lleva el mismo mapa base que en la web`() {
        val filas = golden.getValue("fondos").jsonArray
        assert(filas.any { it.jsonObject["fondo"]?.jsonPrimitive?.content == "europe-promods" })
        for (fila in filas) {
            val f = fila.jsonObject
            val mods = f.getValue("mods").jsonArray.map { it.jsonPrimitive.content }
            val esperado = f.getValue("fondo").let { if (it is JsonNull) null else it.jsonPrimitive.content }
            assertEquals("$mods", esperado, fondoDelMapa(f.getValue("proyeccion").jsonPrimitive.content, mods))
        }
    }

    @Test
    fun `el golden trae numeros de verdad`() {
        val ats = golden.getValue("proyeccion").jsonObject.getValue("ats").jsonArray
        assertEquals(0, ats[0].jsonObject.getValue("x").jsonPrimitive.int)
        cerca(-96.0, ats[0].jsonObject.getValue("lng").jsonPrimitive.double, 1e-9, "origen de ATS")
    }
}
