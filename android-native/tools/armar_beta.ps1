<#
Arma la beta firmada con la clave propia, para repartir el APK sin Play.

    powershell -ExecutionPolicy Bypass -File android-native\tools\armar_beta.ps1

La primera vez crea la clave (por defecto en la carpeta del usuario, fuera del repo). La contrasena
se escribe aca: no se guarda ni se imprime, y solo la ve la compilacion. Con TD_KEYSTORE_PASSWORD
en el entorno no la pregunta.

Sin esa clave no se puede actualizar lo ya instalado: una firma distinta obliga a desinstalar, y
quien prueba pierde los ajustes y la cuenta vinculada.
#>
param(
    [string]$Clave = (Join-Path $HOME "truckdash-beta.jks"),
    [string]$Alias = "beta"
)
$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot

# El JDK de Android Studio: con un JAVA_HOME equivocado Gradle falla sin decir nada util.
$jdk = @($env:JAVA_HOME, "D:\Program Files\Android\Android Studio\jbr", "C:\Program Files\Android\Android Studio\jbr") |
    Where-Object { $_ -and (Test-Path (Join-Path $_ "bin\keytool.exe")) } | Select-Object -First 1
if (-not $jdk) { throw "No encontre el JDK de Android Studio. Pone su carpeta jbr en JAVA_HOME." }
$env:JAVA_HOME = $jdk

$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA "Android\Sdk" }
$herramientas = Get-ChildItem (Join-Path $sdk "build-tools") | Sort-Object { [version]($_.Name -replace '[^0-9.]', '') } | Select-Object -Last 1
if (-not $herramientas) { throw "No encontre las build-tools del SDK de Android en $sdk." }

if (-not (Test-Path $Clave)) {
    Write-Host "Creo la clave en $Clave. Elegi una contrasena y escribila dos veces." -ForegroundColor Cyan
    & (Join-Path $jdk "bin\keytool.exe") -genkeypair -keystore $Clave -alias $Alias -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=Truck Dash Beta"
    if ($LASTEXITCODE -ne 0) { throw "keytool no pudo crear la clave." }
    Write-Host "Guarda una copia de $Clave y su contrasena en otro lado: si se pierden, no hay mas actualizaciones." -ForegroundColor Yellow
}

$habiaContrasena = [bool]$env:TD_KEYSTORE_PASSWORD
if (-not $habiaContrasena) {
    $segura = Read-Host "Contrasena de la clave" -AsSecureString
    $puntero = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura)
    try { $env:TD_KEYSTORE_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($puntero) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($puntero) }
}

# Sin daemon: uno que queda andando se quedaria con la contrasena en el entorno.
Push-Location $raiz
try {
    $env:TD_KEYSTORE = $Clave
    $env:TD_KEY_ALIAS = $Alias
    $env:TD_KEY_PASSWORD = $env:TD_KEYSTORE_PASSWORD
    & .\gradlew.bat :app:assembleRelease --no-daemon --no-build-cache --console=plain
    if ($LASTEXITCODE -ne 0) { throw "La compilacion fallo." }
}
finally {
    Pop-Location
    Remove-Item Env:TD_KEYSTORE, Env:TD_KEY_ALIAS, Env:TD_KEY_PASSWORD -ErrorAction SilentlyContinue
    if (-not $habiaContrasena) { Remove-Item Env:TD_KEYSTORE_PASSWORD -ErrorAction SilentlyContinue }
}

$salida = Join-Path $raiz "app\build\outputs\apk\release"
$apk = Join-Path $salida "app-arm64-v8a-release.apk"
$certificado = & (Join-Path $herramientas.FullName "apksigner.bat") verify --print-certs $apk | Out-String
if ($LASTEXITCODE -ne 0 -or $certificado -match "Android Debug") { throw "El APK no quedo firmado con la clave de la beta." }
$datos = & (Join-Path $herramientas.FullName "aapt2.exe") dump badging $apk | Select-String "^package:" | Out-String
if ($datos -notmatch "versionName='([^']+)'") { throw "No pude leer la version del APK." }
$version = $Matches[1]

$beta = Join-Path $raiz "app\build\beta"
Remove-Item $beta -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory $beta | Out-Null
foreach ($abi in "arm64-v8a", "armeabi-v7a", "universal") {
    Copy-Item (Join-Path $salida "app-$abi-release.apk") (Join-Path $beta "TruckDash-Beta-$version-$abi.apk")
}
# Para leer un informe si R8 junto funciones: el mismo de esta version, no otro.
$mapeo = Join-Path $raiz "app\build\outputs\mapping\release\mapping.txt"
if (Test-Path $mapeo) { Copy-Item $mapeo (Join-Path $beta "mapping-$version.txt") }

Write-Host ""
Write-Host "Beta $version lista en $beta" -ForegroundColor Green
Get-ChildItem $beta | ForEach-Object { Write-Host ("  {0}  {1:N1} MB" -f $_.Name, ($_.Length / 1MB)) }
$certificado -split "`n" | Where-Object { $_ -match "certificate (DN|SHA-256)" } | ForEach-Object { Write-Host ("  " + $_.Trim()) }
