package com.trucksimdash.app

import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.trucksimdash.app.nav.ArchivosMapa
import com.whl.quickjs.android.QuickJSLoader
import com.whl.quickjs.wrapper.JSFunction
import com.whl.quickjs.wrapper.JSObject
import com.whl.quickjs.wrapper.QuickJSContext
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * El motor de navegacion en QuickJS contra lo que dio en V8: el mismo codigo, los mismos datos y
 * el mismo reloj, dato por dato. Es lo unico que prueba al motor con el interprete de verdad: el
 * resto de las pruebas corren en Node. Los guiones salen de tools/probar_motor.js --guion y se
 * suben a los archivos de la app (ver el README); sin ellos, esta prueba falla: saltearla diria OK.
 */
@RunWith(AndroidJUnit4::class)
class MotorGuionTest {
    private val app = InstrumentationRegistry.getInstrumentation().targetContext

    private class Corrida(val nombre: String, val pasos: Int, val diferencias: List<String>, val informe: String)

    private fun comoArgumento(v: Any?): Any? = if (v == JSONObject.NULL) null else v

    private fun correr(archivo: File): Corrida {
        val carpeta = archivo.parentFile!!
        val g = JSONObject(archivo.readText())
        val archivos = g.getJSONObject("archivos")
        QuickJSLoader.init()
        val c = QuickJSContext.create()
        c.setMaxStackSize(16 * 1024 * 1024)
        c.evaluate(g.getString("preludio"), "preludio.js")
        c.evaluate(app.assets.open("motor/motor.js").bufferedReader().use { it.readText() }, "motor.js")
        c.evaluate(g.getString("digesto"), "digesto.js")
        val motor: JSObject = c.globalObject.getJSObject("motor")
        val funciones = HashMap<String, JSFunction>()
        fun f(nombre: String) = funciones.getOrPut(nombre) { motor.getJSFunction(nombre) }
        val digesto = c.globalObject.getJSFunction("digesto")
        val sumarAudio = c.evaluate("(function () { audiosVistos += 1; })") as JSFunction

        // Lo que hace MotorNav y el probar_motor de Node, en el mismo orden.
        fun tragar() {
            while (true) {
                f("pulso").call()
                val s = JSONObject(f("volcar").call() as String)
                val log = s.getJSONArray("log")
                for (i in 0 until log.length()) {
                    val l = log.getJSONArray(i)
                    if (l.getString(0) == "e") Log.e(TAG, l.getString(1))
                }
                val audios = s.getJSONArray("audio")
                for (i in 0 until audios.length()) {
                    sumarAudio.call()
                    f("audioTermino").call(audios.getJSONObject(i).getInt("id"))
                }
                val pedidos = s.getJSONArray("fetch")
                for (i in 0 until pedidos.length()) {
                    val p = pedidos.getJSONObject(i)
                    val url = p.getString("url")
                    val a = archivos.optJSONObject(url)
                    val nombre = a?.optString("archivo").takeUnless { a?.isNull("archivo") != false }
                    val bytes = nombre?.let { File(carpeta, it).readBytes() }
                    val cuerpo: Any = when {
                        bytes == null -> ""
                        ArchivosMapa.esBinario(url) -> bytes
                        else -> String(bytes, Charsets.UTF_8)
                    }
                    f("respuesta").call(p.getInt("id"), a?.optInt("status", 404) ?: 404, cuerpo)
                }
                if (pedidos.length() == 0 && audios.length() == 0) return
            }
        }

        val pasos = g.getJSONArray("pasos")
        val esperado = g.getJSONArray("esperado")
        val diferencias = ArrayList<String>()
        var peorMs = 0L
        var peorPaso = ""
        var totalDatos = 0L
        var datos = 0
        for (i in 0 until pasos.length()) {
            val p = pasos.getJSONObject(i)
            val ms = p.optInt("ms", 0)
            if (ms != 0) c.evaluate("relojFalso += $ms")
            val a: JSONArray = p.getJSONArray("a")
            val argumentos = Array(a.length()) { comoArgumento(a.get(it)) }
            val nombre = p.getString("f")
            val t0 = System.nanoTime()
            val devuelto = f(nombre).call(*argumentos)
            val duro = (System.nanoTime() - t0) / 1_000_000
            if (nombre == "telemetria") {
                totalDatos += duro
                datos += 1
            }
            if (duro > peorMs) {
                peorMs = duro
                peorPaso = "$nombre (paso $i)"
            }
            tragar()
            val quedo = digesto.call() as String
            if (quedo != esperado.getString(i)) {
                diferencias += "paso $i ($nombre):\n  V8      ${esperado.getString(i)}\n  QuickJS $quedo"
            }
            if (p.has("devuelto") && devuelto != comoArgumento(p.get("devuelto"))) {
                diferencias += "paso $i ($nombre) devolvio:\n  V8      ${p.get("devuelto")}\n  QuickJS $devuelto"
            }
        }
        val memoria = c.memoryUsedSize / (1024 * 1024)
        val informe = "${archivo.name}: ${pasos.length()} pasos; por dato ${totalDatos / maxOf(datos, 1)} ms; " +
            "peor $peorMs ms en $peorPaso; $memoria MB en QuickJS; ${diferencias.size} diferencias"
        c.destroy()
        return Corrida(archivo.name, pasos.length(), diferencias, informe)
    }

    @Test
    fun daLoMismoQueLaWeb() {
        // La crea la app: una carpeta creada desde adb puede quedar sin permiso para ella.
        val carpeta = File(app.getExternalFilesDir(null), "guion").also { it.mkdirs() }
        val guiones = carpeta.listFiles { f -> f.name.startsWith("guion-") && f.name.endsWith(".json") }?.sortedBy { it.name }.orEmpty()
        assertTrue("Sin guiones en $carpeta: correr tools/probar_motor.js --guion y subirlos", guiones.isNotEmpty())

        val corridas = ArrayList<Corrida>()
        var error: Throwable? = null
        // QuickJS se apoya en el stack del hilo: el mismo tamano que en la app.
        val hilo = Thread(null, {
            try {
                for (g in guiones) corridas += correr(g)
            } catch (e: Throwable) {
                error = e
            }
        }, "motor-guion", 32L * 1024 * 1024)
        hilo.start()
        hilo.join()
        error?.let { throw it }

        var total = 0
        for (r in corridas) {
            Log.i(TAG, r.informe)
            r.diferencias.take(12).forEach { Log.w(TAG, it) }
            total += r.diferencias.size
        }
        assertEquals(
            "QuickJS y V8 no dan lo mismo: ${corridas.joinToString { it.informe }}\n${corridas.flatMap { it.diferencias }.take(4).joinToString("\n")}",
            0,
            total,
        )
    }

    private companion object {
        const val TAG = "GuionMotor"
    }
}
