package com.trucksimdash.app.core

import com.trucksimdash.app.BuildConfig
import okhttp3.Cache
import okhttp3.CacheControl
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Response
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Direcciones de Truck Dash y el cliente HTTP que usa toda la app, mapa incluido. */
object Red {
    const val RELAY_WS = "wss://truck-companion-production.up.railway.app"
    const val MAPAS = "https://maps.trucksim-dash.com"
    const val API = "https://api.trucksim-dash.com"
    const val WEB = "https://trucksim-dash.com"
    const val PUERTO_LAN = 27766

    // La regla de Cloudflare de los mapas pide un Referer de trucksim-dash.com
    // (ver CLAUDE.md, "Datos de mapa y R2"). La app es de la casa y manda ese.
    // Nunca el secreto de las herramientas (x-truckdash-tools): una APK se
    // puede abrir, y ese secreto saltearia la regla para cualquiera.
    private const val REFERER = "$WEB/app/"
    private val HOSTS_CON_REFERER = setOf("maps.trucksim-dash.com", "trucksim-dash.com")

    // Los rangos de glifos que la web sirve desde su propia copia (localGlyphs
    // en app.js): los que usan los nombres de ciudades y empresas. Los demas
    // siguen en el host publico de MapLibre, igual que en la web.
    private val RANGOS_PROPIOS = setOf("0-255", "256-511", "512-767", "768-1023", "1024-1279", "7680-7935", "8192-8447")
    private val GLIFO = Regex("""/font/([^/]+)/(\d+-\d+)\.pbf$""")

    /** La URL de un pedido de glifos, cambiada a la copia propia si corresponde. */
    internal fun urlDeGlifo(url: HttpUrl): HttpUrl {
        val m = GLIFO.find(url.encodedPath) ?: return url
        val fuente = java.net.URLDecoder.decode(m.groupValues[1], "UTF-8")
        val rango = m.groupValues[2]
        if (!fuente.startsWith("Open Sans Regular") || rango !in RANGOS_PROPIOS) return url
        return "$WEB/app/vendor/glyphs-open-sans-omt2/$rango.pbf".toHttpUrl()
    }

    private object CabecerasPropias : Interceptor {
        override fun intercept(chain: Interceptor.Chain): Response {
            val original = chain.request()
            val url = urlDeGlifo(original.url)
            val pedido = original.newBuilder().url(url)
                .header("User-Agent", "TruckDash-Android/${BuildConfig.VERSION_NAME}")
            if (url.host in HOSTS_CON_REFERER) pedido.header("Referer", REFERER)
            return chain.proceed(pedido.build())
        }
    }

    private var cacheDisco: Cache? = null

    /** Antes del primer pedido: los iconos y las fuentes del mapa, para cuando no haya red. */
    fun iniciar(carpeta: File) {
        cacheDisco = Cache(File(carpeta, "http"), 64L * 1024 * 1024)
    }

    /** Sin red, lo ultimo que se bajo. Un rango (el .pmtiles) o un socket no se guardan. */
    private object SinRed : Interceptor {
        override fun intercept(chain: Interceptor.Chain): Response {
            val r = chain.request()
            try {
                return chain.proceed(r)
            } catch (e: IOException) {
                if (r.method != "GET" || r.header("Range") != null || r.header("Upgrade") != null) throw e
                return chain.proceed(r.newBuilder().cacheControl(CacheControl.FORCE_CACHE).build())
            }
        }
    }

    /**
     * Uno solo para toda la app: comparte conexiones con el mapa, que hace
     * muchos pedidos chicos a R2 (range requests del .pmtiles).
     */
    val http: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .cache(cacheDisco)
            .addInterceptor(SinRed)
            .addInterceptor(CabecerasPropias)
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            // Sin ping, un socket medio abierto (WiFi mala) no avisa nunca.
            .pingInterval(15, TimeUnit.SECONDS)
            .build()
    }
}
