package com.trucksimdash.app.mapa

import android.content.Context
import androidx.compose.runtime.Immutable
import com.trucksimdash.app.nav.MotorNav
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.CacheControl
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File

/** progreso: de 0 a 1 mientras baja; null si no esta bajando. */
@Immutable
data class EstadoBajada(val progreso: Float? = null, val bytes: Long = 0, val error: Boolean = false)

/**
 * Un mapa entero en el telefono: el .pmtiles (40 a 60 MB) en un archivo propio y lo que usa el
 * motor en su cache. Con el archivo, el estilo apunta a el y no hacen falta los pedidos por
 * rango a R2. Va por version: un mapa publicado despues vuelve a pedirse por la red hasta que
 * se baje de nuevo.
 */
class MapasSinInternet(
    contexto: Context,
    private val http: OkHttpClient,
    private val alcance: CoroutineScope,
    private val motor: MotorNav,
) {
    private val carpeta = File(contexto.filesDir, "mapas")

    private val _estado = MutableStateFlow<Map<String, EstadoBajada>>(emptyMap())
    val estado: StateFlow<Map<String, EstadoBajada>> = _estado.asStateFlow()

    init {
        TilesDeMapa.url = { v -> archivoDe(v).takeIf { it.exists() }?.let { "pmtiles://file://${it.absolutePath}" } ?: v.urlTiles }
    }

    private fun archivoDe(v: VarianteMapa) = File(carpeta, "${v.id}-${v.version}.pmtiles")

    /** Los bytes guardados de esta variante, en esta version; 0 si no esta. */
    fun bajado(v: VarianteMapa): Long = archivoDe(v).takeIf { it.exists() }?.length() ?: 0

    fun bajar(v: VarianteMapa) {
        if (_estado.value[v.id]?.progreso != null) return
        _estado.update { it + (v.id to EstadoBajada(progreso = 0f)) }
        alcance.launch {
            val bien = runCatching { bajarArchivo(v) }.getOrDefault(false) && motor.bajarDatosDe(v.id, v.version)
            _estado.update { it + (v.id to EstadoBajada(bytes = bajado(v), error = !bien)) }
        }
    }

    private suspend fun bajarArchivo(v: VarianteMapa): Boolean = withContext(Dispatchers.IO) {
        carpeta.mkdirs()
        val parte = File(carpeta, "${v.id}.parte")
        // Sin guardarlo tambien en el cache de HTTP: son 50 MB, y aca ya queda en disco.
        val pedido = Request.Builder().url(v.urlDeDescarga).cacheControl(CacheControl.Builder().noStore().build()).build()
        http.newCall(pedido).execute().use { r ->
            if (!r.isSuccessful) return@withContext false
            val total = r.body.contentLength()
            var hechos = 0L
            parte.outputStream().use { salida ->
                r.body.byteStream().use { entrada ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        val n = entrada.read(buffer)
                        if (n < 0) break
                        salida.write(buffer, 0, n)
                        hechos += n
                        if (total > 0) _estado.update { it + (v.id to EstadoBajada(progreso = hechos.toFloat() / total)) }
                    }
                }
            }
            if (total > 0 && hechos != total) {
                parte.delete()
                return@withContext false
            }
        }
        // Las versiones viejas de este mapa ya no sirven: un mapa nuevo trae otro grafo.
        carpeta.listFiles { f -> f.name.startsWith("${v.id}-") && f.name.endsWith(".pmtiles") }?.forEach { it.delete() }
        parte.renameTo(archivoDe(v))
    }

    fun borrar(v: VarianteMapa) {
        archivoDe(v).delete()
        _estado.update { it - v.id }
    }
}
