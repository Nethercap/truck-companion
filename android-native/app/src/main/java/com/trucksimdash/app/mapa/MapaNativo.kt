package com.trucksimdash.app.mapa

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameMillis
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.trucksimdash.app.TruckDashApp
import com.trucksimdash.app.core.Red
import org.maplibre.android.maps.MapLibreMapOptions
import org.maplibre.android.maps.MapView

/**
 * El MapView en Compose, con su ciclo de vida. [alListo] entrega el control una
 * vez que el mapa existe; desde ahi la pantalla le dice que dibujar.
 */
@Composable
fun MapaNativo(
    modifier: Modifier = Modifier,
    alListo: (ControlMapa) -> Unit,
) {
    val contexto = LocalContext.current
    val ciclo = LocalLifecycleOwner.current.lifecycle
    val alcance = rememberCoroutineScope()
    var control by remember { mutableStateOf<ControlMapa?>(null) }

    val motor = (contexto.applicationContext as TruckDashApp).contenedor.nav
    val apariencia by motor.apariencia.collectAsStateWithLifecycle()

    val vista = remember {
        val opciones = MapLibreMapOptions.createFromAttributes(contexto)
        // Liviano vale desde que nace el mapa, como en la web (pixelRatio y maxZoom al crearlo).
        if (motor.apariencia.value.liviano) {
            opciones.pixelRatio(1f)
            opciones.maxZoomPreference(15.0)
        }
        MapView(contexto, opciones).apply { onCreate(null) }
    }

    LaunchedEffect(control, apariencia) { control?.apariencia = apariencia }

    DisposableEffect(ciclo, vista) {
        var arrancada = false
        var activa = false
        val observador = LifecycleEventObserver { _, evento ->
            when (evento) {
                Lifecycle.Event.ON_START -> { vista.onStart(); arrancada = true }
                Lifecycle.Event.ON_RESUME -> { vista.onResume(); activa = true }
                Lifecycle.Event.ON_PAUSE -> { vista.onPause(); activa = false }
                Lifecycle.Event.ON_STOP -> { vista.onStop(); arrancada = false }
                else -> Unit
            }
        }
        ciclo.addObserver(observador)
        onDispose {
            ciclo.removeObserver(observador)
            if (activa) vista.onPause()
            if (arrancada) vista.onStop()
            vista.onDestroy()
        }
    }

    LaunchedEffect(vista) {
        vista.getMapAsync { mapa ->
            val c = ControlMapa(vista, mapa, Red.http, alcance)
            c.apariencia = motor.apariencia.value
            control = c
            alListo(c)
        }
    }

    // El reloj de cuadros de Compose se frena solo con la app en segundo plano.
    LaunchedEffect(control) {
        val c = control ?: return@LaunchedEffect
        while (true) {
            withFrameMillis { c.cuadro(it) }
        }
    }

    AndroidView(factory = { vista }, modifier = modifier)
}
