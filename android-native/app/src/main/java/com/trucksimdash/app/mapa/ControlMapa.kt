package com.trucksimdash.app.mapa

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Typeface
import android.util.DisplayMetrics
import com.trucksimdash.app.core.Red
import com.trucksimdash.app.cuenta.MapaRecorrido
import com.trucksimdash.app.nav.CapasNav
import com.trucksimdash.app.nav.DestinoNav
import com.trucksimdash.app.nav.EscudoRuta
import com.trucksimdash.app.nav.RutaConvoy
import com.trucksimdash.app.nav.RutaDibujada
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.Layer
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.hypot

/**
 * Un mapa de MapLibre con lo que la app necesita: cargar una variante, mover el
 * camion suave entre datos, seguirlo con la camara y dibujar a los demas.
 * Se usa siempre desde el hilo principal.
 */
class ControlMapa(
    private val mapView: MapView,
    private val mapa: MapLibreMap,
    private val http: OkHttpClient,
    private val alcance: CoroutineScope,
) {
    private var estilo: Style? = null
    private var variante: VarianteMapa? = null
    private var proyeccion: Proyeccion? = null
    private val iconosPedidos = mutableSetOf<String>()
    private val escudosDibujados = mutableSetOf<String>()

    /** La persona movio el mapa: la camara deja de seguir al camion. */
    var alMoverConLaMano: () -> Unit = {}

    /** Mantener apretado sobre el mapa: ahi va un waypoint. */
    var alMantenerApretado: ((LngLat) -> Unit)? = null

    var seguir: Boolean = true
        set(valor) {
            field = valor
            if (valor) saltarAlObjetivo = true
        }

    /** La camara gira con el camion en vez de quedar con el norte arriba. */
    var conRumbo: Boolean = false
        set(valor) {
            if (field != valor) saltarAlObjetivo = true
            field = valor
            aplicarPerspectiva()
        }

    private var saltarAlObjetivo = false
    private var hayCamion = false
    private var objetivoLng = 0.0
    private var objetivoLat = 0.0
    private var objetivoRumbo = 0.0
    private var actualLng = 0.0
    private var actualLat = 0.0
    private var actualRumbo = 0.0
    private var ultimoCuadroMs = 0L
    private var ultimoEnvioMs = 0L
    private var latDeAnchos = Double.NaN

    init {
        mapa.uiSettings.apply {
            isAttributionEnabled = false
            isLogoEnabled = false
            isRotateGesturesEnabled = true
            isTiltGesturesEnabled = false
            isCompassEnabled = true
            // Abajo, arriba de los botones: arriba va el panel del giro.
            compassGravity = android.view.Gravity.BOTTOM or android.view.Gravity.END
            val d = mapView.resources.displayMetrics.density
            setCompassMargins(0, 0, (16 * d).toInt(), (190 * d).toInt())
        }
        mapa.addOnCameraMoveStartedListener { razon ->
            if (razon == MapLibreMap.OnCameraMoveStartedListener.REASON_API_GESTURE) alMoverConLaMano()
        }
        mapa.addOnCameraIdleListener { actualizarAnchos() }
        mapa.addOnMapLongClickListener { punto ->
            val accion = alMantenerApretado ?: return@addOnMapLongClickListener false
            accion(LngLat(punto.longitude, punto.latitude))
            true
        }
        // Los logos de empresa son unos 500 y en una ciudad se ven diez: se bajan
        // de a uno cuando la capa los pide (loadMissingCompanyIcon en app.js).
        mapView.addOnStyleImageMissingListener { id ->
            if (id.startsWith(CapasMapa.PREFIJO_EMPRESA)) pedirLogoEmpresa(id)
        }
    }

    fun limpiarCamion() {
        hayCamion = false
        estilo?.getSourceAs<GeoJsonSource>(CapasMapa.FUENTE_CAMION)?.setGeoJson("""{"type":"FeatureCollection","features":[]}""")
    }

    /** Cambia de mapa. Sin efecto si ya es esa variante y version. */
    fun cargar(v: VarianteMapa, alListo: () -> Unit = {}) {
        val anterior = variante
        if (anterior != null && anterior.id == v.id && anterior.version == v.version) return
        val mismoMundo = anterior?.proyeccion == v.proyeccion
        variante = v
        proyeccion = Proyecciones.de(v.proyeccion)
        estilo = null
        iconosPedidos.clear()
        escudosDibujados.clear()
        val lat = if (mismoMundo) mapa.cameraPosition.target?.latitude ?: v.centro.lat else v.centro.lat
        latDeAnchos = lat
        mapa.setStyle(Style.Builder().fromJson(estiloDe(v, lat))) { s ->
            if (variante !== v) return@setStyle
            estilo = s
            s.addImage(CapasMapa.IMAGEN_CAMION, flecha(Color.parseColor("#3B9EFF"), Color.WHITE, 3f))
            for (tono in TONOS_CONDUCTOR + COLOR_OTRO) {
                s.addImage(CapasMapa.PREFIJO_FLECHA + tono, flecha(Color.parseColor(tono), Color.parseColor("#0D0F12"), 2f))
            }
            s.addImage(CapasMapa.IMAGEN_DESTINO, bandera(Color.parseColor("#2AD3A4")))
            s.addImage(CapasMapa.IMAGEN_CARGA, bandera(Color.parseColor("#FFB020")))
            bajarIconos(s)
            if (!mismoMundo && !hayCamion) {
                mapa.cameraPosition = CameraPosition.Builder()
                    .target(LatLng(v.centro.lat, v.centro.lng)).zoom(4.0).bearing(0.0).tilt(0.0).build()
            }
            alListo()
        }
    }

    private fun bajarIconos(s: Style) {
        val nombres = CapasMapa.ICONOS_POI + CapasMapa.ICONOS_FERRY + CapasMapa.ICONOS_ATLAS
        alcance.launch {
            for (nombre in nombres) {
                val b = bajarPng("${Red.MAPAS}/vector/icons/$nombre.png") ?: continue
                if (estilo === s) s.addImage(nombre, b)
            }
        }
    }

    private fun pedirLogoEmpresa(id: String) {
        val token = id.removePrefix(CapasMapa.PREFIJO_EMPRESA)
        // companyIconToken en pure.js: el sprite viene de los tiles, no de la red.
        if (!TOKEN_EMPRESA.matches(token) || !iconosPedidos.add(id)) return
        val s = estilo ?: return
        alcance.launch {
            val b = bajarPng("${Red.MAPAS}/vector/company-icons/$token.png?v=$REV_LOGOS_EMPRESA") ?: return@launch
            if (estilo === s) s.addImage(id, b)
        }
    }

    private suspend fun bajarPng(url: String): Bitmap? = withContext(Dispatchers.IO) {
        runCatching {
            http.newCall(Request.Builder().url(url).build()).execute().use { r ->
                if (!r.isSuccessful) return@use null
                val bytes = r.body.bytes()
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.also { it.density = DisplayMetrics.DENSITY_DEFAULT }
            }
        }.getOrNull()
    }

    private fun aLngLat(x: Double, z: Double): LngLat? = proyeccion?.aLngLat(x, z)

    /** Un dato nuevo del camion. Se llega de a poco en [cuadro]. */
    fun ponerCamion(x: Double, z: Double, rumboGrilla: Double?) {
        val p = proyeccion ?: return
        val ll = p.aLngLat(x, z)
        val rumbo = rumboGrilla?.let { rumboDeGrillaAGeo(it, x, z, p) } ?: objetivoRumbo
        if (!hayCamion || hypot(ll.lng - actualLng, ll.lat - actualLat) > SALTO_GRADOS) {
            // Primer dato, o un ferry: sin animar a traves de medio continente.
            actualLng = ll.lng
            actualLat = ll.lat
            actualRumbo = rumbo
            saltarAlObjetivo = true
        }
        hayCamion = true
        objetivoLng = ll.lng
        objetivoLat = ll.lat
        objetivoRumbo = rumbo
    }

    /** Lo llama la pantalla en cada cuadro; se limita a unos 20 por segundo. */
    fun cuadro(ahoraMs: Long) {
        val s = estilo ?: return
        if (!hayCamion) return
        if (ahoraMs - ultimoEnvioMs < MS_POR_CUADRO && !saltarAlObjetivo) return
        val dt = (ahoraMs - ultimoCuadroMs).coerceIn(0, 500)
        ultimoCuadroMs = ahoraMs
        ultimoEnvioMs = ahoraMs
        val k = if (saltarAlObjetivo) 1.0 else 1 - exp(-dt / SUAVIZADO_MS)
        val quieto = abs(objetivoLng - actualLng) + abs(objetivoLat - actualLat) < 1e-7 &&
            abs(diferenciaAngular(objetivoRumbo, actualRumbo)) < 0.1
        if (quieto && !saltarAlObjetivo) return
        actualLng += (objetivoLng - actualLng) * k
        actualLat += (objetivoLat - actualLat) * k
        actualRumbo = (actualRumbo + diferenciaAngular(objetivoRumbo, actualRumbo) * k + 360) % 360
        s.getSourceAs<GeoJsonSource>(CapasMapa.FUENTE_CAMION)
            ?.setGeoJson(geojsonPunto(LngLat(actualLng, actualLat), actualRumbo))
        if (seguir) {
            val actual = mapa.cameraPosition
            val pos = CameraPosition.Builder(actual)
                .target(LatLng(actualLat, actualLng))
                .bearing(if (conRumbo) actualRumbo else actual.bearing)
            if (saltarAlObjetivo) {
                pos.zoom(if (actual.zoom < ZOOM_SEGUIR_MIN) ZOOM_SEGUIR else actual.zoom)
                if (!conRumbo) pos.bearing(0.0)
            }
            mapa.moveCamera(CameraUpdateFactory.newCameraPosition(pos.build()))
        }
        saltarAlObjetivo = false
    }

    private fun aplicarPerspectiva() {
        val alto = mapView.height.toDouble()
        // Con el rumbo, el camion abajo: importa lo que viene, no lo que quedo atras.
        val arriba = if (conRumbo) alto * 0.35 else 0.0
        mapa.moveCamera(
            CameraUpdateFactory.newCameraPosition(
                CameraPosition.Builder(mapa.cameraPosition)
                    .padding(0.0, arriba, 0.0, 0.0)
                    .tilt(if (conRumbo) 45.0 else 0.0)
                    .apply { if (!conRumbo) bearing(0.0) }
                    .build(),
            ),
        )
    }

    /** La linea de la ruta, tal como la arma la web. */
    fun ponerRuta(r: RutaDibujada?) {
        val s = estilo ?: return
        val vacio = """{"type":"FeatureCollection","features":[]}"""
        s.getSourceAs<GeoJsonSource>(CapasMapa.FUENTE_RUTA)?.setGeoJson(r?.tierra ?: vacio)
        s.getSourceAs<GeoJsonSource>(CapasMapa.FUENTE_RUTA_SIGUIENTE)?.setGeoJson(r?.siguiente ?: vacio)
        s.getSourceAs<GeoJsonSource>(CapasMapa.FUENTE_RUTA_FERRY)?.setGeoJson(r?.ferry ?: vacio)
        s.getLayer("road-freeway")?.setProperties(
            PropertyFactory.lineColor(if (r?.conLinea == true) COLOR_AUTOPISTA_CON_RUTA else COLOR_AUTOPISTA),
        )
    }

    fun ponerDestino(d: DestinoNav?) {
        estilo?.getSourceAs<GeoJsonSource>(CapasMapa.FUENTE_DESTINO)?.setGeoJson(
            d?.let { geojsonDestino(it.lng, it.lat, it.aBuscarCarga, it.aproximado) }
                ?: """{"type":"FeatureCollection","features":[]}""",
        )
    }

    fun ponerWaypoints(lista: List<LngLat>) {
        estilo?.getSourceAs<GeoJsonSource>(CapasMapa.FUENTE_WAYPOINTS)?.setGeoJson(geojsonWaypoints(lista))
    }

    /** Lo que la web le pone al mapa ademas de la ruta. Los escudos se dibujan una sola vez. */
    fun ponerCapas(c: CapasNav?) {
        val s = estilo ?: return
        val vacio = """{"type":"FeatureCollection","features":[]}"""
        fun poner(fuente: String, geo: String?) = s.getSourceAs<GeoJsonSource>(fuente)?.setGeoJson(geo ?: vacio)
        val nuevos = c?.escudos.orEmpty().filter { it.nombre !in escudosDibujados }
        escudosDibujados += nuevos.map { it.nombre }
        val pantalla = mapView.resources.displayMetrics
        alcance.launch {
            // Primero las imagenes: un simbolo sin su imagen no se dibuja hasta otro dato.
            val dibujos = withContext(Dispatchers.Default) {
                nuevos.associate { CapasMapa.PREFIJO_ESCUDO + it.nombre to dibujarEscudo(it, pantalla.density, pantalla.densityDpi) }
            }
            if (estilo !== s) return@launch
            if (dibujos.isNotEmpty()) s.addImages(HashMap(dibujos))
            poner(CapasMapa.FUENTE_ESCUDOS, c?.geoEscudos)
        }
        poner(CapasMapa.FUENTE_ATLAS, c?.atlas)
        poner(CapasMapa.FUENTE_ESTACIONAMIENTO, c?.estacionamiento)
        poner(CapasMapa.FUENTE_COMBUSTIBLE, c?.combustible)
        s.getLayer("car-parking")?.setProperties(
            PropertyFactory.visibility(if (c?.estacionamientoVisible == true) Property.VISIBLE else Property.NONE),
        )
        c?.filtroPoi?.let { f -> s.getLayerAs<SymbolLayer>("poi")?.setFilter(Expression.raw(f)) }
    }

    /** El zoom de navegacion de la web, al pasar a seguir con el rumbo. */
    fun zoomDeNavegacion(zoom: Double) {
        mapa.moveCamera(CameraUpdateFactory.zoomTo(zoom))
    }

    fun ponerRastro(puntos: List<LngLat>) {
        val s = estilo ?: return
        s.getSourceAs<GeoJsonSource>(CapasMapa.FUENTE_RASTRO)
            ?.setGeoJson(if (puntos.size < 2) """{"type":"FeatureCollection","features":[]}""" else geojsonLinea(puntos))
    }

    fun ponerJugadores(lista: List<MarcaJugador>) {
        val s = estilo ?: return
        // El convoy trae sus colores: una flecha por color, la primera vez que aparece.
        for (color in lista.map { it.color }.distinct()) {
            val imagen = CapasMapa.PREFIJO_FLECHA + color
            if (s.getImage(imagen) == null) {
                runCatching { s.addImage(imagen, flecha(Color.parseColor(color), Color.parseColor("#0D0F12"), 2f)) }
            }
        }
        s.getSourceAs<GeoJsonSource>(CapasMapa.FUENTE_OTROS)?.setGeoJson(geojsonJugadores(lista))
    }

    /** Todo lo manejado, con la camara encuadrada: como pintarDatosMapa de la pagina de cuenta. */
    fun ponerRecorrido(m: MapaRecorrido?) {
        val s = estilo ?: return
        val vacio = """{"type":"FeatureCollection","features":[]}"""
        s.getSourceAs<GeoJsonSource>(CapasMapa.FUENTE_RECORRIDO)?.setGeoJson(m?.lineasGeo ?: vacio)
        s.getSourceAs<GeoJsonSource>(CapasMapa.FUENTE_CIUDADES_RECORRIDO)?.setGeoJson(m?.ciudadesGeo ?: vacio)
        val c = m?.caja ?: return
        val caja = LatLngBounds.Builder().include(LatLng(c[1], c[0])).include(LatLng(c[3], c[2])).build()
        runCatching {
            mapa.moveCamera(CameraUpdateFactory.newLatLngBounds(caja, 60))
            if (mapa.cameraPosition.zoom > 9) mapa.moveCamera(CameraUpdateFactory.zoomTo(9.0))
        }
    }

    /** La ruta del lider del convoy: la dibuja la web, punteada y con su color. */
    fun ponerRutaConvoy(r: RutaConvoy?) {
        val s = estilo ?: return
        s.getSourceAs<GeoJsonSource>(CapasMapa.FUENTE_RUTA_CONVOY)
            ?.setGeoJson(r?.geo ?: """{"type":"FeatureCollection","features":[]}""")
        if (r != null) {
            s.getLayer("convoy-route-line")?.setProperties(
                PropertyFactory.lineColor(r.color),
                PropertyFactory.lineOpacity(r.opacidad),
            )
        }
    }

    fun ponerRutas(lista: List<LineaRuta>) {
        estilo?.getSourceAs<GeoJsonSource>(CapasMapa.FUENTE_RUTAS)?.setGeoJson(geojsonRutas(lista))
    }

    fun irA(p: LngLat, zoom: Double? = null, animado: Boolean = true) {
        val pos = CameraPosition.Builder(mapa.cameraPosition).target(LatLng(p.lat, p.lng))
        if (zoom != null) pos.zoom(zoom)
        val update = CameraUpdateFactory.newCameraPosition(pos.build())
        if (animado) mapa.easeCamera(update, 900, false) else mapa.moveCamera(update)
    }

    /** Encuadra un grupo de puntos, como liveMapFit. */
    fun encuadrar(puntos: List<LngLat>) {
        when (puntos.size) {
            0 -> return
            1 -> irA(puntos[0], 8.0, animado = false)
            else -> {
                val b = LatLngBounds.Builder().apply { puntos.forEach { include(LatLng(it.lat, it.lng)) } }.build()
                mapa.moveCamera(CameraUpdateFactory.newLatLngBounds(b, 120))
                if (mapa.cameraPosition.zoom > 9) mapa.moveCamera(CameraUpdateFactory.zoomTo(9.0))
            }
        }
    }

    fun proyectar(x: Double, z: Double): LngLat? = aLngLat(x, z)

    /** El ancho real de las calles depende de la latitud: se rehace cada 2 grados. */
    private fun actualizarAnchos() {
        val v = variante ?: return
        val s = estilo ?: return
        val lat = mapa.cameraPosition.target?.latitude ?: return
        if (latDeAnchos.isFinite() && abs(lat - latDeAnchos) < PASO_LAT_ANCHOS) return
        latDeAnchos = lat
        val p = Proyecciones.de(v.proyeccion)
        for ((id, base) in CapasMapa.ANCHOS_BASE) {
            val capa: Layer = s.getLayer(id) ?: continue
            val paradas = anchoDeCalle(base, p.metrosPorMetroDeJuego, lat)
            capa.setProperties(PropertyFactory.lineWidth(Expression.raw(expresionAncho(paradas))))
        }
    }

    /** La bandera del destino: el mastil sale del punto exacto, abajo a la izquierda. */
    private fun bandera(color: Int): Bitmap {
        val densidad = mapView.resources.displayMetrics.density
        val lado = (30 * densidad).toInt()
        val b = Bitmap.createBitmap(lado, lado, Bitmap.Config.ARGB_8888)
        val c = Canvas(b)
        val u = lado / 24f
        val contorno = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            this.color = Color.parseColor("#0D0F12")
            style = Paint.Style.STROKE
            strokeWidth = 1.2f * densidad
            strokeJoin = Paint.Join.ROUND
        }
        val tela = Path().apply {
            moveTo(3 * u, 2 * u)
            lineTo(21 * u, 7 * u)
            lineTo(3 * u, 13 * u)
            close()
        }
        c.drawPath(tela, Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color; style = Paint.Style.FILL })
        c.drawPath(tela, contorno)
        c.drawRect(2 * u, 2 * u, 4 * u, 24 * u, Paint().apply { this.color = Color.WHITE })
        b.density = mapView.resources.displayMetrics.densityDpi
        return b
    }

    private fun flecha(relleno: Int, borde: Int, anchoBorde: Float): Bitmap {
        val densidad = mapView.resources.displayMetrics.density
        val lado = (34 * densidad).toInt()
        val b = Bitmap.createBitmap(lado, lado, Bitmap.Config.ARGB_8888)
        val c = Canvas(b)
        val u = lado / 24f
        val forma = Path().apply {
            moveTo(12 * u, 2 * u)
            lineTo(20 * u, 21 * u)
            lineTo(12 * u, 16 * u)
            lineTo(4 * u, 21 * u)
            close()
        }
        c.drawPath(forma, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = relleno; style = Paint.Style.FILL })
        c.drawPath(
            forma,
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = borde
                style = Paint.Style.STROKE
                strokeWidth = anchoBorde * densidad / 2
                strokeJoin = Paint.Join.ROUND
            },
        )
        b.density = mapView.resources.displayMetrics.densityDpi
        return b
    }

    /** addRoadShieldImage de app.js: el escudo de la ruta, con el numero adentro. */
    private fun dibujarEscudo(e: EscudoRuta, densidad: Float, dpi: Int): Bitmap {
        // Las medidas de la web son pixeles de una imagen a 2x.
        val escala = densidad / 2
        val w = if (e.numero.length >= 3) 52f else 44f
        val h = 46f
        val m = 2f
        val borde = 3f
        val b = Bitmap.createBitmap((w * escala).toInt().coerceAtLeast(1), (h * escala).toInt().coerceAtLeast(1), Bitmap.Config.ARGB_8888)
        val c = Canvas(b)
        c.scale(escala, escala)
        fun forma(x: Float, y: Float, ancho: Float, alto: Float) = Path().apply {
            moveTo(x, y + alto * 0.1f)
            quadTo(x + ancho * 0.5f, y + alto * 0.22f, x + ancho, y + alto * 0.1f)
            cubicTo(x + ancho * 1.03f, y + alto * 0.5f, x + ancho * 0.9f, y + alto * 0.8f, x + ancho * 0.5f, y + alto)
            cubicTo(x + ancho * 0.1f, y + alto * 0.8f, x - ancho * 0.03f, y + alto * 0.5f, x, y + alto * 0.1f)
            close()
        }
        val anchoInterior = w - 2 * (m + borde)
        val altoInterior = h - 2 * (m + borde)
        val pintura = Paint(Paint.ANTI_ALIAS_FLAG)
        pintura.color = if (e.interestatal) Color.WHITE else Color.parseColor("#111111")
        c.drawPath(forma(m, m, w - 2 * m, h - 2 * m), pintura)
        c.save()
        c.clipPath(forma(m + borde, m + borde, anchoInterior, altoInterior))
        pintura.color = if (e.interestatal) Color.parseColor("#1F4FB4") else Color.WHITE
        c.drawRect(0f, 0f, w, h, pintura)
        if (e.interestatal) {
            pintura.color = Color.parseColor("#C8202F")
            c.drawRect(0f, 0f, w, m + borde + altoInterior * 0.32f, pintura)
        }
        c.restore()
        pintura.color = if (e.interestatal) Color.WHITE else Color.parseColor("#111111")
        pintura.textSize = if (e.numero.length >= 3) 17f else 20f
        pintura.typeface = Typeface.DEFAULT_BOLD
        pintura.textAlign = Paint.Align.CENTER
        val centroY = m + borde + altoInterior * (if (e.interestatal) 0.64f else 0.55f)
        c.drawText(e.numero, w / 2, centroY - (pintura.descent() + pintura.ascent()) / 2, pintura)
        b.density = dpi
        return b
    }

    private companion object {
        val TOKEN_EMPRESA = Regex("^[a-z0-9_]{1,64}$")
        const val MS_POR_CUADRO = 50L
        const val SUAVIZADO_MS = 180.0
        const val SALTO_GRADOS = 0.2
        const val ZOOM_SEGUIR = 11.0
        const val ZOOM_SEGUIR_MIN = 7.0
        const val PASO_LAT_ANCHOS = 2.0
    }
}

/** El camino mas corto de un angulo a otro, entre -180 y 180. */
internal fun diferenciaAngular(hacia: Double, desde: Double): Double {
    val d = (hacia - desde + 540) % 360 - 180
    return if (d < -180) d + 360 else d
}
