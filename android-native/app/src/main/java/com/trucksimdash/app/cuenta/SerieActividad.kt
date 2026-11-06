package com.trucksimdash.app.cuenta

import androidx.compose.runtime.Immutable
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

@Immutable
data class BarraDia(val fecha: String, val km: Double, val viajes: Int)

/**
 * Los ultimos [dias] dias de un juego, uno por uno y con los vacios en cero: la API
 * solo manda los dias con algo, y un dia sin manejar tambien es un dato del grafico.
 */
internal fun serieActividad(actividad: List<DiaActividad>, juego: String, dias: Int, hoy: Calendar): List<BarraDia> {
    val porFecha = actividad.filter { it.juego == juego }.associateBy { it.fecha }
    val formato = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).apply { timeZone = hoy.timeZone }
    val cursor = hoy.clone() as Calendar
    cursor.add(Calendar.DAY_OF_YEAR, -(dias - 1))
    return List(dias) {
        val fecha = formato.format(cursor.time)
        cursor.add(Calendar.DAY_OF_YEAR, 1)
        val d = porFecha[fecha]
        BarraDia(fecha, d?.km ?: 0.0, d?.viajes ?: 0)
    }
}
