package com.trucksimdash.app.telemetria

import com.trucksimdash.app.BuildConfig
import com.trucksimdash.app.core.Ajustes
import com.trucksimdash.app.core.Destino
import com.trucksimdash.app.core.Preferencias
import com.trucksimdash.app.core.Red
import com.trucksimdash.app.core.usaMillas
import com.trucksimdash.app.mapa.CatalogoMapas
import com.trucksimdash.app.mapa.VarianteMapa
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

/** Quien mas quiere los mensajes tal como llegan: el motor de navegacion. */
interface OyenteSesion {
    fun telemetria(texto: String, variante: VarianteMapa?, imperial: Boolean)
    fun mensaje(texto: String)
    fun conexion(abierta: Boolean, porLan: Boolean)
    fun compartir(activo: Boolean, variante: String?)
    fun sesionOlvidada()
    fun demo()
}

/**
 * La conexion con el cliente de la PC, por el relay (con el codigo) o directo
 * por la red de la casa. Hay una sola: una nueva reemplaza a la anterior, y los
 * callbacks de una conexion vieja se ignoran por su [generacion].
 *
 * Reglas de CLAUDE.md que importan aca: esta app es un dispositivo mas de la
 * sesion (no manda voz, viajes ni nav_hud, que salen de la pestana lider), y
 * lo de compartir se manda explicito y solo si la persona lo eligio.
 */
class SesionRepo(
    private val http: OkHttpClient,
    private val prefs: Preferencias,
    private val alcance: CoroutineScope,
    private val catalogo: StateFlow<CatalogoMapas>,
    private val ajustes: StateFlow<Ajustes>,
) {
    private val _estado = MutableStateFlow(EstadoSesion())
    val estado: StateFlow<EstadoSesion> = _estado.asStateFlow()

    private val _avisos = MutableSharedFlow<AvisoSesion>(extraBufferCapacity = 8)
    val avisos: SharedFlow<AvisoSesion> = _avisos.asSharedFlow()

    private var destino: Destino? = null
    private var codigoGuardado = false
    private var socket: WebSocket? = null
    private var generacion = 0
    private var intento = 0
    private var reconexion: Job? = null
    private var pausada = false
    private var ultimoMensajeMs = 0L
    private var varianteCompartida: String? = null

    var oyente: OyenteSesion? = null

    private val _teclas = MutableStateFlow<Map<String, String>?>(null)
    /** Lo que contesto el cliente a get_keybinds; null hasta que conteste. */
    val teclas: StateFlow<Map<String, String>?> = _teclas.asStateFlow()

    init {
        // Vigila sockets medio abiertos: con el juego en vivo, 10 s sin
        // mensajes es un socket muerto, aunque no haya llegado ningun onClose.
        alcance.launch {
            while (isActive) {
                delay(3000)
                val e = _estado.value
                if (e.fase == Fase.Abierta && e.enVivo && !pausada &&
                    System.currentTimeMillis() - ultimoMensajeMs > SOCKET_MUERTO_MS
                ) {
                    abrir()
                }
                // Los jugadores de TMP vencen solos, aunque el juego se haya cerrado.
                if (e.jugadoresTmp.isNotEmpty() && System.currentTimeMillis() > e.tmpHastaMs) {
                    _estado.update { it.copy(jugadoresTmp = emptyList()) }
                }
            }
        }
    }

    private fun urlRelay(): String {
        val propia = if (BuildConfig.DEBUG) prefs.relayDePrueba else null
        return (propia ?: Red.RELAY_WS).trimEnd('/')
    }

    /** [guardado]: el codigo viene de otra vez y no de que la persona lo tipeo. */
    fun conectarCodigo(codigo: String, guardado: Boolean = false) {
        val limpio = codigo.trim().uppercase()
        if (limpio.isEmpty()) return
        conectarA(Destino.Codigo(limpio), guardado)
    }

    fun conectarLan(host: String) {
        val limpio = host.trim()
        if (limpio.isEmpty()) return
        conectarA(Destino.Lan(limpio), guardado = true)
    }

    fun reconectarGuardado() {
        val d = prefs.ultimoDestino ?: return
        if (destino == null) conectarA(d, guardado = true)
    }

    private fun conectarA(d: Destino, guardado: Boolean) {
        destino = d
        codigoGuardado = guardado
        prefs.ultimoDestino = d
        intento = 0
        varianteCompartida = null
        _estado.value = EstadoSesion(fase = Fase.Conectando)
        abrir()
    }

    /** Lo pide la persona: se olvida el destino para no volver solo. */
    fun desconectar() {
        destino = null
        prefs.ultimoDestino = null
        reconexion?.cancel()
        generacion++
        socket?.close(1000, null)
        socket = null
        _estado.value = EstadoSesion()
        oyente?.conexion(false, false)
        oyente?.sesionOlvidada()
    }

    /** La demo de la web: sin PC, un camion que maneja solo. Se sale desconectando. */
    fun empezarDemo() {
        if (destino != null) desconectar()
        _estado.value = EstadoSesion(fase = Fase.Abierta, pcConectada = true, estadoPc = "live", demo = true)
        oyente?.demo()
    }

    fun datoDemo(texto: String) {
        if (!_estado.value.demo) return
        ultimoMensajeMs = System.currentTimeMillis()
        interpretarMensaje(texto)?.let { recibir(it, texto) }
    }

    /** Lo que manda el codigo de la web (plan de ruta, voz, nav_hud): ya viene armado. */
    fun enviarCrudo(texto: String) {
        socket?.send(texto)
    }

    /** La app paso a segundo plano: sin tablero visible no hace falta el socket. */
    fun pausar() {
        if (_estado.value.demo) desconectar()
        pausada = true
        reconexion?.cancel()
        generacion++
        socket?.close(1000, null)
        socket = null
        oyente?.conexion(false, destino is Destino.Lan)
        _estado.update { if (it.fase == Fase.Apagada) it else it.copy(fase = Fase.Reintentando, enVivo = false) }
    }

    fun reanudar() {
        if (!pausada) return
        pausada = false
        if (destino != null) {
            intento = 0
            abrir()
        }
    }

    private fun abrir() {
        val d = destino ?: return
        reconexion?.cancel()
        val mia = ++generacion
        socket?.cancel()
        val url = when (d) {
            is Destino.Codigo -> "${urlRelay()}/ws/live/${d.codigo}"
            is Destino.Lan -> "ws://${d.host}:${Red.PUERTO_LAN}"
        }
        _estado.update { if (it.fase == Fase.CodigoInvalido) it else it.copy(fase = if (intento == 0) Fase.Conectando else Fase.Reintentando) }
        ultimoMensajeMs = System.currentTimeMillis()
        socket = http.newWebSocket(Request.Builder().url(url).build(), Oyente(mia))
    }

    /**
     * OkHttp llama desde sus hilos; todo el estado de este repo se toca solo desde
     * el principal (el alcance es Main), y en orden. Si no, una conexion vieja podia
     * pisar a una nueva entre el chequeo de [generacion] y la escritura.
     */
    private inner class Oyente(private val mia: Int) : WebSocketListener() {
        private fun enOrden(bloque: () -> Unit) {
            alcance.launch { if (mia == generacion) bloque() }
        }

        override fun onOpen(webSocket: WebSocket, response: Response) = enOrden {
            _estado.update { it.copy(fase = Fase.Abierta) }
            // Re-establecer lo elegido tras reconectar: el relay no lo recuerda.
            enviarCompartir(explicito = false)
            oyente?.conexion(true, destino is Destino.Lan)
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            val m = interpretarMensaje(text)
            enOrden {
                ultimoMensajeMs = System.currentTimeMillis()
                intento = 0
                if (m != null) recibir(m, text)
            }
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) = enOrden { alCerrar(code) }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
            webSocket.close(1000, null)
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) = enOrden { alCerrar(1006) }
    }

    private fun recibir(m: MensajeRelay, texto: String) {
        _estado.update { it.copy(fase = Fase.Abierta).aplicar(m, ultimoMensajeMs) }
        when (m) {
            is MensajeRelay.DatosTelemetria -> {
                avisosDe(m.t).forEach { _avisos.tryEmit(it) }
                // El juego se sabe recien con el primer dato, y los mods
                // pueden cambiar el mapa: el relay tiene que enterarse.
                if (varianteParaCompartir() != varianteCompartida) enviarCompartir(explicito = false)
                val juego = m.t.juego
                val c = catalogo.value
                val variante = juego?.let { c.variantes[c.resolver(it, _estado.value.mods, prefs.mapaManual(it))] ?: c.variantes[it] }
                oyente?.telemetria(texto, variante, usaMillas(ajustes.value.unidades, juego))
            }
            is MensajeRelay.EstadoDeSesion, is MensajeRelay.EstadoCliente, MensajeRelay.Otro -> oyente?.mensaje(texto)
            is MensajeRelay.Teclas -> _teclas.value = m.teclas
            is MensajeRelay.ResultadoComando ->
                if (!m.ok) _avisos.tryEmit(AvisoSesion.ComandoFallo(m.razon))
            // Otro dispositivo pudo cambiarlo: lo guardado sigue a lo real,
            // salvo que aca nunca se haya elegido nada.
            is MensajeRelay.Compartir -> {
                if (prefs.compartirElegido != null) prefs.compartirElegido = m.activo
                oyente?.compartir(m.activo, varianteDeSesion())
            }
            else -> Unit
        }
    }

    private fun alCerrar(codigoCierre: Int) {
        if (pausada || destino == null) return
        socket = null
        oyente?.conexion(false, destino is Destino.Lan)
        intento += 1
        val decision = decidirTrasCierre(codigoCierre, _estado.value.codigoValidado, codigoGuardado, intento)
        when (decision) {
            TrasCierre.CodigoInvalido -> _estado.update { it.copy(fase = Fase.CodigoInvalido, enVivo = false) }
            is TrasCierre.Reintentar -> {
                _estado.update { it.copy(fase = Fase.Reintentando, enVivo = false) }
                reconexion?.cancel()
                reconexion = alcance.launch {
                    delay(decision.demoraMs)
                    abrir()
                }
            }
        }
    }

    // ------------------------------------------------------------- envios

    /** Devuelve false si no hay conexion por la que mandarlo. */
    fun enviarComando(accion: String): Boolean {
        val s = socket ?: return false
        if (_estado.value.fase != Fase.Abierta) return false
        return s.send(buildJsonObject { put("type", "command"); put("action", accion) }.toString())
    }

    /** Un boton propio: la tecla viaja con el comando y el cliente la valida. */
    fun enviarTecla(tecla: String): Boolean {
        val s = socket ?: return false
        if (_estado.value.fase != Fase.Abierta) return false
        return s.send(buildJsonObject { put("type", "command"); put("action", "custom"); put("key", tecla) }.toString())
    }

    /** Si la conexion se corta con la pantalla abierta, la pantalla vuelve a pedirlas. */
    fun pedirTeclas(): Boolean = socket?.send(buildJsonObject { put("type", "get_keybinds") }.toString()) ?: false

    /** Un comando sin tecla va en null: queda sin asignar. */
    fun guardarTeclas(teclas: Map<String, String?>): Boolean {
        val s = socket ?: return false
        val mensaje = buildJsonObject {
            put("type", "set_keybinds")
            put(
                "data",
                buildJsonObject {
                    for ((accion, tecla) in teclas) put(accion, tecla?.takeIf { it.isNotBlank() })
                },
            )
        }
        return s.send(mensaje.toString())
    }

    /** La persona toco el tilde de compartir. */
    fun compartir(activar: Boolean) {
        prefs.compartirElegido = activar
        enviarCompartir(explicito = true)
    }

    private fun varianteDeSesion(): String? {
        val juego = _estado.value.telemetria?.juego ?: return null
        val c = catalogo.value
        return c.varianteCompartida(c.resolver(juego, _estado.value.mods, prefs.mapaManual(juego)))
    }

    private fun varianteParaCompartir(): String? = if (prefs.compartirElegido == true) varianteDeSesion() else null

    /**
     * set_live_share, igual que `sendLiveShareState` de la web: sin haber tocado
     * el tilde no se manda nada, y sin telemetria el juego no se sabe y va sin
     * mapa (no comparte), o el conductor aparecia en el mapa de ATS estando en
     * ETS2. El apodo es lo unico con nombre que se ve en el mapa en vivo.
     */
    private fun enviarCompartir(explicito: Boolean) {
        val s = socket ?: return
        val elegido = prefs.compartirElegido
        if (!explicito && elegido == null) return
        val activo = elegido == true
        val variante = varianteParaCompartir()
        varianteCompartida = variante
        val mensaje = buildJsonObject {
            put("type", "set_live_share")
            put("enabled", activo)
            put("mapVariant", variante)
            put("nick", if (activo) ajustes.value.apodo.ifBlank { null } else null)
            put("explicit", explicito)
        }
        s.send(mensaje.toString())
    }

    private companion object {
        const val SOCKET_MUERTO_MS = 10_000L
    }
}
