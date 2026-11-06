package com.trucksimdash.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

@Composable
fun Tarjeta(
    modifier: Modifier = Modifier,
    relleno: Boolean = true,
    contenido: @Composable ColumnScope.() -> Unit,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large,
        color = Paleta.Superficie,
        border = BorderStroke(1.dp, Paleta.Borde),
    ) {
        Column(
            modifier = if (relleno) Modifier.padding(16.dp) else Modifier,
            content = contenido,
        )
    }
}

@Composable
fun TituloSeccion(texto: String, modifier: Modifier = Modifier) {
    Text(
        text = texto,
        style = MaterialTheme.typography.titleMedium,
        color = Paleta.Texto,
        modifier = modifier.padding(bottom = 10.dp),
    )
}

/** Un dato: la etiqueta chica arriba y el valor abajo. */
@Composable
fun Dato(
    etiqueta: String,
    valor: String,
    modifier: Modifier = Modifier,
    colorValor: Color = Paleta.Texto,
) {
    Column(modifier) {
        Text(etiqueta, style = MaterialTheme.typography.labelMedium, color = Paleta.TextoSuave, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(
            valor,
            style = MaterialTheme.typography.titleMedium.merge(NumerosTabulares),
            color = colorValor,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/** Una fila etiqueta / valor, para las listas de numeros. */
@Composable
fun FilaDato(etiqueta: String, valor: String, modifier: Modifier = Modifier, colorValor: Color = Paleta.Texto) {
    Row(
        modifier = modifier.fillMaxWidth().padding(vertical = 5.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            etiqueta,
            style = MaterialTheme.typography.bodyMedium,
            color = Paleta.TextoSuave,
            modifier = Modifier.weight(1f, fill = false),
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            valor,
            style = MaterialTheme.typography.bodyMedium.merge(NumerosTabulares),
            color = colorValor,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(start = 12.dp),
            maxLines = 1,
        )
    }
}

/** Barra de nivel con la punta redondeada. */
@Composable
fun BarraNivel(fraccion: Float, color: Color, modifier: Modifier = Modifier, alto: Int = 6) {
    Box(
        modifier
            .fillMaxWidth()
            .height(alto.dp)
            .clip(RoundedCornerShape(alto.dp))
            .background(Paleta.SuperficieAlta),
    ) {
        if (fraccion > 0f) {
            Box(
                Modifier
                    .fillMaxWidth(fraccion.coerceIn(0f, 1f))
                    .height(alto.dp)
                    .clip(RoundedCornerShape(alto.dp))
                    .background(color),
            )
        }
    }
}

/** Un punto de color con su texto; el estado nunca va solo en el color. */
@Composable
fun Pildora(texto: String, color: Color, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(50))
            .background(Paleta.SuperficieAlta)
            .padding(horizontal = 10.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(color))
        Text(
            texto,
            style = MaterialTheme.typography.labelMedium,
            color = Paleta.Texto,
            modifier = Modifier.padding(start = 7.dp),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
