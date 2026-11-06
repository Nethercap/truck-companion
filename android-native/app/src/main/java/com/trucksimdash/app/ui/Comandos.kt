package com.trucksimdash.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Flare
import androidx.compose.material.icons.filled.Height
import androidx.compose.material.icons.filled.Highlight
import androidx.compose.material.icons.filled.LightMode
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.LocalParking
import androidx.compose.material.icons.filled.PowerSettingsNew
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.WaterDrop
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.trucksimdash.app.R
import com.trucksimdash.app.core.BOTONES_PROPIOS_MAX
import com.trucksimdash.app.core.BotonPropio
import com.trucksimdash.app.core.etiquetaDeTecla
import com.trucksimdash.app.telemetria.Telemetria

private data class Comando(
    val accion: String,
    val nombre: Int,
    val icono: ImageVector,
    /** Lo dice el juego, no el boton: nunca un estado local (`updateCommandButtonStates`). */
    val activo: (Telemetria) -> Boolean,
)

private val COMANDOS = listOf(
    Comando("toggle_hazards", R.string.cmd_balizas, Icons.Filled.Warning) { it.luces.balizas },
    Comando("toggle_beacon", R.string.cmd_baliza, Icons.Filled.Highlight) { it.luces.baliza },
    Comando("toggle_parking_brake", R.string.cmd_freno, Icons.Filled.LocalParking) { it.frenoMano },
    Comando("toggle_engine", R.string.cmd_motor, Icons.Filled.PowerSettingsNew) { it.motorEncendido },
    Comando("toggle_trailer", R.string.cmd_remolque, Icons.Filled.Link) { it.remolqueEnganchado },
    Comando("cycle_camera", R.string.cmd_camara, Icons.Filled.CameraAlt) { false },
    Comando("toggle_cruise_control", R.string.cmd_crucero, Icons.Filled.Speed) { it.crucero },
    Comando("cycle_lights", R.string.cmd_luces, Icons.Filled.LightMode) { it.luces.bajas || it.luces.altas },
    Comando("toggle_high_beam", R.string.cmd_altas, Icons.Filled.Flare) { it.luces.altas },
    Comando("toggle_infotainment", R.string.cmd_pantalla, Icons.Filled.Tv) { false },
    Comando("toggle_lift_axle", R.string.cmd_eje, Icons.Filled.Height) { it.ejeElevado },
    Comando("toggle_wipers", R.string.cmd_limpia, Icons.Filled.WaterDrop) { it.limpiaparabrisas },
)

/** Las acciones que tienen tecla en la PC: la lista de la pantalla de remapeo. */
internal val ACCIONES: List<Pair<String, Int>> get() = COMANDOS.map { it.accion to it.nombre }

/** La botonera: aprietan una tecla en la PC, y sirve aunque no se la pueda tocar. */
@OptIn(ExperimentalLayoutApi::class, ExperimentalFoundationApi::class)
@Composable
fun BloqueComandos(
    t: Telemetria,
    alApretar: (String) -> Unit,
    modifier: Modifier = Modifier,
    porFila: Int = 4,
    propios: List<BotonPropio> = emptyList(),
    alApretarPropio: (String) -> Unit = {},
    alEditarPropio: (Int?) -> Unit = {},
) {
    Tarjeta(modifier) {
        TituloSeccion(stringResource(R.string.comandos))
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            maxItemsInEachRow = porFila,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            COMANDOS.forEach { c ->
                val activo = c.activo(t)
                Surface(
                    onClick = { alApretar(c.accion) },
                    modifier = Modifier.weight(1f).height(68.dp),
                    shape = MaterialTheme.shapes.medium,
                    color = if (activo) MaterialTheme.colorScheme.primaryContainer else Paleta.SuperficieAlta,
                    border = BorderStroke(1.dp, if (activo) Paleta.Acento else Paleta.Borde),
                ) {
                    Column(
                        Modifier.padding(4.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        Icon(
                            c.icono,
                            null,
                            tint = if (activo) Paleta.Acento else Paleta.TextoSuave,
                            modifier = Modifier.size(22.dp),
                        )
                        Text(
                            stringResource(c.nombre),
                            style = MaterialTheme.typography.labelSmall,
                            color = if (activo) Paleta.Texto else Paleta.TextoSuave,
                            textAlign = TextAlign.Center,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.padding(top = 3.dp),
                        )
                    }
                }
            }
            // Tocar aprieta; mantener apretado edita, para no cambiarlo sin querer manejando.
            propios.forEachIndexed { i, b ->
                Surface(
                    modifier = Modifier
                        .weight(1f)
                        .height(68.dp)
                        .combinedClickable(onClick = { alApretarPropio(b.tecla) }, onLongClick = { alEditarPropio(i) }),
                    shape = MaterialTheme.shapes.medium,
                    color = Paleta.SuperficieAlta,
                    border = BorderStroke(1.dp, Paleta.Borde),
                ) {
                    Column(
                        Modifier.padding(4.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        Text(
                            etiquetaDeTecla(b.tecla),
                            style = MaterialTheme.typography.labelMedium,
                            color = Paleta.Acento,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            b.titulo,
                            style = MaterialTheme.typography.labelSmall,
                            color = Paleta.TextoSuave,
                            textAlign = TextAlign.Center,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.padding(top = 3.dp),
                        )
                    }
                }
            }
            if (propios.size < BOTONES_PROPIOS_MAX) {
                Surface(
                    onClick = { alEditarPropio(null) },
                    modifier = Modifier.weight(1f).height(68.dp),
                    shape = MaterialTheme.shapes.medium,
                    color = Paleta.SuperficieAlta,
                    border = BorderStroke(1.dp, Paleta.Borde),
                ) {
                    Column(
                        Modifier.padding(4.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        Icon(Icons.Filled.Add, null, tint = Paleta.TextoSuave, modifier = Modifier.size(22.dp))
                        Text(
                            stringResource(R.string.boton_agregar),
                            style = MaterialTheme.typography.labelSmall,
                            color = Paleta.TextoSuave,
                            textAlign = TextAlign.Center,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.padding(top = 3.dp),
                        )
                    }
                }
            }
        }
    }
}

