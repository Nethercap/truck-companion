package com.trucksimdash.app

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.Typeface
import kotlin.math.roundToInt

/**
 * Lo que dice la notificacion de [ServicioManejo]. Con la velocidad y el limite (pedido de
 * Discord, 12-11): quien juega por Moonlight en el mismo telefono los ve bajando la cortina, y
 * la velocidad queda arriba, en la barra de estado, como icono.
 */
internal data class ContenidoAviso(
    val titulo: String,
    val detalle: String,
    /** La velocidad en la unidad del tablero; null sin juego, y ahi va el icono de la app. */
    val velocidad: Int? = null,
    val unidad: String = "",
)

/** "52 mph · Limit 65 · 437 mi · 10:39 PM", sin lo que no hay. */
internal fun detalleAviso(velocidad: String?, limite: String?, falta: String?, llegada: String?): String =
    listOf(velocidad, limite, falta, llegada).filterNot { it.isNullOrBlank() }.joinToString(" · ")

/**
 * La velocidad dibujada para el icono chico de la notificacion: Android solo mira la
 * transparencia y la pinta del color de la barra. El numero arriba, lo mas grande que entre,
 * y la unidad abajo.
 */
internal fun iconoVelocidad(numero: Int, unidad: String, densidad: Float): Bitmap {
    val lado = (24 * densidad).roundToInt().coerceAtLeast(24)
    val imagen = Bitmap.createBitmap(lado, lado, Bitmap.Config.ARGB_8888)
    val lienzo = Canvas(imagen)
    val pincel = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textAlign = Paint.Align.CENTER
        typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
    }
    val caja = Rect()

    fun escribir(texto: String, alto: Float, centroY: Float) {
        pincel.textSize = alto
        val ancho = pincel.measureText(texto)
        if (ancho > lado * 0.98f) pincel.textSize = alto * lado * 0.98f / ancho
        pincel.getTextBounds(texto, 0, texto.length, caja)
        lienzo.drawText(texto, lado / 2f, centroY - caja.exactCenterY(), pincel)
    }

    escribir(numero.coerceIn(0, 999).toString(), lado * 0.70f, lado * 0.34f)
    escribir(unidad, lado * 0.30f, lado * 0.84f)
    return imagen
}
