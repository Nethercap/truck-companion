package com.trucksimdash.app.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
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
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.trucksimdash.app.R
import com.trucksimdash.app.nav.FormularioReporte
import com.trucksimdash.app.nav.MotorNav

private const val DISCORD = "https://discord.gg/K7Xq4628tg"

/** Reportar un problema de navegacion: la ventana de la web. Se manda sin cuenta. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReporteScreen(motor: MotorNav, alVolver: () -> Unit) {
    BackHandler { alVolver() }
    var formulario by remember { mutableStateOf<FormularioReporte?>(null) }
    LaunchedEffect(Unit) { formulario = motor.abrirReporte() }
    val f = formulario
    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text(f?.t("navReportOpen").orEmpty(), maxLines = 1) },
            navigationIcon = {
                IconButton(onClick = alVolver) { Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.volver)) }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = Paleta.Fondo),
        )
        if (f != null) Formulario(f, motor)
    }
}

@Composable
private fun Formulario(f: FormularioReporte, motor: MotorNav) {
    val contexto = LocalContext.current
    val estado by motor.reporte.collectAsStateWithLifecycle()
    var tipo by rememberSaveable { mutableStateOf<String?>(null) }
    var descripcion by rememberSaveable { mutableStateOf("") }
    var verDatos by rememberSaveable { mutableStateOf(false) }
    val mandado = estado?.estado == "mandado"
    val mandando = estado?.estado == "mandando"

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(f.t("navReportIntro"), style = MaterialTheme.typography.bodyMedium, color = Paleta.TextoSuave)
        if (!f.hayAvisos) {
            Tarjeta {
                Text(f.t("navReportOnlyNav"), style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave)
                TextButton(onClick = { abrirEnNavegador(contexto, DISCORD) }) { Text("Discord") }
            }
        }
        Tarjeta {
            TituloSeccion(f.t("navReportKindLabel"))
            f.tipos.forEach { o ->
                Row(
                    Modifier.fillMaxWidth().clickable { tipo = o.id },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(selected = tipo == o.id, onClick = null, modifier = Modifier.padding(12.dp))
                    Text(o.texto, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
        OutlinedTextField(
            value = descripcion,
            onValueChange = { descripcion = it.take(f.maximo) },
            label = { Text(f.t("navReportDescLabel")) },
            placeholder = { Text(f.t("navReportDescPlaceholder")) },
            minLines = 3,
            modifier = Modifier.fillMaxWidth(),
        )
        TextButton(onClick = { verDatos = !verDatos }) { Text(f.t("navReportShowData")) }
        if (verDatos) {
            Tarjeta {
                Text(
                    f.reporte,
                    style = MaterialTheme.typography.bodySmall,
                    fontFamily = FontFamily.Monospace,
                    color = Paleta.TextoSuave,
                )
            }
        }
        estado?.let { e ->
            Text(e.texto, style = MaterialTheme.typography.bodyMedium, color = if (mandado) Paleta.Texto else Paleta.TextoSuave)
        }
        Button(
            onClick = { motor.mandarReporte(tipo, descripcion) },
            enabled = !mandado && !mandando,
            modifier = Modifier.fillMaxWidth(),
        ) { Text(estado?.boton ?: f.t("navReportSend")) }
        // Si no sale (sin internet), queda copiarlo y pegarlo en Discord, como antes.
        if (estado?.estado == "fallo") {
            OutlinedButton(
                onClick = {
                    contexto.getSystemService(ClipboardManager::class.java)
                        .setPrimaryClip(ClipData.newPlainText("Truck Dash", f.reporte))
                    Toast.makeText(contexto, f.t("turnReportCopied"), Toast.LENGTH_SHORT).show()
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text(f.t("turnReportCopy")) }
        }
    }
}
