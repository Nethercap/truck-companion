package com.trucksimdash.app.nav

import androidx.compose.runtime.Immutable
import com.trucksimdash.app.core.comoObjeto
import com.trucksimdash.app.core.lista
import com.trucksimdash.app.core.logico
import com.trucksimdash.app.core.numero
import com.trucksimdash.app.core.objeto
import com.trucksimdash.app.core.parsearObjeto
import com.trucksimdash.app.core.texto
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

@Immutable
data class MiembroConvoy(
    val id: String,
    val nombre: String,
    val color: String,
    val lider: Boolean,
    val yo: Boolean,
    val estado: String,
)

@Immutable
data class TarjetaConvoy(
    val id: String,
    val nombre: String,
    val color: String,
    val lider: Boolean,
    val variante: String?,
    /** La distancia, o por que no hay: desconectado, en el menu, otro juego. */
    val estado: String,
    val nota: String?,
    val filas: List<Pair<String, String>>,
    val puedeSeguir: Boolean,
)

@Immutable
data class MarcaConvoy(
    val id: String,
    val lng: Double,
    val lat: Double,
    val rumbo: Double,
    val color: String,
    val nombre: String,
    val tenue: Boolean,
)

/** Lo que convoy.js tiene en sus ventanas y su carrusel. */
@Immutable
data class EstadoConvoy(
    val enSala: Boolean,
    val disponible: Boolean,
    val conectado: Boolean,
    val aviso: String?,
    val codigo: String?,
    val apodo: String,
    val compartirIngresos: Boolean,
    val silencio: Boolean,
    val mostrarMarcas: Boolean,
    val soyLider: Boolean,
    val espectadores: String,
    val enlace: String?,
    val miembros: List<MiembroConvoy>,
    val tarjetas: List<TarjetaConvoy>,
    val marcas: List<MarcaConvoy>,
    val siguiendo: Boolean,
    val rutaLider: Boolean,
    val mensajes: List<OpcionNav>,
    val textos: Map<String, String>,
) {
    fun t(clave: String): String = textos[clave] ?: clave
}

@Immutable
data class RutaConvoy(val geo: String?, val color: String, val opacidad: Float)

@Immutable
data class ViajeGuardado(
    val ruta: String,
    val detalle: String,
    val pago: String,
    val cuandoMs: Long,
    val juego: String?,
)

@Immutable
data class HistorialViajes(val titulo: String, val vacio: String, val borrar: String, val lista: List<ViajeGuardado>)

private fun textosDe(d: JsonObject): Map<String, String> {
    val o = d.objeto("textos") ?: return emptyMap()
    return o.keys.associateWith { o.texto(it).orEmpty() }
}

internal fun parsearConvoy(texto: String): EstadoConvoy? {
    val d = parsearObjeto(texto) ?: return null
    return EstadoConvoy(
        enSala = d.logico("enSala") ?: false,
        disponible = d.logico("disponible") ?: false,
        conectado = d.logico("conectado") ?: false,
        aviso = d.texto("aviso"),
        codigo = d.texto("codigo"),
        apodo = d.texto("apodo").orEmpty(),
        compartirIngresos = d.logico("compartirIngresos") ?: false,
        silencio = d.logico("silencio") ?: false,
        mostrarMarcas = d.logico("mostrarMarcas") ?: true,
        soyLider = d.logico("soyLider") ?: false,
        espectadores = d.texto("espectadores").orEmpty(),
        enlace = d.texto("enlace"),
        miembros = d.lista("miembros")?.mapNotNull { fila ->
            val m = fila.comoObjeto() ?: return@mapNotNull null
            MiembroConvoy(
                m.texto("id") ?: return@mapNotNull null,
                m.texto("nombre").orEmpty(),
                m.texto("color") ?: "#3b9eff",
                m.logico("lider") ?: false,
                m.logico("yo") ?: false,
                m.texto("estado").orEmpty(),
            )
        } ?: emptyList(),
        tarjetas = d.lista("tarjetas")?.mapNotNull { fila ->
            val m = fila.comoObjeto() ?: return@mapNotNull null
            TarjetaConvoy(
                m.texto("id") ?: return@mapNotNull null,
                m.texto("nombre").orEmpty(),
                m.texto("color") ?: "#3b9eff",
                m.logico("lider") ?: false,
                m.texto("variante"),
                m.texto("estado").orEmpty(),
                m.texto("nota"),
                m.lista("filas")?.mapNotNull { par ->
                    val a = par as? JsonArray ?: return@mapNotNull null
                    val k = (a.getOrNull(0) as? JsonPrimitive)?.content ?: return@mapNotNull null
                    k to ((a.getOrNull(1) as? JsonPrimitive)?.content ?: "")
                } ?: emptyList(),
                m.logico("puedeSeguir") ?: false,
            )
        } ?: emptyList(),
        marcas = d.lista("marcas")?.mapNotNull { fila ->
            val m = fila.comoObjeto() ?: return@mapNotNull null
            MarcaConvoy(
                m.texto("id") ?: return@mapNotNull null,
                m.numero("lng") ?: return@mapNotNull null,
                m.numero("lat") ?: return@mapNotNull null,
                m.numero("rumbo") ?: 0.0,
                m.texto("color") ?: "#3b9eff",
                m.texto("nombre").orEmpty(),
                m.logico("tenue") ?: false,
            )
        } ?: emptyList(),
        siguiendo = d.logico("siguiendo") ?: false,
        rutaLider = d.logico("rutaLider") ?: true,
        mensajes = d.lista("mensajes")?.mapNotNull { fila ->
            val o = fila.comoObjeto() ?: return@mapNotNull null
            OpcionNav(o.texto("id") ?: return@mapNotNull null, o.texto("label").orEmpty())
        } ?: emptyList(),
        textos = textosDe(d),
    )
}

internal fun parsearRutaConvoy(texto: String): RutaConvoy? {
    val d = parsearObjeto(texto) ?: return null
    return RutaConvoy(
        d.texto("geo")?.takeIf { it.isNotEmpty() },
        d.texto("color") ?: "#3b9eff",
        (d.numero("opacidad") ?: 0.5).toFloat(),
    )
}

internal fun parsearViajes(texto: String): HistorialViajes? {
    val d = parsearObjeto(texto) ?: return null
    return HistorialViajes(
        d.texto("titulo").orEmpty().trimEnd(':'),
        d.texto("vacio").orEmpty(),
        d.texto("borrar").orEmpty(),
        d.lista("lista")?.mapNotNull { fila ->
            val v = fila.comoObjeto() ?: return@mapNotNull null
            ViajeGuardado(
                v.texto("ruta").orEmpty(),
                v.texto("detalle").orEmpty(),
                v.texto("pago").orEmpty(),
                (v.numero("cuando") ?: 0.0).toLong(),
                v.texto("juego"),
            )
        } ?: emptyList(),
    )
}
