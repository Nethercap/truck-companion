import javax.inject.Inject

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

// Lo que la app trae adentro y ya existe en la web: se copia al compilar, asi
// no hay una segunda copia en git que se quede vieja. El manifest es solo el
// respaldo sin internet: al arrancar se baja el publicado (ver CatalogoMapas).
abstract class CopiarDatosWeb : DefaultTask() {
    @get:InputFile
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val manifest: RegularFileProperty

    @get:OutputDirectory
    abstract val salida: DirectoryProperty

    @TaskAction
    fun copiar() {
        val destino = salida.get().asFile
        destino.deleteRecursively()
        destino.mkdirs()
        manifest.get().asFile.copyTo(destino.resolve("map-manifest.json"), overwrite = true)
    }
}

val copiarDatosWeb = tasks.register<CopiarDatosWeb>("copiarDatosWeb") {
    manifest.set(rootProject.layout.projectDirectory.file("../docs/data/map-manifest.json"))
    salida.set(layout.buildDirectory.dir("generated/datosWeb"))
}

// El motor de navegacion: el codigo de la web empaquetado para QuickJS, sin copias en git
// (tools/armar_motor.js). Falla si la web renombro algo que hace falta: se ve al compilar.
abstract class ArmarMotor @Inject constructor(private val ejecutar: ExecOperations) : DefaultTask() {
    @get:InputFiles
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val fuentes: ConfigurableFileCollection

    @get:InputFile
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val armador: RegularFileProperty

    @get:OutputDirectory
    abstract val salida: DirectoryProperty

    @TaskAction
    fun armar() {
        ejecutar.exec {
            commandLine("node", armador.get().asFile.path, salida.get().asFile.resolve("motor/motor.js").path)
        }
    }
}

val armarMotor = tasks.register<ArmarMotor>("armarMotor") {
    val raiz = rootProject.layout.projectDirectory
    fuentes.from(
        raiz.dir("motor"),
        raiz.file("../docs/app/app.js"),
        raiz.file("../docs/app/convoy.js"),
        raiz.file("../docs/app/pure.js"),
        raiz.file("../docs/app/variants.js"),
        raiz.file("../docs/app/i18n.js"),
        raiz.file("../docs/app/i18n_en_es.js"),
        raiz.file("../docs/app/vendor/proj4-2.15.0.js"),
    )
    armador.set(raiz.file("tools/armar_motor.js"))
    salida.set(layout.buildDirectory.dir("generated/motorNav"))
}

android {
    // El namespace es el de la app de Play. El applicationId no todavia: mientras
    // esta no reemplace a la TWA, las dos conviven en el telefono.
    namespace = "com.trucksimdash.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.trucksimdash.app.nativa"
        minSdk = 24
        targetSdk = 36
        // Se suben a mano en cada beta: Android no instala una con un versionCode mas bajo.
        versionCode = (System.getenv("TD_VERSION_CODE") ?: "2").toInt()
        versionName = System.getenv("TD_VERSION_NAME") ?: "0.2.0"
        // En el telefono esta al lado de la TWA de Play: que el icono diga cual es.
        manifestPlaceholders["etiqueta"] = "Truck Dash Beta"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    // Ademas del APK universal, uno por arquitectura: el de un telefono pesa la mitad.
    splits {
        abi {
            isEnable = true
            reset()
            include("arm64-v8a", "armeabi-v7a", "x86_64")
            isUniversalApk = true
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    // El idioma por app de Android 13 en adelante, con los que haya en res/.
    androidResources {
        generateLocaleConfig = true
    }

    // Como la TWA (workflow, ver README): la clave de subida sale del entorno y nunca
    // va al repo. Sin ella, release se firma con la de debug: sirve para probar lo que
    // hace R8 en un telefono, no para subirla a Play.
    signingConfigs {
        create("subida") {
            System.getenv("TD_KEYSTORE")?.let { ruta ->
                storeFile = file(ruta)
                storePassword = System.getenv("TD_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("TD_KEY_ALIAS")
                keyPassword = System.getenv("TD_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName(if (System.getenv("TD_KEYSTORE") != null) "subida" else "debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

androidComponents {
    onVariants { variante ->
        variante.sources.assets?.addGeneratedSourceDirectory(copiarDatosWeb, CopiarDatosWeb::salida)
        variante.sources.assets?.addGeneratedSourceDirectory(armarMotor, ArmarMotor::salida)
    }
}

dependencies {
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.compose.icons)
    implementation(libs.activity.compose)
    implementation(libs.lifecycle.runtime.compose)
    implementation(libs.lifecycle.process)
    implementation(libs.core.ktx)
    implementation(libs.browser)
    implementation(libs.coroutines.android)
    implementation(libs.serialization.json)
    implementation(libs.okhttp)
    implementation(libs.maplibre)
    implementation(libs.quickjs)
    debugImplementation(libs.compose.ui.tooling)

    testImplementation(libs.junit)
    testImplementation(libs.coroutines.test)
    androidTestImplementation(libs.junit)
    androidTestImplementation(libs.test.runner)
    androidTestImplementation(libs.test.ext.junit)
}
