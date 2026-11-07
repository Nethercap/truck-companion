package com.trucksimdash.app.ui

import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.OutlinedIconButton
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.trucksimdash.app.R
import com.trucksimdash.app.core.Ajustes
import com.trucksimdash.app.core.Red
import com.trucksimdash.app.core.consumo
import com.trucksimdash.app.core.distancia
import com.trucksimdash.app.core.duracionHoras
import com.trucksimdash.app.core.enteroLocal
import com.trucksimdash.app.core.fechaCorta
import com.trucksimdash.app.core.masa
import com.trucksimdash.app.core.plata
import com.trucksimdash.app.core.porcentajeTexto
import com.trucksimdash.app.core.unidadVelocidad
import com.trucksimdash.app.mapa.CatalogoMapas
import com.trucksimdash.app.core.usaMillas
import com.trucksimdash.app.core.velocidadEnUnidad
import com.trucksimdash.app.cuenta.CuentaRepo
import com.trucksimdash.app.cuenta.DatosStats
import com.trucksimdash.app.cuenta.EstadoCuenta
import com.trucksimdash.app.cuenta.FilaTop
import com.trucksimdash.app.cuenta.Logro
import com.trucksimdash.app.cuenta.Record
import com.trucksimdash.app.cuenta.ResumenJuego
import com.trucksimdash.app.cuenta.TotalManejo
import com.trucksimdash.app.cuenta.Usuario
import com.trucksimdash.app.cuenta.Viaje
import com.trucksimdash.app.cuenta.serieActividad
import kotlinx.coroutines.launch
import java.util.Calendar

internal fun abrirEnNavegador(contexto: Context, url: String) {
    runCatching {
        CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(contexto, Uri.parse(url))
    }.onFailure {
        runCatching { contexto.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
    }
}

@Composable
fun StatsScreen(cuenta: CuentaRepo, ajustes: Ajustes, catalogo: CatalogoMapas, alAjustes: () -> Unit) {
    val estado by cuenta.estado.collectAsStateWithLifecycle()
    var pantalla by rememberSaveable { mutableStateOf("") }
    var perfil by rememberSaveable { mutableStateOf<String?>(null) }
    perfil?.let { nombre ->
        PerfilScreen(cuenta, nombre, ajustes) { perfil = null }
        return
    }
    if (estado is EstadoCuenta.Vinculada) {
        when (pantalla) {
            "mapa" -> {
                val juego = cuenta.datos.collectAsStateWithLifecycle().value.resumenes.firstOrNull()?.juego ?: "ats"
                RecorridoScreen(cuenta, catalogo, juego) { pantalla = "" }
                return
            }
            "ano" -> {
                AnoScreen(cuenta, ajustes) { pantalla = "" }
                return
            }
            "seguir" -> {
                SeguirScreen(cuenta, alPerfil = { perfil = it }) { pantalla = "" }
                return
            }
        }
    }
    when (val e = estado) {
        EstadoCuenta.Cargando -> Centrado { CircularProgressIndicator(strokeWidth = 3.dp) }
        EstadoCuenta.SinVincular, EstadoCuenta.VinculoVencido -> Box(Modifier.fillMaxSize()) {
            SinVincular(cuenta, vencido = e == EstadoCuenta.VinculoVencido) { perfil = it }
            BotonAjustes(alAjustes, Modifier.align(Alignment.TopEnd))
        }
        is EstadoCuenta.Vinculando -> Vinculando(e, cuenta)
        is EstadoCuenta.Vinculada -> ContenidoStats(cuenta, e.usuario, ajustes, alAjustes) { pantalla = it }
    }
}

@Composable
private fun Centrado(contenido: @Composable () -> Unit) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) { contenido() }
}

@Composable
private fun SinVincular(cuenta: CuentaRepo, vencido: Boolean, alPerfil: (String) -> Unit) {
    val contexto = LocalContext.current
    val alcance = rememberCoroutineScope()
    var error by remember { mutableStateOf(false) }
    var buscado by rememberSaveable { mutableStateOf("") }
    Centrado {
        Column(Modifier.widthIn(max = 420.dp)) {
            Text(stringResource(R.string.stats_titulo), style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(8.dp))
            Text(stringResource(R.string.stats_vincular_ayuda), style = MaterialTheme.typography.bodyMedium, color = Paleta.TextoSuave)
            if (vencido || error) {
                Spacer(Modifier.height(10.dp))
                Text(
                    stringResource(if (error) R.string.sin_conexion else R.string.stats_vinculo_vencido),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Paleta.Ambar,
                )
            }
            Spacer(Modifier.height(18.dp))
            Button(
                onClick = {
                    alcance.launch {
                        val url = cuenta.empezarVinculo(nombreDispositivo())
                        error = url == null
                        if (url != null) abrirEnNavegador(contexto, url)
                    }
                },
                modifier = Modifier.fillMaxWidth().height(48.dp),
            ) { Text(stringResource(R.string.stats_vincular)) }
            Spacer(Modifier.height(10.dp))
            Text(stringResource(R.string.stats_sin_contrasena), style = MaterialTheme.typography.bodySmall, color = Paleta.TextoApagado)
            // El perfil publico de otro conductor no pide cuenta, igual que /u/?nombre en la web.
            Spacer(Modifier.height(24.dp))
            Text(stringResource(R.string.stats_buscar_conductor), style = MaterialTheme.typography.titleMedium)
            Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = buscado,
                    onValueChange = { buscado = it.take(32) },
                    label = { Text(stringResource(R.string.seguir_nombre)) },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
                OutlinedIconButton(
                    onClick = { alPerfil(buscado.trim()) },
                    enabled = buscado.isNotBlank(),
                    modifier = Modifier.padding(start = 8.dp),
                ) { Icon(Icons.Filled.Search, stringResource(R.string.stats_buscar_conductor)) }
            }
        }
    }
}

@Composable
private fun Vinculando(e: EstadoCuenta.Vinculando, cuenta: CuentaRepo) {
    val contexto = LocalContext.current
    Centrado {
        Column(Modifier.widthIn(max = 420.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(stringResource(R.string.stats_aprobar), style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(10.dp))
            Text(stringResource(R.string.stats_aprobar_ayuda), style = MaterialTheme.typography.bodyMedium, color = Paleta.TextoSuave)
            Spacer(Modifier.height(18.dp))
            SelectionContainer {
                Text(e.codigo, style = MaterialTheme.typography.headlineMedium.merge(NumerosTabulares), fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.height(18.dp))
            CircularProgressIndicator(Modifier.size(28.dp), strokeWidth = 3.dp)
            Spacer(Modifier.height(18.dp))
            Button(onClick = { abrirEnNavegador(contexto, e.url) }, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.stats_abrir_otra_vez))
            }
            TextButton(onClick = { cuenta.cancelarVinculo() }) { Text(stringResource(R.string.cancelar)) }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ContenidoStats(cuenta: CuentaRepo, usuario: Usuario?, ajustes: Ajustes, alAjustes: () -> Unit, alAbrir: (String) -> Unit) {
    val datos by cuenta.datos.collectAsStateWithLifecycle()
    val alcance = rememberCoroutineScope()
    var juegoElegido by rememberSaveable { mutableStateOf<String?>(null) }
    val juegos = datos.resumenes.map { it.juego }
    val juego = juegoElegido?.takeIf { it in juegos } ?: juegos.firstOrNull()
    val resumen = datos.resumenes.firstOrNull { it.juego == juego }
    val millas = usaMillas(ajustes.unidades, juego)

    LaunchedEffect(Unit) { cuenta.refrescar() }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(Modifier.fillMaxWidth().padding(start = 4.dp, top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(stringResource(R.string.stats_titulo), style = MaterialTheme.typography.headlineMedium)
                    usuario?.nombre?.let {
                        Text(it, style = MaterialTheme.typography.bodyMedium, color = Paleta.TextoSuave, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
                IconButton(onClick = { alcance.launch { cuenta.refrescar() } }) {
                    Icon(Icons.Filled.Refresh, stringResource(R.string.actualizar), tint = Paleta.TextoSuave)
                }
                BotonAjustes(alAjustes)
            }
        }
        if (datos.cargando) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
        item {
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedButton(onClick = { alAbrir("mapa") }) { Text(stringResource(R.string.stats_mapa)) }
                OutlinedButton(onClick = { alAbrir("ano") }) { Text(stringResource(R.string.stats_ano)) }
                OutlinedButton(onClick = { alAbrir("seguir") }) { Text(stringResource(R.string.seguir_titulo)) }
            }
        }
        if (datos.sinRed) {
            item { Text(stringResource(R.string.stats_sin_red), style = MaterialTheme.typography.bodySmall, color = Paleta.Ambar) }
        }
        if (juegos.size > 1) {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    juegos.forEach { j ->
                        FilterChip(
                            selected = j == juego,
                            onClick = { juegoElegido = j },
                            label = { Text(j.uppercase()) },
                        )
                    }
                }
            }
        }
        if (resumen == null) {
            if (!datos.cargando) item { SinViajes() }
        } else {
            item { TarjetaNumeros(resumen, datos.totales.firstOrNull { it.juego == juego }, millas) }
            item { TarjetaActividad(datos, resumen.juego, millas) }
            if (resumen.plata.isNotEmpty()) item { TarjetaPlata(resumen) }
            item { TarjetaRecords(resumen, millas) }
            item { TarjetaTops(resumen, millas) }
        }
        if (datos.logros.isNotEmpty()) item { TarjetaLogros(datos.logros, millas) }
        if (datos.viajes.isNotEmpty()) {
            item {
                Text(
                    pluralStringResource(R.plurals.stats_bitacora, datos.totalViajes, datos.totalViajes),
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(start = 4.dp, top = 4.dp),
                )
            }
            items(datos.viajes, key = { it.id }) { v -> FilaViaje(v, ajustes, cuenta) }
            if (datos.viajes.size < datos.totalViajes) {
                item {
                    OutlinedButton(
                        onClick = { alcance.launch { cuenta.masViajes() } },
                        enabled = !datos.cargandoMas,
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text(stringResource(R.string.stats_mas_viajes)) }
                }
            }
        }
        item { PieCuenta(cuenta) }
    }
}

@Composable
private fun SinViajes() {
    Tarjeta {
        Text(stringResource(R.string.stats_sin_viajes), style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(4.dp))
        Text(stringResource(R.string.stats_sin_viajes_ayuda), style = MaterialTheme.typography.bodyMedium, color = Paleta.TextoSuave)
    }
}

@Composable
internal fun TarjetaNumeros(r: ResumenJuego, total: TotalManejo?, millas: Boolean) {
    Tarjeta {
        // La cifra de cabecera es lo manejado de verdad: con trabajo o sin el.
        Text(stringResource(R.string.stats_manejado), style = MaterialTheme.typography.labelMedium, color = Paleta.TextoSuave)
        Text(
            distancia(total?.km ?: r.km, millas),
            style = MaterialTheme.typography.headlineMedium.merge(NumerosTabulares),
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(14.dp))
        Row(Modifier.fillMaxWidth()) {
            Dato(stringResource(R.string.stats_entregados), enteroLocal(r.entregados), Modifier.weight(1f))
            Dato(stringResource(R.string.stats_a_tiempo), porcentajeTexto(r.aTiempo, r.aTiempo + r.tarde), Modifier.weight(1f))
            Dato(stringResource(R.string.stats_sin_terminar), enteroLocal(r.sinTerminar), Modifier.weight(1f))
        }
        Spacer(Modifier.height(12.dp))
        Row(Modifier.fillMaxWidth()) {
            Dato(stringResource(R.string.stats_horas_reales), duracionHoras(total?.horasReales ?: r.horasReales), Modifier.weight(1f))
            Dato(stringResource(R.string.stats_km_trabajos), distancia(r.km, millas), Modifier.weight(1f))
            Dato(
                stringResource(R.string.stats_paises),
                if (r.paises.isEmpty()) "-" else enteroLocal(r.paises.size),
                Modifier.weight(1f),
            )
        }
        if (r.modeados > 0) {
            Spacer(Modifier.height(10.dp))
            Text(
                pluralStringResource(R.plurals.stats_modeados, r.modeados, r.modeados),
                style = MaterialTheme.typography.bodySmall,
                color = Paleta.TextoApagado,
            )
        }
    }
}

@Composable
private fun TarjetaActividad(d: DatosStats, juego: String, millas: Boolean) {
    val barras = remember(d.actividad, juego) { serieActividad(d.actividad, juego, 30, Calendar.getInstance()) }
    Tarjeta {
        TituloSeccion(stringResource(R.string.stats_actividad))
        GraficoActividad(barras, millas)
    }
}

@Composable
private fun TarjetaPlata(r: ResumenJuego) {
    Tarjeta {
        TituloSeccion(stringResource(R.string.stats_plata))
        // Una fila por moneda: sumar euros con dolares no da nada.
        r.plata.forEachIndexed { i, m ->
            if (i > 0) Spacer(Modifier.height(8.dp))
            FilaDato(stringResource(R.string.stats_ingresos), plata(m.ingreso, m.moneda))
            if (m.peajes > 0) FilaDato(stringResource(R.string.stats_peajes), plata(m.peajes, m.moneda))
            if (m.multas > 0) FilaDato(stringResource(R.string.stats_multas), plata(m.multas, m.moneda))
            if (m.ferries > 0) FilaDato(stringResource(R.string.stats_ferries), plata(m.ferries, m.moneda))
            if (m.penalidades > 0) FilaDato(stringResource(R.string.stats_penalidades), plata(m.penalidades, m.moneda))
        }
    }
}

@Composable
private fun recorrido(r: Record?): String? =
    if (r?.origen != null && r.destino != null) "${r.origen} → ${r.destino}" else null

@Composable
private fun FilaRecord(etiqueta: String, valor: String, detalle: String?) {
    Column(Modifier.padding(vertical = 5.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(etiqueta, style = MaterialTheme.typography.bodyMedium, color = Paleta.TextoSuave)
            Text(valor, style = MaterialTheme.typography.bodyMedium.merge(NumerosTabulares), fontWeight = FontWeight.Medium)
        }
        if (detalle != null) {
            Text(detalle, style = MaterialTheme.typography.bodySmall, color = Paleta.TextoApagado, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun TarjetaRecords(r: ResumenJuego, millas: Boolean) {
    val hay = r.mejorPago != null || r.mejorPromedio != null || r.masPesado != null || r.masEficiente != null || r.masLargoKm != null
    if (!hay) return
    Tarjeta {
        TituloSeccion(stringResource(R.string.stats_records))
        r.masLargoKm?.let {
            FilaRecord(
                stringResource(R.string.stats_mas_largo),
                distancia(it, millas),
                if (r.masLargoOrigen != null && r.masLargoDestino != null) "${r.masLargoOrigen} → ${r.masLargoDestino}" else null,
            )
        }
        r.mejorPago?.let { FilaRecord(stringResource(R.string.stats_mejor_pago), plata(it.valor, it.moneda), recorrido(it)) }
        r.mejorPromedio?.let {
            FilaRecord(
                stringResource(R.string.stats_mejor_promedio),
                "${velocidadEnUnidad(it.valor, millas)} ${unidadVelocidad(millas)}",
                recorrido(it),
            )
        }
        r.masPesado?.let { FilaRecord(stringResource(R.string.stats_mas_pesado), masa(it.valor, millas), it.carga ?: recorrido(it)) }
        r.masEficiente?.let { FilaRecord(stringResource(R.string.stats_mas_eficiente), consumo(it.valor, millas), recorrido(it)) }
        r.velocidadMax?.takeIf { it > 0 }?.let {
            FilaRecord(stringResource(R.string.stats_vel_max), "${velocidadEnUnidad(it, millas)} ${unidadVelocidad(millas)}", null)
        }
    }
}

@Composable
private fun ColumnaTop(titulo: String, filas: List<FilaTop>) {
    if (filas.isEmpty()) return
    Text(titulo, style = MaterialTheme.typography.labelMedium, color = Paleta.TextoSuave, modifier = Modifier.padding(top = 8.dp, bottom = 2.dp))
    val tope = filas.maxOf { it.viajes }.coerceAtLeast(1)
    filas.take(5).forEach { f ->
        Column(Modifier.padding(vertical = 3.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(
                    f.nombre,
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                Text(enteroLocal(f.viajes), style = MaterialTheme.typography.bodyMedium.merge(NumerosTabulares), color = Paleta.TextoSuave, modifier = Modifier.padding(start = 10.dp))
            }
            Spacer(Modifier.height(3.dp))
            BarraNivel(f.viajes.toFloat() / tope, Paleta.Acento, alto = 4)
        }
    }
}

@Composable
private fun TarjetaTops(r: ResumenJuego, millas: Boolean) {
    val hay = r.camiones.isNotEmpty() || r.cargas.isNotEmpty() || r.empresas.isNotEmpty() || r.ciudades.isNotEmpty()
    if (!hay) return
    Tarjeta {
        TituloSeccion(stringResource(R.string.stats_lo_que_mas))
        ColumnaTop(stringResource(R.string.stats_top_camiones), r.camiones)
        ColumnaTop(stringResource(R.string.stats_top_cargas), r.cargas)
        ColumnaTop(stringResource(R.string.stats_top_empresas), r.empresas)
        ColumnaTop(stringResource(R.string.stats_top_ciudades), r.ciudades)
        if (r.consumoPorCamion.isNotEmpty()) {
            Text(
                stringResource(R.string.stats_consumo_camion),
                style = MaterialTheme.typography.labelMedium,
                color = Paleta.TextoSuave,
                modifier = Modifier.padding(top = 10.dp, bottom = 2.dp),
            )
            r.consumoPorCamion.take(5).forEach { FilaDato(it.nombre, consumo(it.litrosCada100, millas)) }
        }
    }
}

/** titulo y descripcion de un logro: `datosDeLogro` en account.js; la API solo da el id. */
@Composable
private fun textoLogro(l: Logro, millas: Boolean): Pair<String, String> {
    val m = Regex("""^(deliveries|km|long_haul|countries|states)_(\d+)$""").find(l.id)
    if (m != null) {
        val n = m.groupValues[2].toInt()
        val d = distancia(n.toDouble(), millas)
        return when (m.groupValues[1]) {
            "deliveries" -> if (n == 1) {
                stringResource(R.string.logro_primera_t) to stringResource(R.string.logro_primera_d)
            } else {
                stringResource(R.string.logro_entregas_t, enteroLocal(n)) to stringResource(R.string.logro_entregas_d, enteroLocal(n))
            }
            "km" -> stringResource(R.string.logro_km_t, d) to stringResource(R.string.logro_km_d, d)
            "long_haul" -> stringResource(if (n >= 2500) R.string.logro_ultra_t else R.string.logro_largo_t) to stringResource(R.string.logro_largo_d, d)
            "countries" -> stringResource(R.string.logro_paises_t, n) to stringResource(R.string.logro_paises_d, n)
            else -> stringResource(R.string.logro_estados_t, n) to stringResource(R.string.logro_estados_d, n)
        }
    }
    val meta = l.meta?.toInt() ?: 0
    return when (l.id) {
        "on_time_streak" -> stringResource(R.string.logro_racha_t) to stringResource(R.string.logro_racha_d, meta)
        "clean_record" -> stringResource(R.string.logro_limpio_t) to stringResource(R.string.logro_limpio_d, meta)
        "spotless" -> stringResource(R.string.logro_impecable_t) to stringResource(R.string.logro_impecable_d, distancia(300.0, millas))
        "heavy_load" -> stringResource(R.string.logro_pesado_t) to stringResource(R.string.logro_pesado_d, masa(30000.0, millas))
        "ferry" -> stringResource(R.string.logro_ferry_t) to stringResource(R.string.logro_ferry_d)
        "big_payday" -> stringResource(R.string.logro_pago_t) to stringResource(R.string.logro_pago_d, enteroLocal(100000))
        "both_games" -> stringResource(R.string.logro_ambos_t) to stringResource(R.string.logro_ambos_d)
        "car_job" -> stringResource(R.string.logro_auto_t) to stringResource(R.string.logro_auto_d)
        // Un logro nuevo de la API antes que la app: con su id, nunca se rompe.
        else -> l.id to ""
    }
}

@Composable
private fun TarjetaLogros(logros: List<Logro>, millas: Boolean) {
    var todos by rememberSaveable { mutableStateOf(false) }
    val conseguidos = logros.count { it.desbloqueado != null }
    // Primero lo conseguido, lo mas nuevo arriba; despues lo que esta mas cerca.
    val ordenados = logros.sortedWith(
        compareByDescending<Logro> { it.desbloqueado != null }
            .thenByDescending { it.desbloqueado ?: "" }
            .thenByDescending { if (it.meta != null && it.meta > 0) (it.valor ?: 0.0) / it.meta else 0.0 },
    )
    Tarjeta {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            TituloSeccion(stringResource(R.string.stats_logros))
            Text(
                stringResource(R.string.stats_logros_cuenta, conseguidos, logros.size),
                style = MaterialTheme.typography.bodySmall.merge(NumerosTabulares),
                color = Paleta.TextoSuave,
            )
        }
        (if (todos) ordenados else ordenados.take(5)).forEach { l ->
            val (titulo, descripcion) = textoLogro(l, millas)
            Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    if (l.desbloqueado != null) Icons.Filled.Check else Icons.Filled.Lock,
                    stringResource(if (l.desbloqueado != null) R.string.stats_conseguido else R.string.stats_bloqueado),
                    tint = if (l.desbloqueado != null) Paleta.Verde else Paleta.TextoApagado,
                    modifier = Modifier.size(20.dp),
                )
                Column(Modifier.weight(1f).padding(start = 12.dp)) {
                    Text(titulo, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                    if (descripcion.isNotEmpty()) {
                        Text(descripcion, style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave)
                    }
                    if (l.desbloqueado == null && l.meta != null && l.meta > 1) {
                        Spacer(Modifier.height(4.dp))
                        BarraNivel(((l.valor ?: 0.0) / l.meta).toFloat(), Paleta.Acento, alto = 4)
                    }
                }
                if (l.desbloqueado != null) {
                    Text(
                        fechaCorta(l.desbloqueado),
                        style = MaterialTheme.typography.labelSmall,
                        color = Paleta.TextoApagado,
                        modifier = Modifier.padding(start = 8.dp),
                    )
                }
            }
        }
        if (logros.size > 5) {
            TextButton(onClick = { todos = !todos }, modifier = Modifier.align(Alignment.End)) {
                Text(stringResource(if (todos) R.string.ver_menos else R.string.ver_todos))
            }
        }
    }
}

/** Lo que se puede corregir de un viaje propio: la web lo llama panelCorreccion. */
@Composable
private fun CorregirViaje(v: Viaje, cuenta: CuentaRepo) {
    val alcance = rememberCoroutineScope()
    var borrador by rememberSaveable(v.id) { mutableStateOf(v.nota.orEmpty()) }
    var armado by remember(v.id) { mutableStateOf(false) }
    var error by remember(v.id) { mutableStateOf(false) }
    Spacer(Modifier.height(8.dp))
    if (v.estado == "in_progress" || v.estado == "abandoned") {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { alcance.launch { error = !cuenta.corregirViaje(v.id, estado = "cancelled") } }) {
                Text(stringResource(R.string.viaje_marcar_cancelado))
            }
            if (v.estado == "in_progress") {
                OutlinedButton(onClick = { alcance.launch { error = !cuenta.corregirViaje(v.id, estado = "abandoned") } }) {
                    Text(stringResource(R.string.viaje_marcar_sin_terminar))
                }
            }
        }
    }
    OutlinedTextField(
        value = borrador,
        onValueChange = { borrador = it.take(500) },
        label = { Text(stringResource(R.string.viaje_nota)) },
        modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
    )
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        if (borrador != v.nota.orEmpty()) {
            TextButton(onClick = { alcance.launch { error = !cuenta.corregirViaje(v.id, nota = borrador) } }) {
                Text(stringResource(R.string.viaje_guardar_nota))
            }
        }
        Spacer(Modifier.weight(1f))
        // En dos pasos: un viaje dice por donde pasaste, pero no se borra de un toque distraido.
        TextButton(onClick = {
            if (!armado) {
                armado = true
            } else {
                alcance.launch { error = !cuenta.borrarViaje(v.id) }
            }
        }) { Text(stringResource(if (armado) R.string.viaje_borrar_seguro else R.string.viaje_borrar), color = Paleta.Rojo) }
    }
    if (error) Text(stringResource(R.string.stats_sin_red), style = MaterialTheme.typography.bodySmall, color = Paleta.Rojo)
}

@Composable
internal fun FilaViaje(v: Viaje, ajustes: Ajustes, cuenta: CuentaRepo?) {
    val millas = usaMillas(ajustes.unidades, v.juego)
    var abierto by rememberSaveable(v.id) { mutableStateOf(false) }
    androidx.compose.material3.Surface(
        onClick = { abierto = !abierto },
        shape = MaterialTheme.shapes.medium,
        color = Paleta.Superficie,
        border = androidx.compose.foundation.BorderStroke(1.dp, Paleta.Borde),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(12.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(
                        "${v.ciudadOrigen ?: "-"} → ${v.ciudadDestino ?: "-"}",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        listOfNotNull(v.empezado?.let { fechaCorta(it) }, v.carga).joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = Paleta.TextoSuave,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Column(horizontalAlignment = Alignment.End, modifier = Modifier.padding(start = 10.dp)) {
                    Text(
                        v.km?.let { distancia(it, millas) } ?: "-",
                        style = MaterialTheme.typography.bodyMedium.merge(NumerosTabulares),
                    )
                    Text(
                        textoEstadoViaje(v),
                        style = MaterialTheme.typography.labelSmall,
                        color = when (v.estado) {
                            "delivered" -> if (v.aTiempo == false) Paleta.Ambar else Paleta.Verde
                            "in_progress" -> Paleta.Acento
                            else -> Paleta.TextoApagado
                        },
                    )
                }
            }
            if (abierto) {
                Spacer(Modifier.height(8.dp))
                v.pago?.takeIf { it > 0 }?.let {
                    FilaDato(stringResource(R.string.pago), plata(it, v.moneda) + if (v.modeado) " · " + stringResource(R.string.stats_modeado) else "")
                }
                v.camion?.let { FilaDato(stringResource(R.string.camion), it) }
                v.cargaKg?.takeIf { it > 0 }?.let { FilaDato(stringResource(R.string.carga), masa(it, millas)) }
                v.velocidadMedia?.takeIf { it > 0 }?.let {
                    FilaDato(stringResource(R.string.stats_vel_media), "${velocidadEnUnidad(it, millas)} ${unidadVelocidad(millas)}")
                }
                v.combustible?.takeIf { it > 0 }?.let { FilaDato(stringResource(R.string.combustible), com.trucksimdash.app.core.volumen(it, millas)) }
                v.dano?.takeIf { it > 0 }?.let { FilaDato(stringResource(R.string.dano_carga), "${com.trucksimdash.app.core.porcentaje(it)} %") }
                if (cuenta != null) CorregirViaje(v, cuenta)
                v.multas?.takeIf { it > 0 }?.let { FilaDato(stringResource(R.string.stats_multas), plata(it, v.moneda)) }
            }
        }
    }
}

@Composable
private fun textoEstadoViaje(v: Viaje): String = stringResource(
    when (v.estado) {
        "delivered" -> if (v.aTiempo == false) R.string.viaje_tarde else R.string.viaje_entregado
        "in_progress" -> R.string.viaje_en_curso
        "cancelled" -> R.string.viaje_cancelado
        else -> R.string.viaje_sin_terminar
    },
)

@Composable
private fun PieCuenta(cuenta: CuentaRepo) {
    val contexto = LocalContext.current
    Column(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        TextButton(onClick = { abrirEnNavegador(contexto, "${Red.WEB}/account/") }) {
            Text(stringResource(R.string.stats_abrir_cuenta))
        }
        TextButton(onClick = { cuenta.olvidar() }) { Text(stringResource(R.string.stats_olvidar)) }
        Text(
            stringResource(R.string.stats_olvidar_ayuda),
            style = MaterialTheme.typography.bodySmall,
            color = Paleta.TextoApagado,
            modifier = Modifier.widthIn(max = 420.dp),
        )
    }
}
