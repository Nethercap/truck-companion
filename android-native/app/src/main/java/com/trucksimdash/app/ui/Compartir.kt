package com.trucksimdash.app.ui

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/** La pantalla de compartir de Android con una imagen: navigator.share en la web. */
internal suspend fun compartirImagen(contexto: Context, imagen: Bitmap, nombre: String) {
    val archivo = withContext(Dispatchers.IO) {
        val carpeta = File(contexto.cacheDir, "compartir").apply { mkdirs() }
        File(carpeta, nombre).also { destino ->
            // La que sale de una capa es de hardware: asi no se puede comprimir.
            val copia = imagen.copy(Bitmap.Config.ARGB_8888, false)
            destino.outputStream().use { copia.compress(Bitmap.CompressFormat.PNG, 100, it) }
        }
    }
    val uri = FileProvider.getUriForFile(contexto, "${contexto.packageName}.archivos", archivo)
    val intent = Intent(Intent.ACTION_SEND)
        .setType("image/png")
        .putExtra(Intent.EXTRA_STREAM, uri)
        .putExtra(Intent.EXTRA_TEXT, "trucksim-dash.com")
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    contexto.startActivity(Intent.createChooser(intent, null))
}
