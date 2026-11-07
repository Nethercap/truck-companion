package com.trucksimdash.app.ui

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.window.DialogProperties
import com.trucksimdash.app.R
import com.trucksimdash.app.core.Fallos
import kotlinx.coroutines.launch

/**
 * Sale antes de arrancar la app, sin nada de ella detras: si lo que se cierra es el arranque, es
 * la unica forma de contarlo. Compartir no sigue solo: la app recien arranca al volver de elegir
 * a quien, y si se vuelve a cerrar no se lleva puesto el archivo que se esta mandando.
 */
@Composable
internal fun AvisoDeFallo(fallos: Fallos, alSeguir: () -> Unit) {
    val contexto = LocalContext.current
    val alcance = rememberCoroutineScope()
    AlertDialog(
        onDismissRequest = alSeguir,
        properties = DialogProperties(dismissOnClickOutside = false),
        title = { Text(stringResource(R.string.fallo_titulo)) },
        text = { Text(stringResource(R.string.fallo_texto)) },
        confirmButton = {
            TextButton(onClick = { alcance.launch { compartirTexto(contexto, fallos.informe(), "truckdash-report.txt") } }) {
                Text(stringResource(R.string.compartir))
            }
        },
        dismissButton = { TextButton(onClick = alSeguir) { Text(stringResource(R.string.fallo_seguir)) } },
    )
}
