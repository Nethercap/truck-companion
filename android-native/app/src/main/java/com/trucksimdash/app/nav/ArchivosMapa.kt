package com.trucksimdash.app.nav

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.security.MessageDigest

/** status 0 es sin red: el motor lo toma como un fetch que falla. */
class Archivo(val status: Int, val bytes: ByteArray?)

/**
 * Lo que el motor le pide a la red, con cache en disco: un grafo son 11 a 17 MB y no se baja
 * dos veces. En R2 cada URL lleva su version (`?v=`) y no cambia nunca, asi que lo guardado
 * vale para siempre. Lo que viene sin version (los POIs, las voces) se pregunta cada vez y,
 * sin red, sirve lo ultimo que se bajo.
 */
class ArchivosMapa(
    private val carpeta: File,
    private val http: OkHttpClient,
    private val topeBytes: Long = 400L * 1024 * 1024,
) {
    private fun rutaDe(url: String): File {
        val hash = MessageDigest.getInstance("SHA-1").digest(url.toByteArray())
        return File(carpeta, hash.joinToString("") { "%02x".format(it) })
    }

    suspend fun pedir(url: String): Archivo = withContext(Dispatchers.IO) {
        val guardado = rutaDe(url)
        if (esInmutable(url) && guardado.exists()) {
            guardado.setLastModified(System.currentTimeMillis()) // el mas viejo se borra primero
            return@withContext Archivo(200, guardado.readBytes())
        }
        val red = runCatching {
            http.newCall(Request.Builder().url(url).build()).execute().use { r ->
                if (r.isSuccessful) Archivo(200, r.body.bytes()) else Archivo(r.code, null)
            }
        }.getOrNull()
        when {
            red?.bytes != null -> {
                guardar(guardado, red.bytes)
                red
            }
            // Un 404 de verdad se respeta: la web tiene sus respaldos para eso.
            red != null && !guardado.exists() -> red
            guardado.exists() -> Archivo(200, guardado.readBytes())
            else -> Archivo(0, null)
        }
    }

    private fun guardar(destino: File, bytes: ByteArray) {
        runCatching {
            carpeta.mkdirs()
            // Sin llegar a medias: se escribe aparte y se cambia de nombre al terminar.
            val temporal = File(carpeta, destino.name + ".tmp")
            temporal.writeBytes(bytes)
            temporal.renameTo(destino)
            recortar()
        }
    }

    private fun recortar() {
        val archivos = carpeta.listFiles()?.filter { it.isFile } ?: return
        var total = archivos.sumOf { it.length() }
        for (viejo in archivos.sortedBy { it.lastModified() }) {
            if (total <= topeBytes) return
            total -= viejo.length()
            viejo.delete()
        }
    }

    companion object {
        /** Un archivo de R2 con version: `...?v=20261105&g=6`. */
        internal fun esInmutable(url: String) = url.startsWith("https://maps.trucksim-dash.com/") && "?v=" in url

        /** Lo binario va al motor como ArrayBuffer; lo demas, como texto. */
        internal fun esBinario(url: String) = url.substringBefore('?').endsWith(".bin")
    }
}
