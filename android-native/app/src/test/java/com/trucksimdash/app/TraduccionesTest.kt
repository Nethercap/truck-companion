package com.trucksimdash.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.w3c.dom.Element
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory

/**
 * Los ocho idiomas de la web. Una traduccion que se olvida un texto cae al ingles sin avisar; una
 * que cambia un %1$d hace caer a la app cuando lo muestra: eso no lo ve nadie hasta que le pasa.
 */
class TraduccionesTest {
    private val res = File("src/main/res")
    private val idiomas = listOf("es", "de", "fr", "pt", "pl", "tr", "ru")

    /** Los que quedan como en ingles a proposito: son la marca o unidades. */
    private val sinTraducir = setOf("app_name", "unidades_km", "unidades_mi")

    private class Texto(val valores: Map<String, String>)

    private fun leer(carpeta: String): Map<String, Texto> {
        val doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(File(res, "$carpeta/strings.xml"))
        val raiz = doc.documentElement
        val fuera = LinkedHashMap<String, Texto>()
        for (i in 0 until raiz.childNodes.length) {
            val n = raiz.childNodes.item(i) as? Element ?: continue
            val nombre = n.getAttribute("name")
            when (n.tagName) {
                "string" -> fuera[nombre] = Texto(mapOf("" to n.textContent))
                "plurals" -> {
                    val items = n.getElementsByTagName("item")
                    fuera[nombre] = Texto((0 until items.length).associate { k ->
                        val e = items.item(k) as Element
                        e.getAttribute("quantity") to e.textContent
                    })
                }
                "string-array" -> {
                    val items = n.getElementsByTagName("item")
                    fuera[nombre] = Texto((0 until items.length).associate { k -> k.toString() to items.item(k).textContent })
                }
            }
        }
        return fuera
    }

    private fun marcadores(s: String) = Regex("""%\d+\$[a-z]""").findAll(s).map { it.value }.toSet()

    @Test
    fun cadaIdiomaTieneTodosLosTextos() {
        val ingles = leer("values")
        for (idioma in idiomas) {
            val otro = leer("values-$idioma")
            val faltan = ingles.keys - otro.keys - sinTraducir
            assertTrue("$idioma: faltan $faltan", faltan.isEmpty())
            val sobran = otro.keys - ingles.keys
            assertTrue("$idioma: sobran $sobran", sobran.isEmpty())
        }
    }

    @Test
    fun losMarcadoresSonLosMismos() {
        val ingles = leer("values")
        for (idioma in idiomas) {
            for ((nombre, texto) in leer("values-$idioma")) {
                val esperados = ingles[nombre]?.valores?.values?.flatMap { marcadores(it) }?.toSet() ?: continue
                for ((cantidad, valor) in texto.valores) {
                    // Un plural en singular puede decir "un" en vez del numero.
                    val aca = marcadores(valor)
                    if (cantidad == "one") {
                        assertTrue("$idioma/$nombre/$cantidad: $valor", esperados.containsAll(aca))
                    } else {
                        assertEquals("$idioma/$nombre/$cantidad: $valor", esperados, aca)
                    }
                }
            }
        }
    }

    @Test
    fun losPluralesTienenLasFormasDeCadaIdioma() {
        val formas = mapOf(
            "es" to setOf("one", "other"),
            "de" to setOf("one", "other"),
            "fr" to setOf("one", "other"),
            "pt" to setOf("one", "other"),
            "tr" to setOf("one", "other"),
            "pl" to setOf("one", "few", "many", "other"),
            "ru" to setOf("one", "few", "many", "other"),
        )
        val ingles = leer("values")
        for ((idioma, pedidas) in formas) {
            for ((nombre, texto) in leer("values-$idioma")) {
                if (ingles[nombre]?.valores?.containsKey("other") != true) continue
                val faltan = pedidas - texto.valores.keys
                assertTrue("$idioma/$nombre: faltan las formas $faltan", faltan.isEmpty())
            }
        }
    }
}
