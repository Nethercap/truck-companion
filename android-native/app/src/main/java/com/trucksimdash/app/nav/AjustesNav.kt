package com.trucksimdash.app.nav

import androidx.compose.runtime.Immutable
import com.trucksimdash.app.core.comoObjeto
import com.trucksimdash.app.core.lista
import com.trucksimdash.app.core.logico
import com.trucksimdash.app.core.objeto
import com.trucksimdash.app.core.parsearObjeto
import com.trucksimdash.app.core.texto
import com.trucksimdash.app.core.entero
import com.trucksimdash.app.core.numero
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import java.util.Currency
import java.util.Locale

@Immutable
data class OpcionNav(val id: String, val texto: String)

@Immutable
data class TildeNav(val id: String, val texto: String, val activo: Boolean)

/**
 * Lo de Ajustes que cambia como se dibuja el mapa. Lo guarda la web como todos sus ajustes; se
 * lee tambien sin esperar al motor, porque el mapa nace antes y liviano no cambia despues.
 */
@Immutable
data class AparienciaMapa(
    val colorRuta: String = "#a30000",
    val tamanoCamion: Double = 1.0,
    val baseReal: Boolean = true,
    val liviano: Boolean = false,
    val desvanecerBotones: Boolean = true,
    val mantenerBrujula: Boolean = true,
)

/** truckdash_settings tal como lo escribe saveSettings, con los valores por defecto de app.js. */
internal fun aparienciaGuardada(texto: String?): AparienciaMapa {
    val d = texto?.let(::parsearObjeto) ?: return AparienciaMapa()
    val liviano = d.logico("liteMode") ?: false
    return AparienciaMapa(
        colorRuta = d.texto("routeColor") ?: "#a30000",
        tamanoCamion = d.numero("truckSize") ?: 1.0,
        baseReal = d.logico("realBase") ?: !liviano,
        liviano = liviano,
        desvanecerBotones = d.logico("fadeButtons") ?: true,
        mantenerBrujula = d.logico("keepCompass") ?: true,
    )
}

@Immutable
data class DlcNav(val id: String, val nombre: String, val activo: Boolean)

@Immutable
data class JuegoDlc(val juego: String, val titulo: String, val lista: List<DlcNav>)

/**
 * Los ajustes de navegacion, tal como los tiene la web: ella los guarda y los usa, y el
 * perfil y los DLC los cambia tambien otro dispositivo de la sesion. Aca solo se muestran,
 * con sus textos en los ocho idiomas.
 */
@Immutable
data class AjustesNav(
    val perfil: String,
    val voces: List<OpcionNav>,
    val voz: String?,
    val momentos: List<OpcionNav>,
    val momento: String,
    val descansos: List<OpcionNav>,
    val descanso: String,
    val cadaSalida: Boolean,
    val moneda: String,
    val monedas: List<OpcionNav>,
    val reloj: String,
    val relojes: List<OpcionNav>,
    val colorRuta: String,
    val colores: List<OpcionNav>,
    val zoomNav: Double,
    val zoomDefecto: Double,
    val tamanoCamion: Double,
    val tamanoDefecto: Double,
    val baseReal: Boolean,
    val liviano: Boolean,
    val livianoSinRuteo: Boolean,
    val desvanecerBotones: Boolean,
    val mantenerBrujula: Boolean,
    val rutaEnVivo: Boolean,
    val miniHud: List<TildeNav>,
    val dlcAuto: Boolean,
    val dlcEstado: String,
    val dlc: List<JuegoDlc>,
    val textos: Map<String, String>,
) {
    fun t(clave: String): String = textos[clave] ?: clave
}

@Immutable
data class FormularioReporte(
    /** Lo que se manda, tal cual: se muestra antes de mandarlo. */
    val reporte: String,
    val hayAvisos: Boolean,
    val tipos: List<OpcionNav>,
    val maximo: Int,
    val textos: Map<String, String>,
) {
    fun t(clave: String): String = textos[clave] ?: clave
}

/** falta, confirmar, mandando, mandado, muchos o fallo; [boton] cambia el texto de mandar. */
@Immutable
data class EstadoReporte(val estado: String, val texto: String, val boton: String?)

private fun opciones(d: JsonObject, clave: String): List<OpcionNav> =
    d.lista(clave).opciones()

private fun JsonArray?.opciones(): List<OpcionNav> = this?.mapNotNull { fila ->
    val o = fila.comoObjeto() ?: return@mapNotNull null
    OpcionNav(o.texto("id") ?: return@mapNotNull null, o.texto("label").orEmpty())
} ?: emptyList()

private fun textosDe(d: JsonObject): Map<String, String> {
    val o = d.objeto("textos") ?: return emptyMap()
    return o.keys.associateWith { o.texto(it).orEmpty() }
}

/** "ARS — peso argentino": la web lo saca de Intl, que en el motor es de mentira. */
private fun etiquetaMoneda(codigo: String): String {
    val nombre = runCatching { Currency.getInstance(codigo).getDisplayName(Locale.getDefault()) }.getOrNull()
    return if (nombre != null && nombre != codigo) "$codigo — $nombre" else codigo
}

internal fun parsearAjustesNav(texto: String): AjustesNav? {
    val d = parsearObjeto(texto) ?: return null
    return AjustesNav(
        perfil = d.texto("perfil") ?: "fastest",
        voces = opciones(d, "voces"),
        voz = d.texto("voz"),
        momentos = opciones(d, "momentos"),
        momento = d.texto("momento") ?: "normal",
        descansos = opciones(d, "descansos"),
        descanso = d.texto("descanso").orEmpty(),
        cadaSalida = d.logico("cadaSalida") ?: false,
        moneda = d.texto("moneda") ?: "auto",
        monedas = d.lista("monedas")?.mapNotNull { fila ->
            val o = fila.comoObjeto() ?: return@mapNotNull null
            val id = o.texto("id") ?: return@mapNotNull null
            OpcionNav(id, if (o.logico("codigo") == true) etiquetaMoneda(id) else o.texto("label").orEmpty())
        } ?: emptyList(),
        reloj = d.texto("reloj") ?: "auto",
        relojes = opciones(d, "relojes"),
        colorRuta = d.texto("colorRuta") ?: "#a30000",
        colores = opciones(d, "colores"),
        zoomNav = d.numero("zoomNav") ?: 10.0,
        zoomDefecto = d.numero("zoomDefecto") ?: 10.0,
        tamanoCamion = d.numero("tamanoCamion") ?: 1.0,
        tamanoDefecto = d.numero("tamanoDefecto") ?: 1.0,
        baseReal = d.logico("baseReal") ?: true,
        liviano = d.logico("liviano") ?: false,
        livianoSinRuteo = d.logico("livianoSinRuteo") ?: false,
        desvanecerBotones = d.logico("desvanecerBotones") ?: true,
        mantenerBrujula = d.logico("mantenerBrujula") ?: true,
        rutaEnVivo = d.logico("rutaEnVivo") ?: true,
        miniHud = d.lista("miniHud")?.mapNotNull { fila ->
            val o = fila.comoObjeto() ?: return@mapNotNull null
            TildeNav(o.texto("id") ?: return@mapNotNull null, o.texto("label").orEmpty(), o.logico("activo") ?: false)
        } ?: emptyList(),
        dlcAuto = d.logico("dlcAuto") ?: true,
        dlcEstado = d.texto("dlcEstado").orEmpty(),
        dlc = d.lista("dlc")?.mapNotNull { fila ->
            val j = fila.comoObjeto() ?: return@mapNotNull null
            JuegoDlc(
                j.texto("juego") ?: return@mapNotNull null,
                j.texto("titulo").orEmpty(),
                j.lista("lista")?.mapNotNull { x ->
                    val o = x.comoObjeto() ?: return@mapNotNull null
                    DlcNav(o.texto("id") ?: return@mapNotNull null, o.texto("nombre").orEmpty(), o.logico("activo") ?: true)
                } ?: emptyList(),
            )
        } ?: emptyList(),
        textos = textosDe(d),
    )
}

internal fun parsearFormularioReporte(texto: String): FormularioReporte? {
    val d = parsearObjeto(texto) ?: return null
    return FormularioReporte(
        reporte = d.texto("reporte").orEmpty(),
        hayAvisos = d.logico("hayAvisos") ?: false,
        tipos = opciones(d, "tipos"),
        maximo = d.entero("maximo") ?: 1000,
        textos = textosDe(d),
    )
}
