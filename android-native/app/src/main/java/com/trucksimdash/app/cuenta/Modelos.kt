package com.trucksimdash.app.cuenta

import androidx.compose.runtime.Immutable
import com.trucksimdash.app.core.comoObjeto
import com.trucksimdash.app.core.entero
import com.trucksimdash.app.core.lista
import com.trucksimdash.app.core.logico
import com.trucksimdash.app.core.numero
import com.trucksimdash.app.core.objeto
import com.trucksimdash.app.core.texto
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

// Las respuestas de la API de cuentas (repo truckdash-loginapp, routes_trips.py
// y routes_driving.py). Lectura tolerante: la API puede salir antes que la app.

@Immutable
data class Usuario(val id: String?, val nombre: String?, val avatar: String?, val publico: Boolean)

@Immutable
data class PlataPorMoneda(
    val moneda: String?,
    val ingreso: Double,
    val peajes: Double,
    val multas: Double,
    val ferries: Double,
    val penalidades: Double,
)

@Immutable
data class FilaTop(val nombre: String, val viajes: Int)

@Immutable
data class Record(val valor: Double, val origen: String?, val destino: String?, val moneda: String?, val carga: String?)

@Immutable
data class ConsumoVehiculo(val nombre: String, val litrosCada100: Double, val km: Double)

@Immutable
data class ResumenJuego(
    val juego: String,
    val viajes: Int,
    val entregados: Int,
    val aTiempo: Int,
    val tarde: Int,
    val sinTerminar: Int,
    val modeados: Int,
    val km: Double,
    val horasReales: Double,
    val horasJuego: Double,
    val combustible: Double,
    val velocidadMax: Double?,
    val plata: List<PlataPorMoneda>,
    val paises: List<String>,
    val masLargoOrigen: String?,
    val masLargoDestino: String?,
    val masLargoKm: Double?,
    val camiones: List<FilaTop>,
    val cargas: List<FilaTop>,
    val empresas: List<FilaTop>,
    val ciudades: List<FilaTop>,
    val mejorPago: Record?,
    val mejorPromedio: Record?,
    val masPesado: Record?,
    val masEficiente: Record?,
    val consumoPorCamion: List<ConsumoVehiculo>,
)

@Immutable
data class TotalManejo(
    val juego: String,
    val sesiones: Int,
    val km: Double,
    val horasReales: Double,
    val horasJuego: Double,
    val velocidadMax: Double?,
)

@Immutable
data class Logro(val id: String, val desbloqueado: String?, val valor: Double?, val meta: Double?)

@Immutable
data class DiaActividad(val fecha: String, val juego: String, val km: Double, val horas: Double, val viajes: Int)

@Immutable
data class Viaje(
    val id: String,
    val juego: String?,
    val estado: String?,
    val ciudadOrigen: String?,
    val ciudadDestino: String?,
    val empresaOrigen: String?,
    val empresaDestino: String?,
    val carga: String?,
    val cargaKg: Double?,
    val pago: Double?,
    val moneda: String?,
    val modeado: Boolean,
    val camion: String?,
    val kmJuego: Double?,
    val kmMedidos: Double?,
    val empezado: String?,
    val aTiempo: Boolean?,
    val combustible: Double?,
    val velocidadMedia: Double?,
    val dano: Double?,
    val multas: Double?,
    val nota: String? = null,
) {
    /** La del juego cuando esta (se sabe al entregar) y la medida mientras tanto. */
    val km: Double? get() = kmJuego ?: kmMedidos
}

private fun filasTop(o: JsonObject?, clave: String): List<FilaTop> =
    o?.lista(clave)?.mapNotNull { f ->
        val p = f.comoObjeto() ?: return@mapNotNull null
        FilaTop(p.texto("name") ?: return@mapNotNull null, p.entero("trips") ?: 0)
    } ?: emptyList()

private fun record(o: JsonObject?, clave: String): Record? {
    val r = o?.objeto(clave) ?: return null
    return Record(r.numero("value") ?: return null, r.texto("city_src"), r.texto("city_dst"), r.texto("currency"), r.texto("cargo"))
}

internal fun parsearUsuario(d: JsonObject?): Usuario? {
    val u = d?.objeto("usuario") ?: return null
    return Usuario(u.texto("id"), u.texto("username"), u.texto("avatar_url"), u.logico("is_public") ?: false)
}

internal fun parsearResumenes(d: JsonObject?): List<ResumenJuego> =
    d?.lista("stats")?.mapNotNull { fila ->
        val s = fila.comoObjeto() ?: return@mapNotNull null
        val top = s.objeto("top")
        val records = s.objeto("records")
        val largo = s.objeto("longest")
        ResumenJuego(
            juego = s.texto("game") ?: return@mapNotNull null,
            viajes = s.entero("trips") ?: 0,
            entregados = s.entero("delivered") ?: 0,
            aTiempo = s.entero("on_time") ?: 0,
            tarde = s.entero("late") ?: 0,
            sinTerminar = s.entero("unfinished") ?: 0,
            modeados = s.entero("modded") ?: 0,
            km = s.numero("distance_km") ?: 0.0,
            horasReales = s.numero("real_hours") ?: 0.0,
            horasJuego = s.numero("game_hours") ?: 0.0,
            combustible = s.numero("fuel_used") ?: 0.0,
            velocidadMax = s.numero("max_speed"),
            plata = s.lista("money")?.mapNotNull { m ->
                val p = m.comoObjeto() ?: return@mapNotNull null
                PlataPorMoneda(
                    p.texto("currency"),
                    p.numero("revenue") ?: 0.0,
                    p.numero("tolls") ?: 0.0,
                    p.numero("fines") ?: 0.0,
                    p.numero("ferries") ?: 0.0,
                    p.numero("penalties") ?: 0.0,
                )
            } ?: emptyList(),
            paises = s.lista("countries")?.mapNotNull { (it as? JsonPrimitive)?.content } ?: emptyList(),
            masLargoOrigen = largo?.texto("city_src"),
            masLargoDestino = largo?.texto("city_dst"),
            masLargoKm = largo?.numero("distance_km"),
            camiones = filasTop(top, "trucks"),
            cargas = filasTop(top, "cargo"),
            empresas = filasTop(top, "companies"),
            ciudades = filasTop(top, "cities"),
            mejorPago = record(records, "best_pay"),
            mejorPromedio = record(records, "best_avg_speed"),
            masPesado = record(records, "heaviest"),
            masEficiente = record(records, "most_efficient"),
            consumoPorCamion = s.lista("fuel_by_truck")?.mapNotNull { f ->
                val p = f.comoObjeto() ?: return@mapNotNull null
                ConsumoVehiculo(p.texto("name") ?: return@mapNotNull null, p.numero("l_per_100km") ?: 0.0, p.numero("distance_km") ?: 0.0)
            } ?: emptyList(),
        )
    } ?: emptyList()

internal fun parsearTotales(d: JsonObject?): List<TotalManejo> =
    d?.lista("totals")?.mapNotNull { fila ->
        val t = fila.comoObjeto() ?: return@mapNotNull null
        TotalManejo(
            t.texto("game") ?: return@mapNotNull null,
            t.entero("sessions") ?: 0,
            t.numero("distance_km") ?: 0.0,
            t.numero("real_hours") ?: 0.0,
            t.numero("game_hours") ?: 0.0,
            t.numero("max_speed"),
        )
    } ?: emptyList()

internal fun parsearLogros(d: JsonObject?): List<Logro> =
    d?.lista("achievements")?.mapNotNull { fila ->
        val l = fila.comoObjeto() ?: return@mapNotNull null
        val p = l.objeto("progress")
        Logro(l.texto("id") ?: return@mapNotNull null, l.texto("unlocked_at"), p?.numero("value"), p?.numero("goal"))
    } ?: emptyList()

internal fun parsearActividad(d: JsonObject?): List<DiaActividad> =
    d?.lista("days")?.mapNotNull { fila ->
        val a = fila.comoObjeto() ?: return@mapNotNull null
        DiaActividad(
            a.texto("date") ?: return@mapNotNull null,
            a.texto("game") ?: return@mapNotNull null,
            a.numero("distance_km") ?: 0.0,
            a.numero("real_hours") ?: 0.0,
            a.entero("trips") ?: 0,
        )
    } ?: emptyList()

internal fun parsearViajes(d: JsonObject?): Pair<List<Viaje>, Int> {
    val viajes = parsearViajeLista(d?.lista("trips"))
    return viajes to (d?.entero("total") ?: viajes.size)
}

internal fun parsearViajeLista(lista: List<kotlinx.serialization.json.JsonElement>?): List<Viaje> =
    lista?.mapNotNull { fila ->
        val v = fila.comoObjeto() ?: return@mapNotNull null
        Viaje(
            id = v.texto("id") ?: return@mapNotNull null,
            juego = v.texto("game"),
            estado = v.texto("status"),
            ciudadOrigen = v.texto("city_src"),
            ciudadDestino = v.texto("city_dst"),
            empresaOrigen = v.texto("company_src"),
            empresaDestino = v.texto("company_dst"),
            carga = v.texto("cargo"),
            cargaKg = v.numero("cargo_mass"),
            pago = v.numero("revenue"),
            moneda = v.texto("currency"),
            modeado = v.logico("modded") ?: false,
            camion = listOfNotNull(v.texto("truck_brand"), v.texto("truck_name")).joinToString(" ").ifBlank { null },
            kmJuego = v.numero("distance_game_km"),
            kmMedidos = v.numero("distance_tracked_km"),
            empezado = v.texto("started_at"),
            aTiempo = v.logico("on_time"),
            combustible = v.numero("fuel_used"),
            velocidadMedia = v.numero("avg_speed"),
            dano = v.numero("damage_delta"),
            multas = v.numero("fines"),
            nota = v.texto("note"),
        )
    } ?: emptyList()
