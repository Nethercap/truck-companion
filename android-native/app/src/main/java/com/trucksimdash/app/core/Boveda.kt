package com.trucksimdash.app.core

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.core.content.edit
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Guarda el token de la cuenta cifrado con una clave del Keystore de Android,
 * que no sale del telefono. La app no pide ninguna contrasena: el token lo
 * entrega la API despues de que la persona aprueba el vinculo en la web.
 */
class Boveda(contexto: Context) {
    private val sp = contexto.getSharedPreferences("truckdash_boveda", Context.MODE_PRIVATE)

    private fun clave(): SecretKey {
        val almacen = KeyStore.getInstance(ALMACEN).apply { load(null) }
        (almacen.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val generador = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ALMACEN)
        generador.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generador.generateKey()
    }

    var token: String?
        get() = runCatching {
            val guardado = sp.getString(CAMPO, null) ?: return null
            val (iv, cifrado) = guardado.split(":", limit = 2)
            val cifrador = Cipher.getInstance(TRANSFORMACION)
            cifrador.init(Cipher.DECRYPT_MODE, clave(), GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)))
            String(cifrador.doFinal(Base64.decode(cifrado, Base64.NO_WRAP)), Charsets.UTF_8)
        }.getOrNull() // si la clave se perdio, es como no tener token: se vincula otra vez
        set(valor) {
            if (valor == null) {
                sp.edit { remove(CAMPO) }
                return
            }
            val cifrador = Cipher.getInstance(TRANSFORMACION)
            cifrador.init(Cipher.ENCRYPT_MODE, clave())
            val iv = Base64.encodeToString(cifrador.iv, Base64.NO_WRAP)
            val cifrado = Base64.encodeToString(cifrador.doFinal(valor.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
            sp.edit { putString(CAMPO, "$iv:$cifrado") }
        }

    private companion object {
        const val ALMACEN = "AndroidKeyStore"
        const val ALIAS = "truckdash_cuenta"
        const val CAMPO = "token"
        const val TRANSFORMACION = "AES/GCM/NoPadding"
    }
}
