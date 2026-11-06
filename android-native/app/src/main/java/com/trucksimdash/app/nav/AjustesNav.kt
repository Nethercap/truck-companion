package com.trucksimdash.app.nav

import androidx.compose.runtime.Immutable
import com.trucksimdash.app.core.comoObjeto
import com.trucksimdash.app.core.lista
import com.trucksimdash.app.core.logico
import com.trucksimdash.app.core.objeto
import com.trucksimdash.app.core.parsearObjeto
import com.trucksimdash.app.core.texto
import com.trucksimdash.app.core.entero
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject

@Immutable
data class OpcionNav(val id: String, val texto: String)

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
