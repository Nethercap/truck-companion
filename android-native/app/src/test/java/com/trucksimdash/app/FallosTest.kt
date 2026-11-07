package com.trucksimdash.app

import com.trucksimdash.app.core.TextoFallo
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FallosTest {
    @Test
    fun `no salen los codigos ni los tokens`() {
        val texto = TextoFallo.limpiar(
            """
            wss://relay.example/ws/live/ABC123?role=viewer
            https://api.example/x?a=1&token=secreto&b=2
            https://trucksim-dash.com/app/?convoy=QWERTY
            Authorization: Bearer abc.def.ghi
            """.trimIndent(),
        )
        listOf("ABC123", "secreto", "QWERTY", "abc.def.ghi").forEach { assertFalse(it, it in texto) }
        // Lo demas de la linea sirve para entender el error.
        assertTrue("/ws/live/***?role=viewer" in texto)
        assertTrue("?a=1&token=***&b=2" in texto)
    }

    @Test
    fun `de un ANR queda el hilo principal`() {
        val traza = """
            ----- pid 1 at 2026-11-06 -----
            Cmd line: com.trucksimdash.app.nativa
            lots of runtime stats

            "main" prio=5 tid=1 Sleeping
              at java.lang.Thread.sleep(Native method)
              at com.trucksimdash.app.MainActivity.onCreate(MainActivity.kt:38)

            "OkHttp" prio=5 tid=9 Waiting
              at java.lang.Object.wait(Native method)
        """.trimIndent()
        val hilo = TextoFallo.hiloPrincipal(traza)
        assertTrue(hilo.startsWith("\"main\""))
        assertTrue("MainActivity.kt:38" in hilo)
        assertFalse("OkHttp" in hilo)
        assertFalse("runtime stats" in hilo)
    }

    @Test
    fun `un ANR sin hilo principal queda como vino`() {
        assertEquals("sin hilos", TextoFallo.hiloPrincipal("sin hilos"))
    }

    @Test
    fun `de un cierre nativo quedan las senales y las funciones, no la memoria`() {
        val tiras = listOf(
            "SIGSEGV\"", "SEGV_MAPERR", "/data/app/x/base.apk!libmaplibre.so", "mbgl::Map::render", "__epoll_pwait(", "java.util.concurrent.locks.LockSupport.parkNanos",
            "eyJhbGciOiJIUzI1NiJ9", "codigo ABC123", "abc",
        )
        val bytes = tiras.fold(byteArrayOf(1, 2, 3)) { b, t -> b + t.toByteArray() + byteArrayOf(0, -1, 7) }
        assertEquals(tiras.take(6).joinToString("\n"), TextoFallo.legible(bytes))
    }

    @Test
    fun `el informe se corta en el error y en lo viejo del registro`() {
        val informe = TextoFallo.armar("cabecera", "e".repeat(300_000), "viejo" + "r".repeat(30_000) + "nuevo")
        assertTrue(informe.startsWith("cabecera\n\neee"))
        assertTrue(informe.length < 230_000)
        assertTrue(informe.endsWith("nuevo"))
        assertFalse("viejo" in informe)
    }

    @Test
    fun `sin registro no queda el titulo suelto`() {
        assertEquals("cabecera\n\nerror\n", TextoFallo.armar("cabecera", " error\n", " "))
    }
}
