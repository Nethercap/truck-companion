package com.trucksimdash.app.cuenta

import androidx.compose.runtime.Immutable
import com.trucksimdash.app.core.comoObjeto
import com.trucksimdash.app.core.entero
import com.trucksimdash.app.core.lista
import com.trucksimdash.app.core.logico
import com.trucksimdash.app.core.numero
import com.trucksimdash.app.core.objeto
import com.trucksimdash.app.core.texto
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject

/** /trips/map: todo lo manejado en un juego, ya en lng/lat. */
@Immutable
data class MapaRecorrido(
    val viajes: Int,
    val ciudades: Int,
    /** GeoJSON para el mapa, tal cual. Sin nada, null: MapLibre no acepta lineas vacias. */
    val lineasGeo: String?,
    val ciudadesGeo: String?,
    val regiones: List<Pair<String, Int>>,
    /** La caja de todo lo manejado: oeste, sur, este, norte. */
    val caja: List<Double>?,
)

internal fun parsearMapa(d: JsonObject?): MapaRecorrido? {
    val m = d?.objeto("map") ?: return null
    val lineas = m["lines"] as? JsonArray ?: JsonArray(emptyList())
    val validas = lineas.filter { (it as? JsonArray)?.size ?: 0 >= 2 }
    val ciudades = m.lista("cities").orEmpty()
    val puntosCiudad = ciudades.mapNotNull { fila ->
        val c = fila.comoObjeto() ?: return@mapNotNull null
        val ll = c["lnglat"] as? JsonArray ?: return@mapNotNull null
        Triple(ll.toString(), c.entero("visits") ?: 1, ll)
    }
    val todos = validas.flatMap { (it as JsonArray).toList() } + puntosCiudad.map { it.third }
    val coordenadas = todos.mapNotNull { p ->
        val a = p as? JsonArray ?: return@mapNotNull null
        val lng = a.getOrNull(0)?.toString()?.toDoubleOrNull() ?: return@mapNotNull null
        val lat = a.getOrNull(1)?.toString()?.toDoubleOrNull() ?: return@mapNotNull null
        lng to lat
    }
    return MapaRecorrido(
        viajes = m.entero("trips") ?: 0,
        ciudades = ciudades.size,
        lineasGeo = validas.takeIf { it.isNotEmpty() }?.let {
            """{"type":"Feature","properties":{},"geometry":{"type":"MultiLineString","coordinates":${JsonArray(it)}}}"""
        },
        ciudadesGeo = puntosCiudad.takeIf { it.isNotEmpty() }?.joinToString(",", """{"type":"FeatureCollection","features":[""", "]}") { (ll, n, _) ->
            """{"type":"Feature","properties":{"n":$n},"geometry":{"type":"Point","coordinates":$ll}}"""
        },
        regiones = m.lista("regions")?.mapNotNull { fila ->
            val r = fila.comoObjeto() ?: return@mapNotNull null
            (r.texto("name") ?: r.texto("token") ?: return@mapNotNull null) to (r.entero("trips") ?: 0)
        } ?: emptyList(),
        caja = coordenadas.takeIf { it.isNotEmpty() }?.let { c ->
            listOf(c.minOf { it.first }, c.minOf { it.second }, c.maxOf { it.first }, c.maxOf { it.second })
        },
    )
}

/** /trips/wrapped: el resumen de un ano. */
@Immutable
data class ResumenAno(
    val ano: Int,
    val resumenes: List<ResumenJuego>,
    val totales: List<TotalManejo>,
    val kmPorMes: List<Double>,
    val diasManejados: Int,
    val rachaMasLarga: Int,
    val mejorDia: Pair<String, Double>?,
    val primerViaje: String?,
    val logros: List<Logro>,
)

internal fun parsearAno(d: JsonObject?): ResumenAno? {
    if (d == null) return null
    val ano = d.entero("year") ?: return null
    val primero = d.objeto("first_trip")
    return ResumenAno(
        ano = ano,
        resumenes = parsearResumenes(d),
        totales = parsearTotales(d),
        kmPorMes = d.lista("months")?.map { it.comoObjeto()?.numero("distance_km") ?: 0.0 } ?: emptyList(),
        diasManejados = d.entero("days_driven") ?: 0,
        rachaMasLarga = d.entero("longest_streak") ?: 0,
        mejorDia = d.objeto("best_day")?.let { b ->
            val fecha = b.texto("date") ?: return@let null
            fecha to (b.numero("distance_km") ?: 0.0)
        },
        primerViaje = primero?.let { "${it.texto("city_src") ?: "?"} → ${it.texto("city_dst") ?: "?"}" },
        logros = parsearLogros(d),
    )
}

@Immutable
data class Persona(val nombre: String, val titulo: String?)

@Immutable
data class ListasSeguir(
    val siguiendo: List<Persona>,
    val pendientes: List<Persona>,
    val seguidores: List<Persona>,
    val pedidos: List<Persona>,
    val bloqueados: List<Persona>,
)

private fun personas(d: JsonObject, clave: String): List<Persona> = d.lista(clave)?.mapNotNull { fila ->
    val p = fila.comoObjeto() ?: return@mapNotNull null
    Persona(p.texto("username") ?: return@mapNotNull null, p.texto("title"))
} ?: emptyList()

internal fun parsearListas(d: JsonObject?): ListasSeguir? {
    if (d == null) return null
    return ListasSeguir(
        personas(d, "following"),
        personas(d, "outgoing"),
        personas(d, "followers"),
        personas(d, "requests"),
        personas(d, "blocked"),
    )
}

/** Una novedad de alguien a quien se sigue. */
@Immutable
data class Novedad(
    val nombre: String,
    /** delivered, cancelled, started o achievement. */
    val tipo: String,
    val cuando: String?,
    val ruta: String?,
    val carga: String?,
    val km: Double?,
    val juego: String?,
    val logro: String?,
)

internal fun parsearNovedades(d: JsonObject?): List<Novedad> = d?.lista("events")?.mapNotNull { fila ->
    val e = fila.comoObjeto() ?: return@mapNotNull null
    Novedad(
        nombre = e.objeto("user")?.texto("username") ?: return@mapNotNull null,
        tipo = e.texto("type") ?: return@mapNotNull null,
        cuando = e.texto("at"),
        ruta = if (e.texto("city_src") != null || e.texto("city_dst") != null) {
            "${e.texto("city_src") ?: "?"} → ${e.texto("city_dst") ?: "?"}"
        } else {
            null
        },
        carga = e.texto("cargo"),
        km = e.numero("distance_km"),
        juego = e.texto("game"),
        logro = e.texto("achievement"),
    )
} ?: emptyList()

/** /follow/user/nombre. Sin seguirlo (o si no acepto) viene solo el nombre. */
@Immutable
data class PerfilAjeno(
    val nombre: String,
    val titulo: String?,
    val soyYo: Boolean,
    /** null, pending o accepted. */
    val loSigo: String?,
    val meSigue: String?,
    val completo: Boolean,
    val publico: Boolean,
    val totales: List<TotalManejo>,
    val resumenes: List<ResumenJuego>,
    val logros: List<Logro>,
    val recientes: List<Viaje>,
    val manejando: Boolean,
)

internal fun parsearPerfil(d: JsonObject?): PerfilAjeno? {
    val u = d?.objeto("user") ?: return null
    val r = d.objeto("relation")
    return PerfilAjeno(
        nombre = u.texto("username") ?: return null,
        titulo = u.texto("title"),
        soyYo = d.logico("self") ?: false,
        loSigo = r?.texto("following"),
        meSigue = r?.texto("follows_me"),
        completo = d.logico("full") ?: false,
        publico = d.logico("public") ?: false,
        totales = parsearTotales(d),
        resumenes = parsearResumenes(d),
        logros = parsearLogros(d),
        recientes = parsearViajeLista(d.lista("recent")),
        manejando = d.objeto("status")?.logico("driving") ?: false,
    )
}
