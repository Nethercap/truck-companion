package com.trucksimdash.app.ui

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

enum class Seccion(val titulo: Int, val icono: ImageVector) {
    Panel(R.string.sec_panel, Icons.Filled.Speed),
    Mapa(R.string.sec_mapa, Icons.Filled.Map),
    EnVivo(R.string.sec_en_vivo, Icons.Filled.Public),
    Stats(R.string.sec_stats, Icons.Filled.BarChart),
}

@Composable
fun AppRaiz(c: Contenedor) {
    val estado by c.sesion.estado.collectAsStateWithLifecycle()
    val ajustes by c.prefs.ajustes.collectAsStateWithLifecycle()
    val catalogo by c.catalogo.collectAsStateWithLifecycle()
    var seccion by rememberSaveable { mutableStateOf(Seccion.Panel) }
    var enAjustes by rememberSaveable { mutableStateOf(false) }
    var enReporte by rememberSaveable { mutableStateOf(false) }
    var enConvoy by rememberSaveable { mutableStateOf(false) }
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
                is AvisoSesion.Entregado -> contexto.getString(R.string.aviso_entregado, a.pago?.let { plata(it, moneda) } ?: "")
                is AvisoSesion.Cancelado -> contexto.getString(R.string.aviso_cancelado)
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
            ConvoyScreen(c.nav, ajustes.apodo) { enConvoy = false }
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
                    alAjustes = { enAjustes = true },
                )
                Seccion.Mapa -> MapaScreen(estado, ajustes, catalogo, c.prefs, c.nav, alReportar = { enReporte = true }, alConvoy = { enConvoy = true }) { seccion = Seccion.Panel }
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

