package com.trucksimdash.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Hotel
import androidx.compose.material.icons.filled.LocalGasStation
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.trucksimdash.app.R
import com.trucksimdash.app.nav.BusquedaNav
import com.trucksimdash.app.nav.EncontradoNav
import com.trucksimdash.app.nav.EstadoNav
import com.trucksimdash.app.nav.MotorNav
import kotlinx.coroutines.delay

// Los textos del buscador, de la web: en los ocho idiomas, y sin una segunda copia.
private val CLAVES = listOf(
    "poiNearestFuel", "poiNearestRest", "poiSearchPlaceholder", "poiCatFuel", "poiCatRest",
    "poiCatService", "poiCatGarage", "poiCatDealer", "poiCatWeigh", "navReportOpen",
)

private val CATEGORIAS = listOf(
    "g" to "poiCatFuel",
    "p" to "poiCatRest",
    "s" to "poiCatService",
    "r" to "poiCatGarage",
    "d" to "poiCatDealer",
    "w" to "poiCatWeigh",
)

/** Paradas y destinos: el buscador de la web, para usar con una mano y sin mirar mucho. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HojaDestinos(nav: EstadoNav, motor: MotorNav, alReportar: () -> Unit, alCerrar: () -> Unit) {
    val hoja = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var textos by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var consulta by rememberSaveable { mutableStateOf("") }
    var categoria by rememberSaveable { mutableStateOf("g") }
    var resultado by remember { mutableStateOf(BusquedaNav(null, emptyList())) }

    LaunchedEffect(Unit) { textos = motor.textos(CLAVES) }
    LaunchedEffect(consulta, categoria) {
        // Una busqueda por tecla atrasaria el motor, que es el que maneja.
        if (consulta.isNotEmpty()) delay(250)
        resultado = motor.buscar(consulta, categoria)
    }

    ModalBottomSheet(onDismissRequest = alCerrar, sheetState = hoja, containerColor = Paleta.Superficie) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 16.dp)) {
            // Lo que se pide manejando: un toque, y el motor elige la mejor sobre la ruta.
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilledTonalButton(
                    onClick = {
                        motor.parada("g")
                        alCerrar()
                    },
                    modifier = Modifier.weight(1f).height(56.dp),
                ) {
                    Icon(Icons.Filled.LocalGasStation, null)
                    Spacer(Modifier.padding(start = 6.dp))
                    Text(sinEmoji(textos["poiNearestFuel"]), maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
                FilledTonalButton(
                    onClick = {
                        motor.parada("p")
                        alCerrar()
                    },
                    modifier = Modifier.weight(1f).height(56.dp),
                ) {
                    Icon(Icons.Filled.Hotel, null)
                    Spacer(Modifier.padding(start = 6.dp))
                    Text(sinEmoji(textos["poiNearestRest"]), maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }

            if (nav.waypoints.isNotEmpty()) {
                Spacer(Modifier.height(14.dp))
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        stringResource(R.string.nav_paradas),
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(onClick = { motor.limpiarWaypoints() }) { Text(stringResource(R.string.nav_quitar_todas)) }
                }
                nav.waypoints.forEachIndexed { i, w ->
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "${i + 1}. ${w.etiqueta ?: stringResource(R.string.nav_punto_ruta)}",
                            style = MaterialTheme.typography.bodyMedium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f),
                        )
                        IconButton(onClick = { motor.sacarWaypoint(i) }) {
                            Icon(Icons.Filled.Close, stringResource(R.string.nav_quitar_parada), tint = Paleta.TextoSuave)
                        }
                    }
                }
            }

            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = consulta,
                onValueChange = { consulta = it },
                placeholder = { Text(textos["poiSearchPlaceholder"].orEmpty()) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            if (consulta.isBlank()) {
                Spacer(Modifier.height(6.dp))
                Row(
                    Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    CATEGORIAS.forEach { (codigo, clave) ->
                        FilterChip(
                            selected = categoria == codigo,
                            onClick = { categoria = codigo },
                            label = { Text(textos[clave].orEmpty()) },
                        )
                    }
                }
            }
            Spacer(Modifier.height(6.dp))
            resultado.aviso?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, color = Paleta.TextoSuave, modifier = Modifier.padding(vertical = 10.dp))
            }
            LazyColumn(Modifier.heightIn(max = 320.dp)) {
                items(resultado.lista, key = { it.indice }) { r ->
                    FilaEncontrado(r) {
                        motor.elegir(r.indice)
                        alCerrar()
                    }
                }
            }

            Spacer(Modifier.height(4.dp))
            Text(stringResource(R.string.nav_ayuda_mapa), style = MaterialTheme.typography.bodySmall, color = Paleta.TextoApagado)
            if (nav.rutaOculta) {
                TextButton(onClick = {
                    motor.mostrarRuta()
                    alCerrar()
                }) { Text(stringResource(R.string.nav_mostrar_ruta)) }
            } else if (nav.hayRuta) {
                TextButton(onClick = {
                    motor.ocultarRuta()
                    alCerrar()
                }) { Text(stringResource(R.string.nav_ocultar_ruta)) }
            }
            textos["navReportOpen"]?.let { t ->
                TextButton(onClick = {
                    alCerrar()
                    alReportar()
                }) { Text(t) }
            }
        }
    }
}

@Composable
private fun FilaEncontrado(r: EncontradoNav, alTocar: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = alTocar).padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(r.nombre, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (r.detalle.isNotEmpty()) {
                Text(r.detalle, style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        Column(horizontalAlignment = Alignment.End, modifier = Modifier.padding(start = 10.dp)) {
            Text(r.distancia, style = MaterialTheme.typography.bodyMedium.merge(NumerosTabulares))
            // Con solo la distancia, "la mas cercana" podia estar atras.
            if (r.atras) {
                Text(stringResource(R.string.nav_atras), style = MaterialTheme.typography.labelSmall, color = Paleta.Ambar)
            }
        }
    }
}

// Los textos de la web traen un emoji adelante ("⛽ Nearest fuel station"); aca va el icono.
private fun sinEmoji(texto: String?): String =
    texto.orEmpty().dropWhile { !it.isLetterOrDigit() }.trim()
