package com.trucksimdash.app.ui

import android.os.Build
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringArrayResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.trucksimdash.app.R
import com.trucksimdash.app.core.Ajustes
import com.trucksimdash.app.core.Destino
import com.trucksimdash.app.core.Preferencias
import com.trucksimdash.app.core.relojDelJuego
import com.trucksimdash.app.core.usaMillas
import com.trucksimdash.app.nav.AvisoVersion
import com.trucksimdash.app.nav.MotorNav
import com.trucksimdash.app.telemetria.EstadoSesion
import com.trucksimdash.app.telemetria.Fase
import com.trucksimdash.app.telemetria.SesionRepo

/** Que mostrar segun como viene la conexion. */
@Composable
fun PanelScreen(
    estado: EstadoSesion,
    ajustes: Ajustes,
    sesion: SesionRepo,
    guardado: Destino?,
    apaisado: Boolean,
    motor: MotorNav,
    prefs: Preferencias,
    alVerMapaEnVivo: () -> Unit,
    alAjustes: () -> Unit,
) {
    var botonEditado by rememberSaveable { mutableStateOf<Int?>(null) }
    botonEditado?.let { DialogoBotonPropio(it, prefs, motor) { botonEditado = null } }
    val t = estado.telemetria
    // Un corte de red corto no tapa el tablero: queda lo ultimo con el aviso arriba.
    val cortada = estado.fase == Fase.Reintentando || estado.fase == Fase.Conectando
    when {
        estado.fase == Fase.Apagada || estado.fase == Fase.CodigoInvalido ->
            ConectarContenido(estado, sesion, guardado, motor, alVerMapaEnVivo, alAjustes)
        t != null && (estado.enVivo || cortada) -> TableroContenido(estado, ajustes, sesion, apaisado, { botonEditado = it }, motor, alAjustes)
        else -> EsperandoContenido(estado, sesion, alAjustes)
    }
}

/** En vivo o no, la hora del juego y los ajustes, siempre a la vista. */
@Composable
private fun BarraEstado(estado: EstadoSesion, alAjustes: () -> Unit) {
    val t = estado.telemetria
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        when {
            !estado.enVivo -> Pildora(textoEspera(estado), Paleta.Ambar)
            t?.pausado == true -> Pildora(stringResource(R.string.pausado), Paleta.Ambar)
            else -> Pildora(stringResource(R.string.en_vivo), Paleta.Verde)
        }
        Spacer(Modifier.weight(1f))
        t?.relojMinutos?.let { minutos ->
            val (dia, hora) = relojDelJuego(minutos)
            Text(
                stringArrayResource(R.array.dias_semana)[dia] + " " + hora,
                style = MaterialTheme.typography.labelLarge.merge(NumerosTabulares),
                color = Paleta.TextoSuave,
            )
        }
        BotonAjustes(alAjustes)
    }
}

@Composable
fun BotonAjustes(alAjustes: () -> Unit, modifier: Modifier = Modifier) {
    IconButton(onClick = alAjustes, modifier = modifier) {
        Icon(Icons.Filled.Settings, stringResource(R.string.ajustes), tint = Paleta.TextoSuave)
    }
}

/** Que es una demo, con su salida a la vista, y que el cliente de la PC tiene otra version. */
@Composable
private fun AvisosTablero(estado: EstadoSesion, sesion: SesionRepo, motor: MotorNav, version: AvisoVersion?) {
    val contexto = LocalContext.current
    var cerrado by rememberSaveable { mutableStateOf(false) }
    if (estado.demo) {
        val salir = textosWeb(motor, "exitDemo")["exitDemo"].orEmpty()
        AvisoConBoton("Demo", salir) { sesion.desconectar() }
    }
    if (version != null && !cerrado) {
        AvisoConBoton(version.texto, version.boton, alCerrar = { cerrado = true }) { abrirEnNavegador(contexto, version.url) }
    }
}

@Composable
private fun TableroContenido(
    estado: EstadoSesion,
    ajustes: Ajustes,
    sesion: SesionRepo,
    apaisado: Boolean,
    alEditarBoton: (Int) -> Unit,
    motor: MotorNav,
    alAjustes: () -> Unit,
) {
    val t = estado.telemetria ?: return
    val nav by motor.estado.collectAsStateWithLifecycle()
    val trazos by motor.trazos.collectAsStateWithLifecycle()
    val millas = usaMillas(ajustes.unidades, t.juego)
    if (apaisado) {
        Row(Modifier.fillMaxSize().padding(12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(
                Modifier.weight(1f).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                BarraEstado(estado, alAjustes)
                AvisosTablero(estado, sesion, motor, nav.actualizarCliente)
                BloqueManejo(t, millas, compacto = true)
                FilaTestigos(t)
            }
            Column(
                Modifier.weight(1f).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                TarjetaNav(nav, trazos)
                BloqueViaje(t, millas)
                BloqueComandos(
                    t,
                    { sesion.enviarComando(it) },
                    porFila = 4,
                    propios = ajustes.botones,
                    alApretarPropio = { sesion.enviarTecla(it) },
                    alEditarPropio = { alEditarBoton(it ?: NUEVO_BOTON) },
                )
                BloqueTrabajo(t, millas)
                BloqueCamion(t, millas)
            }
        }
    } else {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            BarraEstado(estado, alAjustes)
            AvisosTablero(estado, sesion, motor, nav.actualizarCliente)
            TarjetaNav(nav, trazos)
            BloqueManejo(t, millas)
            FilaTestigos(t)
            BloqueViaje(t, millas)
            BloqueComandos(
                t,
                { sesion.enviarComando(it) },
                propios = ajustes.botones,
                alApretarPropio = { sesion.enviarTecla(it) },
                alEditarPropio = { alEditarBoton(it ?: NUEVO_BOTON) },
            )
            BloqueTrabajo(t, millas)
            BloqueCamion(t, millas)
        }
    }
}

@Composable
private fun EsperandoContenido(estado: EstadoSesion, sesion: SesionRepo, alAjustes: () -> Unit) {
    Box(Modifier.fillMaxSize()) {
        BotonAjustes(alAjustes, Modifier.align(Alignment.TopEnd))
        Column(
            Modifier.fillMaxSize().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            CircularProgressIndicator(strokeWidth = 3.dp)
            Spacer(Modifier.height(20.dp))
            Text(textoEspera(estado), style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(6.dp))
            Text(
                ayudaEspera(estado),
                style = MaterialTheme.typography.bodyMedium,
                color = Paleta.TextoSuave,
                modifier = Modifier.widthIn(max = 340.dp),
            )
            Spacer(Modifier.height(20.dp))
            OutlinedButton(onClick = { sesion.desconectar() }) { Text(stringResource(R.string.desconectar)) }
        }
    }
}

@Composable
fun textoEspera(e: EstadoSesion): String = stringResource(
    when {
        e.fase == Fase.Conectando -> R.string.conectando
        e.fase == Fase.Reintentando -> R.string.reconectando
        !e.pcConectada -> R.string.esperando_pc
        else -> R.string.esperando_juego
    },
)

@Composable
private fun ayudaEspera(e: EstadoSesion): String = when {
    e.fase != Fase.Abierta -> stringResource(R.string.ayuda_conectando)
    !e.pcConectada -> stringResource(R.string.ayuda_esperando_pc)
    else -> e.detallePc ?: stringResource(R.string.ayuda_esperando_juego)
}

private enum class ModoAlta { Codigo, Lan }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ConectarContenido(
    estado: EstadoSesion,
    sesion: SesionRepo,
    guardado: Destino?,
    motor: MotorNav,
    alVerMapaEnVivo: () -> Unit,
    alAjustes: () -> Unit,
) {
    var modo by rememberSaveable { mutableIntStateOf(if (guardado is Destino.Lan) ModoAlta.Lan.ordinal else ModoAlta.Codigo.ordinal) }
    var codigo by rememberSaveable { mutableStateOf((guardado as? Destino.Codigo)?.codigo ?: "") }
    var host by rememberSaveable { mutableStateOf((guardado as? Destino.Lan)?.host ?: "") }

    fun conectar() {
        if (modo == ModoAlta.Codigo.ordinal) sesion.conectarCodigo(codigo) else sesion.conectarLan(host)
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(Modifier.widthIn(max = 460.dp).fillMaxWidth()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    stringResource(R.string.conectar_titulo),
                    style = MaterialTheme.typography.headlineMedium,
                    modifier = Modifier.weight(1f),
                )
                BotonAjustes(alAjustes)
            }
            Spacer(Modifier.height(6.dp))
            Text(
                stringResource(R.string.conectar_ayuda),
                style = MaterialTheme.typography.bodyMedium,
                color = Paleta.TextoSuave,
            )
            Spacer(Modifier.height(20.dp))
            Tarjeta {
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    SegmentedButton(
                        selected = modo == ModoAlta.Codigo.ordinal,
                        onClick = { modo = ModoAlta.Codigo.ordinal },
                        shape = SegmentedButtonDefaults.itemShape(0, 2),
                        label = { Text(stringResource(R.string.modo_codigo)) },
                    )
                    SegmentedButton(
                        selected = modo == ModoAlta.Lan.ordinal,
                        onClick = { modo = ModoAlta.Lan.ordinal },
                        shape = SegmentedButtonDefaults.itemShape(1, 2),
                        label = { Text(stringResource(R.string.modo_lan)) },
                    )
                }
                Spacer(Modifier.height(14.dp))
                if (modo == ModoAlta.Codigo.ordinal) {
                    OutlinedTextField(
                        value = codigo,
                        onValueChange = { codigo = it.uppercase().filter { c -> c.isLetterOrDigit() } },
                        label = { Text(stringResource(R.string.codigo_pc)) },
                        singleLine = true,
                        isError = estado.fase == Fase.CodigoInvalido,
                        supportingText = {
                            Text(
                                stringResource(
                                    if (estado.fase == Fase.CodigoInvalido) R.string.codigo_invalido else R.string.codigo_ayuda,
                                ),
                            )
                        },
                        keyboardOptions = KeyboardOptions(
                            capitalization = KeyboardCapitalization.Characters,
                            autoCorrectEnabled = false,
                            imeAction = ImeAction.Go,
                        ),
                        keyboardActions = KeyboardActions(onGo = { conectar() }),
                        modifier = Modifier.fillMaxWidth(),
                    )
                } else {
                    OutlinedTextField(
                        value = host,
                        onValueChange = { host = it.trim() },
                        label = { Text(stringResource(R.string.ip_pc)) },
                        placeholder = { Text("192.168.0.20") },
                        singleLine = true,
                        supportingText = { Text(stringResource(R.string.lan_ayuda)) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Go),
                        keyboardActions = KeyboardActions(onGo = { conectar() }),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                Spacer(Modifier.height(10.dp))
                Button(
                    onClick = { conectar() },
                    enabled = if (modo == ModoAlta.Codigo.ordinal) codigo.isNotBlank() else host.isNotBlank(),
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                ) { Text(stringResource(R.string.conectar)) }
            }
            Spacer(Modifier.height(12.dp))
            TextButton(onClick = alVerMapaEnVivo, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.ver_mapa_sin_juego))
            }
            val demo = textosWeb(motor, "emptyDemoLink")["emptyDemoLink"]
            if (demo != null) {
                TextButton(onClick = { sesion.empezarDemo() }, modifier = Modifier.fillMaxWidth()) { Text(demo) }
            }
        }
    }
}

/** El nombre con que este telefono aparece en la lista de dispositivos de la cuenta. */
fun nombreDispositivo(): String = "Truck Dash Android (${Build.MODEL})"
