package com.trucksimdash.app.ui

import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.trucksimdash.app.BuildConfig
import com.trucksimdash.app.R
import com.trucksimdash.app.core.Ajustes
import com.trucksimdash.app.core.Preferencias
import com.trucksimdash.app.core.Red
import com.trucksimdash.app.core.Unidades
import com.trucksimdash.app.mapa.CatalogoMapas
import com.trucksimdash.app.nav.AjustesNav
import com.trucksimdash.app.nav.MotorNav
import com.trucksimdash.app.telemetria.EstadoSesion
import com.trucksimdash.app.telemetria.Fase
import com.trucksimdash.app.telemetria.SesionRepo

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AjustesScreen(
    estado: EstadoSesion,
    ajustes: Ajustes,
    prefs: Preferencias,
    sesion: SesionRepo,
    motor: MotorNav,
    catalogo: CatalogoMapas,
    alReportar: () -> Unit,
    alTeclas: () -> Unit,
    alMapasSinInternet: () -> Unit,
    alVolver: () -> Unit,
) {
    BackHandler { alVolver() }
    val nav by motor.ajustesNav.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text(stringResource(R.string.ajustes)) },
            navigationIcon = {
                IconButton(onClick = alVolver) { Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.volver)) }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = Paleta.Fondo),
        )
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            TarjetaConexion(estado, sesion)
            TarjetaCompartir(estado, ajustes, prefs, sesion, nav, motor)
            AjustesNavegacion(ajustes, prefs, motor, alReportar)
            AjustesDelMapa(motor)
            TarjetaTeclas(motor, alTeclas)
            TarjetaHistorial(motor)
            TarjetaUnidades(ajustes, prefs, nav, motor)
            TarjetaPantalla(ajustes, prefs)
            TarjetaMapaManual(prefs, catalogo, alMapasSinInternet)
            OtrosDispositivos(motor, prefs)
            if (BuildConfig.DEBUG) TarjetaPruebas(prefs)
            TarjetaAcerca()
        }
    }
}

@Composable
private fun TarjetaConexion(estado: EstadoSesion, sesion: SesionRepo) {
    if (estado.fase == Fase.Apagada) return
    Tarjeta {
        TituloSeccion(stringResource(R.string.ajustes_conexion))
        Text(
            when {
                estado.enVivo -> stringResource(R.string.estado_en_vivo)
                else -> textoEspera(estado)
            },
            style = MaterialTheme.typography.bodyMedium,
            color = Paleta.TextoSuave,
        )
        Spacer(Modifier.height(10.dp))
        OutlinedButton(onClick = { sesion.desconectar() }) { Text(stringResource(R.string.desconectar)) }
    }
}

@Composable
internal fun FilaInterruptor(titulo: String, ayuda: String?, valor: Boolean, habilitado: Boolean = true, alCambiar: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f).padding(end = 12.dp)) {
            Text(titulo, style = MaterialTheme.typography.bodyLarge)
            if (ayuda != null) Text(ayuda, style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave)
        }
        Switch(checked = valor, onCheckedChange = alCambiar, enabled = habilitado)
    }
}

@Composable
private fun TarjetaCompartir(estado: EstadoSesion, ajustes: Ajustes, prefs: Preferencias, sesion: SesionRepo, nav: AjustesNav?, motor: MotorNav) {
    val conectada = estado.fase == Fase.Abierta
    var apodo by rememberSaveable { mutableStateOf(ajustes.apodo) }
    Tarjeta {
        TituloSeccion(stringResource(R.string.ajustes_compartir_titulo))
        FilaInterruptor(
            stringResource(R.string.ajustes_compartir),
            stringResource(if (conectada) R.string.ajustes_compartir_ayuda else R.string.ajustes_compartir_sin_conexion),
            // Lo que dice el relay, no lo que se toco: es uno por sesion.
            estado.compartiendo ?: (prefs.compartirElegido == true),
            habilitado = conectada,
        ) { sesion.compartir(it) }
        nav?.let { n ->
            FilaInterruptor(n.t("settingsLiveShareRoute"), null, n.rutaEnVivo, habilitado = estado.compartiendo == true) { motor.rutaEnVivo(it) }
        }
        OutlinedTextField(
            value = apodo,
            onValueChange = {
                apodo = it.take(24)
                prefs.ponerApodo(apodo)
            },
            label = { Text(stringResource(R.string.ajustes_apodo)) },
            supportingText = { Text(stringResource(R.string.ajustes_apodo_ayuda)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
        )
        FilaInterruptor(
            stringResource(R.string.ajustes_ver_otros),
            stringResource(R.string.ajustes_ver_otros_ayuda),
            ajustes.mostrarOtros,
        ) { prefs.ponerMostrarOtros(it) }
        nav?.let { n ->
            FilaInterruptor(n.t("settingsTmpPlayers"), n.t("settingsTmpPlayersHint"), ajustes.mostrarTmp) { prefs.ponerMostrarTmp(it) }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TarjetaUnidades(ajustes: Ajustes, prefs: Preferencias, nav: AjustesNav?, motor: MotorNav) {
    Tarjeta {
        TituloSeccion(stringResource(R.string.ajustes_unidades))
        val opciones = listOf(
            Unidades.Auto to R.string.unidades_auto,
            Unidades.Kilometros to R.string.unidades_km,
            Unidades.Millas to R.string.unidades_mi,
        )
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            opciones.forEachIndexed { i, (valor, nombre) ->
                SegmentedButton(
                    selected = ajustes.unidades == valor,
                    onClick = { prefs.ponerUnidades(valor) },
                    shape = SegmentedButtonDefaults.itemShape(i, opciones.size),
                    label = { Text(stringResource(nombre)) },
                )
            }
        }
        Spacer(Modifier.height(6.dp))
        Text(stringResource(R.string.unidades_ayuda), style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave)
        nav?.let { n -> Selector(null, n.relojes, n.reloj) { motor.reloj(it) } }
    }
}

@Composable
private fun TarjetaPantalla(ajustes: Ajustes, prefs: Preferencias) {
    Tarjeta {
        FilaInterruptor(
            stringResource(R.string.ajustes_pantalla),
            stringResource(R.string.ajustes_pantalla_ayuda),
            ajustes.pantallaEncendida,
        ) { prefs.ponerPantallaEncendida(it) }
        FilaInterruptor(
            stringResource(R.string.ajustes_segundo_plano),
            stringResource(R.string.ajustes_segundo_plano_ayuda),
            ajustes.segundoPlano,
        ) { prefs.ponerSegundoPlano(it) }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            FilaInterruptor(
                stringResource(R.string.ajustes_flotante),
                stringResource(R.string.ajustes_flotante_ayuda),
                ajustes.flotanteAlSalir,
            ) { prefs.ponerFlotanteAlSalir(it) }
        }
    }
}

@Composable
private fun SelectorVariante(juego: String, titulo: String, prefs: Preferencias, catalogo: CatalogoMapas) {
    var abierto by remember { mutableStateOf(false) }
    var elegida by remember { mutableStateOf(prefs.mapaManual(juego)) }
    val opciones = catalogo.deJuego(juego)
    Column(Modifier.padding(vertical = 4.dp)) {
        Text(titulo, style = MaterialTheme.typography.labelMedium, color = Paleta.TextoSuave)
        OutlinedButton(onClick = { abierto = true }, modifier = Modifier.fillMaxWidth().padding(top = 4.dp)) {
            Text(elegida?.let { catalogo.variantes[it]?.nombre } ?: stringResource(R.string.mapa_auto), maxLines = 1)
        }
        DropdownMenu(expanded = abierto, onDismissRequest = { abierto = false }) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.mapa_auto)) },
                onClick = {
                    elegida = null
                    prefs.ponerMapaManual(juego, null)
                    abierto = false
                },
            )
            opciones.forEach { v ->
                DropdownMenuItem(
                    text = { Text(v.nombre) },
                    onClick = {
                        elegida = v.id
                        prefs.ponerMapaManual(juego, v.id)
                        abierto = false
                    },
                )
            }
        }
    }
}

@Composable
private fun TarjetaMapaManual(prefs: Preferencias, catalogo: CatalogoMapas, alMapasSinInternet: () -> Unit) {
    Tarjeta {
        TituloSeccion(stringResource(R.string.ajustes_mapa))
        Text(stringResource(R.string.ajustes_mapa_ayuda), style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave)
        Spacer(Modifier.height(6.dp))
        SelectorVariante("ets2", "ETS2", prefs, catalogo)
        SelectorVariante("ats", "ATS", prefs, catalogo)
        OutlinedButton(onClick = alMapasSinInternet, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
            Text(stringResource(R.string.sin_internet_titulo))
        }
    }
}

/** Solo en debug: apuntar a un relay local para probar con un cliente falso. */
@Composable
private fun TarjetaPruebas(prefs: Preferencias) {
    var relay by rememberSaveable { mutableStateOf(prefs.relayDePrueba ?: "") }
    var api by rememberSaveable { mutableStateOf(prefs.apiDePrueba ?: "") }
    Tarjeta {
        TituloSeccion(stringResource(R.string.ajustes_pruebas))
        OutlinedTextField(
            value = relay,
            onValueChange = {
                relay = it.trim()
                prefs.relayDePrueba = relay
            },
            label = { Text("Relay (ws://10.0.2.2:8123)") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = api,
            onValueChange = {
                api = it.trim()
                prefs.apiDePrueba = api
            },
            label = { Text("API (http://10.0.2.2:8765)") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun TarjetaAcerca() {
    val contexto = LocalContext.current
    Tarjeta {
        TituloSeccion(stringResource(R.string.ajustes_acerca))
        Text(
            stringResource(R.string.ajustes_version, BuildConfig.VERSION_NAME),
            style = MaterialTheme.typography.bodyMedium,
            color = Paleta.TextoSuave,
        )
        Spacer(Modifier.height(4.dp))
        Text(stringResource(R.string.ajustes_creditos), style = MaterialTheme.typography.bodySmall, color = Paleta.TextoApagado)
        Spacer(Modifier.height(8.dp))
        OutlinedButton(onClick = { abrirEnNavegador(contexto, "${Red.WEB}/privacy.html") }) {
            Text(stringResource(R.string.ajustes_privacidad))
        }
    }
}
