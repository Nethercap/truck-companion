package com.trucksimdash.app

import com.trucksimdash.app.core.VOLUMEN_VOZ_MIN
import com.trucksimdash.app.nav.amplitudVoz
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AvisoYVozTest {
    @Test
    fun `la notificacion lleva velocidad, limite, lo que falta y la llegada`() {
        assertEquals(
            "52 mph · Limit 65 · 437 mi · 10:39 PM",
            detalleAviso("52 mph", "Limit 65", "437 mi", "10:39 PM"),
        )
    }

    @Test
    fun `sin limite ni ruta queda solo la velocidad, y sin nada queda vacio`() {
        assertEquals("80 km/h", detalleAviso("80 km/h", null, null, ""))
        assertEquals("437 mi · 10:39 PM", detalleAviso(null, null, "437 mi", "10:39 PM"))
        // Vacio: el servicio pone "Still navigating in the background".
        assertEquals("", detalleAviso(null, null, null, null))
    }

    @Test
    fun `el volumen de la voz va al cuadrado y nunca pasa de 1`() {
        assertEquals(1f, amplitudVoz(1f), 0f)
        assertEquals(0.25f, amplitudVoz(0.5f), 1e-6f)
        assertEquals(1f, amplitudVoz(3f), 0f)
        assertEquals(0f, amplitudVoz(-1f), 0f)
        // Lo mas bajo del deslizador todavia suena.
        assertTrue(amplitudVoz(VOLUMEN_VOZ_MIN) > 0f)
    }
}
