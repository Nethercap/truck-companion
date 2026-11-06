package com.trucksimdash.app.ui

import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.trucksimdash.app.R
import com.trucksimdash.app.core.BotonPropio
import com.trucksimdash.app.core.Preferencias
import com.trucksimdash.app.core.teclaValida
import com.trucksimdash.app.nav.MotorNav
import com.trucksimdash.app.telemetria.EstadoSesion
import com.trucksimdash.app.telemetria.Fase
import com.trucksimdash.app.telemetria.SesionRepo

/** Marca de "boton nuevo" en el estado de la pantalla que edita. */
internal const val NUEVO_BOTON = -1

/** Textos de la web en el idioma del telefono: en los ocho, y sin una segunda copia. */
@Composable
internal fun textosWeb(motor: MotorNav, vararg claves: String): Map<String, String> {
    var textos by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    LaunchedEffect(Unit) { textos = motor.textos(claves.toList()) }
    return textos
}

@Composable
fun TarjetaTeclas(motor: MotorNav, alAbrir: () -> Unit) {
    val t = textosWeb(motor, "settingsCommandsTitle", "cmdRemap")
    Tarjeta {
        t["settingsCommandsTitle"]?.let { TituloSeccion(it.trimEnd(':')) }
        OutlinedButton(onClick = alAbrir, modifier = Modifier.fillMaxWidth().padding(top = 4.dp)) { Text(t["cmdRemap"].orEmpty()) }
    }
}

/**
 * Las teclas de cada comando. Viven en keybinds.json, en la PC: se piden al abrir y otra vez
 * si la conexion volvio, porque un pedido perdido dejaba la lista vacia para siempre.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TeclasScreen(estado: EstadoSesion, sesion: SesionRepo, motor: MotorNav, alVolver: () -> Unit) {
    BackHandler { alVolver() }
    val contexto = LocalContext.current
    val t = textosWeb(motor, "keybindsModalTitle", "keybindsModalExplain", "keybindsUnassigned", "save", "keybindsSavedToast", "commandNotConnectedToast")
    val delCliente by sesion.teclas.collectAsStateWithLifecycle()
    val conectada = estado.fase == Fase.Abierta
    LaunchedEffect(conectada) { if (conectada) sesion.pedirTeclas() }
    val editadas = remember { mutableStateMapOf<String, String>() }
    LaunchedEffect(delCliente) {
        // Lo que llega no pisa lo que se esta escribiendo.
        delCliente?.forEach { (accion, tecla) -> if (accion !in editadas) editadas[accion] = tecla }
    }
    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text(t["keybindsModalTitle"].orEmpty()) },
            navigationIcon = {
                IconButton(onClick = alVolver) { Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.volver)) }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = Paleta.Fondo),
        )
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(t["keybindsModalExplain"].orEmpty(), style = MaterialTheme.typography.bodyMedium, color = Paleta.TextoSuave)
            if (!conectada) {
                Text(t["commandNotConnectedToast"].orEmpty(), style = MaterialTheme.typography.bodyMedium, color = Paleta.Ambar)
            }
            ACCIONES.forEach { (accion, nombre) ->
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(stringResource(nombre), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                    OutlinedTextField(
                        value = editadas[accion].orEmpty(),
                        onValueChange = { editadas[accion] = it.take(16) },
                        placeholder = { Text(t["keybindsUnassigned"].orEmpty(), maxLines = 1) },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
            Button(
                onClick = {
                    if (sesion.guardarTeclas(ACCIONES.associate { (accion, _) -> accion to editadas[accion]?.trim() })) {
                        Toast.makeText(contexto, t["keybindsSavedToast"].orEmpty(), Toast.LENGTH_SHORT).show()
                        alVolver()
                    } else {
                        Toast.makeText(contexto, t["commandNotConnectedToast"].orEmpty(), Toast.LENGTH_SHORT).show()
                    }
                },
                enabled = conectada,
                modifier = Modifier.fillMaxWidth(),
            ) { Text(t["save"].orEmpty()) }
        }
    }
}

/** Un boton propio: la tecla la aprieta el cliente, igual que con los de fabrica. */
@Composable
fun DialogoBotonPropio(indice: Int, prefs: Preferencias, motor: MotorNav, alCerrar: () -> Unit) {
    val botones = prefs.ajustes.value.botones
    val actual = botones.getOrNull(indice)
    val t = textosWeb(motor, "customBtnModalTitle", "customBtnExplain", "customBtnLabel", "customBtnDelete", "customBtnIncomplete", "save", "close")
    var titulo by remember { mutableStateOf(actual?.titulo.orEmpty()) }
    var tecla by remember { mutableStateOf(actual?.tecla.orEmpty()) }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = alCerrar,
        containerColor = Paleta.Superficie,
        title = { Text(t["customBtnModalTitle"].orEmpty()) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(t["customBtnExplain"].orEmpty(), style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave)
                OutlinedTextField(
                    value = titulo,
                    onValueChange = { titulo = it.take(14) },
                    label = { Text(t["customBtnLabel"].orEmpty()) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = tecla,
                    onValueChange = { tecla = it.take(24) },
                    label = { Text(stringResource(R.string.boton_tecla)) },
                    placeholder = { Text("ctrl+f5") },
                    singleLine = true,
                    isError = error != null,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(stringResource(R.string.boton_tecla_ayuda), style = MaterialTheme.typography.bodySmall, color = Paleta.TextoApagado)
                error?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = Paleta.Rojo) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val limpio = tecla.trim().lowercase()
                when {
                    titulo.isBlank() || limpio.isEmpty() || !teclaValida(limpio) -> error = t["customBtnIncomplete"].orEmpty()
                    else -> {
                        val nuevo = BotonPropio(titulo.trim(), limpio)
                        prefs.ponerBotones(
                            if (actual == null) botones + nuevo else botones.toMutableList().also { it[indice] = nuevo },
                        )
                        alCerrar()
                    }
                }
            }) { Text(t["save"].orEmpty()) }
        },
        dismissButton = {
            Row {
                if (actual != null) {
                    TextButton(onClick = {
                        prefs.ponerBotones(botones.toMutableList().also { it.removeAt(indice) })
                        alCerrar()
                    }) { Text(t["customBtnDelete"].orEmpty(), color = Paleta.Rojo) }
                }
                TextButton(onClick = alCerrar) { Text(t["close"].orEmpty()) }
            }
        },
    )
}
