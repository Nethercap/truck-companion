# Los informes de cierre (core/Fallos.kt) tienen que leerse sin el mapping: el codigo es publico.
-dontobfuscate
-keepattributes SourceFile,LineNumberTable

# MapLibre llama a estas clases desde el codigo nativo por nombre (JNI).
-keep class org.maplibre.** { *; }
-dontwarn org.maplibre.**
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
# QuickJS: el codigo nativo llama a estas clases por nombre.
-keep class com.whl.quickjs.** { *; }
