package com.trucksimdash.app

import android.app.Application
import androidx.core.content.ContextCompat
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import com.trucksimdash.app.core.Boveda
import com.trucksimdash.app.core.Preferencias
import com.trucksimdash.app.core.Red
import com.trucksimdash.app.cuenta.CuentaRepo
import com.trucksimdash.app.mapa.CatalogoMapas
import com.trucksimdash.app.mapa.MapasSinInternet
import com.trucksimdash.app.mapa.VarianteMapa
import com.trucksimdash.app.nav.ArchivosMapa
import com.trucksimdash.app.nav.MotorNav
import com.trucksimdash.app.telemetria.EstadoSesion
import com.trucksimdash.app.telemetria.Fase
import com.trucksimdash.app.telemetria.OyenteSesion
import com.trucksimdash.app.telemetria.SesionRepo
import com.trucksimdash.app.vivo.MapaVivoRepo
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.Request
import org.maplibre.android.MapLibre
import org.maplibre.android.module.http.HttpRequestUtil
import java.io.File

/** Lo que vive mientras vive la app; las pantallas lo reciben, no lo crean. */
class Contenedor(private val app: Application) {
    private val alcance = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val archivoManifest = File(app.filesDir, "map-manifest.json")

    val prefs = Preferencias(app)

    private val _catalogo = MutableStateFlow(leerCatalogo(app))
    val catalogo: StateFlow<CatalogoMapas> = _catalogo.asStateFlow()

    val sesion = SesionRepo(Red.http, prefs, alcance, catalogo, prefs.ajustes)
    val vivo = MapaVivoRepo(Red.http, prefs, alcance)
    val nav = MotorNav(app, prefs, ArchivosMapa(File(app.cacheDir, "mapas"), Red.http), alcance) { sesion.enviarCrudo(it) }

    init {
        sesion.oyente = object : OyenteSesion {
            override fun telemetria(texto: String, variante: VarianteMapa?, imperial: Boolean) {
                variante?.let(nav::ponerVariante)
                nav.telemetria(texto, imperial)
            }

            override fun mensaje(texto: String) = nav.mensaje(texto)
            override fun conexion(abierta: Boolean, porLan: Boolean) = nav.conexion(abierta, porLan)
            override fun compartir(activo: Boolean, variante: String?) = nav.compartir(activo, variante)
            override fun sesionOlvidada() = nav.olvidarPantalla()
            override fun demo() = nav.empezarDemo()
        }
        nav.alDatoDemo = { sesion.datoDemo(it) }
        sesion.alMapasLocales = { mapas, base ->
            val hoy = _catalogo.value
            _catalogo.value = hoy.conLocales(
                mapas.mapNotNull { (juego, m) ->
                    val v = hoy.variantes[juego] ?: return@mapNotNull null
                    v.copy(
                        id = m.variante,
                        nombre = "${v.nombre} (${app.getString(R.string.mapa_local)})",
                        version = m.huella,
                        anteriorDe = null,
                        raiz = "$base/localmap/$juego",
                        logosPropios = m.conLogos,
                    )
                },
            )
        }
    }

    val mapas = MapasSinInternet(app, Red.http, alcance, nav)

    /** El codigo de un link de un convoy que abrio la app (`/app/?convoy=CODE`). */
    val enlaceConvoy = MutableStateFlow<String?>(null)

    val cuenta = CuentaRepo(Red.http, Boveda(app), alcance) {
        (if (BuildConfig.DEBUG) prefs.apiDePrueba else null) ?: Red.API
    }

    private fun leerCatalogo(app: Application): CatalogoMapas {
        // Lo ultimo que se bajo, y si no, el que vino con la app.
        val guardado = runCatching { CatalogoMapas.desdeManifest(archivoManifest.readText()) }.getOrNull()
        if (guardado != null) return guardado
        val deFabrica = app.assets.open("map-manifest.json").bufferedReader().use { it.readText() }
        return CatalogoMapas.desdeManifest(deFabrica) ?: CatalogoMapas.VACIO
    }

    /** Un mapa publicado despues de esta version de la app se ve igual. */
    fun actualizarCatalogo() {
        alcance.launch {
            val texto = withContext(Dispatchers.IO) {
                runCatching {
                    Red.http.newCall(Request.Builder().url("${Red.WEB}/data/map-manifest.json").build()).execute().use { r ->
                        if (r.isSuccessful) r.body.string() else null
                    }
                }.getOrNull()
            } ?: return@launch
            val nuevo = CatalogoMapas.desdeManifest(texto) ?: return@launch
            _catalogo.value = nuevo.conLocales(_catalogo.value.locales)
            withContext(Dispatchers.IO) { runCatching { archivoManifest.writeText(texto) } }
        }
    }

    private var pausa: Job? = null
    private var enPrimerPlano = false
    private var servicioPrendido = false

    init {
        alcance.launch {
            combine(sesion.estado, prefs.ajustes) { e, a -> a.segundoPlano && sesionAndando(e) }
                .distinctUntilChanged()
                .collect { acomodarServicio(it) }
        }
    }

    private fun sesionAndando(e: EstadoSesion) = !e.demo && e.fase != Fase.Apagada && e.fase != Fase.CodigoInvalido

    private fun acomodarServicio(quiere: Boolean) {
        if (quiere && !servicioPrendido) {
            // Solo con la app adelante: Android no deja prenderlo desde atras, y al volver se reintenta.
            if (!enPrimerPlano) return
            servicioPrendido = runCatching { ContextCompat.startForegroundService(app, ServicioManejo.intent(app)) }.isSuccess
        } else if (!quiere && servicioPrendido) {
            app.stopService(ServicioManejo.intent(app))
            servicioPrendido = false
        }
    }

    /**
     * Sin el servicio, en segundo plano el socket se cierra despues de un rato. Con el, sigue
     * mientras haya juego: un estado que no se cumple solo necesita su salida (supuesto 8), y sin
     * esto cerrar el juego dejaba la notificacion y la bateria gastandose hasta abrir la app.
     */
    fun alIrAlFondo() {
        enPrimerPlano = false
        pausa?.cancel()
        pausa = alcance.launch {
            if (servicioPrendido) {
                var sinJuegoMs = 0L
                while (sinJuegoMs < SIN_JUEGO_MS) {
                    delay(MIRAR_JUEGO_MS)
                    sinJuegoMs = if (sesion.estado.value.enVivo) 0 else sinJuegoMs + MIRAR_JUEGO_MS
                }
                acomodarServicio(false)
            } else {
                delay(SEGUNDO_PLANO_MS)
            }
            sesion.pausar()
        }
    }

    fun alVolver() {
        enPrimerPlano = true
        pausa?.cancel()
        sesion.reanudar()
        acomodarServicio(prefs.ajustes.value.segundoPlano && sesionAndando(sesion.estado.value))
    }

    private companion object {
        // Un rato: cambiar a otra app un momento no tiene que cortar nada.
        const val SEGUNDO_PLANO_MS = 60_000L
        const val MIRAR_JUEGO_MS = 30_000L
        const val SIN_JUEGO_MS = 10 * 60_000L
    }
}

class TruckDashApp : Application() {
    lateinit var contenedor: Contenedor
        private set

    override fun onCreate() {
        super.onCreate()
        Red.iniciar(cacheDir)
        MapLibre.getInstance(this)
        // Todo pedido del mapa pasa por el mismo cliente, con su Referer (ver Red).
        HttpRequestUtil.setOkHttpClient(Red.http)
        contenedor = Contenedor(this)
        contenedor.actualizarCatalogo()
        contenedor.sesion.reconectarGuardado()
        ProcessLifecycleOwner.get().lifecycle.addObserver(
            object : DefaultLifecycleObserver {
                override fun onStart(owner: LifecycleOwner) = contenedor.alVolver()
                override fun onStop(owner: LifecycleOwner) = contenedor.alIrAlFondo()
            },
        )
    }
}
