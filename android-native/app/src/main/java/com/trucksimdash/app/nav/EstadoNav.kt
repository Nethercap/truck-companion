package com.trucksimdash.app.nav

import androidx.compose.runtime.Immutable
import com.trucksimdash.app.core.comoObjeto
import com.trucksimdash.app.core.entero
import com.trucksimdash.app.core.lista
import com.trucksimdash.app.core.logico
import com.trucksimdash.app.core.numero
import com.trucksimdash.app.core.objeto
import com.trucksimdash.app.core.parsearObjeto
import com.trucksimdash.app.core.texto
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

enum class Maniobra { Derecho, GiroIzquierda, GiroDerecha, ForkIzquierda, ForkDerecha, RotondaHoraria, RotondaAntihoraria, Ferry, Tren }

@Immutable
data class GiroNav(
    /** Ya traducido por la web. Sin la flecha del principio: la dibuja la pantalla. */
    val texto: String,
    val maniobra: Maniobra,
    val metros: Double?,
    val salidaRotonda: Int?,
)

@Immutable
data class CarrilNav(val direcciones: List<String>, val sirve: Boolean, val direccionGiro: String?)

@Immutable
data class ResumenNav(
    val falta: String?,
    val duracion: String?,
    val llegada: String?,
    val porcentaje: Double,
    /** "Primero a buscar la carga": la ruta no va a la entrega y hay que decirlo. */
    val aviso: String?,
    val aproximado: Boolean,
    val conDlcApagado: Boolean,
)

/** La proxima parada propia del resumen: "Next stop: X", los km y la llegada, y saltearla. */
@Immutable
data class ParadaNav(val nombre: String, val eta: String?, val saltear: String)

/** La proxima parada de un trabajo de bus, con la hora del horario (en rojo si ya paso). */
@Immutable
data class ParadaBusNav(val texto: String, val hora: String?, val tarde: Boolean)

@Immutable
data class DestinoNav(val lng: Double, val lat: Double, val aBuscarCarga: Boolean, val aproximado: Boolean)

@Immutable
data class WaypointNav(val etiqueta: String?, val tipo: String?, val lng: Double, val lat: Double)

@Immutable
data class SugerenciaNav(val tipo: String, val texto: String, val boton: String)

@Immutable
data class EncontradoNav(val indice: Int, val nombre: String, val detalle: String, val distancia: String, val atras: Boolean)

@Immutable
data class BusquedaNav(
    val aviso: String?,
    val lista: List<EncontradoNav>,
    /** Los lugares todavia estan bajando: hay que volver a preguntar. */
    val cargando: Boolean = false,
    /** Las categorias que la variante tiene ademas de las de siempre: "a" el Atlas, "b" los buses. */
    val extras: Set<String> = emptySet(),
)

@Immutable
data class EstadoNav(
    val giro: GiroNav? = null,
    val carriles: List<CarrilNav> = emptyList(),
    val resumen: ResumenNav? = null,
    val destino: DestinoNav? = null,
    /** Por que no hay indicaciones, ya traducido. */
    val sinRuta: String? = null,
    val hayRuta: Boolean = false,
    val proximaCiudad: String? = null,
    val rumbo: Double? = null,
    val zoomNav: Double? = null,
    /** El mismo, con la vista 3D (navTargetZoom con nav3d). */
    val zoomNav3d: Double? = null,
    val waypoints: List<WaypointNav> = emptyList(),
    val sugerencia: SugerenciaNav? = null,
    val rutaOculta: Boolean = false,
    val textoRutaOculta: String = "",
    val textoMostrarRuta: String = "",
    val vozEnOtro: String? = null,
    val textoVozAca: String = "",
    val avisoRuta: String? = null,
    val parada: ParadaNav? = null,
    val paradaBus: ParadaBusNav? = null,
    /** "Guarda con F5": el GPS del juego cambio despues de la partida que lee el cliente. */
    val avisoGuardar: String? = null,
    /** Las empresas a la distancia del GPS del juego, cuando la app no puede seguir su ruta. */
    val adivinanzas: List<String> = emptyList(),
    val textoAdivinanzas: String = "",
    val actualizarCliente: AvisoVersion? = null,
    val perfil: String = "fastest",
    /** El pago con la conversion a la moneda de la persona, si la eligio. */
    val pagoTrabajo: String? = null,
    val hora12: Boolean = false,
    /** Lo que se eligio en Ajustes para el mini-HUD, ya en texto. */
    val miniHud: List<String> = emptyList(),
    val sesion: TotalesSesion? = null,
    /** Lo que dibuja el panel Moderno (ui/TableroModerno.kt). */
    val tablero: TableroNav? = null,
)

/** Una franja de la cinta (el descanso o la carga): desde izq, en % del largo, de ancho ancho. */
@Immutable
data class MarcaCinta(val izq: Double, val ancho: Double, val etiqueta: String)

/** La cinta de arriba del panel Moderno: el viaje entero, con el descanso y la carga encima. */
@Immutable
data class CintaModerno(
    val desde: String,
    val desdeSub: String?,
    val falta: String,
    val faltaSub: String?,
    val hasta: String,
    val hastaSub: String?,
    val hecho: Double,
    val descanso: MarcaCinta?,
    val carga: MarcaCinta?,
)

@Immutable
data class TestigoModerno(val clave: String, val prendido: Boolean, val titulo: String)

@Immutable
data class ConduccionModerno(
    val vel: String,
    val unidad: String,
    val limite: String?,
    val exceso: Boolean,
    val marcha: String,
    val crucero: String?,
    val rpm: Double,
    val rpmAlta: Boolean,
    val testigos: List<TestigoModerno>,
    val retarder: String?,
)

/** "bien" o "mal" pintan el titular; null lo deja como todo. */
@Immutable
data class LlegadaModerno(val titular: String, val estado: String?, val linea: String?, val pago: String?)

@Immutable
data class CombustibleModerno(
    val titular: String?,
    val titularEstado: String?,
    val descanso: String?,
    val descansoEstado: String?,
    val linea: String?,
    val bajo: String?,
    val bajoAlerta: Boolean,
)

/** Una pieza del desgaste: nombre, el % ya escrito, nivel (bien, medio, alto, mal) y si es del remolque. */
@Immutable
data class PiezaModerno(val nombre: String, val texto: String, val nivel: String, val remolque: Boolean)

@Immutable
data class MedidorModerno(val valor: String, val etiqueta: String, val alerta: Boolean)

@Immutable
data class CamionModerno(
    val titular: String?,
    val titularEstado: String?,
    val piezas: List<PiezaModerno>,
    val linea: String?,
    val lineaAlerta: Boolean,
    val medidores: List<MedidorModerno>,
)

@Immutable
data class FranjaModerno(
    val carga: String?,
    val cargaSub: String?,
    val metricas: List<Pair<String, String>>,
    val reiniciar: String,
    val desde: String?,
)

/** tableroModerno() de conduccion.js: lo que el render() del panel Moderno de la web escribe. */
@Immutable
data class TableroNav(
    val cinta: CintaModerno?,
    val conduccion: ConduccionModerno,
    val llegada: LlegadaModerno?,
    val combustible: CombustibleModerno,
    val camion: CamionModerno,
    val franja: FranjaModerno,
)

private fun arreglo(e: kotlinx.serialization.json.JsonElement?) = e as? kotlinx.serialization.json.JsonArray

private fun cadena(e: kotlinx.serialization.json.JsonElement?): String? =
    (e as? JsonPrimitive)?.takeUnless { it is kotlinx.serialization.json.JsonNull }?.content

private fun marcaCinta(o: JsonObject?): MarcaCinta? {
    o ?: return null
    return MarcaCinta(o.numero("izq") ?: return null, o.numero("ancho") ?: 12.0, o.texto("etiqueta").orEmpty())
}

internal fun parsearTablero(o: JsonObject?): TableroNav? {
    o ?: return null
    val v = o.objeto("conduccion") ?: return null
    val c = o.objeto("cinta")
    val l = o.objeto("llegada")
    val f = o.objeto("combustible")
    val k = o.objeto("camion")
    val fr = o.objeto("franja")
    return TableroNav(
        cinta = c?.let {
            CintaModerno(
                it.texto("desde").orEmpty(), it.texto("desdeSub"), it.texto("falta") ?: "--", it.texto("faltaSub"),
                it.texto("hasta").orEmpty(), it.texto("hastaSub"), it.numero("hecho") ?: 0.0,
                marcaCinta(it.objeto("descanso")), marcaCinta(it.objeto("carga")),
            )
        },
        conduccion = ConduccionModerno(
            vel = v.texto("vel") ?: "--",
            unidad = v.texto("unidad").orEmpty(),
            limite = v.texto("limite"),
            exceso = v.logico("exceso") ?: false,
            marcha = v.texto("marcha") ?: "N",
            crucero = v.texto("crucero"),
            rpm = v.numero("rpm") ?: 0.0,
            rpmAlta = v.logico("rpmAlta") ?: false,
            testigos = v.lista("testigos")?.mapNotNull { fila ->
                val a = arreglo(fila) ?: return@mapNotNull null
                TestigoModerno(cadena(a.getOrNull(0)) ?: return@mapNotNull null, cadena(a.getOrNull(1)) == "true", cadena(a.getOrNull(2)).orEmpty())
            } ?: emptyList(),
            retarder = v.texto("retarder"),
        ),
        llegada = l?.let { LlegadaModerno(it.texto("titular") ?: return@let null, it.texto("estado"), it.texto("linea"), it.texto("pago")) },
        combustible = CombustibleModerno(
            f?.texto("titular"), f?.texto("titularEstado"), f?.texto("descanso"), f?.texto("descansoEstado"),
            f?.texto("linea"), f?.texto("bajo"), f?.logico("bajoAlerta") ?: false,
        ),
        camion = CamionModerno(
            titular = k?.texto("titular"),
            titularEstado = k?.texto("titularEstado"),
            piezas = k?.lista("piezas")?.mapNotNull { fila ->
                val a = arreglo(fila) ?: return@mapNotNull null
                PiezaModerno(cadena(a.getOrNull(0)) ?: return@mapNotNull null, cadena(a.getOrNull(1)).orEmpty(), cadena(a.getOrNull(2)) ?: "bien", cadena(a.getOrNull(3)) == "true")
            } ?: emptyList(),
            linea = k?.texto("linea"),
            lineaAlerta = k?.logico("lineaAlerta") ?: false,
            medidores = k?.lista("medidores")?.mapNotNull { fila ->
                val a = arreglo(fila) ?: return@mapNotNull null
                MedidorModerno(cadena(a.getOrNull(0)) ?: return@mapNotNull null, cadena(a.getOrNull(1)).orEmpty(), cadena(a.getOrNull(2)) == "true")
            } ?: emptyList(),
        ),
        franja = FranjaModerno(
            carga = fr?.texto("carga"),
            cargaSub = fr?.texto("cargaSub"),
            metricas = fr?.lista("metricas")?.mapNotNull { fila ->
                val a = arreglo(fila) ?: return@mapNotNull null
                (cadena(a.getOrNull(0)) ?: return@mapNotNull null) to cadena(a.getOrNull(1)).orEmpty()
            } ?: emptyList(),
            reiniciar = fr?.texto("reiniciar").orEmpty(),
            desde = fr?.texto("desde"),
        ),
    )
}

/** Peajes, multas y ferries desde que se abrio: la tarjeta de la sesion de la web. */
@Immutable
data class TotalesSesion(val filas: List<Pair<String, String>>, val hayAlgo: Boolean, val reiniciar: String)

/** "Trabajo entregado": lo que paso en el viaje, tal como lo arma deliverySummary. */
@Immutable
data class EntregaNav(
    val titulo: String,
    val ruta: String?,
    val carga: String?,
    val filas: List<Pair<String, String>>,
    val cerrar: String,
    val duraMs: Long,
    /** Las paradas de un trabajo de bus: la hora del juego de cada una y la demora. */
    val tituloParadas: String = "",
    val paradas: List<ParadaEntrega> = emptyList(),
)

@Immutable
data class ParadaEntrega(val nombre: String, val hora: String, val tarde: String?)

private fun pares(lista: kotlinx.serialization.json.JsonArray?): List<Pair<String, String>> = lista?.mapNotNull { fila ->
    val a = fila as? kotlinx.serialization.json.JsonArray ?: return@mapNotNull null
    val k = (a.getOrNull(0) as? JsonPrimitive)?.content ?: return@mapNotNull null
    k to ((a.getOrNull(1) as? JsonPrimitive)?.content ?: "")
} ?: emptyList()

internal fun parsearEntrega(o: JsonObject): EntregaNav = EntregaNav(
    titulo = o.texto("titulo").orEmpty(),
    ruta = o.texto("ruta"),
    carga = o.texto("carga"),
    filas = pares(o.lista("filas")),
    cerrar = o.texto("cerrar").orEmpty(),
    duraMs = o.numero("ms")?.toLong() ?: 90_000L,
    tituloParadas = o.texto("tituloParadas").orEmpty(),
    paradas = o.lista("paradas")?.mapNotNull { fila ->
        val p = fila.comoObjeto() ?: return@mapNotNull null
        ParadaEntrega(p.texto("nombre") ?: return@mapNotNull null, p.texto("hora").orEmpty(), p.texto("tarde"))
    } ?: emptyList(),
)

/** El cliente de la PC tiene una version nueva. */
@Immutable
data class AvisoVersion(val texto: String, val boton: String, val url: String)

@Immutable
data class EscudoRuta(val nombre: String, val interestatal: Boolean, val numero: String)

/** Lo que la web le pone al mapa ademas de la ruta. GeoJSON en lng/lat, sin tocar. */
@Immutable
data class CapasNav(
    val escudos: List<EscudoRuta>,
    val geoEscudos: String?,
    val atlas: String?,
    /** Las terminales de bus (busStopList): `k` "l" una linea, "t" turismo. */
    val buses: String? = null,
    val estacionamiento: String?,
    val combustible: String?,
    /** El filtro de la capa poi, como lo arma la web: cambia en auto y con los POIs nuevos. */
    val filtroPoi: String?,
    val estacionamientoVisible: Boolean,
)

/** La linea de la ruta: GeoJSON ya en lng/lat, tal como sale de la web. Va aparte: pesa. */
@Immutable
data class RutaDibujada(val tierra: String?, val siguiente: String?, val ferry: String?, val conLinea: Boolean)

// Las flechas que la web le pone a cada instruccion (turnInstructionText).
private val FLECHA_INICIAL = Regex("""^[←-⇿⬀-⯿]\s*""")

private fun maniobraDe(info: Any?): Maniobra {
    val o = info as? JsonObject ?: return Maniobra.Derecho
    val izquierda = o.texto("direction") == "left"
    return when (o.texto("kind")) {
        "roundabout" -> if (o.logico("ccw") == true) Maniobra.RotondaAntihoraria else Maniobra.RotondaHoraria
        "fork" -> if (izquierda) Maniobra.ForkIzquierda else Maniobra.ForkDerecha
        "turn" -> if (izquierda) Maniobra.GiroIzquierda else Maniobra.GiroDerecha
        // Tren solo si el puerto lo dice (turnIconShape): sin puerto todavia, el barco.
        "ferry" -> if (o.logico("train") == true) Maniobra.Tren else Maniobra.Ferry
        else -> Maniobra.Derecho
    }
}

/** Lo que devuelve motor.telemetria (navegacion() en conduccion.js). */
internal fun parsearNavegacion(texto: String): EstadoNav? {
    val d = parsearObjeto(texto) ?: return null
    val g = d.objeto("giro")
    val info = g?.get("info")
    val r = d.objeto("resumen")
    val dest = d.objeto("destino")
    return EstadoNav(
        giro = g?.texto("text")?.let { t ->
            GiroNav(
                texto = t.replace(FLECHA_INICIAL, ""),
                maniobra = maniobraDe(info),
                metros = (info as? JsonObject)?.numero("meters"),
                salidaRotonda = (info as? JsonObject)?.entero("exit"),
            )
        },
        carriles = d.lista("carriles")?.mapNotNull { fila ->
            val c = fila.comoObjeto() ?: return@mapNotNull null
            CarrilNav(
                direcciones = c.lista("dirs")?.mapNotNull { (it as? JsonPrimitive)?.content } ?: emptyList(),
                sirve = c.logico("active") ?: false,
                direccionGiro = c.texto("turn"),
            )
        } ?: emptyList(),
        resumen = r?.takeIf { it.containsKey("remaining") }?.let {
            ResumenNav(
                falta = it.texto("remaining")?.takeUnless { v -> v == "--" },
                duracion = it.texto("duration")?.takeUnless { v -> v == "--" },
                llegada = it.texto("arrival")?.takeUnless { v -> v == "--" },
                porcentaje = it.numero("percent") ?: 0.0,
                aviso = it.texto("pickup"),
                aproximado = it.logico("approx") ?: false,
                conDlcApagado = it.logico("dlc") ?: false,
            )
        },
        destino = dest?.let {
            val lng = it.numero("lng") ?: return@let null
            val lat = it.numero("lat") ?: return@let null
            DestinoNav(lng, lat, it.texto("kind") == "pickup", it.logico("approx") ?: false)
        },
        sinRuta = d.texto("sinRuta"),
        hayRuta = d.logico("hayRuta") ?: false,
        proximaCiudad = d.texto("proximaCiudad"),
        rumbo = d.numero("rumbo"),
        zoomNav = d.numero("zoomNav"),
        zoomNav3d = d.numero("zoomNav3d"),
        waypoints = d.lista("waypoints")?.mapNotNull { fila ->
            val w = fila.comoObjeto() ?: return@mapNotNull null
            WaypointNav(w.texto("etiqueta"), w.texto("tipo"), w.numero("lng") ?: return@mapNotNull null, w.numero("lat") ?: return@mapNotNull null)
        } ?: emptyList(),
        sugerencia = d.objeto("sugerencia")?.let {
            SugerenciaNav(it.texto("tipo") ?: "", it.texto("texto") ?: "", it.texto("boton") ?: "")
        },
        rutaOculta = d.logico("rutaOculta") ?: false,
        textoRutaOculta = d.texto("textoRutaOculta").orEmpty(),
        textoMostrarRuta = d.texto("textoMostrarRuta").orEmpty(),
        vozEnOtro = d.texto("vozEnOtro"),
        textoVozAca = d.texto("textoVozAca").orEmpty(),
        avisoRuta = d.texto("avisoRuta"),
        parada = d.objeto("parada")?.let {
            ParadaNav(it.texto("nombre").orEmpty(), it.texto("eta"), it.texto("saltear").orEmpty())
        },
        paradaBus = d.objeto("paradaBus")?.let {
            ParadaBusNav(it.texto("texto").orEmpty(), it.texto("hora"), it.logico("tarde") ?: false)
        },
        avisoGuardar = d.texto("avisoGuardar"),
        adivinanzas = d.lista("adivinanzas")?.mapNotNull { (it as? JsonPrimitive)?.content } ?: emptyList(),
        textoAdivinanzas = d.texto("textoAdivinanzas").orEmpty(),
        actualizarCliente = d.objeto("actualizarCliente")?.let { a ->
            AvisoVersion(a.texto("texto").orEmpty(), a.texto("boton").orEmpty(), a.texto("url") ?: return@let null)
        },
        perfil = d.texto("perfil") ?: "fastest",
        pagoTrabajo = d.texto("pagoTrabajo"),
        hora12 = d.logico("hora12") ?: false,
        miniHud = d.lista("miniHud")?.mapNotNull { (it as? JsonPrimitive)?.content } ?: emptyList(),
        sesion = d.objeto("sesion")?.let {
            TotalesSesion(pares(it.lista("filas")), it.logico("hayAlgo") ?: false, it.texto("reiniciar").orEmpty())
        },
        tablero = parsearTablero(d.objeto("tablero")),
    )
}

internal fun parsearBusqueda(texto: String): BusquedaNav {
    val d = parsearObjeto(texto) ?: return BusquedaNav(null, emptyList())
    return BusquedaNav(
        d.texto("aviso"),
        d.lista("lista")?.mapNotNull { fila ->
            val r = fila.comoObjeto() ?: return@mapNotNull null
            EncontradoNav(
                r.entero("i") ?: return@mapNotNull null,
                r.texto("nombre") ?: "",
                r.texto("sub") ?: "",
                r.texto("distancia") ?: "",
                r.logico("atras") ?: false,
            )
        } ?: emptyList(),
        d.logico("cargando") ?: false,
        d.objeto("hay")?.let { h -> setOf("a", "b").filter { h.logico(it) == true }.toSet() } ?: emptySet(),
    )
}

/** Una flecha de carril de la web: la linea y la punta, en un lienzo de 24 por 30. */
@Immutable
data class TrazoCarril(val camino: String, val punta: List<Pair<Float, Float>>)

internal fun parsearTrazos(texto: String): Map<String, TrazoCarril> {
    val d = parsearObjeto(texto) ?: return emptyMap()
    return d.entries.mapNotNull { (nombre, valor) ->
        val par = valor as? kotlinx.serialization.json.JsonArray ?: return@mapNotNull null
        val camino = (par.getOrNull(0) as? JsonPrimitive)?.content ?: return@mapNotNull null
        val puntos = (par.getOrNull(1) as? JsonPrimitive)?.content ?: return@mapNotNull null
        val punta = puntos.trim().split(Regex("\\s+")).mapNotNull { p ->
            val xy = p.split(",")
            val x = xy.getOrNull(0)?.toFloatOrNull() ?: return@mapNotNull null
            val y = xy.getOrNull(1)?.toFloatOrNull() ?: return@mapNotNull null
            x to y
        }
        nombre to TrazoCarril(camino, punta)
    }.toMap()
}
