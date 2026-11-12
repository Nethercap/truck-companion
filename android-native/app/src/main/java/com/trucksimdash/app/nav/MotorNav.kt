package com.trucksimdash.app.nav

import android.content.Context
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.SystemClock
import android.util.Log
import androidx.core.content.edit
import com.trucksimdash.app.BuildConfig
import com.trucksimdash.app.core.Preferencias
import com.trucksimdash.app.core.Red
import com.trucksimdash.app.core.comoObjeto
import com.trucksimdash.app.core.entero
import com.trucksimdash.app.core.lista
import com.trucksimdash.app.core.logico
import com.trucksimdash.app.core.objeto
import com.trucksimdash.app.core.parsearObjeto
import com.trucksimdash.app.core.texto
import com.trucksimdash.app.mapa.VarianteMapa
import com.whl.quickjs.android.QuickJSLoader
import com.whl.quickjs.wrapper.JSFunction
import com.whl.quickjs.wrapper.JSObject
import com.whl.quickjs.wrapper.QuickJSContext
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

// Los textos del buscador, de la web: en los ocho idiomas, y sin una segunda copia.
internal val CLAVES_BUSCADOR = listOf(
    "poiNearestFuel", "poiNearestRest", "poiSearchPlaceholder", "poiCatFuel", "poiCatRest",
    "poiCatService", "poiCatGarage", "poiCatDealer", "poiCatWeigh", "navReportOpen",
)

private const val OCUPADO_TRAS_MS = 4000L
private const val OCUPADO_SIGUE_MS = 1000L

/**
 * El ruteo y las indicaciones de la web corriendo adentro de la app, en QuickJS. Este es el
 * puente: le pasa los mensajes del socket y hace lo que el codigo de la web pide (bajar
 * archivos, sonar, mandar por el socket, guardar). No decide nada de navegacion.
 *
 * Un QuickJS es de un solo hilo: todo pasa por [hilo], tambien la carga, para que manejar
 * nunca le pese al hilo de la interfaz. Un mensaje nuevo pisa al que no llego a correr: si el
 * motor se atrasa, importa el ultimo dato y no todos.
 */
class MotorNav(
    private val contexto: Context,
    private val prefs: Preferencias,
    private val archivos: ArchivosMapa,
    private val alcance: CoroutineScope,
    private val enviarAlSocket: (String) -> Unit,
) {
    private val _estado = MutableStateFlow(EstadoNav())
    val estado: StateFlow<EstadoNav> = _estado.asStateFlow()

    private val _ruta = MutableStateFlow<RutaDibujada?>(null)
    val ruta: StateFlow<RutaDibujada?> = _ruta.asStateFlow()

    private val _trazos = MutableStateFlow<Map<String, TrazoCarril>>(emptyMap())
    val trazos: StateFlow<Map<String, TrazoCarril>> = _trazos.asStateFlow()

    private val _avisos = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val avisos: SharedFlow<String> = _avisos.asSharedFlow()

    private val _bajando = MutableStateFlow(0)
    /** Cuantos archivos faltan: la primera vez un mapa son unos 20 MB. */
    val bajando: StateFlow<Int> = _bajando.asStateFlow()

    private val _capas = MutableStateFlow<CapasNav?>(null)
    val capas: StateFlow<CapasNav?> = _capas.asStateFlow()

    private val _convoy = MutableStateFlow<EstadoConvoy?>(null)
    val convoy: StateFlow<EstadoConvoy?> = _convoy.asStateFlow()

    private val _rutaConvoy = MutableStateFlow<RutaConvoy?>(null)
    val rutaConvoy: StateFlow<RutaConvoy?> = _rutaConvoy.asStateFlow()

    private val tonos by lazy { runCatching { ToneGenerator(AudioManager.STREAM_NOTIFICATION, 70) }.getOrNull() }

    private val _ajustesNav = MutableStateFlow<AjustesNav?>(null)
    /** Lo de Ajustes que vive en el motor: el perfil y los DLC los cambia tambien otro dispositivo. */
    val ajustesNav: StateFlow<AjustesNav?> = _ajustesNav.asStateFlow()

    private val _entrega = MutableStateFlow<EntregaNav?>(null)
    val entrega: StateFlow<EntregaNav?> = _entrega.asStateFlow()
    private var cierreEntrega: Job? = null

    private val _reporte = MutableStateFlow<EstadoReporte?>(null)
    val reporte: StateFlow<EstadoReporte?> = _reporte.asStateFlow()

    private val hilo = Executors.newSingleThreadScheduledExecutor { r ->
        // Un stack grande: QuickJS se apoya en el del hilo que lo corre.
        Thread(null, r, "motor-nav", 32L * 1024 * 1024)
    }
    private val voz = Voz(contexto, { prefs.ajustes.value.volumenVoz }) { id -> enMotor { llamar("audioTermino", id) } }
    private val almacen = contexto.getSharedPreferences("truckdash_motor", Context.MODE_PRIVATE)

    private val _apariencia = MutableStateFlow(aparienciaGuardada(almacen.getString("truckdash_settings", null)))
    val apariencia: StateFlow<AparienciaMapa> = _apariencia.asStateFlow()

    private var js: QuickJSContext? = null
    private val funciones = HashMap<String, JSFunction>()
    private var motorObjeto: JSObject? = null
    private var iniciado = false
    private var fallo = false
    private var varianteActual: String? = null
    private var proximoPulso: ScheduledFuture<*>? = null

    /** Un dato de la demo: entra por el mismo camino que uno del cliente. */
    var alDatoDemo: (String) -> Unit = {}
    private val sockets = HashMap<Int, WebSocket>()
    private val datoPendiente = AtomicReference<String?>(null)

    @Volatile
    private var trabajandoDesdeMs = 0L

    /**
     * Lleva un rato en una sola cosa: una ruta larga en un telefono lento son decenas de
     * segundos sin JIT, y todo lo que se le pida espera atras. Mejor decirlo que parecer roto.
     */
    val ocupado: StateFlow<Boolean> = flow {
        var ultimoLargo = 0L
        while (true) {
            val ahora = SystemClock.uptimeMillis()
            val desde = trabajandoDesdeMs
            if (desde != 0L && ahora - desde >= OCUPADO_TRAS_MS) ultimoLargo = ahora
            emit(ultimoLargo != 0L && ahora - ultimoLargo < OCUPADO_SIGUE_MS)
            delay(500)
        }
    }.stateIn(alcance, SharingStarted.WhileSubscribed(), false)

    private inline fun midiendo(bloque: () -> Unit) {
        trabajandoDesdeMs = SystemClock.uptimeMillis()
        try {
            bloque()
        } finally {
            trabajandoDesdeMs = 0L
        }
    }

    private fun enMotor(bloque: () -> Unit) {
        hilo.execute {
            try {
                midiendo(bloque)
            } catch (e: Throwable) {
                // Sin ruta el tablero sigue andando: nunca se cae la app por esto.
                Log.e(TAG, "error en el motor", e)
            }
        }
    }

    // --------------------------------------------------------------- arranque

    private fun asegurarIniciado(): Boolean {
        if (iniciado) return true
        if (fallo) return false
        return try {
            val t0 = System.currentTimeMillis()
            QuickJSLoader.init()
            val c = QuickJSContext.create()
            c.setMaxStackSize(16 * 1024 * 1024)
            js = c
            val guardado = JSONObject()
            for ((k, v) in almacen.all) if (v is String) guardado.put(k, v)
            val tablet = contexto.resources.configuration.smallestScreenWidthDp >= 600
            val zona = JSONObject.quote(TimeZone.getDefault().id)
            val idioma = JSONObject.quote(Locale.getDefault().toLanguageTag())
            c.evaluate(
                "var almacenInicial = $guardado; var esTablet = $tablet; var zonaTelefono = $zona; var idiomaTelefono = $idioma;",
                "almacen.js",
            )
            val fuente = contexto.assets.open("motor/motor.js").bufferedReader().use { it.readText() }
            c.evaluate(fuente, "motor.js")
            motorObjeto = c.globalObject.getJSObject("motor")
            val config = buildJsonObject {
                put("lang", idiomaWeb())
                put("voz", prefs.ajustes.value.voz)
                put("version", "android-${BuildConfig.VERSION_NAME}")
                put("apodo", prefs.ajustes.value.apodo)
                put("relay", (if (BuildConfig.DEBUG) prefs.relayDePrueba else null) ?: Red.RELAY_WS)
            }
            llamar("iniciar", config.toString())
            (llamarDirecto("trazosCarriles") as? String)?.let { _trazos.value = parsearTrazos(it) }
            leerTextos(CLAVES_BUSCADOR)
            iniciado = true
            Log.i(TAG, "motor listo en ${System.currentTimeMillis() - t0} ms")
            drenar()
            true
        } catch (e: Throwable) {
            fallo = true
            Log.e(TAG, "no arranco el motor", e)
            false
        }
    }

    /** El idioma del telefono, si la web lo tiene: si no, cae al ingles sola. */
    private fun idiomaWeb(): String = Locale.getDefault().language.ifEmpty { "en" }

    private fun funcion(nombre: String): JSFunction =
        funciones.getOrPut(nombre) { motorObjeto!!.getJSFunction(nombre) }

    private fun llamarDirecto(nombre: String, vararg args: Any?): Any? = funcion(nombre).call(*args)

    private fun llamar(nombre: String, vararg args: Any?): Any? {
        val r = llamarDirecto(nombre, *args)
        drenar()
        return r
    }

    // ------------------------------------------------------------ desde afuera

    /** Un dato de telemetria, el texto tal cual llego. */
    fun telemetria(texto: String, imperial: Boolean) {
        // Solo uno en cola: si ya habia uno esperando, ese corre con el dato mas nuevo.
        if (datoPendiente.getAndSet(texto) != null) return
        enMotor {
            val dato = datoPendiente.getAndSet(null) ?: return@enMotor
            if (!asegurarIniciado()) return@enMotor
            llamarDirecto("ajustes", """{"imperial":$imperial}""")
            val t0 = System.currentTimeMillis()
            val nav = llamarDirecto("telemetria", dato) as? String
            val ms = System.currentTimeMillis() - t0
            if (ms > 500) Log.i(TAG, "un dato tardo $ms ms")
            nav?.let(::parsearNavegacion)?.let { _estado.value = it }
            drenar()
        }
    }

    /** route_plan, session_state y compania, como el onmessage de la web. */
    fun mensaje(texto: String) = enMotor { if (asegurarIniciado()) llamar("mensaje", texto) }

    fun conexion(abierta: Boolean, porLan: Boolean) = enMotor {
        if (asegurarIniciado()) llamar("conexion", abierta, porLan)
    }

    fun ponerVariante(v: VarianteMapa) {
        val clave = "${v.id}|${v.raiz}"
        if (clave == varianteActual) return
        varianteActual = clave
        enMotor {
            if (asegurarIniciado()) {
                llamar("ponerVariante", v.id, v.version, v.juego, v.proyeccion, v.nombre, v.centro.lng, v.centro.lat, v.raiz.orEmpty(), v.logosPropios)
            }
        }
    }

    fun ponerVoz(prendida: Boolean) = enMotor { if (asegurarIniciado()) llamar("voz", prendida) }

    fun compartir(activo: Boolean, variante: String?) = enMotor {
        if (asegurarIniciado()) llamar("compartir", activo, variante)
    }

    // Lo que pide la persona: sobre el dato de ahora, sin esperar al proximo.
    private fun pedir(nombre: String, vararg args: Any?) = enMotor {
        if (asegurarIniciado()) {
            llamar(nombre, *args)
            (llamarDirecto("navegacion") as? String)?.let(::parsearNavegacion)?.let { _estado.value = it }
        }
    }

    fun parada(codigo: String) = pedir("parada", codigo)
    fun aceptarSugerencia() = pedir("aceptarSugerencia")
    fun cerrarSugerencia() = pedir("cerrarSugerencia")
    fun elegir(indice: Int) = pedir("elegir", indice)
    fun waypointEnMapa(lng: Double, lat: Double) = pedir("waypointEnMapa", lng, lat)
    fun sacarWaypoint(indice: Int) = pedir("sacarWaypoint", indice)
    fun limpiarWaypoints() = pedir("limpiarWaypoints")
    fun ocultarRuta() = pedir("ocultarRuta")
    fun mostrarRuta() = pedir("mostrarRuta")
    fun traerVoz() = pedir("traerVoz")
    fun perfilRuta(perfil: String) = pedir("perfilRuta", perfil)
    fun elegirVoz(id: String) = pedir("elegirVoz", id)
    fun probarVoz() = pedir("probarVoz")
    fun momentoVoz(valor: String) = pedir("momentoVoz", valor)
    fun avisoDescanso(valor: String) = pedir("avisoDescanso", valor)
    fun cadaSalida(valor: Boolean) = pedir("cadaSalida", valor)
    fun dlcAutomatico(auto: Boolean) = pedir("dlcAutomatico", auto)
    fun dlcActivo(juego: String, id: String, activo: Boolean) = pedir("dlcActivo", juego, id, activo)
    fun moneda(valor: String) = pedir("moneda", valor)
    fun reloj(valor: String) = pedir("reloj", valor)
    fun miniHud(clave: String, valor: Boolean) = pedir("miniHud", clave, valor)
    fun apariencia(clave: String, valor: Any) = pedir("apariencia", clave, valor)
    fun liviano(modo: Boolean, sinRuteo: Boolean) = pedir("liviano", modo, sinRuteo)
    fun rutaEnVivo(valor: Boolean) = pedir("rutaEnVivo", valor)
    fun reiniciarSesion() = pedir("reiniciarSesion")
    fun cerrarEntrega() {
        cierreEntrega?.cancel()
        _entrega.value = null
    }

    fun empezarDemo() = pedir("demo")

    /** Lo que el motor baja para navegar por este mapa, antes de quedarse sin red. */
    suspend fun bajarDatosDe(id: String, version: String): Boolean {
        val listo = CompletableDeferred<String?>()
        enMotor { listo.complete(if (asegurarIniciado()) llamarDirecto("urlsDeMapa", id, version) as? String else null) }
        val urls = listo.await()?.let { org.json.JSONArray(it) } ?: return false
        var bien = true
        for (i in 0 until urls.length()) {
            if (archivos.pedir(urls.getString(i)).status != 200) bien = false
        }
        return bien
    }

    fun pedirAjustes() = enMotor {
        if (asegurarIniciado()) {
            leerAjustes()
            drenar()
        }
    }

    private fun leerConvoy() {
        (llamarDirecto("convoyEstado") as? String)?.let(::parsearConvoy)?.let { _convoy.value = it }
    }

    fun pedirConvoy() = enMotor {
        if (asegurarIniciado()) {
            llamarDirecto("convoyTomar")
            leerConvoy()
            drenar()
        }
    }

    fun convoyEntrar(tipo: String, codigo: String, apodo: String, avisarDiscord: Boolean) =
        pedir("convoyEntrar", tipo, codigo, apodo, avisarDiscord)
    fun convoyIngresos(valor: Boolean) = pedir("convoyIngresos", valor)
    fun convoySilencio(valor: Boolean) = pedir("convoySilencio", valor)
    fun convoyMarcas(valor: Boolean) = pedir("convoyMarcas", valor)
    fun convoyMirar(codigo: String) = pedir("convoyMirar", codigo)
    fun convoyDejarDeMirar() = pedir("convoyDejarDeMirar")
    fun convoySalir() = pedir("convoySalir")
    fun convoyTerminar() = pedir("convoyTerminar")
    fun convoyEchar(id: String) = pedir("convoyEchar", id)
    fun convoyMandar(clave: String) = pedir("convoyMandar", clave)
    fun convoySeguir(valor: Boolean) = pedir("convoySeguir", valor)
    fun convoyVerRuta(valor: Boolean) = pedir("convoyVerRuta", valor)

    /** Las entregas guardadas en este telefono. */
    suspend fun viajes(): HistorialViajes? {
        val listo = CompletableDeferred<HistorialViajes?>()
        enMotor {
            val r = if (asegurarIniciado()) llamarDirecto("viajes") as? String else null
            listo.complete(r?.let(::parsearViajes))
        }
        return listo.await()
    }

    fun borrarViajes() = pedir("borrarViajes")

    private fun leerCapas() {
        val info = (llamarDirecto("capasInfo") as? String)?.let(::parsearObjeto) ?: return
        fun capa(cual: String) = (llamarDirecto("capaGeo", cual) as? String)?.takeIf { it.isNotEmpty() }
        _capas.value = CapasNav(
            escudos = info.lista("escudos")?.mapNotNull { fila ->
                val e = fila.comoObjeto() ?: return@mapNotNull null
                EscudoRuta(e.texto("label") ?: return@mapNotNull null, e.texto("k") == "i", e.texto("n").orEmpty())
            } ?: emptyList(),
            geoEscudos = capa("road-shields"),
            atlas = capa("atlas"),
            estacionamiento = capa("car-parking"),
            combustible = capa("fuel"),
            filtroPoi = info["filtroPoi"]?.takeIf { it is kotlinx.serialization.json.JsonArray }?.toString(),
            estacionamientoVisible = info.logico("estacionamiento") ?: false,
        )
    }

    private fun leerAjustes() {
        val a = (llamarDirecto("ajustesNav") as? String)?.let(::parsearAjustesNav) ?: return
        _ajustesNav.value = a
        _apariencia.value = _apariencia.value.copy(
            colorRuta = a.colorRuta,
            tamanoCamion = a.tamanoCamion,
            baseReal = a.baseReal,
            desvanecerBotones = a.desvanecerBotones,
            mantenerBrujula = a.mantenerBrujula,
            // liviano no: vale al volver a abrir, y el mapa ya nacio con el de antes.
        )
    }

    /** Lo que se ve es lo que se manda: el texto se arma al abrir, como en la web. */
    suspend fun abrirReporte(): FormularioReporte? {
        _reporte.value = null
        val listo = CompletableDeferred<FormularioReporte?>()
        enMotor {
            val r = if (asegurarIniciado()) llamarDirecto("abrirReporte") as? String else null
            listo.complete(r?.let(::parsearFormularioReporte))
        }
        return listo.await()
    }

    fun mandarReporte(tipo: String?, descripcion: String) = pedir("mandarReporte", tipo, descripcion)

    suspend fun buscar(texto: String, categoria: String): BusquedaNav {
        val listo = CompletableDeferred<BusquedaNav>()
        enMotor {
            val r = if (asegurarIniciado()) llamar("buscar", texto, categoria) as? String else null
            listo.complete(r?.let(::parsearBusqueda) ?: BusquedaNav(null, emptyList()))
        }
        return listo.await()
    }

    private val textosLeidos = ConcurrentHashMap<String, String>()

    private fun leerTextos(claves: List<String>): Map<String, String> {
        val o = (llamarDirecto("textos", org.json.JSONArray(claves).toString()) as? String)?.let { JSONObject(it) }
        val leidos = o?.keys()?.asSequence()?.associateWith { o.getString(it) } ?: emptyMap()
        textosLeidos.putAll(leidos)
        return leidos
    }

    /**
     * Textos en el idioma del telefono, de los ocho de la web. Una vez leidos no se le piden mas
     * al motor: con una ruta calculandose, el buscador se abria sin un solo texto.
     */
    suspend fun textos(claves: List<String>): Map<String, String> {
        if (claves.all(textosLeidos::containsKey)) return claves.associateWith { textosLeidos.getValue(it) }
        val listo = CompletableDeferred<Map<String, String>>()
        enMotor { listo.complete(if (asegurarIniciado()) leerTextos(claves) else emptyMap()) }
        return listo.await()
    }

    /** La sesion se corto o se olvido: lo que quedaba en pantalla ya no vale. */
    fun olvidarPantalla() {
        _estado.value = EstadoNav()
        _ruta.value = null
        _capas.value = null
        enMotor { if (iniciado) llamar("olvidar") }
    }

    // --------------------------------------------------- lo que pide la web

    private fun drenar() {
        val texto = llamarDirecto("volcar") as? String ?: return
        val s = parsearObjeto(texto) ?: return

        s.lista("log")?.forEach { fila ->
            val par = fila as? kotlinx.serialization.json.JsonArray ?: return@forEach
            val nivel = (par.getOrNull(0) as? JsonPrimitive)?.content
            val mensaje = (par.getOrNull(1) as? JsonPrimitive)?.content ?: ""
            if (nivel == "e") Log.e(TAG, mensaje) else Log.d(TAG, mensaje)
        }
        s.lista("guardar")?.let { filas ->
            if (filas.isNotEmpty()) {
                almacen.edit {
                    for (fila in filas) {
                        val par = fila as? kotlinx.serialization.json.JsonArray ?: continue
                        val k = (par.getOrNull(0) as? JsonPrimitive)?.content ?: continue
                        val v = par.getOrNull(1) as? JsonPrimitive
                        if (v == null || v is kotlinx.serialization.json.JsonNull) remove(k) else putString(k, v.content)
                    }
                }
            }
        }
        if (s.logico("ajustes") == true) leerAjustes()
        if (s.logico("capas") == true) leerCapas()
        if (s.logico("convoy") == true) leerConvoy()
        if (s.logico("rutaConvoy") == true) {
            (llamarDirecto("rutaConvoyGeo") as? String)?.let(::parsearRutaConvoy).let { _rutaConvoy.value = it }
        }
        s.lista("demo")?.forEach { d ->
            (d as? JsonPrimitive)?.content?.let { alcance.launch { alDatoDemo(it) } }
        }
        s.lista("sonidos")?.forEach { fila ->
            // La web sintetiza dos notas por sonido; aca, un tono del sistema.
            tonos?.startTone(
                when ((fila as? JsonPrimitive)?.content) {
                    "leave" -> ToneGenerator.TONE_PROP_NACK
                    "msg" -> ToneGenerator.TONE_PROP_BEEP2
                    else -> ToneGenerator.TONE_PROP_ACK
                },
                180,
            )
        }
        s.objeto("entrega")?.let { e ->
            val tarjeta = parsearEntrega(e)
            _entrega.value = tarjeta
            cierreEntrega?.cancel()
            cierreEntrega = alcance.launch {
                delay(tarjeta.duraMs)
                _entrega.value = null
            }
        }
        s.objeto("reporte")?.let { r ->
            _reporte.value = EstadoReporte(r.texto("estado").orEmpty(), r.texto("texto").orEmpty(), r.texto("boton"))
        }
        s.lista("sockets")?.forEach { fila ->
            val op = fila as? kotlinx.serialization.json.JsonArray ?: return@forEach
            val id = (op.getOrNull(1) as? JsonPrimitive)?.content?.toIntOrNull() ?: return@forEach
            val dato = (op.getOrNull(2) as? JsonPrimitive)?.content
            when ((op.getOrNull(0) as? JsonPrimitive)?.content) {
                "abrir" -> dato?.let { abrirSocket(id, it) }
                "enviar" -> dato?.let { sockets[id]?.send(it) }
                "cerrar" -> sockets.remove(id)?.close(1000, null)
            }
        }
        s.lista("mensajes")?.forEach { m ->
            (m as? JsonPrimitive)?.content?.let { alcance.launch { enviarAlSocket(it) } }
        }
        s.lista("avisos")?.forEach { a ->
            (a as? JsonPrimitive)?.content?.let { _avisos.tryEmit(it) }
        }
        s.lista("audio")?.forEach { fila ->
            val a = fila.comoObjeto() ?: return@forEach
            val id = a.entero("id") ?: return@forEach
            val clip = a.texto("src")
            val frase = a.texto("text")
            // La voz va a su propio ritmo: el motor sigue, y se entera al terminar.
            alcance.launch {
                when {
                    clip != null -> voz.clip(id, clip)
                    frase != null -> voz.texto(id, frase, a.texto("lang"))
                    else -> enMotor { llamar("audioTermino", id) }
                }
            }
        }
        s.objeto("ruta")?.let { r ->
            fun linea(cual: String) = (llamarDirecto("rutaGeo", cual) as? String)?.takeIf { it.isNotEmpty() }
            _ruta.value = RutaDibujada(linea("route"), linea("route-next"), linea("route-ferry"), r.logico("conLinea") ?: false)
        }
        s.lista("fetch")?.forEach { fila ->
            val p = fila.comoObjeto() ?: return@forEach
            val id = p.entero("id") ?: return@forEach
            val url = p.texto("url") ?: return@forEach
            if (p.texto("method") != null) enviar(id, url, p.texto("body").orEmpty()) else bajar(id, url)
        }

        proximoPulso?.cancel(false)
        val ms = s.entero("timerMs") ?: -1
        if (ms >= 0) {
            proximoPulso = hilo.schedule(
                { enMotorDirecto { llamar("pulso") } },
                ms.toLong().coerceAtLeast(10),
                TimeUnit.MILLISECONDS,
            )
        }
    }

    private fun enMotorDirecto(bloque: () -> Unit) {
        try {
            midiendo(bloque)
        } catch (e: Throwable) {
            Log.e(TAG, "error en un timer del motor", e)
        }
    }

    private fun bajar(id: Int, url: String) {
        // El aviso dice "bajando las rutas": las tasas o las voces no son eso, y sin red tardan.
        val esGrafo = ArchivosMapa.esBinario(url)
        if (esGrafo) _bajando.value += 1
        alcance.launch {
            val r = archivos.pedir(url)
            if (esGrafo) _bajando.value -= 1
            enMotor {
                val cuerpo: Any = when {
                    r.bytes == null -> ""
                    ArchivosMapa.esBinario(url) -> r.bytes
                    else -> String(r.bytes, Charsets.UTF_8)
                }
                llamar("respuesta", id, r.status, cuerpo)
            }
        }
    }

    /** Un POST a la API (el reporte): nunca pasa por el cache, y a ningun otro lado. */
    private fun enviar(id: Int, url: String, cuerpo: String) {
        alcance.launch {
            val r = withContext(Dispatchers.IO) {
                if (!url.startsWith(Red.API)) return@withContext null
                val destino = (if (BuildConfig.DEBUG) prefs.apiDePrueba else null)?.let { url.replace(Red.API, it) } ?: url
                runCatching {
                    val pedido = Request.Builder().url(destino).post(cuerpo.toRequestBody("application/json".toMediaType())).build()
                    Red.http.newCall(pedido).execute().use { it.code to it.body.string() }
                }.getOrNull()
            }
            enMotor { llamar("respuesta", id, r?.first ?: 0, r?.second ?: "") }
        }
    }

    /** Un socket que abrio la web: por LAN, la conexion solo de plan al relay. */
    private fun abrirSocket(id: Int, url: String) {
        val pedido = runCatching { Request.Builder().url(url).build() }.getOrNull()
        if (pedido == null) {
            enMotor { llamar("socket", id, "close", "", 1006) }
            return
        }
        fun evento(tipo: String, texto: String = "", codigo: Int = 0) = pedir("socket", id, tipo, texto, codigo)
        sockets[id] = Red.http.newWebSocket(
            pedido,
            object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) = evento("open")
                override fun onMessage(webSocket: WebSocket, text: String) = evento("message", text)
                override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                    webSocket.close(code, null)
                }
                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    enMotor { sockets.remove(id) }
                    evento("close", codigo = code)
                }
                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    enMotor { sockets.remove(id) }
                    evento("close", codigo = 1006)
                }
            },
        )
    }

    private companion object {
        const val TAG = "MotorNav"
    }
}
