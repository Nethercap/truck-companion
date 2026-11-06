package com.trucksimdash.app.core

import android.content.Context
import androidx.core.content.edit
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

enum class Unidades { Auto, Kilometros, Millas }

/** Un boton de comando con una tecla elegida por la persona (customButtons en la web). */
data class BotonPropio(val titulo: String, val tecla: String)

/** CUSTOM_BUTTONS_MAX en la web: la botonera tiene lugar para pocos. */
const val BOTONES_PROPIOS_MAX = 3

private fun leerBotones(texto: String?): List<BotonPropio> {
    if (texto == null) return emptyList()
    return runCatching { Json.parseToJsonElement(texto) as? JsonArray }.getOrNull()?.mapNotNull { fila ->
        val o = fila.comoObjeto() ?: return@mapNotNull null
        BotonPropio(o.texto("titulo") ?: return@mapNotNull null, o.texto("tecla") ?: return@mapNotNull null)
    }.orEmpty().take(BOTONES_PROPIOS_MAX)
}

/**
 * parse_custom_key del cliente: "ctrl+shift+f5". Aca solo para avisar antes de guardar: el
 * que decide es el cliente, y uno viejo o nuevo puede contestar bad_key igual.
 */
fun teclaValida(texto: String): Boolean {
    val partes = texto.split("+").map { it.trim().lowercase() }
    if (partes.isEmpty() || partes.any { it.isEmpty() } || partes.size > 4) return false
    val mods = partes.dropLast(1)
    val tecla = partes.last()
    if (mods.toSet().size != mods.size || mods.any { it !in MODIFICADORES }) return false
    if (tecla !in TECLAS_PERMITIDAS) return false
    return !("alt" in mods && tecla == "f4")
}

/** La etiqueta del boton: keyCapLabel en la web. */
fun etiquetaDeTecla(tecla: String): String = tecla.split("+").joinToString("+") { parte ->
    when {
        Regex("^(f[0-9]+|[a-z0-9])$").matches(parte) -> parte.uppercase()
        Regex("^num[0-9]$").matches(parte) -> "Num " + parte.drop(3)
        Regex("^[a-z].*").matches(parte) -> parte.replaceFirstChar { it.uppercase() }
        else -> parte
    }
}

private val MODIFICADORES = setOf("ctrl", "shift", "alt")
private val TECLAS_PERMITIDAS: Set<String> =
    ("abcdefghijklmnopqrstuvwxyz0123456789".map { it.toString() } +
        (1..24).map { "f$it" } +
        (0..9).map { "num$it" } +
        listOf(
            "space", "enter", "tab", "esc", "backspace", "delete", "insert", "home", "end", "pageup", "pagedown",
            "up", "down", "left", "right", "add", "subtract", "multiply", "divide", "decimal",
            ";", "'", ",", ".", "/", "\\", "[", "]", "-", "=", "`",
        )).toSet()

/** Como se conecta al cliente de la PC. */
sealed interface Destino {
    data class Codigo(val codigo: String) : Destino
    data class Lan(val host: String) : Destino
}

data class Ajustes(
    val unidades: Unidades = Unidades.Auto,
    val pantallaEncendida: Boolean = true,
    val mostrarOtros: Boolean = true,
    val apodo: String = "",
    val voz: Boolean = false,
    val botones: List<BotonPropio> = emptyList(),
)

/**
 * Lo que queda guardado en el telefono. Cada setter escribe solo su clave, como
 * `settingsChangedKeys` en la web: nunca todo lo que hay en memoria.
 */
class Preferencias(contexto: Context) {
    private val sp = contexto.getSharedPreferences("truckdash", Context.MODE_PRIVATE)

    private val _ajustes = MutableStateFlow(
        Ajustes(
            unidades = runCatching { Unidades.valueOf(sp.getString("unidades", "") ?: "") }.getOrDefault(Unidades.Auto),
            pantallaEncendida = sp.getBoolean("pantallaEncendida", true),
            mostrarOtros = sp.getBoolean("mostrarOtros", true),
            apodo = sp.getString("apodo", "") ?: "",
            voz = sp.getBoolean("voz", false),
            botones = leerBotones(sp.getString("botones", null)),
        ),
    )
    val ajustes: StateFlow<Ajustes> = _ajustes.asStateFlow()

    fun ponerUnidades(valor: Unidades) {
        sp.edit { putString("unidades", valor.name) }
        _ajustes.value = _ajustes.value.copy(unidades = valor)
    }

    fun ponerPantallaEncendida(valor: Boolean) {
        sp.edit { putBoolean("pantallaEncendida", valor) }
        _ajustes.value = _ajustes.value.copy(pantallaEncendida = valor)
    }

    fun ponerMostrarOtros(valor: Boolean) {
        sp.edit { putBoolean("mostrarOtros", valor) }
        _ajustes.value = _ajustes.value.copy(mostrarOtros = valor)
    }

    fun ponerApodo(valor: String) {
        sp.edit { putString("apodo", valor) }
        _ajustes.value = _ajustes.value.copy(apodo = valor)
    }

    fun ponerBotones(valor: List<BotonPropio>) {
        val texto = JsonArray(
            valor.map { b -> buildJsonObject { put("titulo", b.titulo); put("tecla", b.tecla) } },
        ).toString()
        sp.edit { putString("botones", texto) }
        _ajustes.value = _ajustes.value.copy(botones = valor)
    }

    fun ponerVoz(valor: Boolean) {
        sp.edit { putBoolean("voz", valor) }
        _ajustes.value = _ajustes.value.copy(voz = valor)
    }

    /** A donde se conecto la ultima vez: al abrir, se vuelve solo. */
    var ultimoDestino: Destino?
        get() {
            sp.getString("destinoCodigo", null)?.let { return Destino.Codigo(it) }
            sp.getString("destinoLan", null)?.let { return Destino.Lan(it) }
            return null
        }
        set(valor) = sp.edit {
            remove("destinoCodigo")
            remove("destinoLan")
            when (valor) {
                is Destino.Codigo -> putString("destinoCodigo", valor.codigo)
                is Destino.Lan -> putString("destinoLan", valor.host)
                null -> Unit
            }
        }

    /**
     * Si esta persona eligio compartir su posicion. null = nunca toco el tilde:
     * al conectar no se le manda nada al relay, ni para prenderlo ni para
     * apagar lo que eligio otro dispositivo (`liveShareChoice` en la web).
     */
    var compartirElegido: Boolean?
        get() = if (sp.contains("compartir")) sp.getBoolean("compartir", false) else null
        set(valor) = sp.edit {
            if (valor == null) remove("compartir") else putBoolean("compartir", valor)
        }

    /** Variante de mapa elegida a mano para un juego; null = la detectada. */
    fun mapaManual(juego: String): String? = sp.getString("mapaManual_$juego", null)

    fun ponerMapaManual(juego: String, variante: String?) = sp.edit {
        if (variante == null) remove("mapaManual_$juego") else putString("mapaManual_$juego", variante)
    }

    /** Relay de pruebas: solo lo mira el build de debug (ver SesionRepo). */
    var relayDePrueba: String?
        get() = sp.getString("relayDePrueba", null)
        set(valor) = sp.edit {
            if (valor.isNullOrBlank()) remove("relayDePrueba") else putString("relayDePrueba", valor)
        }

    /** API de cuentas de pruebas: solo la mira el build de debug. */
    var apiDePrueba: String?
        get() = sp.getString("apiDePrueba", null)
        set(valor) = sp.edit {
            if (valor.isNullOrBlank()) remove("apiDePrueba") else putString("apiDePrueba", valor.trimEnd('/'))
        }

    /** La ultima variante que se dibujo, para no abrir el mapa en blanco. */
    var ultimaVariante: String?
        get() = sp.getString("ultimaVariante", null)
        set(valor) = sp.edit { putString("ultimaVariante", valor) }
}
