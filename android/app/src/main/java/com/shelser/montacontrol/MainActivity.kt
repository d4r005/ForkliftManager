package com.shelser.montacontrol

import android.os.Bundle
import android.util.Log
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.ConsoleMessage
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    private val TAG = "MontaControl"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // FLAG_SECURE: bloquea capturas de pantalla
        window.setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        )

        // Capturar logs de consola del JavaScript para diagnosticar la pantalla en blanco.
        // Solo sobrescribimos WebChromeClient (seguro) — NO tocamos WebViewClient
        // porque Capacitor necesita el suyo para que el bridge funcione.
        try {
            val bridgeWebView = findViewById<android.webkit.WebView>(com.getcapacitor.R.id.webview)
            if (bridgeWebView != null) {
                Log.d(TAG, "WebView found — bridge initialized OK")

                bridgeWebView.webChromeClient = object : WebChromeClient() {
                    override fun onConsoleMessage(consoleMessage: ConsoleMessage): Boolean {
                        Log.d(
                            "$TAG-JS",
                            "[${consoleMessage.messageLevel()}] ${consoleMessage.message()} (${consoleMessage.sourceId()}:${consoleMessage.lineNumber()})"
                        )
                        return true
                    }
                }

                Log.d(TAG, "WebView URL: ${bridgeWebView.url}")
                Log.d(TAG, "WebView settings: JS=${bridgeWebView.settings.javaScriptEnabled}, DOMStorage=${bridgeWebView.settings.domStorageEnabled}")
            } else {
                Log.e(TAG, "WebView NOT found — bridge failed to initialize!")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error setting up WebView logging", e)
        }
    }
}
