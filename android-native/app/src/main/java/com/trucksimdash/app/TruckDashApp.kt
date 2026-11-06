package com.trucksimdash.app

import android.app.Application
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
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.Request
import org.maplibre.android.MapLibre
import org.maplibre.android.module.http.HttpRequestUtil
import java.io.File

/** Lo que vive mientras vive la app; las pantallas lo reciben, no lo crean. */
class Contenedor(app: Application) {
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
    }

    val mapas = MapasSinInternet(app, Red.http, alcance, nav)

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
            _catalogo.value = nuevo
            withContext(Dispatchers.IO) { runCatching { archivoManifest.writeText(texto) } }
        }
    }

    private var pausa: Job? = null

    /** En segundo plano el socket se cierra despues de un rato: nadie lo mira. */
    fun alIrAlFondo() {
        pausa?.cancel()
        pausa = alcance.launch {
            delay(SEGUNDO_PLANO_MS)
            sesion.pausar()
        }
    }

    fun alVolver() {
        pausa?.cancel()
        sesion.reanudar()
    }

    private companion object {
        // Un rato: cambiar a otra app un momento no tiene que cortar nada.
        const val SEGUNDO_PLANO_MS = 60_000L
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
