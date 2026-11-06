package com.trucksimdash.app.core

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.core.content.edit
import com.trucksimdash.app.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// Un archivo, no un mensaje: la traza de un cierre nativo trae todos los hilos, sin orden.
private const val MAX_ERROR = 200_000
private const val MAX_REGISTRO = 24_000
private const val LINEAS_DE_REGISTRO = "300"
private const val ULTIMA_VISTA = "ultima_salida_vista"

/**
 * Los cierres de la app, para quien la prueba: no hay servidor de errores y un APK instalado a
 * mano no le avisa a nadie. El del codigo Kotlin se anota al pasar. El del codigo nativo (MapLibre,
 * QuickJS) y un ANR no pasan por este proceso: los cuenta Android al volver a abrir, desde el 11.
 */
class Fallos(private val contexto: Context) {
    private val archivo = File(contexto.filesDir, "ultimo_fallo.txt")
    private val prefs = contexto.getSharedPreferences("fallos", Context.MODE_PRIVATE)
    private val salida = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) salidaSinVer() else null

    var hayPendiente = archivo.exists() || salida != null
        private set

    /** Antes que nada del arranque: un cierre ahi es justo el que hay que poder contar. */
    fun instalar() {
        val anterior = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { hilo, e ->
            runCatching { archivo.writeText("${fecha(System.currentTimeMillis())}, thread ${hilo.name}\n\n${e.stackTraceToString()}") }
            anterior?.uncaughtException(hilo, e)
        }
    }

    suspend fun informe(): String = withContext(Dispatchers.IO) {
        val error = if (archivo.exists()) archivo.readText() else salida?.leer?.invoke().orEmpty()
        TextoFallo.armar(cabecera(), error, registro())
    }

    fun olvidar() {
        archivo.delete()
        salida?.let { prefs.edit { putLong(ULTIMA_VISTA, it.marca) } }
        hayPendiente = false
    }

    private fun cabecera(): String {
        val abi = Build.SUPPORTED_ABIS.firstOrNull().orEmpty()
        return "Truck Dash ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})\n" +
            "${Build.MANUFACTURER} ${Build.MODEL}, Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT}), $abi"
    }

    /** Lo ultimo que anoto la app, tambien antes del cierre: Android solo le muestra lo suyo. */
    private fun registro(): String = runCatching {
        val proceso = ProcessBuilder("logcat", "-d", "-t", LINEAS_DE_REGISTRO, "-v", "time").redirectErrorStream(true).start()
        proceso.inputStream.bufferedReader().use { it.readText() }
    }.getOrDefault("")

    @RequiresApi(Build.VERSION_CODES.R)
    private fun salidaSinVer(): SalidaDelSistema? {
        val vista = prefs.getLong(ULTIMA_VISTA, 0)
        val am = contexto.getSystemService(ActivityManager::class.java) ?: return null
        val info = runCatching { am.getHistoricalProcessExitReasons(contexto.packageName, 0, 5) }.getOrDefault(emptyList())
            .filter { it.timestamp > vista && (it.reason == ApplicationExitInfo.REASON_CRASH_NATIVE || it.reason == ApplicationExitInfo.REASON_ANR) }
            .maxByOrNull { it.timestamp } ?: return null
        return SalidaDelSistema(info.timestamp) { detalleDe(info) }
    }

    @RequiresApi(Build.VERSION_CODES.R)
    private fun detalleDe(info: ApplicationExitInfo): String {
        val anr = info.reason == ApplicationExitInfo.REASON_ANR
        val traza = runCatching { info.traceInputStream?.use { it.readBytes() } }.getOrNull()
        val detalle = when {
            traza == null -> ""
            anr -> TextoFallo.hiloPrincipal(String(traza))
            else -> TextoFallo.legible(traza)
        }
        val tipo = if (anr) "ANR" else "native crash"
        return "${fecha(info.timestamp)}, $tipo: ${info.description.orEmpty()}\n\n$detalle"
    }

    private fun fecha(ms: Long) = SimpleDateFormat("yyyy-MM-dd HH:mm:ss Z", Locale.US).format(Date(ms))
}

private class SalidaDelSistema(val marca: Long, val leer: () -> String)

/** El texto del informe, sin nada de Android: se prueba en la JVM. */
internal object TextoFallo {
    // Un error o el registro pueden traer una URL de la sesion: lo que abre algo ajeno no sale.
    private val SENSIBLES = listOf(
        Regex("""([?&](?:token|code|key|convoy)=)[^&\s"']+""", RegexOption.IGNORE_CASE),
        Regex("""(/ws/live/)[^/?\s"']+"""),
        Regex("""(Bearer\s+)\S+""", RegexOption.IGNORE_CASE),
    )

    private val MARCO_NATIVO = Regex("""\.(so|apk|jar|oat|odex|vdex|art)\b|::|\b(SIG|SI_|SEGV_|BUS_|ILL_|FPE_|TRAP_)[A-Z]|^\W?[\w~]+\(|^\W*[a-z]\w*(\.[\w$<>]+){2,}""")

    fun limpiar(texto: String): String =SENSIBLES.fold(texto) { t, regla -> regla.replace(t) { it.groupValues[1] + "***" } }

    /** De la traza de un ANR, el hilo que se trabo: lo demas son megas de los otros hilos. */
    fun hiloPrincipal(traza: String): String {
        val desde = traza.indexOf("\"main\"")
        if (desde < 0) return traza.take(MAX_ERROR)
        val hasta = traza.indexOf("\n\n", desde)
        return if (hasta < 0) traza.substring(desde) else traza.substring(desde, hasta)
    }

    /**
     * La de un cierre nativo viene en protobuf: de sus tiras de texto, las que nombran una senal, una
     * biblioteca o una funcion. Trae tambien pedazos de memoria, y ahi puede haber cualquier cosa.
     */
    fun legible(bytes: ByteArray): String =
        Regex("[ -~]{6,}").findAll(String(bytes, Charsets.ISO_8859_1)).map { it.value }.filter { MARCO_NATIVO.containsMatchIn(it) }.joinToString("\n")

    fun armar(cabecera: String, error: String, registro: String): String = limpiar(
        buildString {
            append(cabecera).append("\n\n").append(error.trim().take(MAX_ERROR)).append('\n')
            if (registro.isNotBlank()) append("\n--- Recent log ---\n").append(registro.takeLast(MAX_REGISTRO))
        },
    )
}
