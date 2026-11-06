package com.trucksimdash.app.ui

import android.content.Intent
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.trucksimdash.app.R
import com.trucksimdash.app.nav.EstadoConvoy
import com.trucksimdash.app.nav.HistorialViajes
import com.trucksimdash.app.nav.MotorNav
import com.trucksimdash.app.nav.TarjetaConvoy
import java.text.DateFormat
import java.util.Date

internal fun colorDe(hex: String): Color =
    runCatching { Color(android.graphics.Color.parseColor(hex)) }.getOrDefault(Color.Gray)

@Composable
private fun Punto(color: String) {
    Box(Modifier.size(10.dp).background(colorDe(color), CircleShape))
}

@Composable
private fun FilaTilde(texto: String, valor: Boolean, alCambiar: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable { alCambiar(!valor) }.padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(checked = valor, onCheckedChange = null, modifier = Modifier.padding(12.dp))
        Text(texto, style = MaterialTheme.typography.bodyMedium)
    }
}

/** La ventana del convoy de la web: entrar o crear, y adentro los miembros y lo que se puede hacer. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConvoyScreen(motor: MotorNav, apodoGuardado: String, codigoInicial: String? = null, alVolver: () -> Unit) {
    BackHandler { alVolver() }
    val convoy by motor.convoy.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { motor.pedirConvoy() }
    val c = convoy
    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text(c?.t("convoyTitle") ?: stringResource(R.string.convoy)) },
            navigationIcon = {
                IconButton(onClick = alVolver) { Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.volver)) }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = Paleta.Fondo),
        )
        if (c == null) return@Column
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (c.enSala) Adentro(c, motor, alVolver) else Afuera(c, motor, apodoGuardado, codigoInicial)
        }
    }
}

@Composable
private fun Afuera(c: EstadoConvoy, motor: MotorNav, apodoGuardado: String, codigoInicial: String?) {
    var apodo by rememberSaveable { mutableStateOf(c.apodo.ifEmpty { apodoGuardado }) }
    var codigo by rememberSaveable { mutableStateOf(codigoInicial.orEmpty()) }
    var avisar by rememberSaveable { mutableStateOf(false) }
    val puede = c.disponible && c.conectado

    Text(c.t("convoyIntro"), style = MaterialTheme.typography.bodyMedium, color = Paleta.TextoSuave)
    c.aviso?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = Paleta.Ambar) }
    if (c.disponible && !c.conectado) {
        Text(c.t("convoyNotConnected"), style = MaterialTheme.typography.bodyMedium, color = Paleta.Ambar)
    }
    Tarjeta {
        OutlinedTextField(
            value = apodo,
            onValueChange = { apodo = it.take(16) },
            label = { Text(c.t("convoyNickLabel")) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        FilaTilde(c.t("convoyShareIncome"), c.compartirIngresos) { motor.convoyIngresos(it) }
    }
    Tarjeta {
        TituloSeccion(c.t("convoyCreateTitle").trimEnd(':'))
        FilaTilde(c.t("convoyPostSummary"), avisar) { avisar = it }
        Button(onClick = { motor.convoyEntrar("create", "", apodo, avisar) }, enabled = puede, modifier = Modifier.fillMaxWidth()) {
            Text(c.t("convoyCreate"))
        }
    }
    Tarjeta {
        TituloSeccion(c.t("convoyJoinTitle").trimEnd(':'))
        OutlinedTextField(
            value = codigo,
            onValueChange = { v -> codigo = v.uppercase().filter { it in 'A'..'Z' }.take(6) },
            label = { Text("CODE") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(8.dp))
        OutlinedButton(onClick = { motor.convoyEntrar("join", codigo, apodo, false) }, enabled = puede, modifier = Modifier.fillMaxWidth()) {
            Text(c.t("convoyJoin"))
        }
    }
    Text(c.t("convoyPrivacyHint"), style = MaterialTheme.typography.bodySmall, color = Paleta.TextoApagado)
}

@Composable
private fun Adentro(c: EstadoConvoy, motor: MotorNav, alVolver: () -> Unit) {
    val contexto = LocalContext.current
    Tarjeta {
        Text(c.codigo.orEmpty(), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        c.enlace?.let { enlace ->
            TextButton(onClick = {
                val mandar = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, enlace)
                contexto.startActivity(Intent.createChooser(mandar, null))
            }) { Text(c.t("convoyCopyLink")) }
        }
        Text(c.espectadores, style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave)
    }
    Tarjeta {
        c.miembros.forEach { m ->
            Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Punto(m.color)
                Text(
                    m.nombre,
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(start = 8.dp).weight(1f, fill = false),
                )
                if (m.lider) {
                    Text(
                        c.t("convoyLeaderTag"),
                        style = MaterialTheme.typography.labelSmall,
                        color = Paleta.Ambar,
                        modifier = Modifier.padding(start = 6.dp),
                    )
                }
                Spacer(Modifier.weight(1f))
                Text(m.estado, style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave)
                if (c.soyLider && !m.yo) {
                    TextButton(onClick = { motor.convoyEchar(m.id) }) { Text(c.t("convoyKick")) }
                }
            }
        }
    }
    Tarjeta {
        FilaTilde(c.t("convoyShareIncome"), c.compartirIngresos) { motor.convoyIngresos(it) }
        FilaTilde(c.t("convoyShowMarkers"), c.mostrarMarcas) { motor.convoyMarcas(it) }
        FilaTilde(c.t("convoyMute"), c.silencio) { motor.convoySilencio(it) }
    }
    OutlinedButton(
        onClick = {
            motor.convoySalir()
            alVolver()
        },
        modifier = Modifier.fillMaxWidth(),
    ) { Text(c.t("convoyLeave")) }
    if (c.soyLider) {
        TextButton(
            onClick = {
                motor.convoyTerminar()
                alVolver()
            },
            modifier = Modifier.fillMaxWidth(),
        ) { Text(c.t("convoyCloseConvoy"), color = Paleta.Rojo) }
    }
}

/** El carrusel de la web, en chico: en un telefono el mapa no se puede tapar con tarjetas enteras. */
@Composable
fun TarjetasConvoy(c: EstadoConvoy, alTocar: (String) -> Unit) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        items(c.tarjetas, key = { it.id }) { t ->
            Surface(
                shape = MaterialTheme.shapes.small,
                color = Paleta.Fondo.copy(alpha = 0.88f),
                modifier = Modifier.clickable { alTocar(t.id) },
            ) {
                Column(Modifier.padding(horizontal = 10.dp, vertical = 6.dp).widthIn(max = 200.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Punto(t.color)
                        Text(
                            t.nombre,
                            style = MaterialTheme.typography.labelMedium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.padding(start = 6.dp),
                        )
                    }
                    val abajo = t.nota ?: t.estado
                    if (abajo.isNotEmpty()) {
                        Text(abajo, style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
    }
}

/** Una tarjeta entera, con los botones de seguir al lider. */
@Composable
fun DetalleConvoy(c: EstadoConvoy, t: TarjetaConvoy, motor: MotorNav, alCerrar: () -> Unit) {
    AlertDialog(
        onDismissRequest = alCerrar,
        containerColor = Paleta.Superficie,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Punto(t.color)
                Text(t.nombre, modifier = Modifier.padding(start = 8.dp))
            }
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                listOfNotNull(if (t.lider) c.t("convoyLeaderTag") else null, t.variante, t.estado.ifEmpty { null }).joinToString(" · ")
                    .takeIf { it.isNotEmpty() }
                    ?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = Paleta.Ambar) }
                t.nota?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
                t.filas.forEach { (etiqueta, valor) ->
                    Row(Modifier.fillMaxWidth()) {
                        Text(etiqueta, style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave, modifier = Modifier.weight(1f))
                        Text(valor, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1.4f))
                    }
                }
                if (t.puedeSeguir) {
                    Spacer(Modifier.height(4.dp))
                    OutlinedButton(onClick = { motor.convoySeguir(!c.siguiendo) }, modifier = Modifier.fillMaxWidth()) {
                        Text(c.t(if (c.siguiendo) "convoyUnfollow" else "convoyFollow"))
                    }
                    OutlinedButton(onClick = { motor.convoyVerRuta(!c.rutaLider) }, modifier = Modifier.fillMaxWidth()) {
                        Text(c.t(if (c.rutaLider) "convoyHideRoute" else "convoyShowRoute"))
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = alCerrar) { Text(c.t("close")) } },
    )
}

/** Las entregas de este telefono, como en la web. Las de la cuenta estan en Stats. */
@Composable
fun TarjetaHistorial(motor: MotorNav) {
    var historial by remember { mutableStateOf<HistorialViajes?>(null) }
    var version by remember { mutableStateOf(0) }
    LaunchedEffect(version) { historial = motor.viajes() }
    val h = historial ?: return
    Tarjeta {
        TituloSeccion(h.titulo)
        if (h.lista.isEmpty()) {
            Text(h.vacio, style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave)
            return@Tarjeta
        }
        val fecha = remember { DateFormat.getDateInstance(DateFormat.MEDIUM) }
        h.lista.forEach { v ->
            Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Column(Modifier.weight(1f).padding(end = 8.dp)) {
                    Text(v.ruta, style = MaterialTheme.typography.bodyMedium)
                    Text(v.detalle, style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave)
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(v.pago, style = MaterialTheme.typography.bodyMedium)
                    Text(
                        listOfNotNull(fecha.format(Date(v.cuandoMs)), v.juego).joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = Paleta.TextoSuave,
                    )
                }
            }
        }
        TextButton(onClick = {
            motor.borrarViajes()
            version++
        }) { Text(h.borrar) }
    }
}
