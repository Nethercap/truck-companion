package com.trucksimdash.app.telemetria

import androidx.compose.runtime.Immutable
import com.trucksimdash.app.core.comoObjeto
import com.trucksimdash.app.core.entero
import com.trucksimdash.app.core.identificador
import com.trucksimdash.app.core.lista
import com.trucksimdash.app.core.logico
import com.trucksimdash.app.core.numero
import com.trucksimdash.app.core.objeto
import com.trucksimdash.app.core.parsearObjeto
import com.trucksimdash.app.core.texto
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlin.math.hypot

enum class Fase { Apagada, Conectando, Abierta, Reintentando, CodigoInvalido }

/** Lo que el juego tiene activo, por juego. null = todavia no se sabe. */
typealias ModsDetectados = Map<String, Set<String>?>

@Immutable
data class JugadorCerca(val id: String, val x: Double, val z: Double)

@Immutable
data class EstadoSesion(
    val fase: Fase = Fase.Apagada,
    /** La demo de la web: los datos no vienen de una PC. */
    val demo: Boolean = false,
    /** Hay un cliente de la PC del otro lado (`client_connected`). */
    val pcConectada: Boolean = false,
    /** `status` del cliente: "live" con el juego andando. */
    val estadoPc: String? = null,
    val detallePc: String? = null,
    val telemetria: Telemetria? = null,
    /** Llego telemetria desde que el cliente dijo que estaba en vivo. */
    val enVivo: Boolean = false,
    /** Lo que dice el relay de compartir la posicion; null = no dijo nada. */
    val compartiendo: Boolean? = null,
    val otros: List<JugadorCerca> = emptyList(),
    val jugadoresTmp: List<JugadorTmp> = emptyList(),
    val tmpHastaMs: Long = 0,
    val mods: ModsDetectados? = null,
    val rastro: List<PuntoRastro> = emptyList(),
    /** Se recibio algo de este codigo: si despues da 4404, fue un redeploy. */
    val codigoValidado: Boolean = false,
)

@Immutable
data class PuntoRastro(val x: Double, val z: Double)

/** Avisos de un momento; la pantalla los muestra y se olvidan. */
sealed interface AvisoSesion {
    data class ComandoFallo(val razon: String?) : AvisoSesion
    data class Multa(val monto: Double?) : AvisoSesion
}

sealed interface MensajeRelay {
    data class DatosTelemetria(val t: Telemetria) : MensajeRelay
    data class EstadoDeSesion(
        val pcConectada: Boolean,
        val estado: EstadoPc?,
        /** Solo por LAN: lo que el cliente sabe del tilde de compartir. */
        val compartiendo: Boolean?,
    ) : MensajeRelay
    data class EstadoCliente(val estado: EstadoPc) : MensajeRelay
    data class Compartir(val activo: Boolean) : MensajeRelay
    data class JugadoresCerca(val lista: List<JugadorCerca>) : MensajeRelay
    data class ResultadoComando(val ok: Boolean, val razon: String?) : MensajeRelay
    /** Las teclas de cada comando: viven en keybinds.json, en la PC. */
    data class Teclas(val teclas: Map<String, String>) : MensajeRelay
    /** Un type que esta version no conoce: se ignora, nunca es telemetria. */
    data object Otro : MensajeRelay
}

@Immutable
data class EstadoPc(
    val estado: String?,
    val detalle: String?,
    val mods: ModsDetectados?,
    val mapasLocales: Map<String, MapaLocal> = emptyMap(),
    val puertoMapas: Int? = null,
)

/** Un mapa armado con "Build my map": `localMaps` en client_status. */
@Immutable
data class MapaLocal(val variante: String, val huella: String, val conLogos: Boolean)

private fun parsearMapasLocales(o: JsonObject?): Map<String, MapaLocal> {
    if (o == null) return emptyMap()
    return o.entries.mapNotNull { (juego, valor) ->
        val m = valor.comoObjeto() ?: return@mapNotNull null
        val variante = m.texto("variant") ?: return@mapNotNull null
        val huella = m.texto("fingerprint") ?: return@mapNotNull null
        juego to MapaLocal(variante, huella, (m.numero("companyIcons") ?: 0.0) > 0)
    }.toMap()
}

private fun parsearMods(o: JsonObject?): ModsDetectados? {
    if (o == null) return null
    return o.mapValues { (_, valor) ->
        if (valor is JsonNull) {
            null
        } else {
            valor.comoObjeto()?.entries
                ?.filter { (_, v) -> runCatching { v.jsonPrimitive.booleanOrNull }.getOrNull() == true }
                ?.map { it.key }
                ?.toSet()
        }
    }
}

private fun parsearEstadoPc(o: JsonObject) = EstadoPc(
    estado = o.texto("status"),
    detalle = o.texto("detail"),
    mods = parsearMods(o.objeto("mapMods")),
    mapasLocales = parsearMapasLocales(o.objeto("localMaps")),
    puertoMapas = o.entero("localMapPort"),
)

/** Un mensaje del socket, relay o LAN: hablan el mismo protocolo. */
internal fun interpretarMensaje(texto: String): MensajeRelay? {
    val d = parsearObjeto(texto) ?: return null
    return when (d.texto("type")) {
        null -> MensajeRelay.DatosTelemetria(parsearTelemetria(d))
        "session_state" -> MensajeRelay.EstadoDeSesion(
            pcConectada = d.logico("client_connected") ?: false,
            estado = d.objeto("client_status")?.let(::parsearEstadoPc),
            compartiendo = d.logico("liveShare"),
        )
        "client_status" -> MensajeRelay.EstadoCliente(parsearEstadoPc(d))
        "live_share_state" -> d.logico("enabled")?.let(MensajeRelay::Compartir) ?: MensajeRelay.Otro
        "live_players" -> MensajeRelay.JugadoresCerca(
            d.lista("players")?.mapNotNull { fila ->
                val p = fila.comoObjeto() ?: return@mapNotNull null
                JugadorCerca(
                    p.identificador("id") ?: return@mapNotNull null,
                    p.numero("x") ?: return@mapNotNull null,
                    p.numero("z") ?: return@mapNotNull null,
                )
            } ?: emptyList(),
        )
        "command_result" -> MensajeRelay.ResultadoComando(d.logico("ok") ?: false, d.texto("reason"))
        "keybinds" -> {
            val o = d.objeto("data")
            MensajeRelay.Teclas(o?.keys?.mapNotNull { k -> o.texto(k)?.let { k to it } }?.toMap().orEmpty())
        }
        else -> MensajeRelay.Otro
    }
}

// holdDetectedMods en pure.js: el cliente manda null por un juego mientras
// relee el log; no se pierde lo que ya se sabia de ese juego.
internal fun mantenerMods(previo: ModsDetectados?, nuevo: ModsDetectados?): ModsDetectados? {
    if (nuevo == null) return previo
    return nuevo.mapValues { (juego, valor) -> valor ?: previo?.get(juego) }
}

private fun EstadoSesion.conEstadoPc(pc: EstadoPc): EstadoSesion = copy(
    pcConectada = true,
    estadoPc = pc.estado,
    detallePc = pc.detalle,
    mods = mantenerMods(mods, pc.mods),
    enVivo = enVivo && pc.estado == "live",
)

// Del rastro del camion: se anota cada tanto y un salto (ferry, teletransporte
// con el editor, cargar otra partida) lo empieza de nuevo.
private const val RASTRO_PASO = 40.0
private const val RASTRO_SALTO = 6000.0
private const val RASTRO_MAX = 1500

internal fun sumarAlRastro(rastro: List<PuntoRastro>, x: Double, z: Double): List<PuntoRastro> {
    val ultimo = rastro.lastOrNull() ?: return listOf(PuntoRastro(x, z))
    val paso = hypot(x - ultimo.x, z - ultimo.z)
    return when {
        paso < RASTRO_PASO -> rastro
        paso > RASTRO_SALTO -> listOf(PuntoRastro(x, z))
        rastro.size >= RASTRO_MAX -> rastro.drop(1) + PuntoRastro(x, z)
        else -> rastro + PuntoRastro(x, z)
    }
}

internal const val TMP_VENCE_MS = 5000L

/** Aplica un mensaje al estado. Puro: lo que se muestra sale solo de aca. */
internal fun EstadoSesion.aplicar(m: MensajeRelay, ahoraMs: Long): EstadoSesion = when (m) {
    is MensajeRelay.DatosTelemetria -> {
        val t = m.t
        val hayTmp = t.jugadoresTmp != null
        copy(
            telemetria = t,
            enVivo = true,
            codigoValidado = true,
            rastro = if (t.x != null && t.z != null) sumarAlRastro(rastro, t.x, t.z) else rastro,
            jugadoresTmp = t.jugadoresTmp ?: jugadoresTmp,
            tmpHastaMs = if (hayTmp) ahoraMs + TMP_VENCE_MS else tmpHastaMs,
        )
    }
    is MensajeRelay.EstadoDeSesion -> {
        val base = copy(
            codigoValidado = true,
            pcConectada = m.pcConectada,
            enVivo = enVivo && m.pcConectada,
            compartiendo = m.compartiendo ?: compartiendo,
        )
        if (m.estado != null) {
            base.conEstadoPc(m.estado).copy(pcConectada = m.pcConectada, enVivo = base.enVivo && m.estado.estado == "live")
        } else {
            base
        }
    }
    is MensajeRelay.EstadoCliente -> copy(codigoValidado = true).conEstadoPc(m.estado)
    is MensajeRelay.Compartir -> copy(codigoValidado = true, compartiendo = m.activo)
    is MensajeRelay.JugadoresCerca -> copy(codigoValidado = true, otros = m.lista)
    is MensajeRelay.Teclas,
    is MensajeRelay.ResultadoComando, MensajeRelay.Otro -> copy(codigoValidado = true)
}

/** Los pulsos del SDK que merecen un aviso. */
internal fun avisosDe(t: Telemetria): List<AvisoSesion> = buildList {
    if (t.evento.multa) add(AvisoSesion.Multa(t.evento.montoMulta))
}

// ------------------------------------------------------------ reconexion

internal const val DEMORA_BASE_MS = 3000L
internal const val DEMORA_MAX_MS = 15000L
internal const val CODIGO_DESCONOCIDO = 4404

/** Un minuto esperando a un codigo guardado: REMEMBERED_MAX_TRIES en app.js. */
internal const val INTENTOS_CODIGO_GUARDADO = 20

internal sealed interface TrasCierre {
    data class Reintentar(val demoraMs: Long) : TrasCierre
    data object CodigoInvalido : TrasCierre
}

/**
 * Que hacer cuando se cierra el socket. El relay guarda las sesiones en memoria:
 * un 4404 con un codigo que ya habia mandado datos es un redeploy, y el cliente
 * lo recrea en segundos. Si nunca llego nada, es un codigo mal tipeado o
 * vencido; salvo que venga guardado de otra vez: ahi solo falta abrir el cliente
 * en la PC, y se espera un rato antes de darlo por muerto.
 */
internal fun decidirTrasCierre(
    codigoCierre: Int,
    codigoValidado: Boolean,
    codigoGuardado: Boolean,
    intento: Int,
): TrasCierre {
    if (codigoCierre == CODIGO_DESCONOCIDO && !codigoValidado) {
        if (!codigoGuardado || intento >= INTENTOS_CODIGO_GUARDADO) return TrasCierre.CodigoInvalido
        return TrasCierre.Reintentar(DEMORA_BASE_MS)
    }
    val demora = DEMORA_BASE_MS shl (intento - 1).coerceIn(0, 3)
    return TrasCierre.Reintentar(demora.coerceAtMost(DEMORA_MAX_MS))
}
