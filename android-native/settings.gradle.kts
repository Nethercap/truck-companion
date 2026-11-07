// App nativa de Android de Truck Dash: Kotlin, Compose y MapLibre Native. No es
// la TWA de android/ (la web envuelta en Chrome): aca la interfaz es propia y
// habla directo con el relay, los mapas de R2 y la API de cuentas. Ver README.md.
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "TruckDashNativa"
include(":app")
