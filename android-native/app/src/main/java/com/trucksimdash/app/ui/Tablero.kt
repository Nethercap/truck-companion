package com.trucksimdash.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.BatteryAlert
import androidx.compose.material.icons.filled.Compress
import androidx.compose.material.icons.filled.Flare
import androidx.compose.material.icons.filled.Highlight
import androidx.compose.material.icons.filled.KeyboardDoubleArrowLeft
import androidx.compose.material.icons.filled.KeyboardDoubleArrowRight
import androidx.compose.material.icons.filled.LightMode
import androidx.compose.material.icons.filled.LocalGasStation
import androidx.compose.material.icons.filled.LocalParking
import androidx.compose.material.icons.filled.OilBarrel
import androidx.compose.material.icons.filled.PowerSettingsNew
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.Thermostat
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.WaterDrop
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.trucksimdash.app.R
import com.trucksimdash.app.nav.TotalesSesion
import com.trucksimdash.app.core.consumo
import com.trucksimdash.app.core.distancia
import com.trucksimdash.app.core.duracionMinutos
import com.trucksimdash.app.core.marcha
import com.trucksimdash.app.core.masa
import com.trucksimdash.app.core.plata
import com.trucksimdash.app.core.porcentaje
import com.trucksimdash.app.core.unidadVelocidad
import com.trucksimdash.app.core.velocidadEnUnidad
import com.trucksimdash.app.core.volumen
import com.trucksimdash.app.telemetria.Alertas
import com.trucksimdash.app.telemetria.Telemetria
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin

private const val ARCO_INICIO = 140f
private const val ARCO_BARRIDO = 260f

/** Velocimetro dibujado: el arco es la velocidad, la marca es el limite. */
@Composable
fun Velocimetro(t: Telemetria, millas: Boolean, modifier: Modifier = Modifier, compacto: Boolean = false) {
    val velocidad = velocidadEnUnidad(t.velocidadKmh, millas)
    val limite = if (t.limiteKmh > 0) velocidadEnUnidad(t.limiteKmh, millas) else null
    val tope = max(if (millas) 90 else 140, ((max(velocidad, limite ?: 0) / 20) + 1) * 20).toFloat()
    val colorValor = if (t.excedido) Paleta.Rojo else Paleta.Acento
    val unidad = unidadVelocidad(millas)
    val descripcion = stringResource(R.string.desc_velocimetro, velocidad, unidad)

    Box(modifier.aspectRatio(1f).semantics { contentDescription = descripcion }, contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize().padding(6.dp)) {
            val grosor = size.minDimension * 0.055f
            val inset = grosor / 2 + 2f
            val lado = Size(size.width - inset * 2, size.height - inset * 2)
            val origen = Offset(inset, inset)
            drawArc(
                color = Paleta.SuperficieAlta,
                startAngle = ARCO_INICIO,
                sweepAngle = ARCO_BARRIDO,
                useCenter = false,
                topLeft = origen,
                size = lado,
                style = Stroke(grosor, cap = StrokeCap.Round),
            )
            val fraccion = (velocidad / tope).coerceIn(0f, 1f)
            if (fraccion > 0f) {
                drawArc(
                    color = colorValor,
                    startAngle = ARCO_INICIO,
                    sweepAngle = ARCO_BARRIDO * fraccion,
                    useCenter = false,
                    topLeft = origen,
                    size = lado,
                    style = Stroke(grosor, cap = StrokeCap.Round),
                )
            }
            if (limite != null) {
                val angulo = Math.toRadians((ARCO_INICIO + ARCO_BARRIDO * (limite / tope).coerceIn(0f, 1f)).toDouble())
                val radio = lado.width / 2
                val c = Offset(size.width / 2, size.height / 2)
                val desde = radio - grosor * 0.95f
                val hasta = radio + grosor * 0.95f
                drawLine(
                    color = Paleta.Texto,
                    start = c + Offset(cos(angulo).toFloat() * desde, sin(angulo).toFloat() * desde),
                    end = c + Offset(cos(angulo).toFloat() * hasta, sin(angulo).toFloat() * hasta),
                    strokeWidth = grosor * 0.32f,
                    cap = StrokeCap.Round,
                )
            }
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                velocidad.toString(),
                style = MaterialTheme.typography.headlineMedium.merge(NumerosTabulares),
                fontSize = if (compacto) 54.sp else 74.sp,
                lineHeight = if (compacto) 58.sp else 78.sp,
                fontWeight = FontWeight.Bold,
                color = if (t.excedido) Paleta.Rojo else Paleta.Texto,
            )
            Text(unidad, style = MaterialTheme.typography.labelLarge, color = Paleta.TextoSuave)
        }
    }
}

/** Como se ve en la ruta: redondo en Europa, rectangular en Estados Unidos. */
@Composable
fun SenalLimite(limite: Int, juego: String?, modifier: Modifier = Modifier, chica: Boolean = false) {
    val tamano = if (chica) 44.dp else 58.dp
    if (juego == "ats") {
        Column(
            modifier
                .width(if (chica) 40.dp else 50.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(Color.White)
                .border(1.5.dp, Color.Black, RoundedCornerShape(6.dp))
                .padding(vertical = 3.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                stringResource(R.string.limite_ee_uu),
                color = Color.Black,
                fontSize = if (chica) 6.sp else 7.sp,
                lineHeight = 8.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            )
            Text(
                limite.toString(),
                color = Color.Black,
                fontSize = if (chica) 17.sp else 22.sp,
                lineHeight = if (chica) 19.sp else 24.sp,
                fontWeight = FontWeight.Bold,
                style = NumerosTabulares,
            )
        }
    } else {
        Box(
            modifier
                .size(tamano)
                .clip(CircleShape)
                .background(Color.White)
                .border(if (chica) 4.dp else 5.dp, Color(0xFFD8262C), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                limite.toString(),
                color = Color.Black,
                fontSize = if (chica) 15.sp else 19.sp,
                fontWeight = FontWeight.Bold,
                style = NumerosTabulares,
            )
        }
    }
}

/** RPM, con la zona alta en otro color: es lo unico que importa de esa barra. */
@Composable
fun BarraRpm(t: Telemetria, modifier: Modifier = Modifier) {
    val rpm = t.rpm ?: 0.0
    val maximo = t.rpmMax?.takeIf { it > 0 } ?: 2500.0
    val fraccion = (rpm / maximo).toFloat().coerceIn(0f, 1f)
    Column(modifier) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(stringResource(R.string.rpm), style = MaterialTheme.typography.labelMedium, color = Paleta.TextoSuave)
            Text(
                rpm.toInt().toString(),
                style = MaterialTheme.typography.labelMedium.merge(NumerosTabulares),
                color = Paleta.Texto,
            )
        }
        Spacer(Modifier.height(5.dp))
        BarraNivel(fraccion, if (fraccion > 0.85f) Paleta.Rojo else Paleta.TextoSuave, alto = 7)
    }
}

/** El bloque principal: velocidad, limite, marcha, crucero. */
@Composable
fun BloqueManejo(t: Telemetria, millas: Boolean, modifier: Modifier = Modifier, compacto: Boolean = false) {
    Tarjeta(modifier) {
        Box(Modifier.fillMaxWidth()) {
            // De costado la altura es lo que falta: que entre entero sin deslizar.
            val tamano = if (compacto) Modifier.height(168.dp) else Modifier.fillMaxWidth(0.84f)
            Velocimetro(t, millas, tamano.align(Alignment.Center), compacto)
            if (t.limiteKmh > 0) {
                SenalLimite(velocidadEnUnidad(t.limiteKmh, millas), t.juego, Modifier.align(Alignment.TopEnd))
            }
            CuadroMarcha(t, Modifier.align(Alignment.BottomStart))
            if (t.crucero) {
                CuadroCrucero(t, millas, Modifier.align(Alignment.BottomEnd))
            }
        }
        Spacer(Modifier.height(10.dp))
        BarraRpm(t)
    }
}

@Composable
private fun CuadroMarcha(t: Telemetria, modifier: Modifier = Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(stringResource(R.string.marcha), style = MaterialTheme.typography.labelSmall, color = Paleta.TextoSuave)
        Text(
            marcha(t.marcha),
            fontSize = 30.sp,
            lineHeight = 32.sp,
            fontWeight = FontWeight.Bold,
            color = Paleta.Texto,
            style = NumerosTabulares,
        )
    }
}

@Composable
private fun CuadroCrucero(t: Telemetria, millas: Boolean, modifier: Modifier = Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(Icons.Filled.Speed, stringResource(R.string.crucero), tint = Paleta.Verde, modifier = Modifier.size(18.dp))
        Text(
            velocidadEnUnidad(t.cruceroKmh, millas).toString(),
            fontSize = 22.sp,
            lineHeight = 24.sp,
            fontWeight = FontWeight.SemiBold,
            color = Paleta.Verde,
            style = NumerosTabulares,
        )
    }
}

private data class Testigo(val icono: ImageVector, val nombre: Int, val encendido: Boolean, val color: Color)

/** Los testigos del tablero. Las alertas solo aparecen si estan prendidas. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun FilaTestigos(t: Telemetria, modifier: Modifier = Modifier) {
    val testigos = listOf(
        Testigo(Icons.Filled.KeyboardDoubleArrowLeft, R.string.giro_izquierda, t.luces.giroIzquierda, Paleta.Verde),
        Testigo(Icons.Filled.LightMode, R.string.bajas, t.luces.bajas, Paleta.Verde),
        Testigo(Icons.Filled.Flare, R.string.altas, t.luces.altas, Paleta.Acento),
        Testigo(Icons.Filled.Warning, R.string.balizas, t.luces.balizas, Paleta.Rojo),
        Testigo(Icons.Filled.Highlight, R.string.baliza, t.luces.baliza, Paleta.Ambar),
        Testigo(Icons.Filled.LocalParking, R.string.freno_mano, t.frenoMano, Paleta.Rojo),
        Testigo(Icons.Filled.PowerSettingsNew, R.string.motor, t.motorEncendido, Paleta.Verde),
        Testigo(Icons.Filled.KeyboardDoubleArrowRight, R.string.giro_derecha, t.luces.giroDerecha, Paleta.Verde),
    )
    Tarjeta(modifier) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            testigos.forEach { (icono, nombre, encendido, color) ->
                Icon(
                    icono,
                    stringResource(nombre) + if (encendido) " · " + stringResource(R.string.encendido) else "",
                    tint = if (encendido) color else Paleta.Borde,
                    modifier = Modifier.size(24.dp),
                )
            }
        }
        if (t.alertas.alguna) {
            Spacer(Modifier.height(12.dp))
            FilaAlertas(t.alertas)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FilaAlertas(a: Alertas) {
    val lista = buildList {
        if (a.aire) add(Icons.Filled.Compress to R.string.alerta_aire)
        if (a.aceite) add(Icons.Filled.OilBarrel to R.string.alerta_aceite)
        if (a.agua) add(Icons.Filled.Thermostat to R.string.alerta_agua)
        if (a.bateria) add(Icons.Filled.BatteryAlert to R.string.alerta_bateria)
        if (a.combustible) add(Icons.Filled.LocalGasStation to R.string.alerta_combustible)
        if (a.adblue) add(Icons.Filled.WaterDrop to R.string.alerta_adblue)
    }
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        lista.forEach { (icono, texto) ->
            Surface(
                shape = RoundedCornerShape(50),
                color = Color(0xFF3A1416),
                border = BorderStroke(1.dp, Paleta.Rojo),
            ) {
                Row(Modifier.padding(horizontal = 10.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(icono, null, tint = Paleta.Rojo, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(stringResource(texto), style = MaterialTheme.typography.labelMedium, color = Paleta.Texto)
                }
            }
        }
    }
}

/** Combustible, descanso, ruta y consumo: lo que se mira de reojo. */
@Composable
fun BloqueViaje(t: Telemetria, millas: Boolean, modifier: Modifier = Modifier) {
    Tarjeta(modifier) {
        val fraccion = t.fraccionCombustible
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
            Dato(
                stringResource(R.string.combustible),
                if (fraccion != null) "${porcentaje(fraccion)} %" else "-",
                colorValor = if (t.alertas.combustible) Paleta.Rojo else Paleta.Texto,
            )
            Text(
                listOfNotNull(
                    t.combustible?.let { volumen(it, millas) },
                    t.autonomiaKm?.takeIf { it > 0 }?.let { "≈ " + distancia(it, millas) },
                ).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall.merge(NumerosTabulares),
                color = Paleta.TextoSuave,
            )
        }
        Spacer(Modifier.height(6.dp))
        BarraNivel(
            fraccion?.toFloat() ?: 0f,
            when {
                fraccion == null -> Paleta.TextoSuave
                t.alertas.combustible || fraccion < 0.1 -> Paleta.Rojo
                fraccion < 0.2 -> Paleta.Ambar
                else -> Paleta.Verde
            },
        )
        Spacer(Modifier.height(14.dp))
        Row(Modifier.fillMaxWidth()) {
            Dato(
                stringResource(R.string.ruta_gps),
                if (t.rutaKm > 0) distancia(t.rutaKm, millas) else "-",
                Modifier.weight(1f),
            )
            Dato(
                stringResource(R.string.tiempo_juego),
                t.rutaSegundos?.takeIf { it > 0 && t.rutaKm > 0 }?.let { duracionMinutos(it / 60) } ?: "-",
                Modifier.weight(1f),
            )
        }
        Spacer(Modifier.height(12.dp))
        Row(Modifier.fillMaxWidth()) {
            val descanso = t.descansoMinutos
            Dato(
                stringResource(R.string.descanso),
                descanso?.let { duracionMinutos(it) } ?: "-",
                Modifier.weight(1f),
                colorValor = if (descanso != null && descanso < 60) Paleta.Ambar else Paleta.Texto,
            )
            Dato(
                stringResource(R.string.consumo),
                t.consumoLitrosCada100?.takeIf { it > 0 }?.let { consumo(it, millas) } ?: "-",
                Modifier.weight(1f),
            )
        }
    }
}

/** El trabajo en curso. Sin trabajo no se muestra. */
@Composable
fun BloqueTrabajo(t: Telemetria, millas: Boolean, pagoConMoneda: String? = null, modifier: Modifier = Modifier) {
    if (!t.enTrabajo && t.carga == null) return
    Tarjeta(modifier) {
        TituloSeccion(stringResource(R.string.trabajo))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(t.ciudadOrigen ?: "-", style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                t.empresaOrigen?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            Icon(
                Icons.AutoMirrored.Filled.ArrowForward,
                stringResource(R.string.hacia),
                tint = Paleta.TextoApagado,
                modifier = Modifier.padding(horizontal = 10.dp).size(18.dp),
            )
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.End) {
                Text(t.ciudadDestino ?: "-", style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                t.empresaDestino?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        t.carga?.let {
            FilaDato(stringResource(R.string.carga), listOfNotNull(it, t.cargaKg?.takeIf { k -> k > 0 }?.let { k -> masa(k, millas) }).joinToString(" · "))
        }
        t.pagoTrabajo?.takeIf { it > 0 }?.let {
            FilaDato(stringResource(R.string.pago), pagoConMoneda ?: plata(it, if (t.juego == "ats") "USD" else "EUR"))
        }
        t.plazoSegundos?.let { FilaDato(stringResource(R.string.plazo), duracionMinutos(it / 60), colorValor = if (it < 0) Paleta.Rojo else Paleta.Texto) }
        t.danoCarga?.takeIf { it > 0 }?.let {
            FilaDato(stringResource(R.string.dano_carga), "${porcentaje(it)} %", colorValor = if (it > 0.02) Paleta.Ambar else Paleta.Texto)
        }
    }
}

/** Peajes, multas y ferries desde que se abrio, con su boton de reiniciar. */
@Composable
fun BloqueSesion(sesion: TotalesSesion?, alReiniciar: () -> Unit, modifier: Modifier = Modifier) {
    if (sesion?.hayAlgo != true) return
    Tarjeta(modifier) {
        sesion.filas.forEach { (etiqueta, valor) -> FilaDato(etiqueta, valor) }
        TextButton(onClick = alReiniciar, modifier = Modifier.align(Alignment.End)) { Text(sesion.reiniciar) }
    }
}

/** El camion y cuanto se gasto cada pieza. */
@Composable
fun BloqueCamion(t: Telemetria, millas: Boolean, modifier: Modifier = Modifier) {
    Tarjeta(modifier) {
        val nombre = listOfNotNull(t.marca, t.modelo).joinToString(" ").ifBlank { stringResource(R.string.camion) }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text(nombre, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            t.odometroKm?.let {
                Text(distancia(it, millas), style = MaterialTheme.typography.bodySmall.merge(NumerosTabulares), color = Paleta.TextoSuave)
            }
        }
        Spacer(Modifier.height(10.dp))
        val d = t.desgaste
        listOf(
            R.string.pieza_motor to d.motor,
            R.string.pieza_transmision to d.transmision,
            R.string.pieza_cabina to d.cabina,
            R.string.pieza_chasis to d.chasis,
            R.string.pieza_ruedas to d.ruedas,
            R.string.pieza_remolque to t.desgasteRemolque,
        ).forEach { (nombrePieza, valor) ->
            if (valor != null) FilaDesgaste(stringResource(nombrePieza), valor)
        }
    }
}

@Composable
private fun FilaDesgaste(nombre: String, fraccion: Double) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(nombre, style = MaterialTheme.typography.bodySmall, color = Paleta.TextoSuave, modifier = Modifier.width(92.dp), maxLines = 1)
        BarraNivel(
            fraccion.toFloat(),
            when {
                fraccion > 0.25 -> Paleta.Rojo
                fraccion > 0.1 -> Paleta.Ambar
                else -> Paleta.TextoSuave
            },
            Modifier.weight(1f),
        )
        Text(
            "${porcentaje(fraccion)} %",
            style = MaterialTheme.typography.bodySmall.merge(NumerosTabulares),
            color = Paleta.Texto,
            textAlign = TextAlign.End,
            modifier = Modifier.width(44.dp),
        )
    }
}

