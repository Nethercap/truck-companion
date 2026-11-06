package com.trucksimdash.app.telemetria

import androidx.compose.runtime.Immutable
import com.trucksimdash.app.core.identificador
import com.trucksimdash.app.core.lista
import com.trucksimdash.app.core.logico
import com.trucksimdash.app.core.entero
import com.trucksimdash.app.core.comoObjeto
import com.trucksimdash.app.core.numero
import com.trucksimdash.app.core.objeto
import com.trucksimdash.app.core.texto
import kotlinx.serialization.json.JsonObject

@Immutable
data class Desgaste(
    val motor: Double? = null,
    val transmision: Double? = null,
    val cabina: Double? = null,
    val chasis: Double? = null,
    val ruedas: Double? = null,
)

@Immutable
data class Luces(
    val bajas: Boolean = false,
    val altas: Boolean = false,
    val balizas: Boolean = false,
    val baliza: Boolean = false,
    val giroIzquierda: Boolean = false,
    val giroDerecha: Boolean = false,
    val posicion: Boolean = false,
)

@Immutable
data class Alertas(
    val aire: Boolean = false,
    val agua: Boolean = false,
    val bateria: Boolean = false,
    val aceite: Boolean = false,
    val combustible: Boolean = false,
    val adblue: Boolean = false,
) {
    val alguna: Boolean get() = aire || agua || bateria || aceite || combustible || adblue
}

/** Pulsos del SDK: cada uno vale un solo mensaje. */
@Immutable
data class Evento(
    val multa: Boolean = false,
    val montoMulta: Double? = null,
    val entregado: Boolean = false,
    val pagoEntrega: Double? = null,
    val cancelado: Boolean = false,
    val penalidad: Double? = null,
)

@Immutable
data class JugadorTmp(val id: String, val nombre: String, val x: Double, val z: Double, val rumbo: Double)

/**
 * Un mensaje de telemetria del cliente de la PC (`build_payload` en
 * client/client.py). Todo es opcional salvo lo que tiene una lectura obvia sin
 * dato: un cliente viejo no manda los campos nuevos.
 */
@Immutable
data class Telemetria(
    val juego: String? = null,
    val pausado: Boolean = false,
    /** En coordenadas del juego; null si no hay camion (ver [posicionEnOrigen]). */
    val x: Double? = null,
    val z: Double? = null,
    /** Brujula sobre la grilla del juego: 0 = -z, 90 = +x. */
    val rumbo: Double? = null,
    val velocidadKmh: Double = 0.0,
    val limiteKmh: Double = 0.0,
    val rpm: Double? = null,
    val rpmMax: Double? = null,
    val marcha: Int? = null,
    val crucero: Boolean = false,
    val cruceroKmh: Double = 0.0,
    val motorEncendido: Boolean = false,
    val frenoMano: Boolean = false,
    val diferencial: Boolean = false,
    val ejeElevado: Boolean = false,
    val frenoMotor: Boolean = false,
    val retarder: Int = 0,
    val retarderPasos: Int = 0,
    val limpiaparabrisas: Boolean = false,
    val luces: Luces = Luces(),
    val alertas: Alertas = Alertas(),
    val combustible: Double? = null,
    val combustibleMax: Double? = null,
    val autonomiaKm: Double? = null,
    val consumoLitrosCada100: Double? = null,
    val rutaKm: Double = 0.0,
    val rutaSegundos: Double? = null,
    val descansoMinutos: Double? = null,
    val relojMinutos: Double? = null,
    val plazoSegundos: Double? = null,
    val enTrabajo: Boolean = false,
    val carga: String? = null,
    val cargaKg: Double? = null,
    val danoCarga: Double? = null,
    val ciudadOrigen: String? = null,
    val ciudadDestino: String? = null,
    val empresaOrigen: String? = null,
    val empresaDestino: String? = null,
    val pagoTrabajo: Double? = null,
    val marca: String? = null,
    val modelo: String? = null,
    val odometroKm: Double? = null,
    val remolqueEnganchado: Boolean = false,
    val desgaste: Desgaste = Desgaste(),
    val desgasteRemolque: Double? = null,
    val evento: Evento = Evento(),
    val jugadoresTmp: List<JugadorTmp>? = null,
) {
    val fraccionCombustible: Double?
        get() = if (combustible != null && combustibleMax != null && combustibleMax > 0) {
            (combustible / combustibleMax).coerceIn(0.0, 1.0)
        } else {
            null
        }

    val excedido: Boolean get() = limiteKmh > 0 && velocidadKmh > limiteKmh + 1

    val tienePosicion: Boolean get() = x != null && z != null
}

/**
 * El camion en 0,0 exacto no es un lugar: es un dato del plugin sin el camion
 * (`positionAtOrigin` en pure.js). Se trata como un dato sin posicion.
 */
internal fun posicionEnOrigen(x: Double?, z: Double?): Boolean = x == 0.0 && z == 0.0

private fun promedioDesgaste(o: JsonObject?): Double? {
    // El cliente lo manda como objeto con las piezas o, en versiones viejas, nada.
    if (o == null) return null
    val partes = listOfNotNull(o.numero("chassis"), o.numero("wheels"), o.numero("body"))
    return partes.maxOrNull()
}

internal fun parsearTelemetria(d: JsonObject): Telemetria {
    val posicion = d.objeto("position")
    val px = posicion?.numero("x")
    val pz = posicion?.numero("z")
    val sinCamion = posicionEnOrigen(px, pz)
    val luces = d.objeto("lights")
    val alertas = d.objeto("mechanicalWarnings")
    val desgaste = d.objeto("wear")
    val evento = d.objeto("event")
    return Telemetria(
        juego = d.texto("game"),
        pausado = d.logico("paused") ?: false,
        x = px.takeUnless { sinCamion },
        z = pz.takeUnless { sinCamion },
        rumbo = d.numero("heading"),
        velocidadKmh = d.numero("speedKmh") ?: 0.0,
        limiteKmh = d.numero("speedLimitKmh") ?: 0.0,
        rpm = d.numero("engineRpm"),
        rpmMax = d.numero("engineRpmMax"),
        marcha = d.entero("gear"),
        crucero = d.logico("cruiseControl") ?: false,
        cruceroKmh = d.numero("cruiseControlSpeedKmh") ?: 0.0,
        motorEncendido = d.logico("engineEnabled") ?: false,
        frenoMano = d.logico("parkingBrake") ?: false,
        diferencial = d.logico("differentialLock") ?: false,
        ejeElevado = d.logico("liftAxle") ?: false,
        frenoMotor = d.logico("motorBrake") ?: false,
        retarder = d.entero("retarder") ?: 0,
        retarderPasos = d.entero("retarderSteps") ?: 0,
        limpiaparabrisas = d.logico("wipers") ?: false,
        luces = Luces(
            bajas = luces?.logico("beamLow") ?: false,
            altas = luces?.logico("beamHigh") ?: false,
            balizas = luces?.logico("hazards") ?: false,
            baliza = luces?.logico("beacon") ?: false,
            giroIzquierda = luces?.logico("blinkerLeft") ?: false,
            giroDerecha = luces?.logico("blinkerRight") ?: false,
            posicion = luces?.logico("parking") ?: false,
        ),
        alertas = Alertas(
            aire = alertas?.logico("airPressure") ?: false,
            agua = alertas?.logico("waterTemperature") ?: false,
            bateria = alertas?.logico("batteryVoltage") ?: false,
            aceite = alertas?.logico("oilPressure") ?: false,
            combustible = alertas?.logico("fuel") ?: false,
            adblue = alertas?.logico("adblue") ?: false,
        ),
        combustible = d.numero("fuel"),
        combustibleMax = d.numero("fuelCapacity"),
        autonomiaKm = d.numero("fuelRangeKm"),
        consumoLitrosCada100 = d.numero("fuelAvgConsumption"),
        rutaKm = d.numero("routeDistanceKm") ?: 0.0,
        rutaSegundos = d.numero("routeTimeSeconds"),
        // restStopSeconds es el nombre viejo y mal puesto: los dos traen minutos.
        descansoMinutos = d.numero("restStopMinutes") ?: d.numero("restStopSeconds"),
        relojMinutos = d.numero("gameTimeMinutes"),
        plazoSegundos = d.numero("jobDeadlineSeconds"),
        enTrabajo = d.logico("onJob") ?: false,
        carga = d.texto("cargo"),
        cargaKg = d.numero("cargoMassKg"),
        danoCarga = d.numero("cargoDamage"),
        ciudadOrigen = d.texto("citySrc"),
        ciudadDestino = d.texto("cityDst"),
        empresaOrigen = d.texto("companySrc"),
        empresaDestino = d.texto("companyDst"),
        pagoTrabajo = d.numero("jobIncome"),
        marca = d.texto("truckBrand"),
        modelo = d.texto("truckName"),
        odometroKm = d.numero("odometerKm"),
        remolqueEnganchado = d.logico("trailerAttached") ?: false,
        desgaste = Desgaste(
            motor = desgaste?.numero("engine"),
            transmision = desgaste?.numero("transmission"),
            cabina = desgaste?.numero("cabin"),
            chasis = desgaste?.numero("chassis"),
            ruedas = desgaste?.numero("wheels"),
        ),
        desgasteRemolque = promedioDesgaste(d.objeto("trailerWear")),
        evento = Evento(
            multa = evento?.logico("fined") ?: false,
            montoMulta = evento?.numero("fineAmount"),
            entregado = evento?.logico("jobDelivered") ?: false,
            pagoEntrega = evento?.numero("jobDeliveredRevenue"),
            cancelado = evento?.logico("jobCancelled") ?: false,
            penalidad = evento?.numero("jobCancelledPenalty"),
        ),
        jugadoresTmp = d.lista("tmpPlayers")?.mapNotNull { fila ->
            val p = fila.comoObjeto() ?: return@mapNotNull null
            val id = p.identificador("id") ?: return@mapNotNull null
            val x = p.numero("x") ?: return@mapNotNull null
            val z = p.numero("z") ?: return@mapNotNull null
            JugadorTmp(id, p.texto("name")?.take(64) ?: "", x, z, p.numero("heading") ?: 0.0)
        }?.distinctBy { it.id },
    )
}
