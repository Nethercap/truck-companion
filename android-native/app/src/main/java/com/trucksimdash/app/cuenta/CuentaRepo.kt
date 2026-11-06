package com.trucksimdash.app.cuenta

import androidx.compose.runtime.Immutable
import com.trucksimdash.app.core.Boveda
import com.trucksimdash.app.core.Red
import com.trucksimdash.app.core.entero
import com.trucksimdash.app.core.logico
import com.trucksimdash.app.core.objeto
import com.trucksimdash.app.core.parsearObjeto
import com.trucksimdash.app.core.texto
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.TimeZone

sealed interface EstadoCuenta {
    /** Todavia no se sabe: hay token y se esta preguntando de quien es. */
    data object Cargando : EstadoCuenta
    data object SinVincular : EstadoCuenta
    data class Vinculando(val codigo: String, val url: String, val venceMs: Long) : EstadoCuenta
    data object VinculoVencido : EstadoCuenta
    data class Vinculada(val usuario: Usuario?) : EstadoCuenta
}

@Immutable
data class DatosStats(
    val resumenes: List<ResumenJuego> = emptyList(),
    val totales: List<TotalManejo> = emptyList(),
    val logros: List<Logro> = emptyList(),
    val actividad: List<DiaActividad> = emptyList(),
    val viajes: List<Viaje> = emptyList(),
    val totalViajes: Int = 0,
    val cargando: Boolean = false,
    val cargandoMas: Boolean = false,
    /** La ultima carga no llego; lo que hay es de antes. */
    val sinRed: Boolean = false,
)

/**
 * La cuenta de Truck Dash: la app no pide contrasena ni guarda secretos. Pide un
 * codigo, la persona lo aprueba en la web ya logueada y recien ahi retira un
 * token (/auth/device, el mismo camino que el cliente de la PC). Ese token solo
 * sirve para los viajes y para seguir a otros: cambiar el nombre o borrar la cuenta
 * sigue siendo solo con cookie, desde la web (auth_dep.py en la API).
 */
class CuentaRepo(
    private val http: OkHttpClient,
    private val boveda: Boveda,
    private val alcance: CoroutineScope,
    private val base: () -> String = { Red.API },
) {
    private val _estado = MutableStateFlow<EstadoCuenta>(EstadoCuenta.SinVincular)
    val estado: StateFlow<EstadoCuenta> = _estado.asStateFlow()

    private val _datos = MutableStateFlow(DatosStats())
    val datos: StateFlow<DatosStats> = _datos.asStateFlow()

    private var espera: Job? = null

    init {
        if (boveda.token != null) {
            _estado.value = EstadoCuenta.Cargando
            alcance.launch { refrescar() }
        }
    }

    // ------------------------------------------------------------- pedidos

    private data class Respuesta(val codigo: Int, val datos: JsonObject?)

    /** (0, null) es sin red. Nunca tira: sin API, el tablero sigue andando. */
    private suspend fun pedir(ruta: String, cuerpo: JsonObject? = null, token: String? = null, metodo: String? = null): Respuesta =
        withContext(Dispatchers.IO) {
            runCatching {
                val pedido = Request.Builder().url(base() + ruta)
                if (token != null) pedido.header("Authorization", "Bearer $token")
                when {
                    metodo != null -> pedido.method(metodo, cuerpo?.toString()?.toRequestBody(JSON))
                    cuerpo != null -> pedido.post(cuerpo.toString().toRequestBody(JSON))
                }
                http.newCall(pedido.build()).execute().use { r ->
                    Respuesta(r.code, parsearObjeto(r.body.string()))
                }
            }.getOrDefault(Respuesta(0, null))
        }

    // ------------------------------------------------------------- vinculo

    /** Arranca el vinculo. Devuelve la pagina a abrir, o null si no hubo respuesta. */
    suspend fun empezarVinculo(nombreDispositivo: String): String? {
        val r = pedir("/auth/device/start", buildJsonObject { put("device_name", nombreDispositivo) })
        val d = r.datos
        val secreto = d?.texto("secret")
        val url = d?.texto("url")
        val codigo = d?.texto("code")
        if (r.codigo != 200 || secreto == null || url == null || codigo == null) return null
        val vence = System.currentTimeMillis() + (d.entero("expires_in") ?: 600) * 1000L
        _estado.value = EstadoCuenta.Vinculando(codigo, url, vence)
        espera?.cancel()
        espera = alcance.launch { esperarAprobacion(secreto, vence) }
        return url
    }

    private suspend fun esperarAprobacion(secreto: String, venceMs: Long) {
        while (alcance.isActive && System.currentTimeMillis() < venceMs) {
            delay(CADA_MS)
            val r = pedir("/auth/device/poll", buildJsonObject { put("secret", secreto) })
            when {
                r.codigo == 0 -> continue // un corte de internet no es un codigo vencido
                r.codigo == 200 && r.datos?.logico("pendiente") == true -> continue
                r.codigo == 200 && r.datos?.texto("token") != null -> {
                    boveda.token = r.datos.texto("token")
                    _estado.value = EstadoCuenta.Cargando
                    refrescar()
                    return
                }
                else -> break
            }
        }
        _estado.value = EstadoCuenta.VinculoVencido
    }

    fun cancelarVinculo() {
        espera?.cancel()
        _estado.value = EstadoCuenta.SinVincular
    }

    /**
     * Borra el token de este telefono. La API no tiene como revocarlo con el
     * token mismo: sigue en la lista de dispositivos de la pagina de la cuenta,
     * y la pantalla lo dice.
     */
    fun olvidar() {
        espera?.cancel()
        boveda.token = null
        _datos.value = DatosStats()
        _estado.value = EstadoCuenta.SinVincular
    }

    // ---------------------------------------------------------- mas de stats

    private val zonaHoraria: Int get() = TimeZone.getDefault().getOffset(System.currentTimeMillis()) / 60000

    suspend fun mapaRecorrido(juego: String, ano: Int?): MapaRecorrido? {
        val token = boveda.token ?: return null
        val filtro = if (ano != null) "&year=$ano&tz=$zonaHoraria" else ""
        val r = pedir("/trips/map?game=$juego$filtro", token = token)
        return if (r.codigo == 200) parsearMapa(r.datos) else null
    }

    suspend fun resumenAno(ano: Int): ResumenAno? {
        val token = boveda.token ?: return null
        val r = pedir("/trips/wrapped?year=$ano&tz=$zonaHoraria", token = token)
        return if (r.codigo == 200) parsearAno(r.datos) else null
    }

    /** Estado (cancelado o sin terminar) o nota. Devuelve false si no se pudo. */
    suspend fun corregirViaje(id: String, nota: String? = null, estado: String? = null): Boolean {
        val token = boveda.token ?: return false
        val cuerpo = buildJsonObject {
            if (nota != null) put("note", nota)
            if (estado != null) put("status", estado)
        }
        val r = pedir("/trips/$id", cuerpo, token, "PATCH")
        if (r.codigo != 200) return false
        val nuevo = parsearViajeLista(listOfNotNull(r.datos?.objeto("trip"))).firstOrNull() ?: return false
        _datos.update { d -> d.copy(viajes = d.viajes.map { if (it.id == id) nuevo else it }) }
        // Cambiar el estado mueve los numeros: entregas, paises.
        if (estado != null) refrescar()
        return true
    }

    /** Un 404 es que ya no estaba: lo que se pidio, no un error. */
    suspend fun borrarViaje(id: String): Boolean {
        val token = boveda.token ?: return false
        val r = pedir("/trips/$id", token = token, metodo = "DELETE")
        if (r.codigo != 200 && r.codigo != 404) return false
        _datos.update { d -> d.copy(viajes = d.viajes.filter { it.id != id }, totalViajes = (d.totalViajes - 1).coerceAtLeast(0)) }
        refrescar()
        return true
    }

    suspend fun listasSeguir(): ListasSeguir? {
        val token = boveda.token ?: return null
        val r = pedir("/follow", token = token)
        return if (r.codigo == 200) parsearListas(r.datos) else null
    }

    suspend fun novedades(): List<Novedad> {
        val token = boveda.token ?: return emptyList()
        return parsearNovedades(pedir("/follow/feed", token = token).datos)
    }

    /** Sin cuenta vinculada o sin seguirlo, lo que la API deje ver. */
    suspend fun perfil(nombre: String): PerfilAjeno? {
        val token = boveda.token ?: return null
        val r = pedir("/follow/user/" + java.net.URLEncoder.encode(nombre, "UTF-8"), token = token)
        return if (r.codigo == 200) parsearPerfil(r.datos) else null
    }

    /** /follow/request y compania. Devuelve la clave del error, o null si salio bien. */
    suspend fun accionSeguir(ruta: String, nombre: String): String? {
        val token = boveda.token ?: return "sin_cuenta"
        val r = pedir(ruta, buildJsonObject { put("username", nombre) }, token)
        return if (r.codigo == 200) null else (r.datos?.texto("error") ?: "error")
    }

    // --------------------------------------------------------------- datos

    suspend fun refrescar() {
        val token = boveda.token ?: return
        _datos.update { it.copy(cargando = true) }
        val yo = pedir("/auth/me", token = token)
        when {
            yo.codigo == 200 && parsearUsuario(yo.datos) == null -> {
                // La API contesto que ese token no es de nadie: lo revocaron.
                olvidar()
                return
            }
            yo.codigo == 200 -> _estado.value = EstadoCuenta.Vinculada(parsearUsuario(yo.datos))
            // Sin red o la API caida no es una sesion cerrada: con lo que habia.
            _estado.value is EstadoCuenta.Cargando -> _estado.value = EstadoCuenta.Vinculada(null)
        }
        // Minutos a SUMARLE a UTC para la hora local (Buenos Aires -180): asi una
        // sesion de las 23 h no cae en el dia siguiente.
        val tz = TimeZone.getDefault().getOffset(System.currentTimeMillis()) / 60000
        coroutineScope {
            val stats = async { pedir("/trips/stats", token = token) }
            val totales = async { pedir("/sessions/totals", token = token) }
            val logros = async { pedir("/trips/achievements", token = token) }
            val actividad = async { pedir("/trips/activity?tz=$tz&dias=$DIAS_ACTIVIDAD", token = token) }
            val viajes = async { pedir("/trips?limite=$POR_PAGINA", token = token) }
            val rStats = stats.await()
            if (rStats.codigo == 401) {
                olvidar()
                return@coroutineScope
            }
            val rTotales = totales.await()
            val rLogros = logros.await()
            val rActividad = actividad.await()
            val rViajes = viajes.await()
            _datos.update { previo ->
                val (lista, total) = if (rViajes.codigo == 200) parsearViajes(rViajes.datos) else previo.viajes to previo.totalViajes
                previo.copy(
                    resumenes = if (rStats.codigo == 200) parsearResumenes(rStats.datos) else previo.resumenes,
                    totales = if (rTotales.codigo == 200) parsearTotales(rTotales.datos) else previo.totales,
                    logros = if (rLogros.codigo == 200) parsearLogros(rLogros.datos) else previo.logros,
                    actividad = if (rActividad.codigo == 200) parsearActividad(rActividad.datos) else previo.actividad,
                    viajes = lista,
                    totalViajes = total,
                    cargando = false,
                    sinRed = rStats.codigo != 200,
                )
            }
        }
    }

    suspend fun masViajes() {
        val token = boveda.token ?: return
        val d = _datos.value
        if (d.cargandoMas || d.viajes.size >= d.totalViajes) return
        _datos.update { it.copy(cargandoMas = true) }
        val r = pedir("/trips?limite=$POR_PAGINA&desde=${d.viajes.size}", token = token)
        _datos.update { previo ->
            if (r.codigo != 200) {
                previo.copy(cargandoMas = false)
            } else {
                val (nuevos, total) = parsearViajes(r.datos)
                previo.copy(viajes = (previo.viajes + nuevos).distinctBy { it.id }, totalViajes = total, cargandoMas = false)
            }
        }
    }

    private companion object {
        val JSON = "application/json".toMediaType()
        const val CADA_MS = 3000L
        const val POR_PAGINA = 20
        const val DIAS_ACTIVIDAD = 30
    }
}
