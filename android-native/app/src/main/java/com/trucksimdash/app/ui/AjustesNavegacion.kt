package com.trucksimdash.app.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.material3.Slider
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import java.text.NumberFormat
import kotlin.math.roundToInt
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.trucksimdash.app.R
import com.trucksimdash.app.core.Ajustes
import com.trucksimdash.app.core.Destino
import com.trucksimdash.app.core.Preferencias
import com.trucksimdash.app.core.Red
import com.trucksimdash.app.core.VOLUMEN_VOZ_MIN
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
        Spacer(Modifier.height(10.dp))
        val porciento = NumberFormat.getPercentInstance()
        Deslizador(
            stringResource(R.string.ajustes_volumen_voz, porciento.format(ajustes.volumenVoz)),
            porciento.format(VOLUMEN_VOZ_MIN), porciento.format(1), nav.t("navZoomDefault"),
            ajustes.volumenVoz.toDouble(), VOLUMEN_VOZ_MIN.toDouble()..1.0, 0.05, 1.0,
        ) {
            prefs.ponerVolumenVoz(it.toFloat())
            // Para oir como queda: la frase del boton Probar.
            if (nav.voces.isNotEmpty()) motor.probarVoz()
        }
        Text(stringResource(R.string.ajustes_volumen_voz_ayuda), style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave)
        Spacer(Modifier.height(10.dp))
        Selector(nav.t("settingsVoiceTiming"), nav.momentos, nav.momento) { motor.momentoVoz(it) }
        Spacer(Modifier.height(6.dp))
        Text(nav.t("settingsVoiceHint"), style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave)
    }
}

/** Como se ve el mapa y lo que muestra: las mismas partes de Ajustes de la web, con sus textos. */
@Composable
fun AjustesDelMapa(motor: MotorNav) {
    val nav by motor.ajustesNav.collectAsStateWithLifecycle()
    val n = nav ?: return
    Tarjeta {
        TituloSeccion(n.t("settingsMiniHudTitle").substringBefore('(').trim().trimEnd(':'))
        n.miniHud.forEach { item ->
            Row(
                Modifier.fillMaxWidth().clickable { motor.miniHud(item.id, !item.activo) },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Checkbox(checked = item.activo, onCheckedChange = null, modifier = Modifier.padding(10.dp))
                Text(item.texto, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
    Tarjeta {
        TituloSeccion(n.t("settingsRouteColorTitle").trimEnd(':'))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(top = 6.dp, bottom = 10.dp)) {
            n.colores.forEach { c ->
                val elegido = n.colorRuta.equals(c.id, ignoreCase = true)
                Box(
                    Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .background(colorDe(c.id))
                        .border(if (elegido) 3.dp else 1.dp, if (elegido) Paleta.Texto else Paleta.Borde, CircleShape)
                        .clickable(onClickLabel = c.texto) { motor.apariencia("color", c.id) }
                        .semantics { contentDescription = c.texto },
                )
            }
        }
        Deslizador(
            n.t("settingsNavZoomTitle"), n.t("navZoomFar"), n.t("navZoomNear"), n.t("navZoomDefault"),
            n.zoomNav, 8.0..13.0, 0.5, n.zoomDefecto,
        ) { motor.apariencia("zoom", it) }
        Text(n.t("settingsNavZoomHint"), style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave)
        Spacer(Modifier.height(10.dp))
        Deslizador(
            n.t("settingsTruckSizeTitle"), n.t("truckSizeNormal"), n.t("truckSizeHuge"), n.t("navZoomDefault"),
            n.tamanoCamion, 1.0..3.0, 0.25, n.tamanoDefecto,
        ) { motor.apariencia("camion", it) }
    }
    Tarjeta {
        TituloSeccion(n.t("settingsButtonsTitle").trimEnd(':'))
        FilaInterruptor(n.t("settingsFadeButtons"), null, n.desvanecerBotones) { motor.apariencia("desvanecer", it) }
        FilaInterruptor(n.t("settingsKeepCompass"), null, n.mantenerBrujula) { motor.apariencia("brujula", it) }
    }
    Tarjeta {
        TituloSeccion(n.t("settingsBaseTitle").trimEnd(':'))
        FilaInterruptor(n.t("settingsRealBase"), n.t("settingsRealBaseHint"), n.baseReal) { motor.apariencia("base", it) }
        Spacer(Modifier.height(6.dp))
        TituloSeccion(n.t("settingsLiteTitle").trimEnd(':'))
        FilaInterruptor(n.t("settingsLiteMode"), null, n.liviano) { motor.liviano(it, n.livianoSinRuteo) }
        FilaInterruptor(n.t("settingsLiteNoRouting"), n.t("settingsLiteHint"), n.livianoSinRuteo, habilitado = n.liviano) {
            motor.liviano(true, it)
        }
    }
    Tarjeta {
        TituloSeccion(n.t("settingsCurrencyTitle").trimEnd(':'))
        Selector(null, n.monedas, n.moneda) { motor.moneda(it) }
        Text(n.t("currencyHint"), style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave)
    }
}

/** Con el zoom y el camion, el mapa no se ve desde Ajustes: el numero dice como quedo. */
@Composable
private fun Deslizador(
    titulo: String,
    izquierda: String,
    derecha: String,
    defecto: String,
    valor: Double,
    rango: ClosedFloatingPointRange<Double>,
    paso: Double,
    valorDefecto: Double,
    alCambiar: (Double) -> Unit,
) {
    var arrastrando by remember { mutableStateOf<Float?>(null) }
    // Redondeado: 0,9 / 0,05 da 17,999... en coma flotante, y truncado quedaba un paso de menos.
    val pasos = ((rango.endInclusive - rango.start) / paso).roundToInt() - 1
    Text(titulo.trimEnd(':'), style = MaterialTheme.typography.labelMedium, color = Paleta.TextoSuave)
    Slider(
        value = arrastrando ?: valor.toFloat(),
        onValueChange = { arrastrando = it },
        onValueChangeFinished = {
            arrastrando?.let { alCambiar(it.toDouble()) }
            arrastrando = null
        },
        valueRange = rango.start.toFloat()..rango.endInclusive.toFloat(),
        steps = pasos,
    )
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(izquierda, style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave)
        Spacer(Modifier.weight(1f))
        Text(derecha, style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave)
    }
    if (valor != valorDefecto) TextButton(onClick = { alCambiar(valorDefecto) }) { Text(defecto) }
}

/** El panel de la web en otro aparato, con el codigo puesto, y el overlay para OBS. */
@Composable
fun OtrosDispositivos(motor: MotorNav, prefs: Preferencias) {
    val nav by motor.ajustesNav.collectAsStateWithLifecycle()
    val n = nav ?: return
    val contexto = LocalContext.current
    val codigo = (prefs.ultimoDestino as? Destino.Codigo)?.codigo
    Tarjeta {
        TituloSeccion(n.t("dashSecondDeviceTitle").trimEnd(':'))
        Text(n.t("dashConnectHint"), style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave)
        OutlinedButton(
            onClick = {
                val url = "${Red.WEB}/dash/" + if (codigo != null) "?code=$codigo" else ""
                contexto.getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Truck Dash", url))
                Toast.makeText(contexto, n.t("convoyCopied"), Toast.LENGTH_SHORT).show()
            },
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
        ) { Text(n.t("dashCopyLink")) }
        OutlinedButton(
            onClick = { abrirEnNavegador(contexto, "${Red.WEB}/overlay/?setup=1" + if (codigo != null) "&code=$codigo" else "") },
            modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
        ) { Text(n.t("obsOverlayLink")) }
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
internal fun Selector(
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
