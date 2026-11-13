package com.trucksimdash.app.mapa

import androidx.compose.runtime.Immutable
import com.trucksimdash.app.core.JsonLaxo
import com.trucksimdash.app.core.Red
import com.trucksimdash.app.core.comoObjeto
import com.trucksimdash.app.core.lista
import com.trucksimdash.app.core.numero
import com.trucksimdash.app.core.objeto
import com.trucksimdash.app.core.parsearObjeto
import com.trucksimdash.app.core.texto
import com.trucksimdash.app.telemetria.ModsDetectados
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray

@Immutable
data class VarianteMapa(
    val id: String,
    val nombre: String,
    /** "ats" o "ets2". Tambien es el nombre de la capa de los tiles. */
    val juego: String,
    val proyeccion: String,
    val version: String,
    /** La variante de la que esta es la version anterior del juego. */
    val anteriorDe: String?,
    val centro: LngLat,
    /** Armado con "Build my map": se lee de la PC por la red de la casa (/localmap/<juego>). */
    val raiz: String? = null,
    val logosPropios: Boolean = false,
    /** Los `mods` del manifest: con ProMods el mapa base es otro (fondoDelMapa). */
    val mods: List<String> = emptyList(),
) {
    val esLocal: Boolean get() = raiz != null
    val urlDeDescarga: String get() = "${raiz ?: Red.MAPAS}/vector/$id.pmtiles?v=$version"
    val urlTiles: String get() = "pmtiles://$urlDeDescarga"
    val urlCiudades: String get() = "${raiz ?: Red.MAPAS}/$id/Cities.json?v=$version"

    /**
     * El mapa base real (costa, lagos, rios) debajo de las rutas. Uno armado puede no tener
     * nada que ver con la tierra de verdad (basemapFitsCities en la web lo mide): va liso.
     */
    val mapaBase: String?
        get() = if (esLocal) null else fondoDelMapa(proyeccion, mods)?.let { "${Red.MAPAS}/basemap/$it.geojson?v=$VERSION_MAPA_BASE" }
}

// BASEMAP_BY_PROJECTION en app.js.
private val BASE_POR_PROYECCION = mapOf("ats" to "usa", "ets2" to "europe")

/**
 * basemapForVariant en pure.js: el de la proyeccion, salvo ETS2 con ProMods, que tiene su
 * Islandia (y sus Feroe) en otro lugar del juego que la del DLC de SCS y su propio archivo.
 */
internal fun fondoDelMapa(proyeccion: String, mods: List<String>): String? {
    val base = BASE_POR_PROYECCION[proyeccion]
    return if (base == "europe" && "promods" in mods) "europe-promods" else base
}

// Copias de constantes de app.js, con un test que las compara contra la web
// (ReferenciaWebTest). Se suben junto con las de la web, despues de subir el archivo
// a R2: Cloudflare guarda lo que reciba con ese numero, aunque sea un 404.
internal const val VERSION_MAPA_BASE = "20261112" // BASEMAP_VERSION
internal const val REV_LOGOS_EMPRESA = "1" // COMPANY_ICONS_REV

/**
 * Las variantes publicadas, del mismo docs/data/map-manifest.json que genera
 * variants.js en la web. Una variante sin mapDataVersion todavia no esta en R2 y
 * no se ofrece: la regla de Cloudflare guarda tambien los 404.
 */
@Immutable
class CatalogoMapas(val variantes: Map<String, VarianteMapa>) {

    private fun publicada(v: String, respaldo: String) = if (v in variantes) v else respaldo

    /** Lo que va al mapa de este juego: lo elegido a mano, o lo detectado. */
    fun resolver(juego: String, mods: ModsDetectados?, manual: String?): String {
        if (manual != null && variantes[manual]?.juego == juego) return manual
        // `modsAuto && localMaps[g]` en resolveModVariant: gana el que armo la persona.
        locales.firstOrNull { it.juego == juego }?.let { return it.id }
        return resolverPorMods(juego, mods?.get(juego))
    }

    /**
     * `resolveModVariant` de app.js con el modo automatico. La prueba de que no
     * se separen: tools/generar_golden.js la corre contra el codigo de la web.
     */
    internal fun resolverPorMods(g: String, det: Set<String>?): String {
        if (det == null) return g
        fun tiene(mod: String) = mod in det
        if (g == "ats") {
            // Reforma con cualquiera de los otros dos usa el pack "todo".
            if (tiene("reforma") && (tiene("c2c") || tiene("promods_canada"))) return "ats_reforma_c2c_promods"
            if (tiene("reforma")) return "ats_reforma"
            // Cubre mas Canada que ProMods Canada: con los dos, gana esta.
            if (tiene("canada_expansion")) {
                return if (tiene("c2c")) publicada("ats_c2c_canada", "ats_c2c") else publicada("ats_canada", "ats")
            }
            if (tiene("c2c") && tiene("promods_canada")) return "ats_c2c_promods"
            if (tiene("promods_canada")) return "ats_promods"
            if (tiene("ats_expansion")) {
                return if (tiene("c2c")) publicada("ats_c2c_expansion", "ats_c2c") else publicada("ats_expansion", "ats")
            }
            if (tiene("c2c")) return "ats_c2c"
            return g
        }
        if (g == "ets2") {
            // European Grand Utopia es Europa con el archipielago, no el standalone.
            if (tiene("eu_grand_utopia")) {
                return if (tiene("promods")) publicada("ets2_promods_eugu", "ets2_promods") else publicada("ets2_eugu", "ets2")
            }
            if (tiene("grand_utopia")) return "ets2_gu"
            if (tiene("roextended") && tiene("rusmap")) return publicada("ets2_promods_rusmap_roex", "ets2_promods_rusmap")
            if (tiene("roextended")) return publicada("ets2_promods_roex", "ets2_promods")
            if (tiene("promods") && tiene("rusmap")) return "ets2_promods_rusmap"
            if (tiene("promods")) return "ets2_promods"
            if (tiene("truckersmp")) return publicada("ets2_tmp", "ets2")
        }
        return g
    }

    /**
     * El mapa de otra version del juego es el mismo mundo: para el mapa en vivo
     * va como el de ahora, o quien juega la 1.61 quedaba solo en un grupo aparte
     * (`sharedMapVariant` en pure.js).
     */
    fun varianteCompartida(id: String): String = variantes[id]?.anteriorDe ?: id

    /** Las que se ofrecen en el mapa en vivo: sin las versiones anteriores. */
    val paraMapaEnVivo: List<VarianteMapa> get() = variantes.values.filter { it.anteriorDe == null && !it.esLocal }

    fun deJuego(juego: String): List<VarianteMapa> = variantes.values.filter { it.juego == juego && !it.esLocal }

    val locales: List<VarianteMapa> get() = variantes.values.filter { it.esLocal }

    /** Los mapas de R2, los que se puede bajar sin red. */
    val publicadas: List<VarianteMapa> get() = variantes.values.filter { !it.esLocal }

    fun conLocales(lista: List<VarianteMapa>): CatalogoMapas =
        CatalogoMapas(variantes.filterValues { !it.esLocal } + lista.associateBy { it.id })

    companion object {
        val VACIO = CatalogoMapas(emptyMap())

        // PROJECTIONS en tools/build_variants_js.py
        private val PROYECCIONES = mapOf("ets2_gu" to "gu")

        fun desdeManifest(texto: String): CatalogoMapas? {
            val raiz = parsearObjeto(texto) ?: return null
            val variantes = raiz.objeto("variants") ?: return null
            val lista = variantes.entries.mapNotNull { (id, valor) ->
                val v = valor.comoObjeto() ?: return@mapNotNull null
                val version = v.texto("mapDataVersion") ?: return@mapNotNull null
                val juego = v.texto("game") ?: return@mapNotNull null
                val origen = v.lista("origin")?.mapNotNull { (it as? JsonPrimitive)?.doubleOrNull }
                id to VarianteMapa(
                    id = id,
                    nombre = v.texto("appLabel") ?: v.texto("label") ?: id,
                    juego = juego,
                    proyeccion = PROYECCIONES[id] ?: juego,
                    version = version,
                    anteriorDe = v.texto("previousVersionOf"),
                    centro = if (origen != null && origen.size == 2) LngLat(origen[0], origen[1]) else LngLat(0.0, 20.0),
                    mods = v.lista("mods")?.mapNotNull { (it as? JsonPrimitive)?.content }.orEmpty(),
                )
            }
            return if (lista.isEmpty()) null else CatalogoMapas(lista.toMap())
        }
    }
}

/**
 * La caja de un mapa en coordenadas del juego: mapBoundsFromCities en pure.js, con un
 * margen del 15 %. Quien esta afuera juega un mod de mapa sin variante, y su flecha
 * quedaria en el oceano.
 */
@Immutable
data class CajaMapa(val minX: Double, val maxX: Double, val minZ: Double, val maxZ: Double) {
    fun contiene(x: Double, z: Double) = x in minX..maxX && z in minZ..maxZ
}

internal fun cajaDesdeCiudades(texto: String, margen: Double = 0.15): CajaMapa? {
    val lista = runCatching { JsonLaxo.parseToJsonElement(texto).jsonArray }.getOrNull() ?: return null
    if (lista.size < 2) return null
    var minX = Double.POSITIVE_INFINITY
    var maxX = Double.NEGATIVE_INFINITY
    var minZ = Double.POSITIVE_INFINITY
    var maxZ = Double.NEGATIVE_INFINITY
    for (fila in lista) {
        val c = fila.comoObjeto() ?: continue
        val x = c.numero("X") ?: continue
        val z = c.numero("Y") ?: continue
        minX = minOf(minX, x)
        maxX = maxOf(maxX, x)
        minZ = minOf(minZ, z)
        maxZ = maxOf(maxZ, z)
    }
    if (!minX.isFinite() || maxX <= minX || maxZ <= minZ) return null
    val mx = (maxX - minX) * margen
    val mz = (maxZ - minZ) * margen
    return CajaMapa(minX - mx, maxX + mx, minZ - mz, maxZ + mz)
}
