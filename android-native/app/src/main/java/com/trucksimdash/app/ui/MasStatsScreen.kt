package com.trucksimdash.app.ui

import com.trucksimdash.app.cuenta.EstadoCuenta
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.draw.drawWithContent
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.trucksimdash.app.R
import com.trucksimdash.app.core.Ajustes
import com.trucksimdash.app.core.distancia
import com.trucksimdash.app.core.fechaCorta
import com.trucksimdash.app.core.usaMillas
import com.trucksimdash.app.cuenta.CuentaRepo
import com.trucksimdash.app.cuenta.ListasSeguir
import com.trucksimdash.app.cuenta.MapaRecorrido
import com.trucksimdash.app.cuenta.Novedad
import com.trucksimdash.app.cuenta.PerfilAjeno
import com.trucksimdash.app.cuenta.Persona
import com.trucksimdash.app.cuenta.ResumenAno
import com.trucksimdash.app.mapa.CatalogoMapas
import com.trucksimdash.app.mapa.ControlMapa
import com.trucksimdash.app.mapa.MapaNativo
import kotlinx.coroutines.launch
import java.util.Calendar

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Pantalla(titulo: String, alVolver: () -> Unit, contenido: @Composable () -> Unit) {
    BackHandler { alVolver() }
    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text(titulo, maxLines = 1, overflow = TextOverflow.Ellipsis) },
            navigationIcon = {
                IconButton(onClick = alVolver) { Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.volver)) }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = Paleta.Fondo),
        )
        contenido()
    }
}

/** Los anos con datos: el servicio arranco en 2026. */
private fun anos(): List<Int> = (Calendar.getInstance().get(Calendar.YEAR) downTo 2026).toList()

/** Todo lo manejado en un juego: el mapa del juego con los recorridos encima. */
@Composable
fun RecorridoScreen(cuenta: CuentaRepo, catalogo: CatalogoMapas, juegoInicial: String, alVolver: () -> Unit) {
    var juego by rememberSaveable { mutableStateOf(juegoInicial) }
    var ano by rememberSaveable { mutableStateOf<Int?>(null) }
    var datos by remember { mutableStateOf<MapaRecorrido?>(null) }
    var fallo by remember { mutableStateOf(false) }
    var cargando by remember { mutableStateOf(true) }
    var control by remember { mutableStateOf<ControlMapa?>(null) }
    var versionEstilo by remember { mutableIntStateOf(0) }

    LaunchedEffect(juego, ano) {
        cargando = true
        fallo = false
        val r = cuenta.mapaRecorrido(juego, ano)
        datos = r
        fallo = r == null
        cargando = false
    }
    LaunchedEffect(control, juego) {
        val c = control ?: return@LaunchedEffect
        val v = catalogo.variantes[juego] ?: return@LaunchedEffect
        c.seguir = false
        c.cargar(v) { versionEstilo++ }
    }
    LaunchedEffect(control, versionEstilo, datos) { control?.ponerRecorrido(datos) }

    Pantalla(stringResource(R.string.stats_mapa), alVolver) {
        Column(Modifier.fillMaxSize()) {
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                listOf("ats", "ets2").forEach { j ->
                    FilterChip(selected = juego == j, onClick = { juego = j }, label = { Text(j.uppercase()) })
                }
                FilterChip(selected = ano == null, onClick = { ano = null }, label = { Text(stringResource(R.string.stats_todo)) })
                anos().forEach { a ->
                    FilterChip(selected = ano == a, onClick = { ano = a }, label = { Text(a.toString()) })
                }
            }
            if (cargando) LinearProgressIndicator(Modifier.fillMaxWidth())
            Box(Modifier.fillMaxWidth().weight(1f)) {
                MapaNativo(Modifier.fillMaxSize()) { control = it }
            }
            Column(Modifier.fillMaxWidth().padding(12.dp)) {
                val d = datos
                Text(
                    when {
                        fallo -> stringResource(R.string.stats_sin_red)
                        d == null -> ""
                        d.viajes == 0 -> stringResource(R.string.stats_mapa_vacio)
                        else -> stringResource(R.string.stats_mapa_resumen, d.viajes, d.ciudades)
                    },
                    style = MaterialTheme.typography.bodyMedium,
                )
                d?.regiones?.takeIf { it.isNotEmpty() }?.let { lista ->
                    Text(
                        lista.joinToString(" · ") { (nombre, n) -> "$nombre $n" },
                        style = MaterialTheme.typography.bodySmall,
                        color = Paleta.TextoSuave,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

/** El resumen del ano: lo manejado, los meses, las rachas y los logros de ese ano. */
@Composable
fun AnoScreen(cuenta: CuentaRepo, ajustes: Ajustes, alVolver: () -> Unit) {
    var ano by rememberSaveable { mutableStateOf(anos().first()) }
    var datos by remember { mutableStateOf<ResumenAno?>(null) }
    var cargando by remember { mutableStateOf(true) }
    LaunchedEffect(ano) {
        cargando = true
        datos = cuenta.resumenAno(ano)
        cargando = false
    }
    // Lo mismo que se ve, entero aunque no entre en la pantalla: es lo que se comparte.
    val capa = rememberGraphicsLayer()
    val contexto = LocalContext.current
    val alcance = rememberCoroutineScope()
    Pantalla(stringResource(R.string.stats_ano_titulo, ano), alVolver) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (anos().size > 1) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    anos().forEach { a -> FilterChip(selected = a == ano, onClick = { ano = a }, label = { Text(a.toString()) }) }
                }
            }
            if (cargando) LinearProgressIndicator(Modifier.fillMaxWidth())
            val d = datos
            when {
                d == null && !cargando -> Text(stringResource(R.string.stats_sin_red), color = Paleta.TextoSuave)
                d != null -> {
                    Column(
                        Modifier
                            .drawWithContent {
                                capa.record { this@drawWithContent.drawContent() }
                                drawLayer(capa)
                            }
                            .background(Paleta.Fondo)
                            .padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Text("Truck Dash · $ano", style = MaterialTheme.typography.titleLarge)
                        ContenidoAno(d, ajustes)
                        Text("trucksim-dash.com", style = MaterialTheme.typography.labelMedium, color = Paleta.TextoSuave)
                    }
                    OutlinedButton(
                        onClick = { alcance.launch { compartirImagen(contexto, capa.toImageBitmap().asAndroidBitmap(), "truckdash-$ano.png") } },
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text(stringResource(R.string.compartir)) }
                }
            }
        }
    }
}

@Composable
private fun ContenidoAno(d: ResumenAno, ajustes: Ajustes) {
    val km = d.totales.sumOf { it.km }
    val millas = usaMillas(ajustes.unidades, d.totales.maxByOrNull { it.km }?.juego ?: "ets2")
    Tarjeta {
        FilaDato(stringResource(R.string.stats_manejado), distancia(km, millas))
        FilaDato(stringResource(R.string.stats_horas), "${d.totales.sumOf { it.horasReales }.toInt()} h")
        FilaDato(stringResource(R.string.stats_entregas), d.resumenes.sumOf { it.entregados }.toString())
        FilaDato(stringResource(R.string.stats_dias), d.diasManejados.toString())
        FilaDato(stringResource(R.string.stats_racha), d.rachaMasLarga.toString())
        d.mejorDia?.let { (fecha, kmDia) -> FilaDato(stringResource(R.string.stats_mejor_dia), "${fechaCorta(fecha)} · ${distancia(kmDia, millas)}") }
        d.primerViaje?.let { FilaDato(stringResource(R.string.stats_primer_viaje), it) }
        FilaDato(stringResource(R.string.stats_logros_ano), d.logros.size.toString())
    }
    if (d.kmPorMes.any { it > 0 }) {
        Tarjeta {
            TituloSeccion(stringResource(R.string.stats_por_mes))
            val tope = d.kmPorMes.max()
            Row(Modifier.fillMaxWidth().height(90.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                d.kmPorMes.forEach { m ->
                    Box(
                        Modifier
                            .weight(1f)
                            .fillMaxHeight(((m / tope).toFloat()).coerceIn(0.02f, 1f))
                            .background(Paleta.Acento, MaterialTheme.shapes.extraSmall),
                    )
                }
            }
        }
    }
    d.resumenes.forEach { r ->
        val total = d.totales.firstOrNull { it.juego == r.juego }
        TarjetaNumeros(r, total, usaMillas(ajustes.unidades, r.juego))
    }
}

/** Seguir a otros conductores: novedades, a quien sigo, quien me sigue y los pedidos. */
@Composable
fun SeguirScreen(cuenta: CuentaRepo, alPerfil: (String) -> Unit, alVolver: () -> Unit) {
    var pestana by rememberSaveable { mutableIntStateOf(0) }
    var listas by remember { mutableStateOf<ListasSeguir?>(null) }
    var novedades by remember { mutableStateOf<List<Novedad>>(emptyList()) }
    var version by remember { mutableIntStateOf(0) }
    var nombre by rememberSaveable { mutableStateOf("") }
    var aviso by remember { mutableStateOf<String?>(null) }
    val alcance = rememberCoroutineScope()
    val noExiste = stringResource(R.string.seguir_no_existe)
    val pedido = stringResource(R.string.seguir_pedido_hecho)
    LaunchedEffect(version) {
        listas = cuenta.listasSeguir()
        novedades = cuenta.novedades()
    }
    fun accion(ruta: String, quien: String) {
        alcance.launch {
            cuenta.accionSeguir(ruta, quien)
            version++
        }
    }
    Pantalla(stringResource(R.string.seguir_titulo), alVolver) {
        Column(Modifier.fillMaxSize()) {
            val l = listas
            TabRow(selectedTabIndex = pestana, containerColor = Paleta.Fondo) {
                listOf(
                    stringResource(R.string.seguir_novedades),
                    stringResource(R.string.seguir_siguiendo),
                    stringResource(R.string.seguir_seguidores) + (l?.pedidos?.size?.takeIf { it > 0 }?.let { " ($it)" } ?: ""),
                ).forEachIndexed { i, t ->
                    Tab(selected = pestana == i, onClick = { pestana = i }, text = { Text(t, maxLines = 1) })
                }
            }
            Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                when (pestana) {
                    0 -> {
                        if (novedades.isEmpty()) {
                            Text(stringResource(R.string.seguir_sin_novedades), color = Paleta.TextoSuave)
                        }
                        novedades.forEach { n -> FilaNovedad(n) { alPerfil(n.nombre) } }
                    }
                    1 -> {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            OutlinedTextField(
                                value = nombre,
                                onValueChange = { nombre = it.take(32) },
                                label = { Text(stringResource(R.string.seguir_nombre)) },
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None),
                                modifier = Modifier.weight(1f),
                            )
                            Button(
                                onClick = {
                                    val quien = nombre.trim()
                                    alcance.launch {
                                        val error = cuenta.accionSeguir("/follow/request", quien)
                                        aviso = if (error == null) pedido else noExiste
                                        if (error == null) nombre = ""
                                        version++
                                    }
                                },
                                enabled = nombre.isNotBlank(),
                                modifier = Modifier.padding(start = 8.dp),
                            ) { Text(stringResource(R.string.seguir_pedir)) }
                        }
                        aviso?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave) }
                        l?.siguiendo?.forEach { p ->
                            FilaPersona(p, alTocar = { alPerfil(p.nombre) }) {
                                TextButton(onClick = { accion("/follow/unfollow", p.nombre) }) { Text(stringResource(R.string.seguir_dejar)) }
                            }
                        }
                        l?.pendientes?.takeIf { it.isNotEmpty() }?.let { pendientes ->
                            TituloSeccion(stringResource(R.string.seguir_esperando))
                            pendientes.forEach { p ->
                                FilaPersona(p, alTocar = { alPerfil(p.nombre) }) {
                                    TextButton(onClick = { accion("/follow/unfollow", p.nombre) }) { Text(stringResource(R.string.seguir_cancelar)) }
                                }
                            }
                        }
                    }
                    else -> {
                        l?.pedidos?.takeIf { it.isNotEmpty() }?.let { pedidos ->
                            TituloSeccion(stringResource(R.string.seguir_pedidos))
                            pedidos.forEach { p ->
                                FilaPersona(p, alTocar = { alPerfil(p.nombre) }) {
                                    TextButton(onClick = { accion("/follow/accept", p.nombre) }) { Text(stringResource(R.string.seguir_aceptar)) }
                                    TextButton(onClick = { accion("/follow/reject", p.nombre) }) { Text(stringResource(R.string.seguir_rechazar)) }
                                }
                            }
                        }
                        l?.seguidores?.forEach { p ->
                            FilaPersona(p, alTocar = { alPerfil(p.nombre) }) {
                                TextButton(onClick = { accion("/follow/block", p.nombre) }) { Text(stringResource(R.string.seguir_bloquear)) }
                            }
                        }
                        l?.bloqueados?.takeIf { it.isNotEmpty() }?.let { bloqueados ->
                            TituloSeccion(stringResource(R.string.seguir_bloqueados))
                            bloqueados.forEach { p ->
                                FilaPersona(p, alTocar = {}) {
                                    TextButton(onClick = { accion("/follow/unblock", p.nombre) }) { Text(stringResource(R.string.seguir_desbloquear)) }
                                }
                            }
                        }
                        if (l != null && l.seguidores.isEmpty() && l.pedidos.isEmpty() && l.bloqueados.isEmpty()) {
                            Text(stringResource(R.string.seguir_sin_seguidores), color = Paleta.TextoSuave)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun FilaPersona(p: Persona, alTocar: () -> Unit, acciones: @Composable () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = alTocar).padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(p.nombre, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
            p.titulo?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave) }
        }
        acciones()
    }
}

@Composable
private fun FilaNovedad(n: Novedad, alTocar: () -> Unit) {
    val que = stringResource(
        when (n.tipo) {
            "delivered" -> R.string.novedad_entrego
            "cancelled" -> R.string.novedad_cancelo
            "started" -> R.string.novedad_empezo
            else -> R.string.novedad_logro
        },
        n.nombre,
    )
    Column(Modifier.fillMaxWidth().clickable(onClick = alTocar).padding(vertical = 4.dp)) {
        Text(que, style = MaterialTheme.typography.bodyMedium)
        val detalle = listOfNotNull(n.ruta, n.carga, n.cuando?.let { fechaCorta(it) }).joinToString(" · ")
        if (detalle.isNotEmpty()) Text(detalle, style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave)
    }
}

/** Lo que el otro deja ver: si acepto, sus numeros; si no, nada mas que el nombre. */
@Composable
fun PerfilScreen(cuenta: CuentaRepo, nombre: String, ajustes: Ajustes, alVolver: () -> Unit) {
    var perfil by remember { mutableStateOf<PerfilAjeno?>(null) }
    var cargando by remember { mutableStateOf(true) }
    var version by remember { mutableIntStateOf(0) }
    val alcance = rememberCoroutineScope()
    LaunchedEffect(nombre, version) {
        perfil = cuenta.perfil(nombre)
        cargando = false
    }
    fun accion(ruta: String) {
        alcance.launch {
            cuenta.accionSeguir(ruta, nombre)
            version++
        }
    }
    Pantalla(nombre, alVolver) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (cargando) LinearProgressIndicator(Modifier.fillMaxWidth())
            val p = perfil
            if (p == null) {
                if (!cargando) Text(stringResource(R.string.seguir_no_existe), color = Paleta.TextoSuave)
                return@Column
            }
            p.titulo?.let { Text(it, color = Paleta.TextoSuave) }
            if (p.manejando) Text(stringResource(R.string.seguir_manejando), color = Paleta.Verde)
            // Sin cuenta vinculada se ve el perfil publico, pero no se puede pedir seguir.
            val conCuenta = cuenta.estado.collectAsStateWithLifecycle().value is EstadoCuenta.Vinculada
            if (!p.soyYo && conCuenta) {
                when (p.loSigo) {
                    "accepted" -> OutlinedButton(onClick = { accion("/follow/unfollow") }) { Text(stringResource(R.string.seguir_dejar)) }
                    "pending" -> OutlinedButton(onClick = { accion("/follow/unfollow") }) { Text(stringResource(R.string.seguir_cancelar)) }
                    else -> Button(onClick = { accion("/follow/request") }) { Text(stringResource(R.string.seguir_pedir)) }
                }
                if (p.meSigue == "pending") {
                    Row {
                        TextButton(onClick = { accion("/follow/accept") }) { Text(stringResource(R.string.seguir_aceptar)) }
                        TextButton(onClick = { accion("/follow/reject") }) { Text(stringResource(R.string.seguir_rechazar)) }
                    }
                }
            }
            if (!p.completo && !p.publico && !p.soyYo) {
                Text(stringResource(R.string.seguir_privado), style = MaterialTheme.typography.bodyMedium, color = Paleta.TextoSuave)
            }
            p.resumenes.forEach { r ->
                TarjetaNumeros(r, p.totales.firstOrNull { it.juego == r.juego }, usaMillas(ajustes.unidades, r.juego))
            }
            if (p.recientes.isNotEmpty()) {
                TituloSeccion(stringResource(R.string.seguir_ultimos))
                p.recientes.forEach { v -> FilaViaje(v, ajustes, null) }
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}
