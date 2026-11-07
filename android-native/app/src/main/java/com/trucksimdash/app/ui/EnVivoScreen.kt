package com.trucksimdash.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.trucksimdash.app.R
import com.trucksimdash.app.core.Ajustes
import com.trucksimdash.app.core.distancia
import com.trucksimdash.app.core.unidadVelocidad
import com.trucksimdash.app.core.usaMillas
import com.trucksimdash.app.core.velocidadEnUnidad
import com.trucksimdash.app.mapa.CajaMapa
import com.trucksimdash.app.mapa.CatalogoMapas
import com.trucksimdash.app.mapa.ControlMapa
import com.trucksimdash.app.mapa.LineaRuta
import com.trucksimdash.app.mapa.MapaNativo
import com.trucksimdash.app.mapa.MarcaJugador
import com.trucksimdash.app.mapa.Proyecciones
import com.trucksimdash.app.mapa.VarianteMapa
import com.trucksimdash.app.mapa.colorDeConductor
import com.trucksimdash.app.mapa.rumboDeGrillaAGeo
import com.trucksimdash.app.vivo.Conductor
import com.trucksimdash.app.vivo.EstadoMapaVivo
import com.trucksimdash.app.vivo.FaseVivo
import com.trucksimdash.app.vivo.MapaVivoRepo
import com.trucksimdash.app.vivo.ResumenVivo
import kotlinx.coroutines.delay

/** El mapa en vivo publico: elegir un mapa, y mirar quien anda ahi. */
@Composable
fun EnVivoScreen(repo: MapaVivoRepo, catalogo: CatalogoMapas, ajustes: Ajustes, alAjustes: () -> Unit) {
    var elegida by rememberSaveable { mutableStateOf<String?>(null) }
    val variante = elegida?.let { catalogo.variantes[it] }
    if (variante == null) {
        ListaVariantes(repo, catalogo, alAjustes) { elegida = it }
    } else {
        MapaVivoContenido(repo, variante, ajustes) { elegida = null }
    }
}

@Composable
private fun ListaVariantes(repo: MapaVivoRepo, catalogo: CatalogoMapas, alAjustes: () -> Unit, alElegir: (String) -> Unit) {
    var resumen by remember { mutableStateOf<ResumenVivo?>(null) }
    var sinRed by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        while (true) {
            val r = repo.resumen()
            if (r != null) resumen = r
            sinRed = r == null
            delay(15_000)
        }
    }
    val cuentas = resumen?.porVariante ?: emptyMap()
    // Primero donde hay gente; despues, en el orden del manifest.
    val lista = catalogo.paraMapaEnVivo.sortedByDescending { cuentas[it.id] ?: 0 }

    LazyColumn(
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        item {
            Column(Modifier.padding(start = 4.dp, end = 4.dp, bottom = 8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        stringResource(R.string.vivo_titulo),
                        style = MaterialTheme.typography.headlineMedium,
                        modifier = Modifier.weight(1f),
                    )
                    BotonAjustes(alAjustes)
                }
                val total = resumen?.total
                Text(
                    when {
                        sinRed && total == null -> stringResource(R.string.sin_conexion)
                        total == null -> stringResource(R.string.cargando)
                        else -> pluralStringResource(R.plurals.vivo_conductores_total, total, total)
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = Paleta.TextoSuave,
                )
            }
        }
        items(lista, key = { it.id }) { v ->
            val n = cuentas[v.id] ?: 0
            Surface(
                onClick = { alElegir(v.id) },
                shape = MaterialTheme.shapes.medium,
                color = Paleta.Superficie,
                border = BorderStroke(1.dp, Paleta.Borde),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        v.nombre,
                        style = MaterialTheme.typography.bodyLarge,
                        modifier = Modifier.weight(1f),
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Spacer(Modifier.width(10.dp))
                    if (n > 0) {
                        Pildora(pluralStringResource(R.plurals.vivo_conductores, n, n), Paleta.Verde)
                    } else {
                        Text(stringResource(R.string.vivo_nadie), style = MaterialTheme.typography.labelMedium, color = Paleta.TextoApagado)
                    }
                }
            }
        }
    }
}

private fun nombreConductor(c: Conductor, anonimo: String) = c.apodo ?: c.camion ?: anonimo

@Composable
private fun MapaVivoContenido(repo: MapaVivoRepo, v: VarianteMapa, ajustes: Ajustes, alVolver: () -> Unit) {
    val estado by repo.estado.collectAsStateWithLifecycle()
    var control by remember { mutableStateOf<ControlMapa?>(null) }
    var versionEstilo by remember { mutableIntStateOf(0) }
    var seguido by rememberSaveable { mutableStateOf<String?>(null) }
    var listaAbierta by rememberSaveable { mutableStateOf(false) }
    var encuadrado by rememberSaveable(v.id) { mutableStateOf(false) }
    val proyeccion = remember(v.proyeccion) { Proyecciones.de(v.proyeccion) }
    val anonimo = stringResource(R.string.vivo_anonimo)

    BackHandler { alVolver() }

    DisposableEffect(v.id) {
        repo.mirar(v.id)
        onDispose { repo.dejarDeMirar() }
    }
    LaunchedEffect(control, v) { control?.cargar(v) { versionEstilo++ } }

    // Sin caja (las ciudades no llegaron) se da por adentro: mejor una flecha de mas
    // que esconder a todos (insideMapBounds en pure.js).
    var caja by remember(v.id) { mutableStateOf<CajaMapa?>(null) }
    LaunchedEffect(v.id) { caja = repo.cajaDe(v) }
    val conductores = estado.conductores.filter { it.x != null && it.z != null && caja?.contiene(it.x, it.z) != false }
    val idsEnMapa = conductores.map { it.id }.toSet()
    val datoSeguido = conductores.firstOrNull { it.id == seguido }

    LaunchedEffect(control, versionEstilo, estado.conductores, seguido, caja) {
        val c = control ?: return@LaunchedEffect
        if (versionEstilo == 0) return@LaunchedEffect
        c.ponerJugadores(
            conductores.map {
                MarcaJugador(
                    id = it.id,
                    posicion = proyeccion.aLngLat(it.x!!, it.z!!),
                    rumbo = rumboDeGrillaAGeo(it.rumbo, it.x, it.z, proyeccion),
                    color = colorDeConductor(it.id),
                    nombre = nombreConductor(it, anonimo),
                    pausado = it.pausado,
                    seguido = it.id == seguido,
                )
            },
        )
        if (!encuadrado && conductores.isNotEmpty()) {
            encuadrado = true
            c.encuadrar(conductores.map { proyeccion.aLngLat(it.x!!, it.z!!) })
        }
        // El fijado se suelta solo si se desconecto: un estado no se queda colgado.
        if (seguido != null && datoSeguido == null) {
            seguido = null
        } else if (datoSeguido != null) {
            c.irA(proyeccion.aLngLat(datoSeguido.x!!, datoSeguido.z!!))
        }
    }
    LaunchedEffect(control, versionEstilo, estado.rutas, seguido) {
        val c = control ?: return@LaunchedEffect
        if (versionEstilo == 0) return@LaunchedEffect
        c.ponerRutas(
            estado.rutas.map { (id, puntos) ->
                LineaRuta(puntos.map { proyeccion.aLngLat(it.first, it.second) }, colorDeConductor(id), id == seguido)
            },
        )
    }

    Box(Modifier.fillMaxSize()) {
        MapaNativo(Modifier.fillMaxSize()) { c ->
            c.seguir = false
            c.alMoverConLaMano = { seguido = null }
            control = c
        }

        // Arriba: volver y que mapa es.
        Row(
            Modifier.align(Alignment.TopStart).padding(10.dp).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            FilledIconButton(
                onClick = alVolver,
                colors = IconButtonDefaults.filledIconButtonColors(containerColor = Paleta.Fondo.copy(alpha = 0.85f), contentColor = Paleta.Texto),
            ) { Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.volver)) }
            Spacer(Modifier.width(8.dp))
            Surface(shape = MaterialTheme.shapes.small, color = Paleta.Fondo.copy(alpha = 0.85f), modifier = Modifier.weight(1f, fill = false)) {
                Text(
                    v.nombre,
                    style = MaterialTheme.typography.labelMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp),
                )
            }
        }

        PanelConductores(
            estado = estado,
            enMapa = idsEnMapa,
            seguido = seguido,
            abierta = listaAbierta,
            ajustes = ajustes,
            juego = v.juego,
            anonimo = anonimo,
            alAlternar = { listaAbierta = !listaAbierta },
            alSeguir = { id ->
                seguido = if (seguido == id) null else id
                listaAbierta = false
            },
            modifier = Modifier.align(Alignment.BottomCenter).padding(10.dp),
        )
    }
}

@Composable
private fun PanelConductores(
    estado: EstadoMapaVivo,
    enMapa: Set<String>,
    seguido: String?,
    abierta: Boolean,
    ajustes: Ajustes,
    juego: String,
    anonimo: String,
    alAlternar: () -> Unit,
    alSeguir: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val millas = usaMillas(ajustes.unidades, juego)
    val conductores = estado.conductores
    val fijado = conductores.firstOrNull { it.id == seguido }
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large,
        color = Paleta.Fondo,
        border = BorderStroke(1.dp, Paleta.Borde),
    ) {
        Column {
            Row(
                Modifier.fillMaxWidth().clickable(onClick = alAlternar).padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        when (estado.fase) {
                            FaseVivo.Conectando, FaseVivo.Apagada -> stringResource(R.string.conectando)
                            FaseVivo.Caida -> stringResource(R.string.reconectando)
                            FaseVivo.Llena -> stringResource(R.string.vivo_lleno)
                            FaseVivo.Desconocida -> stringResource(R.string.vivo_desconocido)
                            FaseVivo.Abierta -> pluralStringResource(R.plurals.vivo_conductores, conductores.size, conductores.size)
                        },
                        style = MaterialTheme.typography.titleMedium,
                    )
                    if (fijado != null) {
                        Text(
                            stringResource(R.string.vivo_siguiendo, nombreConductor(fijado, anonimo)),
                            style = MaterialTheme.typography.bodySmall,
                            color = Paleta.TextoSuave,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                Icon(
                    Icons.Filled.KeyboardArrowUp,
                    stringResource(if (abierta) R.string.vivo_ocultar_lista else R.string.vivo_ver_lista),
                    tint = Paleta.TextoSuave,
                    modifier = Modifier.rotate(if (abierta) 180f else 0f),
                )
            }
            if (abierta) {
                LazyColumn(Modifier.heightIn(max = 280.dp)) {
                    // Los de un mapa que no conocemos, al final y sin poder seguirlos.
                    items(conductores.sortedBy { it.id !in enMapa }, key = { it.id }) { c ->
                        FilaConductor(c, c.id == seguido, c.id in enMapa, millas, anonimo) { alSeguir(c.id) }
                    }
                }
            } else if (fijado != null) {
                IconButton(onClick = { alSeguir(fijado.id) }, modifier = Modifier.align(Alignment.End)) {
                    Icon(Icons.Filled.Close, stringResource(R.string.vivo_dejar_seguir), tint = Paleta.TextoSuave)
                }
            }
        }
    }
}

@Composable
private fun FilaConductor(
    c: Conductor,
    seguido: Boolean,
    enMapa: Boolean,
    millas: Boolean,
    anonimo: String,
    alTocar: () -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickable(enabled = enMapa, onClick = alTocar)
            .background(if (seguido) Paleta.SuperficieAlta else Color.Transparent)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(10.dp).clip(CircleShape).background(colorDesdeHex(colorDeConductor(c.id))))
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(nombreConductor(c, anonimo), style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val detalle = listOfNotNull(
                c.carga,
                if (c.ciudadOrigen != null && c.ciudadDestino != null) "${c.ciudadOrigen} → ${c.ciudadDestino}" else c.ciudadDestino,
                c.distanciaKm?.takeIf { it > 0 }?.let { distancia(it, millas) },
            ).joinToString(" · ")
            if (detalle.isNotEmpty()) {
                Text(detalle, style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        Spacer(Modifier.width(8.dp))
        Text(
            when {
                !enMapa -> stringResource(R.string.vivo_fuera)
                c.pausado -> stringResource(R.string.pausado)
                else -> c.velocidadKmh?.let { "${velocidadEnUnidad(it, millas)} ${unidadVelocidad(millas)}" } ?: ""
            },
            style = MaterialTheme.typography.labelMedium.merge(NumerosTabulares),
            color = Paleta.TextoSuave,
        )
    }
}

internal fun colorDesdeHex(hex: String): Color = Color(android.graphics.Color.parseColor(hex))
