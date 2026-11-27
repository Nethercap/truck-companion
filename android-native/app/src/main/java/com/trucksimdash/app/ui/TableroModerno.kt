package com.trucksimdash.app.ui

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.trucksimdash.app.nav.CamionModerno
import com.trucksimdash.app.nav.CintaModerno
import com.trucksimdash.app.nav.CombustibleModerno
import com.trucksimdash.app.nav.ConduccionModerno
import com.trucksimdash.app.nav.FranjaModerno
import com.trucksimdash.app.nav.LlegadaModerno
import com.trucksimdash.app.nav.MarcaCinta
import com.trucksimdash.app.nav.TableroNav
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

// El panel Moderno de la web (createDashPanel en docs/dash/dash.js, con los colores y medidas de
// dash.css): la cinta del viaje y tarjetas que empiezan por la conclusion ("Llegada 1 h 51 min
// antes"). Las frases las arma el motor (tableroModerno en conduccion.js); aca solo se dibujan.

// --- colores de dash.css ---
private val PANEL = Color(0xFF171A1F)
private val LINEA = Color(0xFF272C33)
private val APAGADO = Color(0xFF9AA4B2)
private val ACENTO = Color(0xFF3B9EFF)
private val BIEN = Color(0xFF7CC243)
private val MEDIO = Color(0xFFE8CF3F)
private val ATENCION = Color(0xFFFFB020)
private val MAL = Color(0xFFFF4D4D)
private val TEXTO = Color(0xFFEEEEEE)
private val TENUE = Color(0xFF7D8693)
private val TESTIGO_APAGADO = Color(0xFF565D68)

/**
 * La unidad de dash.css (--d-unit): con el tamano de la pantalla, entre 12 y 19. En dp, que en un
 * telefono son los px de CSS de la web; las letras en sp para que siga al tamano del sistema.
 */
private class Em(val u: Float) {
    fun dp(e: Float): Dp = (u * e).dp
    fun sp(e: Float): TextUnit = (u * e).sp
}

private fun colorDe(estado: String?, normal: Color = TEXTO) = when (estado) {
    "bien" -> BIEN
    "mal" -> ATENCION
    else -> normal
}

@Composable
private fun Texto(
    texto: String?,
    tam: TextUnit,
    color: Color = TEXTO,
    peso: FontWeight? = null,
    lineas: Int = 1,
    alinear: TextAlign? = null,
    modifier: Modifier = Modifier,
) {
    if (texto.isNullOrEmpty()) return
    Text(
        texto,
        style = TextStyle(fontSize = tam, fontWeight = peso, color = color, lineHeight = tam * 1.15f, fontFeatureSettings = "tnum"),
        maxLines = lineas,
        overflow = TextOverflow.Ellipsis,
        textAlign = alinear,
        modifier = modifier,
    )
}

/** Tarjeta sin titulo, como .dCard: el titulo repetiria lo que la afirmacion ya dice. */
@Composable
private fun Tarjeta(em: Em, modifier: Modifier = Modifier, contenido: @Composable () -> Unit) {
    Surface(color = PANEL, shape = RoundedCornerShape(3.dp), modifier = modifier) {
        Column(Modifier.padding(horizontal = em.dp(0.75f), vertical = em.dp(0.6f)), verticalArrangement = Arrangement.spacedBy(em.dp(0.3f))) {
            contenido()
        }
    }
}

/**
 * El panel entero: la cinta (con trabajo) y las tarjetas. Hasta 34 rem de ancho va todo en una
 * columna; mas ancho, la llegada y el combustible lado a lado, como la grilla de dash.css.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TableroModerno(datos: TableroNav, alReiniciar: () -> Unit, modifier: Modifier = Modifier, entreTarjetas: @Composable () -> Unit = {}) {
    val pantalla = LocalConfiguration.current
    val em = Em((0.0055f * pantalla.screenWidthDp + 0.005f * pantalla.screenHeightDp + 7f).coerceIn(12f, 19f))
    BoxWithConstraints(modifier) {
        val dos = maxWidth >= 544.dp
        Column(verticalArrangement = Arrangement.spacedBy(em.dp(0.55f))) {
            datos.cinta?.let { Cinta(em, it) }
            Conduccion(em, datos.conduccion)
            // Lo propio de la app (los botones de comandos) va pegado a la conduccion.
            entreTarjetas()
            val llegada = datos.llegada
            if (dos && llegada != null) {
                Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(em.dp(0.55f))) {
                    Llegada(em, llegada, Modifier.weight(1f))
                    Combustible(em, datos.combustible, Modifier.weight(1f))
                }
            } else {
                llegada?.let { Llegada(em, it, Modifier.fillMaxWidth()) }
                Combustible(em, datos.combustible, Modifier.fillMaxWidth())
            }
            Camion(em, datos.camion)
            Franja(em, datos.franja, alReiniciar)
        }
    }
}

// --- la cinta ---

@Composable
private fun Cinta(em: Em, c: CintaModerno) {
    Column(
        Modifier
            .fillMaxWidth()
            .border(2.dp, ACENTO, RoundedCornerShape(3.dp))
            .padding(start = em.dp(0.9f), end = em.dp(0.9f), top = em.dp(0.55f), bottom = em.dp(0.45f)),
    ) {
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(em.dp(1f))) {
            Column(Modifier.weight(1f)) {
                Texto(c.desde, em.sp(0.9f), peso = FontWeight.SemiBold, lineas = 2)
                Texto(c.desdeSub, em.sp(0.7f), APAGADO, lineas = 2)
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Texto(c.falta, em.sp(1.9f), peso = FontWeight.SemiBold)
                Texto(c.faltaSub, em.sp(0.7f), APAGADO)
            }
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.End) {
                Texto(c.hasta, em.sp(1.6f), peso = FontWeight.SemiBold, lineas = 2, alinear = TextAlign.End)
                Texto(c.hastaSub, em.sp(0.7f), APAGADO, lineas = 3, alinear = TextAlign.End)
            }
        }
        Via(em, c)
        Marcas(em, c.descanso, c.carga)
    }
}

/** El riel con lo hecho, las franjas del descanso (arriba) y la carga (abajo) y el camion. */
@Composable
private fun Via(em: Em, c: CintaModerno) {
    Canvas(Modifier.fillMaxWidth().padding(top = em.dp(0.5f)).height(em.dp(1.1f))) {
        val e = size.height / 1.1f
        val w = size.width
        val r = CornerRadius(e, e)
        drawRoundRect(LINEA, Offset(0f, 0.4f * e), Size(w, 0.3f * e), r)
        val hecho = c.hecho.toFloat().coerceIn(0f, 1f)
        drawRoundRect(ACENTO, Offset(0f, 0.4f * e), Size(w * hecho, 0.3f * e), r)
        c.descanso?.let { m -> drawRoundRect(ATENCION.copy(alpha = 0.85f), Offset(w * m.izq.toFloat() / 100, 0.08f * e), Size(w * m.ancho.toFloat() / 100, 0.22f * e), r) }
        c.carga?.let { m -> drawRoundRect(BIEN.copy(alpha = 0.85f), Offset(w * m.izq.toFloat() / 100, 0.8f * e), Size(w * m.ancho.toFloat() / 100, 0.22f * e), r) }
        val centro = Offset(w * hecho, 0.55f * e)
        drawCircle(PANEL, 0.5f * e, centro)
        drawCircle(ACENTO, 0.32f * e, centro)
    }
}

/**
 * Las leyendas de las franjas, cada una donde empieza la suya. Si se pisan, se corre primero la de
 * la derecha y lo que falte lo cede la otra (separarMarcas en la web).
 */
@Composable
private fun Marcas(em: Em, descanso: MarcaCinta?, carga: MarcaCinta?) {
    val marcas = listOfNotNull(descanso?.let { it to ATENCION }, carga?.let { it to BIEN })
    if (marcas.isEmpty()) return
    val aire = with(LocalDensity.current) { 10.dp.roundToPx() }
    Layout(
        content = { marcas.forEach { (m, color) -> Texto(m.etiqueta, em.sp(0.68f), color) } },
        modifier = Modifier.fillMaxWidth(),
    ) { medibles, restricciones ->
        val ancho = restricciones.maxWidth
        val hechos = medibles.map { it.measure(restricciones.copy(minWidth = 0)) }
        val x = marcas.mapIndexed { i, (m, _) -> (m.izq / 100 * ancho).roundToInt().coerceIn(0, max(0, ancho - hechos[i].width)) }.toMutableList()
        if (hechos.size == 2) {
            val (iz, de) = if (x[0] <= x[1]) 0 to 1 else 1 to 0
            val solape = x[iz] + hechos[iz].width + aire - x[de]
            if (solape > 0) {
                val lugar = max(0, min(solape, ancho - hechos[de].width - x[de]))
                x[de] += lugar
                if (lugar < solape) x[iz] = max(0, x[iz] - (solape - lugar))
            }
        }
        val alto = hechos.maxOf { it.height }
        layout(ancho, alto) { hechos.forEachIndexed { i, p -> p.place(x[i], 0) } }
    }
}

// --- conduccion ---

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Conduccion(em: Em, v: ConduccionModerno) {
    Tarjeta(em, Modifier.fillMaxWidth()) {
        Row(Modifier.widthIn(max = em.dp(22f)).fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(em.dp(0.6f))) {
            Column {
                Texto(v.vel, em.sp(3.1f), peso = FontWeight.SemiBold)
                Texto(v.unidad, em.sp(0.68f), APAGADO)
            }
            Limite(em, v.limite, v.exceso)
            Box(Modifier.weight(1f))
            // .dGearBox: una columna de 4,5 em contra la derecha, con la barra de rpm de ese ancho.
            Column(Modifier.width(em.dp(4.5f)), horizontalAlignment = Alignment.End) {
                Texto(v.marcha, em.sp(1.5f), peso = FontWeight.SemiBold)
                Texto(v.crucero, em.sp(0.75f), BIEN)
                Canvas(Modifier.padding(top = em.dp(0.3f)).fillMaxWidth().height(em.dp(0.28f))) {
                    val r = CornerRadius(size.height, size.height)
                    drawRoundRect(LINEA, cornerRadius = r)
                    drawRoundRect(if (v.rpmAlta) MAL else ACENTO, size = Size(size.width * v.rpm.toFloat().coerceIn(0f, 1f), size.height), cornerRadius = r)
                }
            }
        }
        FlowRow(Modifier.padding(top = em.dp(0.2f)), horizontalArrangement = Arrangement.spacedBy(em.dp(0.3f)), verticalArrangement = Arrangement.spacedBy(em.dp(0.3f))) {
            v.testigos.forEach { t -> Testigo(em, t.clave, t.prendido, t.titulo, if (t.clave == "retarder") v.retarder else null) }
        }
    }
}

/** El cartel de la maxima (.dLimit): "--" apagado sin dato, con un halo rojo si te pasas. */
@Composable
private fun Limite(em: Em, limite: String?, exceso: Boolean) {
    Box(Modifier.size(em.dp(2.6f) + if (exceso) em.dp(0.5f) else 0.dp), contentAlignment = Alignment.Center) {
        if (exceso) Box(Modifier.size(em.dp(3.1f)).background(MAL.copy(alpha = 0.35f), CircleShape))
        Box(
            Modifier
                .size(em.dp(2.6f))
                .alpha(if (limite == null) 0.25f else 1f)
                .background(Color.White, CircleShape)
                .border(em.dp(0.28f), MAL, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Texto(limite ?: "--", em.sp(1f), Color(0xFF111111), FontWeight.Bold)
        }
    }
}

/** Un testigo (.dInd): el color de cada uno prendido, y los giros titilando. */
@Composable
private fun Testigo(em: Em, clave: String, prendido: Boolean, titulo: String, nivel: String?) {
    val color = when {
        !prendido -> TESTIGO_APAGADO
        clave == "hazards" || clave == "parkingBrake" -> MAL
        clave == "beacon" -> ATENCION
        clave == "blinkerLeft" || clave == "blinkerRight" -> BIEN
        clave == "beamHigh" || clave == "parking" -> Color(0xFF6FB7FF)
        else -> ACENTO
    }
    val borde = when {
        !prendido -> LINEA
        clave == "beamHigh" || clave == "parking" -> ACENTO
        else -> color
    }
    val titila = prendido && (clave == "blinkerLeft" || clave == "blinkerRight")
    val opacidad = if (titila) {
        val ciclo = rememberInfiniteTransition(label = "giro")
        val a by ciclo.animateFloat(
            1f, 1f,
            infiniteRepeatable(keyframes { durationMillis = 700; 1f at 0; 0.25f at 350 }, RepeatMode.Restart),
            label = "giro",
        )
        a
    } else {
        1f
    }
    Box(
        Modifier
            .size(em.dp(1.9f))
            .alpha(opacidad)
            .background(if (prendido) borde.copy(alpha = 0.14f) else Color.Transparent, RoundedCornerShape(2.dp))
            .border(BorderStroke(1.dp, borde), RoundedCornerShape(2.dp))
            .semantics { contentDescription = titulo },
        contentAlignment = Alignment.Center,
    ) {
        IconoWeb(clave, color, em.dp(1.2f))
        nivel?.let {
            Box(
                Modifier.align(Alignment.BottomEnd).offset(em.dp(0.15f), em.dp(0.15f)).background(ACENTO, RoundedCornerShape(2.dp)).padding(horizontal = em.dp(0.15f)),
            ) { Texto(it, em.sp(0.5f), Color(0xFF04223F), FontWeight.Bold) }
        }
    }
}

// --- las afirmaciones ---

@Composable
private fun Llegada(em: Em, l: LlegadaModerno, modifier: Modifier) {
    Tarjeta(em, modifier) {
        Texto(l.titular, em.sp(1.15f), colorDe(l.estado), FontWeight.SemiBold, lineas = 3)
        Texto(l.linea, em.sp(0.78f), APAGADO, lineas = 2)
        Texto(l.pago, em.sp(0.78f), TENUE, lineas = 2)
    }
}

@Composable
private fun Combustible(em: Em, c: CombustibleModerno, modifier: Modifier) {
    Tarjeta(em, modifier) {
        Texto(c.titular, em.sp(1.15f), colorDe(c.titularEstado), FontWeight.SemiBold, lineas = 3)
        Texto(c.descanso, em.sp(0.85f), colorDe(c.descansoEstado), FontWeight.SemiBold, lineas = 2)
        Texto(c.linea, em.sp(0.78f), APAGADO, lineas = 2)
        Texto(c.bajo, em.sp(0.78f), if (c.bajoAlerta) MAL else TENUE, lineas = 2)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Camion(em: Em, c: CamionModerno) {
    Tarjeta(em, Modifier.fillMaxWidth()) {
        // La mala de verdad (desde 25 %) tambien pinta el titular; 'bien' es el camion sano.
        Texto(c.titular, em.sp(1.15f), colorDe(c.titularEstado), FontWeight.SemiBold, lineas = 2)
        if (c.piezas.isNotEmpty()) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(em.dp(0.2f)), verticalArrangement = Arrangement.spacedBy(em.dp(0.2f))) {
                c.piezas.forEach { p ->
                    Row(
                        Modifier.border(1.dp, LINEA, RoundedCornerShape(2.dp)).padding(horizontal = em.dp(0.35f), vertical = em.dp(0.05f)),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(em.dp(0.35f)),
                    ) {
                        if (p.remolque) IconoWeb("trailerAttached", APAGADO, em.dp(0.85f))
                        Texto(p.nombre, em.sp(0.62f), APAGADO)
                        Texto(
                            p.texto, em.sp(0.78f),
                            when (p.nivel) {
                                "bien" -> BIEN
                                "medio" -> MEDIO
                                "alto" -> ATENCION
                                else -> MAL
                            },
                            FontWeight.SemiBold,
                        )
                    }
                }
            }
        }
        Texto(c.linea, em.sp(0.78f), if (c.lineaAlerta) MAL else APAGADO, lineas = 2)
        if (c.medidores.isNotEmpty()) {
            FlowRow(Modifier.padding(top = em.dp(0.2f)), horizontalArrangement = Arrangement.spacedBy(em.dp(0.9f)), verticalArrangement = Arrangement.spacedBy(em.dp(0.35f))) {
                c.medidores.forEach { m ->
                    Column(Modifier.widthIn(min = em.dp(3.9f))) {
                        Texto(m.valor, em.sp(0.95f), if (m.alerta) MAL else TEXTO, FontWeight.SemiBold)
                        Texto(m.etiqueta, em.sp(0.64f), APAGADO)
                    }
                }
            }
        }
    }
}

// --- la franja de abajo ---

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Franja(em: Em, f: FranjaModerno, alReiniciar: () -> Unit) {
    Surface(color = PANEL, shape = RoundedCornerShape(3.dp), modifier = Modifier.fillMaxWidth()) {
        FlowRow(
            Modifier.padding(horizontal = em.dp(0.9f), vertical = em.dp(0.5f)),
            horizontalArrangement = Arrangement.spacedBy(em.dp(0.9f)),
            verticalArrangement = Arrangement.spacedBy(em.dp(0.35f)),
        ) {
            if (f.carga != null) {
                Column(Modifier.align(Alignment.CenterVertically)) {
                    Texto(f.carga, em.sp(1f), peso = FontWeight.SemiBold)
                    Texto(f.cargaSub, em.sp(0.7f), APAGADO)
                }
            }
            f.metricas.forEach { (valor, etiqueta) ->
                Column(Modifier.align(Alignment.CenterVertically)) {
                    Texto(valor, em.sp(1.05f), peso = FontWeight.SemiBold)
                    Texto(etiqueta, em.sp(0.64f), APAGADO)
                }
            }
            Box(
                Modifier
                    .align(Alignment.CenterVertically)
                    .border(1.dp, LINEA, RoundedCornerShape(2.dp))
                    .clickable(onClick = alReiniciar)
                    .padding(horizontal = em.dp(0.6f), vertical = em.dp(0.15f))
                    .semantics { f.desde?.let { contentDescription = "${f.reiniciar}. $it" } },
            ) { Texto(f.reiniciar, em.sp(0.68f), APAGADO) }
        }
    }
}
