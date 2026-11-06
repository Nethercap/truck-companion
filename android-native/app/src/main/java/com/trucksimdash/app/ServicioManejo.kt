package com.trucksimdash.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/**
 * Con una sesion abierta la app sigue andando aunque se pase a otra (Moonlight, por ejemplo):
 * sin esto Android la congela, y se quedan sin voz, sin overlay en el juego y sin ruta en el mapa
 * en vivo. Lo unico que hace es existir y mostrar el proximo giro; el socket y el motor son de
 * [Contenedor], que tambien decide cuando prenderlo y apagarlo.
 *
 * "connectedDevice" porque es lo que hace: hablar con la PC por la red. dataSync se corta a las 6
 * horas, y un viaje largo las pasa.
 */
class ServicioManejo : Service() {
    private val alcance = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var despierto: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CANAL, getString(R.string.servicio_canal), NotificationManager.IMPORTANCE_LOW),
        )
        // Con la pantalla apagada y solo la voz, el motor tiene que seguir corriendo.
        despierto = getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "truckdash:manejo")
            .apply { acquire(TOPE_DESPIERTO_MS) }
        val contenedor = (application as TruckDashApp).contenedor
        alcance.launch {
            contenedor.nav.estado
                .map { n ->
                    val detalle = listOfNotNull(n.resumen?.falta, n.resumen?.llegada).joinToString(" · ")
                    (n.giro?.texto ?: getString(R.string.app_name)) to detalle.ifEmpty { getString(R.string.servicio_activo) }
                }
                .distinctUntilChanged()
                .collect { (titulo, detalle) -> mostrar(titulo, detalle) }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACCION_DESCONECTAR) {
            (application as TruckDashApp).contenedor.sesion.desconectar()
            stopSelf()
            return START_NOT_STICKY
        }
        // Sin esto en cinco segundos, Android cierra la app.
        mostrar(getString(R.string.app_name), getString(R.string.servicio_activo))
        // El socket no sobrevive a que maten el proceso: al volver se conecta solo.
        return START_NOT_STICKY
    }

    private fun mostrar(titulo: String, detalle: String) {
        val abrir = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val desconectar = PendingIntent.getService(
            this, 1, Intent(this, ServicioManejo::class.java).setAction(ACCION_DESCONECTAR),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val aviso = NotificationCompat.Builder(this, CANAL)
            .setSmallIcon(R.mipmap.ic_launcher_monochrome)
            .setContentTitle(titulo)
            .setContentText(detalle)
            .setContentIntent(abrir)
            .setCategory(NotificationCompat.CATEGORY_NAVIGATION)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .addAction(0, getString(R.string.desconectar), desconectar)
            .build()
        ServiceCompat.startForeground(
            this,
            ID,
            aviso,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE else 0,
        )
    }

    override fun onDestroy() {
        alcance.cancel()
        despierto?.takeIf { it.isHeld }?.release()
        super.onDestroy()
    }

    companion object {
        private const val CANAL = "manejo"
        private const val ID = 1
        private const val ACCION_DESCONECTAR = "com.trucksimdash.app.DESCONECTAR"

        // Por si algo falla al apagarlo: un viaje largo, no para siempre.
        private const val TOPE_DESPIERTO_MS = 12 * 60 * 60 * 1000L

        fun intent(contexto: Context) = Intent(contexto, ServicioManejo::class.java)
    }
}
