package com.trucksimdash.app.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull

// Lectura tolerante: la app habla con clientes de la PC de hace semanas y con
// una API que puede salir antes o despues. Un campo que falta o que viene de
// otro tipo es null, nunca una excepcion (CLAUDE.md, "Clientes viejos").

val JsonLaxo: Json = Json {
    isLenient = true
    ignoreUnknownKeys = true
}

fun parsearObjeto(texto: String): JsonObject? = try {
    JsonLaxo.parseToJsonElement(texto) as? JsonObject
} catch (_: Exception) {
    null
}

private fun JsonObject.primitivo(clave: String): JsonPrimitive? =
    (this[clave] as? JsonPrimitive)?.takeUnless { it is JsonNull }

fun JsonObject.texto(clave: String): String? =
    primitivo(clave)?.content?.takeIf { it.isNotEmpty() }

fun JsonObject.numero(clave: String): Double? =
    primitivo(clave)?.doubleOrNull?.takeIf { it.isFinite() }

fun JsonObject.entero(clave: String): Int? =
    primitivo(clave)?.let { it.intOrNull ?: it.doubleOrNull?.toInt() }

/** true, o un numero distinto de cero: el SDK no siempre manda booleanos. */
fun JsonObject.logico(clave: String): Boolean? {
    val p = primitivo(clave) ?: return null
    return p.booleanOrNull ?: p.doubleOrNull?.let { it != 0.0 }
}

fun JsonObject.objeto(clave: String): JsonObject? = this[clave] as? JsonObject
fun JsonObject.lista(clave: String): JsonArray? = this[clave] as? JsonArray

fun JsonElement.comoObjeto(): JsonObject? = this as? JsonObject

/** Un id que puede venir como texto o como numero (los de TruckersMP). */
fun JsonObject.identificador(clave: String): String? = primitivo(clave)?.content
