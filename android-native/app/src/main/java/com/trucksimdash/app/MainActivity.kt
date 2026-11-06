package com.trucksimdash.app

import android.app.PictureInPictureParams
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.util.Rational
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.lifecycle.lifecycleScope
import com.trucksimdash.app.ui.AppRaiz
import com.trucksimdash.app.ui.AvisoDeFallo
import com.trucksimdash.app.ui.Paleta
import com.trucksimdash.app.ui.TemaTruckDash
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch

private val FORMA_FLOTANTE = Rational(16, 9)

class MainActivity : ComponentActivity() {
    private val flotante = mutableStateOf(false)
    private val app get() = application as TruckDashApp
    private val contenedor get() = app.contenedor

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)
        addOnPictureInPictureModeChangedListener { flotante.value = it.isInPictureInPictureMode }
        val arrancada = mutableStateOf(app.arrancada)
        if (app.arrancada) empezar()
        setContent {
            TemaTruckDash {
                Box(Modifier.fillMaxSize().background(Paleta.Fondo)) {
                    if (arrancada.value) {
                        AppRaiz(contenedor, flotante.value, ::abrirFlotante)
                    } else {
                        AvisoDeFallo(app.fallos) {
                            app.fallos.olvidar()
                            app.arrancar()
                            empezar()
                            arrancada.value = true
                        }
                    }
                }
            }
        }
    }

    private fun empezar() {
        leerEnlace(intent)
        // Desde Android 12 el sistema entra solo y con la animacion buena, si se le avisa antes.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            lifecycleScope.launch {
                combine(contenedor.sesion.estado, contenedor.prefs.ajustes) { e, a -> e.enVivo && a.flotanteAlSalir }
                    .distinctUntilChanged()
                    .collect { auto ->
                        setPictureInPictureParams(PictureInPictureParams.Builder().setAspectRatio(FORMA_FLOTANTE).setAutoEnterEnabled(auto).build())
                    }
            }
        }
    }

    /** La ventana chica arriba de la otra app: Document Picture-in-Picture en la web. */
    private fun abrirFlotante() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        if (!packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)) return
        runCatching { enterPictureInPictureMode(PictureInPictureParams.Builder().setAspectRatio(FORMA_FLOTANTE).build()) }
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S || !app.arrancada) return
        if (contenedor.prefs.ajustes.value.flotanteAlSalir && contenedor.sesion.estado.value.enVivo) abrirFlotante()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // Con el aviso de un cierre todavia en pantalla, lo lee empezar().
        if (app.arrancada) leerEnlace(intent) else setIntent(intent)
    }

    private fun leerEnlace(intent: Intent?) {
        val codigo = intent?.data?.getQueryParameter("convoy")?.trim()?.uppercase() ?: return
        if (codigo.length == 6) contenedor.enlaceConvoy.value = codigo
    }
}
