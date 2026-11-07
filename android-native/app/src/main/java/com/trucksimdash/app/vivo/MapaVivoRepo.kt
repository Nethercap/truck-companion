package com.trucksimdash.app.vivo

import androidx.compose.runtime.Immutable
import com.trucksimdash.app.BuildConfig
import com.trucksimdash.app.core.Preferencias
import com.trucksimdash.app.core.Red
import com.trucksimdash.app.core.comoObjeto
import com.trucksimdash.app.core.entero
import com.trucksimdash.app.core.identificador
import com.trucksimdash.app.core.lista
import com.trucksimdash.app.core.logico
import com.trucksimdash.app.core.numero
import com.trucksimdash.app.core.objeto
import com.trucksimdash.app.core.parsearObjeto
import com.trucksimdash.app.core.texto
import com.trucksimdash.app.mapa.CajaMapa
import com.trucksimdash.app.mapa.VarianteMapa
import com.trucksimdash.app.mapa.cajaDesdeCiudades
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

@Immutable
data class Conductor(
    val id: String,
    val x: Double?,
    val z: Double?,
    val rumbo: Double,
    val velocidadKmh: Double?,
    val pausado: Boolean,
    val apodo: String?,
    val camion: String?,
    val carga: String?,
    val ciudadOrigen: String?,
    val ciudadDestino: String?,
    val distanciaKm: Double?,
    val revRuta: Int,
)

enum class FaseVivo { Apagada, Conectando, Abierta, Llena, Desconocida, Caida }

@Immutable
data class EstadoMapaVivo(
    val variante: String? = null,
    val fase: FaseVivo = FaseVivo.Apagada,
    val conductores: List<Conductor> = emptyList(),
    /** id -> puntos [x, z] de la ruta que comparte. */
    val rutas: Map<String, List<Pair<Double, Double>>> = emptyMap(),
)

internal sealed interface MensajeVivo {
    data class Jugadores(val lista: List<Conductor>) : MensajeVivo
    data class Ruta(val id: String, val puntos: List<Pair<Double, Double>>) : MensajeVivo
}

internal fun interpretarVivo(texto: String): MensajeVivo? {
    val d = parsearObjeto(texto) ?: return null
    return when (d.texto("type")) {
        "live_players" -> MensajeVivo.Jugadores(
            d.lista("players")?.mapNotNull { fila ->
                val p = fila.comoObjeto() ?: return@mapNotNull null
                Conductor(
                    id = p.identificador("id") ?: return@mapNotNull null,
                    x = p.numero("x"),
                    z = p.numero("z"),
                    rumbo = p.numero("heading") ?: 0.0,
                    velocidadKmh = p.numero("speedKmh"),
                    pausado = p.logico("paused") ?: false,
                    apodo = p.texto("nick"),
                    camion = p.texto("truck"),
                    carga = p.texto("cargo"),
                    ciudadOrigen = p.texto("citySrc"),
                    ciudadDestino = p.texto("cityDst"),
                    distanciaKm = p.numero("distanceKm"),
                    revRuta = p.entero("routeRev") ?: 0,
                )
            } ?: emptyList(),
        )
        "live_route" -> {
            val id = d.identificador("id") ?: return null
            val puntos = d.lista("points")?.mapNotNull { par ->
                val xz = par as? JsonArray ?: return@mapNotNull null
                val x = (xz.getOrNull(0) as? JsonPrimitive)?.doubleOrNull ?: return@mapNotNull null
                val z = (xz.getOrNull(1) as? JsonPrimitive)?.doubleOrNull ?: return@mapNotNull null
                x to z
            } ?: emptyList()
            MensajeVivo.Ruta(id, puntos)
        }
        else -> null
    }
}

/** Aplica un mensaje; una ruta se borra si su dueno se fue o dejo de compartirla. */
internal fun EstadoMapaVivo.aplicar(m: MensajeVivo): EstadoMapaVivo = when (m) {
    is MensajeVivo.Ruta -> copy(rutas = if (m.puntos.size > 1) rutas + (m.id to m.puntos) else rutas - m.id)
    is MensajeVivo.Jugadores -> {
        val vivos = m.lista.associateBy { it.id }
        copy(
            conductores = m.lista,
            rutas = rutas.filterKeys { id -> (vivos[id]?.revRuta ?: 0) != 0 },
        )
    }
}

@Immutable
data class ResumenVivo(val porVariante: Map<String, Int> = emptyMap(), val total: Int = 0)

/**
 * El mapa en vivo publico: quienes comparten su posicion, por variante de mapa.
 * Es solo mirar: no hace falta juego, codigo ni cuenta (/ws/livemap en el relay).
 */
class MapaVivoRepo(
    private val http: OkHttpClient,
    private val prefs: Preferencias,
    private val alcance: CoroutineScope,
) {
    private val _estado = MutableStateFlow(EstadoMapaVivo())
    val estado: StateFlow<EstadoMapaVivo> = _estado.asStateFlow()

    private var socket: WebSocket? = null
    @Volatile private var generacion = 0
    private var reintento: Job? = null

    private fun urlWs(): String {
        val propia = if (BuildConfig.DEBUG) prefs.relayDePrueba else null
        return (propia ?: Red.RELAY_WS).trimEnd('/')
    }

    private fun urlHttp() = urlWs().replace("wss://", "https://").replace("ws://", "http://")

    /** Las ciudades del mapa, para saber quien esta afuera. null si no llegaron. */
    suspend fun cajaDe(v: VarianteMapa): CajaMapa? = withContext(Dispatchers.IO) {
        runCatching {
            http.newCall(Request.Builder().url(v.urlCiudades).build()).execute().use { r ->
                if (r.isSuccessful) cajaDesdeCiudades(r.body.string()) else null
            }
        }.getOrNull()
    }

    /** Cuantos hay en cada mapa, para elegir cual mirar. null si no hay red. */
    suspend fun resumen(): ResumenVivo? = withContext(Dispatchers.IO) {
        runCatching {
            http.newCall(Request.Builder().url("${urlHttp()}/live/summary").build()).execute().use { r ->
                if (!r.isSuccessful) return@use null
                val d = parsearObjeto(r.body.string()) ?: return@use null
                val v = d.objeto("variants")?.mapValues { (_, n) -> (n as? JsonPrimitive)?.doubleOrNull?.toInt() ?: 0 } ?: emptyMap()
                ResumenVivo(v, d.entero("total") ?: v.values.sum())
            }
        }.getOrNull()
    }

    fun mirar(variante: String) {
        cerrarSocket()
        _estado.value = EstadoMapaVivo(variante = variante, fase = FaseVivo.Conectando)
        abrir(variante)
    }

    fun dejarDeMirar() {
        cerrarSocket()
        _estado.value = EstadoMapaVivo()
    }

    private fun cerrarSocket() {
        reintento?.cancel()
        generacion++
        socket?.close(1000, null)
        socket = null
    }

    private fun abrir(variante: String) {
        val mia = ++generacion
        val pedido = Request.Builder().url("${urlWs()}/ws/livemap/$variante").build()
        socket = http.newWebSocket(
            pedido,
            object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    if (mia == generacion) _estado.update { it.copy(fase = FaseVivo.Abierta) }
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    if (mia != generacion) return
                    val m = interpretarVivo(text) ?: return
                    _estado.update { it.aplicar(m) }
                }

                override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                    webSocket.close(1000, null)
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) = alCerrar(mia, variante, code)

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) = alCerrar(mia, variante, 1006)
            },
        )
    }

    private fun alCerrar(mia: Int, variante: String, codigo: Int) {
        if (mia != generacion) return
        val fase = when (codigo) {
            4403 -> FaseVivo.Llena
            4404 -> FaseVivo.Desconocida
            else -> FaseVivo.Caida
        }
        _estado.update { it.copy(fase = fase) }
        if (fase != FaseVivo.Caida) return
        reintento = alcance.launch {
            delay(5000)
            if (mia == generacion) abrir(variante)
        }
    }
}
