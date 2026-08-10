# ProGuard rules for ForkliftManager Android

# Keep WebView and JavaScript interface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep WebView client
-keep class android.webkit.WebViewClient { *; }
-keep class com.shelser.montacontrol.MainActivity { *; }

# Keep Capacitor bridge classes
-keep class com.getcapacitor.** { *; }
-keep class io.ionic.** { *; }
-keep class com.ionic.** { *; }

# Keep all plugin classes
-keep class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.annotation.CapacitorMethod <methods>;
}

# Keep React and its internal classes
-keep class com.facebook.react.** { *; }
-dontwarn com.facebook.react.**

# Keep Supabase / postgrest client
-keep class io.supabase.** { *; }
-keep class org.postgrest.** { *; }
-dontwarn org.postgrest.**
-dontwarn io.supabase.**

# Keep all JS bundle assets
-keep class **.R$* { *; }

# General Android rules
-dontwarn android.webkit.WebView
-dontwarn android.webkit.WebSettings

# Keep model/POJO classes used by the app
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}

# Keep enums
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}
