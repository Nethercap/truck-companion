package com.trucksimdash.app.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import android.os.Build
import android.os.SystemClock
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
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
import androidx.compose.material.icons.filled.PictureInPictureAlt
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
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalDensity
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
import com.trucksimdash.app.nav.EstadoNav
import com.trucksimdash.app.nav.MarcaConvoy
import com.trucksimdash.app.nav.MotorNav
import com.trucksimdash.app.nav.ResumenNav
import com.trucksimdash.app.nav.SugerenciaNav
import com.trucksimdash.app.telemetria.EstadoSesion
import com.trucksimdash.app.telemetria.Telemetria
import kotlinx.coroutines.delay
import kotlin.math.abs
import kotlin.math.atan2

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
    alFlotante: () -> Unit = {},
    /** En la ventana chica: sin botones, y el camion siempre en el centro con el rumbo arriba. */
    flotante: Boolean = false,
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
    var conRumbo by rememberSaveable { mutableStateOf(flotante) }
    var hojaAbierta by rememberSaveable { mutableStateOf(false) }
    var camara by remember { mutableIntStateOf(0) }
    val apariencia by motor.apariencia.collectAsStateWithLifecycle()
    val vibrar = LocalHapticFeedback.current
    val t = estado.telemetria
    val juego = t?.juego

    val mirando = convoy?.mirando == true
    val varianteMirada = convoy?.varianteMirada
    val variante: VarianteMapa? = remember(juego, estado.mods, catalogo, varianteMirada) {
        val id = if (juego != null) {
            catalogo.resolver(juego, estado.mods, prefs.mapaManual(juego))
        } else {
            varianteMirada ?: prefs.ultimaVariante ?: "ets2"
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
    LaunchedEffect(control, flotante) { control?.mostrarBrujula(!flotante) }
    LaunchedEffect(control, conRumbo, nav.zoomNav) {
        control?.conRumbo = conRumbo
        if (conRumbo) nav.zoomNav?.let { control?.zoomDeNavegacion(it) }
    }
    // El que mira sin juego no tiene camion que seguir: se encuadra a los que estan.
    var encuadrado by remember(control, versionEstilo, convoy?.codigo) { mutableStateOf(false) }
    LaunchedEffect(control, versionEstilo, mirando, convoy?.marcas) {
        val marcas = convoy?.marcas.orEmpty()
        if (!mirando || encuadrado || marcas.isEmpty() || versionEstilo == 0) return@LaunchedEffect
        control?.encuadrar(marcas.map { LngLat(it.lng, it.lat) })
        encuadrado = true
    }
    // "Que se desvanezcan mientras manejas y vuelvan al tocar": BTN_IDLE_MS en la web.
    // El toque va en un arreglo y no en un estado: arrastrando el mapa llegan muchos por segundo, y
    // la pantalla no tiene por que rehacerse en cada uno.
    val ultimoToqueMs = remember { longArrayOf(SystemClock.uptimeMillis()) }
    var botonesQuietos by remember { mutableStateOf(false) }
    LaunchedEffect(apariencia.desvanecerBotones) {
        botonesQuietos = false
        while (apariencia.desvanecerBotones) {
            delay(1000)
            botonesQuietos = SystemClock.uptimeMillis() - ultimoToqueMs[0] >= BOTONES_QUIETOS_MS
        }
    }
    val opacidadBotones by animateFloatAsState(if (botonesQuietos) 0.3f else 1f, label = "botones")
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
    LaunchedEffect(control, versionEstilo, estado.otros, estado.jugadoresTmp, ajustes.mostrarOtros, ajustes.mostrarTmp, variante, convoy?.marcas) {
        val c = control ?: return@LaunchedEffect
        val v = variante ?: return@LaunchedEffect
        // Los del convoy son los companeros: no dependen de "ver a otros conductores".
        val delConvoy = convoy?.marcas.orEmpty().map {
            MarcaJugador("c" + it.id, LngLat(it.lng, it.lat), it.rumbo, it.color, it.nombre, pausado = it.tenue, seguido = true)
        }
        val p = Proyecciones.de(v.proyeccion)
        val cerca = if (!ajustes.mostrarOtros) emptyList() else estado.otros.map {
            MarcaJugador("o" + it.id, p.aLngLat(it.x, it.z), 0.0, COLOR_OTRO, "", pausado = false, seguido = false)
        }
        val tmp = if (!ajustes.mostrarTmp) emptyList() else estado.jugadoresTmp.map {
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

    Box(
        Modifier.fillMaxSize().pointerInput(Unit) {
            // Sin consumir nada: el toque sigue viaje al mapa o al boton.
            awaitPointerEventScope {
                while (true) {
                    awaitPointerEvent(PointerEventPass.Initial)
                    ultimoToqueMs[0] = SystemClock.uptimeMillis()
                    botonesQuietos = false
                }
            }
        },
    ) {
        MapaNativo(Modifier.fillMaxSize()) { c ->
            c.alMoverCamara = { camara++ }
            c.alMoverConLaMano = { seguir = false }
            c.alMantenerApretado = { p ->
                vibrar.performHapticFeedback(HapticFeedbackType.LongPress)
                motor.waypointEnMapa(p.lng, p.lat)
            }
            control = c
        }

        val giro = nav.giro
        if (flotante) {
            ContenidoFlotante(t, usaMillas(ajustes.unidades, t?.juego), nav)
            return@Box
        }
        Column(
            Modifier.align(Alignment.TopCenter).fillMaxWidth().padding(10.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            convoy?.takeIf { it.mirando }?.let { co ->
                AvisoConBoton("${co.t("chipSpectator")} · ${co.codigo.orEmpty()}", co.t("close")) { motor.convoyDejarDeMirar() }
            }
            if (giro != null) {
                PanelGiro(giro, nav.carriles, trazos, nav.proximaCiudad)
            } else if (nav.rutaOculta) {
                // El destino sigue ahi, y la salida a la vista (ver CLAUDE.md, supuesto 8).
                AvisoConBoton(nav.textoRutaOculta, nav.textoMostrarRuta) { motor.mostrarRuta() }
            } else if (t != null && nav.sinRuta != null && !mirando) {
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
            Modifier.align(Alignment.BottomEnd).padding(12.dp).alpha(opacidadBotones),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            maxItemsInEachColumn = if (pantalla.screenWidthDp > pantalla.screenHeightDp) 4 else 8,
        ) {
            convoy?.takeIf { it.enSala && !it.mirando }?.let { co ->
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
            if (!mirando) {
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
            }
            if (!mirando && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val texto = textosWeb(motor, "pipOverlay")["pipOverlay"].orEmpty()
                BotonMapa(Icons.Filled.PictureInPictureAlt, texto, activo = false, alTocar = alFlotante)
            }
            if (!seguir && t?.tienePosicion == true) {
                BotonMapa(Icons.Filled.MyLocation, stringResource(R.string.mapa_recentrar), activo = false) {
                    seguir = true
                    // Vuelve al zoom elegido en Ajustes, como dice su ayuda.
                    if (conRumbo) nav.zoomNav?.let { control?.zoomDeNavegacion(it) }
                }
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
            MiniHud(t, usaMillas(ajustes.unidades, t.juego), nav.resumen, nav.miniHud, Modifier.align(Alignment.BottomStart).padding(12.dp))
        } else if (!mirando) {
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

        // Al final, arriba de todo: la mayoria de las veces el companero esta atras, y abajo va el mini-HUD.
        control?.let { c ->
            convoy?.takeIf { it.enSala && it.marcas.isNotEmpty() }?.let { co ->
                ChipsConvoy(co.marcas, c, camara) { m ->
                    seguir = false
                    c.irA(LngLat(m.lng, m.lat))
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

/** Lo que entra en la ventana flotante: el proximo giro arriba y la velocidad abajo. */
@Composable
private fun BoxScope.ContenidoFlotante(t: Telemetria?, millas: Boolean, nav: EstadoNav) {
    nav.giro?.let { g ->
        Surface(
            color = Paleta.Fondo.copy(alpha = 0.88f),
            modifier = Modifier.align(Alignment.TopCenter).fillMaxWidth(),
        ) {
            Row(Modifier.padding(horizontal = 6.dp, vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(iconoDe(g.maniobra), null, tint = Paleta.Acento, modifier = Modifier.size(22.dp))
                Text(
                    g.texto,
                    color = Paleta.Texto,
                    fontSize = 11.sp,
                    lineHeight = 12.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(start = 4.dp),
                )
            }
        }
    }
    if (t != null) {
        Surface(
            color = Paleta.Fondo.copy(alpha = 0.88f),
            shape = MaterialTheme.shapes.small,
            modifier = Modifier.align(Alignment.BottomStart).padding(4.dp),
        ) {
            Row(Modifier.padding(horizontal = 6.dp, vertical = 2.dp), verticalAlignment = Alignment.Bottom) {
                Text(
                    velocidadEnUnidad(t.velocidadKmh, millas).toString(),
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold,
                    color = if (t.excedido) Paleta.Rojo else Paleta.Texto,
                    style = NumerosTabulares,
                )
                nav.resumen?.llegada?.let {
                    Text(it, fontSize = 11.sp, color = Paleta.TextoSuave, modifier = Modifier.padding(start = 6.dp))
                }
            }
        }
    }
}

/**
 * Los companeros fuera de pantalla: una chapita pegada al borde, del lado en que estan, con
 * apodo y distancia (convoyRenderEdgeIndicators en convoy.js). Se rehace al mover el mapa.
 */
@Composable
private fun ChipsConvoy(marcas: List<MarcaConvoy>, control: ControlMapa, camara: Int, alTocar: (MarcaConvoy) -> Unit) {
    val ancho = control.anchoPx.toFloat()
    val alto = control.altoPx.toFloat()
    if (ancho <= 0f || alto <= 0f || camara < 0) return
    val d = LocalDensity.current
    val margen = with(d) { 30.dp.toPx() }
    // Arriba va el giro y abajo el mini-HUD, que con lo elegido en Ajustes crece.
    val margenArriba = with(d) { 110.dp.toPx() }
    val margenAbajo = with(d) { 170.dp.toPx() }
    marcas.forEach { m ->
        val p = control.aPantalla(LngLat(m.lng, m.lat))
        if (p.x in 0f..ancho && p.y in 0f..alto) return@forEach
        val cx = ancho / 2
        val cy = alto / 2
        val dx = (p.x - cx).let { if (it == 0f) 1e-6f else it }
        val dy = (p.y - cy).let { if (it == 0f) 1e-6f else it }
        val k = minOf((cx - margen) / abs(dx), (cy - if (dy > 0) margenAbajo else margenArriba) / abs(dy))
        val x = cx + dx * k
        val y = cy + dy * k
        val grados = Math.toDegrees(atan2(dy.toDouble(), dx.toDouble())).toFloat()
        key(m.id) {
            Surface(
                onClick = { alTocar(m) },
                shape = MaterialTheme.shapes.small,
                color = Paleta.Fondo.copy(alpha = 0.9f),
                border = BorderStroke(1.5.dp, colorDe(m.color)),
                modifier = Modifier.layout { medible, limites ->
                    val pieza = medible.measure(limites.copy(minWidth = 0, minHeight = 0))
                    layout(limites.maxWidth, limites.maxHeight) {
                        pieza.place(
                            (x - pieza.width / 2).toInt().coerceIn(0, (limites.maxWidth - pieza.width).coerceAtLeast(0)),
                            (y - pieza.height / 2).toInt().coerceIn(0, (limites.maxHeight - pieza.height).coerceAtLeast(0)),
                        )
                    }
                },
            ) {
                Row(Modifier.padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("➤", color = colorDe(m.color), modifier = Modifier.rotate(grados))
                    Text(
                        listOfNotNull(m.nombre, m.distancia).joinToString(" · "),
                        style = MaterialTheme.typography.labelSmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(start = 4.dp).widthIn(max = 150.dp),
                    )
                }
            }
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
private fun MiniHud(t: Telemetria, millas: Boolean, resumen: ResumenNav?, extra: List<String>, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.large,
        color = Paleta.Fondo.copy(alpha = 0.88f),
        border = BorderStroke(1.dp, Paleta.Borde),
    ) {
        Column(Modifier.padding(horizontal = 14.dp, vertical = 10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
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
        // Lo que se eligio en Ajustes.
        extra.forEach { Text(it, style = MaterialTheme.typography.labelMedium, color = Paleta.TextoSuave) }
        }
    }
}

private const val BOTONES_QUIETOS_MS = 6000L
