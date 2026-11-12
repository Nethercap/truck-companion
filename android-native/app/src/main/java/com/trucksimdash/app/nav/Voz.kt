package com.trucksimdash.app.nav

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Base64
import java.io.File
import java.util.Locale

/**
 * Lo que suena. Que decir y cuando lo decide la web (speakVoice, voiceGuide); aca llegan
 * los clips de sus paquetes o, en una voz del sistema, el texto para TextToSpeech. Baja el
 * volumen de lo demas (el juego por Moonlight, la musica) mientras habla.
 *
 * `volumen` es el de Ajustes: baja solo la voz, sin tocar el del telefono, que tambien es el
 * del juego por Moonlight y el de la musica (pedido de Discord, 12-11).
 */
class Voz(contexto: Context, private val volumen: () -> Float, private val alTerminar: (Int) -> Unit) {
    private val app = contexto.applicationContext
    private val audio = app.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val atributos = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build()
    private val foco = if (Build.VERSION.SDK_INT >= 26) {
        AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK).setAudioAttributes(atributos).build()
    } else {
        null
    }
    private var reproductor: MediaPlayer? = null
    private var tts: TextToSpeech? = null
    private var ttsListo = false
    private var pendienteTts: Triple<Int, String, String?>? = null

    private fun pedirFoco() {
        if (Build.VERSION.SDK_INT >= 26) {
            foco?.let { audio.requestAudioFocus(it) }
        } else {
            @Suppress("DEPRECATION")
            audio.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
        }
    }

    private fun soltarFoco() {
        if (Build.VERSION.SDK_INT >= 26) {
            foco?.let { audio.abandonAudioFocusRequest(it) }
        } else {
            @Suppress("DEPRECATION")
            audio.abandonAudioFocus(null)
        }
    }

    /** Un clip `data:audio/mpeg;base64,...` de un paquete de voz. */
    fun clip(id: Int, src: String) {
        val base64 = src.substringAfter("base64,", "")
        if (base64.isEmpty()) {
            alTerminar(id)
            return
        }
        runCatching {
            val archivo = File(app.cacheDir, "voz-$id.mp3")
            archivo.writeBytes(Base64.decode(base64, Base64.DEFAULT))
            reproductor?.release()
            pedirFoco()
            reproductor = MediaPlayer().apply {
                setAudioAttributes(atributos)
                setDataSource(archivo.path)
                setOnCompletionListener {
                    it.release()
                    if (reproductor === it) reproductor = null
                    archivo.delete()
                    soltarFoco()
                    alTerminar(id)
                }
                setOnErrorListener { mp, _, _ ->
                    mp.release()
                    if (reproductor === mp) reproductor = null
                    archivo.delete()
                    soltarFoco()
                    alTerminar(id)
                    true
                }
                prepare()
                val a = amplitudVoz(volumen())
                setVolume(a, a)
                start()
            }
        }.onFailure {
            soltarFoco()
            alTerminar(id)
        }
    }

    /** Una frase para la voz del sistema: los idiomas sin paquete. */
    fun texto(id: Int, frase: String, idioma: String?) {
        val motorTts = tts
        if (motorTts == null) {
            pendienteTts = Triple(id, frase, idioma)
            tts = TextToSpeech(app) { estado ->
                ttsListo = estado == TextToSpeech.SUCCESS
                val p = pendienteTts
                pendienteTts = null
                if (p != null) {
                    if (ttsListo) decir(p.first, p.second, p.third) else alTerminar(p.first)
                }
            }.also { t ->
                t.setAudioAttributes(atributos)
                t.setOnUtteranceProgressListener(
                    object : UtteranceProgressListener() {
                        override fun onStart(utteranceId: String?) = Unit
                        override fun onDone(utteranceId: String?) {
                            soltarFoco()
                            utteranceId?.toIntOrNull()?.let(alTerminar)
                        }

                        @Deprecated("Deprecated in Java")
                        override fun onError(utteranceId: String?) {
                            soltarFoco()
                            utteranceId?.toIntOrNull()?.let(alTerminar)
                        }
                    },
                )
            }
            return
        }
        if (!ttsListo) {
            alTerminar(id)
            return
        }
        decir(id, frase, idioma)
    }

    private fun decir(id: Int, frase: String, idioma: String?) {
        val t = tts ?: return alTerminar(id)
        if (idioma != null) t.language = Locale.forLanguageTag(idioma)
        pedirFoco()
        val parametros = Bundle().apply { putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, amplitudVoz(volumen())) }
        t.speak(frase, TextToSpeech.QUEUE_FLUSH, parametros, id.toString())
    }
}

/**
 * Del deslizador a lo que se le pasa al reproductor, que es lineal: al cuadrado, para que la
 * mitad del recorrido se oiga como la mitad y no casi igual que al maximo.
 */
internal fun amplitudVoz(volumen: Float): Float {
    val v = volumen.coerceIn(0f, 1f)
    return v * v
}
