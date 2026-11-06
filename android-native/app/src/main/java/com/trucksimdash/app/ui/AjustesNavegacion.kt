package com.trucksimdash.app.ui

import androidx.compose.foundation.clickable
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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.trucksimdash.app.R
import com.trucksimdash.app.core.Ajustes
import com.trucksimdash.app.core.Preferencias
import com.trucksimdash.app.nav.AjustesNav
import com.trucksimdash.app.nav.MotorNav
import com.trucksimdash.app.nav.OpcionNav

/** La voz y la ruta: lo que en la web son esas partes de Ajustes, con sus mismos textos. */
@Composable
fun AjustesNavegacion(ajustes: Ajustes, prefs: Preferencias, motor: MotorNav, alReportar: () -> Unit) {
    val nav by motor.ajustesNav.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { motor.pedirAjustes() }
    TarjetaVoz(ajustes, prefs, motor, nav)
    nav?.let { TarjetaRuta(it, motor, alReportar) }
}

@Composable
private fun TarjetaVoz(ajustes: Ajustes, prefs: Preferencias, motor: MotorNav, nav: AjustesNav?) {
    Tarjeta {
        nav?.let { TituloSeccion(it.t("settingsVoiceTitle").trimEnd(':')) }
        FilaInterruptor(stringResource(R.string.ajustes_voz), stringResource(R.string.ajustes_voz_ayuda), ajustes.voz) {
            prefs.ponerVoz(it)
            motor.ponerVoz(it)
        }
        if (nav == null) return@Tarjeta
        if (nav.voces.isNotEmpty()) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Selector(null, nav.voces, nav.voz, Modifier.weight(1f)) { motor.elegirVoz(it) }
                OutlinedButton(onClick = { motor.probarVoz() }) { Text(nav.t("settingsVoiceTest")) }
            }
        }
        Selector(nav.t("settingsVoiceTiming"), nav.momentos, nav.momento) { motor.momentoVoz(it) }
        Spacer(Modifier.height(6.dp))
        Text(nav.t("settingsVoiceHint"), style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave)
    }
}

/** El perfil y los DLC valen para toda la sesion: la web los manda a los otros dispositivos. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TarjetaRuta(nav: AjustesNav, motor: MotorNav, alReportar: () -> Unit) {
    var dlcAbierto by remember { mutableStateOf(false) }
    Tarjeta {
        TituloSeccion(stringResource(R.string.ajustes_perfil))
        val opciones = listOf("fastest" to R.string.perfil_rapida, "shortest" to R.string.perfil_corta)
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            opciones.forEachIndexed { i, (valor, nombre) ->
                SegmentedButton(
                    selected = nav.perfil == valor,
                    onClick = { motor.perfilRuta(valor) },
                    shape = SegmentedButtonDefaults.itemShape(i, opciones.size),
                    label = { Text(stringResource(nombre)) },
                )
            }
        }
        OutlinedButton(onClick = { dlcAbierto = true }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
            Text(nav.t("dlcTitle"))
        }
        Spacer(Modifier.height(8.dp))
        FilaInterruptor(nav.t("settingsEveryExit"), nav.t("settingsEveryExitHint"), nav.cadaSalida) { motor.cadaSalida(it) }
        Selector(nav.t("settingsRestWarn"), nav.descansos, nav.descanso) { motor.avisoDescanso(it) }
        Spacer(Modifier.height(6.dp))
        Text(nav.t("settingsRestWarnHint"), style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave)
        TextButton(onClick = alReportar, modifier = Modifier.padding(top = 4.dp)) { Text(nav.t("navReportOpen")) }
    }
    if (dlcAbierto) DialogoDlc(nav, motor) { dlcAbierto = false }
}

@Composable
private fun Selector(
    titulo: String?,
    opciones: List<OpcionNav>,
    elegida: String?,
    modifier: Modifier = Modifier,
    alElegir: (String) -> Unit,
) {
    var abierto by remember { mutableStateOf(false) }
    Column(modifier.padding(vertical = 4.dp)) {
        if (titulo != null) Text(titulo, style = MaterialTheme.typography.labelMedium, color = Paleta.TextoSuave)
        OutlinedButton(onClick = { abierto = true }, modifier = Modifier.fillMaxWidth().padding(top = 4.dp)) {
            Text(opciones.firstOrNull { it.id == elegida }?.texto.orEmpty(), maxLines = 1)
        }
        DropdownMenu(expanded = abierto, onDismissRequest = { abierto = false }) {
            opciones.forEach { o ->
                DropdownMenuItem(
                    text = { Text(o.texto) },
                    onClick = {
                        abierto = false
                        if (o.id != elegida) alElegir(o.id)
                    },
                )
            }
        }
    }
}

@Composable
private fun DialogoDlc(nav: AjustesNav, motor: MotorNav, alCerrar: () -> Unit) {
    AlertDialog(
        onDismissRequest = alCerrar,
        containerColor = Paleta.Superficie,
        title = { Text(nav.t("dlcTitle")) },
        confirmButton = { TextButton(onClick = alCerrar) { Text(nav.t("close")) } },
        text = {
            LazyColumn(Modifier.heightIn(max = 460.dp)) {
                item {
                    Text(nav.t("dlcHint"), style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave)
                    FilaOpcion(nav.t("dlcAutoLabel"), nav.dlcAuto) { motor.dlcAutomatico(true) }
                    Text(
                        nav.dlcEstado,
                        style = MaterialTheme.typography.bodySmall,
                        color = Paleta.TextoApagado,
                        modifier = Modifier.padding(start = 48.dp),
                    )
                    FilaOpcion(nav.t("modsManualLabel"), !nav.dlcAuto) { motor.dlcAutomatico(false) }
                }
                nav.dlc.forEach { juego ->
                    item {
                        Text(
                            juego.titulo,
                            style = MaterialTheme.typography.labelLarge,
                            color = Paleta.TextoSuave,
                            modifier = Modifier.padding(top = 12.dp, bottom = 2.dp),
                        )
                    }
                    items(juego.lista, key = { "${juego.juego}/${it.id}" }) { d ->
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clickable(enabled = !nav.dlcAuto) { motor.dlcActivo(juego.juego, d.id, !d.activo) },
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Checkbox(checked = d.activo, onCheckedChange = null, enabled = !nav.dlcAuto, modifier = Modifier.padding(12.dp))
                            Text(d.nombre, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            }
        },
    )
}

@Composable
private fun FilaOpcion(texto: String, elegida: Boolean, alTocar: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = alTocar), verticalAlignment = Alignment.CenterVertically) {
        RadioButton(selected = elegida, onClick = null, modifier = Modifier.padding(12.dp))
        Text(texto, style = MaterialTheme.typography.bodyMedium)
    }
}
