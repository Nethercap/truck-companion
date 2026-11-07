package com.trucksimdash.app.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.trucksimdash.app.Contenedor
import com.trucksimdash.app.R
import com.trucksimdash.app.core.plata
import com.trucksimdash.app.telemetria.AvisoSesion
import com.trucksimdash.app.telemetria.Fase

enum class Seccion(val titulo: Int, val icono: ImageVector) {
    Panel(R.string.sec_panel, Icons.Filled.Speed),
    Mapa(R.string.sec_mapa, Icons.Filled.Map),
    EnVivo(R.string.sec_en_vivo, Icons.Filled.Public),
    Stats(R.string.sec_stats, Icons.Filled.BarChart),
}

@Composable
fun AppRaiz(c: Contenedor, flotante: Boolean, alFlotante: () -> Unit) {
    if (flotante) {
        VentanaFlotante(c)
        return
    }
    Box(Modifier.fillMaxSize()) {
        Pantallas(c, alFlotante)
        TarjetaEntrega(c.nav, Modifier.align(Alignment.TopCenter))
    }
}

/** En la ventana chica no hay nada para tocar: el mapa, el giro y la velocidad. */
@Composable
private fun VentanaFlotante(c: Contenedor) {
    val estado by c.sesion.estado.collectAsStateWithLifecycle()
    val ajustes by c.prefs.ajustes.collectAsStateWithLifecycle()
    val catalogo by c.catalogo.collectAsStateWithLifecycle()
    MapaScreen(estado, ajustes, catalogo, c.prefs, c.nav, alReportar = {}, alConvoy = {}, flotante = true) {}
}

@Composable
private fun Pantallas(c: Contenedor, alFlotante: () -> Unit) {
    val estado by c.sesion.estado.collectAsStateWithLifecycle()
    val ajustes by c.prefs.ajustes.collectAsStateWithLifecycle()
    val catalogo by c.catalogo.collectAsStateWithLifecycle()
    var seccion by rememberSaveable { mutableStateOf(Seccion.Panel) }
    var enAjustes by rememberSaveable { mutableStateOf(false) }
    var enReporte by rememberSaveable { mutableStateOf(false) }
    var enConvoy by rememberSaveable { mutableStateOf(false) }
    var codigoConvoy by rememberSaveable { mutableStateOf<String?>(null) }
    var enTeclas by rememberSaveable { mutableStateOf(false) }
    var enSinInternet by rememberSaveable { mutableStateOf(false) }
    val config = LocalConfiguration.current
    val apaisado = config.screenWidthDp > config.screenHeightDp
    val avisos = remember { SnackbarHostState() }
    val contexto = LocalContext.current

    // Con el telefono en la cabina, que no se apague mientras se maneja.
    val vista = LocalView.current
    val encendida = ajustes.pantallaEncendida && estado.enVivo
    DisposableEffect(vista, encendida) {
        vista.keepScreenOn = encendida
        onDispose { vista.keepScreenOn = false }
    }

    fun mirarConvoy(codigo: String) {
        c.nav.convoyMirar(codigo)
        seccion = Seccion.Mapa
    }

    // Un link de un convoy: con el juego andando es para entrar, y si no, para mirarlo.
    val enlace by c.enlaceConvoy.collectAsStateWithLifecycle()
    LaunchedEffect(enlace) {
        val codigo = enlace ?: return@LaunchedEffect
        c.enlaceConvoy.value = null
        if (estado.fase == Fase.Apagada || estado.fase == Fase.CodigoInvalido) {
            mirarConvoy(codigo)
        } else {
            codigoConvoy = codigo
            enConvoy = true
        }
    }

    // Sin el permiso el servicio anda igual, pero la notificacion no se ve (Android 13 en adelante).
    val pedirPermiso = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
    LaunchedEffect(estado.enVivo, ajustes.segundoPlano) {
        if (estado.enVivo && ajustes.segundoPlano && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !c.prefs.notificacionesPedidas) {
            c.prefs.notificacionesPedidas = true
            pedirPermiso.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    LaunchedEffect(Unit) { c.nav.avisos.collect { avisos.showSnackbar(it) } }
    LaunchedEffect(Unit) {
        c.sesion.avisos.collect { a ->
            val juego = c.sesion.estado.value.telemetria?.juego
            val moneda = if (juego == "ats") "USD" else "EUR"
            val texto = when (a) {
                is AvisoSesion.ComandoFallo -> when (a.razon) {
                    "no_key" -> contexto.getString(R.string.cmd_sin_tecla)
                    "no_window" -> contexto.getString(R.string.cmd_sin_ventana)
                    "bad_key" -> contexto.getString(R.string.cmd_tecla_mala)
                    else -> contexto.getString(R.string.cmd_fallo, a.razon ?: "?")
                }
                is AvisoSesion.Multa -> contexto.getString(R.string.aviso_multa, a.monto?.let { plata(it, moneda) } ?: "")
            }
            avisos.showSnackbar(texto)
        }
    }

    if (enReporte) {
        Box(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
            ReporteScreen(c.nav) { enReporte = false }
        }
        return
    }

    if (enSinInternet) {
        Box(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
            SinInternetScreen(catalogo, c.mapas) { enSinInternet = false }
        }
        return
    }

    if (enTeclas) {
        Box(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
            TeclasScreen(estado, c.sesion, c.nav) { enTeclas = false }
        }
        return
    }

    if (enConvoy) {
        Box(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
            ConvoyScreen(c.nav, ajustes.apodo, codigoConvoy) {
                enConvoy = false
                codigoConvoy = null
            }
        }
        return
    }

    if (enAjustes) {
        Box(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
            AjustesScreen(estado, ajustes, c.prefs, c.sesion, c.nav, catalogo, alReportar = { enReporte = true }, alTeclas = { enTeclas = true }, alMapasSinInternet = { enSinInternet = true }) { enAjustes = false }
        }
        return
    }

    val contenido: @Composable (Modifier) -> Unit = { modifier ->
        Box(modifier) {
            when (seccion) {
                Seccion.Panel -> PanelScreen(
                    estado,
                    ajustes,
                    c.sesion,
                    c.prefs.ultimoDestino,
                    apaisado,
                    c.nav,
                    c.prefs,
                    alVerMapaEnVivo = { seccion = Seccion.EnVivo },
                    alMirarConvoy = ::mirarConvoy,
                    alAjustes = { enAjustes = true },
                )
                Seccion.Mapa -> MapaScreen(estado, ajustes, catalogo, c.prefs, c.nav, alReportar = { enReporte = true }, alConvoy = { enConvoy = true }, alFlotante = alFlotante) { seccion = Seccion.Panel }
                Seccion.EnVivo -> EnVivoScreen(c.vivo, catalogo, ajustes) { enAjustes = true }
                Seccion.Stats -> StatsScreen(c.cuenta, ajustes, catalogo) { enAjustes = true }
            }
        }
    }

    if (apaisado) {
        // De costado la altura es lo que falta: la navegacion va a un lado.
        Scaffold(
            containerColor = Paleta.Fondo,
            snackbarHost = { SnackbarHost(avisos) },
        ) { relleno ->
            Row(Modifier.padding(relleno).fillMaxSize()) {
                NavigationRail(containerColor = Paleta.Superficie, modifier = Modifier.fillMaxHeight()) {
                    Seccion.entries.forEach { s ->
                        NavigationRailItem(
                            selected = seccion == s,
                            onClick = { seccion = s },
                            icon = { Icon(s.icono, null) },
                            label = { Text(stringResource(s.titulo), style = MaterialTheme.typography.labelSmall) },
                        )
                    }
                }
                contenido(Modifier.weight(1f).fillMaxHeight())
            }
        }
    } else {
        Scaffold(
            containerColor = Paleta.Fondo,
            snackbarHost = { SnackbarHost(avisos) },
            bottomBar = {
                NavigationBar(containerColor = Paleta.Superficie) {
                    Seccion.entries.forEach { s ->
                        NavigationBarItem(
                            selected = seccion == s,
                            onClick = { seccion = s },
                            icon = { Icon(s.icono, null) },
                            label = { Text(stringResource(s.titulo)) },
                        )
                    }
                }
            },
        ) { relleno ->
            Column(Modifier.padding(relleno).fillMaxSize()) {
                contenido(Modifier.fillMaxSize())
            }
        }
    }
}

