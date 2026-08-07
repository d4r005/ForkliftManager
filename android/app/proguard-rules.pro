# ProGuard rules for MontaControl Android

# Keep WebView and JavaScript interface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep WebView client
-keep class android.webkit.WebViewClient { *; }
-keep class com.shelser.montacontrol.MainActivity { *; }

# General Android rules
-dontwarn android.webkit.WebView
-dontwarn android.webkit.WebSettings
