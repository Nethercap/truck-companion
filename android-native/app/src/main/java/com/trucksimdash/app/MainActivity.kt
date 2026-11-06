package com.trucksimdash.app

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import com.trucksimdash.app.ui.AppRaiz
import com.trucksimdash.app.ui.Paleta
import com.trucksimdash.app.ui.TemaTruckDash

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)
        val contenedor = (application as TruckDashApp).contenedor
        setContent {
            TemaTruckDash {
                Box(Modifier.fillMaxSize().background(Paleta.Fondo)) {
                    AppRaiz(contenedor)
                }
            }
        }
    }
}
