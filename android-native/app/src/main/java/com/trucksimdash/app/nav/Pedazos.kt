package com.trucksimdash.app.nav

import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.RandomAccessFile

/**
 * Un pedazo de un archivo grande para el motor: los tiles del puerto de un ferry, que la libreria
 * pmtiles lee de a pedazos del .pmtiles del mapa (FuenteRangos en conduccion.js). Del archivo
 * bajado si el mapa esta sin internet; si no, con Range. Sin cache: son unos pocos KB por cruce.
 */
internal object Pedazos {
    /** Mas que esto no lo pide nadie: la cabecera y el directorio raiz son 16 KB, un tile, menos. */
    const val TOPE_BYTES = 4L * 1024 * 1024

    fun leer(url: String, desde: Long, largo: Long, local: File?, http: OkHttpClient): ByteArray? {
        if (desde < 0 || largo <= 0 || largo > TOPE_BYTES) return null
        if (local != null && local.exists()) return runCatching { delArchivo(local, desde, largo) }.getOrNull()
        return runCatching {
            val pedido = Request.Builder().url(url).header("Range", rango(desde, largo)).build()
            http.newCall(pedido).execute().use { r ->
                // Un 200 es el archivo entero (el servidor no sabe de rangos): ni leerlo.
                if (r.code != 206) return@use null
                r.body.bytes().takeIf { it.size.toLong() == largo || it.size.toLong() < largo }
            }
        }.getOrNull()
    }

    /** "bytes=desde-hasta", con hasta incluido. */
    fun rango(desde: Long, largo: Long) = "bytes=$desde-${desde + largo - 1}"

    /** Lo que haya desde ahi, hasta largo: al final del archivo viene menos, como un 206. */
    fun delArchivo(archivo: File, desde: Long, largo: Long): ByteArray? = RandomAccessFile(archivo, "r").use { f ->
        if (desde >= f.length()) return@use null
        val cuanto = minOf(largo, f.length() - desde).toInt()
        val bytes = ByteArray(cuanto)
        f.seek(desde)
        f.readFully(bytes)
        bytes
    }
}
