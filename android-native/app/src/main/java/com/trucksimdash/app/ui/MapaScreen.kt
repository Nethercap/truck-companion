package com.trucksimdash.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowColumn
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Button
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.trucksimdash.app.R
import com.trucksimdash.app.core.Ajustes
import com.trucksimdash.app.core.Preferencias
import com.trucksimdash.app.core.distancia
import com.trucksimdash.app.core.marcha
import com.trucksimdash.app.core.unidadVelocidad
import com.trucksimdash.app.core.usaMillas
import com.trucksimdash.app.core.velocidadEnUnidad
import com.trucksimdash.app.mapa.COLOR_OTRO
import com.trucksimdash.app.mapa.CatalogoMapas
import com.trucksimdash.app.mapa.ControlMapa
import com.trucksimdash.app.mapa.LngLat
import com.trucksimdash.app.mapa.MapaNativo
import com.trucksimdash.app.mapa.MarcaJugador
import com.trucksimdash.app.mapa.Proyecciones
import com.trucksimdash.app.mapa.VarianteMapa
import com.trucksimdash.app.mapa.rumboDeGrillaAGeo
import com.trucksimdash.app.nav.MotorNav
import com.trucksimdash.app.nav.ResumenNav
import com.trucksimdash.app.nav.SugerenciaNav
import com.trucksimdash.app.telemetria.EstadoSesion
import com.trucksimdash.app.telemetria.Telemetria

/** El mapa propio: el camion en vivo, por donde paso y quien anda cerca. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun MapaScreen(
    estado: EstadoSesion,
    ajustes: Ajustes,
    catalogo: CatalogoMapas,
    prefs: Preferencias,
    motor: MotorNav,
    alReportar: () -> Unit,
    alConvoy: () -> Unit,
    alConectar: () -> Unit,
) {
    val convoy by motor.convoy.collectAsStateWithLifecycle()
    val rutaConvoy by motor.rutaConvoy.collectAsStateWithLifecycle()
    var tarjetaAbierta by rememberSaveable { mutableStateOf<String?>(null) }
    var mensajesAbiertos by remember { mutableStateOf(false) }
    val nav by motor.estado.collectAsStateWithLifecycle()
    val ruta by motor.ruta.collectAsStateWithLifecycle()
    val trazos by motor.trazos.collectAsStateWithLifecycle()
    val bajando by motor.bajando.collectAsStateWithLifecycle()
    var control by remember { mutableStateOf<ControlMapa?>(null) }
    var versionEstilo by remember { mutableIntStateOf(0) }
    var seguir by rememberSaveable { mutableStateOf(true) }
    var conRumbo by rememberSaveable { mutableStateOf(false) }
    var hojaAbierta by rememberSaveable { mutableStateOf(false) }
    val vibrar = LocalHapticFeedback.current
    val t = estado.telemetria
    val juego = t?.juego

    val variante: VarianteMapa? = remember(juego, estado.mods, catalogo) {
        val id = if (juego != null) {
            catalogo.resolver(juego, estado.mods, prefs.mapaManual(juego))
        } else {
            prefs.ultimaVariante ?: "ets2"
        }
        catalogo.variantes[id] ?: catalogo.variantes[juego ?: "ets2"]
    }

    LaunchedEffect(control, variante) {
        val c = control ?: return@LaunchedEffect
        val v = variante ?: return@LaunchedEffect
        prefs.ultimaVariante = v.id
        c.cargar(v) { versionEstilo++ }
    }
    LaunchedEffect(control, seguir) { control?.seguir = seguir }
    LaunchedEffect(control, conRumbo) {
        control?.conRumbo = conRumbo
        if (conRumbo) nav.zoomNav?.let { control?.zoomDeNavegacion(it) }
    }
    LaunchedEffect(control, versionEstilo, ruta) { control?.ponerRuta(ruta) }
    LaunchedEffect(control, versionEstilo, nav.destino) { control?.ponerDestino(nav.destino) }
    val capas by motor.capas.collectAsStateWithLifecycle()
    LaunchedEffect(control, versionEstilo, capas) { control?.ponerCapas(capas) }
    LaunchedEffect(control, versionEstilo, rutaConvoy) { control?.ponerRutaConvoy(rutaConvoy) }
    LaunchedEffect(control, versionEstilo, nav.waypoints) {
        control?.ponerWaypoints(nav.waypoints.map { LngLat(it.lng, it.lat) })
    }

    LaunchedEffect(control, versionEstilo, t?.x, t?.z, t?.rumbo) {
        val c = control ?: return@LaunchedEffect
        val x = t?.x
        val z = t?.z
        if (x != null && z != null) c.ponerCamion(x, z, t.rumbo)
    }
    LaunchedEffect(control, versionEstilo, estado.rastro) {
        val c = control ?: return@LaunchedEffect
        c.ponerRastro(estado.rastro.mapNotNull { c.proyectar(it.x, it.z) })
    }
    LaunchedEffect(control, versionEstilo, estado.otros, estado.jugadoresTmp, ajustes.mostrarOtros, variante, convoy?.marcas) {
        val c = control ?: return@LaunchedEffect
        val v = variante ?: return@LaunchedEffect
        // Los del convoy son los companeros: no dependen de "ver a otros conductores".
        val delConvoy = convoy?.marcas.orEmpty().map {
            MarcaJugador("c" + it.id, LngLat(it.lng, it.lat), it.rumbo, it.color, it.nombre, pausado = it.tenue, seguido = true)
        }
        if (!ajustes.mostrarOtros) {
            c.ponerJugadores(delConvoy)
            return@LaunchedEffect
        }
        val p = Proyecciones.de(v.proyeccion)
        val cerca = estado.otros.map {
            MarcaJugador("o" + it.id, p.aLngLat(it.x, it.z), 0.0, COLOR_OTRO, "", pausado = false, seguido = false)
        }
        val tmp = estado.jugadoresTmp.map {
            MarcaJugador(
                "t" + it.id,
                p.aLngLat(it.x, it.z),
                rumboDeGrillaAGeo(it.rumbo, it.x, it.z, p),
                COLOR_OTRO,
                it.nombre,
                pausado = false,
                seguido = false,
            )
        }
        c.ponerJugadores(cerca + tmp + delConvoy)
    }

    Box(Modifier.fillMaxSize()) {
        MapaNativo(Modifier.fillMaxSize()) { c ->
            c.alMoverConLaMano = { seguir = false }
            c.alMantenerApretado = { p ->
                vibrar.performHapticFeedback(HapticFeedbackType.LongPress)
                motor.waypointEnMapa(p.lng, p.lat)
            }
            control = c
        }

        val giro = nav.giro
        Column(
            Modifier.align(Alignment.TopCenter).fillMaxWidth().padding(10.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            if (giro != null) {
                PanelGiro(giro, nav.carriles, trazos, nav.proximaCiudad)
            } else if (nav.rutaOculta) {
                // El destino sigue ahi, y la salida a la vista (ver CLAUDE.md, supuesto 8).
                AvisoConBoton(nav.textoRutaOculta, nav.textoMostrarRuta) { motor.mostrarRuta() }
            } else if (t != null && nav.sinRuta != null) {
                AvisoMapa(nav.sinRuta.orEmpty())
            }
            nav.sugerencia?.let { s ->
                SugerenciaParada(s, alAceptar = { motor.aceptarSugerencia() }, alCerrar = { motor.cerrarSugerencia() })
            }
            nav.avisoRuta?.let { AvisoMapa(it) }
            nav.vozEnOtro?.let { AvisoConBoton(it, nav.textoVozAca) { motor.traerVoz() } }
            if (bajando > 0) AvisoMapa(stringResource(R.string.nav_bajando))
            convoy?.takeIf { it.enSala && it.tarjetas.isNotEmpty() }?.let { co ->
                TarjetasConvoy(co) { id ->
                    tarjetaAbierta = id
                    co.marcas.firstOrNull { it.id == id }?.let { m ->
                        seguir = false
                        control?.irA(LngLat(m.lng, m.lat))
                    }
                }
            }
        }

        variante?.takeIf { giro == null && nav.sinRuta == null }?.let { v ->
            Surface(
                shape = MaterialTheme.shapes.small,
                color = Paleta.Fondo.copy(alpha = 0.78f),
                modifier = Modifier.align(Alignment.TopStart).padding(12.dp).widthIn(max = 240.dp),
            ) {
                Text(
                    v.nombre,
                    style = MaterialTheme.typography.labelMedium,
                    color = Paleta.Texto,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                )
            }
        }

        // De costado no entran uno arriba del otro: con el convoy pisaban el panel del giro.
        val pantalla = LocalConfiguration.current
        FlowColumn(
            Modifier.align(Alignment.BottomEnd).padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            maxItemsInEachColumn = if (pantalla.screenWidthDp > pantalla.screenHeightDp) 4 else 8,
        ) {
            convoy?.takeIf { it.enSala }?.let { co ->
                Box {
                    BotonMapa(Icons.AutoMirrored.Filled.Chat, co.t("convoyMsgBtn"), activo = false) { mensajesAbiertos = true }
                    DropdownMenu(expanded = mensajesAbiertos, onDismissRequest = { mensajesAbiertos = false }) {
                        co.mensajes.forEach { m ->
                            DropdownMenuItem(
                                text = { Text(m.texto) },
                                onClick = {
                                    mensajesAbiertos = false
                                    motor.convoyMandar(m.id)
                                },
                            )
                        }
                    }
                }
            }
            BotonMapa(Icons.Filled.Groups, stringResource(R.string.convoy), activo = convoy?.enSala == true, alTocar = alConvoy)
            BotonMapa(Icons.Filled.Search, stringResource(R.string.nav_buscar), activo = nav.waypoints.isNotEmpty()) {
                hojaAbierta = true
            }
            BotonMapa(
                icono = if (ajustes.voz) Icons.AutoMirrored.Filled.VolumeUp else Icons.AutoMirrored.Filled.VolumeOff,
                descripcion = stringResource(if (ajustes.voz) R.string.nav_voz_apagar else R.string.nav_voz_prender),
                activo = ajustes.voz,
            ) {
                prefs.ponerVoz(!ajustes.voz)
                motor.ponerVoz(!ajustes.voz)
            }
            BotonMapa(
                icono = if (conRumbo) Icons.Filled.Navigation else Icons.Filled.Explore,
                descripcion = stringResource(if (conRumbo) R.string.mapa_norte_arriba else R.string.mapa_con_rumbo),
                activo = conRumbo,
            ) { conRumbo = !conRumbo }
            if (!seguir && t?.tienePosicion == true) {
                BotonMapa(Icons.Filled.MyLocation, stringResource(R.string.mapa_recentrar), activo = false) { seguir = true }
            }
        }

        if (hojaAbierta) {
            HojaDestinos(nav, motor, alReportar) { hojaAbierta = false }
        }

        convoy?.let { co ->
            co.tarjetas.firstOrNull { it.id == tarjetaAbierta }?.let { tarjeta ->
                DetalleConvoy(co, tarjeta, motor) { tarjetaAbierta = null }
            }
        }

        if (t != null) {
            MiniHud(t, usaMillas(ajustes.unidades, t.juego), nav.resumen, Modifier.align(Alignment.BottomStart).padding(12.dp))
        } else {
            Surface(
                shape = MaterialTheme.shapes.large,
                color = Paleta.Superficie,
                border = BorderStroke(1.dp, Paleta.Borde),
                modifier = Modifier.align(Alignment.Center).padding(24.dp).widthIn(max = 340.dp),
            ) {
                Column(Modifier.padding(18.dp)) {
                    Text(stringResource(R.string.mapa_sin_camion), style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.size(4.dp))
                    Text(
                        stringResource(R.string.mapa_sin_camion_ayuda),
                        style = MaterialTheme.typography.bodyMedium,
                        color = Paleta.TextoSuave,
                    )
                    Spacer(Modifier.size(12.dp))
                    Button(onClick = alConectar) { Text(stringResource(R.string.conectar)) }
                }
            }
        }
    }
}

/** "Poco combustible", con el atajo a la mejor estacion sobre la ruta. */
@Composable
private fun SugerenciaParada(s: SugerenciaNav, alAceptar: () -> Unit, alCerrar: () -> Unit) {
    Surface(
        shape = MaterialTheme.shapes.medium,
        color = Paleta.Fondo.copy(alpha = 0.94f),
        border = BorderStroke(1.dp, Paleta.Ambar),
    ) {
        Row(Modifier.padding(start = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                s.texto,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            TextButton(onClick = alAceptar) { Text(s.boton, maxLines = 1) }
            IconButton(onClick = alCerrar) { Icon(Icons.Filled.Close, stringResource(R.string.cerrar), tint = Paleta.TextoSuave) }
        }
    }
}

@Composable
internal fun AvisoConBoton(texto: String, boton: String, alCerrar: (() -> Unit)? = null, alTocar: () -> Unit) {
    Surface(shape = MaterialTheme.shapes.small, color = Paleta.Fondo.copy(alpha = 0.88f)) {
        Row(Modifier.padding(start = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                texto,
                style = MaterialTheme.typography.bodySmall,
                color = Paleta.TextoSuave,
                modifier = Modifier.weight(1f, fill = false),
            )
            TextButton(onClick = alTocar) { Text(boton) }
            if (alCerrar != null) {
                IconButton(onClick = alCerrar) { Icon(Icons.Filled.Close, stringResource(R.string.cerrar), tint = Paleta.TextoSuave) }
            }
        }
    }
}

@Composable
private fun AvisoMapa(texto: String) {
    Surface(shape = MaterialTheme.shapes.small, color = Paleta.Fondo.copy(alpha = 0.88f)) {
        Text(
            texto,
            style = MaterialTheme.typography.bodySmall,
            color = Paleta.TextoSuave,
            maxLines = 3,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
        )
    }
}

@Composable
private fun BotonMapa(
    icono: androidx.compose.ui.graphics.vector.ImageVector,
    descripcion: String,
    activo: Boolean,
    alTocar: () -> Unit,
) {
    FilledIconButton(
        onClick = alTocar,
        modifier = Modifier.size(48.dp),
        colors = IconButtonDefaults.filledIconButtonColors(
            containerColor = if (activo) Paleta.Acento else Paleta.Fondo.copy(alpha = 0.85f),
            contentColor = if (activo) Paleta.Fondo else Paleta.Texto,
        ),
    ) { Icon(icono, descripcion) }
}

/** Lo minimo para no tener que cambiar de pantalla mientras se maneja. */
@Composable
private fun MiniHud(t: Telemetria, millas: Boolean, resumen: ResumenNav?, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.large,
        color = Paleta.Fondo.copy(alpha = 0.88f),
        border = BorderStroke(1.dp, Paleta.Borde),
    ) {
        Row(Modifier.padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    velocidadEnUnidad(t.velocidadKmh, millas).toString(),
                    fontSize = 32.sp,
                    lineHeight = 34.sp,
                    fontWeight = FontWeight.Bold,
                    color = if (t.excedido) Paleta.Rojo else Paleta.Texto,
                    style = NumerosTabulares,
                )
                Text(unidadVelocidad(millas), style = MaterialTheme.typography.labelSmall, color = Paleta.TextoSuave)
            }
            if (t.limiteKmh > 0) {
                Spacer(Modifier.width(10.dp))
                SenalLimite(velocidadEnUnidad(t.limiteKmh, millas), t.juego, chica = true)
            }
            Spacer(Modifier.width(14.dp))
            Column {
                Text(stringResource(R.string.marcha), style = MaterialTheme.typography.labelSmall, color = Paleta.TextoSuave)
                Text(marcha(t.marcha), style = MaterialTheme.typography.titleMedium.merge(NumerosTabulares))
            }
            // Lo que falta sale de nuestra ruta si la hay; si no, del GPS del juego.
            val falta = resumen?.falta ?: t.rutaKm.takeIf { it > 0 }?.let { distancia(it, millas) }
            if (falta != null) {
                Spacer(Modifier.width(14.dp))
                Column {
                    Text(stringResource(R.string.ruta_gps), style = MaterialTheme.typography.labelSmall, color = Paleta.TextoSuave)
                    Text(falta, style = MaterialTheme.typography.titleMedium.merge(NumerosTabulares))
                }
            }
            resumen?.llegada?.let {
                Spacer(Modifier.width(14.dp))
                Column {
                    Text(stringResource(R.string.nav_llegada), style = MaterialTheme.typography.labelSmall, color = Paleta.TextoSuave)
                    Text(it, style = MaterialTheme.typography.titleMedium.merge(NumerosTabulares))
                }
            }
        }
    }
}
