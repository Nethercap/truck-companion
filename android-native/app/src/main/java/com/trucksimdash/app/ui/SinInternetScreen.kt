package com.trucksimdash.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.trucksimdash.app.R
import com.trucksimdash.app.mapa.CatalogoMapas
import com.trucksimdash.app.mapa.MapasSinInternet

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SinInternetScreen(catalogo: CatalogoMapas, mapas: MapasSinInternet, alVolver: () -> Unit) {
    BackHandler { alVolver() }
    val estado by mapas.estado.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text(stringResource(R.string.sin_internet_titulo)) },
            navigationIcon = {
                IconButton(onClick = alVolver) { Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.volver)) }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = Paleta.Fondo),
        )
        LazyColumn(
            Modifier.fillMaxSize().padding(horizontal = 12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            item {
                Text(
                    stringResource(R.string.sin_internet_ayuda),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Paleta.TextoSuave,
                    modifier = Modifier.padding(bottom = 6.dp),
                )
            }
            items(catalogo.publicadas.sortedBy { it.nombre }, key = { it.id }) { v ->
                val e = estado[v.id]
                val guardados = mapas.bajado(v)
                Tarjeta {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f).padding(end = 8.dp)) {
                            Text(v.nombre, style = MaterialTheme.typography.bodyMedium)
                            when {
                                e?.progreso != null -> LinearProgressIndicator(
                                    progress = { e.progreso },
                                    modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
                                )
                                e?.error == true -> Text(
                                    stringResource(R.string.sin_internet_error),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Paleta.Rojo,
                                )
                                guardados > 0 -> Text(
                                    stringResource(R.string.sin_internet_listo, (guardados / (1024 * 1024)).toInt()),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Paleta.Verde,
                                )
                            }
                        }
                        when {
                            e?.progreso != null -> Unit
                            guardados > 0 -> TextButton(onClick = { mapas.borrar(v) }) { Text(stringResource(R.string.sin_internet_borrar)) }
                            else -> OutlinedButton(onClick = { mapas.bajar(v) }) { Text(stringResource(R.string.sin_internet_bajar)) }
                        }
                    }
                }
            }
        }
    }
}
