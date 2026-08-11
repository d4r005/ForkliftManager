package com.shelser.montacontrol

import android.os.Bundle
import android.view.WindowManager
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // FLAG_SECURE: bloquea capturas de pantalla
        // Comentado para depuración
        /*
        window.setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        )
        */

        // NOTA: No reemplazar bridge.webView.webChromeClient aquí.
        // Capacitor instala BridgeWebChromeClient, que maneja:
        //   - onShowFileChooser → <input type="file"> (subir fotos, placa, etc.)
        //   - onConsoleMessage → logs de JS en Logcat (tag "Console")
        //   - onGeolocationPermissionsShowPrompt
        //   - permisos de cámara para captura directa
        // Si se sobreescribe con un WebChromeClient plano, se pierden TODOS esos
        // handlers y los <input type="file"> dejan de funcionar en Android.
        // El logging de consola que se agregó aquí durante el debugging de la
        // pantalla en blanco ya viene incluido por defecto en BridgeWebChromeClient.
    }
}
