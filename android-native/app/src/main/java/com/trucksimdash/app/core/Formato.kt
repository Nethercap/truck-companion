package com.trucksimdash.app.core

import java.text.DateFormat
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Currency
import java.util.Locale
import java.util.TimeZone
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.roundToInt

const val KM_A_MILLAS = 0.621371
const val LITROS_A_GALONES = 0.264172

/** Con "Auto", millas en ATS y kilometros en ETS2, como el tablero de cada juego. */
fun usaMillas(unidades: Unidades, juego: String?): Boolean = when (unidades) {
    Unidades.Millas -> true
    Unidades.Kilometros -> false
    Unidades.Auto -> juego == "ats"
}

private fun numero(valor: Double, decimales: Int = 0): String =
    NumberFormat.getNumberInstance(Locale.getDefault()).run {
        minimumFractionDigits = decimales
        maximumFractionDigits = decimales
        format(valor)
    }

fun enteroLocal(valor: Number): String = numero(valor.toDouble())

fun velocidadEnUnidad(kmh: Double, millas: Boolean): Int =
    (if (millas) kmh * KM_A_MILLAS else kmh).roundToInt()

fun unidadVelocidad(millas: Boolean) = if (millas) "mph" else "km/h"

/** 1.234 km, o 12,5 km por debajo de los 100. */
fun distancia(km: Double, millas: Boolean): String {
    val valor = if (millas) km * KM_A_MILLAS else km
    val unidad = if (millas) "mi" else "km"
    return "${numero(valor, if (abs(valor) < 100) 1 else 0)} $unidad"
}

fun volumen(litros: Double, millas: Boolean): String =
    if (millas) "${numero(litros * LITROS_A_GALONES)} gal" else "${numero(litros)} L"

/** L/100 km, o mpg en imperial (formula estandar, como la web). */
fun consumo(litrosCada100: Double, millas: Boolean): String =
    if (millas) "${numero(235.215 / litrosCada100, 1)} mpg" else "${numero(litrosCada100, 1)} L/100km"

fun masa(kg: Double, millas: Boolean): String =
    if (millas) "${numero(kg * 2.20462)} lb" else if (kg >= 1000) "${numero(kg / 1000, 1)} t" else "${numero(kg)} kg"

/** 12 h 05 min, o 45 min si no llega a la hora. Nunca negativo. */
fun duracionMinutos(minutos: Double): String {
    val total = minutos.coerceAtLeast(0.0).roundToInt()
    val h = total / 60
    val m = total % 60
    return if (h > 0) "$h h ${m.toString().padStart(2, '0')} min" else "$m min"
}

/** El reloj del juego: minutos absolutos a dia de la semana (0 = lunes) y hora. */
fun relojDelJuego(minutos: Double, hora12: Boolean = false): Pair<Int, String> {
    val total = floor(minutos).toLong().coerceAtLeast(0)
    val dia = ((total / 1440) % 7).toInt()
    val delDia = (total % 1440).toInt()
    val h = delDia / 60
    val m = delDia % 60
    // formatClockHM en pure.js: 12 h vale para todos los relojes, tambien el del juego.
    if (hora12) return dia to "%d:%02d %s".format(Locale.ROOT, if (h % 12 == 0) 12 else h % 12, m, if (h < 12) "AM" else "PM")
    return dia to "%02d:%02d".format(Locale.ROOT, h, m)
}

/** "R" en reversa, "N" en punto muerto, el numero de la marcha si no. */
fun marcha(gear: Int?): String = when {
    gear == null -> "-"
    gear == 0 -> "N"
    gear < 0 -> if (gear == -1) "R" else "R${-gear}"
    else -> gear.toString()
}

/**
 * Plata con el simbolo de su moneda. Sin separar economias: quien llama pasa
 * una fila por moneda (la API nunca suma euros con dolares).
 */
fun plata(valor: Double, codigo: String?): String {
    val moneda = codigo?.let { runCatching { Currency.getInstance(it) }.getOrNull() }
        ?: return if (codigo != null) "${numero(valor)} $codigo" else numero(valor)
    return NumberFormat.getCurrencyInstance(Locale.getDefault()).run {
        currency = moneda
        maximumFractionDigits = 0
        format(valor)
    }
}

fun porcentaje(fraccion: Double): Int = (fraccion * 100).roundToInt()

fun porcentajeTexto(parte: Int, total: Int): String =
    if (total <= 0) "-" else "${(parte * 100.0 / total).roundToInt()} %"

/** Horas a "1.234 h", o minutos si no llega a una. */
fun duracionHoras(horas: Double): String =
    if (horas < 1) duracionMinutos(horas * 60) else "${numero(horas)} h"

/**
 * Una fecha de la API en la zona de quien mira. "2026-10-03" es un dia ya
 * calculado para esa zona (/trips/activity); con hora viene en UTC y se convierte.
 */
fun fechaCorta(iso: String): String {
    val fecha = runCatching {
        if (iso.length >= 19 && iso[10] == 'T') {
            SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.ROOT).apply { timeZone = TimeZone.getTimeZone("UTC") }.parse(iso.substring(0, 19))
        } else {
            SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).parse(iso.take(10))
        }
    }.getOrNull() ?: return iso.take(10)
    return DateFormat.getDateInstance(DateFormat.MEDIUM, Locale.getDefault()).format(fecha)
}
