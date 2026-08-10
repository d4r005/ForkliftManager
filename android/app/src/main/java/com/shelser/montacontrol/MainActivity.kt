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
        // Comentado para depuración
        /*
        window.setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        )
        */

        try {
            val bridgeWebView = bridge.webView
            if (bridgeWebView != null) {
                bridgeWebView.webChromeClient = object : WebChromeClient() {
                    override fun onConsoleMessage(consoleMessage: ConsoleMessage): Boolean {
                        Log.d(
                            "$TAG-JS",
                            "[${consoleMessage.messageLevel()}] ${consoleMessage.message()} (${consoleMessage.sourceId()}:${consoleMessage.lineNumber()})"
                        )
                        return true
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error setting up WebView logging", e)
        }
    }
}
