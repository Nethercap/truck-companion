package com.trucksimdash.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.trucksimdash.app.nav.MotorNav

/**
 * "Trabajo entregado", arriba de lo que este abierto: queda hasta cerrarla o un minuto y medio,
 * porque quien esta estacionando no mira el telefono (showDeliveryCard en la web).
 */
@Composable
fun TarjetaEntrega(motor: MotorNav, modifier: Modifier = Modifier) {
    val entrega by motor.entrega.collectAsStateWithLifecycle()
    val e = entrega ?: return
    Box(modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.safeDrawing), contentAlignment = Alignment.TopCenter) {
        Surface(
            shape = MaterialTheme.shapes.large,
            color = Paleta.Superficie,
            border = BorderStroke(1.dp, Paleta.Verde),
            shadowElevation = 8.dp,
            modifier = Modifier.padding(12.dp).widthIn(max = 420.dp).fillMaxWidth(),
        ) {
            Column(Modifier.padding(start = 14.dp, end = 14.dp, bottom = 12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("✅ " + e.titulo, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                    IconButton(onClick = { motor.cerrarEntrega() }) { Icon(Icons.Filled.Close, e.cerrar, tint = Paleta.TextoSuave) }
                }
                e.ruta?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
                e.carga?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave) }
                e.filas.forEachIndexed { i, (etiqueta, valor) ->
                    Row(Modifier.fillMaxWidth().padding(top = if (i == 0) 8.dp else 2.dp)) {
                        Text(etiqueta, style = MaterialTheme.typography.bodyMedium, color = Paleta.TextoSuave, modifier = Modifier.weight(1f))
                        // Lo primero es el pago: es lo que se vino a ver.
                        Text(
                            valor,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = if (i == 0) FontWeight.Bold else null,
                            color = if (i == 0) Paleta.Verde else Paleta.Texto,
                        )
                    }
                }
            }
        }
    }
}
